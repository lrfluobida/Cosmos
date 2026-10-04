import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createValidationPreparedBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import type { BrowserInputPreparation, BrowserPreparationContext } from '../../src/runtime/entrypoint-preparation.ts';
import type { ArtifactReference, TaskContract } from '../../src/contracts/index.ts';
import { directory, regularFile } from '../../src/artifacts/paths.ts';
import { isValidationRequirement } from '../../src/roles/execution-input.ts';
import { HOST_STAGE_ACCEPTANCE } from '../../src/roles/requirements.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import { TRANSFER_ACCEPTANCE_IDS, requireThat } from './design.ts';
import { validateTransferDesign } from './oracle.ts';
import { freezeTransferDesign, prepareTransferAcceptance, verifyPreparedTransferAcceptance, bindTransferAcceptance } from './binding.ts';
import type { FrozenTransferDesign, FrozenTransferAcceptanceDraft, PrepareInput } from './binding.ts';
import { reserveTransferOrigin } from './loopback-origin.ts';

type HostInput = Parameters<typeof createValidationPreparedBrowserHost>[0];
interface PreparedInputs {
  formatVersion: 'transfer-prepared-inputs/1'; taskId: string; attemptId: string; sessionRef: string;
  frozen: FrozenTransferDesign; plans: { v1: FrozenTransferAcceptanceDraft; v2: FrozenTransferAcceptanceDraft };
}
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

/** Runtime-generated data only. This module contains no map, solution, assets or game implementation. */
export async function createTransferRuntimeHost(input: Omit<HostInput, 'preparation'>) {
  let ctx: BrowserPreparationContext, origin: Awaited<ReturnType<typeof reserveTransferOrigin>>;
  let transfer: ArtifactReference, planRefs: { v1: ArtifactReference; v2: ArtifactReference };
  const receiptFile = 'host-transfer-prepared-inputs.json';
  const guard = async () => { try { await ctx.requireScope(); await origin.verify(); } catch (error) { await origin.close(); throw error; } };
  const read = async (): Promise<PreparedInputs> => {
    await guard(); const saved = decode(await regularFile(ctx.root, receiptFile)) as PreparedInputs;
    requireThat(saved.formatVersion === 'transfer-prepared-inputs/1' && saved.taskId === ctx.designTaskId
      && typeof saved.attemptId === 'string' && !!saved.attemptId && typeof saved.sessionRef === 'string' && !!saved.sessionRef
      && isDeepStrictEqual(saved.frozen.artifact, transfer) && isDeepStrictEqual(saved.frozen.requirement, ctx.requirementCapture)
      && saved.frozen.specVersion === ctx.requirement.specVersion && saved.frozen.requirementProfile === 'operator_validation'
      && saved.frozen.preserveHostStages === true, 'prepared design receipt changed');
    return saved;
  };
  const preparedInput = (saved: PreparedInputs, version: 'v1' | 'v2'): PrepareInput => {
    requireThat(isValidationRequirement(ctx.requirement), 'explicit validation requirement is missing');
    return { root: ctx.root, registry: ctx.registry, frozen: saved.frozen,
    currentRequirement: { artifact: ctx.requirementCapture, specVersion: ctx.requirement.specVersion }, candidate: ctx.candidates[version], planArtifact: planRefs[version],
    url: origin.url, runId: ctx.requirement.validation.runId, reportId: ctx.name('transfer-' + version) };
  };
  const verify = async (task?: TaskContract) => {
    const saved = await read();
    if (task) requireThat(saved.taskId === task.taskId && saved.attemptId === task.attempts.at(-1)?.attemptId && saved.sessionRef === task.attempts.at(-1)?.sessionRef,
      'design author attempt provenance changed');
    const capture = await ctx.registry.getCapture(transfer);
    requireThat(capture.taskId === saved.taskId && capture.metadata.provenance.sourceRefs.includes(saved.sessionRef), 'frozen design author provenance changed');
    for (const version of ['v1', 'v2'] as const) await verifyPreparedTransferAcceptance({ ...preparedInput(saved, version), prepared: saved.plans[version] });
    requireThat(isDeepStrictEqual(saved.plans.v1.segments.map(item => item.plan.steps), saved.plans.v2.segments.map(item => item.plan.steps)), 'repair expectations changed');
    await guard(); return saved;
  };
  const preparation: BrowserInputPreparation = {
    adapterId: 'cos16-input/1', designOutputs: [], designWritePaths: ['authors/design/transfer-design.json'],
    designRules: ['Write an additional authors/design/transfer-design.json using cos16-design/1. The host independently validates its fixed rules before art/coding. No expected states or self-reported verdicts.',
      'The map has a closed 3..8 by 3..8 #/. boundary, one player, exactly two boxes and two targets. Provide <=40 legal solution moves and wall/push/boxWall/doubleBox/restart/restore direction paths <=60. restore is a strict solution prefix with a walk and push, no occupied target and no win; continuation reaches one target then two.',
      'Every path starts at the initial map. wall starts with an ordinary walk and ends with a wall attempt; push ends with a legal box push; boxWall ends with an attempted push against a wall; doubleBox ends with an attempted two-box push. All preceding inputs must be legal. restart and restore both include an ordinary walk and a push and end before victory.',
      'Use only up/down/left/right and zero-based [x,y] integer floor coordinates. Each legal step moves one cell. Walls, box-wall and double-box attempts preserve the entire state. The independent oracle fixes all expected states.'],
    codingRules: ['Read the exact transfer design and both pre-coding plans from fixed inputs. Preserve their map, rules and normal-input observations; only the plan corresponding to this candidate version is staged by the host.',
      'Implement the fixed Chinese start/up/down/left/right/restart/continue buttons. Expose only actual read-only transfer.snapshot and transfer.saveSnapshot JSON strings with field order mapVersion,player,boxes,targets,steps,won. Sort boxes/targets by x then y; targets are {position:[x,y],occupied:boolean}. Do not fill state observations with the plan expected values. Render actual cell-x-y data-player/data-box/data-target/data-occupied and status from game state as specified in the frozen plan.',
      'Transfer acceptance execution is not connected in this preparation stage. Do not declare host acceptance or user experience passed.'],
    async initialize(context) {
      ctx = context; requireThat(isValidationRequirement(ctx.requirement), 'transfer runtime host requires an explicit validation profile');
      const expected = [...TRANSFER_ACCEPTANCE_IDS, ...HOST_STAGE_ACCEPTANCE.map(item => item.acceptanceId)].sort();
      requireThat(isDeepStrictEqual(ctx.requirement.acceptance.map(item => item.acceptanceId).sort(), expected), 'complete transfer and stage acceptance required');
      for (const stage of HOST_STAGE_ACCEPTANCE) requireThat(isDeepStrictEqual(ctx.requirement.acceptance.find(item => item.acceptanceId === stage.acceptanceId), stage), 'host stage acceptance changed');
      await ctx.requireScope();
      transfer = ctx.registry.artifactRef(ctx.name('transfer-design'), 'v1');
      planRefs = { v1: ctx.registry.artifactRef(ctx.name('plan-v1'), 'v1'), v2: ctx.registry.artifactRef(ctx.name('plan-v2'), 'v1') };
      preparation.designOutputs = [transfer, planRefs.v1, planRefs.v2].map(ref => ({ ...ref, destination: ref.location, type: 'data', schema: ref === transfer ? 'cos16-design/1' : 'cos16-plan/1' }));
      preparation.designRules.push(`Use requirement reference ${JSON.stringify(ctx.requirementCapture)}. Write exactly {formatVersion:"cos16-design/1",requirement:thatReference,mapVersion:string,map:{tiles:string[],player:[x,y],boxes:[[x,y],[x,y]],targets:[[x,y],[x,y]]},solution:Direction[],paths:{wall,push,boxWall,doubleBox,restart,restore}}.`);
      origin = await reserveTransferOrigin({ root: ctx.root, resume: ctx.resume, signal: ctx.signal, requireScope: ctx.requireScope,
        binding: { caseId: ctx.requirement.validation.caseId, windowId: ctx.requirement.validation.windowId, sourceVersion: ctx.requirement.validation.reviewedPlatformSha,
          requirementSha256: sha(JSON.stringify(ctx.requirement)), runId: ctx.requirement.validation.runId, specVersion: ctx.requirement.specVersion } });
    },
    requireCurrent: guard,
    async captureDesignExtras(task, workspace) {
      await guard(); const attempt = task.attempts.at(-1)!;
      const path = 'authors/design/transfer-design.json'; let bytes: Buffer | undefined;
      try { bytes = await regularFile(workspace, path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      try { requireThat(bytes, 'Required runtime transfer design output is missing'); validateTransferDesign(decode(bytes), ctx.requirementCapture); }
      catch (error) {
        // Keep original bytes, including invalid UTF-8, without rewriting or guessing an encoding.
        const folderName = `failure-sources/${task.taskId}/${attempt.attemptId}`, folder = await directory(ctx.root, folderName);
        if (bytes) await writeFile(join(folder, 'raw-transfer-design.json'), bytes, { flag: 'wx' });
        const manifestPath = folderName + '/transfer-design-manifest.json';
        await publishReceipt(join(ctx.root, manifestPath), { formatVersion: 1, taskId: task.taskId, attemptId: attempt.attemptId, sessionRef: attempt.sessionRef,
          inputs: task.inputs, diagnosis: { kind: 'invalid_transfer_design', message: error instanceof Error ? error.message : 'Invalid transfer design' },
          raw: { location: folderName + '/raw-transfer-design.json', present: !!bytes, sha256: bytes ? sha(bytes) : null } });
        throw new HostFailure(task.acceptance.map(item => ({ acceptanceId: item.acceptanceId, checkId: 'transfer-design-semantics', classification: 'insufficient_evidence',
          summary: 'Runtime design failed the fixed transfer oracle; bounded design semantic repair is not enabled.', reproduction: [...item.steps],
          expected: item.expected, actual: 'Invalid runtime transfer design; preserve raw diagnosis before any downstream task.', evidenceRefs: [manifestPath] })));
      }
      await guard();
      const frozen = await freezeTransferDesign({ root: ctx.root, registry: ctx.registry, requirement: ctx.requirementCapture, requirementFile: ctx.requirementFile,
        designSource: relative(ctx.root, join(workspace, path)).split(sep).join('/'), artifact: transfer, taskId: task.taskId,
        requirementProfile: 'operator_validation', preserveHostStages: true,
        provenance: { kind: 'original-procedural', generator: 'Native design role output', sourceRefs: [attempt.sessionRef, ...ctx.requirement.sources.map(ref => ref.location)] } });
      const saved: PreparedInputs = { formatVersion: 'transfer-prepared-inputs/1', taskId: task.taskId, attemptId: attempt.attemptId, sessionRef: attempt.sessionRef,
        frozen, plans: {} as PreparedInputs['plans'] };
      for (const version of ['v1', 'v2'] as const) { await guard(); saved.plans[version] = await prepareTransferAcceptance(preparedInput(saved, version)); }
      await guard(); await publishReceipt(join(ctx.root, receiptFile), saved, ctx.signal);
    },
    verifyDesignExtras: task => verify(task).then(() => {}),
    artExtraInputs: () => [transfer],
    candidateExtraInputs(candidate) {
      const version = candidate.version;
      requireThat((version === 'v1' || version === 'v2') && isDeepStrictEqual(candidate, ctx.candidates[version]), 'candidate is not a reserved transfer version');
      return [transfer, planRefs[version]];
    },
    async bindCandidate(candidate) {
      const saved = await verify(); preparation.candidateExtraInputs(candidate);
      const version = candidate.version as 'v1' | 'v2';
      const result = await bindTransferAcceptance({ ...preparedInput(saved, version), prepared: saved.plans[version] });
      await guard(); return result;
    },
    async close() { if (origin) await origin.close(); },
  };
  try { return await createValidationPreparedBrowserHost({ ...input, preparation }); }
  catch (error) { await preparation.close(); throw error; }
}
