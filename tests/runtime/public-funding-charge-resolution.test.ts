import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import child from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { generateKeyPairSync, sign } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { crc32 } from 'node:zlib';
import test from 'node:test';
import { signedOrdinaryIncompleteFunding } from './public-validation-funding.fixture.ts';
import {
  acquirePublicFundingGate,
  settlePublicValidationFunding,
  reservePublicValidationFunding,
} from '../../src/runtime/public-validation-funding.ts';
import { previewPublicFundingChargeResolution } from '../../src/runtime/public-funding-charge-resolution.ts';
import { approvalBytes, trustFile } from '../../src/runtime/public-funding-accounting-trust.ts';
import { fundingHash as hash } from '../../src/runtime/public-validation-funding-validation.ts';
import { bucketIso } from '../../src/runtime/public-funding-billing-export.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { RunController } from '../../src/runtime/run.ts';

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
test('funded unknown requires three external approvals; exact closed-hour attribution settles once and gates later paid work', async (t) => {
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
    clockUncertaintyMs: null,
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
  const keys = [generateKeyPairSync('ed25519'), generateKeyPairSync('ed25519')];
  const trust = {
    formatVersion: 'public-funding-accounting-trust/1',
    sharedRunId: f.binding.sharedRunId,
    sharedLedgerId: f.binding.sharedLedgerId,
    principals: keys.map((key, i) => ({
      id: i ? 'independent' : 'op',
      roles: i ? ['reviewer'] : ['operator', 'owner-witness'],
      publicKey: key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    })),
    revoked: [] as string[],
    disputed: [] as string[],
    statements: [],
  };
  // Mock only the fixed OS-protected trust source and ACL inspection. The real signature verifier is never replaced.
  const read = fs.readFile.bind(fs),
    lstat = fs.lstat.bind(fs);
  t.mock.method(fs, 'readFile', async (path: any, ...args: any[]) =>
    resolve(String(path)) === resolve(trustFile) ? Buffer.from(JSON.stringify(trust)) : (read as any)(path, ...args)
  );
  t.mock.method(fs, 'lstat', async (path: any, ...args: any[]) =>
    resolve(String(path)) === resolve(trustFile)
      ? { isFile: () => true, isSymbolicLink: () => false, nlink: 1, size: 100, uid: 0, mode: 0o444 }
      : (lstat as any)(path, ...args)
  );
  if (process.platform === 'win32') {
    const exec = child.execFile;
    t.mock.method(child, 'execFile', (file: any, args: any, opts: any, callback: any) => {
      if (file === 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe') {
        callback(null, 'trusted-accounting-acl/1', '');
        return {};
      }
      return (exec as any)(file, args, opts, callback);
    });
  } else if (process.getuid) t.mock.method(process, 'getuid', () => 1000);
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  for (const [i, purpose] of ['operator', 'reviewer', 'owner-witness'].entries()) {
    const principal = i === 1 ? 'independent' : 'op',
      sourceSha256 = [e.operatorFactsSha256, e.reviewerFactsSha256, e.ownerDecisionSha256][i],
      approvedAt = iso(now),
      expiresAt = iso(now + h);
    const a = {
      purpose,
      principal,
      approvedAt,
      expiresAt,
      sourceSha256,
      signature: sign(
        null,
        approvalBytes(
          purpose,
          principal,
          e,
          trust.sharedRunId,
          trust.sharedLedgerId,
          eh,
          approvedAt,
          expiresAt,
          sourceSha256
        ),
        keys[i === 1 ? 1 : 0].privateKey
      ).toString('base64'),
    };
    if (i === 2) {
      const preview = await previewPublicFundingChargeResolution(target);
      assert.equal(preview.status, 'checked', JSON.stringify(preview));
      assert.equal(preview.approvalsReady, false);
      await assert.rejects(RunController.applyPublicFundingChargeResolution(target));
      assert.deepEqual(await f.snapshot(), initial);
      assert.deepEqual(await f.f.snapshot(), sharedBefore);
    }
    await put(['operator.json', 'reviewer.json', 'owner.json'][i], a);
  }
  const preview = await previewPublicFundingChargeResolution(target);
  assert.equal(preview.approvalsReady, true, JSON.stringify(preview));
  // Exercise the two real crash boundaries, retaining the same exclusive intent and original charge.
  const writeStore = SnapshotStore.prototype.write;
  for (const stage of ['child', 'shared'] as const) {
    const fail = t.mock.method(SnapshotStore.prototype, 'write', async function (this: SnapshotStore, snapshot: any) {
      if (
        (stage === 'child' && this.root === resolve(f.runRoot) && snapshot.events.at(-1)?.type === 'settled') ||
        (stage === 'shared' &&
          this.root === resolve(f.sharedRoot) &&
          snapshot.events.at(-1)?.type === 'public_funding_settled')
      )
        throw new Error('Injected ' + stage + ' commit failure');
      return writeStore.call(this, snapshot);
    });
    await assert.rejects(RunController.applyPublicFundingChargeResolution(target), /Injected/);
    fail.mock.restore();
    const interrupted = await f.snapshot();
    assert.equal(interrupted.ledger.entries.at(-1).status, stage === 'child' ? 'unknown' : 'settled');
    assert.ok(interrupted.stopReason);
    assert.deepEqual(await f.f.snapshot(), sharedBefore);
    await assert.rejects(
      reservePublicValidationFunding(await f.f.authorization('interrupted-' + stage)),
      /awaits shared settlement/
    );
  }
  const closed = await RunController.applyPublicFundingChargeResolution(target);
  assert.equal(closed.settledMicroCny, 2);
  assert.equal(closed.releasedMicroCny, 4999998);
  const after = await f.snapshot();
  assert.equal(after.ledger.entries.at(-1).status, 'settled');
  assert.equal(after.ledger.entries.at(-1).settledMicroCny, 0);
  assert.ok(after.stopReason);
  assert.deepEqual(await receipt(unknown), original);
  assert.deepEqual(await fs.readFile(f.receiptPath), completion);
  assert.deepEqual(await RunController.applyPublicFundingChargeResolution(target), closed);
  assert.deepEqual(await f.snapshot(), after);
  trust.disputed.push(eh);
  await assert.rejects(reservePublicValidationFunding(await f.f.authorization('later')), /disputed/);
  await assert.rejects(acquirePublicFundingGate(f.runRoot, after, true), /disputed/);
  trust.disputed.length = 0;
  now = Date.parse(e.reviewDueAt);
  await assert.rejects(reservePublicValidationFunding(await f.f.authorization('overdue')), /overdue/);
  assert.deepEqual(await settlePublicValidationFunding(target), closed);
});
