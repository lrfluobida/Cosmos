import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validationRunFixture } from './validation-run.fixture.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { ArtifactRegistry, createArtifactRegistry } from '../../src/artifacts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import * as entry from '../../probes/e2e/validation-run.ts';

test('actual main preflight preserves snapshot bytes, mtime and roots without opening an owner or preparing a host', async t => {
  assert.equal(typeof entry.preflightValidationRun, 'function'); const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json');
  const before = await readFile(path), stamp = (await stat(path)).mtimeMs, names = await readdir(f.ledgerRoot);
  const result = await entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(result.outcome, 'ready'); assert.equal(result.quote.activationAllowed, false); assert.equal(result.quote.basis.stopReason?.code, 'deadline');
  assert.equal(result.quote.basis.allocatedMicroCny, 85_522_666); assert.equal(result.quote.declaration.caseId, 'cos20-native-validation-4');
  assert.equal(result.quote.declaration.formatVersion, 'validation-declaration-2'); assert.equal(result.quote.declaration.limits.maxRequests, 80);
  assert.equal(result.quote.basis.originalStartedAt, f.originalSnapshot.run.originalStartedAt);
  assert.equal(result.quote.basis.committedMicroCny, 2_043_028); assert.equal(result.quote.basis.originalDeadlineAt, '2026-10-01T18:16:16.857Z');
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, stamp); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('credential or host prerequisites fail before receipt, case claim or clock writes', async t => {
  assert.equal(typeof entry.runValidationWithHost, 'function'); const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), names = await readdir(f.ledgerRoot);
  let executed = 0;
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { throw new Error('Offline unavailable credential/environment'); }, execute: async () => { executed++; return { outcome: 'failed', gaps: ['Offline fixture only'] }; },
  } }), /prerequisite|credential|environment/i);
  assert.equal(executed, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  assert.deepEqual(await readdir(f.ledgerRoot), names); await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('startup failure after exact operator claim consumes the case with zero model requests and a safe preserved report', async t => {
  assert.equal(typeof entry.runValidationWithHost, 'function'); const f = await validationRunFixture(t), before = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.ok(f.caseOne); assert.ok(f.caseTwo); assert.ok(f.caseThree);
  const originalOperatorBytes = await readFile(join(f.ledgerRoot, f.caseOne.decision.source.location)), secondOperatorBytes = await readFile(join(f.ledgerRoot, f.caseTwo.decision.source.location));
  let prepared = 0, executed = 0;
  const result = await entry.runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => { executed++; throw new Error('Offline private exception must not be reported'); },
  } });
  assert.equal(result.outcome, 'failed'); assert.equal('requestsUsed' in result && result.requestsUsed, 0); assert.equal('caseCommittedMicroCny' in result && result.caseCommittedMicroCny, 0); assert.equal(prepared, 1); assert.equal(executed, 1);
  assert.equal(JSON.stringify(result).includes('private exception'), false);
  const state = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8')), window = state.validation.cases.find((item: any) => item.caseId === VALIDATION_CASE.caseId);
  assert.deepEqual(state.ledger.entries, before.ledger.entries); assert.deepEqual(state.run.humanDecisions, []); assert.equal(state.run.originalDeadlineAt, before.run.originalDeadlineAt);
  const receipt = JSON.parse(await readFile(join(f.ledgerRoot, window.operatorDecision.source.location), 'utf8'));
  assert.equal(receipt.kind, 'operator_validation'); assert.deepEqual(receipt.quote, window.quote); assert.equal(Object.hasOwn(receipt, 'confirmed'), false);
  assert.equal(window.stopReason.code, 'manual'); await assert.rejects(readFile(join(f.ledgerRoot, '.controller.lock')), { code: 'ENOENT' });
  assert.ok(f.caseOne); assert.equal(state.validation.currentCaseId, window.caseId); assert.equal(state.validation.cases.length, 4);
  for (const prior of [f.caseOne, f.caseTwo, f.caseThree]) {
    assert.notEqual(window.windowId, prior.window.windowId); assert.notEqual(window.startedAt, prior.window.startedAt);
    assert.equal(prior.declaration.formatVersion, prior === f.caseThree ? 'validation-declaration-2' : 'validation-declaration-1'); assert.equal(prior.declaration.limits.maxRequests, prior === f.caseThree ? 80 : 40);
  }
  assert.equal(Date.parse(window.deadlineAt) - Date.parse(window.startedAt), VALIDATION_CASE.limits.durationMs);
  assert.notEqual(window.operatorDecision.decisionId, f.caseOne.decision.decisionId);
  assert.deepEqual(state.validation.cases.slice(0, 3), before.validation.cases); assert.deepEqual(state.run, { ...before.run,
    taskIds: [...before.run.taskIds, ...Object.values(VALIDATION_CASE.grants).map(grant => grant.taskId)] });
  assert.deepEqual(state.stopReason, before.stopReason); assert.deepEqual(state.requests, before.requests); assert.deepEqual(state.tasks, before.tasks);
  assert.deepEqual(state.events.slice(0, before.events.length), before.events);
  assert.deepEqual(state.ledger.allocations, [...before.ledger.allocations, ...Object.values(VALIDATION_CASE.grants)]);
  assert.deepEqual(await RunController.claimValidationCase(f.caseOne), before.validation.cases[0], 'Exact case 1 decision stays idempotent and cannot reopen it');
  assert.deepEqual(await RunController.claimValidationCase(f.caseTwo), before.validation.cases[1], 'Exact case 2 decision stays idempotent and cannot reopen it');
  const final = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  await assert.rejects(prepareValidationCase({ ...f.caseOne, declaration: f.caseOne.declaration }), /claimed|reset|rename/i);
  const claim = { ...f.caseOne, now: Date.now, quote: window.quote, decision: { ...window.operatorDecision } }; delete (claim.decision as any).sourceSha256;
  assert.deepEqual(await RunController.claimValidationCase(claim), window, 'Exact case 4 decision stays idempotent after zero-call failure');
  assert.deepEqual(await readFile(join(f.ledgerRoot, f.caseOne.decision.source.location)), originalOperatorBytes);
  assert.deepEqual(await readFile(join(f.ledgerRoot, f.caseTwo.decision.source.location)), secondOperatorBytes);
  const changedDecision = { ...f.caseOne.decision, decisionId: 'offline-case-one-restart', source: { ...f.caseOne.decision.source, location: 'offline-rejected-restart.json' } };
  await writeFile(join(f.ledgerRoot, changedDecision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: changedDecision.kind,
    decisionId: changedDecision.decisionId, actorId: changedDecision.actorId, decidedAt: changedDecision.decidedAt, sourceRefs: changedDecision.sourceRefs, quote: f.caseOne.quote }), 'utf8');
  await assert.rejects(RunController.claimValidationCase({ ...f.caseOne, decision: changedDecision }), /claimed|reset|rename/i);
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture only'] }) } }), /claimed|consumed|case|root/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), final);
});

for (const caseOne of ['absent', 'unstopped'] as const) test(`case 4 requires original case 1 history and stopped case 3 profile: ${caseOne}`, async t => {
  const f = await validationRunFixture(t, { caseOne }), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), names = await readdir(f.ledgerRoot);
  if (caseOne === 'absent') { assert.ok(f.caseThree); assert.equal(JSON.parse(before.toString('utf8')).validation.currentCaseId, f.caseThree.window.caseId); }
  let prepared = 0;
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 1|case 2.*stopped|stopped.*case 2/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const caseTwo of ['absent', 'unstopped'] as const) test(`case 4 requires original case 2 explicitly stopped: ${caseTwo}`, async t => {
  const f = await validationRunFixture(t, { caseTwo }), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 2.*stopped|stopped.*case 2/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const exposure of ['reserved', 'unknown'] as const) test(`case 4 refuses ${exposure} historical charges before host preparation or new writes`, async t => {
  const f = await validationRunFixture(t, { exposure }), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /unknown|reserved|reconciliation/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const prerequisite of ['COS-20', 'COS-21']) for (const fault of ['missing', 'duplicate', 'not-ready', 'closed-not-ready', 'wrong-marker', 'not-integrated', 'reviewed-not-ancestor', 'merge-not-ancestor'] as const) test(`${prerequisite} ${fault} refuses case 4 before host preparation or writes`, async t => {
  const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), names = await readdir(f.ledgerRoot);
  const item = f.mapping.tasks.find(item => item.taskId === prerequisite)!;
  if (fault === 'missing') f.mapping.tasks = f.mapping.tasks.filter(task => task !== item);
  else if (fault === 'duplicate') f.mapping.tasks.push({ ...item });
  else if (fault === 'not-ready' || fault === 'closed-not-ready') { item.reviewStatus = 'NOT_READY'; if (fault === 'closed-not-ready') item.state = 'closed'; }
  else if (fault === 'wrong-marker') item.reviewStatus = 'SOURCE_READY';
  else if (fault === 'not-integrated') item.integrationStatus = 'diagnosis-in-progress';
  else {
    await f.git('switch', '-c', 'offline-unmerged-source'); await f.git('commit', '--allow-empty', '-m', 'Offline unmerged Windows source');
    const unmerged = await f.git('rev-parse', 'HEAD'); await f.git('switch', 'main');
    item[fault === 'reviewed-not-ancestor' ? 'reviewedCommit' : 'mergeCommit'] = unmerged;
  }
  await writeFile(join(f.repository, 'docs/specs/github-issues.json'), JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', `Offline COS21 ${fault}`);
  const head = await f.git('rev-parse', 'HEAD'); let prepared = 0;
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: ['--validation-case', head, f.args[2]], host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /COS-20|COS-21|reviewed|integrated/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('COS21 source-integrated readiness also permits a free quote without live COS10 or COS20 closure', async t => {
  const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  f.mapping.tasks.find(item => item.taskId === 'COS-21')!.integrationStatus = 'source-integrated';
  await writeFile(join(f.repository, 'docs/specs/github-issues.json'), JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', 'Offline Windows source integrated');
  const head = await f.git('rev-parse', 'HEAD'), result = await entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', head] });
  assert.equal(result.outcome, 'ready'); assert.equal(result.paidRequests, 0); assert.ok(result.sourceApprovals.some(item => item.taskId === 'COS-21'));
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
});

test('source prerequisite state and ancestry are both required without demanding live COS10 completion', async t => {
  const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), names = await readdir(f.ledgerRoot), path = join(f.repository, 'docs/specs/github-issues.json');
  f.mapping.tasks[0].reviewStatus = 'NOT_READY';
  await writeFile(path, JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', 'Offline missing source review');
  let head = await f.git('rev-parse', 'HEAD');
  await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', head] }), /reviewed|source/i);
  f.mapping.tasks[0].reviewStatus = 'SOURCE_READY'; f.mapping.tasks[0].reviewedCommit = '0'.repeat(40);
  await writeFile(path, JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', 'Offline missing reviewed ancestor'); head = await f.git('rev-parse', 'HEAD');
  await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', head] }), /reviewed|source|integrated/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
});

for (const boundary of ['stopped', 'expired', 'unknown', 'missing-accepted'] as const) test(`host passed cannot override ${boundary} facts at the entry finish boundary`, async t => {
  const f = await validationRunFixture(t);
  const result = await entry.runValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    if (boundary === 'stopped') await input.controller.stop('Offline stop before host completion');
    if (boundary === 'expired') t.mock.method(Date, 'now', () => Date.parse(input.window.deadlineAt));
    if (boundary === 'unknown') {
      await input.controller.reserve({ requestId: 'offline-unknown', taskId: VALIDATION_CASE.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 8,
        validation: { caseId: input.window.caseId, windowId: input.window.windowId, purpose: 'planning', modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
      await input.controller.admit('offline-unknown'); await input.controller.markUnknown('offline-unknown', [{ artifactId: 'offline-unknown', version: 'v1', location: 'offline.json' }]);
    }
    return { outcome: 'passed', gaps: [], ...(boundary === 'missing-accepted' ? {} : { accepted: { artifactId: 'offline-candidate', version: 'v1', location: 'offline-unverified-candidate' } }) };
  } } });
  assert.equal(result.outcome, 'failed'); assert.ok('gaps' in result && result.gaps.length > 0);
  const state = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  if (boundary === 'stopped') assert.equal(state.validation.cases.at(-1).stopReason.reason, 'Offline stop before host completion');
  if (boundary === 'unknown') { assert.equal(state.ledger.entries.at(-1).unknown, true); assert.equal(state.ledger.entries.at(-1).reservedMicroCny, 8); }
});

for (const stopDuringRead of [true, false, 'split-timestamps'] as const) test(`finish authenticates a real promoted fixture across its awaited read; concurrent stop=${stopDuringRead}`, async t => {
  const f = await validationRunFixture(t);
  const result = await entry.runValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    const registry = await createArtifactRegistry({ workspaceRoot: input.root, registryRoot: 'registry' }), captured = registry.artifactRef('offline-source', 'v1'), candidate = registry.candidateRef('offline-candidate', 'v1');
    await mkdir(join(input.root, 'offline')); await writeFile(join(input.root, 'offline/fixture.txt'), 'generatedByCosmos:false; no playable game', 'utf8');
    await registry.registerCapture({ taskId: 'offline', artifactRef: captured, sourceRoot: 'offline', files: [{ source: 'fixture.txt', destination: 'fixture.txt' }], ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [],
      metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'Offline finish-boundary fixture only', sourceRefs: ['offline-fixture'] } } });
    await registry.stageCandidate({ taskId: 'offline', authorId: 'offline-author', contextId: 'offline-author-context', candidateRef: candidate, targetRoot: candidate.location,
      inputs: [captured], expectedDeps: [captured], ownership: { writePaths: ['.'], readOnlyPaths: [] } });
    const proof = await registry.verifyCandidate(candidate, { build: async () => ({ passed: true, evidenceIds: ['offline-build'] }), acceptance: async () => ({ passed: true, evidenceIds: ['offline-check'] }) });
    await registry.promoteCandidate(candidate, { evidence: proof, review: { candidateRef: candidate, attemptId: proof.attemptId, reviewerId: 'offline-reviewer', contextId: 'offline-review-context', verdict: 'approved', evidenceIds: ['offline-build', 'offline-check'] } });
    if (stopDuringRead === 'split-timestamps') {
      const runtime = input.controller as any, event = runtime.event.bind(runtime);
      t.mock.method(runtime, 'event', (...args: any[]) => {
        if (args[1] === 'validation_case_stopped') { const until = Date.now() + 3; while (Date.now() < until) { /* Force a real clock tick between the two existing at() calls. */ } }
        return event(...args);
      });
    }
    if (stopDuringRead === true) {
      const current = ArtifactRegistry.prototype.current; let stopped = false;
      t.mock.method(ArtifactRegistry.prototype, 'current', async function (this: ArtifactRegistry) {
        const value = await current.call(this);
        if (!stopped) { stopped = true; await input.controller.stop('Offline coordinator stopped during accepted-candidate read'); }
        return value;
      });
    }
    return { outcome: 'passed', accepted: candidate, gaps: [] };
  } } });
  assert.equal(result.outcome, stopDuringRead === true ? 'failed' : 'passed');
  const state = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  if (stopDuringRead === true) { assert.ok('gaps' in result && result.gaps.length); assert.equal(state.validation.cases.at(-1).stopReason.reason, 'Offline coordinator stopped during accepted-candidate read'); }
  else assert.equal(state.validation.cases.at(-1).stopReason.reason, 'This one-shot validation case finished; its identity remains consumed.');
  if (stopDuringRead === 'split-timestamps') assert.ok(Date.parse(state.validation.cases.at(-1).stopReason.at) < Date.parse(state.events.at(-1).at));
});

test('preflight refuses changed source approvals and an already created case root before writes', async t => {
  assert.equal(typeof entry.preflightValidationRun, 'function'); const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  await mkdir(f.caseRoot, { recursive: true }); await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /case|root|consumed/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  await writeFile(join(f.repository, 'docs/specs/github-issues.json'), JSON.stringify({ tasks: [] }), 'utf8');
  await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }));
});
