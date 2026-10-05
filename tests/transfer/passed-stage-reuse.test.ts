import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { passedStageFixture, successorFixture } from './passed-stage-reuse.fixture.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { requireValidationScope } from '../../src/runtime/validation-scope.ts';
import { syntheticReports } from './passed-stage-reuse-reports.fixture.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';

async function api() {
  const value: any = await import('../../src/runtime/historical-passed-stages.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof value.createHistoricalPassedStages, 'function', 'historical PASS verifier/importer must exist');
  return value;
}

test('closed genuine stages verify and import their unchanged complete closure without old authority', async t => {
  const a = await api(), f = await passedStageFixture(t), old = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  const binding = a.createHistoricalPassedStages(f.input), verified = await binding.verify(new AbortController().signal);
  assert.deepEqual(verified.stages.map((item: any) => item.task.taskId), f.result.map(task => task.taskId));
  assert.deepEqual(verified.stages.map((item: any) => item.task.state), ['passed', 'passed']);
  await binding.import(new AbortController().signal);
  for (const item of f.manifest.captures) {
    const path = item.ref.location.slice(0, -'/files'.length) + '/capture.json';
    assert.deepEqual(await readFile(join(f.targetRoot, path)), await readFile(join(f.root, path)));
  }
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), old);
  assert.equal(f.calls.filter(item => item.kind === 'reviewer').length, 2);
  assert.ok(!f.calls.some(item => ['coding', 'planning', 'build', 'play'].includes(item.kind)));
  await binding.import(new AbortController().signal); // Cold import only rechecks the same immutable receipt.
});

test('actual manifest bytes and a resigned foreign source identity fail before import writes', async t => {
  const a = await api(), f = await passedStageFixture(t);
  await f.changeManifest({ ...f.manifest, windowId: 'foreign' });
  await assert.rejects(a.createHistoricalPassedStages(f.input).import(new AbortController().signal), /manifest|digest/i);
  assert.deepEqual(await readdir(f.targetRoot), []);
  await f.resignManifest({ ...f.manifest, windowId: 'foreign' });
  await assert.rejects(a.createHistoricalPassedStages(f.input).import(new AbortController().signal), /identity|window|source/i);
  assert.deepEqual(await readdir(f.targetRoot), []);
});

test('changed raw review, audit and capture bytes are rejected before effects', async t => {
  const a = await api();
  const f = await passedStageFixture(t), binding = a.createHistoricalPassedStages(f.input);
  for (const kind of ['review', 'audit', 'capture']) {
    await binding.verify(new AbortController().signal);
    const task = f.result[0], path = kind === 'review' ? `journal/task-${task.taskId}/review.json`
      : kind === 'audit' ? `host-transfer-design-validation/${task.taskId}/${task.attempts[0].attemptId}/check-1-result.json`
      : `${task.artifacts[0].location}/_cosmos/design.json`;
    const before = await readFile(join(f.root, path)); await writeFile(join(f.root, path), '{}\n', 'utf8');
    await assert.rejects(binding.import(new AbortController().signal), /receipt|signature|bytes|capture|audit|content/i);
    assert.deepEqual(await readdir(f.targetRoot), []);
    await writeFile(join(f.root, path), before);
  }
});

export function codingTask(f: Awaited<ReturnType<typeof passedStageFixture>>, current: Awaited<ReturnType<typeof successorFixture>>, host: any) {
  const policy = host.taskPolicies[0], task = structuredClone(f.tasks[2].task);
  task.taskId = current.window.quote.declaration.grants.coding.taskId; task.authorId = 'synthetic-new-coding-author';
  task.inputs = [...host.availableArtifacts, ...f.result.flatMap(task => task.artifacts)];
  task.dependsOn = f.result.map(task => ({ taskId: task.taskId, state: 'passed' as const, requiredState: 'passed' as const }));
  task.context = { contextId: 'synthetic-new-coding-context', rules: policy.rules, tools: policy.tools, interfaces: [], knownFailures: [] };
  task.ownership = { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths };
  task.outputs = policy.outputs.map(({ type, schema, destination }: any) => ({ type, schema, destination }));
  task.budget.allocationMicroCny = policy.allocationMicroCny;
  return { task, role: 'coding' as const, workspace: policy.workspace,
    expectedArtifacts: policy.outputs.map(({ artifactId, version, destination }: any) => ({ artifactId, version, location: destination })) };
}

test('new real source DAG dispatches only coding with inherited old IDs, current plans and unchanged closed evidence', async t => {
  const a = await api(), runtime = await import('../../src/runtime/adapters/transfer/runtime-host.ts');
  const f = await passedStageFixture(t), current = await successorFixture(t, f), historicalStages = a.createHistoricalPassedStages(f.input);
  const before = await current.controller.read(), oldTasks = before.tasks.filter(task => f.result.some(old => old.taskId === task.taskId));
  const oldReceipt = await readFile(join(f.root, `journal/task-${f.result[0].taskId}/origin.json`));
  const host = await runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages }); t.after(() => host.closePreparation());
  assert.deepEqual(host.taskPolicies.map(policy => policy.role), ['coding']);
  const prepared = codingTask(f, current, host); await host.bindPreparedTasks([prepared]);
  const saved = JSON.parse(await readFile(join(f.targetRoot, 'host-transfer-prepared-inputs.json'), 'utf8'));
  assert.equal(saved.taskId, f.result[0].taskId); assert.deepEqual(saved.frozen, f.manifest && JSON.parse(await readFile(join(f.root, 'host-transfer-prepared-inputs.json'), 'utf8')).frozen);
  assert.equal(saved.plans.v1.segments[0].plan.taskId, prepared.task.taskId);
  assert.equal(saved.plans.v2.segments[0].plan.taskId, current.window.quote.declaration.grants.repair.taskId);
  assert.ok(saved.plans.v1.binding.candidate.artifactId.startsWith('cos20-synthetic-successor-'));
  const callsBefore = f.calls.length;
  const recovery = { artifactRoot: f.targetRoot, journalRoot: join(f.targetRoot, 'journal'), recoverCapture: host.recoverCapture };
  const options = { controller: current.controller, requirement: current.requirement, validation: current.validation, historicalDependencies: historicalStages,
    tasks: [prepared], sessionRoot: join(f.targetRoot, 'sessions'), availableArtifacts: host.availableArtifacts,
    roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify,
    reviewImages: host.reviewImages, recovery, reviewProtocolCorrections: 1 as const, authorProtocolCorrections: 1 as const };
  const result = await host.withPreparation(() => executeTaskDag(options));
  assert.deepEqual(result.map(task => task.state), ['failed']); // Synthetic compiler IO deliberately cannot establish gameplay.
  assert.deepEqual(f.calls.slice(callsBefore).map(item => item.kind), ['coding', 'build']);
  const after = await current.controller.read();
  assert.deepEqual(after.tasks.filter(task => f.result.some(old => old.taskId === task.taskId)), oldTasks);
  assert.deepEqual(after.ledger.allocationClosures, before.ledger.allocationClosures);
  assert.deepEqual(after.ledger.entries.slice(0, before.ledger.entries.length), before.ledger.entries);
  assert.ok(after.ledger.entries.slice(before.ledger.entries.length).every(entry => entry.taskId === prepared.task.taskId));
  assert.deepEqual(await readFile(join(f.root, `journal/task-${f.result[0].taskId}/origin.json`)), oldReceipt);
  const host2 = await runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages, resume: true }); t.after(() => host2.closePreparation());
  await host2.bindPreparedTasks([prepared]); const callsAfter = f.calls.length;
  const resumed = await host2.withPreparation(() => resumeTaskDag({ ...options, roleFactory: host2.roleFactory, preAuthor: host2.preAuthor,
    recovery: { ...recovery, recoverCapture: host2.recoverCapture } }));
  assert.deepEqual(resumed.reusedTaskIds, f.result.map(task => task.taskId)); assert.equal(f.calls.length, callsAfter);
  assert.equal((await current.controller.read()).validation!.cases.at(-1)!.deadlineAt, current.window.deadlineAt);
});

test('operator-covered manifest hashes actual changed bytes on the current scope gate', async t => {
  const f = await passedStageFixture(t), current = await successorFixture(t, f);
  await requireValidationScope(current.controller, current.requirement, current.validation);
  await f.changeManifest({ ...f.manifest, preparedSha256: 'c'.repeat(64) });
  await assert.rejects(requireValidationScope(current.controller, current.requirement, current.validation), /manifest.*bytes|manifest.*changed/i);
});

test('resigned source/task/evidence identities and incomplete or duplicate closure never import', async t => {
  const a = await api(), f = await passedStageFixture(t);
  const changes = [
    (value: any) => { value.originalRoot = join(f.root, '..', 'foreign-root'); },
    (value: any) => { value.caseId = 'cos20-other-source'; },
    (value: any) => { value.frozenCaseInputHash = 'f'.repeat(64); },
    (value: any) => { value.reviewedPlatformSha = 'f'.repeat(40); },
    (value: any) => { value.stages[0].task.taskId = 'foreign-task'; },
    (value: any) => { value.stages[0].task.review.contextId = value.stages[0].task.context.contextId; },
    (value: any) => { value.stages[1].task.evidence[0].outcome = 'failed'; },
    (value: any) => { value.stages[1].task.inputs.pop(); },
    (value: any) => { value.captures.pop(); },
    (value: any) => { value.captures[6] = value.captures[0]; },
    (value: any) => { value.extraSelector = 'untrusted'; },
  ];
  for (const change of changes) {
    const value = structuredClone(f.manifest); change(value); await f.resignManifest(value);
    await assert.rejects(a.createHistoricalPassedStages(f.input).import(new AbortController().signal));
    assert.deepEqual(await readdir(f.targetRoot), []);
  }
});

test('reserved, unknown and stopped current authority refuse before inherited import or author effects', async t => {
  const a = await api(), runtime = await import('../../src/runtime/adapters/transfer/runtime-host.ts');
  const f = await passedStageFixture(t), current = await successorFixture(t, f), historicalStages = a.createHistoricalPassedStages(f.input);
  const before = await readdir(f.targetRoot), calls = f.calls.length;
  await current.controller.reserve({ requestId: 'synthetic-unresolved', taskId: current.window.quote.declaration.grants.planning.taskId,
    provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 20_000,
    validation: { caseId: current.window.caseId, windowId: current.window.windowId, purpose: 'planning', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 1, hasImages: false } });
  await assert.rejects(runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages }), /reconcil|charges/i);
  await current.controller.admit('synthetic-unresolved'); await current.controller.markUnknown('synthetic-unresolved', [{ artifactId: 'synthetic-unresolved', version: 'v1', location: 'synthetic-unresolved.json' }]);
  await assert.rejects(runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages }), /reconcil|charges/i);
  await current.controller.stop('Synthetic stopped authority'); await assert.rejects(runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages }), /stop|cancel/i);
  assert.deepEqual(await readdir(f.targetRoot), before); assert.equal(f.calls.length, calls);
});

test('one current CodeDefect repair retains inherited IDs and promotes only exact v2 with fresh coding approval', async t => {
  const a = await api(), runtime = await import('../../src/runtime/adapters/transfer/runtime-host.ts');
  const f = await passedStageFixture(t), current = await successorFixture(t, f), historicalStages = a.createHistoricalPassedStages(f.input);
  const io = { async build(project: string, taskId: string) {
    if (taskId === current.window.quote.declaration.grants.coding.taskId) return { passed: false, work: project, diagnostics: 'Synthetic generated source defect',
      results: [{ code: 1, stdout: 'src/main.ts(1,1): error TS2322: synthetic fixture', stderr: '' }] };
    await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), '<p>Synthetic host transport</p>', 'utf8');
    return { passed: true, work: project, diagnostics: 'Synthetic host build transport', results: [{ code: 0, stdout: '', stderr: '' }, { code: 0, stdout: '', stderr: '' }] };
  }, async play() { throw new Error('Persistent adapter required'); }, playPersistent: (series: any, options: any) => syntheticReports(series, options) };
  const host = await runtime.createTransferReusedConsumerHost({ ...current.input, io, historicalStages }); f.onCleanup(() => host.closePreparation());
  const prepared = codingTask(f, current, host); await host.bindPreparedTasks([prepared]);
  const recovery = { artifactRoot: f.targetRoot, journalRoot: join(f.targetRoot, 'journal'), recoverCapture: host.recoverCapture };
  const options = { controller: current.controller, requirement: current.requirement, validation: current.validation, historicalDependencies: historicalStages,
    tasks: [prepared], sessionRoot: join(f.targetRoot, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
    recovery, reviewProtocolCorrections: 1 as const, authorProtocolCorrections: 1 as const };
  const initial = await executeTaskDag(options); assert.equal(initial[0].state, 'failed');
  const feedback = JSON.parse(await readFile(join(initial[0].attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.ok(feedback.issues.every((issue: any) => issue.classification === 'code_defect'));
  const source = { ...prepared, task: initial[0] };
  const repair = await host.prepareValidationRepair(source, feedback, recovery); await host.bindPreparedTasks([repair]);
  assert.deepEqual(repair.task.dependsOn.map(dep => dep.taskId), f.result.map(task => task.taskId));
  await assert.rejects(host.prepareValidationRepair(source, feedback, recovery), /claimed|already/i);
  const result = await resumeTaskDag({ ...options, tasks: [repair] });
  if (result.tasks[0]?.state !== 'passed') {
    const failed = result.tasks[0];
    const details = failed?.attempts[0] ? JSON.parse(await readFile(join(failed.attempts[0].sessionRef, 'failure.json'), 'utf8')) : result.blocked;
    t.diagnostic(JSON.stringify(details?.issues?.map((issue: any) => ({ checkId: issue.checkId, actual: issue.actual })) ?? details));
  }
  assert.equal(result.tasks[0].state, 'passed');
  const finished: any = await host.finish(result.tasks); assert.deepEqual(finished.gaps, []);
  assert.equal(finished.acceptedCandidate.candidateRef.version, 'v2');
  assert.deepEqual(finished.inheritedStages.map((stage: any) => stage.taskId), f.result.map(task => task.taskId));
  const registry = await createArtifactRegistry({ workspaceRoot: f.targetRoot, registryRoot: 'registry' });
  const candidate = await registry.getCandidate(finished.acceptedCandidate.candidateRef);
  assert.equal(candidate.inputs.filter(ref => ref.artifactId.endsWith('generic-template')).length, 1);
  assert.ok(candidate.inputs.some(ref => ref.artifactId === f.result[0].artifacts[0].artifactId));
  assert.ok(!candidate.inputs.some(ref => f.result[0].artifacts.slice(2).some(old => old.artifactId === ref.artifactId)));
  assert.equal(candidate.files.filter(file => file.destination === '_cosmos/transfer-plan.json').length, 1);
  const snapshot = await current.controller.read(); assert.equal(snapshot.validation!.cases.at(-1)!.repair!.taskId, repair.task.taskId);
  assert.ok(snapshot.ledger.entries.filter(entry => !f.result.some(old => old.taskId === entry.taskId)).every(entry => ['legacy', prepared.task.taskId, repair.task.taskId].includes(entry.taskId)));
  assert.equal(f.calls.filter(call => call.kind === 'design').length, 1); assert.equal(f.calls.filter(call => call.kind === 'art').length, 1);
  assert.equal(f.calls.filter(call => call.kind === 'coding').length, 2); assert.equal(f.calls.filter(call => call.kind === 'reviewer').length, 3);
});

test('production historical consumer exposes an async fixed binding seam', async () => {
  const host: any = await import('../../src/runtime/adapters/transfer/runtime-host.ts');
  assert.equal(typeof host.createTransferReusedConsumerHost, 'function', 'coding-only inherited consumer API is missing');
  await assert.rejects(host.createTransferReusedConsumerHost({}), /historical.*binding/i);
});

test('changed authorized current input is refused before importing old captures', async t => {
  const a = await api(), runtime = await import('../../src/runtime/adapters/transfer/runtime-host.ts');
  const f = await passedStageFixture(t), current = await successorFixture(t, f, true), historicalStages = a.createHistoricalPassedStages(f.input);
  const before = await readdir(f.targetRoot), snapshot = await current.controller.read();
  await assert.rejects(runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages }), /accepted historical input|requirements/i);
  assert.deepEqual(await readdir(f.targetRoot), before); assert.deepEqual(await current.controller.read(), snapshot);
});

test('current inherited coding capture rejects changed kind and exact author/session provenance', async t => {
  const a = await api(), runtime = await import('../../src/runtime/adapters/transfer/runtime-host.ts');
  const f = await passedStageFixture(t), current = await successorFixture(t, f), historicalStages = a.createHistoricalPassedStages(f.input);
  let host = await runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages }); f.onCleanup(() => host.closePreparation());
  const prepared = codingTask(f, current, host); await host.bindPreparedTasks([prepared]);
  const result = await executeTaskDag({ controller: current.controller, requirement: current.requirement, validation: current.validation,
    historicalDependencies: historicalStages, tasks: [prepared], sessionRoot: join(f.targetRoot, 'sessions'), availableArtifacts: host.availableArtifacts,
    roleFactory: host.roleFactory, preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages,
    recovery: { artifactRoot: f.targetRoot, journalRoot: join(f.targetRoot, 'journal'), recoverCapture: host.recoverCapture },
    reviewProtocolCorrections: 1, authorProtocolCorrections: 1 });
  assert.equal(result[0].state, 'failed'); assert.equal(result[0].artifacts.length, 1);
  const candidate = result[0].artifacts[0], sourcePath = join(f.targetRoot, `registry/captures/${current.window.caseId}-game-source/v1/capture.json`);
  const original = await readFile(sourcePath), capture = JSON.parse(original.toString('utf8'));
  const snapshot = await current.controller.read(), calls = f.calls.length;
  await host.bindPreparedCandidate(candidate); // Correct current source metadata remains usable.
  for (const [index, change] of [
    (value: any) => { value.metadata.kind = 'data'; },
    (value: any) => { value.metadata.provenance.generator = 'Foreign author'; },
    (value: any) => { value.metadata.provenance.sourceRefs[0] = 'foreign-session'; },
  ].entries()) {
    if (index) {
      host = await runtime.createTransferReusedConsumerHost({ ...current.input, historicalStages, resume: true });
      await host.bindPreparedTasks([prepared]); await host.bindPreparedCandidate(candidate);
    }
    const changed = structuredClone(capture); change(changed); await writeFile(sourcePath, JSON.stringify(changed, null, 2) + '\n', 'utf8');
    try { await assert.rejects(host.bindPreparedCandidate(candidate), /provenance|metadata/i); }
    finally { await writeFile(sourcePath, original); await host.closePreparation(); }
  }
  assert.deepEqual(await current.controller.read(), snapshot); assert.equal(f.calls.length, calls);
});
