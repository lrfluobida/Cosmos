#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, cp, lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = `Usage:
  cosmos init <path>                 Copy the generic 2D project into an empty directory
  cosmos run-dir <path>              Create empty artifacts, evidence and logs directories
  cosmos build <path>                Typecheck and build an installed project
  cosmos preview <path> [--port N]   Preview its build at http://127.0.0.1:4173
  cosmos --help

Requires Node.js 22.22.2+. After init, run npm ci in the new project.
These local commands do not call model APIs or start an agent run.`;

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
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [executable, ...args], {
      cwd: project, stdio: 'inherit', windowsHide: true, shell: false,
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

async function main(args: string[]): Promise<void> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(usage);
    return;
  }
  const [command, path, ...options] = args;
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

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`cosmos: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
