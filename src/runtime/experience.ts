import { createHash, randomUUID } from 'node:crypto';
import { lstat, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ArtifactRegistry } from '../artifacts/index.ts';
import type { AcceptedCandidate } from '../artifacts/index.ts';
import { directory, regularFile, safePath } from '../artifacts/paths.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { readRunSnapshot } from '../cli/control.ts';
import { OwnerLock } from './recovery/ownership.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { readCompletionTiming } from './completion-timing.ts';

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const deliveryTaskProofs = (tasks: TaskContract[]) => tasks.map(task => ({ taskId: task.taskId, attemptId: task.attempts.at(-1)?.attemptId ?? null, artifacts: task.artifacts, review: task.review }));
interface Scope { capability: string; acceptance: RequirementContract['acceptance']; notCovered: string[] }
interface Report {
  formatVersion: 'generation-report-1'; reportedAt: string; automaticAcceptance: 'passed' | 'not_passed';
  outcome: string; runId: string; ledgerId: string; windowId: string | null; delivery?: string; gaps: string[];
  acceptedCandidate?: AcceptedCandidate; acceptanceScope: Scope; effectiveTasks: ReturnType<typeof deliveryTaskProofs>;
  requiresCompletionTiming?: true;
}
export interface ExperienceBinding {
  runId: string; ledgerId: string; windowId: string | null; report: ArtifactReference; reportSha256: string;
  acceptedCandidate: AcceptedCandidate; acceptanceScope: Scope; effectiveTasks: Report['effectiveTasks'];
}
interface ExperienceReceipt {
  formatVersion: 'user-experience-1'; bindingId: string; binding: ExperienceBinding; actorId: 'local-user'; decidedAt: string;
  decision: 'approved' | 'rejected'; source: { kind: 'cli-stdin'; command: 'experience'; rawInput: string };
}

/** The host already owns the run writer here; publication must not reacquire it. */
export async function publishGenerationReport<T extends { outcome: string; runId: string; ledgerId: string; windowId?: string }>(root: string, outcome: T, scope: { capability: string; requirement: RequirementContract; unsupported: string[] }) {
  await directory(root, 'delivery');
  const version = randomUUID(), report: ArtifactReference = { artifactId: 'automated-delivery-report', version, location: `delivery/report-${version}.json` };
  const value = { ...outcome, formatVersion: 'generation-report-1', reportedAt: new Date().toISOString(), windowId: outcome.windowId ?? null,
    automaticAcceptance: outcome.outcome === 'awaiting_user_experience' ? 'passed' : 'not_passed', finalCompletion: 'pending',
    acceptanceScope: { capability: scope.capability, acceptance: scope.requirement.acceptance, notCovered: [...scope.unsupported,
      '仅覆盖上述确认需求及固定正常输入路径；本报告不证明完整经典 PC 基准通过。', '手感、美术辨识度、听感和整体体验由用户最终试玩。'] } };
  await publishReceipt(await safePath(root, report.location), value);
  const marker = { formatVersion: 1, report, sha256: sha256(await regularFile(root, report.location)) }, temporary = `delivery/.current-${randomUUID()}.tmp`;
  try {
    await publishReceipt(await safePath(root, temporary), marker);
    await rename(await safePath(root, temporary), await safePath(root, 'delivery/current-report.json'));
  } finally { await unlink(join(root, temporary)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
  return { ...value, report: report.location };
}

async function currentReport(root: string) {
  const marker = decode(await regularFile(root, 'delivery/current-report.json'));
  if (marker?.formatVersion !== 1 || marker.report?.artifactId !== 'automated-delivery-report' || !/^[\da-f-]{36}$/.test(marker.report?.version)
    || marker.report.location !== `delivery/report-${marker.report.version}.json` || !/^[\da-f]{64}$/.test(marker.sha256)) throw new Error('Current automatic report reference is invalid.');
  const bytes = await regularFile(root, marker.report.location);
  if (sha256(bytes) !== marker.sha256) throw new Error('Immutable automatic report hash changed.');
  const report = decode(bytes) as Report;
  if (report?.formatVersion !== 'generation-report-1' || !timestamp(report.reportedAt) || !['passed', 'not_passed'].includes(report.automaticAcceptance)
    || !Array.isArray(report.gaps) || !Array.isArray(report.effectiveTasks) || !report.acceptanceScope?.capability
    || !Array.isArray(report.acceptanceScope.acceptance) || !report.acceptanceScope.acceptance.length || !Array.isArray(report.acceptanceScope.notCovered)) throw new Error('Automatic report has no verifiable experience contract.');
  return { marker, report };
}
export { currentReport as readAutomaticReport };

/** Reads only host evidence; it cannot authorize tasks, change time or settle a charge. */
export async function loadExperienceBinding(root: string): Promise<ExperienceBinding> {
  root = resolve(root);
  const state = await readRunSnapshot(root);
  if (![1, 2].includes(state.formatVersion as number) || state.run.kind !== 'runtime_generation' || state.ledger.scope !== 'generation') throw new Error('User experience requires an ordinary formal generation report; validation and intake are separate.');
  const { marker, report } = await currentReport(root), windowId = state.formatVersion === 2 ? state.continuation!.currentWindowId : null;
  if (report.runId !== state.run.runId || report.ledgerId !== state.ledger.ledgerId || report.windowId !== windowId) throw new Error('Automatic report belongs to another run or execution window.');
  if (report.automaticAcceptance !== 'passed' || report.outcome !== 'awaiting_user_experience' || report.gaps.length) throw new Error('Automatic acceptance has not passed.');
  const registry = new ArtifactRegistry(root, 'registry'), accepted = await registry.current();
  if (!accepted || !sameValue(accepted, report.acceptedCandidate) || report.delivery !== accepted.targetRoot) throw new Error('Matching current accepted candidate is required.');
  const candidate = await registry.getCandidate(accepted.candidateRef), prefix = accepted.candidateRef.location.slice(0, -'/project'.length);
  const attempt = decode(await regularFile(root, `${prefix}/attempt.json`)), seal = decode(await regularFile(root, `${prefix}/sealed.json`));
  const checked = (check: AcceptedCandidate['evidence']['build'] | undefined) => check?.passed === true && Array.isArray(check.evidenceIds) && check.evidenceIds.length > 0 && check.evidenceIds.every(id => typeof id === 'string' && !!id.trim());
  const review = accepted.review;
  if (!sameValue(seal?.candidateRef, accepted.candidateRef) || !sameValue(accepted.evidence?.candidateRef, accepted.candidateRef)
    || !checked(accepted.evidence.build) || !checked(accepted.evidence.acceptance) || !accepted.evidence.attemptId || attempt?.attemptId !== accepted.evidence.attemptId
    || !sameValue(review?.candidateRef, accepted.candidateRef) || review.attemptId !== accepted.evidence.attemptId || review.verdict !== 'approved'
    || !review.reviewerId || review.reviewerId === candidate.authorId || !review.contextId || review.contextId === candidate.contextId
    || !Array.isArray(review.evidenceIds) || !review.evidenceIds.length) throw new Error('Independent approved review and host acceptance for the exact candidate attempt are required.');
  if (!report.effectiveTasks.length || new Set(report.effectiveTasks.map(proof => proof.taskId)).size !== report.effectiveTasks.length) throw new Error('Automatic report task proof is incomplete.');
  const tasks = report.effectiveTasks.map(proof => state.formatVersion === 'intake-1' ? undefined : state.tasks.find(task => task.taskId === proof.taskId));
  if (tasks.some(task => !task || task.state !== 'passed' || task.attempts.at(-1)?.outcome !== 'passed' || task.review.verdict !== 'approved'
    || !task.review.reviewerId || task.review.reviewerId === task.authorId || !task.review.contextId || task.review.contextId === task.context.contextId)
    || !sameValue(deliveryTaskProofs(tasks as TaskContract[]), report.effectiveTasks)) throw new Error('Current tasks no longer match the independently approved automatic report.');
  const authorTask = tasks.find(task => task?.taskId === candidate.taskId);
  if (!authorTask || authorTask.authorId !== candidate.authorId || authorTask.context.contextId !== candidate.contextId
    || !authorTask.artifacts.some(ref => sameValue(ref, accepted.candidateRef)) || authorTask.review.reviewerId !== review.reviewerId
    || authorTask.review.contextId !== review.contextId || !sameValue(authorTask.review.evidenceIds, review.evidenceIds)) throw new Error('Candidate author and independent task review do not match the automatic report.');
  const scopeIds = report.acceptanceScope.acceptance.map(item => item.acceptanceId), taskIds = (tasks as TaskContract[]).flatMap(task => task.acceptanceIds);
  if (new Set(scopeIds).size !== scopeIds.length || scopeIds.some(id => !taskIds.includes(id)) || taskIds.some(id => !scopeIds.includes(id))) throw new Error('Automatic report acceptance scope does not match the approved tasks.');
  for (const file of candidate.files) {
    if (!(await regularFile(root, `${candidate.targetRoot}/${file.destination}`)).equals(await regularFile(root, `${file.artifactRef.location}/${file.destination}`))) throw new Error('Accepted candidate source changed after automatic acceptance.');
  }
  return { runId: report.runId, ledgerId: report.ledgerId, windowId, report: marker.report, reportSha256: marker.sha256,
    acceptedCandidate: accepted, acceptanceScope: report.acceptanceScope, effectiveTasks: report.effectiveTasks };
}
const bindingId = (binding: ExperienceBinding) => sha256(JSON.stringify(binding));
async function receipt(root: string, binding: ExperienceBinding): Promise<ExperienceReceipt | null> {
  const id = bindingId(binding); let value: ExperienceReceipt;
  try { value = decode(await regularFile(root, `delivery/experience/${id}.json`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (value?.formatVersion !== 'user-experience-1' || value.bindingId !== id || !sameValue(value.binding, binding) || value.actorId !== 'local-user'
    || !timestamp(value.decidedAt) || !['approved', 'rejected'].includes(value.decision) || value.source?.kind !== 'cli-stdin' || value.source.command !== 'experience'
    || typeof value.source.rawInput !== 'string' || value.source.rawInput.trim() !== (value.decision === 'approved' ? 'approve' : 'reject')) throw new Error('Experience receipt source or exact version binding is invalid; preserve the original receipt.');
  return value;
}
function view(binding: ExperienceBinding, decision: ExperienceReceipt | null) {
  return { automaticAcceptance: 'passed' as const, userExperience: decision?.decision ?? 'not_confirmed',
    finalCompletion: decision?.decision === 'approved' ? 'complete_for_report_scope' : 'pending',
    report: binding.report, reportSha256: binding.reportSha256, candidate: binding.acceptedCandidate.candidateRef, delivery: binding.acceptedCandidate.targetRoot,
    acceptanceScope: binding.acceptanceScope, decision };
}
export async function readBoundExperienceStatus(root: string, binding: ExperienceBinding) {
  const decision = await receipt(root, binding), completionTiming = await readCompletionTiming(root);
  const timingPassed = !completionTiming.required || completionTiming.eligible === true;
  const startedAt = completionTiming.current.endedAt ?? null;
  return { ...view(binding, decision), completionTiming, ...(!timingPassed ? { finalCompletion: 'pending' } : {}),
    humanWaiting: { startedAt, decidedAt: decision?.decidedAt ?? null, elapsedMs: startedAt ? Math.max(0, (decision ? Date.parse(decision.decidedAt) : Date.now()) - Date.parse(startedAt)) : null } };
}
/** Completed resume reads an existing delivery; it never reopens execution or republishes it. */
export async function readCompletedGeneration(root: string, requirement: RequirementContract) {
  root = resolve(root);
  let selected: Buffer;
  try { selected = await regularFile(root, 'delivery/current-report.json'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  const { marker, report } = await currentReport(root);
  if (report.automaticAcceptance !== 'passed' || !report.acceptedCandidate) return null;
  const snapshotBytes = await regularFile(root, 'snapshot.json'), state = await readRunSnapshot(root);
  if (state.formatVersion !== 1 && state.formatVersion !== 2) throw new Error('Completed delivery requires the original formal generation.');
  const stop = state.formatVersion === 2 ? state.continuation!.windows.find(window => window.windowId === state.continuation!.currentWindowId)!.stopReason : state.stopReason;
  if (stop && report.requiresCompletionTiming !== true) throw new Error(`Completed delivery run is durably stopped (${stop.code}); resume cannot clear it.`);
  if (state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)) throw new Error('Completed delivery charges require reconciliation; read-only resume cannot settle them.');
  const idle = async () => {
    for (const name of ['.controller.lock', 'registry/.commit.lock']) {
      const path = await safePath(root, name), owned = await lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
      if (owned) throw new Error('Completed delivery owner or registry writer is unresolved; read-only resume cannot recover it.');
    }
  };
  await idle();
  const { readConfirmedGeneration } = await import('../cli/session.ts'), confirmed = await readConfirmedGeneration(root, state);
  if (!sameValue(confirmed.requirement, requirement)) throw new Error('Completed delivery requires the original CLI requirement confirmation.');
  const binding = await loadExperienceBinding(root);
  if (!sameValue(binding.report, marker.report) || binding.reportSha256 !== marker.sha256 || !sameValue(binding.acceptanceScope.acceptance, requirement.acceptance)) throw new Error('Completed automatic report differs from the original confirmed acceptance or selected version.');
  const status = await readBoundExperienceStatus(root, binding);
  await idle();
  if (!selected.equals(await regularFile(root, 'delivery/current-report.json')) || !snapshotBytes.equals(await regularFile(root, 'snapshot.json'))) throw new Error('Completed delivery changed during read-only resume.');
  return { ...report, report: binding.report.location, userExperience: status.userExperience, finalCompletion: status.finalCompletion,
    completionTiming: status.completionTiming, humanWaiting: status.humanWaiting,
    ...(status.completionTiming.required && !status.completionTiming.eligible ? { outcome: 'incomplete' } : {}),
    experienceTiming: { automaticReportedAt: report.reportedAt, decidedAt: status.decision?.decidedAt ?? null,
      elapsedSinceAutomaticReportMs: Math.max(0, (status.decision ? Date.parse(status.decision.decidedAt) : Date.now()) - Date.parse(report.reportedAt)) } };
}
export async function readExperienceStatus(root: string) {
  try {
    const binding = await loadExperienceBinding(root);
    try { return await readBoundExperienceStatus(root, binding); }
    catch (error) { return { ...view(binding, null), reason: (error as Error).message }; }
  }
  catch (error) {
    let current: Awaited<ReturnType<typeof currentReport>> | undefined;
    try { current = await currentReport(root); } catch { /* Missing or legacy reports stay unverified. */ }
    return { automaticAcceptance: current?.report.automaticAcceptance === 'not_passed' ? 'not_passed' : 'unverified', userExperience: 'not_confirmed', finalCompletion: 'pending',
      report: current?.marker.report ?? null, acceptanceScope: current?.report.acceptanceScope ?? null, reason: (error as Error).message,
      completionTiming: current ? await readCompletionTiming(root).catch(() => ({ required: true, current: { status: 'unconfirmed' } })) : { required: false, current: { status: 'unverified' } } };
  }
}

/** Called only by the stdin collector. One complete write-once receipt is the durable decision. */
export async function recordExperience(root: string, expected: ExperienceBinding, rawInput: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const action = rawInput.trim();
  if (!['approve', 'reject'].includes(action) || rawInput.length > 4096) throw new Error('An explicit experience stdin decision is required.');
  root = resolve(root); await safePath(root, '.controller.lock');
  signal?.throwIfAborted();
  const runOwner = await OwnerLock.acquire(root, '.controller.lock');
  let registryOwner: OwnerLock | undefined;
  try {
    signal?.throwIfAborted();
    await safePath(root, 'registry/.commit.lock'); signal?.throwIfAborted();
    registryOwner = await OwnerLock.acquire(join(root, 'registry'), '.commit.lock'); signal?.throwIfAborted();
    const current = await loadExperienceBinding(root);
    const timing = await readCompletionTiming(root, true);
    if (action === 'approve' && timing.required && !timing.eligible) throw new Error('Completion timing is missing, late or unconfirmed; final approval is unavailable.');
    signal?.throwIfAborted();
    if (!sameValue(current, expected)) throw new Error('Current report or candidate changed while waiting; view and try the current version before deciding.');
    const existing = await receipt(root, current), decision = action === 'approve' ? 'approved' : 'rejected';
    signal?.throwIfAborted();
    if (existing) { if (existing.decision !== decision) throw new Error('Experience decision conflicts with the immutable original receipt.'); return view(current, existing); }
    const id = bindingId(current), value: ExperienceReceipt = { formatVersion: 'user-experience-1', bindingId: id, binding: current, actorId: 'local-user', decidedAt: new Date().toISOString(),
      decision, source: { kind: 'cli-stdin', command: 'experience', rawInput } };
    await directory(root, 'delivery/experience'); signal?.throwIfAborted();
    const path = await safePath(root, `delivery/experience/${id}.json`); signal?.throwIfAborted();
    await publishReceipt(path, value, signal);
    return view(current, value);
  } finally { try { await registryOwner?.close(); } finally { await runOwner.close(); } }
}
