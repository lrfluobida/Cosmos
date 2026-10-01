import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { watch } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createArtifactRegistry } from '../../../src/artifacts/index.ts';

async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const abort = new AbortController(), registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: '.registry', signal: abort.signal });
  await mkdir(join(root, 'author')); await writeFile(join(root, 'author/main.ts'), '// 保留原产物\n', 'utf8');
  const capture = await registry.registerCapture({ taskId: 'coding', artifactRef: registry.artifactRef('code', 'v1'), sourceRoot: 'author', files: [{ source: 'main.ts', destination: 'src/main.ts' }], ownership: { writePaths: ['src'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'fixture', sourceRefs: ['fixture'] } } });
  const stage = (version: string) => registry.stageCandidate({ taskId: 'coding', authorId: 'author', contextId: 'context', candidateRef: registry.candidateRef('game', version), targetRoot: registry.candidateRef('game', version).location, inputs: [capture.artifactRef], expectedDeps: [capture.artifactRef], ownership: { writePaths: ['src'], readOnlyPaths: [] } });
  const promote = async (candidate: any) => {
    const evidence = await registry.verifyCandidate(candidate.candidateRef, { build: async () => ({ passed: true, evidenceIds: ['build'] }) });
    return registry.promoteCandidate(candidate.candidateRef, { evidence, review: { candidateRef: candidate.candidateRef, attemptId: evidence.attemptId, reviewerId: 'reviewer', contextId: 'review', verdict: 'approved', evidenceIds: ['review'] } });
  };
  return { root, abort, registry, capture, stage, promote };
}
test('cancellation during verification cannot promote or replace the previous accepted version', async t => {
  const f = await fixture(t), previous = await f.stage('previous'); await f.promote(previous);
  const current = await f.stage('next');
  await assert.rejects(f.registry.verifyCandidate(current.candidateRef, { build: async () => {
    f.abort.abort(new Error('Injected cancellation before publication'));
    return { passed: true, evidenceIds: ['build'] };
  } }), /cancel/i);
  await assert.rejects(f.stage('after-stop'), /cancel/i);
  assert.deepEqual((await f.registry.current())?.candidateRef, previous.candidateRef);
  assert.equal(await readFile(join(f.root, previous.targetRoot, 'src/main.ts'), 'utf8'), '// 保留原产物\n');
});
test('registry commit locks identify their owner while a host callback is active', async t => {
  const f = await fixture(t), candidate = await f.stage('next');
  await f.registry.verifyCandidate(candidate.candidateRef, { build: async () => {
    const lock = JSON.parse(await readFile(join(f.root, '.registry/.commit.lock'), 'utf8'));
    assert.equal(lock.pid, process.pid); assert.equal(lock.formatVersion, 1); assert.ok(lock.token);
    return { passed: true, evidenceIds: ['build'] };
  } });
});
test('lost in-memory evidence cannot promote a candidate after restart', async t => {
  const f = await fixture(t), candidate = await f.stage('next');
  const proof = await f.registry.verifyCandidate(candidate.candidateRef, { build: async () => ({ passed: true, evidenceIds: ['build'] }) });
  const restored = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: '.registry' });
  await assert.rejects(restored.promoteCandidate(candidate.candidateRef, { evidence: JSON.parse(JSON.stringify(proof)), review: { candidateRef: candidate.candidateRef, attemptId: proof.attemptId, reviewerId: 'reviewer', contextId: 'review', verdict: 'approved', evidenceIds: ['review'] } }), /evidence/i);
  assert.equal(await restored.current(), null);
});

test('cancellation while capture files are staged prevents their fixed version publication', async t => {
  const f = await fixture(t);
  const watcher = watch(join(f.root, '.registry/tmp'), () => f.abort.abort(new Error('Cancelled while staging')));
  try {
    await assert.rejects(f.registry.registerCapture({ ...f.capture, artifactRef: f.registry.artifactRef('code', 'v2') }), /cancel/i);
  } finally { watcher.close(); }
  await assert.rejects(f.registry.getCapture(f.registry.artifactRef('code', 'v2')), /ENOENT/);
  assert.deepEqual((await f.registry.getCapture(f.capture.artifactRef)).artifactRef, f.capture.artifactRef);
});

test('a crashed external verification callback cannot prove that its untracked children exited', async t => {
  const f = await fixture(t), candidate = await f.stage('crash');
  const code = `import {createArtifactRegistry} from ${JSON.stringify(new URL('../../../src/artifacts/index.ts', import.meta.url).href)};
const registry=await createArtifactRegistry({workspaceRoot:process.argv[1],registryRoot:'.registry'});
await registry.verifyCandidate(JSON.parse(process.argv[2]),{build:async()=>{process.send('ready');await new Promise(()=>{});}});`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code, f.root, JSON.stringify(candidate.candidateRef)], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  const closed = once(child, 'close');
  try { await Promise.race([once(child, 'message'), closed.then(() => { throw new Error('Fixture failed before callback'); })]); }
  finally { child.kill(); await closed; }
  await assert.rejects(f.registry.recoverOwnership(), /untracked|callback|writer/i);
});
