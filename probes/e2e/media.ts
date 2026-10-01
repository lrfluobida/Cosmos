import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { renderCharacter, validateCharacter } from '../../src/media/vector.ts';
import { synthesizeWav, validateAudio } from '../../src/media/audio.ts';
import type { MediaMetadata } from '../../src/artifacts/types.ts';
import { filteredChildEnvironment } from './admission.ts';
import { directory } from '../../src/artifacts/paths.ts';
import { writeJson } from './host.ts';

export function validateMediaSpec(value: any) {
  if (!value || Object.keys(value).some(key => !['characters', 'audio'].includes(key)) || !Array.isArray(value.characters) || !Array.isArray(value.audio)) throw new Error('Invalid media specification');
  const characters = (value.characters as unknown[]).map(validateCharacter), audio = (value.audio as unknown[]).map(validateAudio);
  if (characters.length !== 5 || ['producer', 'shooter', 'defender', 'normal', 'armored'].some(id => !characters.some(c => c.id === id))) throw new Error('Expected the five characters');
  for (const character of characters) for (const name of ['idle', 'attack', 'death']) {
    const state = character.states.find(s => s.name === name);
    if (!state || state.frames.length < 2 || name === 'death' && state.loop || new Set(state.frames.map(frame => JSON.stringify(frame))).size < 2) throw new Error(`Missing distinct ${character.id}/${name} poses`);
  }
  if (audio.length !== 6 || ['bgm', 'place', 'shoot', 'hit', 'victory', 'defeat'].some(id => !audio.some(clip => clip.id === id))) throw new Error('Expected BGM and five action sounds');
  if (!audio.find(a => a.id === 'bgm')!.loop || audio.some(a => a.id !== 'bgm' && a.loop)) throw new Error('Only BGM should loop');
  return { characters, audio };
}

/** Pure bounded geometry and PCM rendering of runtime-produced data; no game content is authored here. */
export async function renderMedia(root: string, folder: string, value: unknown, signal: AbortSignal) {
  const spec = validateMediaSpec(value); const destination = await directory(root, folder);
  const media: MediaMetadata = { characters: [], audio: [] };
  const previews: string[] = [];
  for (const character of spec.characters) {
    signal.throwIfAborted(); const output = renderCharacter(character), path = `public/assets/${character.id}`;
    await directory(destination, path);
    for (const file of output.files) await writeFile(join(destination, path, file.name), file.svg, { encoding: 'utf8', flag: 'wx' });
    await writeJson(destination, `${path}/manifest.json`, output.manifest);
    media.characters.push({ directory: path, manifest: output.manifest });
    previews.push(`<h2>${character.id}</h2><div class="frames">${output.files.map(file => `<figure>${file.svg}<figcaption>${file.name}</figcaption></figure>`).join('')}</div>`);
  }
  for (const clip of spec.audio) {
    signal.throwIfAborted(); const output = synthesizeWav(clip), path = 'public/assets/audio';
    if (output.manifest.peak <= 0.001) throw new Error(`Silent audio clip: ${clip.id}`);
    await directory(destination, path); await writeFile(join(destination, path, output.manifest.file), output.bytes, { flag: 'wx' });
    media.audio.push({ directory: path, manifest: output.manifest });
  }
  await writeJson(destination, 'public/assets/manifest.json', media);
  await writeJson(destination, '_cosmos/mediaSpec.json', value);
  const browser = await chromium.launch({ channel: 'msedge', headless: true, env: filteredChildEnvironment(process.env), timeout: 15_000 });
  let aborting: Promise<void> | undefined;
  const abort = () => { aborting = browser.close(); void aborting.catch(() => {}); }; signal.addEventListener('abort', abort, { once: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    await page.setContent(`<html><head><meta charset="utf-8"><style>body{background:#152335;color:#eef3ff;font:16px system-ui;padding:20px}.frames{display:flex;flex-wrap:wrap}figure{margin:8px;padding:8px;background:#31435b}svg{width:96px;height:96px}figcaption{font-size:12px}</style></head><body>${previews.join('')}</body></html>`, { timeout: 10_000 });
    const screenshot = `${folder}/contact-sheet.png`;
    await page.screenshot({ path: join(root, screenshot), fullPage: true, timeout: 10_000 });
    signal.throwIfAborted(); return { media, screenshot };
  } finally { signal.removeEventListener('abort', abort); await (aborting ?? browser.close()); }
}
