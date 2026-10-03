import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rename, rmdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { validationRunFixture } from './validation-run.fixture.ts';
import { preflightValidationRun, runValidationWithHost } from '../../probes/e2e/validation-run.ts';

for (const caseThree of ['absent', 'unstopped'] as const) test(`case four requires explicitly stopped current case three: ${caseThree}`, async t => {
  const f = await validationRunFixture(t, { caseThree, closure: 'none' });
  const path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), names = await readdir(f.ledgerRoot);
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /case 3|case three/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case four refuses missing historical roots, shared owners, repeated root/marker and insufficient free capacity', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(path);
  const oldRoot = join(f.repository, '.cosmos/e2e/cos20-native-validation-3'), parked = `${oldRoot}-offline-parked`;
  await rename(oldRoot, parked);
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /root|case|ENOENT/i);
  await rename(parked, oldRoot);
  for (const target of [join(f.ledgerRoot, '.controller.lock'), join(f.ledgerRoot, 'registry/.commit.lock'), f.caseRoot]) {
    await mkdir(target, { recursive: true });
    await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /owner|writer|already|restart/i);
    await rmdir(target);
  }
  const marker = join(f.ledgerRoot, 'cos20-native-validation-4.json'); await writeFile(marker, 'offline consumed marker', 'utf8');
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /marker|already|restart/i);
  await import('node:fs/promises').then(fs => fs.unlink(marker));
  const state = JSON.parse(original.toString('utf8'));
  state.ledger.allocations.push({ taskId: 'offline-extra-capacity', amountMicroCny: 64_000_000 }); state.run.taskIds.push('offline-extra-capacity');
  await writeFile(path, JSON.stringify(state), 'utf8'); const before = await readFile(path); let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /unallocated|insufficient|budget/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before); await writeFile(path, original);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case four free preflight preserves all history and accepts an ancestral applied closure source', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json');
  const before = await readFile(path), state = JSON.parse(before.toString('utf8')), stamp = (await stat(path)).mtimeMs, names = await readdir(f.ledgerRoot);
  await f.git('commit', '--allow-empty', '-m', 'Offline later reviewed entry source'); const head = await f.git('rev-parse', 'HEAD');
  const result = await preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', head] });
  assert.equal(result.quote.declaration.caseId, 'cos20-native-validation-4'); assert.equal(result.quote.identity.reviewedPlatformSha, head);
  assert.notEqual(state.allocationClosureDecisions[0].quote.identity.reviewedPlatformSha, head);
  assert.equal(state.ledger.allocationClosures.length, 15); assert.equal(result.quote.basis.allocatedMicroCny, 85_522_666);
  assert.equal(result.quote.basis.committedMicroCny, 2_043_028); assert.equal(result.paidRequests, 0);
  assert.equal(result.sourceApprovals.length, 14);
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, stamp); assert.deepEqual(await readdir(f.ledgerRoot), names);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

for (const closure of ['none', 'first-two'] as const) test(`case four refuses ${closure} allocation closure before host preparation or writes`, async t => {
  const f = await validationRunFixture(t, { closure }), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  let prepared = 0;
  await assert.rejects(runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
  } }), /allocation|closure|fifteen/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case four refuses historical receipt drift, closure audit drift and unresolved old root owners', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(path), state = JSON.parse(original.toString('utf8'));
  const old = join(f.ledgerRoot, f.caseThree!.decision.source.location), closure = join(f.ledgerRoot, state.allocationClosureDecisions[0].operatorDecision.source.location);
  for (const target of [old, closure]) {
    const bytes = await readFile(target); await writeFile(target, Buffer.concat([bytes, Buffer.from('\n')]));
    await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /source|receipt|closure|historical/i);
    await writeFile(target, bytes);
  }
  for (const caseNumber of [1, 2, 3]) for (const lock of ['.controller.lock', 'registry/.commit.lock']) {
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

test('case four requires each precise source marker and both integrated source ancestors', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(path), mappingPath = join(f.repository, 'docs/specs/github-issues.json');
  await f.git('switch', '-c', 'offline-unmerged-source'); await f.git('commit', '--allow-empty', '-m', 'Offline unmerged source');
  const unmerged = await f.git('rev-parse', 'HEAD'); await f.git('switch', 'main');
  for (const taskId of ['COS-20', 'COS-21', 'COS-22', 'COS-23', 'COS-24']) {
    const item = f.mapping.tasks.find(item => item.taskId === taskId)!, approved = { ...item };
    for (const fault of ['closed-wrong-marker', 'reviewed-not-ancestor', 'merge-not-ancestor'] as const) {
      Object.assign(item, approved);
      if (fault === 'closed-wrong-marker') { item.state = 'closed'; item.integrationStatus = 'complete'; item.reviewStatus = 'SOURCE_READY'; }
      else item[fault === 'reviewed-not-ancestor' ? 'reviewedCommit' : 'mergeCommit'] = unmerged;
      await writeFile(mappingPath, JSON.stringify(f.mapping), 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', `Offline ${taskId} ${fault}`);
      const head = await f.git('rev-parse', 'HEAD'); let prepared = 0;
      await assert.rejects(runValidationWithHost({ repository: f.repository, args: ['--validation-case', head, f.args[2]], host: {
        prepare: async () => { prepared++; }, execute: async () => ({ outcome: 'failed', gaps: ['Offline fixture must not execute'] }),
      } }), /reviewed|integrated|source/i);
      assert.equal(prepared, 0); assert.deepEqual(await readFile(path), before);
    }
    Object.assign(item, approved);
  }
  await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});

test('case four refuses a closure source outside frozen main ancestry even with matching audit and receipt hashes', async t => {
  const f = await validationRunFixture(t), path = join(f.ledgerRoot, 'snapshot.json'), state = JSON.parse(await readFile(path, 'utf8'));
  await f.git('switch', '-c', 'offline-unmerged-closure-source'); await f.git('commit', '--allow-empty', '-m', 'Offline unmerged closure source');
  const unmerged = await f.git('rev-parse', 'HEAD'); await f.git('switch', 'main');
  const receipt = state.allocationClosureDecisions[0], quote = receipt.quote, hash = (value: string) => createHash('sha256').update(value).digest('hex');
  quote.identity.reviewedPlatformSha = unmerged; const { quoteId, ...payload } = quote; quote.quoteId = `vacq1-${hash(JSON.stringify(payload))}`;
  const decision = receipt.operatorDecision, source = JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
    decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote });
  decision.sourceSha256 = hash(source); await writeFile(join(f.ledgerRoot, decision.source.location), source, 'utf8');
  state.events.find((event: any) => event.type === 'validation_allocation_closed').reason = JSON.stringify({ decisionId: decision.decisionId, quoteId: quote.quoteId, releasedMicroCny: quote.releasedMicroCny });
  await writeFile(path, JSON.stringify(state), 'utf8'); const before = await readFile(path);
  await assert.rejects(preflightValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /source|integrated|ancestor/i);
  assert.deepEqual(await readFile(path), before); await assert.rejects(readdir(f.caseRoot), { code: 'ENOENT' });
});
