import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { crc32 } from 'node:zlib';
import test, { type TestContext } from 'node:test';
import { signedOrdinaryIncompleteFunding } from './public-validation-funding.fixture.ts';
import {
  acquirePublicFundingGate,
  settlePublicValidationFunding,
  reservePublicValidationFunding,
} from '../../src/runtime/public-validation-funding.ts';
import { fundingHash as hash } from '../../src/runtime/public-validation-funding-validation.ts';
import { bucketIso } from '../../src/runtime/public-funding-billing-export.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { RunController } from '../../src/runtime/run.ts';

import * as resolution from '../../src/runtime/public-funding-charge-resolution.ts';
import { createWorkspaceTools } from '../../src/providers/workspace-tools.ts';
function zip(members: [string, string][], reverse: boolean) {
  const data: Buffer[] = [],
    dir: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of reverse ? [...members].reverse() : members) {
    const b = Buffer.from('\ufeff' + text),
      n = Buffer.from(name),
      l = Buffer.alloc(30),
      c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50);
    l.writeUInt32LE(crc32(b), 14);
    l.writeUInt32LE(b.length, 18);
    l.writeUInt32LE(b.length, 22);
    l.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt32LE(crc32(b), 16);
    c.writeUInt32LE(b.length, 20);
    c.writeUInt32LE(b.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    data.push(l, n, b);
    dir.push(c, n);
    offset += l.length + n.length + b.length;
  }
  const d = Buffer.concat(dir),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(2, 8);
  end.writeUInt16LE(2, 10);
  end.writeUInt32LE(d.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...data, d, end]);
}
async function localCase(t: TestContext) {
  const f = await signedOrdinaryIncompleteFunding(t, 'external-charge'),
    target = { runRoot: f.runRoot, sharedRoot: f.sharedRoot, fundingId: f.binding.fundingId };
  const initial = await f.snapshot(),
    sharedBefore = await f.f.snapshot();
  await assert.rejects(settlePublicValidationFunding(target), /unknown|reserved/);
  const rows = initial.ledger.entries,
    known = rows.find((r: any) => r.status === 'settled'),
    unknown = rows.find((r: any) => r.status === 'unknown');
  const receipt = async (r: any) =>
    fs.readFile(r.evidence.find((x: any) => x.artifactId === 'billing-' + r.requestId).location);
  const original = await receipt(unknown),
    completion = await fs.readFile(f.receiptPath);
  const stamp = initial.requests.find((r: any) => r.requestId === unknown.requestId).admittedAt,
    h = 3600000;
  const at = Math.floor(Date.parse(stamp) / h) * h,
    start = bucketIso(at).slice(11, 13) === '23' ? at - h : at,
    end = start + 2 * h;
  const date = bucketIso(start).slice(0, 10);
  const iso = (n: number) => new Date(n).toISOString();
  let now = end + 2 * h;
  t.mock.method(Date, 'now', () => now);
  const usage = ['user_id,start_time_iso,end_time_iso,model,name,api_key_name,api_key,type,price,amount'],
    cost = ['user_id,start_time_iso,end_time_iso,model,name,wallet_type,cost,currency'];
  for (let hr = start; hr < end; hr += h) {
    const count = hr === at ? 1 : 0,
      base = ['account', bucketIso(hr), bucketIso(hr + h), 'deepseek-flash', 'deepseek-flash'];
    for (const [k, p, v] of [
      ['request_count', '', count],
      ['input_cache_miss_tokens', '0.000001', count],
      ['input_cache_hit_tokens', '0.00000002', 0],
      ['output_tokens', '0.000004', 0],
    ])
      usage.push([...base, 'label', 'masked', k, p, v].join(','));
    cost.push([...base, 'Paid', count ? '0.000001' : '0', 'CNY'].join(','));
  }
  const members: [string, string][] = [
    ['amount-' + date + '_' + date + '.csv', usage.join('\r\n') + '\r\n'],
    ['cost-' + date + '_' + date + '.csv', cost.join('\r\n') + '\r\n'],
  ];
  const folder = join(f.sharedRoot, 'public-funding-accounting/cases', target.fundingId);
  await fs.mkdir(folder, { recursive: true });
  const put = async (name: string, obj: unknown) => {
    const b = Buffer.isBuffer(obj) ? obj : Buffer.from(JSON.stringify(obj) + '\n');
    await fs.writeFile(join(folder, name), b);
    return hash(b);
  };
  const e = {
    formatVersion: 'public-funding-zero-residual/1',
    mode: 'closed_bucket_zero_residual',
    finality: 'owner_accepted_as_of_cutoff',
    fundingId: target.fundingId,
    authorizationSha256: f.binding.authorizationSha256,
    runId: initial.run.runId,
    ledgerId: initial.ledger.ledgerId,
    taskId: unknown.taskId,
    requestId: unknown.requestId,
    admittedAt: stamp,
    billingSha256: hash(original),
    cleanupSha256: hash(completion),
    snapshotSha256: f.receipt.snapshotSha256,
    accountSha256: hash('account'),
    keySha256: hash(JSON.stringify(['label', 'masked'])),
    model: 'deepseek-flash',
    startAt: iso(start),
    endAt: iso(end),
    targetExport: { sha256: await put('target.zip', zip(members, false)), cutoffAt: iso(end + h) },
    allExport: { sha256: await put('all.zip', zip(members, true)), cutoffAt: iso(end + h) },
    clockUncertaintyMs: 1,
    known: [{ requestId: known.requestId, billingSha256: hash(await receipt(known)) }],
    operatorFactsSha256: await put('operator-facts.json', { synthetic: 'operator' }),
    reviewerFactsSha256: await put('reviewer-facts.json', { synthetic: 'reviewer' }),
    ownerDecisionSha256: await put('owner-decision.json', { synthetic: 'owner' }),
    ownerBindingSha256: await put('owner-binding.json', { synthetic: 'target' }),
    followupOperator: 'op',
    followupReviewer: 'independent',
    reviewDueAt: iso(now + 48 * h),
  };
  const eh = await put('evidence.json', e);

  const authorization = {
    formatVersion: 'public-funding-local-authority/1', authority: 'local_operator_record',
    sharedRunId: f.binding.sharedRunId, sharedLedgerId: f.binding.sharedLedgerId,
    runId: e.runId, ledgerId: e.ledgerId, fundingId: e.fundingId, requestId: e.requestId,
    evidenceSha256: eh, ownerDecisionSha256: e.ownerDecisionSha256, ownerBindingSha256: e.ownerBindingSha256,
    operatorFactsSha256: e.operatorFactsSha256, reviewerFactsSha256: e.reviewerFactsSha256,
    operator: 'op', reviewer: 'independent', approvedAt: iso(now), expiresAt: iso(now + h),
  };
  await put('local-authority.json', authorization);
  const status = { formatVersion: 'public-funding-local-followup/1', authoritySha256: hash(await fs.readFile(join(folder, 'local-authority.json'))),
    evidenceSha256: eh, revoked: null, disputed: null, statement: null };
  await put('local-followup.json', status);
  return { f, target, initial, sharedBefore, unknown, original, completion, receipt, e, eh, folder, put, authorization, status,
    now: () => now, advance: (n: number) => { now = n; }, iso, h };
}
const previewLocal = (target: any) => (resolution as any).previewLocalPublicFundingChargeResolution(target);
const applyLocal = (target: any) => (RunController as any).applyLocalPublicFundingChargeResolution(target);

test('local operator recovery keeps protected default, exact replay and unknown source', async t => {
  const x = await localCase(t);
  assert.equal(typeof (resolution as any).previewLocalPublicFundingChargeResolution, 'function', 'explicit local preview required');
  assert.equal((await previewLocal(x.target)).approvalsReady, true);
  await assert.rejects(RunController.applyPublicFundingChargeResolution(x.target));
  assert.deepEqual(await x.f.snapshot(), x.initial);
  const closed = await applyLocal(x.target);
  assert.equal(closed.settledMicroCny, 2); assert.equal(closed.releasedMicroCny, 4999998);
  assert.deepEqual(await x.receipt(x.unknown), x.original);
  assert.deepEqual(await fs.readFile(x.f.receiptPath), x.completion);
  const after = await x.f.snapshot(); assert.ok(after.stopReason);
  const claim = JSON.parse(await fs.readFile(join(x.f.sharedRoot, 'public-funding-accounting/claims', x.target.fundingId + '.json'), 'utf8'));
  assert.equal(claim.authority.kind, 'local_operator_record');
  const archive = JSON.parse(await fs.readFile(join(x.f.sharedRoot, closed.source.location), 'utf8'));
  assert.deepEqual(archive.externalResolution.authority.record, x.authorization);
  assert.deepEqual(await applyLocal(x.target), closed);
  await assert.rejects(RunController.applyPublicFundingChargeResolution(x.target), /authority|protected/);
  assert.deepEqual(await x.f.snapshot(), after);
  const auth = await fs.readFile(join(x.folder, 'local-authority.json'));
  await x.put('local-authority.json', { ...x.authorization, reviewer: 'another' });
  await assert.rejects(applyLocal(x.target), /authority|source/);
  await fs.writeFile(join(x.folder, 'local-authority.json'), auth);
  x.advance(Date.parse(x.e.reviewDueAt));
  assert.deepEqual(await applyLocal(x.target), closed);
  await assert.rejects(reservePublicValidationFunding(await x.f.f.authorization('late')), /overdue/);
});
test('local approval and source failures leave both ledgers unchanged', async t => {
  const x = await localCase(t);
  assert.equal(typeof (RunController as any).applyLocalPublicFundingChargeResolution, 'function', 'explicit local apply required');
  for (const patch of [{ requestId: 'other' }, { evidenceSha256: hash('other') }, { ownerBindingSha256: hash('other') },
    { operatorFactsSha256: hash('other') }, { reviewer: 'op' }, { approvedAt: x.iso(x.now() + 1) }, { expiresAt: x.iso(x.now()) }]) {
    await x.put('local-authority.json', { ...x.authorization, ...patch }); await assert.rejects(applyLocal(x.target));
    assert.deepEqual(await x.f.snapshot(), x.initial); assert.deepEqual(await x.f.f.snapshot(), x.sharedBefore);
  }
  await x.put('local-authority.json', x.authorization);
  for (const name of ['owner-decision.json', 'reviewer-facts.json', 'local-followup.json']) {
    const path = join(x.folder, name), bytes = await fs.readFile(path); await fs.unlink(path);
    await assert.rejects(applyLocal(x.target)); await fs.writeFile(path, bytes);
  }
  assert.deepEqual(await x.f.snapshot(), x.initial); assert.deepEqual(await x.f.f.snapshot(), x.sharedBefore);
});
test('interrupted local release rechecks expiry and follow-up and gates later spending', async t => {
  const x = await localCase(t);
  assert.equal(typeof (RunController as any).applyLocalPublicFundingChargeResolution, 'function');
  const write = SnapshotStore.prototype.write;
  const fault = t.mock.method(SnapshotStore.prototype, 'write', async function(this: SnapshotStore, snapshot: any) {
    if (this.root === resolve(x.f.sharedRoot) && snapshot.events.at(-1)?.type === 'public_funding_settled') throw new Error('Injected shared failure');
    return write.call(this, snapshot);
  });
  await assert.rejects(applyLocal(x.target), /Injected/); fault.mock.restore();
  assert.equal((await x.f.snapshot()).ledger.entries.at(-1).status, 'settled');
  const pending = await x.f.f.snapshot(), at = x.now();
  x.advance(Date.parse(x.authorization.expiresAt));
  await assert.rejects(settlePublicValidationFunding(x.target), /expired/);
  assert.deepEqual(await x.f.f.snapshot(), pending); x.advance(at);
  const closed = await applyLocal(x.target);
  for (const field of ['revoked', 'disputed']) {
    await x.put('local-followup.json', { ...x.status, [field]: { recordedAt: x.iso(at), sourceSha256: await x.put(field + '.json', { synthetic: field }) } });
    await assert.rejects(reservePublicValidationFunding(await x.f.f.authorization('blocked-' + field)), /revoked|disputed/);
    await assert.rejects(acquirePublicFundingGate(x.f.runRoot, await x.f.snapshot(), true), /revoked|disputed/);
  }
  await x.put('local-followup.json', x.status); x.advance(Date.parse(x.e.reviewDueAt));
  await assert.rejects(reservePublicValidationFunding(await x.f.f.authorization('overdue')), /overdue/);
  const directory = join(x.f.sharedRoot, 'public-funding-accounting/statement-reviews', x.eh);
  await fs.mkdir(directory, { recursive: true });
  const sourceHash = async (name: string, body: string) => { await fs.writeFile(join(directory, name), body); return hash(body); };
  const statement = { availableAt: x.iso(x.now() - 36 * x.h), sourceSha256: await x.put('statement-available.json', { synthetic: 'available' }), review: {
    outcome: 'matched', reviewedAt: x.iso(x.now() - 35 * x.h), operator: 'op', reviewer: 'independent',
    statementSha256: await sourceHash('statement.bin', 'Synthetic statement'), comparisonSha256: await sourceHash('comparison.json', '{"synthetic":"matched"}'),
    operatorFactsSha256: await sourceHash('local-operator-review.json', '{"synthetic":"operator"}'),
    reviewerFactsSha256: await sourceHash('local-reviewer-review.json', '{"synthetic":"independent"}'),
  } };
  await x.put('local-followup.json', { ...x.status, statement });
  await reservePublicValidationFunding(await x.f.f.authorization('reviewed'));
  await fs.writeFile(join(directory, 'comparison.json'), 'changed');
  await assert.rejects(reservePublicValidationFunding(await x.f.f.authorization('changed')), /source/);
  assert.deepEqual(await settlePublicValidationFunding(x.target), closed);
});
test('native role file policy excludes operator records and accounting entry', async t => {
  const x = await localCase(t);
  for (const { task } of x.f.planned.tasks) {
    const tools = await createWorkspaceTools({ workspace: x.f.runRoot,
      readPaths: [...task.ownership.readOnlyPaths, ...task.ownership.writePaths, ...task.inputs.map((ref: any) => ref.location), ...task.context.interfaces.map((ref: any) => ref.location)],
      writePaths: task.ownership.writePaths });
    assert.ok(task.context.tools.every((name: string) => !/accounting|chargeResolution/i.test(name)));
    assert.ok(tools.every(tool => ['read', 'write', 'edit'].includes(tool.name)));
    const write = tools.find(tool => tool.name === 'write');
    if (write) for (const name of ['local-authority.json', 'local-followup.json'])
      await assert.rejects(write.execute('attempt', { path: join(x.folder, name), content: '{}' }, new AbortController().signal), /outside/);
  }
  assert.deepEqual(JSON.parse(await fs.readFile(join(x.folder, 'local-authority.json'), 'utf8')), x.authorization);
});
