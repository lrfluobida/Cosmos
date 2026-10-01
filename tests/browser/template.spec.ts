import { expect, test } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'dist/cli/index.js');

function command(executable: string, args: string[], cwd: string) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout + result.stderr;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test('fresh Windows project builds and responds to normal desktop mouse input', async ({ page }, testInfo) => {
  const temporary = await mkdtemp(join(tmpdir(), 'cosmos-browser-'));
  const project = join(temporary, '独立 project');
  const evidence = join(root, '.cosmos/browser-evidence');
  await mkdir(evidence, { recursive: true });
  let preview: ChildProcess | undefined;
  let logs = '';
  try {
    logs += command(process.execPath, [cli, 'init', project], temporary);
    // Locate npm beside the active Node installation; do not use a global Vite/tsc.
    const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    logs += command(process.execPath, [npm, 'ci', '--no-audit', '--no-fund'], project);
    logs += command(process.execPath, [cli, 'build', project], temporary);
    expect(await readFile(join(project, 'dist/index.html'), 'utf8')).toContain('Cosmos');
    const port = await freePort();
    preview = spawn(process.execPath, [cli, 'preview', project, '--port', String(port)], {
      cwd: temporary, windowsHide: true, stdio: 'pipe',
    });
    preview.stdout?.on('data', (data) => { logs += data.toString(); });
    preview.stderr?.on('data', (data) => { logs += data.toString(); });
    const url = `http://127.0.0.1:${port}`;
    await expect.poll(async () => {
      try { return (await fetch(url)).status; } catch { return 0; }
    }, { timeout: 20_000 }).toBe(200);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByTestId('debug-state')).toContainText('"scene":"playground"');
    await page.screenshot({ path: join(evidence, '01-ready.png') });
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    const click = (x: number, y: number) => page.mouse.click(bounds!.x + x * bounds!.width / 800, bounds!.y + y * bounds!.height / 500);
    await click(240, 250);
    await expect(page.getByTestId('debug-state')).toContainText('"clicks":1');
    await click(460, 300);
    await expect(page.getByTestId('debug-state')).toContainText('"x":460');
    await page.screenshot({ path: join(evidence, '02-mouse-input.png') });
    await click(660, 70);
    await expect(page.getByTestId('debug-state')).toContainText('"scene":"gallery"');
    await page.screenshot({ path: join(evidence, '03-scene-switch.png') });
    await click(400, 340);
    await expect(page.getByTestId('debug-state')).toContainText('"scene":"playground"');
    const observation = await page.evaluate(() => {
      const debug = Object.getOwnPropertyDescriptor(window, 'cosmosDebug');
      return { getter: typeof debug?.get, setter: typeof debug?.set, configurable: debug?.configurable,
        frozen: Object.isFrozen((window as unknown as { cosmosDebug: object }).cosmosDebug) };
    });
    expect(observation).toEqual({ getter: 'function', setter: 'undefined', configurable: false, frozen: true });
    expect(errors).toEqual([]);
  } finally {
    if (preview?.pid) {
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(preview.pid), '/T', '/F'], { windowsHide: true });
      else preview.kill('SIGTERM');
    }
    await testInfo.attach('cli-output', { body: logs, contentType: 'text/plain' });
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});
