import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rename, rmdir, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { validationRunFixture } from './validation-run.fixture.ts';
import { preflightValidationRun, runValidationWithHost } from '../../probes/e2e/validation-run.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { validationInputHash } from '../../src/runtime/validation-validation.ts';

test('explicit fresh-core fixture has no historical cases, closures or additional charges', async t => {
  const f = await validationRunFixture(t, { caseOne: 'absent', caseTwo: 'absent' }), state = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(f.caseOne, null); assert.equal(f.caseTwo, null); assert.equal(f.caseThree, null); assert.equal(f.caseFour, null); assert.equal(f.caseFive, null); assert.equal(f.caseSix, null); assert.equal(f.caseSeven, null);
  assert.equal(state.validation, undefined); assert.equal(state.allocationClosureDecisions, undefined);
  assert.deepEqual(state.ledger.allocations, [{ taskId: 'prior', amountMicroCny: 84_596_040 }]);
  assert.equal(state.ledger.entries.length, 1); assert.equal(state.ledger.entries[0].settledMicroCny, 1_116_402);
  await assert.rejects(readdir(join(f.repository, '.cosmos/e2e')), { code: 'ENOENT' });
});

test('COS22 approved source with the recorded failed author handoff permits only a free side-effect-free quote', async t => {
  const f = await validationRunFixture(t, { cos22RunFailed: true }), path = join(f.ledgerRoot, 'snapshot.json');
  const before = await readFile(path), stamp = (await stat(path)).mtimeMs, names = await readdir(f.ledgerRoot);
  const item = f.mapping.tasks.find(item => item.taskId === 'COS-22')!;
  assert.equal(item.state, 'open'); assert.equal(item.reviewStatus, 'VERSIONED_CASE_THREE_SOURCE_READY');
  assert.equal(item.integrationStatus, 'actual-validation-failed-author-handoff');
  let prepared = 0, executed = 0;
  try {
    const result = await runValidationWithHost({ repository: f.repository, args: ['--validation-preflight', f.head], host: {
      prepare: async () => { prepared++; }, execute: async () => { executed++; return { outcome: 'failed', gaps: ['Offline fixture must not execute'] }; },
    } });
    assert.equal(result.outcome, 'ready'); assert.ok('paidRequests' in result && result.paidRequests === 0);
  } finally {
    assert.equal(prepared, 0); assert.equal(executed, 0); assert.deepEqual(await readFile(path), before);
    assert.equal((await stat(path)).mtimeMs, stamp); assert.deepEqual(await readdir(f.ledgerRoot), names);
    await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
  }
});

test('COS22 failed-run source still requires its precise marker and each SHA and leaves other source gates unchanged', async t => {
  const f = await validationRunFixture(t, { cos22RunFailed: true }), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  const mappingPath = join(f.repository, 'docs/specs/github-issues.json'), approved = structuredClone(f.mapping);
  for (const fault of ['reviewStatus', 'reviewedCommit', 'mergeCommit', 'unknown-cos22-result', 'cos23-failed-result', 'cos25-failed-result', 'cos27-failed-result'] as const) {
    f.mapping = structuredClone(approved);
    const item = f.mapping.tasks.find(item => item.taskId === (fault === 'cos23-failed-result' ? 'COS-23' : fault === 'cos25-failed-result' ? 'COS-25' : fault === 'cos27-failed-result' ? 'COS-27' : 'COS-22'))!;
    if (fault === 'unknown-cos22-result') item.integrationStatus = 'unknown-validation-result';
    else if (fault.endsWith('-failed-result')) item.integrationStatus = 'actual-validation-failed-author-handoff';
    else delete (item as any)[fault];
    await writeFile(mappingPath, JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', `Offline source prerequisite ${fault}`);
    const head = await f.git('rev-parse', 'HEAD'); let prepared = 0, executed = 0;
    await assert.rejects(runValidationWithHost({ repository: f.repository, args: ['--validation-case', head, f.args[2]], host: {
      prepare: async () => { prepared++; }, execute: async () => { executed++; return { outcome: 'failed', gaps: ['Offline fixture must not execute'] }; },
    } }), /COS-22|COS-23|COS-25|COS-27|reviewed|integrated|source/i);
    assert.equal(prepared, 0); assert.equal(executed, 0); assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
    await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
  }
});

for (const caseThree of ['absent', 'unstopped'] as const) test(`case eight requires explicitly stopped historical case three: ${caseThree}`, async t => {
  const f = await validationRunFixture(t, { caseThree, closure: 'none' });
  const path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 3|case three/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case eight refuses missing or junction historical roots, shared owners, repeated root/marker and insufficient free capacity', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(path);
  const oldRoot = join(f.repository, '.cosmos/e2e/cos20-native-validation-7'), parked = `${oldRoot}-offline-parked`;
  await rename(oldRoot, parked);
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /root|case|ENOENT/i);
  await symlink(parked, oldRoot, 'junction');
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /symbolic|link|safe|root/i);
  await unlink(oldRoot); await rename(parked, oldRoot);
  for (const target of [join(f.ledgerRoot, '.controller.lock'), join(f.ledgerRoot, 'registry/.commit.lock'), f.caseRoot]) {
    await mkdir(target, { recursive: true });
    await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /owner|writer|already|restart/i);
    await rmdir(target);
  }
  const marker = join(f.ledgerRoot, 'cos20-native-validation-8.json'); await writeFile(marker, 'offline consumed marker', 'utf8');
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /marker|already|restart/i);
  await import('node:fs/promises').then(fs => fs.unlink(marker));
  const state = JSON.parse(original.toString('utf8'));
  state.ledger.allocations.push({ taskId: 'offline-extra-capacity', amountMicroCny: 63_000_000 }); state.run.taskIds.push('offline-extra-capacity');
  await writeFile(path, JSON.stringify(state), 'utf8'); const before = await readFile(path); let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /unallocated|insufficient|budget/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); await writeFile(path, original);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case eight free preflight preserves all seven histories and accepts ancestral applied closure sources', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json');
  const before = await readFile(path), state = JSON.parse(before.toString('utf8')), stamp = (await stat(path)).mtimeMs, names = await readdir(f.ledgerRoot);
  await f.git('commit', '--allow-empty', '-m', 'Offline later reviewed entry source'); const head = await f.git('rev-parse', 'HEAD');
  const result = await preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', head] });
  assert.equal(result.quote.declaration.caseId, 'cos20-native-validation-8'); assert.equal(result.quote.identity.reviewedPlatformSha, head);
  assert.equal(result.quote.identity.frozenCaseInputHash, validationInputHash(VALIDATION_CASE));
  assert.notEqual(state.allocationClosureDecisions[0].quote.identity.reviewedPlatformSha, head);
  assert.equal(state.ledger.allocationClosures.length, 35); assert.equal(result.quote.basis.allocatedMicroCny, 88_938_669);
  assert.equal(result.quote.basis.committedMicroCny, 5_459_031); assert.equal(result.paidRequests, 0);
  assert.equal(result.sourceApprovals.length, 22);
  assert.equal(state.allocationClosureDecisions.length, 5);
  assert.deepEqual(state.allocationClosureDecisions.map((item: any) => item.quote.cases.length), [3, 1, 1, 1, 1]);
  assert.equal(state.allocationClosureDecisions[1].quote.releasedMicroCny, 20_988_568);
  assert.equal(state.allocationClosureDecisions[2].quote.releasedMicroCny, 20_098_959);
  assert.equal(state.allocationClosureDecisions[3].quote.releasedMicroCny, 19_719_584);
  assert.equal(state.allocationClosureDecisions[4].quote.releasedMicroCny, 19_776_886);
  assert.equal(state.validation.currentCaseId, 'cos20-native-validation-7');
  assert.equal(state.validation.cases[6].startedAt, '2026-10-03T15:47:24.285Z');
  assert.equal(state.validation.cases[6].deadlineAt, '2026-10-03T16:32:24.285Z');
  assert.equal(state.validation.cases[6].stopReason.at, '2026-10-03T15:56:47.389Z');
  const sample = state.ledger.entries.find((item: any) => item.requestId === 'offline-case-seven-sample');
  assert.equal(sample.taskId, 'cos20-native-validation-7-coding'); assert.equal(sample.settledMicroCny, 1_223_114);
  assert.deepEqual(state.validation.cases.map((item: any) => [item.quote.declaration.formatVersion, item.quote.declaration.limits.maxRequests]),
    [['validation-declaration-1', 40], ['validation-declaration-1', 40], ['validation-declaration-2', 80], ['validation-declaration-2', 80], ['validation-declaration-2', 80], ['validation-declaration-2', 80], ['validation-declaration-2', 80]]);
  assert.equal(f.mapping.tasks.find(item => item.taskId === 'COS-25')!.integrationStatus, 'offline-verified-awaiting-live');
  assert.equal(f.mapping.tasks.find(item => item.taskId === 'COS-27')!.integrationStatus, 'offline-verified-awaiting-live');
  assert.equal(f.mapping.tasks.find(item => item.taskId === 'COS-29')!.integrationStatus, 'offline-verified-awaiting-live');
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, stamp); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const closure of ['none', 'first-two', 'first-three', 'first-four', 'first-five', 'first-six'] as const) test(`case eight refuses ${closure} allocation closure before host preparation or writes`, async t => {
  const f = await validationRunFixture(t, { closure }), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /allocation|closure|case 4|case 5|case 6|case 7/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case eight refuses historical receipt drift, closure audit drift and unresolved old root owners', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(path), state = JSON.parse(original.toString('utf8'));
  const old = join(f.ledgerRoot, f.caseSeven!.decision.source.location), closure = join(f.ledgerRoot, state.allocationClosureDecisions[4].operatorDecision.source.location);
  for (const target of [old, closure]) {
    const bytes = await readFile(target); await writeFile(target, Buffer.concat([bytes, Buffer.from('\n')]));
    await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /source|receipt|closure|historical/i);
    await writeFile(target, bytes);
  }
  for (const caseNumber of [1, 2, 3, 4, 5, 6, 7]) for (const lock of ['.controller.lock', 'registry/.commit.lock']) {
    const target = join(f.repository, `.cosmos/e2e/cos20-native-validation-${caseNumber}`, lock);
    await mkdir(target);
    await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /owner|writer|unresolved/i);
    await rmdir(target);
  }
  const drift = structuredClone(state); drift.ledger.allocationClosures[0].releasedMicroCny--;
  await writeFile(path, JSON.stringify(drift), 'utf8');
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /closure|ledger|allocation/i);
  await writeFile(path, original); assert.deepEqual(await readFile(path), original);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const taskId of ['COS-20', 'COS-21', 'COS-22', 'COS-23', 'COS-24', 'COS-25', 'COS-26', 'COS-27', 'COS-28', 'COS-29', 'COS-30', 'COS-31', 'COS-32']) test(`case eight requires ${taskId} precise source marker and both integrated source ancestors`, async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), mappingPath = join(f.repository, 'docs/specs/github-issues.json');
  await f.git('switch', '-c', 'offline-unmerged-source'); await f.git('commit', '--allow-empty', '-m', 'Offline unmerged source');
  const unmerged = await f.git('rev-parse', 'HEAD'); await f.git('switch', 'main');
  const item = f.mapping.tasks.find(item => item.taskId === taskId)!, approved = { ...item };
  for (const fault of ['closed-wrong-marker', 'missing-reviewed', 'missing-merge', 'reviewed-not-ancestor', 'merge-not-ancestor'] as const) {
    Object.assign(item, approved);
    if (fault === 'closed-wrong-marker') { item.state = 'closed'; item.integrationStatus = 'complete'; item.reviewStatus = 'SOURCE_READY'; }
    else if (fault === 'missing-reviewed' || fault === 'missing-merge') delete (item as any)[fault === 'missing-reviewed' ? 'reviewedCommit' : 'mergeCommit'];
    else item[fault === 'reviewed-not-ancestor' ? 'reviewedCommit' : 'mergeCommit'] = unmerged;
    await writeFile(mappingPath, JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', `Offline ${taskId} ${fault}`);
    const head = await f.git('rev-parse', 'HEAD'); let prepared = 0;
    await assert.rejects(runValidationWithHost({ repository: f.repository, args: ['--validation-case', head, f.args[2]], host: {
      prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
    } }), /reviewed|integrated|source/i);
    assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before);
  }
  Object.assign(item, approved);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const caseFour of ['absent', 'unstopped'] as const) test(`case eight requires explicitly stopped historical case four: ${caseFour}`, async t => {
  const f = await validationRunFixture(t, { caseFour }), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 4|case four/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const caseFive of ['absent', 'unstopped'] as const) test(`case eight requires explicitly stopped historical case five: ${caseFive}`, async t => {
  const f = await validationRunFixture(t, { caseFive }), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 5|case five/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const caseSix of ['absent', 'unstopped'] as const) test(`case eight requires explicitly stopped historical case six: ${caseSix}`, async t => {
  const f = await validationRunFixture(t, { caseSix }), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 6|case six/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const caseSeven of ['absent', 'unstopped'] as const) test(`case eight requires explicitly stopped current case seven: ${caseSeven}`, async t => {
  const f = await validationRunFixture(t, { caseSeven }), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 7|case seven/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case eight refuses a stopped seven-case history whose current identity is still case six', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), state = JSON.parse(await readFile(path, 'utf8'));
  state.validation.currentCaseId = 'cos20-native-validation-6'; await writeFile(path, JSON.stringify(state), 'utf8');
  const before = await readFile(path), names = await readdir(f.ledgerRoot);
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /case 7|current/i);
  assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case eight refuses authentic historical operator quotes from an unmerged source', async t => {
  const f = await validationRunFixture(t, { historicalSourceUnmerged: true }), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /source|integrated|ancestor/i);
  assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case eight refuses the seventh-case closure source outside frozen main ancestry even with matching audit and receipt hashes', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), state = JSON.parse(await readFile(path, 'utf8'));
  await f.git('switch', '-c', 'offline-unmerged-closure-source'); await f.git('commit', '--allow-empty', '-m', 'Offline unmerged closure source');
  const unmerged = await f.git('rev-parse', 'HEAD'); await f.git('switch', 'main');
  const receipt = state.allocationClosureDecisions[4], quote = receipt.quote, hash = (value: string) => createHash('sha256').update(value).digest('hex');
  quote.identity.reviewedPlatformSha = unmerged; const { quoteId, ...payload } = quote; quote.quoteId = `vacq1-${hash(JSON.stringify(payload))}`;
  const decision = receipt.operatorDecision, source = JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
    decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote });
  decision.sourceSha256 = hash(source); await writeFile(join(f.ledgerRoot, decision.source.location), source, 'utf8');
  state.events.find((event: any) => event.type === 'validation_allocation_closed' && JSON.parse(event.reason).decisionId === decision.decisionId).reason = JSON.stringify({ decisionId: decision.decisionId, quoteId: quote.quoteId, releasedMicroCny: quote.releasedMicroCny });
  await writeFile(path, JSON.stringify(state), 'utf8'); const before = await readFile(path);
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /source|integrated|ancestor/i);
  assert.deepEqual(await readFile(path), before); await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});
