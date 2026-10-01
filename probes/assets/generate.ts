import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { renderCharacter } from '../../src/media/vector.ts';
import { synthesizeWav } from '../../src/media/audio.ts';
import { character, music, sounds } from './specs.ts';

const output = fileURLToPath(new URL('../../.cosmos/media/assets/', import.meta.url));
const started = performance.now();
await mkdir(output, { recursive: true });
const visual = renderCharacter(character);
for (const file of visual.files) await writeFile(join(output, file.name), file.svg, 'utf8');
const visualMs = performance.now() - started;
const audioStarted = performance.now();
const audio = [];
for (const spec of [music, ...sounds]) {
  const result = synthesizeWav(spec);
  await writeFile(join(output, result.manifest.file), result.bytes);
  audio.push(result.manifest);
}
const manifest = {
  probe: 'COS-04', purpose: 'platform-capability-only', character: visual.manifest, audio,
  provenance: { source: 'probes/assets/specs.ts', author: 'Cosmos COS-04 implementer', method: 'original numeric geometry, poses and authored note sequences',
    thirdPartyAssets: [], externalServiceCalls: 0, externalFeesCny: 0,
    redistribution: 'Generated probe assets may be used, modified and redistributed with Cosmos outputs; no third-party attribution or external asset license required by this source.' },
};
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
await writeFile(join(output, 'input-specs.json'), JSON.stringify({ character, audio: [music, ...sounds] }, null, 2) + '\n', 'utf8');
const report = { generatedAt: new Date().toISOString(), node: process.version,
  timingsMs: { vectorAndWrite: visualMs, audioAndWrite: performance.now() - audioStarted, total: performance.now() - started },
  frames: visual.files.length, sounds: audio.length, externalServiceCalls: 0, externalFeesCny: 0,
  components: { independentParts: character.layers.length, poses: character.states.map((state) => ({ state: state.name, frames: state.frames.length })),
    proceduralLayersCny: 0, paidImagesCny: 0, audioSynthesisCny: 0 },
  note: 'Renderer timing excludes spec authoring, runtime model costs and integration. Shared validation ledger remains unchanged by this local probe.',
};
await writeFile(join(output, '../generation.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ output, ...report }));
