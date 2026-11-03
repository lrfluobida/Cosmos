import fs from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { regularFile, safePath, id, within } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { settleEntry } from '../budget/ledger.ts';
import { ROLE_PRICING_VERSION, usageCostMicroCny } from '../roles/provider-budget.ts';
import { readFundingCleanup } from './completion-timing.ts';
import { readOrdinaryProfile } from './ordinary-profile-source.ts';
import { verifyOrdinaryBudgetOwnerHistory } from './ordinary-design-revision-lifecycle.ts';
import { publishReceiptBytes } from './recovery/receipt-file.ts';
import { fundingFields, fundingTime, fundingHash } from './public-validation-funding-validation.ts';
import { validateSnapshot } from './run-validation.ts';
import { parseFundingBillingExport, billingHour, type BillingBucket } from './public-funding-billing-export.ts';
import {
  requireFact as check,
  checkApprovals,
  machineTrust,
  ensureNotFrozen,
} from './public-funding-accounting-trust.ts';
import type { RunSnapshot } from './run-types.ts';
import { SnapshotStore } from './store.ts';

export interface ChargeTarget {
  runRoot: string;
  sharedRoot: string;
  fundingId: string;
}
interface ExternalSource {
  sha256: string;
  cutoffAt: string;
}
interface ZeroResidualEvidence extends Record<string, unknown> {
  formatVersion: 'public-funding-zero-residual/1';
  mode: 'closed_bucket_zero_residual';
  finality: 'owner_accepted_as_of_cutoff';
  fundingId: string;
  authorizationSha256: string;
  runId: string;
  ledgerId: string;
  taskId: string;
  requestId: string;
  admittedAt: string;
  billingSha256: string;
  cleanupSha256: string;
  snapshotSha256: string;
  accountSha256: string;
  keySha256: string;
  model: 'deepseek-flash';
  startAt: string;
  endAt: string;
  targetExport: ExternalSource;
  allExport: ExternalSource;
  clockUncertaintyMs: number | null;
  known: { requestId: string; billingSha256: string }[];
  operatorFactsSha256: string;
  reviewerFactsSha256: string;
  ownerDecisionSha256: string;
  ownerBindingSha256: string;
  followupOperator: string;
  followupReviewer: string;
  reviewDueAt: string;
}
const base = 'public-funding-accounting';
const digest = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const contents = (v: unknown) => Buffer.from(JSON.stringify(v, null, 2) + '\n', 'utf8');
const decode = (b: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
const claimPath = (fundingId: string) => base + '/claims/' + id(fundingId) + '.json';
export const resolutionId = 'public-funding-zero-resolution';
const supplement = (request: string) => 'accounting/zero-residual/' + id(request) + '/supplement.json';
export async function boundedFile(root: string, name: string, limit = 512 * 1024) {
  const path = await safePath(root, name),
    f = await fs.open(path, 'r');
  try {
    const stat = await f.stat();
    check(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= limit, 'invalid accounting file');
    const b = Buffer.alloc(stat.size + 1);
    let n = 0;
    while (n < b.length) {
      const r = await f.read(b, n, b.length - n, n);
      if (!r.bytesRead) break;
      n += r.bytesRead;
    }
    check(n === stat.size, 'accounting file changed');
    return b.subarray(0, n);
  } finally {
    await f.close();
  }
}
async function writeOnce(root: string, name: string, bytes: Buffer) {
  const path = await safePath(root, name);
  await fs.mkdir(dirname(path), { recursive: true });
  try {
    await publishReceiptBytes(await safePath(root, name), bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !bytes.equals(await regularFile(root, name))) throw error;
  }
}
async function getClaim(root: string, fundingId: string) {
  try {
    return decode(await boundedFile(root, claimPath(fundingId)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function validateEvidence(e: unknown): asserts e is ZeroResidualEvidence {
  fundingFields(
    e,
    'formatVersion mode finality fundingId authorizationSha256 runId ledgerId taskId requestId admittedAt billingSha256 cleanupSha256 snapshotSha256 accountSha256 keySha256 model startAt endAt targetExport allExport clockUncertaintyMs known operatorFactsSha256 reviewerFactsSha256 ownerDecisionSha256 ownerBindingSha256 followupOperator followupReviewer reviewDueAt'.split(
      ' '
    )
  );
  check(
    e.formatVersion === 'public-funding-zero-residual/1' &&
      e.mode === 'closed_bucket_zero_residual' &&
      e.finality === 'owner_accepted_as_of_cutoff' &&
      e.model === 'deepseek-flash',
    'unsupported accounting policy'
  );
  for (const k of Object.keys(e).filter((k) => k.endsWith('Sha256'))) check(digest(e[k]), 'invalid source digest');
  for (const k of ['fundingId', 'runId', 'ledgerId', 'taskId', 'requestId', 'followupOperator', 'followupReviewer'])
    id(e[k]);
  for (const k of ['admittedAt', 'startAt', 'endAt', 'reviewDueAt']) fundingTime(e[k]);
  for (const x of [e.targetExport, e.allExport]) {
    fundingFields(x, ['sha256', 'cutoffAt']);
    fundingTime(x.cutoffAt);
    check(
      digest(x.sha256) &&
        Date.parse(x.cutoffAt) >= Date.parse(e.endAt) + 300000 &&
        Date.parse(x.cutoffAt) <= Date.now(),
      'open or premature billing cutoff'
    );
  }
  check(
    e.targetExport.sha256 !== e.allExport.sha256 &&
      Date.parse(e.reviewDueAt) > Math.max(Date.parse(e.targetExport.cutoffAt), Date.parse(e.allExport.cutoffAt)),
    'distinct authenticated exports and follow-up deadline required'
  );
  check(
    e.clockUncertaintyMs === null ||
      (Number.isSafeInteger(e.clockUncertaintyMs) && e.clockUncertaintyMs > 0 && e.clockUncertaintyMs <= 60000),
    'invalid clock uncertainty'
  );
  check(Array.isArray(e.known) && e.known.length > 0 && e.known.length <= 256, 'invalid known set');
  for (const k of e.known) {
    fundingFields(k, ['requestId', 'billingSha256']);
    id(k.requestId);
    check(digest(k.billingSha256), 'invalid billing source');
  }
  check(new Set(e.known.map((k) => k.requestId)).size === e.known.length, 'duplicate known request');
}
type Vector = { miss: number; hit: number; output: number };
function uniquePartition(groups: BillingBucket[], known: Vector[]) {
  check(groups.length === 2 && known.length <= 20, 'unmeasured clock requires a bounded two-hour exact partition');
  const target = groups[0].count <= groups[1].count ? groups[0] : groups[1];
  let matches = 0;
  function search(i: number, count: number, miss: number, hit: number, out: number) {
    if (
      matches > 1 ||
      count > target.count ||
      count + known.length - i < target.count ||
      miss > target.miss ||
      hit > target.hit ||
      out > target.output
    )
      return;
    if (i === known.length) {
      if (count === target.count && miss === target.miss && hit === target.hit && out === target.output) matches++;
      return;
    }
    search(i + 1, count, miss, hit, out);
    const v = known[i];
    search(i + 1, count + 1, miss + v.miss, hit + v.hit, out + v.output);
  }
  search(0, 0, 0, 0, 0);
  check(matches === 1, 'ambiguous or missing known request partition');
}
async function collectBilling(root: string, requested: Set<string>) {
  const seen = new Map<string, string>();
  let visited = 0;
  async function walk(dir: string, depth: number) {
    check(depth <= 8, 'billing tree too deep');
    const entries = await fs
      .readdir(await safePath(root, dir), { withFileTypes: true })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT' && depth === 0) return [];
        throw err;
      });
    for (const f of entries) {
      check(++visited <= 20000 && !f.isSymbolicLink(), 'unsafe billing tree');
      const path = dir + '/' + f.name;
      if (f.isDirectory()) await walk(path, depth + 1);
      else if (f.name.startsWith('billing-') && f.name.endsWith('.json')) {
        const request = f.name.slice(8, -5);
        check(requested.has(request) && !seen.has(request), 'unbound or duplicate billing receipt');
        seen.set(request, path);
      }
    }
  }
  await walk('sessions', 0);
  await walk('intake-sessions', 0);
  check(seen.size === requested.size, 'missing original billing receipt');
  return seen;
}
async function evaluate(target: ChargeTarget, state: RunSnapshot) {
  const { runRoot: root, sharedRoot, fundingId } = target,
    bind = state.validationFunding;
  check(
    bind &&
      state.formatVersion === 1 &&
      bind.runRoot === resolve(root) &&
      bind.sharedRoot === resolve(sharedRoot) &&
      bind.fundingId === fundingId,
    'target differs from bound original generation'
  );
  check(
    (await readOrdinaryProfile(root, { runId: state.run.runId, createdAt: state.events[0].at })) ===
      'ordinary-design/1',
    'ordinary profile required'
  );
  await verifyOrdinaryBudgetOwnerHistory(root, state);
  const proof = await readFundingCleanup(root);
  check(
    proof.cleanup.every((r: any) => r.outcome === 'closed'),
    'all cleanup resources must be closed'
  );
  const raw = await regularFile(root, proof.source);
  check(fundingHash(raw) === proof.sha256, 'cleanup changed');
  const completion = decode(raw);
  check(
    typeof completion.fundingSnapshot === 'string' &&
      completion.charges === 'unreconciled' &&
      completion.eligible === false,
    'original unresolved cleanup required'
  );
  const old = JSON.parse(completion.fundingSnapshot) as RunSnapshot;
  validateSnapshot(old);
  const records = old.ledger.entries,
    unresolved = records.filter((r) => r.status === 'unknown' && r.unknown);
  check(
    unresolved.length === 1 &&
      records.length <= 257 &&
      records.every((r) => r === unresolved[0] || (r.status === 'settled' && !r.unknown && !r.reservedMicroCny)),
    'one admitted unknown and otherwise settled rows required'
  );
  const entry = unresolved[0],
    admission = old.requests.find((r) => r.requestId === entry.requestId)!;
  check(
    admission?.admittedAt && entry.reservedMicroCny > 0 && entry.settledMicroCny === 0,
    'original admission missing'
  );
  const folder = base + '/cases/' + id(fundingId) + '/',
    doc = await boundedFile(sharedRoot, folder + 'evidence.json', 128 * 1024),
    e = decode(doc);
  validateEvidence(e);
  check(
    e.fundingId === fundingId &&
      e.authorizationSha256 === bind.authorizationSha256 &&
      e.runId === bind.runId &&
      e.ledgerId === bind.ledgerId &&
      e.taskId === entry.taskId &&
      e.requestId === entry.requestId &&
      e.admittedAt === admission.admittedAt &&
      e.cleanupSha256 === proof.sha256 &&
      e.snapshotSha256 === completion.snapshotSha256,
    'case binding differs'
  );
  const zip = await boundedFile(sharedRoot, folder + 'target.zip'),
    all = await boundedFile(sharedRoot, folder + 'all.zip');
  check(
    fundingHash(zip) === e.targetExport.sha256 && fundingHash(all) === e.allExport.sha256,
    'official export digest changed'
  );
  const t = parseFundingBillingExport(zip, e),
    a = parseFundingBillingExport(all, e);
  check(sameValue(t, a), 'account cost and all-key partition do not agree');
  const local = t.buckets.map(() => ({ count: 0, miss: 0, hit: 0, output: 0 })),
    vectors: Vector[] = [];
  const locations = await collectBilling(root, new Set(records.map((r) => r.requestId)));
  check(e.known.length === records.length - 1, 'known baseline incomplete');
  for (const row of records) {
    const ref = row.evidence.filter((r) => r.artifactId === 'billing-' + row.requestId && r.version === 'v1');
    const loc = locations.get(row.requestId)!;
    check(
      ref.length === 1 &&
        isAbsolute(ref[0].location) &&
        within(root, ref[0].location) &&
        relative(root, ref[0].location).split(sep).join('/') === loc &&
        basename(loc) === 'billing-' + row.requestId + '.json',
      'billing reference differs'
    );
    const bytes = await boundedFile(root, loc),
      b = decode(bytes),
      at = old.requests.find((r) => r.requestId === row.requestId)?.admittedAt;
    check(
      at &&
        b.formatVersion === 1 &&
        b.provider === row.provider &&
        b.provider === 'deepseek' &&
        b.pricingVersion === row.pricingVersion &&
        b.pricingVersion === ROLE_PRICING_VERSION &&
        b.runId === bind.runId &&
        b.ledgerId === bind.ledgerId &&
        b.taskId === row.taskId &&
        b.requestId === row.requestId &&
        b.admittedAt === at &&
        Number.isFinite(b.elapsedMs) &&
        b.elapsedMs >= 0,
      'original billing identity differs'
    );
    const index = Math.floor((Date.parse(at) - Date.parse(e.startAt)) / billingHour),
      skew = e.clockUncertaintyMs ?? 0;
    check(
      index >= 0 &&
        index < t.buckets.length &&
        Date.parse(at) - skew >= Date.parse(t.buckets[index].startAt) &&
        Date.parse(at) + Math.ceil(b.elapsedMs) + skew < Date.parse(t.buckets[index].startAt) + billingHour,
      'request crosses an unresolved billing boundary'
    );
    if (row === entry) {
      check(
        fundingHash(bytes) === e.billingSha256 &&
          b.outcome === 'unknown' &&
          b.stopReason === 'error' &&
          b.usage === undefined &&
          b.responseModel === undefined &&
          b.responseId === undefined,
        'not an original dispatched unknown error'
      );
      check(
        b.request?.requestId === row.requestId &&
          b.request.modelId === e.model &&
          b.request.estimatedMaxCostMicroCny === row.reservedMicroCny &&
          Number.isSafeInteger(b.request.inputBytes) &&
          b.request.inputBytes > 0 &&
          Number.isSafeInteger(b.request.maxOutputTokens) &&
          b.request.maxOutputTokens > 0,
        'unknown dispatch metadata differs'
      );
      continue;
    }
    const k = e.known.find((k) => k.requestId === row.requestId);
    check(
      k?.billingSha256 === fundingHash(bytes) &&
        b.outcome === 'settled' &&
        b.responseModel === e.model &&
        b.usage &&
        b.usage.cacheWrite === 0 &&
        usageCostMicroCny(b.usage) === row.settledMicroCny,
      'known usage/charge differs'
    );
    const v = { miss: b.usage.input, hit: b.usage.cacheRead, output: b.usage.output };
    check(b.usage.totalTokens === v.miss + v.hit + v.output, 'known token total differs');
    vectors.push(v);
    const s = local[index];
    s.count++;
    s.miss += v.miss;
    s.hit += v.hit;
    s.output += v.output;
  }
  check(
    t.buckets.every((b, i) => Object.entries(local[i]).every(([k, v]) => b[k as keyof BillingBucket] === v)),
    'nonzero per-bucket residual'
  );
  if (e.clockUncertaintyMs === null) uniquePartition(t.buckets, vectors);
  const hash = fundingHash(doc);
  for (const [file, key] of [
    ['operator-facts', 'operatorFactsSha256'],
    ['reviewer-facts', 'reviewerFactsSha256'],
    ['owner-decision', 'ownerDecisionSha256'],
    ['owner-binding', 'ownerBindingSha256'],
  ])
    check(fundingHash(await boundedFile(sharedRoot, folder + file + '.json')) === e[key], 'attested source changed');
  const receipt = {
    formatVersion: 'public-funding-zero-supplement/1',
    mode: e.mode,
    finality: e.finality,
    fundingId,
    runId: bind.runId,
    ledgerId: bind.ledgerId,
    requestId: entry.requestId,
    taskId: entry.taskId,
    admittedAt: e.admittedAt,
    billingSha256: e.billingSha256,
    evidenceSha256: hash,
    cleanup: {
      source: proof.source,
      sha256: proof.sha256,
      anchorSequence: completion.anchorSequence,
      snapshotSha256: completion.snapshotSha256,
    },
    originalOutcome: 'unknown',
    tokens: null,
    attributedMicroCny: 0,
    buckets: t.buckets,
    reviewDueAt: e.reviewDueAt,
  };
  const actual = state.ledger.entries.find((row) => row.requestId === entry.requestId)!;
  const closed = actual.status === 'settled';
  const fixed = actual.evidence.filter((ref) => ref.artifactId === resolutionId);
  const projected = structuredClone(old.ledger);
  if (closed) {
    check(
      !!state.stopReason &&
        fixed.length === 1 &&
        digest(fixed[0].version) &&
        fixed[0].location === join(root,supplement(entry.requestId)),
      'settled charge lacks exact supplemental reference'
    );
    settleEntry(projected.entries.find((row) => row.requestId === entry.requestId)!, 0, fixed);
  }
  check(sameValue(projected, state.ledger), 'closed ledger differs from exact resolution');
  const amount = projected.entries.reduce((sum, r) => sum + r.settledMicroCny, 0);
  check(amount <= bind.limits.limitMicroCny, 'external resolution cannot release an overrun');
  return {
    bind,
    e,
    hash,
    folder,
    doc,
    receipt,
    closedReference: fixed[0],
    closed,
    entry,
    amount,
    scope: t.buckets.map((b) => fundingHash(JSON.stringify([e.accountSha256, e.model, b.startAt]))),
  };
}
async function requireExclusiveBuckets(target: ChargeTarget, scope: string[], shared: RunSnapshot) {
  for (const record of shared.publicValidationFundings ?? []) {
    if (record.binding.fundingId === target.fundingId) continue;
    const other = await getClaim(target.sharedRoot, record.binding.fundingId);
    check(
      !other || (Array.isArray(other.scope) && !other.scope.some((s: string) => scope.includes(s))),
      'overlapping account/model/hour already claimed'
    );
  }
}
async function approvals(v: Awaited<ReturnType<typeof evaluate>>) {
  return Promise.all(
    ['operator', 'reviewer', 'owner'].map(async (name) =>
      decode(await boundedFile(v.bind.sharedRoot, v.folder + name + '.json', 4096))
    )
  );
}
export async function previewPublicFundingChargeResolution(target: ChargeTarget) {
  try {
    const state = decode(await regularFile(target.runRoot, 'snapshot.json'));
    validateSnapshot(state);
    const funding = await import('./public-validation-funding.ts');
    check(await funding.readPublicFundingBinding(target.runRoot, state, false), 'unbound funding source');
    const v = await evaluate(target, state);
    const shared = decode(await regularFile(target.sharedRoot, 'snapshot.json'));
    validateSnapshot(shared);
    await funding.sharedSources(target.sharedRoot, shared);
    check(
      shared.publicValidationFundings?.some((r) => sameValue(r.binding, v.bind)),
      'funding hold is not bound'
    );
    await requireExclusiveBuckets(target, v.scope, shared);
    let approvalsReady = false;
    try {
      const trust = await machineTrust(v.bind.sharedRunId, v.bind.sharedLedgerId);
      ensureNotFrozen(trust, v.hash, v.e.reviewDueAt, Date.now());
      checkApprovals(trust, v.e, v.hash, await approvals(v), Date.now());
      approvalsReady = true;
    } catch {
      /* Evidence preview grants no authority. */
    }
    return {
      status: 'checked' as const,
      approvalsReady,
      receipt: v.receipt,
      expectedSettledMicroCny: v.amount,
      expectedReleasedMicroCny: v.bind.limits.limitMicroCny - v.amount,
    };
  } catch (error) {
    return {
      status: 'pending' as const,
      approvalsReady: false,
      reason:
        error instanceof Error &&
        /^(Public accounting:|Unsupported or inconsistent official billing export)/.test(error.message)
          ? error.message
          : 'Required funding sources or external evidence are unavailable or invalid.',
    };
  }
}
// Called under child, registry and shared locks; no execution controller is exposed.
export async function verifyChargeResolution(
  target: ChargeTarget,
  childStore: SnapshotStore,
  sharedStore: SnapshotStore,
  publish: boolean
) {
  check(
    childStore.root === resolve(target.runRoot) && sharedStore.root === resolve(target.sharedRoot),
    'locked roots differ'
  );
  const state = await childStore.read(),
    shared = await sharedStore.read();
  validateSnapshot(state);
  validateSnapshot(shared);
  const v = await evaluate(target, state),
    trust = await machineTrust(v.bind.sharedRunId, v.bind.sharedLedgerId),
    signatures = await approvals(v);
  check(
    shared.publicValidationFundings?.some((r) => sameValue(r.binding, v.bind)),
    'unknown shared funding'
  );
  const oldClaim = await getClaim(target.sharedRoot, target.fundingId);
  check(!v.closed || oldClaim, 'closed charge has no original claim');
  const authorizedAt = oldClaim?.authorizedAt ?? new Date(Date.now()).toISOString();
  fundingTime(authorizedAt);
  const claim = {
    formatVersion: 'public-funding-hour-claim/1',
    fundingId: target.fundingId,
    evidenceSha256: v.hash,
    scope: v.scope,
    authorizedAt,
    reviewDueAt: v.e.reviewDueAt,
    signatureSha256: fundingHash(contents(signatures)),
  };
  check(!oldClaim || sameValue(oldClaim, claim), 'conflicting prior intent');
  checkApprovals(trust, v.e, v.hash, signatures, Date.parse(authorizedAt));
  if (!v.closed) {
    checkApprovals(trust, v.e, v.hash, signatures, Date.now());
    ensureNotFrozen(trust, v.hash, v.e.reviewDueAt, Date.now());
  }
  await requireExclusiveBuckets(target, v.scope, shared);
  const receipt = { ...v.receipt, claimSha256: fundingHash(contents(claim)) };
  const bytes = contents(receipt),
    reference = { artifactId: resolutionId, version: fundingHash(bytes), location: join(target.runRoot,supplement(v.entry.requestId)) };
  const relativeReceipt = supplement(v.entry.requestId);
  const sourcePath = dirname(relativeReceipt).split(sep).join('/') + '/evidence.json';
  const archive = { receipt, evidence: v.doc.toString('utf8'), approvals: signatures, claim };
  if (v.closed) check(sameValue(v.closedReference, reference), 'closed amount does not bind these approvals');
  for (const [name, expected] of [
    [sourcePath, v.doc],
    [relativeReceipt, bytes],
  ] as const) {
    try {
      check((await regularFile(target.runRoot, name)).equals(expected), 'supplemental artifact conflicts');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (publish && !v.closed) {
    await writeOnce(target.sharedRoot, claimPath(target.fundingId), contents(claim));
    await writeOnce(target.runRoot, sourcePath, v.doc);
    await writeOnce(target.runRoot, relativeReceipt, bytes);
  } else {
    check(v.closed && sameValue(oldClaim, claim), 'missing verified closed intent');
    check(
      (await regularFile(target.runRoot, relativeReceipt)).equals(bytes) &&
        (await regularFile(target.runRoot, sourcePath)).equals(v.doc),
      'immutable supplemental evidence changed'
    );
  }
  return { archive, reference, requestId: v.entry.requestId, closed: v.closed };
}
export async function requireCurrentAccountingReviews(root: string, state: RunSnapshot) {
  for (const r of state.publicValidationFundings ?? []) {
    const claim = await getClaim(root, r.binding.fundingId);
    const resolved = r.settlement?.requests.some((q) =>
      q.entry.evidence.some((ref) => ref.artifactId === resolutionId)
    );
    if (!claim) {
      check(!resolved, 'completed accounting claim missing');
      continue;
    }
    const archive = r.settlement ? decode(await regularFile(root, r.settlement.source.location)) : undefined;
    if (resolved)
      check(
        archive?.formatVersion === 'public-validation-settlement/2' &&
          sameValue(archive.externalResolution?.claim, claim),
        'archived accounting claim differs'
      );
    const trust = await machineTrust(r.binding.sharedRunId, r.binding.sharedLedgerId);
    ensureNotFrozen(trust, claim.evidenceSha256, claim.reviewDueAt, Date.now());
    check(resolved, 'accounting claim awaits shared settlement');
  }
}
