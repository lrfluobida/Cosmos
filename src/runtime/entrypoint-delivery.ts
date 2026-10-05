import { lstat, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference, TaskContract } from '../contracts/index.ts';
import type { ArtifactRegistry } from '../artifacts/index.ts';
import { directory, regularFile, removeOwned, safePath, snapshot } from '../artifacts/paths.ts';
import type { RunController } from './run.ts';
import type { OwnedWork } from './recovery/owned-work.ts';
import { runOwnedNode } from './recovery/owned-command.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import type { HostExecutionAuthority } from './entrypoint-host.ts';

const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const equalFiles = (left: Map<string, Buffer>, right: Map<string, Buffer>) => left.size === right.size && [...left].every(([name, bytes]) => right.get(name)?.equals(bytes));

/** Called inside the original unsealed candidate build callback. */
export async function packageStandalone(input: { root: string; project: string; candidate: ArtifactReference; task: Readonly<TaskContract>; registry: ArtifactRegistry; signal: AbortSignal }) {
  const { root, project, candidate, task, registry, signal } = input;
  if (await safePath(root, candidate.location) !== project) throw new Error('Delivery project differs from its fixed candidate.');
  const sealed = await lstat(await safePath(root, `${dirname(candidate.location).replaceAll('\\', '/')}/sealed.json`)).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (sealed) throw new Error('Sealed candidates cannot be packaged.');
  for (const name of ['src/main.ts', 'index.html', 'dist/index.html', 'package.json', 'package-lock.json']) await regularFile(project, name);
  const captures = await Promise.all((await registry.getCandidate(candidate)).inputs.map(ref => registry.getCapture(ref)));
  for (const capture of captures.filter(value => value.metadata.kind === 'media')) for (const item of capture.files.filter(file => file.destination.startsWith('public/assets/'))) {
    if (!(await regularFile(project, item.destination)).equals(await regularFile(project, `dist/${item.destination.slice(7)}`))) throw new Error(`Built asset differs from its capture: ${item.destination}`);
  }
  const pkg = decode(await regularFile(project, 'package.json')), lock = decode(await regularFile(project, 'package-lock.json'));
  if (!sameValue(pkg.dependencies ?? {}, lock.packages?.['']?.dependencies ?? {})) throw new Error('Package dependencies differ from their lock.');
  const dependencies: { name: string; version: string; license: string; licenseFiles: string[]; bundledNotices?: string[] }[] = [], pending = Object.keys(pkg.dependencies ?? {}), seen = new Set<string>();
  while (pending.length) {
    const name = pending.shift()!; if (seen.has(name)) continue; seen.add(name);
    const fixed = lock.packages?.[`node_modules/${name}`];
    if (!fixed?.version || typeof fixed.license !== 'string') throw new Error(`Missing locked dependency license: ${name}`);
    const folder = await safePath(join(root, 'toolchain'), `node_modules/${name}`), installed = decode(await regularFile(folder, 'package.json'));
    if (installed.name !== name || installed.version !== fixed.version || installed.license !== fixed.license) throw new Error(`Dependency license or version differs from lock: ${name}`);
    const names = (await readdir(folder)).filter(file => /^licen[sc]e(?:\.[a-z]+)?$/i.test(file));
    if (!names.length) throw new Error(`Missing dependency license text: ${name}`);
    const licenseFiles: string[] = [];
    for (const file of names) {
      const bytes = await regularFile(folder, file); new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const destination = `_cosmos/licenses/${name.replaceAll('/', '-')}/${file}`;
      const target = await safePath(project, destination); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); licenseFiles.push(destination);
    }
    const bundledNotices: string[] = [];
    if (name === 'phaser') for (const file of ['src/geom/polygon/Earcut.js', 'src/geom/polygon/Simplify.js', 'src/physics/matter-js/lib/license.js', 'src/polyfills/AudioContextMonkeyPatch.js']) {
      const bytes = await regularFile(folder, file); new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const destination = `_cosmos/licenses/phaser/bundled/${file}`, target = await safePath(project, destination);
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); bundledNotices.push(destination);
    }
    dependencies.push({ name, version: fixed.version, license: fixed.license, licenseFiles, ...(bundledNotices.length ? { bundledNotices } : {}) }); pending.push(...Object.keys(fixed.dependencies ?? {}));
  }
  signal.throwIfAborted();
  await directory(project, '_cosmos');
  await writeFile(await safePath(project, 'standalone-launcher.mjs'), await regularFile(dirname(fileURLToPath(import.meta.url)), 'standalone-launcher.mjs'), { flag: 'wx' });
  await publishReceipt(await safePath(project, '_cosmos/delivery.json'), { formatVersion: 'standalone-delivery/1', runId: task.runId, taskId: task.taskId, candidate,
    source: ['src', 'index.html'], build: 'dist', dependencies: ['package.json', 'package-lock.json'], captures: captures.map(capture => capture.artifactRef) }, signal);
  await publishReceipt(await safePath(project, '_cosmos/sources.json'), { formatVersion: 'delivery-sources/1', candidate,
    captures: captures.map(capture => ({ artifact: capture.artifactRef, kind: capture.metadata.kind, provenance: capture.metadata.provenance })), dependencies }, signal);
  await writeFile(await safePath(project, 'README.zh-CN.md'), `# 游戏启动说明\n\n交付版本：${candidate.artifactId}@${candidate.version}；运行：${task.runId}。\n\n已有 Node 22 和桌面浏览器即可离线运行。完整复制此目录，在终端执行：\n\n\`\`\`powershell\nnode standalone-launcher.mjs\n\`\`\`\n\n在浏览器打开终端显示的本机 URL。指定端口可执行 \`node standalone-launcher.mjs --port 4173\`；端口占用会报错，请换端口。按 Ctrl+C 停止服务。\n\n源码位于 src/ 与 index.html，已构建游戏位于 dist/。运行不需要安装依赖。重建时使用 package-lock.json 锁定依赖，安装后运行 package.json 的 build 命令。素材与依赖来源见 _cosmos/sources.json，依赖许可文本见 _cosmos/licenses/。\n\n自动验收报告在原 Cosmos 运行目录的 delivery/current-report.json 中引用，接受后才发布。单独复制本游戏目录时，可另带该引用对应的报告 sidecar；该报告与最终试玩记录按交付版本绑定。\n`, { encoding: 'utf8', flag: 'wx' });
}

export interface CleanDelivery { url: string; project: string; requireCurrent(): Promise<void> }
/** The original task owns copying, serving, browser work and cleanup before final snapshot. */
export async function withCleanDelivery<T>(input: { root: string; project: string; candidate: ArtifactReference; controller: RunController; work: OwnedWork;
  authority: HostExecutionAuthority; signal: AbortSignal; requireCurrent(): Promise<void> }, action: (clean: CleanDelivery) => Promise<T>): Promise<T> {
  return input.work.run(async ownedSignal => {
    const signal = AbortSignal.any([ownedSignal, input.signal]), abort = new AbortController();
    await input.requireCurrent(); signal.throwIfAborted();
    if (await safePath(input.root, input.candidate.location) !== input.project) throw new Error('Clean project differs from its fixed candidate path.');
    const fixed = await snapshot(input.project), manifest = decode(await regularFile(input.project, '_cosmos/delivery.json'));
    if (!sameValue(manifest.candidate, input.candidate) || [...fixed.keys()].some(name => name.split('/').includes('node_modules'))) throw new Error('Clean delivery has a wrong candidate or installed dependencies.');
    const deadlineAt = Date.parse(input.authority.deadlineAt) - 5000, remaining = deadlineAt - Date.now();
    if (remaining < 1000) throw new Error('Execution time is insufficient for clean launcher cleanup.');
    await directory(input.root, 'delivery-work');
    const control = await safePath(input.root, `delivery-work/${input.authority.taskId}`); await mkdir(control);
    const project = await mkdtemp(join(tmpdir(), 'Cosmos 干净交付 ')), ready = join(control, 'ready.json'), stop = join(control, 'stop.json');
    let running: Promise<{ result?: Awaited<ReturnType<typeof runOwnedNode>>; error?: unknown }> | undefined, pid: number | undefined, url: string | undefined;
    let completed = false, bytesMatched = false, acceptancePassed: boolean | null = null;
    try {
      for (const [name, bytes] of fixed) { signal.throwIfAborted(); const path = await safePath(project, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes, { flag: 'wx' }); }
      if (!equalFiles(fixed, await snapshot(project)) || !equalFiles(fixed, await snapshot(input.project))) throw new Error('Clean delivery copy differs from the candidate.');
      await input.requireCurrent(); signal.throwIfAborted();
      const worker = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './entrypoint-delivery-worker.ts' : './entrypoint-delivery-worker.js', import.meta.url));
      running = runOwnedNode({ controller: input.controller, authority: input.authority, args: ['--experimental-strip-types', worker, JSON.stringify({ project, ready, stop, candidate: input.candidate, deadlineAt })],
        cwd: project, signal: AbortSignal.any([signal, abort.signal]), timeoutMs: remaining }).then(result => ({ result }), error => ({ error }));
      const readyDeadline = Math.min(deadlineAt, Date.now() + 10000);
      while (true) {
        signal.throwIfAborted();
        const receipt = await readReady();
        if (receipt) {
          const parsed = new URL(receipt.url);
          if (receipt.formatVersion !== 'delivery-ready/1' || !sameValue(receipt.candidate, input.candidate) || receipt.project !== project
            || receipt.url !== `http://127.0.0.1:${Number(parsed.port)}` || Number(parsed.port) < 1 || Number(parsed.port) > 65535 || !Number.isSafeInteger(receipt.pid)) throw new Error('Clean launcher ready binding differs.');
          url = receipt.url; pid = receipt.pid; break;
        }
        const stopped = await Promise.race([running, new Promise<null>(done => setTimeout(() => done(null), 25))]);
        if (stopped) throw stopped.error ?? new Error(`Clean launcher exited before readiness: ${stopped.result?.diagnostics}`);
        if (Date.now() >= readyDeadline) throw new Error('Clean launcher readiness timed out.');
      }
      async function readReady() { try { return decode(await regularFile(control, 'ready.json')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
      const requireCurrent = async () => { signal.throwIfAborted(); await input.requireCurrent(); if (Date.now() >= deadlineAt) throw new Error('Clean delivery reached its cleanup deadline.'); };
      await requireCurrent(); const value = await action({ project, url: url!, requireCurrent });
      if (value && typeof value === 'object') {
        const passed = (value as { passed?: unknown }).passed;
        if (typeof passed === 'boolean') acceptancePassed = passed;
      }
      await requireCurrent();
      if (!equalFiles(fixed, await snapshot(project)) || !equalFiles(fixed, await snapshot(input.project))) throw new Error('Package bytes changed during clean input.');
      bytesMatched = true; completed = acceptancePassed !== false; return value;
    } finally {
      const verified = completed;
      let exited = false;
      if (running) {
        await publishReceipt(stop, { stop: true, candidate: input.candidate }).catch(() => abort.abort());
        const timer = setTimeout(() => abort.abort(), 2000);
        const ended = await running; clearTimeout(timer);
        if (pid) { try { process.kill(pid, 0); exited = false; } catch (error) { exited = (error as NodeJS.ErrnoException).code === 'ESRCH'; } }
        if (completed && !ended.result?.passed) completed = false;
        await publishReceipt(await safePath(input.root, `evidence/${input.authority.taskId}/delivery-check.json`), { formatVersion: 'clean-delivery-check/1', candidate: input.candidate,
          project, url: url ?? null, deadlineAt: input.authority.deadlineAt, packageFiles: [...fixed.keys()], bytesMatched, acceptancePassed, helperPid: pid ?? null, helperExited: exited,
          helperResult: ended.result ?? { error: ended.error instanceof Error ? ended.error.message : String(ended.error) },
          browserReport: `evidence/${input.authority.taskId}/browser.json`, mediaReport: `evidence/${input.authority.taskId}/media-usage.json`,
          outcome: completed && exited ? 'passed' : 'failed', endedAt: new Date().toISOString() });
      }
      await removeOwned(tmpdir(), project);
      if (verified && (!completed || !exited)) throw new Error('Clean launcher or package verification did not complete.');
    }
  });
}
