import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = join(root, '.cosmos/media/evidence');
const assets = join(root, '.cosmos/media/assets');
await mkdir(evidence, { recursive: true });
const manifest = JSON.parse(await readFile(join(assets, 'manifest.json'), 'utf8'));
const routes = new Map([
  ['/', [join(root, 'probes/assets/preview.html'), 'text/html; charset=utf-8']],
  ['/media/vector.js', [join(root, 'dist/media/vector.js'), 'text/javascript']],
  ['/media/validation.js', [join(root, 'dist/media/validation.js'), 'text/javascript']],
  ['/assets/manifest.json', [join(assets, 'manifest.json'), 'application/json']],
  ...manifest.character.states.flatMap((state) => state.frames.map((file) => ['/assets/' + file, [join(assets, file), 'image/svg+xml']])),
  ...manifest.audio.map(({ file }) => ['/assets/' + file, [join(assets, file), 'audio/wav']]),
]);
const server = createServer(async (req, res) => {
  const route = routes.get(req.url);
  if (!route) { res.writeHead(404); res.end(); return; }
  try { res.writeHead(200, { 'Content-Type': route[1] }); res.end(await readFile(route[0])); }
  catch { res.writeHead(500); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1000, height: 1000 }, recordVideo: { dir: evidence, size: { width: 1000, height: 1000 } } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.stack); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.probe?.ready);
  const pixels = await page.evaluate(async (visual) => {
    const results = [];
    for (const state of visual.states) for (const file of state.frames) {
      const img = new Image(); img.src = '/assets/' + file; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      let visible = 0, partial = 0, border = 0, hiddenColor = 0;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4, alpha = data[i + 3];
        if (alpha) visible++;
        if (alpha > 0 && alpha < 255) partial++;
        if (alpha && (x === 0 || y === 0 || x === img.width - 1 || y === img.height - 1)) border++;
        if (!alpha && (data[i] || data[i + 1] || data[i + 2])) hiddenColor++;
      }
      results.push({ file, width: img.width, height: img.height, visible, partial, border, hiddenColor });
    }
    return results;
  }, manifest.character);
  for (const frame of pixels) {
    assert.equal(frame.width, 192); assert.equal(frame.height, 192);
    assert.ok(frame.visible > 1000 && frame.visible < 192 * 192 / 2, frame.file);
    assert.ok(frame.partial > 0, frame.file + ': antialiased edge');
    assert.equal(frame.border, 0, frame.file + ': canvas clipping');
    assert.equal(frame.hiddenColor, 0, frame.file + ': hidden RGB matte');
  }
  const states = [];
  for (const state of manifest.character.states) {
    await page.getByRole('button', { name: state.name, exact: true }).click();
    const captureFrame = state.frames[state.name === 'death' ? state.frames.length - 1 : 2];
    await page.waitForFunction((frame) => window.probe.frame === frame, captureFrame);
    await page.screenshot({ path: join(evidence, state.name + '.png') });
    await page.waitForFunction(({ name, count }) => new Set(window.probe.visits[name]).size === count,
      { name: state.name, count: state.frames.length });
    if (state.loop) {
      await page.waitForFunction(({ name, count }) => window.probe.visits[name].length > count,
        { name: state.name, count: state.frames.length });
    } else {
      await page.waitForTimeout(220);
      assert.equal(await page.evaluate(() => window.probe.frame), state.frames.at(-1));
    }
    const observation = await page.evaluate(() => ({ active: window.probe.active, visited: window.probe.visits[window.probe.active], anchor: window.probe.anchor }));
    assert.deepEqual(observation.visited.slice(0, state.frames.length), state.frames);
    assert.deepEqual(observation.anchor, manifest.character.anchor);
    states.push(observation);
  }
  // A normal input after death restarts the selected state on the shared anchor.
  await page.getByRole('button', { name: 'idle', exact: true }).click();
  await page.waitForFunction(() => window.probe.active === 'idle');
  assert.equal((await page.evaluate(() => window.probe.visits.idle))[0], 'idle-000.svg');
  const audio = await page.evaluate(async (sounds) => {
    const results = [];
    for (const sound of sounds) {
      const data = await (await fetch('/assets/' + sound.file)).arrayBuffer();
      const context = new OfflineAudioContext(1, 1, sound.sampleRate);
      const buffer = await context.decodeAudioData(data);
      const samples = buffer.getChannelData(0);
      let peak = 0, energy = 0, maxStep = 0;
      for (let i = 0; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i])); energy += samples[i] ** 2;
        if (i) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
      }
      results.push({ id: sound.id, duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate,
        peak, rms: Math.sqrt(energy / samples.length), first: samples[0], last: samples.at(-1), maxStep });
    }
    return results;
  }, manifest.audio);
  for (const result of audio) {
    const expected = manifest.audio.find((item) => item.id === result.id);
    assert.equal(result.duration, expected.duration); assert.equal(result.channels, 1); assert.equal(result.sampleRate, 22050);
    assert.ok(result.peak > 0.05 && result.peak <= 0.9); assert.ok(result.rms > 0.01);
    assert.equal(result.first, 0); assert.equal(result.last, 0); assert.ok(result.maxStep < 0.2);
  }
  const playback = await page.evaluate(async () => {
    const element = document.querySelector('audio');
    element.muted = true;
    await element.play();
    return { paused: element.paused, readyState: element.readyState, error: element.error };
  });
  assert.equal(playback.paused, false); assert.ok(playback.readyState >= 2); assert.equal(playback.error, null);
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  const report = { browser: browser.version(), platform: process.platform, viewport: '1000x1000', pixels, states, audio, playback, errors, videoPath };
  await writeFile(join(evidence, 'browser.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ result: 'passed', frames: pixels.length, states: states.length, sounds: audio.length, evidence, videoPath }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
