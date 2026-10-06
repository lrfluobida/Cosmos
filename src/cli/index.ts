#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, cp, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import type { ProductHost } from './session.ts';

const usage = `Usage:
  cosmos init <path>                 Copy the generic 2D project into an empty directory
  cosmos run-dir <path>              Create empty artifacts, evidence and logs directories
  cosmos build <path>                Typecheck and build an installed project
  cosmos preview <path> [--port N]   Preview its build at http://127.0.0.1:4173
  cosmos new <run-dir> [--adapter sokoban] --brief <text>  Interview, confirm exact requirements, then generate
  new/resume/continue [--render-frames true|false]  Select samples; recovery preserves the original choice
  cosmos status <run-dir>           Read the original run identity, cost, deadline and gaps
  cosmos experience <run-dir>       Review the current delivery and record a final stdin playtest decision
  cosmos stop <run-dir>             Persist a hard stop and wait for owned work to drain
  cosmos resume <run-dir>           Recover a verifiable interruption within the original window
  cosmos continue <run-dir> --quote --add-cny <0..200> --add-minutes <1..720>
                                   Show a read-only continuation proposal; never activate it
  cosmos continue <run-dir> --add-cny <0..200> --add-minutes <1..720>
                                   Confirm the exact proposal through stdin and use its first window
  cosmos resume <run-dir> --window <id>  Resume only the same authorized window
  cosmos stop <run-dir> --window <id>    Stop the selected authorized window
  cosmos --help

Requires Node.js 22.22.2+. After init, run npm ci in the new project.
init/run-dir/build/preview/status/experience/continue --quote are local and do not call model APIs.
new/resume/confirmed continue may call native deepseek-flash after host prerequisites pass.
Intake and original generation share CNY 200; a separately confirmed first window keeps that ledger and records its additions.
The formal 12-hour clock activates once after exact user confirmation and environment preparation.
Manual stop, budget stop and deadline stop are durable: resume cannot clear them or add time/budget.`;

async function emptyDirectory(path: string): Promise<string> {
  const target = resolve(path);
  for (let current = target; ; current = dirname(current)) {
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Refusing symbolic link or junction: ${current}`);
    if (stat && !stat.isDirectory()) throw new Error(`Expected an empty directory: ${current}`);
    if (dirname(current) === current) break;
  }
  const contents = await readdir(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (contents.length) throw new Error(`Expected an empty directory; refusing to overwrite: ${target}`);
  await mkdir(target, { recursive: true });
  return target;
}

async function projectDirectory(path: string): Promise<string> {
  const target = resolve(path);
  try {
    JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  } catch {
    throw new Error(`Cannot read a valid package.json in ${target}. Run cosmos init first.`);
  }
  return target;
}

async function localTool(project: string, relativePath: string, args: string[]): Promise<void> {
  const executable = join(project, 'node_modules', relativePath);
  await access(executable).catch(() => {
    throw new Error(`Missing project dependency ${relativePath}. Run npm ci in ${project}.`);
  });
  const { roleToolEnvironment } = await import('../roles/factory.ts');
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [executable, ...args], {
      cwd: project, stdio: 'inherit', windowsHide: true, shell: false, env: roleToolEnvironment(),
    });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const cleanup = () => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    };
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => {
      cleanup();
      if (code === 0) resolvePromise();
      else reject(new Error(`${relativePath} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

export async function runCli(args: string[], io: { host?: ProductHost; input?: Readable; output?: Writable } = {}): Promise<unknown> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(usage);
    return;
  }
  const [command, path, ...supplied] = args;
  let renderFrames: boolean | undefined;
  const options: string[] = [];
  for (let index = 0; index < supplied.length; index++) {
    if (supplied[index] !== '--render-frames') {
      options.push(supplied[index]);
      if (supplied[index] !== '--quote' && supplied[index].startsWith('--') && index + 1 < supplied.length) options.push(supplied[++index]);
      continue;
    }
    if (!['new', 'resume', 'continue'].includes(command) || renderFrames !== undefined || !['true', 'false'].includes(supplied[index + 1])) throw new Error(usage);
    renderFrames = supplied[++index] === 'true';
  }
  const originalFrames = async (root: string) => {
    const { readFrameSelection } = await import('../runtime/render-frame-selection.ts');
    return !!await readFrameSelection(root, await (await import('./control.ts')).readRunSnapshot(root), renderFrames);
  };
  if (command === 'experience') {
    if (!path?.trim() || options.length) throw new Error(usage);
    const { runExperienceSession } = await import('./experience-session.ts');
    return runExperienceSession({ root: resolve(path), input: io.input ?? process.stdin, output: io.output ?? process.stdout });
  }
  if (command === 'continue') {
    if (!path?.trim()) throw new Error(usage);
    const selectedFrames = await originalFrames(resolve(path));
    const { buildContinuationQuote, parseContinuationQuoteOptions } = await import('../runtime/continuation-quote.ts');
    const quoteOnly = options.includes('--quote'), requested = parseContinuationQuoteOptions(quoteOnly ? options : ['--quote', ...options]);
    if (quoteOnly) { const quote = await buildContinuationQuote({ root: resolve(path), ...requested }); (io.output ?? process.stdout).write(JSON.stringify(quote, null, 2) + '\n'); return quote; }
    const host = io.host ?? (await import('../runtime/entrypoint-host.ts')).createProductHost(fileURLToPath(new URL('../../', import.meta.url)), selectedFrames ? { renderFrames: true } : {});
    const { runContinuationSession } = await import('./continuation-session.ts');
    return runContinuationSession({ root: resolve(path), ...requested, renderFrames, host, input: io.input ?? process.stdin, output: io.output ?? process.stdout });
  }
  if (['new', 'resume', 'status', 'stop'].includes(command)) {
    if (!path?.trim()) throw new Error(usage);
    const output = io.output ?? process.stdout, root = resolve(path);
    const windowId = options.length === 2 && options[0] === '--window' && options[1]?.trim() ? options[1] : undefined;
    if (command === 'status' || command === 'stop') {
      if (options.length && (command !== 'stop' || !windowId)) throw new Error(usage);
      const control = await import('./control.ts'); const result = command === 'status' ? await control.readRunStatus(root) : await control.requestStop(root, windowId);
      output.write(JSON.stringify(result, null, 2) + '\n'); return result;
    }
    let brief: string | undefined, draftMode: 'cos16-input/1' | undefined;
    if (!windowId) for (let i = 0; i < options.length; i += 2) {
      const key = options[i], value = options[i + 1];
      if (!value?.trim() || (key !== '--brief' && key !== '--adapter') || key === '--brief' && (command !== 'new' || brief !== undefined)
        || key === '--adapter' && (draftMode !== undefined || value !== 'sokoban')) throw new Error(usage);
      if (key === '--brief') brief = value; else draftMode = 'cos16-input/1';
    }
    if (command === 'new' && (windowId || !brief)) throw new Error(usage);
    if (draftMode && renderFrames) throw new Error('准备模式暂不支持渲染帧采样；未确认或调用模型。');
    const selectedFrames = command === 'new' ? renderFrames === true : await originalFrames(root);
    const host = io.host ?? (await import('../runtime/entrypoint-host.ts')).createProductHost(fileURLToPath(new URL('../../', import.meta.url)), selectedFrames ? { renderFrames: true } : {});
    if (command === 'resume' && windowId) return (await import('./continuation-session.ts')).resumeContinuation({ root, windowId, renderFrames, host, input: io.input ?? process.stdin, output });
    const { runProductSession } = await import('./session.ts');
    return runProductSession({ command: command === 'new' ? 'new' : 'resume', root, brief, draftMode, renderFrames, host, input: io.input ?? process.stdin, output });
  }
  if (!path?.trim() || !['init', 'run-dir', 'build', 'preview'].includes(command)
    || (command !== 'preview' && options.length)) throw new Error(usage);
  let port = '4173';
  if (options.length) {
    if (options.length !== 2 || options[0] !== '--port' || !/^\d+$/.test(options[1])
      || Number(options[1]) < 1 || Number(options[1]) > 65535) {
      throw new Error('Preview port must be an integer from 1 to 65535.\n' + usage);
    }
    port = String(Number(options[1]));
  }
  if (command === 'init') {
    const template = fileURLToPath(new URL('../../templates/2d/', import.meta.url));
    const destination = relative(template, resolve(path));
    if (!isAbsolute(destination) && destination !== '..' && !destination.startsWith(`..${sep}`)) {
      throw new Error('Choose a project directory outside the template source tree.');
    }
    const files = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', '.gitignore', 'src'];
    for (const file of files) await access(join(template, file));
    const target = await emptyDirectory(path);
    for (const file of files) {
      await cp(join(template, file), join(target, file), { recursive: true, force: false, errorOnExist: true });
    }
    console.log(`Created generic 2D project: ${target}\nNext: run npm ci in that directory, then cosmos build and cosmos preview.`);
    return;
  }
  if (command === 'run-dir') {
    const target = await emptyDirectory(path);
    for (const directory of ['artifacts', 'evidence', 'logs']) await mkdir(join(target, directory));
    console.log(`Prepared run directory: ${target}\nNo agent run, budget or ledger has been started.`);
    return;
  }
  const project = await projectDirectory(path);
  if (command === 'build') {
    await localTool(project, 'typescript/bin/tsc', ['--noEmit', '-p', 'tsconfig.json']);
    await localTool(project, 'vite/bin/vite.js', ['build']);
  } else {
    await access(join(project, 'dist/index.html')).catch(() => {
      throw new Error(`Missing dist/index.html in ${project}. Run cosmos build first.`);
    });
    await localTool(project, 'vite/bin/vite.js', ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort']);
  }
}

const invoked = process.argv[1] ? await realpath(process.argv[1]).catch(() => resolve(process.argv[1])) : undefined;
if (invoked && import.meta.url === pathToFileURL(invoked).href) runCli(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`cosmos: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
