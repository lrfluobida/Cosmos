import { validate } from './reference/validate.mjs';
import { validatePlan } from '../../src/acceptance/plan.ts';

/** @typedef {import('../../src/contracts/types.ts').ArtifactReference} ArtifactReference */
/** @typedef {import('../../src/acceptance/plan.ts').AcceptancePlan} AcceptancePlan */
/** @typedef {{referenceId: string, reference: ArtifactReference, artifact: ArtifactReference, runId: string, specVersion: string}} Binding */
/** @typedef {{entryId: string, binding: Binding, normalInputPlan?: AcceptancePlan, mechanism?: ArtifactReference}} Mapping */

const text = value => typeof value === 'string' && value.trim().length > 0;
const fixedArtifact = value => value && ['artifactId', 'version', 'location'].every(key => text(value[key]))
  && !/^(main|master|head|latest|current|dev|develop)$/i.test(value.version);
const sameArtifact = (a, b) => fixedArtifact(a) && fixedArtifact(b)
  && ['artifactId', 'version', 'location'].every(key => a[key] === b[key]);
const sameBinding = (a, b) => a && b && a.referenceId === b.referenceId
  && a.runId === b.runId && a.specVersion === b.specVersion
  && sameArtifact(a.reference, b.reference) && sameArtifact(a.artifact, b.artifact);

/**
 * Inspect declared mappings only; this function never executes or authenticates evidence.
 * The host supplies the whole reference/catalog snapshot and its immutable artifact binding.
 * @param {object} reference
 * @param {object} catalog
 * @param {Binding} binding
 * @param {Mapping[]} mappings
 */
export function buildAcceptanceDraft(reference, catalog, binding, mappings = []) {
  const referenceValidationErrors = validate(reference, catalog);
  const blockers = ['execution_adapter_pending'];
  if (!reference.frozen || !catalog.frozen || catalog.status !== 'frozen') blockers.push('reference_not_frozen');
  if (referenceValidationErrors.length) blockers.push('reference_validation_failed');
  if (!binding || binding.referenceId !== reference.referenceId || binding.referenceId !== catalog.referenceId
    || !fixedArtifact(binding.reference) || !fixedArtifact(binding.artifact)
    || !text(binding.runId) || !text(binding.specVersion)) blockers.push('reference_binding_mismatch');
  const mappingErrors = [];
  const ids = new Set(catalog.entries.map(entry => entry.id));
  const grouped = new Map();
  for (const mapping of mappings) {
    if (!ids.has(mapping.entryId)) mappingErrors.push(`unknown entry ${mapping.entryId}`);
    const group = grouped.get(mapping.entryId) ?? [];
    group.push(mapping);
    grouped.set(mapping.entryId, group);
    if (group.length === 2) mappingErrors.push(`duplicate mapping ${mapping.entryId}`);
  }
  const entries = catalog.entries.map(entry => {
    const group = grouped.get(entry.id) ?? [];
    const mapping = group.length === 1 ? group[0] : undefined;
    const gaps = ['normal_input_execution_unverified', 'mechanism_execution_unverified'];
    if (entry.status === 'needs_reference') gaps.push('reference_unverified');
    const errors = [];
    if (group.length > 1) errors.push('duplicate_mapping');
    if (!group.length) gaps.push('mapping_missing');
    if (mapping) {
      if (!sameBinding(mapping.binding, binding)) errors.push('binding_mismatch');
      if (!mapping.normalInputPlan) gaps.push('normal_input_mapping_missing');
      else {
        const plan = mapping.normalInputPlan;
        const planErrors = validatePlan(plan);
        errors.push(...planErrors.map(error => `normal_input_plan: ${error}`));
        if (!sameArtifact(plan.artifact, binding?.artifact) || plan.runId !== binding?.runId
          || plan.specVersion !== binding?.specVersion) errors.push('normal_input_binding_mismatch');
        if (!planErrors.length) {
          // A draft plan is dedicated to this entry. Multi-entry attribution awaits the host adapter.
          if (plan.acceptanceIds.length !== 1 || plan.acceptanceIds[0] !== entry.id) errors.push('normal_input_entry_mismatch');
          const click = plan.steps.findIndex(step => ['mouse-click', 'locator-click'].includes(step.kind));
          if (click < 0 || !plan.steps.some((step, index) => index > click
            && ['assert', 'wait-for'].includes(step.kind) && step.acceptanceId === entry.id)) errors.push('normal_input_click_before_assertion_missing');
        }
      }
      if (!mapping.mechanism) gaps.push('mechanism_mapping_missing');
      else if (!fixedArtifact(mapping.mechanism)) errors.push('mechanism_reference_invalid');
    }
    mappingErrors.push(...errors.map(error => `${entry.id}: ${error}`));
    gaps.push(...errors);
    const incomplete = gaps.includes('normal_input_mapping_missing') || gaps.includes('mechanism_mapping_missing');
    return { entryId: entry.id, category: entry.category, referenceStatus: entry.status,
      mapping: errors.length ? 'invalid' : !mapping ? 'missing' : incomplete ? 'incomplete' : 'defined', gaps,
      normalInputPlan: structuredClone(mapping?.normalInputPlan ?? null), mechanism: structuredClone(mapping?.mechanism ?? null),
      ...(entry.category === 'endless' ? { endless: { minimumWallClockMs: 30 * 60 * 1000,
        requiredObservations: ['loop', 'difficulty_growth', 'covered_waves', 'normal_speed_stability'],
        claim: 'finite_observation_only' } } : {}) };
  });
  return { phase: 'draft', acceptance: 'blocked', binding: structuredClone(binding), blockers,
    referenceValidationErrors, mappingErrors, coverage: { totalEntries: entries.length,
      mappedEntries: entries.filter(entry => entry.mapping === 'defined').length,
      missingEntryIds: entries.filter(entry => entry.mapping === 'missing').map(entry => entry.entryId),
      incompleteEntryIds: entries.filter(entry => entry.mapping === 'incomplete').map(entry => entry.entryId),
      invalidEntryIds: entries.filter(entry => entry.mapping === 'invalid').map(entry => entry.entryId) }, entries };
}

const scalar = value => ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value));
const quantity = value => value && text(value.unit) && scalar(value.value);

/** Pure comparison; matches is not an acceptance verdict or a measured fact. */
export function compareExact(reference, actual) {
  if (!quantity(reference) || !quantity(actual) || reference.unit !== actual.unit) return { judgment: 'invalid_input' };
  return { judgment: reference.value === actual.value ? 'matches' : 'mismatch' };
}

/**
 * Pure arithmetic only. A future host adapter must obtain the step from trusted execution
 * and production-equivalence records for the same run/version, never an author request.
 */
export function compareTiming(reference, actual, recordedStep) {
  const values = [reference, actual, recordedStep];
  if (!values.every(value => quantity(value) && typeof value.value === 'number' && value.value >= 0)
    || !['ms', 's', 'min'].includes(reference.unit) || actual.unit !== reference.unit
    || recordedStep.unit !== reference.unit || recordedStep.value <= 0) return { judgment: 'invalid_input' };
  const difference = Math.abs(actual.value - reference.value);
  const tolerance = Math.max(Math.abs(reference.value) * 0.05, recordedStep.value);
  // Compare inclusive endpoints directly; subtraction can round a boundary difference upward.
  const matches = actual.value >= reference.value - tolerance && actual.value <= reference.value + tolerance;
  return { judgment: matches ? 'matches' : 'mismatch', difference, tolerance };
}
