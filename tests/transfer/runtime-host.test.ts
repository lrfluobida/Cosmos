import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { transferFixture } from './runtime-host.fixture.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import type { TaskContract } from '../../src/contracts/index.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { bindTransferAcceptance, verifyPreparedTransferAcceptance } from '../../src/runtime/adapters/transfer/binding.ts';
import type { BindInput } from '../../src/runtime/adapters/transfer/binding.ts';
import { createTransferDesignValidation } from '../../src/runtime/adapters/transfer/design-validation.ts';
import type { BrowserPreparationContext } from '../../src/runtime/entrypoint-preparation.ts';

async function api() {
  const result: any = await import('../../probes/transfer/runtime-host.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof result.createTransferRuntimeHost, 'function', 'COS38 runtime input adapter is missing');
  return result;
}
async function pipeline(t: any, invalid = false, missing = false, beforeArt?: (fixture: Awaited<ReturnType<typeof transferFixture>>, task: Readonly<TaskContract>) => Promise<void>) {
  const a = await api(), f = await transferFixture(t); if (invalid) f.invalidateMap(); if (missing) f.omitMap();
  let host = await a.createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const tasks = f.prepare(host); host.validateTasks(tasks);
  const recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture };
  const result: TaskContract[] = await host.withPreparation(() => executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: async (task, signal) => {
      if (beforeArt && task.taskId === f.window.quote.declaration.grants.art.taskId) await beforeArt(f, task);
      return host.preAuthor(task, signal);
    }, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
    recovery, reviewProtocolCorrections: 1, authorProtocolCorrections: 1 }));
  const registry = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: 'registry' });
  // A failed preparation DAG drains its listener. Reopen the exact source inputs/original port for read-only binding checks, without new roles or fees.
  if (!invalid && !missing && !beforeArt) { await host.closePreparation(); host = await a.createTransferRuntimeHost({ ...f.input, resume: true }); host.validateTasks(tasks); }
  return { ...f, host, tasks, result, registry, recovery };
}

test('runtime design prepares four fixed outputs, complete review/journal and read-only downstream inputs', async t => {
  const f = await pipeline(t);
  assert.deepEqual(f.result.map(item => item.state), ['passed', 'passed', 'failed']);
  const outputs = f.tasks[0].expectedArtifacts!;
  const packets = f.configs.map(config => JSON.parse(config.context)), coding = packets.find(packet => packet.role === 'coding');
  const prefix = 'Current candidate plan mapping: ';
  const rule = coding.rules.find((item: string) => item.startsWith(prefix));
  assert.ok(rule, 'Coding packet must identify its current plan without reading both plan files.');
  const mapping = JSON.parse(rule.slice(prefix.length));
  assert.deepEqual(mapping, ['v1', 'v2'].map(version => ({ outputDestination: f.registry.candidateRef(`${f.window.caseId}-game`, version).location,
    plan: f.registry.artifactRef(`${f.window.caseId}-plan-${version}`, 'v1'), file: '_cosmos/transfer-plan.json' })));
  const selected = mapping.filter((item: any) => item.outputDestination === coding.outputs[0].destination);
  assert.equal(selected.length, 1); assert.equal(selected[0].plan.artifactId, `${f.window.caseId}-plan-v1`);
  assert.deepEqual(coding.inputs, f.tasks[2].task.inputs);
  for (const item of mapping) assert.ok(coding.inputFiles.some((ref: any) => ref.artifactId === item.plan.artifactId && ref.version === 'v1' && ref.files.includes(item.file)));
  assert.doesNotMatch(coding.rules.join('\n'), /read both|both pre-coding/i);
  assert.doesNotMatch(coding.rules.join('\n'), /Select each exact artifactId\/version reference.*and read/);
  assert.match(packets.find(packet => packet.role === 'design').rules.join('\n'), /read both/i);
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

test('COS92 each candidate binding reuses only its own verified inputs and checks scope afresh', async t => {
  const f = await pipeline(t), candidate = f.registry.candidateRef(`${f.window.caseId}-game`, 'v1');
  const requireHost = f.controller.requireValidationHost.bind(f.controller); let scopes = 0;
  t.mock.method(f.controller, 'requireValidationHost', async (...args: Parameters<typeof requireHost>) => { scopes++; return requireHost(...args); });
  for (let operation = 1; operation <= 2; operation++) {
    scopes = 0; const start = performance.now();
    const bound: any = await f.host.bindPreparedCandidate(candidate);
    assert.equal(bound.artifact.artifactId, `${f.window.caseId}-plan-v1`);
    t.diagnostic(JSON.stringify({ operation, scopes, elapsedMs: +(performance.now() - start).toFixed(3) }));
    assert.equal(scopes, 8, 'Do not verify the same prepared inputs twice in one binding');
  }
  f.changeIdentity(); await assert.rejects(f.host.bindPreparedCandidate(candidate), /identity|source|platform/i);
});

test('COS97 fixed transfer binding forwards caller cancellation through actual plan design and candidate reads', async t => {
  const f = await pipeline(t), saved = JSON.parse(await readFile(join(f.root, 'host-transfer-prepared-inputs.json'), 'utf8'));
  const prepared = saved.plans.v1, first = prepared.segments[0];
  const input: BindInput = { root: f.root, registry: f.registry, frozen: saved.frozen,
    currentRequirement: { artifact: saved.frozen.requirement, specVersion: saved.frozen.specVersion }, candidate: prepared.binding.candidate,
    planArtifact: prepared.artifact, url: first.plan.url, runId: prepared.binding.runId,
    reportId: first.plan.reportId.slice(0, -('-' + first.id).length), taskId: first.plan.taskId, prepared };
  assert.deepEqual(await verifyPreparedTransferAcceptance(input), prepared);
  assert.deepEqual(await bindTransferAcceptance(input), prepared);
  await t.test('pre-cancelled caller', async () => {
    const caller = new AbortController(), reason = new Error('cancelled before fixed binding'); caller.abort(reason);
    await assert.rejects(verifyPreparedTransferAcceptance(input, caller.signal), error => error === reason);
    await assert.rejects(bindTransferAcceptance(input, caller.signal), error => error === reason);
  });
  await t.test('cancellation during actual metadata bytes', async () => {
    const caller = new AbortController(), reason = new Error('cancelled after binding bytes'), original = fs.promises.readFile; let reads = 0;
    t.mock.method(fs.promises, 'readFile', async (...args: Parameters<typeof original>) => {
      const bytes = await original(...args);
      if (String(args[0]).startsWith(f.root)) { reads++; if (reads === 1) caller.abort(reason); }
      return bytes;
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(bindTransferAcceptance(input, caller.signal), error => error === reason);
      assert.equal(reads, 1, 'Cancellation after metadata must prevent the next actual binding file read');
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  });
});

test('COS97 read-only design seal stops at caller boundaries on valid audit bytes', async t => {
  const f = await pipeline(t), task = f.result[0]; let guards = 0, received: AbortSignal | undefined, cancel: AbortController | undefined;
  const context = { root: f.root, signal: f.input.work.signal, requirement: f.requirement, designTaskId: task.taskId,
    requirementCapture: f.registry.artifactRef(`${f.window.caseId}-requirement-bundle`, 'fixture-v1') } as BrowserPreparationContext;
  const validation = createTransferDesignValidation({ context, controller: f.controller,
    guard: async (caller?: AbortSignal) => { guards++; received = caller; cancel?.abort(reason); } });
  const reason = new Error('cancelled read-only design seal');
  assert.ok((await validation.seal(task)).bytes.length > 0, 'The original audit and source must be valid before cancellation'); guards = 0;
  await t.test('pre-cancelled seal starts no guard', async () => {
    const caller = new AbortController(); caller.abort(reason);
    await assert.rejects(validation.seal(task, undefined, caller.signal), error => error === reason); assert.equal(guards, 0);
  });
  await t.test('cancellation inside guard preserves caller before binding reads', async () => {
    cancel = new AbortController(); guards = 0;
    try { await assert.rejects(validation.seal(task, undefined, cancel.signal), error => error === reason); assert.equal(received, cancel.signal); assert.equal(guards, 1); }
    finally { cancel = undefined; }
  });
  await t.test('cancellation after first actual binding bytes stops subsequent reads', async () => {
    const caller = new AbortController(), original = fs.promises.readFile; let reads = 0;
    t.mock.method(fs.promises, 'readFile', async (...args: Parameters<typeof original>) => {
      const bytes = await original(...args); if (String(args[0]).startsWith(f.root)) { reads++; if (reads === 1) caller.abort(reason); } return bytes;
    }); syncBuiltinESMExports();
    try { await assert.rejects(validation.seal(task, undefined, caller.signal), error => error === reason); assert.equal(reads, 1); }
    finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  });
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

for (const changed of ['plan-v2', 'transfer-design', 'receipt', 'generic-design']) test(`changed frozen ${changed} stops downstream before input mirroring or provider dispatch`, async t => {
  let before: RunSnapshot | undefined;
  let url = '';
  const f = await pipeline(t, false, false, async (fixture, task) => {
    before = await fixture.controller.read();
    const design = before.tasks.find(item => item.taskId === fixture.window.quote.declaration.grants.design.taskId)!;
    assert.equal(design.state, 'passed'); assert.equal(design.review.verdict, 'approved'); assert.equal(design.artifacts.length, 4);
    url = JSON.parse((await readFile(join(fixture.root, 'host-transfer-origin.json'))).toString('utf8')).url;
    if (changed === 'receipt') await unlink(join(fixture.root, 'host-transfer-prepared-inputs.json'));
    else {
      const ref = task.inputs.find(ref => ref.artifactId.endsWith(changed === 'generic-design' ? '-design' : '-' + changed)
        && (changed !== 'generic-design' || !ref.artifactId.endsWith('transfer-design')))!;
      const file = join(fixture.root, ref.location, changed === 'generic-design' ? '_cosmos/design.json' : changed === 'plan-v2' ? '_cosmos/transfer-plan.json' : '_cosmos/transfer-design.json');
      if (changed === 'generic-design') { const data = JSON.parse(await readFile(file, 'utf8')); data.summary = 'Changed valid-shape generic design'; await writeFile(file, JSON.stringify(data), 'utf8'); }
      else await writeFile(file, '{}', 'utf8');
    }
  });
  assert.ok(before);
  assert.ok(!f.calls.some(item => ['art', 'coding'].includes(item.kind)), 'Frozen-input corruption must fail before either downstream author provider');
  assert.ok(f.result.slice(1).every(task => task.attempts.length === 0), 'Rejected input cannot start downstream attempts');
  const after = await f.controller.read();
  assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.requests, before.requests);
  assert.deepEqual(after.run.fees, before.run.fees); assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.deepEqual(after.validation, before.validation); await assert.rejects(fetch(url));
  for (const item of f.tasks.slice(1)) await assert.rejects(readFile(join(item.workspace, item.task.inputs[0].location)), /ENOENT|EISDIR/);
});
