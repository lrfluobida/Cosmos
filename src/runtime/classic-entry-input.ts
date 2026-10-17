import type { AcceptancePlan, Step } from '../acceptance/plan.ts';
import { validatePlan } from '../acceptance/plan.ts';
import { pathName, regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { validationHash } from './validation-validation.ts';
import { classicReferenceRoot } from './entrypoint-classic.ts';

export interface ClassicEntrySelection {
  formatVersion: 'classic-entry-selection/1'; referenceId: string; referenceSha256: string; catalogSha256: string;
  measurement: { id: string; entryId: string; entityId: string; status: 'verified_for_reference'; value: number;
    metric: string; unit: string; method: string; tolerance: 'exact'; evidenceRefs: string[] } | null;
  entryLabel: string | null; entityLabel: string | null;
  evidence: { id: string; path: string; sha256: string }[];
  reason: 'no_reference_measurements' | 'no_verified_exact_measurement' | null;
}
export interface ClassicEntryPlan {
  formatVersion: 'classic-entry-plan/1'; measurementId: string; acceptanceId: string;
  inputs: Extract<Step, { kind: 'mouse-click' | 'mouse-move' | 'locator-click' }>[];
  observation: { kind: 'text'; selector: string }; timeoutMs: number;
}
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value: any, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const evidencePath = (path: string) => { pathName(path); if (!path.startsWith('evidence/')) throw new Error('Classic reference evidence must remain below evidence/.'); return path; };

/** This reads trusted repository/TEMP source only; no caller-proposed fact or path is accepted. */
export async function readClassicEntrySource(sourceRoot = classicReferenceRoot) {
  const referenceBytes = await regularFile(sourceRoot, 'reference.json'), catalogBytes = await regularFile(sourceRoot, 'catalog.json');
  const reference = decode(referenceBytes), catalog = decode(catalogBytes);
  const errors: string[] = (await import(new URL('../../benchmarks/classic-pc/reference/validate.mjs', import.meta.url).href)).validate(reference, catalog);
  if (errors.length) throw new Error(`Invalid classic reference source: ${errors.join('; ')}`);
  const measurement = catalog.measurements.find((row: any) => row.status === 'verified_for_reference' && row.tolerance === 'exact'
    && typeof row.value === 'number' && Number.isFinite(row.value) && text(row.metric) && text(row.unit)) ?? null;
  const files = new Map<string, Buffer>(), evidence: ClassicEntrySelection['evidence'] = [];
  if (measurement) for (const id of measurement.evidenceRefs) {
    const record = catalog.evidence.find((row: any) => row.id === id), path = evidencePath(record.path);
    const bytes = await regularFile(sourceRoot, path);
    if (!bytes.length) throw new Error('Classic reference evidence is empty.');
    files.set(path, bytes); evidence.push({ id, path, sha256: validationHash(bytes) });
  }
  const selection: ClassicEntrySelection = { formatVersion: 'classic-entry-selection/1', referenceId: reference.referenceId,
    referenceSha256: validationHash(referenceBytes), catalogSha256: validationHash(catalogBytes), measurement: structuredClone(measurement),
    entryLabel: measurement ? catalog.entries.find((row: any) => row.id === measurement.entryId).label : null,
    entityLabel: measurement ? catalog.entries.find((row: any) => row.id === measurement.entityId).label : null, evidence,
    reason: measurement ? null : catalog.measurements.length ? 'no_verified_exact_measurement' : 'no_reference_measurements' };
  return { reference, catalog, referenceBytes, catalogBytes, files, selection };
}
export async function selectClassicEntry(sourceRoot = classicReferenceRoot): Promise<ClassicEntrySelection> {
  return (await readClassicEntrySource(sourceRoot)).selection;
}
export async function requireClassicEntrySelection(selection: ClassicEntrySelection, sourceRoot = classicReferenceRoot) {
  const source = await readClassicEntrySource(sourceRoot);
  if (!sameValue(selection, source.selection)) throw new Error('Confirmed classic entry selection differs from its fixed source bytes.');
  return source;
}
/** Shape validation is not source authentication; the host re-reads the captured bytes. */
export function validateClassicEntrySelection(value: unknown): asserts value is ClassicEntrySelection {
  const selection = value as ClassicEntrySelection;
  const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (!exactKeys(selection, ['formatVersion', 'referenceId', 'referenceSha256', 'catalogSha256', 'measurement', 'entryLabel', 'entityLabel', 'evidence', 'reason'])
    || selection.formatVersion !== 'classic-entry-selection/1' || !text(selection.referenceId) || !hash(selection.referenceSha256) || !hash(selection.catalogSha256)
    || !Array.isArray(selection.evidence) || selection.evidence.some(row => !exactKeys(row, ['id', 'path', 'sha256']) || !text(row.id) || !hash(row.sha256))
    || new Set(selection.evidence.map(row => row.id)).size !== selection.evidence.length) throw new Error('Invalid classic entry selection.');
  for (const row of selection.evidence) evidencePath(row.path);
  const measurement = selection.measurement;
  if (measurement === null) {
    if (!['no_reference_measurements', 'no_verified_exact_measurement'].includes(selection.reason ?? '') || selection.evidence.length
      || selection.entryLabel !== null || selection.entityLabel !== null) throw new Error('Invalid empty classic entry selection.');
  } else if (!measurement || measurement.status !== 'verified_for_reference' || measurement.tolerance !== 'exact' || !Number.isFinite(measurement.value)
    || typeof measurement.value !== 'number' || !['id', 'entryId', 'entityId', 'metric', 'unit', 'method'].every(key => text((measurement as any)[key]))
    || !Array.isArray(measurement.evidenceRefs) || measurement.evidenceRefs.length < 2 || !sameValue(measurement.evidenceRefs, selection.evidence.map(row => row.id))
    || !text(selection.entryLabel) || !text(selection.entityLabel) || selection.reason !== null) throw new Error('Invalid selected classic measurement.');
}

const placeholder = { projectId: 'classic', taskId: 'classic', runId: 'classic', reportId: 'classic', specVersion: '1.0',
  artifact: { artifactId: 'classic', version: 'v1', location: 'classic' }, url: 'http://127.0.0.1:1' };
type PlanBinding = Omit<AcceptancePlan, 'formatVersion' | 'steps' | 'acceptanceIds'>;
function assembled(mapping: ClassicEntryPlan, selection: ClassicEntrySelection, binding: PlanBinding): AcceptancePlan {
  return { ...binding, formatVersion: '1.0.0', acceptanceIds: [mapping.acceptanceId], steps: [...structuredClone(mapping.inputs), {
    id: 'classic-entry-observe', kind: 'assert', acceptanceId: mapping.acceptanceId, observation: structuredClone(mapping.observation),
    expected: String(selection.measurement!.value), timeoutMs: mapping.timeoutMs }] };
}
export function validateClassicEntryPlan(value: unknown, selection: ClassicEntrySelection, gameplayIds: string[], viewport: AcceptancePlan['viewport']): asserts value is ClassicEntryPlan {
  validateClassicEntrySelection(selection); const mapping = value as ClassicEntryPlan;
  if (!selection.measurement || !exactKeys(mapping, ['formatVersion', 'measurementId', 'acceptanceId', 'inputs', 'observation', 'timeoutMs'])
    || mapping.formatVersion !== 'classic-entry-plan/1' || mapping.measurementId !== selection.measurement.id || !gameplayIds.includes(mapping.acceptanceId)
    || !Array.isArray(mapping.inputs) || mapping.inputs.length < 1 || mapping.inputs.length > 199
    || mapping.inputs.some(step => !step || !['mouse-click', 'mouse-move', 'locator-click'].includes(step.kind) || step.id === 'classic-entry-observe')
    || !mapping.inputs.some(step => ['mouse-click', 'locator-click'].includes(step.kind))
    || !exactKeys(mapping.observation, ['kind', 'selector']) || mapping.observation.kind !== 'text') throw new Error('Invalid fixed classic entry plan.');
  const issues = validatePlan(assembled(mapping, selection, { ...placeholder, viewport }));
  if (issues.length) throw new Error(`Invalid fixed classic entry plan: ${issues.join('; ')}`);
}
export function createClassicEntryPlan(value: unknown, selection: ClassicEntrySelection, gameplayIds: string[], binding: PlanBinding): AcceptancePlan {
  validateClassicEntryPlan(value, selection, gameplayIds, binding.viewport);
  const plan = assembled(value, selection, binding), errors = validatePlan(plan);
  if (errors.length) throw new Error(errors.join('; ')); return plan;
}
