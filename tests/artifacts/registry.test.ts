import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArtifactRegistry, createArtifactRegistry } from '../../src/artifacts/index.ts';
import { renderCharacter } from '../../src/media/vector.ts';
import { synthesizeWav } from '../../src/media/audio.ts';

const ownership = { writePaths: ['src', 'public'], readOnlyPaths: ['src/protected'] };
const provenance = { kind: 'original-procedural' as const, sourceRefs: ['probe/spec.ts'], generator: 'Cosmos local tools' };
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'cosmos-artifacts-'));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const registry = await createArtifactRegistry({ workspaceRoot, registryRoot: '.registry' });
  await mkdir(join(workspaceRoot, 'author'));
  await writeFile(join(workspaceRoot, 'author/main.ts'), '// 中文保持原样\nexport const version = 1;\n', 'utf8');
  const register = (id = 'code', version = 'v1', extra = {}) => registry.registerCapture({
    taskId: 'coding-task', artifactRef: registry.artifactRef(id, version), sourceRoot: 'author',
    files: [{ source: 'main.ts', destination: 'src/main.ts' }], ownership,
    metadata: { kind: 'code', provenance }, dependencies: [], ...extra,
  });
  const stage = (inputs: any[], version = 'v1', extra = {}) => registry.stageCandidate({
    taskId: 'integration', authorId: 'author', contextId: 'author-context',
    candidateRef: registry.candidateRef('game', version), targetRoot: registry.candidateRef('game', version).location,
    inputs: inputs.map(item => item.artifactRef), expectedDeps: inputs.map(item => item.artifactRef),
    ownership, ...extra,
  });
  const promote = async (candidate: any, build = async () => ({ passed: true, evidenceIds: ['build-log'] })) => {
    const evidence = await registry.verifyCandidate(candidate.candidateRef, { build });
    return registry.promoteCandidate(candidate.candidateRef, { evidence, review: {
      candidateRef: candidate.candidateRef, reviewerId: 'reviewer', contextId: 'review-context', verdict: 'approved', evidenceIds: ['review-log'],
    } });
  };
  return { workspaceRoot, registry, register, stage, promote };
}

test('captures fixed immutable files and stages a complete code candidate', async t => {
  const f = await fixture(t); const capture = await f.register();
  await writeFile(join(f.workspaceRoot, 'author/main.ts'), 'changed by author', 'utf8');
  const candidate = await f.stage([capture]);
  assert.equal(await readFile(join(f.workspaceRoot, candidate.targetRoot, 'src/main.ts'), 'utf8'), '// 中文保持原样\nexport const version = 1;\n');
  await f.promote(candidate);
  assert.deepEqual((await f.registry.current())?.candidateRef, candidate.candidateRef);
  const reopened = await createArtifactRegistry({ workspaceRoot: f.workspaceRoot, registryRoot: '.registry' });
  assert.deepEqual((await reopened.current())?.candidateRef, candidate.candidateRef);
});

test('missing files and attempted version replacement leave no partial registered entry', async t => {
  const f = await fixture(t);
  await assert.rejects(f.register('broken', 'v1', { files: [{ source: 'missing.svg', destination: 'public/missing.svg' }] }), /missing|ENOENT/i);
  await assert.rejects(f.registry.getCapture(f.registry.artifactRef('broken', 'v1')), /missing|ENOENT/i);
  await f.register();
  await writeFile(join(f.workspaceRoot, 'author/main.ts'), 'replacement', 'utf8');
  await assert.rejects(f.register(), /exists|immutable/i);
  assert.equal((await readdir(join(f.workspaceRoot, '.registry/tmp'))).length, 0);
});

test('rejects stale required dependencies and duplicate or overlapping destinations', async t => {
  const f = await fixture(t); const a = await f.register();
  await assert.rejects(f.stage([a], 'stale', { expectedDeps: [f.registry.artifactRef('code', 'v2')] }), /required|version/i);
  const b = await f.register('other');
  await assert.rejects(f.stage([a, b], 'conflict'), /conflict|duplicate/i);
  await assert.rejects(f.register('duplicate', 'v1', { files: [
    { source: 'main.ts', destination: 'src/main.ts' }, { source: 'main.ts', destination: 'SRC/MAIN.TS' },
  ] }), /duplicate|conflict/i);
  const c = await f.register('dependent', 'v1', { files: [{ source: 'main.ts', destination: 'src/other.ts' }], dependencies: [a.artifactRef] });
  await assert.rejects(f.stage([c], 'missing-dependency'), /dependency|version/i);
  await assert.rejects(f.register('overlap', 'v1', { files: [
    { source: 'main.ts', destination: 'src/a' }, { source: 'main.ts', destination: 'src/a/file.ts' },
  ] }), /conflict|duplicate/i);
});

test('restricts source and destination paths, ownership, and symbolic links', async t => {
  const f = await fixture(t);
  assert.throws(() => new ArtifactRegistry(f.workspaceRoot, '../outside'), /path/i);
  await assert.rejects(f.register('escape', 'v1', { files: [{ source: '../author/main.ts', destination: 'src/main.ts' }] }), /path/i);
  await assert.rejects(f.register('protected', 'v1', { files: [{ source: 'main.ts', destination: 'src/protected/config.ts' }] }), /ownership/i);
  await assert.rejects(f.register('device', 'v1', { files: [{ source: 'main.ts', destination: 'src/CON.ts' }] }), /path/i);
  await symlink(join(f.workspaceRoot, 'author'), join(f.workspaceRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.register('link', 'v1', { sourceRoot: 'linked' }), /symbolic|junction/i);
  const a = await f.register();
  await assert.rejects(f.stage([a], 'outside', { targetRoot: '../outside' }), /target|path/i);
});

test('failed build, forged evidence, stale review and edits after verification cannot replace accepted candidate', async t => {
  const f = await fixture(t); const a = await f.register(); const v1 = await f.stage([a]); await f.promote(v1);
  const v2 = await f.stage([a], 'v2');
  await assert.rejects(f.promote(v2, async () => ({ passed: false, evidenceIds: ['failed-build'] })), /build/i);
  await assert.rejects(f.registry.promoteCandidate(v2.candidateRef, { evidence: { passed: true } as any, review: {} as any }), /host|evidence/i);
  const evidence = await f.registry.verifyCandidate(v2.candidateRef, { build: async () => ({ passed: true, evidenceIds: ['ok'] }) });
  const review = { candidateRef: v1.candidateRef, reviewerId: 'reviewer', contextId: 'independent', verdict: 'approved' as const, evidenceIds: ['review'] };
  await assert.rejects(f.registry.promoteCandidate(v2.candidateRef, { evidence, review }), /review|version/i);
  await writeFile(join(f.workspaceRoot, v2.targetRoot, 'unexpected.txt'), 'not reviewed', 'utf8');
  await assert.rejects(f.registry.promoteCandidate(v2.candidateRef, { evidence, review: { ...review, candidateRef: v2.candidateRef } }), /changed|snapshot/i);
  assert.deepEqual((await f.registry.current())?.candidateRef, v1.candidateRef);
});

async function mediaFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const visual = renderCharacter({ id: 'robot', width: 32, height: 32, anchor: { x: 16, y: 30 },
    layers: [{ id: 'body', shape: 'rect', x: 4, y: 4, width: 20, height: 26, fill: '#ffffff', stroke: '#000000', strokeWidth: 1 }],
    states: ['idle', 'attack', 'death'].map(name => ({ name, fps: 6, loop: name === 'idle', frames: [{}] })),
  });
  const sound = synthesizeWav({ id: 'beep', sampleRate: 22050, duration: 0.1, loop: false,
    notes: [{ midi: 60, start: 0, duration: 0.1, gain: 0.1, wave: 'sine', attack: 0.01, release: 0.01 }],
  });
  for (const file of visual.files) await writeFile(join(f.workspaceRoot, 'author', file.name), file.svg, 'utf8');
  await writeFile(join(f.workspaceRoot, 'author', sound.manifest.file), sound.bytes);
  const metadata = { kind: 'media' as const, provenance, media: {
    characters: [{ directory: 'public/robot', manifest: visual.manifest }], audio: [{ directory: 'public/audio', manifest: sound.manifest }],
  } };
  const files = [...visual.files.map(file => ({ source: file.name, destination: `public/robot/${file.name}` })),
    { source: sound.manifest.file, destination: `public/audio/${sound.manifest.file}` }];
  return { visual, sound, metadata, files, register: (id = 'media') => f.register(id, 'v1', { metadata, files }) };
}

test('validates real SVG and WAV files and requires the exact consumer media contract', async t => {
  const f = await fixture(t); const m = await mediaFixture(f); const a = await m.register();
  const mediaRequirements = [{ artifactRef: a.artifactRef, media: m.metadata.media }];
  const candidate = await f.stage([a], 'media-valid', { mediaRequirements }); await f.promote(candidate);
  const wrong = structuredClone(mediaRequirements); wrong[0].media.characters[0].manifest.states[0].name = 'walking';
  await assert.rejects(f.stage([a], 'wrong-state', { mediaRequirements: wrong }), /media|state/i);
  await assert.rejects(f.stage([a], 'missing-contract'), /media/i);
  await writeFile(join(f.workspaceRoot, 'author/idle-000.svg'), m.visual.files[0].svg.replace('width="32"', 'width="64"'), 'utf8');
  await assert.rejects(m.register('wrong-size'), /SVG|dimension/i);
  await writeFile(join(f.workspaceRoot, 'author/idle-000.svg'), m.visual.files[0].svg.replace('</svg>', '<script>alert(1)</script></svg>'), 'utf8');
  await assert.rejects(m.register('unsafe-svg'), /SVG/i);
  await writeFile(join(f.workspaceRoot, 'author/idle-000.svg'), m.visual.files[0].svg, 'utf8');
  await writeFile(join(f.workspaceRoot, 'author/beep.wav'), soundWithWrongRate(m.sound.bytes));
  await assert.rejects(m.register('wrong-audio'), /WAV|audio/i);
  await writeFile(join(f.workspaceRoot, 'author/beep.wav'), m.sound.bytes);
  m.metadata.media.characters[0].manifest.origin.y = 0;
  await assert.rejects(m.register('wrong-anchor'), /anchor|origin/i);
});
function soundWithWrongRate(bytes: Uint8Array) { const copy = Buffer.from(bytes); copy.writeUInt32LE(48000, 24); return copy; }

test('unknown redistribution rights and moving version names cannot be registered', async t => {
  const f = await fixture(t);
  assert.throws(() => f.registry.artifactRef('code', 'latest'), /fixed|version/i);
  await assert.rejects(f.register('unknown', 'v1', { metadata: { kind: 'media', provenance: { kind: 'generated', sourceRefs: ['model-response'], license: 'unknown' } } }), /provenance|license/i);
});

test('accepted versions cannot re-enter a writable build, including after a newer promotion and restart', async t => {
  const f = await fixture(t); const a = await f.register();
  const first = await f.stage([a]); await f.promote(first);
  const second = await f.stage([a], 'v2'); await f.promote(second);
  const reopened = await createArtifactRegistry({ workspaceRoot: f.workspaceRoot, registryRoot: '.registry' });
  let called = false;
  await assert.rejects(reopened.verifyCandidate(first.candidateRef, { build: async () => {
    called = true; return { passed: true, evidenceIds: ['should-not-run'] };
  } }), /sealed|accepted/i);
  assert.equal(called, false);
  assert.deepEqual((await reopened.current())?.candidateRef, second.candidateRef);
});

test('failed re-verification invalidates old host evidence and commit lock excludes another host', async t => {
  const f = await fixture(t); const a = await f.register(); const candidate = await f.stage([a]);
  const evidence = await f.registry.verifyCandidate(candidate.candidateRef, { build: async () => ({ passed: true, evidenceIds: ['old-pass'] }) });
  await assert.rejects(f.registry.verifyCandidate(candidate.candidateRef, { build: async () => ({ passed: false, evidenceIds: ['new-fail'] }) }), /Build/);
  await assert.rejects(f.registry.promoteCandidate(candidate.candidateRef, { evidence, review: {
    candidateRef: candidate.candidateRef, reviewerId: 'reviewer', contextId: 'review', verdict: 'approved', evidenceIds: ['review'],
  } }), /evidence/i);
  const other = await createArtifactRegistry({ workspaceRoot: f.workspaceRoot, registryRoot: '.registry' });
  await f.registry.verifyCandidate(candidate.candidateRef, { build: async () => {
    await assert.rejects(other.registerCapture({ ...a, artifactRef: other.artifactRef('parallel', 'v1') }), /busy/i);
    return { passed: true, evidenceIds: ['exclusive-build'] };
  } });
});
