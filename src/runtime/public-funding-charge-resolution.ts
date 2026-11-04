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
import { readLocalAuthority, checkLocalApproval, ensureLocalNotFrozen, type LocalAuthority } from './public-funding-local-authority.ts';

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
/** Evaluated only after the success vectors establish their unique partition. Billing instants can be anywhere within each request. */
export function checkCommonClockWindow(
  known: { start: number; end: number; bucket: number }[],
  unknown: { start: number; end: number },
  from: number,
  to: number
) {
  const lower = Math.max(...known.map((r) => r.bucket - r.end));
  const upper = Math.min(...known.map((r) => r.bucket + billingHour - r.start)); // Exclusive.
  check(
    Number.isFinite(lower) &&
      Number.isFinite(upper) &&
      lower < upper &&
      unknown.start + lower >= from &&
      unknown.end + upper <= to,
    'compatible clock offset can place the unresolved request outside the approved interval'
  );
  return { kind: 'inferred_common_offset' as const, lowerInclusiveMs: lower, upperExclusiveMs: upper };
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
  const times: { start: number; end: number; bucket: number }[] = [];
  let unknownTime: { start: number; end: number } | undefined;
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
    const interval = {
      start: Date.parse(at),
      end: Date.parse(at) + Math.ceil(b.elapsedMs),
      bucket: Date.parse(t.buckets[index].startAt),
    };
    if (row === entry) {
      unknownTime = interval;
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
    times.push(interval);
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
  let clockBasis;
  if (e.clockUncertaintyMs === null) {
    uniquePartition(t.buckets, vectors);
    check(unknownTime, 'missing unresolved interval');
    clockBasis = checkCommonClockWindow(times, unknownTime, Date.parse(e.startAt), Date.parse(e.endAt));
  } else {
    clockBasis = { kind: 'attested_clock_bound' as const, uncertaintyMs: e.clockUncertaintyMs };
  }
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
    originalStopReason: 'error',
    dispatched: true,
    responseId: null,
    attribution: 'derived_financial_attribution',
    tokens: null,
    attributedMicroCny: 0,
    buckets: t.buckets,
    clockBasis,
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
        fixed[0].location === join(root, supplement(entry.requestId)),
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
export async function requireMatchingResolutionClaim(
  root: string,
  fundingId: string,
  anchor: string | undefined,
  expected?: unknown
) {
  check((anchor === undefined) === (expected === undefined), 'external resolution missing for anchored funding');
  check(sameValue(await getClaim(root, fundingId), expected ?? null), 'unmatched external accounting claim');
}
async function requireExclusiveBuckets(target: ChargeTarget, scope: string[], shared: RunSnapshot) {
  for (const record of shared.publicValidationFundings ?? []) {
    if (record.binding.fundingId === target.fundingId) continue;
    const other = await getClaim(target.sharedRoot, record.binding.fundingId);
    if (record.chargeClaimSha256)
      check(
        other &&
          fundingHash(await boundedFile(target.sharedRoot, claimPath(record.binding.fundingId))) ===
            record.chargeClaimSha256,
        'another pending or settled claim is missing or altered'
      );
    if (record.settlement?.requests.some((r) => r.entry.evidence.some((ref) => ref.artifactId === resolutionId))) {
      const archiveBytes = await regularFile(target.sharedRoot, record.settlement.source.location);
      check(fundingHash(archiveBytes) === record.settlement.sourceSha256, 'prior settlement archive changed');
      const archive = decode(archiveBytes);
      check(
        Array.isArray(archive.externalResolution?.claim?.scope) &&
          !archive.externalResolution.claim.scope.some((s: string) => scope.includes(s)),
        'archived account/model/hour already claimed'
      );
      check(
        other &&
          archive.formatVersion === 'public-validation-settlement/2' &&
          sameValue(archive.externalResolution?.claim, other),
        'prior resolved scope claim changed'
      );
    }

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
  return previewResolution(target, 'protected');
}
/** Explicit trusted-operator entry; never selected by a runtime role or a failed protected preview. */
export async function previewLocalPublicFundingChargeResolution(target: ChargeTarget) {
  return previewResolution(target, 'local_operator_record');
}
async function previewResolution(target: ChargeTarget, authority: 'protected' | 'local_operator_record') {
  try {
    fundingFields(target, ['sharedRoot', 'runRoot', 'fundingId']);
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
    const prior = await getClaim(target.sharedRoot, target.fundingId);
    check(!prior || (prior.authority?.kind ?? 'protected') === authority, 'original authority profile differs');
    if (authority === 'local_operator_record') {
      const local = await readLocalAuthority(target.sharedRoot, v.bind, v.e, v.hash);
      check(!prior || sameValue(prior.authority, local), 'original local authority source changed');
      const approvalBlockers: string[] = [];
      try { checkLocalApproval(local, Date.now()); await ensureLocalNotFrozen(target.sharedRoot, local, v.e.reviewDueAt, Date.now()); }
      catch { approvalBlockers.push('local_authority_expired_revoked_disputed_or_review_unavailable'); }
      return { status: 'checked' as const, authority: local.kind, approvalsReady: !approvalBlockers.length, approvalBlockers,
        receipt: v.receipt, expectedSettledMicroCny: v.amount, expectedReleasedMicroCny: v.bind.limits.limitMicroCny - v.amount };
    }
    const approvalBlockers: string[] = [];
    let trust: Awaited<ReturnType<typeof machineTrust>> | undefined;
    try {
      trust = await machineTrust(v.bind.sharedRunId, v.bind.sharedLedgerId);
    } catch {
      approvalBlockers.push('machine_trust_unavailable_or_unverified');
    }
    const signatures = [];
    for (const name of ['operator', 'reviewer', 'owner']) {
      try {
        signatures.push(decode(await boundedFile(v.bind.sharedRoot, v.folder + name + '.json', 4096)));
      } catch {
        approvalBlockers.push(name + '_signature_missing_or_invalid');
      }
    }
    if (trust) {
      try {
        await ensureNotFrozen(
          trust,
          v.hash,
          v.e.reviewDueAt,
          Date.now(),
          v.bind.sharedRoot,
          v.e.followupOperator,
          v.e.followupReviewer
        );
      } catch {
        approvalBlockers.push('case_revoked_disputed_or_review_overdue');
      }
      if (signatures.length === 3)
        try {
          checkApprovals(trust, v.e, v.hash, signatures, Date.now());
        } catch {
          approvalBlockers.push('signatures_not_valid_for_current_scope_and_time');
        }
    }
    return {
      status: 'checked' as const,
      approvalsReady: approvalBlockers.length === 0,
      approvalBlockers,
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
  publish: boolean,
  selectedAuthority?: 'protected' | 'local_operator_record'
) {
  check(
    childStore.root === resolve(target.runRoot) && sharedStore.root === resolve(target.sharedRoot),
    'locked roots differ'
  );
  const state = await childStore.read(),
    shared = await sharedStore.read();
  validateSnapshot(state);
  validateSnapshot(shared);
  const v = await evaluate(target, state);
  check(
    shared.publicValidationFundings?.some((r) => sameValue(r.binding, v.bind)),
    'unknown shared funding'
  );
  const oldClaim = await getClaim(target.sharedRoot, target.fundingId);
  const authorityKind = oldClaim ? oldClaim.authority?.kind ?? 'protected' : selectedAuthority ?? 'protected';
  check(['protected', 'local_operator_record'].includes(authorityKind) && (!selectedAuthority || selectedAuthority === authorityKind), 'original authority profile differs');
  const local = authorityKind === 'local_operator_record' ? await readLocalAuthority(target.sharedRoot, v.bind, v.e, v.hash) : undefined;
  check(!oldClaim || sameValue(oldClaim.authority, local), 'original local authority source changed');
  const trust = local ? undefined : await machineTrust(v.bind.sharedRunId, v.bind.sharedLedgerId);
  const signatures = local ? [] : await approvals(v);
  const approved = (at: number) => local ? checkLocalApproval(local, at) : checkApprovals(trust!, v.e, v.hash, signatures, at);
  const notFrozen = () => local ? ensureLocalNotFrozen(target.sharedRoot, local, v.e.reviewDueAt, Date.now()) :
    ensureNotFrozen(trust!, v.hash, v.e.reviewDueAt, Date.now(), v.bind.sharedRoot, v.e.followupOperator, v.e.followupReviewer);
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
    ...(local ? { authority: local } : { signatureSha256: fundingHash(contents(signatures)) }),
    followupOperator: v.e.followupOperator,
    followupReviewer: v.e.followupReviewer,
  };
  check(!oldClaim || sameValue(oldClaim, claim), 'conflicting prior intent');
  approved(Date.parse(authorizedAt));
  const record = shared.publicValidationFundings!.find((r) => r.binding.fundingId === target.fundingId)!;
  if (v.closed) check(record.chargeClaimSha256, 'closed child lacks registered shared accounting intent');
  if (record.chargeClaimSha256)
    check(
      oldClaim &&
        fundingHash(await boundedFile(target.sharedRoot, claimPath(target.fundingId))) === record.chargeClaimSha256,
      'original shared claim changed'
    );
  if (record.settlement)
    check(
      v.closed &&
        record.settlement.requests.some(
          (r) =>
            r.entry.requestId === v.entry.requestId && r.entry.evidence.some((ref) => ref.artifactId === resolutionId)
        ),
      'not an exact historical replay'
    );
  if (!record.settlement) {
    approved(Date.now());
    await notFrozen();
  }
  await requireExclusiveBuckets(target, v.scope, shared);
  const receipt = { ...v.receipt, claimSha256: fundingHash(contents(claim)) };
  const bytes = contents(receipt),
    reference = {
      artifactId: resolutionId,
      version: fundingHash(bytes),
      location: join(target.runRoot, supplement(v.entry.requestId)),
    };
  const relativeReceipt = supplement(v.entry.requestId);
  const sourcePath = dirname(relativeReceipt).split(sep).join('/') + '/evidence.json';
  const archive = { receipt, evidence: v.doc.toString('utf8'), approvals: signatures, claim, ...(local ? { authority: local } : {}) };
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
    await (
      await import('./public-validation-funding.ts')
    ).anchorPublicFundingChargeClaim(sharedStore, target.fundingId);
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
// First release can follow a long interrupted child commit. Recheck external policy immediately before import.
export async function requireCurrentReleaseApproval(
  binding: NonNullable<RunSnapshot['validationFunding']>,
  archive: Awaited<ReturnType<typeof verifyChargeResolution>>['archive']
) {
  const evidence = JSON.parse(archive.evidence);
  validateEvidence(evidence);
  if (archive.authority) {
    const local = await readLocalAuthority(binding.sharedRoot, binding, evidence, archive.receipt.evidenceSha256);
    check('authority' in archive.claim && sameValue(local, archive.authority) && sameValue(local, archive.claim.authority), 'original local authority source changed');
    checkLocalApproval(local, Date.now());
    await ensureLocalNotFrozen(binding.sharedRoot, local, evidence.reviewDueAt, Date.now());
    return;
  }
  const trust = await machineTrust(binding.sharedRunId, binding.sharedLedgerId),
    now = Date.now();
  checkApprovals(trust, evidence, archive.receipt.evidenceSha256, archive.approvals, now);
  await ensureNotFrozen(
    trust,
    archive.receipt.evidenceSha256,
    evidence.reviewDueAt,
    now,
    binding.sharedRoot,
    evidence.followupOperator,
    evidence.followupReviewer
  );
}
export async function requireCurrentAccountingReviews(root: string, state: RunSnapshot) {
  for (const r of state.publicValidationFundings ?? []) {
    const claim = await getClaim(root, r.binding.fundingId);
    const resolved = r.settlement?.requests.some((q) =>
      q.entry.evidence.some((ref) => ref.artifactId === resolutionId)
    );
    if (r.chargeClaimSha256)
      check(
        claim && fundingHash(await boundedFile(root, claimPath(r.binding.fundingId))) === r.chargeClaimSha256,
        'shared accounting claim missing or altered'
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
    if (claim.authority) {
      check(claim.authority.kind === 'local_operator_record' && (!resolved || sameValue(archive.externalResolution.authority, claim.authority)), 'original authority profile differs');
      const local = claim.authority as LocalAuthority;
      check(local.record.evidenceSha256 === claim.evidenceSha256 && local.record.fundingId === r.binding.fundingId &&
        local.record.sharedRunId === r.binding.sharedRunId && local.record.sharedLedgerId === r.binding.sharedLedgerId &&
        local.record.operator === claim.followupOperator && local.record.reviewer === claim.followupReviewer, 'local follow-up binding differs');
      await ensureLocalNotFrozen(root, local, claim.reviewDueAt, Date.now());
    } else {
      const trust = await machineTrust(r.binding.sharedRunId, r.binding.sharedLedgerId);
      await ensureNotFrozen(trust, claim.evidenceSha256, claim.reviewDueAt, Date.now(), root, claim.followupOperator, claim.followupReviewer);
    }
    check(resolved, 'accounting claim awaits shared settlement');
  }
}
