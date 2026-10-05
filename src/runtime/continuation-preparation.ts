import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { ArtifactRegistry } from '../artifacts/index.ts';
import { regularFile, within } from '../artifacts/paths.ts';
import { sameValue, validateTask } from '../contracts/validation.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/types.ts';
import { confirmRequirements, validateGameDraft } from '../roles/requirements.ts';
import { modeFromSelection } from '../roles/preparation-mode.ts';
import { executionSource, requireExecutionSource } from './entrypoint-human-preparation.ts';
import { TaskJournal, requireOriginalTask, RecoveryBlocked } from './recovery/task-journal.ts';
import type { PreparedTask } from './orchestrator.ts';
import type { RunSnapshot, ExecutionWindow } from './run-types.ts';
import { verifyPreparedTransferAcceptance } from './adapters/transfer/binding.ts';
import { validateTransferDesign } from './adapters/transfer/oracle.ts';

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const canonical = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const requireThat = (condition: unknown, message: string): void => { if (!condition) throw new RecoveryBlocked(`Human continuation: ${message}`); };
const time = (value: string) => { requireThat(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'invalid original timestamp'); return Date.parse(value); };
export interface HumanContinuationPreparation {
  formatVersion: 'human-continuation-preparation/1'; adapterId: 'cos16-input/1';
  runId: string; ledgerId: string; windowId: string; decisionId: string; sourceTaskId: string; taskId: string;
  candidate: ArtifactReference; plans: [ArtifactReference, ArtifactReference]; primaryPlan: ArtifactReference;
  originalPrimaryPlan: ArtifactReference; originalSources: { path: string; sha256: string }[];
}

/** Same-run passed proof only. This never asks a stopped historical task for active authority. */
export async function readHumanContinuationLineage(root: string, state: RunSnapshot) {
  const optional = async (path: string) => { try { return await regularFile(root, path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } };
  const decision = state.run.humanDecisions.find(item => item.decisionId.startsWith('requirements-v'));
  const modeBytes = await optional('intake-mode.json'), confirmedDraft = decision?.evidence[0] && decode(await regularFile(root, decision.evidence[0].location));
  const originalSource = await optional('host-human-preparation-source.json'), originalExecution = await optional('execution.json');
  const expectedPreparation = !!originalSource || confirmedDraft && Object.hasOwn(confirmedDraft, 'preparation')
    || originalExecution && decode(originalExecution).capability === 'browser-design-input-preparation-v1';
  const mode = modeBytes && decode(modeBytes);
  if (!expectedPreparation && (!mode || modeFromSelection(mode.draftMode) === 'browser')) return undefined;
  requireThat(modeBytes && mode && modeFromSelection(mode.draftMode) === 'cos16-input/1', 'original preparation mode is missing or inconsistent');
  requireThat([1, 2].includes(state.formatVersion as number) && state.run.kind === 'runtime_generation' && state.ledger.scope === 'generation'
    && state.ledger.limitMicroCny === 200_000_000, 'original formal human scope required');
  requireThat(sameValue(mode, { runId: state.run.runId, createdAt: state.events[0].at, draftMode: mode.draftMode }), 'intake mode changed');
  const sources: HumanContinuationPreparation['originalSources'] = [];
  const read = async (name: string) => { const absolute = resolve(root, name); requireThat(absolute !== resolve(root) && within(root, absolute), 'source escapes original run');
    const path = relative(root, absolute).split(sep).join('/'), bytes = await regularFile(root, path); sources.push({ path, sha256: hash(bytes) }); return bytes; };
  await read('intake-mode.json');
  requireThat(decision && decision.evidence.length === 2, 'original human requirement confirmation missing');
  const refs = decision!.evidence, draft = decode(await read(refs[0].location)), confirmation = decode(await read(refs[1].location));
  validateGameDraft(draft, modeFromSelection(mode.draftMode));
  requireThat(draft.preparation && !draft.unsupported.length && confirmation.runId === state.run.runId
    && confirmation.actorId === decision!.actorId && confirmation.at === decision!.decidedAt, 'human confirmation changed');
  const requirement = confirmRequirements({ ...draft, specVersion: state.run.specVersion, sources: refs }, confirmation);
  const sourceBytes = await read('host-human-preparation-source.json'), source = decode(sourceBytes);
  const execution = decode(await read('execution.json')), native = decode(await read(execution.plan.location));
  requireThat(sameValue(execution.requirement, requirement) && native.status === 'validated_proposal' && native.specVersion === requirement.specVersion
    && sameValue(native.tasks, execution.tasks) && execution.capability === 'browser-design-input-preparation-v1', 'sealed original execution changed');
  requireThat(Array.isArray(execution.tasks) && execution.tasks.length === 3, 'exact original role tasks required');
  const originals = execution.tasks as PreparedTask[];
  requireThat(new Set(originals.map(item => item.role)).size === 3 && ['design', 'art', 'coding'].every(role => originals.some(item => item.role === role)), 'original role binding changed');
  const coding = originals.find(item => item.role === 'coding')!, design = originals.find(item => item.role === 'design')!, art = originals.find(item => item.role === 'art')!;
  requireThat(sourceBytes.equals(canonical({ formatVersion: 'human-preparation-source/1', runId: state.run.runId, ledgerId: state.ledger.ledgerId,
    specVersion: state.run.specVersion, startedAt: state.run.originalStartedAt, deadlineAt: state.run.originalDeadlineAt, requirement,
    sources: [{ location: refs[0].location, sha256: hash(canonical(draft)) }, { location: refs[1].location, sha256: hash(canonical(confirmation)) },
      { location: 'intake-mode.json', sha256: hash(modeBytes!) }], execution: source.execution })), 'original source receipt changed');
  requireThat((await regularFile(root, refs[0].location)).equals(canonical(draft)) && (await regularFile(root, refs[1].location)).equals(canonical(confirmation)), 'original confirmation bytes changed');
  await requireExecutionSource(source.execution);
  requireThat(sameValue(source.execution, await executionSource(root)), 'original execution installation changed; platform migration is unsupported');
  const tasksBytes = await read('host-human-preparation-tasks.json');
  requireThat(tasksBytes.equals(canonical({ formatVersion: 'human-preparation-tasks/1', runId: state.run.runId, ledgerId: state.ledger.ledgerId,
    sourceSha256: source.execution.sha256, tasks: originals, repairTaskId: `${coding.task.taskId.slice(0, 57)}-repair` })), 'original task receipt changed');
  let effectiveCoding = coding;
  try {
    const repair = decode(await read('repair-plan.json'));
    const mappings = repair.formatVersion === 2 ? repair.replacements : [{ sourceTaskId: repair.sourceTaskId, replacementTaskId: repair.replacementTaskId }];
    requireThat(Array.isArray(mappings) && mappings.length === 1 && mappings[0].sourceTaskId === coding.task.taskId
      && mappings[0].replacementTaskId === `${coding.task.taskId.slice(0, 57)}-repair`, 'only the registered original coding repair is reusable');
    effectiveCoding = repair.tasks.find((item: PreparedTask) => item.task.taskId === mappings[0].replacementTaskId);
    requireThat(effectiveCoding?.role === 'coding' && sameValue(effectiveCoding.expectedArtifacts, [new ArtifactRegistry(root, 'registry').candidateRef('game', 'v2')]), 'original repair source mapping changed');
    requireOriginalTask(effectiveCoding.task, state.tasks.find(item => item.taskId === effectiveCoding.task.taskId)!);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const effectiveIds = new Set([design.task.taskId, art.task.taskId, effectiveCoding.task.taskId]);
  const currentIds = new Set(state.continuation?.windows.flatMap(window => window.grants.map(grant => grant.taskId)) ?? []);
  requireThat(state.tasks.filter(item => !currentIds.has(item.taskId) && item.state !== 'passed' && item.taskId !== (effectiveCoding === coding ? '' : coding.task.taskId)).length === 1
    && state.tasks.filter(item => effectiveIds.has(item.taskId)).length === 3
    && state.tasks.find(item => item.taskId === effectiveCoding.task.taskId)?.state !== 'passed', 'exactly one unfinished coding target required');
  const registry = new ArtifactRegistry(root, 'registry'), journals = new Map<string, TaskJournal>();
  for (const item of originals) {
    const task = state.tasks.find(task => task.taskId === item.task.taskId);
    requireThat(task && !validateTask(item.task).length && item.task.state === 'not_started' && resolve(item.workspace) === resolve(root), 'original prepared contract invalid');
    requireOriginalTask(item.task, task!);
    if (item.role === 'coding') continue;
    const current = task!, attempt = current.attempts[0];
    requireThat(current.state === 'passed' && current.review.verdict === 'approved' && current.attempts.length === 1 && attempt.outcome === 'passed'
      && !current.handoff.remaining.length && !current.handoff.uncertainty.length && sameValue(current.artifacts, item.expectedArtifacts), 'design and art must already be passed');
    requireThat(time(state.run.originalStartedAt) <= time(attempt.startedAt) && time(attempt.startedAt) <= time(attempt.endedAt!)
      && time(attempt.endedAt!) < time(state.run.originalDeadlineAt) && time(attempt.endedAt!) <= Date.now(), 'passed attempt exceeds original window');
    const folder = `journal/task-${encodeURIComponent(current.taskId)}`;
    const origin = decode(await read(`${folder}/origin.json`));
    requireThat(sameValue(origin, { formatVersion: 1, runId: state.run.runId, ledgerId: state.ledger.ledgerId,
      originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt, limitMicroCny: 200_000_000,
      requirement, prepared: item, reviewProtocolCorrections: 1, artifactRoot: resolve(root), sessionRoot: join(root, 'sessions') }), 'passed origin changed');
    const journal = await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, origin, true); journals.set(current.taskId, journal);
    for (const phase of ['author', 'capture-started', 'capture', 'verify-started', 'verified', 'review-started', 'review'] as const) {
      await read(`${folder}/${phase}.json`); requireThat(await journal.read(phase, attempt.attemptId), 'passed phase receipt missing');
    }
    const author = (await journal.read<any>('author', attempt.attemptId))!, capture = (await journal.read<any>('capture', attempt.attemptId))!;
    const verified = (await journal.read<any>('verified', attempt.attemptId))!, begun = (await journal.read<any>('review-started', attempt.attemptId))!, review = (await journal.read<any>('review', attempt.attemptId))!;
    requireThat(author.proposal?.summary?.trim() && sameValue(author.proposal.remaining, []) && sameValue(author.proposal.uncertainty, []), 'passed author handoff incomplete');
    await journal.requireSignature(author.signature, current.inputs);
    requireThat(sameValue(capture.captured, { artifacts: current.artifacts, reviewWorkspace: join(root, `reviews/${current.taskId}`) }) && sameValue(verified.evidence, current.evidence), 'passed capture or evidence changed');
    await journal.requireSignature(capture.signature, current.artifacts);
    const proofRefs = [...current.inputs, ...current.artifacts, ...current.evidence.map(item => item.source)];
    await journal.requireSignature(verified.signature, proofRefs); await journal.requireSignature(review.signature, proofRefs);
    requireThat(review.reviewerId === current.review.reviewerId && review.contextId === current.review.contextId
      && begun.reviewerId === review.reviewerId && begun.contextId === review.contextId && review.reviewerId !== current.authorId && review.contextId !== current.context.contextId
      && review.completedAt === attempt.endedAt && sameValue(current.review.inputVersions, [...current.inputs, ...current.artifacts])
      && sameValue(review.verdict, { verdict: 'approved', inputVersions: current.review.inputVersions, evidenceIds: current.review.evidenceIds, findings: [] }), 'independent passed review changed');
    for (const acceptanceId of current.acceptanceIds) {
      const fixed = requirement.acceptance.find(item => item.acceptanceId === acceptanceId)!;
      requireThat(current.evidence.some(e => current.review.evidenceIds.includes(e.evidenceId) && e.outcome === 'passed' && e.acceptanceIds.includes(acceptanceId)
        && fixed.evidenceKinds.includes(e.kind) && [...current.inputs, ...current.artifacts].every(ref => e.artifactVersions.some(actual => sameValue(actual, ref)))), 'passed evidence does not cover fixed versions');
    }
    for (const ref of current.artifacts) { const captured = await registry.getCapture(ref);
      requireThat(captured.taskId === current.taskId || captured.taskId === 'host-transfer-plan', 'passed capture author changed'); }
    for (const evidence of current.evidence.filter(e => e.kind === 'test_report' && e.outcome === 'passed')) requireThat(sameValue(decode(await regularFile(root, evidence.source.location)).evidence, evidence), 'actual passed report changed');
  }
  const saved = decode(await read('host-transfer-prepared-inputs.json')), origin = decode(await read('host-transfer-origin.json'));
  const designTask = state.tasks.find(item => item.taskId === design.task.taskId)!, designAttempt = designTask.attempts[0], designJournal = journals.get(designTask.taskId)!;
  requireThat(saved.formatVersion === 'transfer-prepared-inputs/1' && saved.taskId === designTask.taskId && saved.attemptId === designAttempt.attemptId
    && saved.sessionRef === designAttempt.sessionRef && sameValue(design.expectedArtifacts, [registry.artifactRef('design', 'v1'), registry.artifactRef('transfer-design', 'v1'), registry.artifactRef('plan-v1', 'v1'), registry.artifactRef('plan-v2', 'v1')])
    && sameValue(saved.frozen.artifact, design.expectedArtifacts![1]) && saved.frozen.requirementProfile === 'human' && saved.frozen.preserveHostStages === true, 'original map binding changed');
  requireThat(sameValue(origin.binding, { profile: 'human', runId: state.run.runId, ledgerId: state.ledger.ledgerId, windowId: null,
    sourceVersion: source.execution.sourceVersion, sourceSha256: source.execution.sha256, requirementSha256: hash(JSON.stringify(requirement)), specVersion: requirement.specVersion }), 'original origin authority changed');
  const mapBytes = await regularFile(root, `${saved.frozen.artifact.location}/_cosmos/transfer-design.json`);
  requireThat(hash(mapBytes) === saved.frozen.designSha256, 'original map bytes changed');
  let previous: { result: any; completedAt: string; receipt: string } | undefined, passed = false;
  for (const check of [1, 2] as const) {
    const base = `host-transfer-design-validation/${designTask.taskId}/${designAttempt.attemptId}/check-${check}-`;
    let startedBytes: Buffer;
    try { startedBytes = await read(base + 'started.json'); }
    catch (error) { if (check === 2 && (error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
    const resultBytes = await read(base + 'result.json'), raw = await read(base + 'raw.json'), started = decode(startedBytes), completed = decode(resultBytes);
    requireThat(sameValue(started, { formatVersion: 'transfer-design-check-started/1', binding: { taskId: designTask.taskId, attemptId: designAttempt.attemptId,
      attemptStartedAt: designAttempt.startedAt, authorId: designTask.authorId, contextId: designTask.context.contextId, sessionRef: designAttempt.sessionRef,
      workspace: resolve(root), requirement, requirementCapture: saved.frozen.requirement, inputs: designTask.inputs,
      inputSignature: await designJournal.signature([...designTask.inputs, ...designTask.context.interfaces]) }, check, startedAt: started.startedAt,
      authority: { profile: 'human', sourceVersion: source.execution.sourceVersion, sourceSha256: source.execution.sha256, runId: state.run.runId,
        ledgerId: state.ledger.ledgerId, windowId: null, startedAt: state.run.originalStartedAt, deadlineAt: state.run.originalDeadlineAt },
      ...(check === 2 ? { previousReceipt: previous?.receipt } : {}), raw: { location: base + 'raw.json', present: true, sha256: hash(raw) } }), 'original semantic audit binding changed');
    requireThat(time(designAttempt.startedAt) <= time(started.startedAt) && time(started.startedAt) <= time(completed.completedAt)
      && time(completed.completedAt) < time(state.run.originalDeadlineAt) && time(completed.completedAt) <= time(designAttempt.endedAt!), 'semantic audit exceeds original attempt');
    requireThat(sameValue(completed, { formatVersion: 'transfer-design-check-result/1', startedSha256: hash(JSON.stringify(started)), completedAt: completed.completedAt,
      result: completed.result, resultSha256: hash(JSON.stringify(completed.result)) }), 'semantic audit result changed');
    if (check === 2) requireThat(previous && !previous.result.passed && previous.result.rewritesRemaining === 1 && time(previous.completedAt) <= time(started.startedAt), 'original semantic rewrite not authorized');
    const receipt = base + 'result.json#sha256=' + hash(resultBytes);
    if (completed.result.passed) {
      const map = validateTransferDesign(decode(raw), saved.frozen.requirement);
      requireThat(sameValue(completed.result, { passed: true, rewritesRemaining: 0, mapVersion: map.design.mapVersion }) && raw.equals(mapBytes)
        && (await registry.getCapture(saved.frozen.artifact)).metadata.provenance.sourceRefs.includes(receipt), 'sealed successful map changed'); passed = true;
    } else requireThat(check === 1 && completed.result.rewritesRemaining === 1 && completed.result.diagnosis?.kind === 'invalid_transfer_design', 'invalid original semantic rewrite result');
    previous = { result: completed.result, completedAt: completed.completedAt, receipt };
  }
  requireThat(passed && previous?.result.passed, 'original map has no complete successful semantic audit');
  for (const [index, version] of (['v1', 'v2'] as const).entries()) await verifyPreparedTransferAcceptance({ root, registry, frozen: saved.frozen,
    currentRequirement: { artifact: saved.frozen.requirement, specVersion: requirement.specVersion }, candidate: registry.candidateRef('game', version),
    planArtifact: design.expectedArtifacts![index + 2], url: origin.url, runId: state.run.runId, reportId: 'transfer-' + version,
    taskId: version === 'v1' ? coding.task.taskId : `${coding.task.taskId.slice(0, 57)}-repair`, prepared: saved.plans[version] });
  requireThat(sameValue(saved.plans.v1.segments.map((item: any) => item.plan.steps), saved.plans.v2.segments.map((item: any) => item.plan.steps)), 'original plan expectations differ');
  const media = await registry.getCapture(art.expectedArtifacts![0]), artTask = state.tasks.find(item => item.taskId === art.task.taskId)!;
  requireThat(sameValue(media.dependencies, [registry.artifactRef('generic-template', 'v1'), saved.frozen.requirement, design.expectedArtifacts![0], saved.frozen.artifact])
    && sameValue(media.metadata.provenance, { kind: 'original-procedural', generator: 'Native art role output', sourceRefs: [artTask.attempts[0].sessionRef, ...requirement.sources.map(ref => ref.location)] })
    && sameValue(decode(await regularFile(root, art.expectedArtifacts![0].location + '/public/assets/manifest.json')), media.metadata.media), 'original media closure changed');
  return { sources, requirement, draft, execution, source, originals, effectiveCoding, saved, design, art };
}

export async function deriveHumanContinuationPreparation(root: string, state: RunSnapshot, window: ExecutionWindow, tasks: PreparedTask[]) {
  const lineage = await readHumanContinuationLineage(root, state); if (!lineage) return undefined;
  for (const source of lineage.sources) requireThat(window.quote.auxiliarySources.some(fixed => sameValue(fixed, source)), 'quoted original preparation source changed');
  const grant = window.grants[0], coding = tasks.find(item => item.role === 'coding');
  requireThat(window.grants.length === 1 && grant.sourceTaskId === lineage.effectiveCoding.task.taskId && coding?.task.taskId === grant.taskId, 'current coding grant differs from original mapping');
  const registry = new ArtifactRegistry(root, 'registry'), plans: HumanContinuationPreparation['plans'] = [registry.artifactRef('plan-v1', window.windowId), registry.artifactRef('plan-v2', window.windowId)];
  const descriptor: HumanContinuationPreparation = { formatVersion: 'human-continuation-preparation/1', adapterId: 'cos16-input/1', runId: state.run.runId,
    ledgerId: state.ledger.ledgerId, windowId: window.windowId, decisionId: window.decisionId, sourceTaskId: grant.sourceTaskId, taskId: grant.taskId,
    candidate: registry.candidateRef('game', window.windowId), plans, primaryPlan: plans[0],
    originalPrimaryPlan: lineage.design.expectedArtifacts![lineage.effectiveCoding === lineage.originals.find(item => item.role === 'coding') ? 2 : 3], originalSources: lineage.sources };
  requireThat(sameValue(coding!.expectedArtifacts, [descriptor.candidate]), 'current candidate differs from quoted coding output');
  return descriptor;
}
