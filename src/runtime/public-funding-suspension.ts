import { basename, dirname, isAbsolute } from 'node:path';
import { regularFile, within } from '../artifacts/paths.ts';
import { budgetSummary } from '../contracts/budget.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateLedgerUpdate } from '../contracts/updates.ts';
import { reconcileRoleReceipt, ROLE_PRICING_VERSION } from '../roles/provider-budget.ts';
import type { AccountingController } from '../roles/provider-budget.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import type { RunSnapshot } from './run-types.ts';
import type { PublicValidationFundingRecord } from './public-validation-funding-types.ts';
import { fundingFields, fundingHash } from './public-validation-funding-validation.ts';
import { readFundingCleanup } from './completion-timing.ts';
import { validateSnapshot } from './run-validation.ts';

const decode = (bytes: Uint8Array): any => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
function reject(): never { throw new Error('Public funding suspension source is unsupported, changed or exceeds its retained bound.'); }
export const suspensionReference = (fundingId: string) => ({ artifactId: 'public-funding-suspension', version: fundingId, location: `public-funding/${fundingId}/suspension.json` });
interface SuspensionEvidence {
  formatVersion: 'public-funding-suspension/1';
  binding: NonNullable<RunSnapshot['validationFunding']>;
  snapshot: string;
  cleanup: { source: string; sha256: string };
  receipts: { reference: ArtifactReference; sha256: string; contents: string }[];
}

/** A read-only view cannot turn absent usage into a charge or cancellation. */
function readonlyAccounting(snapshot: RunSnapshot): AccountingController {
  return { read: async () => structuredClone(snapshot), coordinateAccounting: action => action(),
    reserve: async () => reject(), admit: async () => reject(), markUnknown: async () => reject(),
    settle: async () => reject(), cancel: async () => reject() };
}
async function suspensionReceipts(root: string, snapshot: RunSnapshot) {
  const receipts: SuspensionEvidence['receipts'] = [];
  for (const entry of snapshot.ledger.entries) {
    const admission = snapshot.requests.find(row => row.requestId === entry.requestId)!;
    if (!admission.admittedAt) {
      if (entry.status !== 'cancelled' || entry.settledMicroCny || !snapshot.events.some(e => e.type === 'cancelled' && e.requestId === entry.requestId)) reject();
      continue;
    }
    const refs = entry.evidence.filter(ref => ref.artifactId === `billing-${entry.requestId}` && ref.version === 'v1');
    if (refs.length !== 1 || !isAbsolute(refs[0].location) || !within(root, refs[0].location)) reject();
    const bytes = await regularFile(dirname(refs[0].location), basename(refs[0].location));
    const receipt = decode(bytes);
    if (entry.status === 'unknown') {
      const request = receipt.request;
      if (!entry.unknown || entry.settledMicroCny !== 0 || entry.reservedMicroCny <= 0 || receipt.formatVersion !== 1
        || receipt.runId !== snapshot.run.runId || receipt.ledgerId !== snapshot.ledger.ledgerId || receipt.taskId !== entry.taskId
        || receipt.requestId !== entry.requestId || receipt.admittedAt !== admission.admittedAt || receipt.outcome !== 'unknown'
        || receipt.provider !== 'deepseek' || entry.provider !== 'deepseek' || receipt.pricingVersion !== ROLE_PRICING_VERSION
        || entry.pricingVersion !== ROLE_PRICING_VERSION || receipt.usage !== undefined
        || receipt.responseModel !== undefined && receipt.responseModel !== 'deepseek-flash'
        || !Number.isFinite(receipt.elapsedMs) || receipt.elapsedMs < 0) reject();
      fundingFields(request, ['requestId', 'modelId', 'maxOutputTokens', 'inputBytes', 'hasImages', 'estimatedMaxCostMicroCny']);
      const quoted = request.inputBytes * 2 + request.maxOutputTokens * 8;
      if (request.requestId !== entry.requestId || request.modelId !== 'deepseek-flash' || request.hasImages !== false
        || !Number.isSafeInteger(request.inputBytes) || request.inputBytes <= 0 || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0
        || !Number.isSafeInteger(quoted) || quoted !== request.estimatedMaxCostMicroCny || quoted !== entry.reservedMicroCny) reject();
    } else if ((await reconcileRoleReceipt({ controller: readonlyAccounting(snapshot), requestId: entry.requestId, evidenceDirectory: dirname(refs[0].location) })).status !== 'already_closed') reject();
    receipts.push({ reference: refs[0], sha256: fundingHash(bytes), contents: new TextDecoder('utf-8', { fatal: true }).decode(bytes) });
  }
  return receipts;
}

function suspensionBound(snapshot: RunSnapshot) {
  validateSnapshot(snapshot);
  const heldMicroCny = budgetSummary(snapshot.ledger).committedMicroCny;
  if (snapshot.formatVersion !== 1 || snapshot.run.kind !== 'runtime_generation' || !snapshot.validationFunding
    || snapshot.stopReason?.code === 'charge_overrun' || !snapshot.ledger.entries.some(e => e.unknown)
    || snapshot.ledger.entries.some(e => e.status === 'reserved') || heldMicroCny <= 0 || heldMicroCny >= snapshot.validationFunding.limits.limitMicroCny) reject();
  return heldMicroCny;
}
/** Called with exclusive child/registry ownership on apply; preview separately checks stable bytes. */
export async function prepareFundingSuspension(root: string, snapshot: RunSnapshot, bytes: Buffer) {
  const heldMicroCny = suspensionBound(snapshot);
  const cleanup = await readFundingCleanup(root);
  if (cleanup.cleanup.some((row: { outcome: string }) => row.outcome !== 'closed')) reject();
  const receipts = await suspensionReceipts(root, snapshot);
  if (!bytes.equals(await regularFile(root, 'snapshot.json'))) reject();
  const evidence: SuspensionEvidence = { formatVersion: 'public-funding-suspension/1', binding: snapshot.validationFunding!,
    snapshot: new TextDecoder('utf-8', { fatal: true }).decode(bytes), cleanup: { source: cleanup.source, sha256: cleanup.sha256 }, receipts };
  return { evidence, heldMicroCny };
}

/** Reused by every shared funding gate and the already-locked dedicated accounting path. */
export async function verifyFundingSuspension(record: PublicValidationFundingRecord) {
  if (!record.suspension) return;
  const { binding, suspension } = record, root = binding.runRoot;
  if (!sameValue(suspension.source, suspensionReference(binding.fundingId))) reject();
  const bytes = await regularFile(binding.sharedRoot, suspension.source.location), evidence = decode(bytes) as SuspensionEvidence;
  fundingFields(evidence, ['formatVersion', 'binding', 'snapshot', 'cleanup', 'receipts']);
  if (fundingHash(bytes) !== suspension.sourceSha256 || evidence.formatVersion !== 'public-funding-suspension/1'
    || !sameValue(evidence.binding, binding) || typeof evidence.snapshot !== 'string') reject();
  const basis = decode(Buffer.from(evidence.snapshot, 'utf8')) as RunSnapshot; validateSnapshot(basis);
  if (basis.revision !== suspension.basisRevision || !sameValue(basis.validationFunding, binding)
    || suspensionBound(basis) !== suspension.heldMicroCny
    || !sameValue(await suspensionReceipts(root, basis), evidence.receipts)) reject();
  const currentBytes = await regularFile(root, 'snapshot.json'), current = decode(currentBytes) as RunSnapshot; validateSnapshot(current);
  const cleanup = await readFundingCleanup(root);
  if (!sameValue({ source: cleanup.source, sha256: cleanup.sha256 }, evidence.cleanup) || cleanup.cleanup.some((row: { outcome: string }) => row.outcome !== 'closed')
    || current.stopReason?.code === 'charge_overrun' || budgetSummary(current.ledger).committedMicroCny > suspension.heldMicroCny) reject();
  const original = decode(await regularFile(root, cleanup.source));
  if (typeof original.fundingSnapshot !== 'string' || fundingHash(original.fundingSnapshot) !== original.snapshotSha256) reject();
  const signedBasis = decode(Buffer.from(original.fundingSnapshot, 'utf8')) as RunSnapshot; validateSnapshot(signedBasis);
  requireAccountingExtension(signedBasis, basis);
  requireAccountingExtension(basis, current);
  if (!currentBytes.equals(await regularFile(root, 'snapshot.json'))) reject();
}
function requireAccountingExtension(basis: RunSnapshot, current: RunSnapshot) {
  const frame = (state: RunSnapshot) => ({ ...state, revision: 0, stopReason: null, events: [], ledger: { ...state.ledger, entries: [] },
    run: { ...state.run, state: 'waiting_user', fees: {} } });
  if (!sameValue(frame(basis), frame(current)) || current.revision < basis.revision || current.ledger.entries.length !== basis.ledger.entries.length
    || validateLedgerUpdate(basis.ledger, current.ledger, { role: 'system', actorId: 'public-funding-suspension' }).length
    || !sameValue(current.events.slice(0, basis.events.length), basis.events)
    || current.events.slice(basis.events.length).some(e => !['stopped', 'settled', 'unknown', 'cancelled', 'budget_warning'].includes(e.type))) reject();
}
