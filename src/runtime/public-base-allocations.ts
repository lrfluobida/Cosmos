import { sameValue } from '../contracts/validation.ts';
import { APPROVED_ART } from './art-draft-source.ts';
import { APPROVED_DESIGN } from './approved-design-source.ts';
import type { ArtifactReference, BudgetLedger } from '../contracts/types.ts';
import type { IntakeSnapshot } from './intake.ts';
import type { RunSnapshot } from './run-types.ts';

export interface PublicAllocationOrigin {
  planningAllocation?: unknown; requirementsSource?: unknown; designDraftReview?: ArtifactReference; approvedDesignAllocation?: unknown; artDraftSource?: ArtifactReference; codeDraftSource?: ArtifactReference; ordinaryProfile?: unknown; draftMode?: unknown;
}

/** A missing marker always means the original two equal shares, including origin-only recovery. */
export function publicBaseAllocations(limitMicroCny: number, origin: PublicAllocationOrigin): BudgetLedger['allocations'] {
  const share = Math.floor(limitMicroCny / 20), selected = Object.hasOwn(origin, 'planningAllocation');
  if (selected && (origin.planningAllocation !== 'reuse-intake-share' || !origin.requirementsSource
    || origin.ordinaryProfile !== 'ordinary-design/1' || origin.draftMode !== undefined || share <= 0)) {
    throw new Error('Invalid original public planning allocation selection.');
  }
  if (origin.approvedDesignAllocation !== undefined && (origin.approvedDesignAllocation !== 'downstream-share/1'
    || origin.designDraftReview?.artifactId !== APPROVED_DESIGN || !origin.requirementsSource || origin.ordinaryProfile !== 'ordinary-design/1'
    || origin.draftMode !== undefined)) throw new Error('Invalid original approved design allocation selection.');
  if (origin.artDraftSource?.artifactId === APPROVED_ART) {
    if (selected || origin.approvedDesignAllocation !== 'downstream-share/1') throw new Error('Approved media requires only the downstream allocation.');
    return [{ taskId: 'intake', amountMicroCny: 0 }, { taskId: 'planning', amountMicroCny: 0 }];
  }
  return [{ taskId: 'intake', amountMicroCny: selected ? 0 : share }, { taskId: 'planning', amountMicroCny: selected ? 2 * share : share }];
}

/** Pure local check; accounting must not depend on rereading a historical requirement source. */
export function requirePublicBaseAllocations(state: IntakeSnapshot | RunSnapshot, origin: PublicAllocationOrigin): void {
  const expected = publicBaseAllocations(state.ledger.limitMicroCny, origin);
  if (state.approvedDesignAllocation !== origin.approvedDesignAllocation) throw new Error('Original approved design allocation changed.');
  if (!sameValue(origin.requirementsSource, state.requirementsSource) || !sameValue(origin.designDraftReview, state.designDraftReview) || !sameValue(origin.artDraftSource, state.artDraftSource)
    || !sameValue(origin.codeDraftSource, state.codeDraftSource)
    || !sameValue(state.ledger.allocations.filter(row => row.taskId === 'intake' || row.taskId === 'planning'), expected)
    || state.formatVersion === 'intake-1' && state.ledger.allocations.length !== expected.length) {
    throw new Error('Original public intake/planning allocations differ from their saved source.');
  }
}
