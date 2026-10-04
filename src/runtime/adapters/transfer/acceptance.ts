import { isDeepStrictEqual } from 'node:util';
import { runPersistentAcceptance, validatePersistentSeries, PERSISTENT_PROFILE_CAPABILITY } from '../../../acceptance/persistent.ts';
import type { PersistentAcceptanceOptions, PersistentAcceptanceSeries } from '../../../acceptance/persistent.ts';
import { bindTransferAcceptance } from './binding.ts';
import type { BindInput, FrozenTransferAcceptanceDraft } from './binding.ts';
import { requireThat, TRANSFER_ACCEPTANCE_IDS } from './design.ts';

/** Consumes an already-bound IR; never changes the frozen preparation artifact or its flags. */
export function transferPersistentSeries(draft: FrozenTransferAcceptanceDraft, sourceVersion: string, reportId: string): PersistentAcceptanceSeries {
  const names = ['start', 'walk-wall', 'push', 'box-wall', 'double-box', 'restart', 'restore', 'victory'];
  requireThat(draft.formatVersion === 'cos16-plan/1' && draft.phase === 'preparation-only' && draft.executable === false
    && isDeepStrictEqual(draft.acceptanceIds, [...TRANSFER_ACCEPTANCE_IDS]) && isDeepStrictEqual(draft.segments.map(item => item.id), names)
    && draft.segments.every(item => item.executable === false), 'changed transfer plan scope');
  requireThat(draft.checkpoint.executable === false && draft.checkpoint.requiredCapability === PERSISTENT_PROFILE_CAPABILITY
    && draft.checkpoint.afterSegment === 'restore' && draft.checkpoint.beforeSegment === 'victory', 'unsupported transfer checkpoint');
  requireThat(draft.segments.every(item => isDeepStrictEqual(item.plan.artifact, draft.binding.candidate)
    && item.plan.runId === draft.binding.runId), 'transfer candidate/run binding changed');
  const series: PersistentAcceptanceSeries = { formatVersion: 'persistent-acceptance/1', reportId, sourceVersion, bindingSha256: draft.planSha256,
    scope: { requirement: structuredClone(draft.binding.design.requirement), design: structuredClone(draft.binding.design.artifact), plan: structuredClone(draft.artifact),
      designSha256: draft.binding.design.designSha256, mapVersion: draft.binding.design.mapVersion, acceptanceIds: [...draft.acceptanceIds] },
    segments: draft.segments.map(({ id, prerequisite, plan }) => ({ id, prerequisite, plan: structuredClone(plan) })),
    checkpoint: { kind: draft.checkpoint.kind, afterSegment: 'restore', beforeSegment: 'victory', sameProfile: draft.checkpoint.sameProfile,
      sameOrigin: draft.checkpoint.sameOrigin, origin: draft.checkpoint.origin, expected: draft.checkpoint.expected,
      snapshot: { kind: 'debug', path: ['transfer', 'snapshot'] }, savedSnapshot: { kind: 'debug', path: ['transfer', 'saveSnapshot'] } } };
  requireThat(!validatePersistentSeries(series).length, 'transfer plan is not a valid bounded persistent series');
  return series;
}
/** Source/scope guard is host-owned; actual registry bytes are re-bound at every lifecycle gate. */
export async function runTransferAcceptance(input: BindInput, options: PersistentAcceptanceOptions & { sourceVersion: string; reportId: string }) {
  const bound = await bindTransferAcceptance(input), series = transferPersistentSeries(bound, options.sourceVersion, options.reportId);
  const verifyBinding = async () => {
    await options.verifyBinding();
    requireThat(isDeepStrictEqual(await bindTransferAcceptance(input), bound), 'transfer source/candidate/expectations changed during execution');
  };
  return runPersistentAcceptance(series, { ...options, verifyBinding });
}
