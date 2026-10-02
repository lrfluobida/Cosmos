import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validationRunFixture } from './validation-run.fixture.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { ArtifactRegistry, createArtifactRegistry } from '../../src/artifacts/index.ts';
import * as entry from '../../probes/e2e/validation-run.ts';

test('actual main preflight preserves snapshot bytes, mtime and roots without opening an owner or preparing a host', async t => {
  assert.equal(typeof entry.preflightValidationRun, 'function'); const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json');
  const before = await readFile(path), stamp = (await stat(path)).mtimeMs, names = await readdir(f.ledgerRoot);
  const result = await entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(result.outcome, 'ready'); assert.equal(result.quote.activationAllowed, false); assert.equal(result.quote.basis.stopReason, null);
  assert.equal(result.quote.basis.committedMicroCny, 1_116_402); assert.equal(result.quote.basis.originalDeadlineAt, '2026-10-01T18:16:16.857Z');
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, stamp); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('credential or host prerequisites fail before receipt, case claim or clock writes', async t => {
  assert.equal(typeof entry.runValidationWithHost, 'function'); const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  let executed = 0;
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { throw new Error('Offline unavailable credential/environment'); }, execute: async () => { executed++; return { outcome: 'failed', gaps: ['Offline fixture only'] }; },
  } }), /prerequisite|credential|environment/i);
  assert.equal(executed, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  assert.deepEqual(await readdir(f.ledgerRoot), ['snapshot.json']); await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('startup failure after exact operator claim consumes the case with zero model requests and a safe preserved report', async t => {
  assert.equal(typeof entry.runValidationWithHost, 'function'); const f = await validationRunFixture(t), before = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  let prepared = 0, executed = 0;
  const result = await entry.runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => { executed++; throw new Error('Offline private exception must not be reported'); },
  } });
  assert.equal(result.outcome, 'failed'); assert.equal('requestsUsed' in result && result.requestsUsed, 0); assert.equal('caseCommittedMicroCny' in result && result.caseCommittedMicroCny, 0); assert.equal(prepared, 1); assert.equal(executed, 1);
  assert.equal(JSON.stringify(result).includes('private exception'), false);
  const state = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8')), window = state.validation.cases[0];
  assert.deepEqual(state.ledger.entries, before.ledger.entries); assert.deepEqual(state.run.humanDecisions, []); assert.equal(state.run.originalDeadlineAt, before.run.originalDeadlineAt);
  const receipt = JSON.parse(await readFile(join(f.ledgerRoot, window.operatorDecision.source.location), 'utf8'));
  assert.equal(receipt.kind, 'operator_validation'); assert.deepEqual(receipt.quote, window.quote); assert.equal(Object.hasOwn(receipt, 'confirmed'), false);
  assert.equal(window.stopReason.code, 'manual'); await assert.rejects(readFile(join(f.ledgerRoot, '.controller.lock')), { code: 'ENOENT' });
  const final = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  await assert.rejects(entry.runValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture only'] }) } }), /claimed|consumed|case|root/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), final);
});

test('source prerequisite state and ancestry are both required without demanding live COS10 completion', async t => {
  const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), path = join(f.repository, 'docs/specs/github-issues.json');
  f.mapping.tasks[0].reviewStatus = 'NOT_READY';
  await writeFile(path, JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', 'Offline missing source review');
  let head = await f.git('rev-parse', 'HEAD');
  await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', head] }), /reviewed|source/i);
  f.mapping.tasks[0].reviewStatus = 'SOURCE_READY'; f.mapping.tasks[0].reviewedCommit = '0'.repeat(40);
  await writeFile(path, JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', 'Offline missing reviewed ancestor'); head = await f.git('rev-parse', 'HEAD');
  await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', head] }), /reviewed|source|integrated/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), ['snapshot.json']);
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
  if (boundary === 'stopped') assert.equal(state.validation.cases[0].stopReason.reason, 'Offline stop before host completion');
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
  if (stopDuringRead === true) { assert.ok('gaps' in result && result.gaps.length); assert.equal(state.validation.cases[0].stopReason.reason, 'Offline coordinator stopped during accepted-candidate read'); }
  else assert.equal(state.validation.cases[0].stopReason.reason, 'This one-shot validation case finished; its identity remains consumed.');
  if (stopDuringRead === 'split-timestamps') assert.ok(Date.parse(state.validation.cases[0].stopReason.at) < Date.parse(state.events.at(-1).at));
});

test('preflight refuses changed source approvals and an already created case root before writes', async t => {
  assert.equal(typeof entry.preflightValidationRun, 'function'); const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  await mkdir(f.caseRoot, { recursive: true }); await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /case|root|consumed/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  await writeFile(join(f.repository, 'docs/specs/github-issues.json'), JSON.stringify({ tasks: [] }), 'utf8');
  await assert.rejects(entry.preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }));
});
