import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

for (const mode of ['click', 'observation']) test(`a hung ${mode} produces a failed report within the total deadline and exits its owned browser process`, { timeout: 15_000 }, async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const evidenceRoot = join(root, '.cosmos/acceptance');
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./fixtures/hang-worker.ts', import.meta.url)), evidenceRoot, mode], {
    cwd: root, windowsHide: true, stdio: 'pipe', detached: process.platform !== 'win32',
  });
  let stdout = '', stderr = '', watchdog = false;
  child.stdout.on('data', data => { stdout += data.toString(); });
  child.stderr.on('data', data => { stderr += data.toString(); });
  const timer = setTimeout(() => {
    watchdog = true;
    // Test safety net only: production must terminate its own browser before this fires.
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 2000 });
    else process.kill(-child.pid!, 'SIGKILL');
  }, 10_000);
  const started = Date.now();
  let code: number | null;
  try { code = await new Promise(resolve => child.once('exit', resolve)); }
  finally { clearTimeout(timer); }
  assert.equal(watchdog, false, `Runner exceeded watchdog without cleaning up. ${stderr}`);
  assert.equal(code, 0, stderr);
  assert.ok(Date.now() - started < 9000);
  const report = JSON.parse(stdout.trim());
  assert.ok(Date.parse(report.endedAt) - Date.parse(report.startedAt) < report.timeoutMs + 500);
  assert.equal(report.outcome, 'failed');
  assert.equal(report.steps[0].outcome, 'passed');
  assert.equal(report.steps[1].outcome, 'failed');
  assert.match(report.steps[1].error, /timed out|deadline/i);
  assert.equal(report.steps[2].outcome, 'skipped');
  assert.equal(report.cleanup.forced, true);
  assert.equal(report.cleanup.processExited, true);
  assert.ok(report.cleanup.browserPid > 0);
  assert.throws(() => process.kill(report.cleanup.browserPid, 0));
  assert.deepEqual(JSON.parse(await readFile(join(evidenceRoot, report.reportPath), 'utf8')), report);
  assert.ok((await stat(join(evidenceRoot, report.files.find((file: string) => file.endsWith('browser.log'))))).size > 0);
  console.log(`Hang evidence: .cosmos/acceptance/${report.reportPath}`);
});
