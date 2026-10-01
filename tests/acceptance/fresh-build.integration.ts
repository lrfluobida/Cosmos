import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAcceptance } from '../../src/acceptance/index.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'src/cli/index.ts');

test('fresh copied generic project builds, launches, and accepts real browser mouse input', { timeout: 180_000 }, async () => {
  const runId = `fresh-${Date.now()}`;
  const project = join(root, '.cosmos/acceptance-projects', runId, '独立 project');
  const logs: string[] = [];
  const command = (args: string[], cwd = root) => {
    const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
    logs.push(result.stdout ?? '', result.stderr ?? '');
    assert.equal(result.status, 0, logs.join('\n')); return result;
  };
  let preview: ChildProcess | undefined;
  let url: string | undefined;
  try {
    command(['--experimental-strip-types', cli, 'init', project]);
    const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    command([npm, 'ci', '--no-audit', '--no-fund'], project);
    command(['--experimental-strip-types', cli, 'build', project]);
    assert.ok((await readFile(join(project, 'dist/index.html'), 'utf8')).includes('Cosmos'));
    const socket = createServer();
    await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
    const address = socket.address(); assert.ok(address && typeof address !== 'string');
    await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
    url = `http://127.0.0.1:${address.port}`;
    preview = spawn(process.execPath, ['--experimental-strip-types', cli, 'preview', project, '--port', String(address.port)], { cwd: root, windowsHide: true, stdio: 'pipe' });
    preview.stdout?.on('data', data => logs.push(data.toString()));
    preview.stderr?.on('data', data => logs.push(data.toString()));
    const deadline = Date.now() + 20_000;
    let ready = false;
    while (Date.now() < deadline) {
      try { ready = (await fetch(url, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Startup can take a few moments. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs.join('\n'));
    const report = await runAcceptance({
      formatVersion: '1.0.0', projectId: 'generic-template', taskId: 'COS-08', runId, reportId: 'fresh-build', specVersion: '1.0',
      artifact: { artifactId: 'phaser-template', version: '1121ae25c071c2d7e4dd4f0c8c3440e5546efe88', location: relative(root, project).replaceAll('\\', '/') },
      url, viewport: { width: 1280, height: 900 }, acceptanceIds: ['startup', 'mouse', 'scene'], steps: [
        { id: 'canvas', kind: 'wait-for', acceptanceId: 'startup', observation: { kind: 'visible', selector: 'canvas' }, expected: true, timeoutMs: 5000 },
        { id: 'ready', kind: 'wait-for', acceptanceId: 'startup', observation: { kind: 'debug', path: ['scene'] }, expected: 'playground', timeoutMs: 5000 },
        { id: 'sprite-click', kind: 'mouse-click', selector: 'canvas', x: 240 / 800, y: 250 / 500 },
        { id: 'clicked', kind: 'wait-for', acceptanceId: 'mouse', observation: { kind: 'debug', path: ['clicks'] }, expected: 1, timeoutMs: 2000 },
        { id: 'move-sprite', kind: 'mouse-click', selector: 'canvas', x: 460 / 800, y: 300 / 500 },
        { id: 'moved', kind: 'wait-for', acceptanceId: 'mouse', observation: { kind: 'debug', path: ['x'] }, expected: 460, timeoutMs: 2000 },
        { id: 'next-scene', kind: 'mouse-click', selector: 'canvas', x: 660 / 800, y: 70 / 500 },
        { id: 'gallery', kind: 'wait-for', acceptanceId: 'scene', observation: { kind: 'debug', path: ['scene'] }, expected: 'gallery', timeoutMs: 2000 },
      ],
    }, { evidenceRoot: join(root, '.cosmos/acceptance'), headless: process.env.COSMOS_HEADED !== '1' });
    assert.equal(report.outcome, 'passed', JSON.stringify(report, null, 2));
    console.log(`Acceptance evidence: .cosmos/acceptance/${report.reportPath}`);
  } finally {
    if (preview?.pid && preview.exitCode === null) {
      if (process.platform === 'win32') {
        const stopped = spawnSync('taskkill.exe', ['/pid', String(preview.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
        assert.equal(stopped.status, 0, stopped.stderr);
      } else preview.kill('SIGTERM');
    }
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'build-preview.log'), logs.join('\n'), 'utf8');
    if (url) await assert.rejects(fetch(url, { signal: AbortSignal.timeout(1000) }));
  }
});
