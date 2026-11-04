import fs from 'node:fs/promises';
import { safePath, id } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { fundingFields, fundingTime, fundingHash } from './public-validation-funding-validation.ts';
import { requireFact as check } from './public-funding-accounting-trust.ts';

export interface LocalAuthorityScope {
  sharedRunId: string; sharedLedgerId: string; runId: string; ledgerId: string; fundingId: string;
}
export interface LocalEvidenceScope {
  requestId: string; ownerDecisionSha256: string; ownerBindingSha256: string;
  operatorFactsSha256: string; reviewerFactsSha256: string;
  targetExport: { cutoffAt: string }; allExport: { cutoffAt: string };
  followupOperator: string; followupReviewer: string; reviewDueAt: string;
}
export interface LocalAuthority {
  kind: 'local_operator_record'; sourceSha256: string;
  record: LocalAuthorityScope & {
    formatVersion: 'public-funding-local-authority/1'; authority: 'local_operator_record';
    requestId: string; evidenceSha256: string; ownerDecisionSha256: string; ownerBindingSha256: string;
    operatorFactsSha256: string; reviewerFactsSha256: string;
    operator: string; reviewer: string; approvedAt: string; expiresAt: string;
  };
}
const folder = (fundingId: string) => 'public-funding-accounting/cases/' + id(fundingId) + '/';
async function bytes(root: string, name: string, limit = 65536) {
  const f = await fs.open(await safePath(root, name), 'r');
  try {
    const stat = await f.stat();
    check(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= limit, 'invalid local authority source');
    const data = Buffer.alloc(stat.size + 1); let n = 0;
    while (n < data.length) { const r = await f.read(data, n, data.length - n, n); if (!r.bytesRead) break; n += r.bytesRead; }
    check(n === stat.size, 'local authority source changed');
    return data.subarray(0, n);
  } finally { await f.close(); }
}
const decode = (b: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));

/** The trusted operator attests the source. Local files bind facts; they do not authenticate people. */
export async function readLocalAuthority(root: string, scope: LocalAuthorityScope, e: LocalEvidenceScope, hash: string) {
  const raw = await bytes(root, folder(scope.fundingId) + 'local-authority.json'), a = decode(raw);
  fundingFields(a, 'formatVersion authority sharedRunId sharedLedgerId runId ledgerId fundingId requestId evidenceSha256 ownerDecisionSha256 ownerBindingSha256 operatorFactsSha256 reviewerFactsSha256 operator reviewer approvedAt expiresAt'.split(' '));
  check(a.formatVersion === 'public-funding-local-authority/1' && a.authority === 'local_operator_record', 'invalid local authority');
  for (const k of ['sharedRunId', 'sharedLedgerId', 'runId', 'ledgerId', 'fundingId'] as const)
    check(a[k] === scope[k], 'local authority scope differs');
  for (const k of ['requestId', 'ownerDecisionSha256', 'ownerBindingSha256', 'operatorFactsSha256', 'reviewerFactsSha256'] as const)
    check(a[k] === e[k], 'local authority source differs');
  check(a.evidenceSha256 === hash && a.operator === e.followupOperator && a.reviewer === e.followupReviewer && a.operator !== a.reviewer, 'local authority evidence or independent review differs');
  id(a.operator); id(a.reviewer); fundingTime(a.approvedAt); fundingTime(a.expiresAt);
  check(Date.parse(a.approvedAt) >= Math.max(Date.parse(e.targetExport.cutoffAt), Date.parse(e.allExport.cutoffAt)) && Date.parse(a.approvedAt) < Date.parse(a.expiresAt), 'invalid local approval interval');
  return { kind: 'local_operator_record' as const, sourceSha256: fundingHash(raw), record: a } as LocalAuthority;
}
export function checkLocalApproval(a: LocalAuthority, at: number) {
  check(Date.parse(a.record.approvedAt) <= at && at < Date.parse(a.record.expiresAt), 'local authority not yet approved or expired');
}
export async function requireLocalAuthority(root: string, a: LocalAuthority) {
  fundingFields(a, ['kind', 'sourceSha256', 'record']);
  const raw = await bytes(root, folder(a.record.fundingId) + 'local-authority.json');
  check(a.kind === 'local_operator_record' && fundingHash(raw) === a.sourceSha256 && sameValue(decode(raw), a.record), 'original local authority source changed');
}
export async function ensureLocalNotFrozen(root: string, a: LocalAuthority, due: string, at: number) {
  await requireLocalAuthority(root, a);
  const prefix = folder(a.record.fundingId), s = decode(await bytes(root, prefix + 'local-followup.json'));
  fundingFields(s, ['formatVersion', 'authoritySha256', 'evidenceSha256', 'revoked', 'disputed', 'statement']);
  check(s.formatVersion === 'public-funding-local-followup/1' && s.authoritySha256 === a.sourceSha256 && s.evidenceSha256 === a.record.evidenceSha256, 'local follow-up scope differs');
  const source = async (path: string, digest: unknown) => check(typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest) && fundingHash(await bytes(root, path, 8 * 1024 * 1024)) === digest, 'local follow-up source changed');
  for (const field of ['revoked', 'disputed'] as const) if (s[field] !== null) {
    fundingFields(s[field], ['recordedAt', 'sourceSha256']); fundingTime(s[field].recordedAt);
    check(Date.parse(s[field].recordedAt) <= at, 'future local follow-up notice');
    await source(prefix + field + '.json', s[field].sourceSha256);
    check(false, 'local authorization revoked or statement disputed; notify budget owner');
  }
  let deadline = Date.parse(due); fundingTime(due);
  if (s.statement !== null) {
    const n = s.statement;
    fundingFields(n, ['availableAt', 'sourceSha256', ...(n.review === undefined ? [] : ['review'])]);
    fundingTime(n.availableAt); check(Date.parse(n.availableAt) <= at, 'future local statement notice');
    await source(prefix + 'statement-available.json', n.sourceSha256);
    const day = new Date(Date.parse(n.availableAt) + 8 * 3600000);
    do { day.setUTCDate(day.getUTCDate() + 1); } while ([0, 6].includes(day.getUTCDay()));
    deadline = Math.min(deadline, day.getTime() - 8 * 3600000);
    if (n.review !== undefined) {
      const r = n.review;
      fundingFields(r, ['outcome', 'reviewedAt', 'operator', 'reviewer', 'statementSha256', 'comparisonSha256', 'operatorFactsSha256', 'reviewerFactsSha256']);
      fundingTime(r.reviewedAt);
      check(r.outcome === 'matched' && r.operator === a.record.operator && r.reviewer === a.record.reviewer &&
        Date.parse(r.reviewedAt) >= Date.parse(n.availableAt) && Date.parse(r.reviewedAt) < deadline && Date.parse(r.reviewedAt) <= at, 'local statement review differs or was not timely');
      const reviews = 'public-funding-accounting/statement-reviews/' + a.record.evidenceSha256 + '/';
      for (const [name, digest] of [['statement.bin', r.statementSha256], ['comparison.json', r.comparisonSha256],
        ['local-operator-review.json', r.operatorFactsSha256], ['local-reviewer-review.json', r.reviewerFactsSha256]]) await source(reviews + name, digest);
      return;
    }
  }
  check(at < deadline, 'statement review overdue; related paid work is frozen pending separate authorized review');
}
