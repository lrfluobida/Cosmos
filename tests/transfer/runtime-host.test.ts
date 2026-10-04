import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transferFixture } from './runtime-host.fixture.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import type { TaskContract } from '../../src/contracts/index.ts';

async function api() {
  const result: any = await import('../../probes/transfer/runtime-host.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof result.createTransferRuntimeHost, 'function', 'COS38 runtime input adapter is missing');
  return result;
}
async function pipeline(t: any, invalid = false, missing = false) {
  const a = await api(), f = await transferFixture(t); if (invalid) f.invalidateMap(); if (missing) f.omitMap();
  let host = await a.createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const tasks = f.prepare(host); host.validateTasks(tasks);
  const recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture };
  const result: TaskContract[] = await host.withPreparation(() => executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
    recovery, reviewProtocolCorrections: 1, authorProtocolCorrections: 1 }));
  const registry = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: 'registry' });
  // A failed preparation DAG drains its listener. Reopen the exact source inputs/original port for read-only binding checks, without new roles or fees.
  if (!invalid && !missing) { await host.closePreparation(); host = await a.createTransferRuntimeHost({ ...f.input, resume: true }); host.validateTasks(tasks); }
  return { ...f, host, tasks, result, registry, recovery };
}

test('runtime design prepares four fixed outputs, complete review/journal and read-only downstream inputs', async t => {
  const f = await pipeline(t);
  assert.deepEqual(f.result.map(item => item.state), ['passed', 'passed', 'failed']);
  const outputs = f.tasks[0].expectedArtifacts!;
  assert.equal(outputs.length, 4); assert.deepEqual(f.result[0].artifacts, outputs);
  assert.ok(!('confirmedBy' in f.requirement)); assert.deepEqual((await f.controller.read()).run.humanDecisions, []);
  for (const ref of outputs) {
    await f.registry.getCapture(ref);
    assert.ok(f.result[0].review.inputVersions.some(item => item.artifactId === ref.artifactId && item.version === ref.version));
    for (const task of f.tasks.slice(1)) {
      assert.ok(task.task.inputs.some(item => item.artifactId === ref.artifactId && item.version === ref.version));
      const actual = await readFile(join(task.workspace, ref.location, ref.artifactId.includes('plan') ? '_cosmos/transfer-plan.json' : ref.artifactId.endsWith('transfer-design') ? '_cosmos/transfer-design.json' : '_cosmos/design.json'));
      assert.ok(actual.length > 0);
    }
  }
  const journal = JSON.parse(await readFile(join(f.root, 'journal/task-' + f.result[0].taskId, 'capture.json'), 'utf8'));
  assert.deepEqual(journal.value.captured.artifacts, outputs);
  assert.equal(journal.value.signature.length, 4);
  const recovered = await f.host.recoverCapture(f.result[0]); assert.deepEqual(recovered.artifacts, outputs);
  assert.ok(f.calls.some(item => item.kind === 'reviewer')); assert.ok(!f.calls.some(item => ['build', 'play'].includes(item.kind)));
  const finished = await f.host.finish(f.result); assert.equal(finished.acceptedCandidate, undefined); assert.equal(finished.delivery, undefined);
  assert.match(finished.gaps.join(' '), /consumer|preparation|adapter/i);
});

test('real v1/v2 candidates stage only the matching plan with exact dependencies and no conflicts', async t => {
  const f = await pipeline(t), designRefs = f.result[0].artifacts;
  const candidate = f.registry.candidateRef(`${f.window.caseId}-game`, 'v1');
  const c1 = await f.registry.getCandidate(candidate);
  const p1 = designRefs.find(ref => ref.artifactId.endsWith('plan-v1'))!, p2 = designRefs.find(ref => ref.artifactId.endsWith('plan-v2'))!;
  assert.ok(c1.inputs.some(ref => ref.artifactId === p1.artifactId)); assert.ok(!c1.inputs.some(ref => ref.artifactId === p2.artifactId));
  assert.deepEqual(c1.inputs, c1.expectedDeps);
  assert.ok(c1.files.some(file => file.destination === '_cosmos/transfer-plan.json' && file.artifactRef.artifactId === p1.artifactId));
  assert.ok(!c1.files.some(file => file.artifactRef.artifactId === p2.artifactId));
  const source1 = await f.registry.getCapture(f.registry.artifactRef(`${f.window.caseId}-game-source`, 'v1'));
  assert.ok(source1.dependencies.some(ref => ref.artifactId === p1.artifactId)); assert.ok(!source1.dependencies.some(ref => ref.artifactId === p2.artifactId));
  const bound1 = await f.host.bindPreparedCandidate(candidate); assert.equal(bound1.artifact.artifactId, p1.artifactId);
  const v2 = f.registry.candidateRef(`${f.window.caseId}-game`, 'v2');
  const inputs2 = c1.inputs.filter(ref => ref.artifactId !== p1.artifactId).map(ref => ref.artifactId.endsWith('game-source') ? { ...ref, version: 'v2', location: ref.location.replace('/v1/', '/v2/') } : ref);
  inputs2.push(p2);
  const source2 = f.registry.artifactRef(`${f.window.caseId}-game-source`, 'v2');
  await f.registry.registerCapture({ taskId: 'synthetic-coding-v2', artifactRef: source2, sourceRoot: f.tasks[2].workspace.slice(f.root.length + 1).replaceAll('\\', '/') + '/authors/coding',
    files: [{ source: 'index.html', destination: 'index.html' }, { source: 'src/main.ts', destination: 'src/main.ts' }], ownership: { writePaths: ['index.html', 'src'], readOnlyPaths: [] },
    dependencies: source1.dependencies.filter(ref => ref.artifactId !== p1.artifactId).concat(p2), metadata: source1.metadata });
  await f.registry.stageCandidate({ taskId: 'synthetic-coding-v2', authorId: 'synthetic', contextId: 'synthetic-v2', candidateRef: v2, targetRoot: v2.location,
    inputs: inputs2, expectedDeps: inputs2, ownership: { writePaths: ['.'], readOnlyPaths: [] }, mediaRequirements: c1.mediaRequirements });
  const bound2 = await f.host.bindPreparedCandidate(v2); assert.equal(bound2.artifact.artifactId, p2.artifactId);
  assert.deepEqual(bound1.segments.map((item: any) => item.plan.steps), bound2.segments.map((item: any) => item.plan.steps));
  assert.equal(bound1.checkpoint.origin, bound2.checkpoint.origin);
  await assert.rejects(f.host.bindPreparedCandidate({ ...v2, version: 'v1' }));
  await writeFile(join(f.root, v2.location, '_cosmos/transfer-plan.json'), '{}', 'utf8');
  await assert.rejects(f.host.bindPreparedCandidate(v2), /changed|plan|bytes/i);
  assert.equal((await f.controller.read()).validation!.cases[0].repair, null);
});

test('invalid semantic design preserves raw bytes and stops art/coding without claiming coding repair', async t => {
  const f = await pipeline(t, true); assert.equal(f.result[0].state, 'failed');
  assert.ok(!f.calls.some(item => ['art', 'coding'].includes(item.kind)));
  const failure = JSON.parse(await readFile(join(f.result[0].attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.ok(failure.issues.some((item: any) => item.checkId === 'transfer-design-semantics'));
  const manifest = JSON.parse(await readFile(join(f.root, failure.issues[0].evidenceRefs[0]), 'utf8'));
  assert.equal(manifest.diagnosis.kind, 'invalid_transfer_design');
  const raw = await readFile(join(f.root, manifest.raw.location));
  assert.deepEqual(raw, await readFile(join(f.tasks[0].workspace, 'authors/design/transfer-design.json')));
  for (const ref of f.tasks[0].expectedArtifacts!) await assert.rejects(f.registry.getCapture(ref));
  assert.equal((await f.controller.read()).validation!.cases[0].repair, null);
  assert.ok(!f.configs.some(config => JSON.parse(config.context).purpose === 'author_correction'));
});

test('missing runtime map preserves its explicit absence before any capture or downstream role', async t => {
  const f = await pipeline(t, false, true); assert.equal(f.result[0].state, 'failed');
  const failure = JSON.parse(await readFile(join(f.result[0].attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.equal(failure.issues[0].checkId, 'transfer-design-semantics');
  const manifest = JSON.parse(await readFile(join(f.root, failure.issues[0].evidenceRefs[0]), 'utf8'));
  assert.equal(manifest.raw.present, false); assert.equal(manifest.raw.sha256, null);
  assert.match(manifest.diagnosis.message, /missing/i);
  assert.ok(!f.calls.some(item => ['art', 'coding'].includes(item.kind)));
  for (const ref of f.tasks[0].expectedArtifacts!) await assert.rejects(f.registry.getCapture(ref));
});

test('source changes reject prepared binding and complete design recovery before writes', async t => {
  const f = await pipeline(t), candidate = f.registry.candidateRef(`${f.window.caseId}-game`, 'v1');
  f.changeIdentity(); await assert.rejects(f.host.bindPreparedCandidate(candidate), /identity|source|platform/i);
  assert.equal(await f.host.recoverCapture(f.result[0]), null);
  const failed = f.result[2], feedback = JSON.parse(await readFile(join(failed.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  await assert.rejects(f.host.prepareValidationRepair({ ...f.tasks[2], task: failed }, feedback, f.recovery));
  assert.equal((await f.controller.read()).validation!.cases[0].repair, null);
});

test('inactive repair plan changes invalidate all four design outputs, current candidate and recovery', async t => {
  const f = await pipeline(t), p2 = f.result[0].artifacts.find(ref => ref.artifactId.endsWith('plan-v2'))!;
  const path = join(f.root, p2.location, '_cosmos/transfer-plan.json'), before = await readFile(path);
  await writeFile(path, '{}', 'utf8');
  await assert.rejects(f.host.bindPreparedCandidate(f.registry.candidateRef(`${f.window.caseId}-game`, 'v1')), /plan|changed/i);
  assert.equal(await f.host.recoverCapture(f.result[0]), null);
  assert.ok(!f.calls.some(item => ['build', 'play'].includes(item.kind)));
  assert.equal(await f.registry.current(), null);
  // Restore only synthetic fixture bytes so the cleanup checks can inspect the original receipt.
  await writeFile(path, before);
});
