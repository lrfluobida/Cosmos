import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { stopBrowserProcess } from '../../src/acceptance/process.ts';
import { roleToolEnvironment } from '../../src/roles/factory.ts';
import { validationRoutingFixture } from './validation-routing.fixture.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import * as command from '../../src/runtime/recovery/owned-command.ts';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function exited(pid: number): boolean { try { process.kill(pid, 0); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; throw error; } }
async function waitFor<T>(read: () => Promise<T> | T): Promise<T> { const deadline = Date.now() + 5000; while (true) { try { const value = await read(); if (value) return value; } catch {} if (Date.now() >= deadline) throw new Error('Offline child fixture did not converge'); await sleep(25); } }

test('shared formal launcher records ownership before allowing worker writes', async t => {
  assert.equal(typeof command.runOwnedNode, 'function');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-owned-node-')), marker = join(root, 'written.txt');
  const controller = await RunController.create({ root, runId: 'offline', ledgerId: 'offline', kind: 'evaluation', scope: 'validation', specVersion: '1', allocations: [{ taskId: 'host', amountMicroCny: 1 }] });
  t.after(async () => { await controller.close().catch(() => {}); await rm(root, { recursive: true, force: true }); });
  const state = await controller.read(), register = controller.registerOwnedChild.bind(controller); let release!: () => void, reached!: () => void;
  const ready = new Promise<void>(resolve => { reached = resolve; });
  t.mock.method(controller, 'registerOwnedChild', async (pid: number, ticket: string) => { reached(); await new Promise<void>(resolve => { release = resolve; }); await register(pid, ticket); });
  const running = command.runOwnedNode({ controller, authority: { taskId: 'host', windowId: null, deadlineAt: state.run.originalDeadlineAt }, args: ['-e', "require('node:fs').writeFileSync(process.argv[1],'offline')", marker], cwd: root, signal: controller.signal, timeoutMs: 5000 });
  await ready;
  try { await sleep(60); await assert.rejects(readFile(marker), { code: 'ENOENT' }); } finally { release(); }
  assert.equal((await running).passed, true); assert.equal(await readFile(marker, 'utf8'), 'offline');
  const owner = JSON.parse(await readFile(join(root, '.controller.lock'), 'utf8')); assert.ok(owner.children.every((child: any) => exited(child.pid)));
  await controller.close(); await assert.rejects(readFile(join(root, '.controller.lock')), { code: 'ENOENT' });
});

test('validation task abort waits for its worker and grandchild to exit before owner close', async t => {
  assert.equal(typeof command.runOwnedNode, 'function');
  const f = await validationRoutingFixture(t), task: any = taskFixture(), grant = f.window.quote.declaration.grants.coding;
  Object.assign(task, { taskId: grant.taskId, kind: 'evaluation', runId: f.original.run.runId, specVersion: '1.0', dependsOn: [], state: 'not_started', attempts: [], artifacts: [], evidence: [],
    acceptanceIds: f.window.quote.requirements.acceptanceIds, acceptance: f.requirement.acceptance.filter(item => f.window.quote.requirements.acceptanceIds.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: ['offline.json'] })),
    review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] }, budget: { ledgerId: f.original.ledger.ledgerId, originalDeadlineAt: f.original.run.originalDeadlineAt, allocationMicroCny: grant.amountMicroCny } });
  await f.controller.registerTasks([task]); const marker = join(f.artifactRoot, 'pids.json'), abort = new AbortController();
  const worker = "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});require('node:fs').writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);";
  const running = command.runOwnedNode({ controller: f.controller, authority: { taskId: task.taskId, caseId: f.window.caseId, windowId: f.window.windowId }, args: ['-e', worker, marker], cwd: f.artifactRoot, signal: abort.signal, timeoutMs: 5000 });
  const rejection = assert.rejects(running, /cancel|timed out/i), pids = await waitFor(async () => JSON.parse(await readFile(marker, 'utf8')) as number[]);
  abort.abort(); await rejection; for (const pid of pids) await waitFor(() => exited(pid));
  await f.controller.close(); await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
});

test('parent IPC loss makes the launcher stop the worker tree and retains the crashed owner record', async t => {
  assert.equal(typeof command.runOwnedNode, 'function');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-owned-disconnect-')), marker = join(root, 'pids.json');
  const worker = "const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});require('node:fs').writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);";
  const code = `import{RunController}from ${JSON.stringify(new URL('../../src/runtime/run.ts', import.meta.url).href)};import{runOwnedNode}from ${JSON.stringify(new URL('../../src/runtime/recovery/owned-command.ts', import.meta.url).href)};const root=process.argv[1];const controller=await RunController.create({root,runId:'offline',ledgerId:'offline',kind:'evaluation',scope:'validation',specVersion:'1',allocations:[{taskId:'host',amountMicroCny:1}]});await runOwnedNode({controller,authority:{taskId:'host',windowId:null},args:['-e',${JSON.stringify(worker)},process.argv[2]],cwd:root,signal:controller.signal,timeoutMs:20000});await controller.close();`;
  const owner = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code, root, marker], { env: roleToolEnvironment(), windowsHide: true, stdio: 'ignore' }), closed = once(owner, 'close');
  let pids: number[] = [];
  t.after(async () => { if (owner.exitCode === null && owner.signalCode === null) await stopBrowserProcess(owner, 3000).catch(() => {}); await closed; for (const pid of pids) if (!exited(pid)) process.kill(pid); await rm(root, { recursive: true, force: true }); });
  pids = await waitFor(async () => JSON.parse(await readFile(marker, 'utf8')) as number[]);
  const record = await waitFor(async () => { const value = JSON.parse(await readFile(join(root, '.controller.lock'), 'utf8')); return value.children[0]?.pid ? value : null; });
  owner.kill(); await closed;
  for (const pid of [...pids, record.children[0].pid]) await waitFor(() => exited(pid));
  assert.deepEqual(JSON.parse(await readFile(join(root, '.controller.lock'), 'utf8')), record);
});
