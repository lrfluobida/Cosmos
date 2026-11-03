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
import {
  previewPublicFundingChargeResolution,
  checkCommonClockWindow,
} from '../../src/runtime/public-funding-charge-resolution.ts';
import { approvalBytes, trustFile } from '../../src/runtime/public-funding-accounting-trust.ts';
import { fundingHash as hash } from '../../src/runtime/public-validation-funding-validation.ts';
import { bucketIso, parseFundingBillingExport } from '../../src/runtime/public-funding-billing-export.ts';
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
  const second = await signedOrdinaryIncompleteFunding(t, 'external-charge', f.f, 'second-history');
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
  const secondState = await second.snapshot(),
    known2 = secondState.ledger.entries.find((r: any) => r.status === 'settled'),
    unknown2 = secondState.ledger.entries.find((r: any) => r.status === 'unknown');
  const secondTarget = { sharedRoot: second.sharedRoot, runRoot: second.runRoot, fundingId: second.binding.fundingId };
  const secondCase = join(second.sharedRoot, 'public-funding-accounting/cases', second.binding.fundingId);
  await fs.cp(folder, secondCase, { recursive: true });
  const e2 = {
    ...e,
    fundingId: second.binding.fundingId,
    authorizationSha256: second.binding.authorizationSha256,
    runId: second.binding.runId,
    ledgerId: second.binding.ledgerId,
    admittedAt: secondState.requests.find((r: any) => r.requestId === unknown2.requestId).admittedAt,
    known: [{ requestId: known2.requestId, billingSha256: hash(await receipt(known2)) }],
    billingSha256: hash(await receipt(unknown2)),
    snapshotSha256: second.receipt.snapshotSha256,
    cleanupSha256: hash(second.receiptBytes),
  };
  await fs.writeFile(join(secondCase, 'evidence.json'), JSON.stringify(e2) + '\n');
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
  let trustAvailable = false;
  // Mock the fixed deployment source (never an argument to apply) and OS checks. Signatures remain real.
  const read = fs.readFile.bind(fs),
    lstat = fs.lstat.bind(fs);
  t.mock.method(fs, 'readFile', async (path: any, ...args: any[]) =>
    resolve(String(path)) === resolve(trustFile) ? Buffer.from(JSON.stringify(trust)) : (read as any)(path, ...args)
  );
  t.mock.method(fs, 'lstat', async (path: any, ...args: any[]) => {
    if (resolve(String(path)) === resolve(trustFile)) {
      if (!trustAvailable) throw Object.assign(new Error('missing trust'), { code: 'ENOENT' });
      return { isFile: () => true, isSymbolicLink: () => false, nlink: 1, size: 100, uid: 0, mode: 0o444 };
    }
    if (
      process.platform !== 'win32' &&
      [dirname(trustFile), dirname(dirname(trustFile))].includes(resolve(String(path)))
    )
      return { isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o755 };
    return (lstat as any)(path, ...args);
  });
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
  const unprovisioned = await previewPublicFundingChargeResolution(target);
  assert.equal(unprovisioned.status, 'checked');
  assert.deepEqual(unprovisioned.approvalBlockers, [
    'machine_trust_unavailable_or_unverified',
    'operator_signature_missing_or_invalid',
    'reviewer_signature_missing_or_invalid',
    'owner_signature_missing_or_invalid',
  ]);
  assert.equal(unprovisioned.expectedReleasedMicroCny, 4999998);
  trustAvailable = true;
  for (const change of [
    { ...e, known: [] },
    { ...e, clockUncertaintyMs: 0 },
    { ...e, admittedAt: iso(start - 1) },
    { ...e, allExport: { ...e.allExport, cutoffAt: iso(end) } },
    { ...e, keySha256: hash('wrong') },
  ]) {
    await put('evidence.json', change);
    assert.equal((await previewPublicFundingChargeResolution(target)).status, 'pending');
  }
  await put('evidence.json', e);
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
  for (const name of ['owner', 'operator', 'reviewer']) {
    const path = join(folder, name + '.json'),
      bytes = await fs.readFile(path),
      a = JSON.parse(bytes.toString('utf8'));
    for (const patch of [
      { signature: Buffer.alloc(64).toString('base64') },
      { principal: 'unregistered' },
      { expiresAt: iso(now - 1) },
    ]) {
      await put(name + '.json', { ...a, ...patch });
      await assert.rejects(RunController.applyPublicFundingChargeResolution(target));
      assert.deepEqual(await f.snapshot(), initial);
      assert.deepEqual(await f.f.snapshot(), sharedBefore);
    }
    await fs.writeFile(path, bytes);
  }
  trust.revoked.push(eh);
  await assert.rejects(RunController.applyPublicFundingChargeResolution(target), /revoked/);
  trust.revoked.length = 0;
  const conflictPath = join(f.runRoot, 'accounting/zero-residual', unknown.requestId, 'supplement.json');
  await fs.mkdir(dirname(conflictPath), { recursive: true });
  await fs.writeFile(conflictPath, '{}', 'utf8');
  await assert.rejects(RunController.applyPublicFundingChargeResolution(target), /conflicts/);
  await assert.rejects(
    fs.readFile(join(f.sharedRoot, 'public-funding-accounting/claims', target.fundingId + '.json')),
    { code: 'ENOENT' }
  );
  await fs.unlink(conflictPath);
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
    const sharedPending = await f.f.snapshot();
    assert.deepEqual(sharedPending.ledger, sharedBefore.ledger);
    assert.ok(
      sharedPending.publicValidationFundings!.find((r) => r.binding.fundingId === target.fundingId)!.chargeClaimSha256
    );
    assert.equal(
      sharedPending.publicValidationFundings!.find((r) => r.binding.fundingId === target.fundingId)!.settlement,
      undefined
    );
    const claimPath = join(f.sharedRoot, 'public-funding-accounting/claims/' + target.fundingId + '.json'),
      claim = await fs.readFile(claimPath);
    await fs.unlink(claimPath);
    await assert.rejects(reservePublicValidationFunding(await f.f.authorization('lost-' + stage)), /claim/);
    await fs.writeFile(claimPath, claim);
    if (stage === 'shared') {
      for (const issue of ['revoked', 'disputed', 'overdue', 'expired']) {
        const before = now;
        if (issue === 'revoked') trust.revoked.push(eh);
        if (issue === 'disputed') trust.disputed.push(eh);
        if (issue === 'expired') now += h;
        if (issue === 'overdue') now = Date.parse(e.reviewDueAt);
        await assert.rejects(settlePublicValidationFunding(target));
        assert.deepEqual(await f.f.snapshot(), sharedPending);
        now = before;
        trust.revoked.length = 0;
        trust.disputed.length = 0;
      }
    }
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
  const firstClaimPath = join(f.sharedRoot, 'public-funding-accounting/claims', target.fundingId + '.json');
  const firstClaim = await fs.readFile(firstClaimPath);
  for (const fault of ['overlap', 'tampered', 'missing']) {
    if (fault === 'tampered')
      await fs.writeFile(firstClaimPath, JSON.stringify({ ...JSON.parse(firstClaim.toString()), scope: [] }));
    if (fault === 'missing') await fs.unlink(firstClaimPath);
    const conflict = await previewPublicFundingChargeResolution(secondTarget);
    assert.equal(conflict.status, 'pending');
    assert.match(conflict.reason ?? '', /claim/);
  }
  await fs.writeFile(firstClaimPath, firstClaim);
  trust.disputed.push(eh);
  await assert.rejects(reservePublicValidationFunding(await f.f.authorization('later')), /disputed/);
  await assert.rejects(acquirePublicFundingGate(f.runRoot, after, true), /disputed/);
  trust.disputed.length = 0;
  now = Date.parse(e.reviewDueAt);
  await assert.rejects(reservePublicValidationFunding(await f.f.authorization('overdue')), /overdue/);
  assert.deepEqual(await settlePublicValidationFunding(target), closed);
  const directory = join(f.sharedRoot, 'public-funding-accounting/statement-reviews', eh);
  await fs.mkdir(directory, { recursive: true });
  const statement = Buffer.from('Synthetic authenticated formal statement'),
    comparison = Buffer.from('{"result":"synthetic matched"}');
  await fs.writeFile(join(directory, 'statement.bin'), statement);
  await fs.writeFile(join(directory, 'comparison.json'), comparison);
  const availableAt = iso(now - 36 * h),
    reviewedAt = iso(now - 35 * h);
  const sig = (role: string, principal: string, key: number) =>
    sign(
      null,
      Buffer.from(
        JSON.stringify([
          'public-funding-statement-review/1',
          role,
          principal,
          trust.sharedRunId,
          trust.sharedLedgerId,
          eh,
          availableAt,
          reviewedAt,
          hash(statement),
          hash(comparison),
          'matched',
        ])
      ),
      keys[key].privateKey
    ).toString('base64');
  (trust.statements as any[]).push({
    evidenceSha256: eh,
    availableAt,
    review: {
      outcome: 'matched',
      reviewedAt,
      statementSha256: hash(statement),
      comparisonSha256: hash(comparison),
      operatorSignature: sig('operator', 'op', 0),
      reviewerSignature: sig('reviewer', 'independent', 1),
    },
  });
  await reservePublicValidationFunding(await f.f.authorization('after-reviewed'));
  trust.disputed.push(eh);
  await assert.rejects(reservePublicValidationFunding(await f.f.authorization('still-disputed')), /disputed/);
});

test('official ZIP reader rejects unsupported price, precision, duplicate cells and competing keys', () => {
  const caps = {
    startAt: '2026-01-01T01:00:00.000Z',
    endAt: '2026-01-01T02:00:00.000Z',
    model: 'deepseek-flash',
    accountSha256: hash('A'),
    keySha256: hash(JSON.stringify(['test', 'mask'])),
  };
  const prefix = [
    'A',
    bucketIso(Date.parse(caps.startAt)),
    bucketIso(Date.parse(caps.endAt)),
    caps.model,
    caps.model,
  ].join(',');
  const usage =
    'user_id,start_time_iso,end_time_iso,model,name,api_key_name,api_key,type,price,amount\n' +
    [
      'request_count,,1',
      'input_cache_miss_tokens,0.000001,7',
      'input_cache_hit_tokens,0.00000002,11',
      'output_tokens,0.000004,3',
    ]
      .map((row) => prefix + ',test,mask,' + row)
      .join('\n');
  const cost =
    'user_id,start_time_iso,end_time_iso,model,name,wallet_type,cost,currency\n' +
    prefix +
    ',Paid,0.0000192200000000,CNY';
  const make = (u: string, c: string) =>
    zip(
      [
        ['amount-2026-01-01_2026-01-01.csv', u],
        ['cost-2026-01-01_2026-01-01.csv', c],
      ],
      false
    );
  assert.equal(parseFundingBillingExport(make(usage, cost), caps).buckets[0].cnyE16, '192200000000');
  for (const [u, c] of [
    [usage, cost.replace('0.0000192200000000', '0.00')],
    [usage, cost.replace('Paid', 'Credits')],
    [usage.replace('0.000001', '0.0000001'), cost],
    [usage.replace('test,mask', 'test,other'), cost],
    [usage + '\n' + usage.split('\n')[1], cost],
    [usage, cost.replace('CNY', 'USD')],
  ]) {
    assert.throws(() => parseFundingBillingExport(make(u, c), caps));
  }
  const corrupt = make(usage, cost);
  corrupt[72] ^= 1;
  assert.throws(() => parseFundingBillingExport(corrupt, caps));
});

test('all compatible shared offsets must keep the entire unknown inside the approved hours', () => {
  const h = 3600000;
  assert.throws(
    () =>
      checkCommonClockWindow(
        [{ start: h + 30 * 60000, end: h + 30 * 60000 + 100, bucket: h }],
        { start: 3 * h - 500, end: 3 * h - 400 },
        h,
        3 * h
      ),
    /outside/
  );
  assert.deepEqual(
    checkCommonClockWindow(
      [
        { start: 2 * h - 4700, end: 2 * h - 3200, bucket: h },
        { start: 2 * h + 2100, end: 2 * h + 3600, bucket: 2 * h },
      ],
      { start: 2 * h + 14000, end: 2 * h + 26000 },
      h,
      3 * h
    ),
    { kind: 'inferred_common_offset', lowerInclusiveMs: -3600, upperExclusiveMs: 4700 }
  );
});
