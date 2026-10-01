import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { renderCharacter } from '../../src/media/vector.ts';
import { synthesizeWav } from '../../src/media/audio.ts';
import { character, music, sounds } from '../assets/specs.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = `.cosmos/artifacts-probe/${new Date().toISOString().replace(/[:.]/g, '-')}`;
const work = join(root, run), author = join(work, 'author'), mediaRoot = join(work, 'media'), buildRoot = join(work, 'build');
const evidenceRoot = join(root, 'probes/artifacts/evidence');
await mkdir(work, { recursive: true }); await mkdir(mediaRoot); await mkdir(evidenceRoot, { recursive: true });
const cli = join(root, 'dist/cli/index.js');
const logs: string[] = [];
function command(args: string[], cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 180_000 });
  logs.push(result.stdout + result.stderr); assert.equal(result.status, 0, result.stdout + result.stderr);
}
command([cli, 'init', author]);
const visual = renderCharacter(character), audio = [music, ...sounds].map(synthesizeWav);
for (const file of visual.files) await writeFile(join(mediaRoot, file.name), file.svg, 'utf8');
for (const file of audio) await writeFile(join(mediaRoot, file.manifest.file), file.bytes);
const media = { characters: [{ directory: 'public/media', manifest: visual.manifest }], audio: audio.map(item => ({ directory: 'public/media', manifest: item.manifest })) };

// This authored, generic engine integration fixture is generated only under ignored .cosmos.
// It is not a runtime-generated target game or evidence for the full game benchmark.
const scene = `import Phaser from 'phaser';
const visual = ${JSON.stringify(visual.manifest)};
const audio = ${JSON.stringify(audio.map(item => item.manifest))};
const observed = { ready: false, state: 'idle', loadedTextures: 0, loadedAudio: 0, audioStarted: [] as string[],
  seen: {} as Record<string, string[]>, frame: '', origins: [] as number[][], sizes: [] as number[][], anchors: [] as number[][],
  decodedAudio: [] as { id: string; sampleRate: number; duration: number; channels: number }[], errors: [] as string[] };
Object.defineProperty(window, 'cosmosDebug', { get: () => Object.freeze(JSON.parse(JSON.stringify(observed))), configurable: false });
function publish() { document.querySelector('[data-testid="debug-state"]')!.textContent = JSON.stringify(observed); }
class Probe extends Phaser.Scene {
  sprites: Phaser.GameObjects.Sprite[] = [];
  preload() {
    this.load.on('loaderror', (file: Phaser.Loader.File) => observed.errors.push(file.key));
    for (const state of visual.states) for (const frame of state.frames) this.load.svg(frame, '/media/' + frame);
    for (const clip of audio) this.load.audio(clip.id, '/media/' + clip.file);
  }
  create() {
    this.sound.mute = true;
    this.add.rectangle(200, 215, 370, 270, 0x172634);
    this.add.rectangle(600, 215, 370, 270, 0xf3f0dd);
    this.add.text(30, 30, 'COS-09 / Phaser media integration', { fontSize: '24px' });
    this.add.text(30, 58, 'Original probe robot · fixed anchors · normal mouse input', { fontSize: '14px' });
    for (const x of [200, 600]) {
      this.add.line(0, 0, x - 100, 300, x + 100, 300, x === 200 ? 0x81e4cb : 0x337d82).setOrigin(0);
      this.add.line(0, 0, x, 285, x, 315, 0xe28a44).setOrigin(0);
      this.sprites.push(this.add.sprite(x, 300, visual.states[0].frames[0]).setOrigin(visual.origin.x, visual.origin.y));
    }
    for (const state of visual.states) this.anims.create({ key: state.name, frames: state.frames.map(key => ({ key })), frameRate: state.fps, repeat: state.loop ? -1 : 0 });
    const record = () => { const key = this.sprites[0].texture.key; observed.frame = key;
      observed.origins = this.sprites.map(sprite => [sprite.originX, sprite.originY]);
      observed.sizes = this.sprites.map(sprite => [sprite.width, sprite.height]);
      observed.anchors = this.sprites.map(sprite => [sprite.x, sprite.y]);
      const frames = observed.seen[observed.state] ??= []; if (!frames.includes(key)) frames.push(key); publish(); };
    this.sprites[0].on('animationupdate', record);
    const playAudio = (id: string) => { if (this.sound.play(id, { loop: audio.find(item => item.id === id)!.loop })) observed.audioStarted.push(id); publish(); };
    const select = (name: string, sound?: string) => { observed.state = name; for (const sprite of this.sprites) sprite.play(name); record(); if (sound) playAudio(sound); };
    const button = (x: number, y: number, label: string, action: () => void) => {
      this.add.text(x, y, label, { fontSize: '17px', color: '#eef4ff', backgroundColor: '#33485d', padding: { x: 15, y: 10 } }).setOrigin(0.5).setInteractive().on('pointerdown', action);
    };
    button(180, 390, 'Idle', () => select('idle', 'confirm'));
    button(400, 390, 'Attack', () => select('attack', 'attack'));
    button(620, 390, 'Death', () => select('death', 'power-down'));
    button(280, 455, 'Music (muted)', () => playAudio('workshop-loop'));
    button(530, 455, 'Impact (muted)', () => playAudio('impact'));
    observed.loadedTextures = visual.states.flatMap(state => state.frames).filter(frame => this.textures.exists(frame)).length;
    observed.loadedAudio = audio.filter(clip => this.cache.audio.exists(clip.id)).length;
    observed.origins = this.sprites.map(sprite => [sprite.originX, sprite.originY]);
    observed.sizes = this.sprites.map(sprite => [sprite.width, sprite.height]);
    observed.anchors = this.sprites.map(sprite => [sprite.x, sprite.y]);
    observed.decodedAudio = audio.map(clip => { const buffer = this.cache.audio.get(clip.id) as AudioBuffer;
      return { id: clip.id, sampleRate: buffer.sampleRate, duration: buffer.duration, channels: buffer.numberOfChannels }; });
    select('idle'); observed.ready = true; publish();
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 800, height: 500,
  backgroundColor: '#253344', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [Probe] });
`;
new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(author, 'src/main.ts')));
await writeFile(join(author, 'src/main.ts'), scene, 'utf8');
const html = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(author, 'index.html')));
await writeFile(join(author, 'index.html'), html.replace('</head>', '  <link rel="icon" href="data:," />\n  </head>').replace('A small stage for your next idea', 'Fixed media integration probe')
  .replace('Click the sprite to change its color. Click the stage to move it. Try the scene button.', 'Click Idle, Attack, Death, Music and Impact. Audio is muted for this automated probe.'), 'utf8');
const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: `${run}/registry` });
const ownership = { writePaths: ['.'], readOnlyPaths: [] };
const provenance = { kind: 'original-procedural' as const, sourceRefs: ['probes/assets/specs.ts'], generator: 'COS-04 original geometry, poses and synthesized notes' };
const assets = await registry.registerCapture({ taskId: 'probe-art', artifactRef: registry.artifactRef('original-media', 'v1'),
  sourceRoot: `${run}/media`, ownership, dependencies: [], metadata: { kind: 'media', provenance, media },
  files: [...visual.files.map(file => ({ source: file.name, destination: `public/media/${file.name}` })), ...audio.map(item => ({ source: item.manifest.file, destination: `public/media/${item.manifest.file}` }))],
});
const code = await registry.registerCapture({ taskId: 'probe-code', artifactRef: registry.artifactRef('phaser-code', 'v1'),
  sourceRoot: `${run}/author`, ownership, dependencies: [assets.artifactRef], metadata: { kind: 'code', provenance: { ...provenance, sourceRefs: ['templates/2d', 'probes/artifacts/phaser.ts'], generator: 'Host-authored generic integration fixture' } },
  files: ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'src/main.ts'].map(file => ({ source: file, destination: file })),
});
const candidateRef = registry.candidateRef('phaser-probe', 'v1');
const candidate = await registry.stageCandidate({ taskId: 'probe-integration', authorId: 'probe-author', contextId: 'probe-author-context',
  candidateRef, targetRoot: candidateRef.location, ownership, inputs: [code.artifactRef, assets.artifactRef], expectedDeps: [code.artifactRef, assets.artifactRef], mediaRequirements: [{ artifactRef: assets.artifactRef, media }],
});
let observation: any, browserVersion = '', preview: ReturnType<typeof spawn> | undefined;
const errors: string[] = [];
const passed = await registry.verifyCandidate(candidateRef, {
  build: async (_candidate, project) => {
    await cp(project, buildRoot, { recursive: true, errorOnExist: true });
    command([join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'ci', '--no-audit', '--no-fund'], buildRoot);
    command([cli, 'build', buildRoot]);
    await cp(join(buildRoot, 'dist'), join(project, 'dist'), { recursive: true, errorOnExist: true });
    return { passed: true, evidenceIds: [`${run}/build.log`] };
  },
  acceptance: async (_candidate, project) => {
    const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    const address = listener.address(); assert(address && typeof address !== 'string'); const port = address.port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    preview = spawn(process.execPath, [join(buildRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', join(project, 'dist'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: buildRoot, stdio: 'pipe', windowsHide: true });
    preview.stdout?.on('data', data => logs.push(String(data))); preview.stderr?.on('data', data => logs.push(String(data)));
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* Wait for local startup. */ }
      assert(attempt < 100 && preview.exitCode === null, logs.join('\n'));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const browser = await chromium.launch({ channel: 'msedge', headless: true }); browserVersion = browser.version();
    try {
      const context = await browser.newContext({ viewport: { width: 1200, height: 950 } }); const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
      await page.goto(`http://127.0.0.1:${port}`); await page.waitForFunction(() => (window as any).cosmosDebug?.ready);
      const bounds = await page.locator('canvas').boundingBox(); assert(bounds);
      const click = (x: number, y: number) => page.mouse.click(bounds.x + x * bounds.width / 800, bounds.y + y * bounds.height / 500);
      await click(180, 390); await page.waitForFunction(() => (window as any).cosmosDebug.seen.idle.length === 4);
      await page.screenshot({ path: join(evidenceRoot, '01-idle-dark-light.png') });
      await click(400, 390); await page.waitForFunction(() => (window as any).cosmosDebug.frame === 'attack-002.svg');
      await page.screenshot({ path: join(evidenceRoot, '02-attack-dark-light.png') });
      await page.waitForFunction(() => (window as any).cosmosDebug.seen.attack.length === 6);
      await click(620, 390); await page.waitForFunction(() => (window as any).cosmosDebug.seen.death.length === 4);
      await page.screenshot({ path: join(evidenceRoot, '03-death-dark-light.png') });
      await click(280, 455); await click(530, 455);
      observation = await page.evaluate(() => (window as any).cosmosDebug);
      assert.equal(observation.loadedTextures, 14); assert.equal(observation.loadedAudio, 5);
      for (const state of visual.manifest.states) assert.deepEqual(observation.seen[state.name], state.frames);
      assert.deepEqual([...new Set(observation.audioStarted)].sort(), audio.map(item => item.manifest.id).sort());
      assert.deepEqual(observation.origins, Array(2).fill([visual.manifest.origin.x, visual.manifest.origin.y]));
      assert.deepEqual(observation.sizes, [[192, 192], [192, 192]]); assert.deepEqual(observation.anchors, [[200, 300], [600, 300]]);
      for (const item of observation.decodedAudio) { const expected = audio.find(clip => clip.manifest.id === item.id)!.manifest;
        assert.equal(item.channels, 1); assert(Math.abs(item.duration - expected.duration) < 1 / expected.sampleRate); assert(item.sampleRate > 0); }
      assert.deepEqual(observation.errors, []); assert.deepEqual(errors, []);
      await context.close(); return { passed: true, evidenceIds: ['probes/artifacts/evidence/verification.json', 'probes/artifacts/evidence/01-idle-dark-light.png', 'probes/artifacts/evidence/02-attack-dark-light.png', 'probes/artifacts/evidence/03-death-dark-light.png'] };
    } finally {
      await browser.close();
      if (preview?.pid) spawnSync('taskkill.exe', ['/pid', String(preview.pid), '/T', '/F'], { windowsHide: true });
    }
  },
});
const accepted = await registry.promoteCandidate(candidateRef, { evidence: passed, review: { candidateRef, reviewerId: 'probe-host-checker', contextId: 'probe-check-context', verdict: 'approved', evidenceIds: ['probe deterministic checks; independent implementation review remains separate'] } });
await writeFile(join(work, 'build.log'), logs.join('\n'), 'utf8');
const report = { purpose: 'COS-09 generic platform integration, not target game generation', recordedAt: new Date().toISOString(),
  browser: { channel: 'msedge', version: browserVersion, headless: true }, node: process.version,
  externalServiceCalls: 0, externalFeesCny: 0, candidate: accepted.candidateRef, sourceArtifacts: [code.artifactRef, assets.artifactRef],
  commands: ['cosmos init author', 'npm ci --no-audit --no-fund', 'cosmos build build'], observation, errors,
  review: 'API host review gate exercised by probe checks; independent COS-09 reviewer separately inspects implementation/evidence.',
  audio: 'All five WAVs decoded by Phaser and triggered through mouse input, muted. Human listening remains outside this automated check.',
  buildLog: relative(root, join(work, 'build.log')).replaceAll('\\', '/'),
};
await writeFile(join(evidenceRoot, 'verification.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ passed: true, browserVersion, candidateRef, evidenceRoot }));
