import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createValidationPreparedBrowserHost } from '../../entrypoint-host.ts';
import type { BrowserInputPreparation, BrowserPreparationContext } from '../../entrypoint-preparation.ts';
import type { ArtifactReference, TaskContract } from '../../../contracts/index.ts';
import { directory, regularFile } from '../../../artifacts/paths.ts';
import { isValidationRequirement } from '../../../roles/execution-input.ts';
import type { ValidationRequirement } from '../../../roles/execution-input.ts';
import { HOST_STAGE_ACCEPTANCE } from '../../../roles/requirements.ts';
import { publishReceipt } from '../../recovery/receipt-file.ts';
import { HostFailure } from '../../repair/feedback.ts';
import { TaskJournal, requireOriginalTask } from '../../recovery/task-journal.ts';
import type { CapturedTask, ContentSignature, RecoveryOrigin } from '../../recovery/task-journal.ts';
import { TRANSFER_ACCEPTANCE_IDS, requireThat } from './design.ts';
import { createTransferDesignValidation } from './design-validation.ts';
import { freezeTransferDesign, prepareTransferAcceptance, verifyPreparedTransferAcceptance, bindTransferAcceptance } from './binding.ts';
import type { FrozenTransferDesign, FrozenTransferAcceptanceDraft, PrepareInput } from './binding.ts';
import { reserveTransferOrigin } from './loopback-origin.ts';
import { consumeTransferCandidate, diagnoseTransferBuild } from './runtime-acceptance.ts';
import type { HistoricalPassedStages } from '../../historical-passed-stages.ts';

type HostInput = Parameters<typeof createValidationPreparedBrowserHost>[0];
interface PreparedInputs {
  formatVersion: 'transfer-prepared-inputs/1'; taskId: string; attemptId: string; sessionRef: string;
  frozen: FrozenTransferDesign; plans: { v1: FrozenTransferAcceptanceDraft; v2: FrozenTransferAcceptanceDraft };
}
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

/** Runtime-generated data only. This module contains no map, solution, assets or game implementation. */
export async function createTransferRuntimeHost(input: Omit<HostInput, 'preparation'>) {
  if (input.historicalStages) throw new Error('Historical stages require the explicit source-owned reuse factory.');
  return createTransferHost(input, false);
}
/** Trusted source opt-in only; public/model inputs cannot choose an execution adapter. */
export async function createTransferConsumerHost(input: Omit<HostInput, 'preparation'>) {
  if (input.historicalStages) throw new Error('Historical stages require the explicit source-owned reuse factory.');
  return createTransferHost(input, true);
}
/** Trusted source opt-in; historical dependencies never obtain current author authority. */
export async function createTransferReusedConsumerHost(input: Omit<HostInput, 'preparation'> & { historicalStages: HistoricalPassedStages }) {
  if (!input.historicalStages) throw new Error('Fixed historical proof binding is required.');
  return createTransferHost(input, true);
}
async function createTransferHost(input: Omit<HostInput, 'preparation'>, consumer: boolean) {
  let ctx: BrowserPreparationContext, origin: Awaited<ReturnType<typeof reserveTransferOrigin>>;
  let transfer: ArtifactReference, planRefs: { v1: ArtifactReference; v2: ArtifactReference };
  let preparedPublished = false;
  let captureLayout: string;
  let designValidation: ReturnType<typeof createTransferDesignValidation>;
  const receiptFile = 'host-transfer-prepared-inputs.json';
  const guard = async () => { try { await ctx.requireScope(); await origin.verify(); } catch (error) { await origin.close(); throw error; } };
  const read = async (): Promise<PreparedInputs> => {
    await guard(); const saved = decode(await regularFile(ctx.root, receiptFile)) as PreparedInputs;
    requireThat(saved.formatVersion === 'transfer-prepared-inputs/1' && saved.taskId === ctx.designTaskId
      && typeof saved.attemptId === 'string' && !!saved.attemptId && typeof saved.sessionRef === 'string' && !!saved.sessionRef
      && isDeepStrictEqual(saved.frozen.artifact, transfer) && isDeepStrictEqual(saved.frozen.requirement, ctx.inherited?.verified.requirementCapture ?? ctx.requirementCapture)
      && saved.frozen.specVersion === ctx.requirement.specVersion && saved.frozen.requirementProfile === 'operator_validation'
      && saved.frozen.preserveHostStages === true, 'prepared design receipt changed');
    return saved;
  };
  const preparedInput = (saved: PreparedInputs, version: 'v1' | 'v2'): PrepareInput => {
    requireThat(isValidationRequirement(ctx.requirement), 'explicit validation requirement is missing');
    return { root: ctx.root, registry: ctx.registry, frozen: saved.frozen,
    currentRequirement: { artifact: ctx.inherited?.verified.requirementCapture ?? ctx.requirementCapture, specVersion: ctx.requirement.specVersion }, candidate: ctx.candidates[version], planArtifact: planRefs[version],
    url: origin.url, runId: ctx.requirement.validation.runId, reportId: ctx.name('transfer-' + version),
    ...(consumer ? { taskId: ctx.candidateTaskIds[version] } : {}) };
  };
  const verify = async (task?: TaskContract) => {
    const saved = await read();
    if (ctx.inherited) {
      const fixed = await ctx.inherited.binding.verify(ctx.signal);
      requireThat(isDeepStrictEqual(saved.frozen, fixed.frozen) && saved.taskId === fixed.stages[0].task.taskId
        && saved.attemptId === fixed.stages[0].task.attempts[0].attemptId && saved.sessionRef === fixed.stages[0].task.attempts[0].sessionRef,
        'inherited prepared design lineage changed');
      for (const version of ['v1', 'v2'] as const) await verifyPreparedTransferAcceptance({ ...preparedInput(saved, version), prepared: saved.plans[version] });
      requireThat(isDeepStrictEqual(saved.plans.v1.segments.map(item => item.plan.steps), saved.plans.v2.segments.map(item => item.plan.steps)), 'repair expectations changed');
      await guard(); return saved;
    }
    if (task) requireThat(saved.taskId === task.taskId && saved.attemptId === task.attempts.at(-1)?.attemptId && saved.sessionRef === task.attempts.at(-1)?.sessionRef,
      'design author attempt provenance changed');
    const capture = await ctx.registry.getCapture(transfer);
    requireThat(capture.taskId === saved.taskId && capture.metadata.provenance.sourceRefs.includes(saved.sessionRef), 'frozen design author provenance changed');
    const design = task ?? (await input.controller.read()).tasks.find(task => task.taskId === ctx.designTaskId);
    requireThat(design, 'original design validation task is missing');
    const sealed = await designValidation.seal(design);
    requireThat(saved.frozen.designSha256 === sealed.sha256 && capture.metadata.provenance.sourceRefs.includes(sealed.receipt), 'frozen design differs from its successful host validation');
    for (const version of ['v1', 'v2'] as const) await verifyPreparedTransferAcceptance({ ...preparedInput(saved, version), prepared: saved.plans[version] });
    requireThat(isDeepStrictEqual(saved.plans.v1.segments.map(item => item.plan.steps), saved.plans.v2.segments.map(item => item.plan.steps)), 'repair expectations changed');
    await guard(); return saved;
  };
  const requireCurrent = async () => {
    try {
      await guard();
      if (ctx.inherited) {
        const saved = await verify(), snapshot = await input.controller.read();
        for (const version of ['v1', 'v2'] as const) {
          const coding = snapshot.tasks.find(task => task.taskId === ctx.candidateTaskIds[version]);
          if (!coding?.artifacts.length) continue;
          const ref = ctx.candidates[version]; requireThat(isDeepStrictEqual(coding.artifacts, [ref]), 'current inherited coding candidate changed');
          const origin = decode(await regularFile(ctx.root, `journal/task-${coding.taskId}/origin.json`)) as RecoveryOrigin;
          requireThat(isDeepStrictEqual(origin.requirement, ctx.requirement) && isDeepStrictEqual(origin.prepared.expectedArtifacts, [ref]), 'current inherited coding origin changed');
          requireOriginalTask(origin.prepared.task, coding);
          const journal = await TaskJournal.open({ artifactRoot: ctx.root, journalRoot: join(ctx.root, 'journal') }, origin, true);
          const captured = await journal.read<{ captured: CapturedTask; signature: ContentSignature }>('capture', coding.attempts.at(-1)!.attemptId);
          requireThat(captured && isDeepStrictEqual(captured.captured.artifacts, [ref]) && captured.signature.length === 1, 'current inherited capture receipt missing');
          const candidate = await ctx.registry.getCandidate(ref), source = await ctx.registry.getCapture(ctx.registry.artifactRef(ctx.name('game-source'), version));
          const inputs = [ctx.inherited.verified.template, ctx.inherited.verified.requirementCapture, ctx.requirementCapture, ctx.primaryDesign, ctx.primaryMedia, transfer, planRefs[version]];
          requireThat(candidate.taskId === coding.taskId && candidate.authorId === coding.authorId && candidate.contextId === coding.context.contextId
            && source.taskId === coding.taskId && source.metadata.kind === 'code'
            && isDeepStrictEqual(source.metadata.provenance, { kind: 'original-procedural', generator: 'Native coding role output',
              sourceRefs: [coding.attempts.at(-1)!.sessionRef, ...ctx.requirement.sources.map(ref => ref.location)] })
            && isDeepStrictEqual(source.dependencies, inputs) && isDeepStrictEqual(candidate.inputs, [...inputs, source.artifactRef])
            && isDeepStrictEqual(candidate.expectedDeps, candidate.inputs) && isDeepStrictEqual(candidate.mediaRequirements,
              [{ artifactRef: ctx.primaryMedia, media: (await ctx.registry.getCapture(ctx.primaryMedia)).metadata.media }]), 'current inherited candidate dependency metadata changed');
          const fixed = captured.signature[0]; requireThat(fixed.location === ref.location && isDeepStrictEqual(candidate.files.map(file => file.destination).sort(), fixed.files.map(file => file.path).sort()), 'current inherited candidate inventory changed');
          for (const file of fixed.files) {
            const item = candidate.files.find(item => item.destination === file.path)!;
            requireThat([...coding.inputs, source.artifactRef].some(ref => isDeepStrictEqual(ref, item.artifactRef))
              && sha(await regularFile(ctx.root, ref.location + '/' + file.path)) === file.sha256
              && sha(await regularFile(ctx.root, item.artifactRef.location + '/' + file.path)) === file.sha256, 'current inherited candidate source bytes changed');
          }
        }
        requireThat(isDeepStrictEqual(saved.frozen, ctx.inherited.verified.frozen), 'inherited frozen map changed'); await guard(); return;
      }
      const snapshot = await input.controller.read(), design = snapshot.tasks.find(task => task.taskId === ctx.designTaskId);
      const complete = !!design && (design.artifacts.length > 0 || design.state === 'passed');
      if (!preparedPublished && !complete) {
        try { await regularFile(ctx.root, receiptFile); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
      }
      // verify/read use only the scope guard; they never recurse through this dispatch gate.
      const saved = await verify(design?.artifacts.length ? design : undefined);
      if (complete) {
        requireThat(design, 'captured design task is missing');
        const refs = [ctx.primaryDesign, transfer, planRefs.v1, planRefs.v2];
        const primary = await ctx.registry.getCapture(ctx.primaryDesign);
        requireThat(primary.taskId === saved.taskId && primary.metadata.kind === 'data'
          && primary.metadata.provenance.sourceRefs.includes(saved.sessionRef), 'generic design author provenance changed');
        const recoveryOrigin = decode(await regularFile(ctx.root, `journal/task-${ctx.designTaskId}/origin.json`)) as RecoveryOrigin;
        requireThat(isDeepStrictEqual(recoveryOrigin.requirement, ctx.requirement) && isDeepStrictEqual(recoveryOrigin.prepared.expectedArtifacts, refs), 'original complete design binding changed');
        requireOriginalTask(recoveryOrigin.prepared.task, design);
        const journal = await TaskJournal.open({ artifactRoot: ctx.root, journalRoot: join(ctx.root, 'journal') }, recoveryOrigin, true);
        const captured = await journal.read<{ captured: CapturedTask; signature: ContentSignature }>('capture', saved.attemptId);
        requireThat(captured && isDeepStrictEqual(captured.captured.artifacts, refs), 'complete design capture receipt is missing');
        await journal.requireSignature(captured.signature, refs);
      }
      if (consumer) {
        const art = snapshot.tasks.find(task => task.taskId === ctx.mediaTaskId);
        if (art && (art.artifacts.length || art.state === 'passed')) {
          requireThat(isDeepStrictEqual(art.artifacts, [ctx.primaryMedia]), 'complete media capture identity changed');
          const capture = await ctx.registry.getCapture(ctx.primaryMedia), attempt = art.attempts.at(-1)!;
          requireThat(capture.taskId === art.taskId && capture.metadata.kind === 'media' && capture.metadata.media
            && isDeepStrictEqual(capture.metadata.provenance, { kind: 'original-procedural', generator: 'Native art role output',
              sourceRefs: [attempt.sessionRef, ...ctx.requirement.sources.map(ref => ref.location)] })
            && isDeepStrictEqual(capture.dependencies, [ctx.registry.artifactRef(ctx.name('generic-template'), 'v1'), ctx.requirementCapture, ctx.primaryDesign, transfer])
            && isDeepStrictEqual(capture.ownership, { writePaths: ['public/assets', '_cosmos'], readOnlyPaths: [] }), 'media author capture provenance changed');
          requireThat(isDeepStrictEqual(decode(await regularFile(ctx.root, ctx.primaryMedia.location + '/public/assets/manifest.json')), capture.metadata.media), 'actual media manifest changed');
          const mediaOrigin = decode(await regularFile(ctx.root, `journal/task-${art.taskId}/origin.json`)) as RecoveryOrigin;
          requireThat(isDeepStrictEqual(mediaOrigin.requirement, ctx.requirement) && isDeepStrictEqual(mediaOrigin.prepared.expectedArtifacts, [ctx.primaryMedia]), 'original media binding changed');
          requireOriginalTask(mediaOrigin.prepared.task, art);
          const journal = await TaskJournal.open({ artifactRoot: ctx.root, journalRoot: join(ctx.root, 'journal') }, mediaOrigin, true);
          const captured = await journal.read<{ captured: CapturedTask; signature: ContentSignature }>('capture', attempt.attemptId);
          requireThat(captured && isDeepStrictEqual(captured.captured.artifacts, [ctx.primaryMedia]), 'media capture receipt is missing');
          await journal.requireSignature(captured.signature, [ctx.primaryMedia]);
          const files = captured.signature.find(item => item.location === ctx.primaryMedia.location)!.files.map(item => item.path).sort();
          requireThat(isDeepStrictEqual(capture.files.map(item => item.destination).sort(), files)
            && capture.files.every(item => item.source === item.destination), 'media capture file metadata changed');
        }
        for (const version of ['v1', 'v2'] as const) {
          const coding = snapshot.tasks.find(task => task.taskId === ctx.candidateTaskIds[version]);
          if (!coding?.artifacts.length) continue;
          const ref = ctx.candidates[version]; requireThat(isDeepStrictEqual(coding.artifacts, [ref]), 'captured coding candidate changed');
          const codingOrigin = decode(await regularFile(ctx.root, `journal/task-${coding.taskId}/origin.json`)) as RecoveryOrigin;
          requireThat(isDeepStrictEqual(codingOrigin.requirement, ctx.requirement)
            && isDeepStrictEqual(codingOrigin.prepared.expectedArtifacts, [ref]), 'original coding binding changed');
          requireOriginalTask(codingOrigin.prepared.task, coding);
          const journal = await TaskJournal.open({ artifactRoot: ctx.root, journalRoot: join(ctx.root, 'journal') }, codingOrigin, true);
          const captured = await journal.read<{ captured: CapturedTask; signature: ContentSignature }>('capture', coding.attempts.at(-1)!.attemptId);
          requireThat(captured && isDeepStrictEqual(captured.captured.artifacts, [ref]), 'coding capture receipt is missing');
          const fixed = captured.signature.find(item => item.location === ref.location);
          requireThat(fixed && captured.signature.length === 1, 'original coding capture signature changed');
          const candidate = await ctx.registry.getCandidate(ref), source = await ctx.registry.getCapture(ctx.registry.artifactRef(ctx.name('game-source'), version));
          requireThat(candidate.taskId === coding.taskId && candidate.authorId === coding.authorId && candidate.contextId === coding.context.contextId
            && source.taskId === coding.taskId && source.metadata.kind === 'code'
            && isDeepStrictEqual(source.metadata.provenance, { kind: 'original-procedural', generator: 'Native coding role output',
              sourceRefs: [coding.attempts.at(-1)!.sessionRef, ...ctx.requirement.sources.map(ref => ref.location)] }), 'coding candidate/source provenance changed');
          const inputs = [ctx.registry.artifactRef(ctx.name('generic-template'), 'v1'), ctx.requirementCapture, ctx.primaryDesign, ctx.primaryMedia, transfer, planRefs[version]];
          requireThat(isDeepStrictEqual(source.dependencies, inputs) && isDeepStrictEqual(candidate.inputs, [...inputs, source.artifactRef])
            && isDeepStrictEqual(candidate.expectedDeps, candidate.inputs)
            && isDeepStrictEqual(candidate.mediaRequirements, [{ artifactRef: ctx.primaryMedia, media: (await ctx.registry.getCapture(ctx.primaryMedia)).metadata.media }]),
          'complete candidate source/media dependency metadata changed');
          requireThat(isDeepStrictEqual(candidate.files.map(item => item.destination).sort(), fixed.files.map(item => item.path).sort()), 'original candidate file binding changed');
          // Only trusted build output is added under dist; every original captured byte remains fixed.
          for (const file of fixed.files) {
            const item = candidate.files.find(item => item.destination === file.path)!;
            requireThat([...coding.inputs, source.artifactRef].some(ref => isDeepStrictEqual(ref, item.artifactRef))
              && sha(await regularFile(ctx.root, ref.location + '/' + file.path)) === file.sha256
              && sha(await regularFile(ctx.root, item.artifactRef.location + '/' + file.path)) === file.sha256, 'original captured candidate/source bytes changed');
          }
        }
      }
      await guard();
    } catch (error) { await origin.close(); throw error; }
  };
  const preparation: BrowserInputPreparation = {
    adapterId: 'cos16-input/1', designOutputs: [], designWritePaths: ['authors/design/transfer-design.json'],
    designRules: ['Write an additional authors/design/transfer-design.json using cos16-design/1. The host independently validates its fixed rules before art/coding. No expected states or self-reported verdicts.',
      'The map has a closed 3..8 by 3..8 #/. boundary, one player, exactly two boxes and two targets. Provide <=40 legal solution moves and wall/push/boxWall/doubleBox/restart/restore direction paths <=60. restore is a strict solution prefix with a walk and push, no occupied target and no win; continuation reaches one target then two.',
      'Every path starts at the initial map. wall starts with an ordinary walk and ends with a wall attempt; push ends with a legal box push; boxWall ends with an attempted push against a wall; doubleBox ends with an attempted two-box push. All preceding inputs must be legal. restart and restore both include an ordinary walk and a push and end before victory.',
      'Use only up/down/left/right and zero-based [x,y] integer floor coordinates. Each legal step moves one cell. Walls, box-wall and double-box attempts preserve the entire state. The independent oracle fixes all expected states.'],
    codingRules: ['Read the exact transfer design and both pre-coding plans from fixed inputs. Preserve their map, rules and normal-input observations; only the plan corresponding to this candidate version is staged by the host.',
      'Implement the fixed Chinese start/up/down/left/right/restart/continue buttons. Expose only actual read-only transfer.snapshot and transfer.saveSnapshot JSON strings with field order mapVersion,player,boxes,targets,steps,won. Sort boxes/targets by x then y; targets are {position:[x,y],occupied:boolean}. Do not fill state observations with the plan expected values. Render actual cell-x-y data-player/data-box/data-target/data-occupied and status from game state as specified in the frozen plan.',
      consumer ? 'The trusted host checks the eight frozen normal-input segments and actual media coverage. Preserve actual per-document cumulative media observations; browser-process reopening starts a new document. Do not declare user experience passed.'
        : 'Transfer acceptance execution is not connected in this preparation stage. Do not declare host acceptance or user experience passed.'],
    async initialize(context) {
      ctx = context; requireThat(isValidationRequirement(ctx.requirement), 'transfer runtime host requires an explicit validation profile');
      if (consumer) requireThat(ctx.candidateTaskIds.v1 && ctx.candidateTaskIds.v2 && ctx.candidateTaskIds.v1 !== ctx.candidateTaskIds.v2, 'consumer requires the original coding/repair task IDs before design capture');
      const expected = [...TRANSFER_ACCEPTANCE_IDS, ...HOST_STAGE_ACCEPTANCE.map(item => item.acceptanceId)].sort();
      requireThat(isDeepStrictEqual(ctx.requirement.acceptance.map(item => item.acceptanceId).sort(), expected), 'complete transfer and stage acceptance required');
      for (const stage of HOST_STAGE_ACCEPTANCE) requireThat(isDeepStrictEqual(ctx.requirement.acceptance.find(item => item.acceptanceId === stage.acceptanceId), stage), 'host stage acceptance changed');
      await ctx.requireScope();
      transfer = ctx.inherited?.verified.frozen.artifact ?? ctx.registry.artifactRef(ctx.name('transfer-design'), 'v1');
      planRefs = { v1: ctx.registry.artifactRef(ctx.name('plan-v1'), 'v1'), v2: ctx.registry.artifactRef(ctx.name('plan-v2'), 'v1') };
      captureLayout = `Capture file layout: ${JSON.stringify([{ artifactId: transfer.artifactId, paths: ['_cosmos/transfer-design.json', '_cosmos/transfer-binding.json'] },
        ...[planRefs.v1, planRefs.v2].map(ref => ({ artifactId: ref.artifactId, paths: ['_cosmos/transfer-plan.json'] }))])}. Select each exact artifactId/version reference from the current packet inputs and read reference.location + '/' + the relative path. The two plans have distinct artifact roots despite the same relative filename; read both fixed input references. Only the design author writes authors/design/transfer-design.json before capture; reviewers and downstream roles read these immutable paths, never an authors/design/... suffix below a capture. Read only references already in your packet; this rule adds no permissions.`;
      preparation.designRules.push(captureLayout); preparation.codingRules.push(captureLayout);
      preparation.designOutputs = (ctx.inherited ? ctx.inherited.verified.designArtifacts.slice(1) : [transfer, planRefs.v1, planRefs.v2]).map(ref => ({ ...ref, destination: ref.location, type: 'data', schema: ref === transfer ? 'cos16-design/1' : 'cos16-plan/1' }));
      preparation.designRules.push(`Use requirement reference ${JSON.stringify(ctx.requirementCapture)}. Write exactly {formatVersion:"cos16-design/1",requirement:thatReference,mapVersion:string,map:{tiles:string[],player:[x,y],boxes:[[x,y],[x,y]],targets:[[x,y],[x,y]]},solution:Direction[],paths:{wall,push,boxWall,doubleBox,restart,restore}}.`);
      origin = await reserveTransferOrigin({ root: ctx.root, resume: ctx.resume, signal: ctx.signal, requireScope: ctx.requireScope,
        binding: { caseId: ctx.requirement.validation.caseId, windowId: ctx.requirement.validation.windowId, sourceVersion: ctx.requirement.validation.reviewedPlatformSha,
          requirementSha256: sha(JSON.stringify(ctx.requirement)), runId: ctx.requirement.validation.runId, specVersion: ctx.requirement.specVersion } });
      if (ctx.inherited) {
        const design = ctx.inherited.verified.stages[0].task;
        const saved: PreparedInputs = { formatVersion: 'transfer-prepared-inputs/1', taskId: design.taskId, attemptId: design.attempts[0].attemptId,
          sessionRef: design.attempts[0].sessionRef, frozen: ctx.inherited.verified.frozen, plans: {} as PreparedInputs['plans'] };
        if (ctx.resume) await verify();
        else {
          for (const version of ['v1', 'v2'] as const) { await guard(); saved.plans[version] = await prepareTransferAcceptance(preparedInput(saved, version)); }
          await guard(); await publishReceipt(join(ctx.root, receiptFile), saved, ctx.signal);
        }
        preparedPublished = true; return;
      }
      designValidation = createTransferDesignValidation({ context: ctx, controller: input.controller, guard });
      preparation.designHostTools = designValidation.hostTools;
      preparation.designRules.push('After completing transfer-design.json, call validate-transfer-design with no arguments. A first invalid result permits one semantic rewrite process and one different submission; a second invalid result exhausts it permanently. A pass seals the exact map bytes: keep them unchanged and accurately finish the generic design summary. Identical submissions reuse their complete result. All calls remain in this original author session, attempt, grant and deadline. This static design check is not gameplay acceptance.');
    },
    requireCurrent,
    currentInputs: () => ctx.inherited ? [planRefs.v1, planRefs.v2] : [],
    async captureDesignExtras(task, workspace) {
      await guard(); const attempt = task.attempts.at(-1)!;
      let sealed: Awaited<ReturnType<typeof designValidation.seal>>;
      const path = 'authors/design/transfer-design.json'; let bytes: Buffer | undefined;
      try { bytes = await regularFile(workspace, path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      try { sealed = await designValidation.seal(task, workspace); }
      catch (error) {
        // Keep original bytes, including invalid UTF-8, without rewriting or guessing an encoding.
        const folderName = `failure-sources/${task.taskId}/${attempt.attemptId}`, folder = await directory(ctx.root, folderName);
        if (bytes) await writeFile(join(folder, 'raw-transfer-design.json'), bytes, { flag: 'wx' });
        const manifestPath = folderName + '/transfer-design-manifest.json';
        await publishReceipt(join(ctx.root, manifestPath), { formatVersion: 1, taskId: task.taskId, attemptId: attempt.attemptId, sessionRef: attempt.sessionRef,
          inputs: task.inputs, diagnosis: { kind: 'invalid_transfer_design', message: error instanceof Error ? error.message : 'Invalid transfer design' },
          raw: { location: folderName + '/raw-transfer-design.json', present: !!bytes, sha256: bytes ? sha(bytes) : null } });
        throw new HostFailure(task.acceptance.map(item => ({ acceptanceId: item.acceptanceId, checkId: 'transfer-design-semantics', classification: 'insufficient_evidence',
          summary: 'Runtime design has no successful sealed host validation; preserve the bounded design diagnosis.', reproduction: [...item.steps],
          expected: item.expected, actual: 'Invalid runtime transfer design; preserve raw diagnosis before any downstream task.', evidenceRefs: [manifestPath] })));
      }
      await guard();
      const frozen = await freezeTransferDesign({ root: ctx.root, registry: ctx.registry, requirement: ctx.requirementCapture, requirementFile: ctx.requirementFile,
        designSource: sealed.source, artifact: transfer, taskId: task.taskId,
        requirementProfile: 'operator_validation', preserveHostStages: true,
        provenance: { kind: 'original-procedural', generator: 'Native design role output', sourceRefs: [attempt.sessionRef, sealed.receipt, ...ctx.requirement.sources.map(ref => ref.location)] } });
      requireThat(frozen.designSha256 === sealed.sha256, 'frozen design bytes differ from successful validation');
      await designValidation.seal(task, workspace);
      const saved: PreparedInputs = { formatVersion: 'transfer-prepared-inputs/1', taskId: task.taskId, attemptId: attempt.attemptId, sessionRef: attempt.sessionRef,
        frozen, plans: {} as PreparedInputs['plans'] };
      for (const version of ['v1', 'v2'] as const) { await guard(); saved.plans[version] = await prepareTransferAcceptance(preparedInput(saved, version)); }
      await guard(); await publishReceipt(join(ctx.root, receiptFile), saved, ctx.signal); preparedPublished = true;
    },
    verifyDesignExtras: async task => { await requireCurrent(); await verify(task); },
    artExtraInputs: () => [transfer],
    candidateExtraInputs(candidate) {
      const version = candidate.version;
      requireThat((version === 'v1' || version === 'v2') && isDeepStrictEqual(candidate, ctx.candidates[version]), 'candidate is not a reserved transfer version');
      return [transfer, planRefs[version]];
    },
    async bindCandidate(candidate) {
      await requireCurrent();
      const saved = await verify(); preparation.candidateExtraInputs(candidate);
      const version = candidate.version as 'v1' | 'v2';
      const result = await bindTransferAcceptance({ ...preparedInput(saved, version), prepared: saved.plans[version] });
      await guard(); return result;
    },
    async close() { if (origin) await origin.close(); },
  };
  if (consumer) preparation.candidateConsumer = async context => {
    await requireCurrent(); const saved = await verify(), version = context.candidate.version as 'v1' | 'v2';
    preparation.candidateExtraInputs(context.candidate);
    requireThat(context.task.taskId === ctx.candidateTaskIds[version], 'consumer task differs from its pre-frozen candidate task');
    return consumeTransferCandidate(context, { input: { ...preparedInput(saved, version), prepared: saved.plans[version] },
      sourceVersion: (ctx.requirement as ValidationRequirement).validation.reviewedPlatformSha,
      mount: verifyBinding => origin.mountCandidate({ candidate: context.candidate, project: context.project, verifyBinding }) });
  };
  if (consumer) preparation.candidateBuildDiagnostic = diagnoseTransferBuild;
  try {
    const host = await createValidationPreparedBrowserHost({ ...input, preparation });
    host.taskPolicies.find(policy => policy.role === 'art')?.rules!.push(captureLayout!);
    return host;
  }
  catch (error) { await preparation.close(); throw error; }
}
