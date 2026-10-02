import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { roleToolEnvironment } from '../../roles/factory.ts';
import { stopBrowserProcess } from '../../acceptance/process.ts';
import type { RunController } from '../run.ts';
import { currentValidationCase, validationRole } from '../validation-validation.ts';

export interface OwnedCommandAuthority { taskId: string; windowId: string | null; caseId?: string; deadlineAt?: string }

/** Fixed trusted Node workers only. The same controller owns every launch intent and PID. */
export async function runOwnedNode(options: { controller: RunController; authority: OwnedCommandAuthority; args: string[]; cwd: string; signal: AbortSignal; timeoutMs: number }) {
  const { controller, authority, args, cwd } = options, signal = AbortSignal.any([options.signal, controller.signal]);
  signal.throwIfAborted();
  let deadlineAt: string;
  if (authority.caseId) {
    if (!authority.windowId) throw new Error('Validation child requires its explicit window.');
    controller.requireValidationCase(authority.caseId, authority.windowId);
    const state = await controller.read(), window = currentValidationCase(state), purpose = validationRole(window, authority.taskId) === 'planning' ? 'planning' : 'author';
    const current = await controller.validationAuthority(authority.taskId, purpose);
    if (!current.executionAllowed || state.ledger.entries.some(entry => entry.unknown)) throw new Error('Validation child has no active execution authority.');
    deadlineAt = current.deadlineAt;
  } else {
    controller.requireExecutionWindow(authority.windowId ?? undefined);
    const current = await controller.executionAuthority(authority.taskId);
    if (current.windowId !== authority.windowId || current.windowId && !current.admissionAllowed) throw new Error('Host child has no active task execution authority.');
    deadlineAt = current.deadlineAt;
  }
  if (authority.deadlineAt !== undefined && authority.deadlineAt !== deadlineAt) throw new Error('Host child deadline differs from its current window.');
  const remaining = Date.parse(deadlineAt) - Date.now() - 5000;
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || remaining < 1) throw new Error('Execution time is insufficient for host child cleanup.');
  const ticket = await controller.prepareOwnedChild(authority.windowId ? { taskId: authority.taskId, windowId: authority.windowId } : undefined);
  const processModule = new URL(import.meta.url.endsWith('.ts') ? '../../acceptance/process.ts' : '../../acceptance/process.js', import.meta.url).href;
  // Keep IPC open: owner loss must stop the worker tree instead of orphaning a compiler/browser.
  const launcher = `import {spawn} from 'node:child_process';import {stopBrowserProcess} from ${JSON.stringify(processModule)};
let worker,stopping=false,started=false;
async function disconnected(){if(stopping)return;stopping=true;if(!worker)process.exit(1);if(process.platform!=='win32'){process.kill(-process.pid,'SIGKILL');return;}try{await stopBrowserProcess(worker,2500);}catch{process.exit(1);}process.exit(1);}
process.on('disconnect',()=>{void disconnected();});
process.on('message',message=>{if(started||stopping||message?.start!==true)return;started=true;worker=spawn(process.execPath,JSON.parse(process.argv[1]),{stdio:'inherit',windowsHide:true,shell:false});worker.once('error',()=>process.exit(1));worker.once('close',code=>{if(!stopping)process.exit(code??1);});});`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', launcher, JSON.stringify(args)], { cwd, windowsHide: true, shell: false,
    env: roleToolEnvironment(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: process.platform !== 'win32' });
  let stdout = '', stderr = '', cleanup: Promise<void> | undefined, cancelled = false;
  const exited = once(child, 'close');
  const stop = () => { cancelled = true; cleanup ??= stopBrowserProcess(child, 3000); void cleanup.catch(() => {}); };
  child.stdout!.on('data', bytes => { stdout += bytes; if (stdout.length + stderr.length > 1_000_000) stop(); });
  child.stderr!.on('data', bytes => { stderr += bytes; if (stdout.length + stderr.length > 1_000_000) stop(); });
  signal.addEventListener('abort', stop, { once: true }); const timer = setTimeout(stop, Math.min(options.timeoutMs, remaining));
  try {
    if (!child.pid) throw new Error('Owned child failed to start.');
    await controller.registerOwnedChild(child.pid, ticket); signal.throwIfAborted(); child.send({ start: true });
    const [code] = await exited; await cleanup;
    if (cancelled) throw new Error('Owned host command cancelled or timed out.');
    return { passed: code === 0, diagnostics: (stdout + stderr).slice(0, 24000), code: code as number | null, stdout, stderr };
  } catch (error) { stop(); await exited.catch(() => {}); await cleanup; throw error; }
  finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
}
