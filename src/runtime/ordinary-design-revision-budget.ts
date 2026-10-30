import { createHash } from 'node:crypto';
import { regularFile } from '../artifacts/paths.ts';
import { budgetCapacity } from '../contracts/budget.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference, BudgetLedger } from '../contracts/types.ts';
import type { RunSnapshot } from './run-types.ts';
import type { OrdinaryExecution } from './entrypoint-design-revision.ts';

export const CONSERVED_DESIGN_BUDGET = 'conserved-initial-unused/1' as const;
export type ConservedDesignBudgetPolicy = typeof CONSERVED_DESIGN_BUDGET;
export const revisionPlanReference: ArtifactReference = { artifactId: 'ordinary-design-revision-plan', version: 'v2', location: 'ordinary-design-revision-plan.json' };
export const budgetDigest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export async function budgetJson(root: string, path: string): Promise<any> { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, path))); }
export async function optionalBudgetJson(root: string, path: string): Promise<any | undefined> {
  try { return await budgetJson(root, path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
export function budgetFields(value: unknown, fields: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !sameValue(Object.keys(value).sort(), [...fields].sort())) throw new Error('Ordinary design budget fields changed.');
}
export interface OrdinaryBudgetOwnerStart {
  owner: { token: string; pid: number; acquiredAt: string }; reference: ArtifactReference; sha256: string;
}
export interface OrdinaryDesignBudgetIntent {
  formatVersion: 'ordinary-design-budget-intent/1'; policy: ConservedDesignBudgetPolicy; activationId: string;
  runId: string; ledgerId: string; originalStartedAt: string; originalDeadlineAt: string; limitMicroCny: number;
  fundingId: string; authorizationSha256: string; sourceTaskId: string; sourceAttemptId: string; targetTaskId: string;
  sourceGrantMicroCny: number; sourceSettledMicroCny: number; unusedMicroCny: number; baseMicroCny: number; targetMicroCny: number;
  executionSha256: string; nativePlanSha256: string; planningSha256: string; feedbackSha256: string; sourceReceipts: Record<string, string>;
  sourceRequests: { entry: BudgetLedger['entries'][number]; request: RunSnapshot['requests'][number] }[];
}
export interface OrdinaryDesignBudgetActivation {
  formatVersion: 'ordinary-design-budget-activation/1'; budget: OrdinaryDesignBudgetIntent; planSha256: string;
  basisRevision: number; activatedAt: string; ownerStart: OrdinaryBudgetOwnerStart; epoch: number;
}
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function ordinaryBudgetOwners(state: RunSnapshot): OrdinaryBudgetOwnerStart[] {
  const starts: OrdinaryBudgetOwnerStart[] = [];
  for (const event of state.events.filter(row => row.type === 'ordinary_design_budget_owner_started')) {
    const start = JSON.parse(event.reason) as OrdinaryBudgetOwnerStart;
    budgetFields(start, ['owner', 'reference', 'sha256']); budgetFields(start.owner, ['token', 'pid', 'acquiredAt']);
    if (state.formatVersion !== 1 || state.run.kind !== 'runtime_generation' || state.ledger.scope !== 'generation' || !state.validationFunding
      || !['1.0.0', '6.0.0'].includes(state.ledger.contractVersion) || event.requestId !== null || !hash(start.sha256)
      || !/^[a-f0-9-]{36}$/.test(start.owner.token) || !Number.isSafeInteger(start.owner.pid) || start.owner.pid <= 0 || !time(start.owner.acquiredAt)
      || !sameValue(start.reference, ownerStartReference(start.owner.token)) || starts.some(row => row.owner.token === start.owner.token)) throw new Error('Invalid ordinary design budget owner history.');
    starts.push(start);
  }
  return starts;
}
export const ownerStartReference = (token: string): ArtifactReference => ({ artifactId: 'ordinary-design-budget-owner', version: token, location: `ordinary-design-budget-lifecycle/owner-${token}-started.json` });
export const ownerCloseLocation = (token: string) => `ordinary-design-budget-lifecycle/owner-${token}-closed.json`;
export function ownerStartContents(state: RunSnapshot, owner: OrdinaryBudgetOwnerStart['owner']) {
  const funding = state.validationFunding;
  if (!funding) throw new Error('Ordinary design budget requires authenticated public funding.');
  return { formatVersion: 'ordinary-design-budget-owner/1', policy: CONSERVED_DESIGN_BUDGET, runId: state.run.runId, ledgerId: state.ledger.ledgerId,
    fundingId: funding.fundingId, authorizationSha256: funding.authorizationSha256, owner };
}
/** Positive provenance, not the no-funding success path of the existing verifier. */
export async function authenticatedOrdinaryFunding(root: string, state: RunSnapshot): Promise<boolean> {
  const { readPublicFundingIntent, verifyPublicValidationFunding } = await import('./public-validation-funding.ts');
  const intent = await readPublicFundingIntent(root);
  await verifyPublicValidationFunding({ root, snapshot: state, dispatch: true });
  if (!intent) return false;
  if (!sameValue(intent.binding, state.validationFunding)) throw new Error('Ordinary funding identity changed.');
  return true;
}
export async function readConservedBudgetPolicy(root: string, execution: OrdinaryExecution, state: RunSnapshot): Promise<ConservedDesignBudgetPolicy | undefined> {
  const selected = execution.ordinaryDesignRevisionBudgetPolicy, planning = await optionalBudgetJson(root, 'planning-started.json');
  if (selected === undefined && planning?.ordinaryDesignRevisionBudgetPolicy === undefined) return undefined;
  if (selected !== CONSERVED_DESIGN_BUDGET || planning?.ordinaryDesignRevisionBudgetPolicy !== selected || !state.validationFunding
    || execution.capability !== 'ordinary-design-execution/1' || execution.ordinaryDesignRevisionPolicy !== 'independent-review/2'
    || execution.ordinaryDesignBudgetPolicy !== 'review-reserve/1' || execution.authorProtocolCorrections !== 1
    || planning.runId !== state.run.runId || planning.ledgerId !== state.ledger.ledgerId || !sameValue(planning.requirement, execution.requirement)
    || planning.capability !== execution.capability || !sameValue(planning.ordinaryDesignBudgetFunding, { fundingId: state.validationFunding.fundingId, authorizationSha256: state.validationFunding.authorizationSha256 })
    || !ordinaryBudgetOwners(state).some(start => sameValue(start, planning.ordinaryDesignBudgetOwner))) throw new Error('Frozen ordinary design revision budget policy changed.');
  return selected;
}
function sourceRequests(state: RunSnapshot, taskId: string) {
  return state.ledger.entries.filter(entry => entry.taskId === taskId).map(entry => {
    const request = state.requests.find(row => row.requestId === entry.requestId);
    if (!request || entry.unknown || entry.reservedMicroCny || !['settled', 'cancelled'].includes(entry.status)) throw new Error('Initial design accounting is not reconciled.');
    return { entry: structuredClone(entry), request: structuredClone(request) };
  });
}
export async function deriveDesignBudgetIntent(root: string, state: RunSnapshot, execution: OrdinaryExecution,
  bindings: { executionSha256: string; nativePlanSha256: string }, feedback: { sourceTaskId: string; sourceAttemptId: string; receipts: Record<string, string> }, feedbackSha256: string): Promise<OrdinaryDesignBudgetIntent> {
  await readConservedBudgetPolicy(root, execution, state);
  const source = execution.tasks.find(item => item.role === 'design')!, grant = state.ledger.allocations.find(row => row.taskId === source.task.taskId);
  const requests = sourceRequests(state, feedback.sourceTaskId), spent = requests.reduce((sum, row) => sum + row.entry.settledMicroCny, 0);
  const base = Math.floor((state.ledger.limitMicroCny - state.ledger.allocations.filter(row => ['intake', 'planning'].includes(row.taskId)).reduce((sum, row) => sum + row.amountMicroCny, 0)) * .20);
  if (!grant || grant.amountMicroCny !== source.task.budget.allocationMicroCny || source.task.taskId !== feedback.sourceTaskId || base <= 0
    || ![base, spent, grant.amountMicroCny, base + grant.amountMicroCny - spent].every(Number.isSafeInteger) || spent > grant.amountMicroCny) throw new Error('Invalid conserved design allocation.');
  const payload = { formatVersion: 'ordinary-design-budget-intent/1' as const, policy: CONSERVED_DESIGN_BUDGET,
    runId: state.run.runId, ledgerId: state.ledger.ledgerId, originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt, limitMicroCny: state.ledger.limitMicroCny,
    fundingId: state.validationFunding!.fundingId, authorizationSha256: state.validationFunding!.authorizationSha256,
    sourceTaskId: source.task.taskId, sourceAttemptId: feedback.sourceAttemptId, targetTaskId: `${source.task.taskId.slice(0, 54)}-revision`,
    sourceGrantMicroCny: grant.amountMicroCny, sourceSettledMicroCny: spent, unusedMicroCny: grant.amountMicroCny - spent, baseMicroCny: base, targetMicroCny: base + grant.amountMicroCny - spent,
    ...bindings, planningSha256: budgetDigest(await regularFile(root, 'planning-started.json')), feedbackSha256, sourceReceipts: feedback.receipts, sourceRequests: requests };
  return { ...payload, activationId: `design-budget-${budgetDigest(JSON.stringify(payload))}` };
}
/** Pure committed-data validation; async provenance is checked before authority is used. */
export function validateOrdinaryDesignBudget(state: RunSnapshot) {
  const owners = ordinaryBudgetOwners(state), receipt = state.ordinaryDesignRevisionBudgetActivation;
  const events = state.events.filter(row => row.type === 'ordinary_design_revision_budget_activated');
  if (state.ledger.contractVersion !== '6.0.0') {
    if (receipt !== undefined || events.length) throw new Error('Ordinary budget activation requires its own ledger profile.');
    return;
  }
  if (!receipt) throw new Error('Ordinary design budget activation is missing.');
  budgetFields(receipt, ['formatVersion', 'budget', 'planSha256', 'basisRevision', 'activatedAt', 'ownerStart', 'epoch']);
  const b = receipt.budget, { activationId, ...payload } = b;
  budgetFields(b, ['formatVersion', 'policy', 'activationId', 'runId', 'ledgerId', 'originalStartedAt', 'originalDeadlineAt', 'limitMicroCny', 'fundingId', 'authorizationSha256',
    'sourceTaskId', 'sourceAttemptId', 'targetTaskId', 'sourceGrantMicroCny', 'sourceSettledMicroCny', 'unusedMicroCny', 'baseMicroCny', 'targetMicroCny',
    'executionSha256', 'nativePlanSha256', 'planningSha256', 'feedbackSha256', 'sourceReceipts', 'sourceRequests']);
  const source = state.tasks.find(task => task.taskId === b.sourceTaskId), target = state.tasks.find(task => task.taskId === b.targetTaskId);
  if (state.formatVersion !== 1 || state.run.kind !== 'runtime_generation' || !state.validationFunding || state.continuation
    || receipt.formatVersion !== 'ordinary-design-budget-activation/1' || b.formatVersion !== 'ordinary-design-budget-intent/1' || b.policy !== CONSERVED_DESIGN_BUDGET
    || activationId !== `design-budget-${budgetDigest(JSON.stringify(payload))}` || !hash(receipt.planSha256) || !time(receipt.activatedAt)
    || !Number.isSafeInteger(receipt.basisRevision) || receipt.basisRevision < 1 || receipt.basisRevision >= state.revision || !Number.isSafeInteger(receipt.epoch) || receipt.epoch < 0
    || !owners.some(start => sameValue(start, receipt.ownerStart)) || ![b.executionSha256, b.nativePlanSha256, b.planningSha256, b.feedbackSha256, b.authorizationSha256, ...Object.values(b.sourceReceipts)].every(hash)
    || b.runId !== state.run.runId || b.ledgerId !== state.ledger.ledgerId || b.originalStartedAt !== state.run.originalStartedAt || b.originalDeadlineAt !== state.run.originalDeadlineAt || b.limitMicroCny !== state.ledger.limitMicroCny
    || b.fundingId !== state.validationFunding.fundingId || b.authorizationSha256 !== state.validationFunding.authorizationSha256
    || ![b.sourceGrantMicroCny, b.sourceSettledMicroCny, b.unusedMicroCny, b.baseMicroCny, b.targetMicroCny].every(value => Number.isSafeInteger(value) && value >= 0)
    || b.sourceGrantMicroCny <= 0 || b.baseMicroCny <= 0 || b.unusedMicroCny !== b.sourceGrantMicroCny - b.sourceSettledMicroCny || b.targetMicroCny !== b.baseMicroCny + b.unusedMicroCny
    || !source || source.state !== 'needs_changes' || source.review.verdict !== 'changes_requested' || source.attempts.length !== 1 || source.attempts[0].attemptId !== b.sourceAttemptId || source.attempts[0].outcome !== 'passed' || !source.attempts[0].endedAt
    || !target || b.targetTaskId !== `${b.sourceTaskId.slice(0, 54)}-revision` || target.budget.allocationMicroCny !== b.targetMicroCny
    || state.ledger.allocations.find(row => row.taskId === b.sourceTaskId)?.amountMicroCny !== b.sourceGrantMicroCny
    || !sameValue(state.ledger.allocationClosures, [{ taskId: b.sourceTaskId, decisionId: b.activationId, releasedMicroCny: b.unusedMicroCny }])
    || !sameValue(sourceRequests(state, b.sourceTaskId), b.sourceRequests) || b.sourceSettledMicroCny !== b.sourceRequests.reduce((sum, row) => sum + row.entry.settledMicroCny, 0)
    || events.length !== 1 || events[0].at !== receipt.activatedAt || events[0].reason !== b.activationId || events[0].requestId !== null) throw new Error('Invalid ordinary design budget activation.');
}
export async function verifyOrdinaryDesignRevisionBudget(root: string, state: RunSnapshot) {
  validateOrdinaryDesignBudget(state);
  if (!state.ordinaryDesignRevisionBudgetActivation) return;
  const receipt = state.ordinaryDesignRevisionBudgetActivation, execution = await budgetJson(root, 'execution.json') as OrdinaryExecution;
  const { readDesignRevisionPlan } = await import('./entrypoint-design-revision.ts');
  const plan = await readDesignRevisionPlan(root, { read: async () => structuredClone(state) }, execution);
  if (!plan?.budget || !sameValue(plan.budget, receipt.budget) || budgetDigest(await regularFile(root, revisionPlanReference.location)) !== receipt.planSha256) throw new Error('Ordinary design activation source changed.');
  for (const start of ordinaryBudgetOwners(state)) {
    const bytes = await regularFile(root, start.reference.location);
    if (budgetDigest(bytes) !== start.sha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), ownerStartContents(state, start.owner))) throw new Error('Ordinary design owner provenance changed.');
  }
}
/** Only the new profile subtracts its closure in legacy allocation consumers. */
export function ordinaryUnallocated(ledger: BudgetLedger): number {
  return ledger.limitMicroCny - (ledger.contractVersion === '6.0.0' ? budgetCapacity(ledger).allocatedMicroCny : ledger.allocations.reduce((sum, row) => sum + row.amountMicroCny, 0));
}
