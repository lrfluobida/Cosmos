import { lstat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { regularFile, safePath, within } from '../artifacts/paths.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ApprovedDesign } from './approved-design-source.ts';
import { ORDINARY_PLAN_FILE, type OrdinaryAcceptancePlan } from './entrypoint-acceptance-plan.ts';
import { CODE_DRAFT, fundingCodeDraftSource } from './code-draft-source.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';
import type { PublicValidationAuthorization } from './public-validation-funding-types.ts';

const FEEDBACK = 'ordinary-code-draft-feedback';
const byteLimit = 4096;
export interface CodeDraftFinding { observed: string; hint?: string; stepIds?: string[] }

function focusedPlanSteps(findings: CodeDraftFinding[], design?: ApprovedDesign) {
  const ids = new Set(findings.flatMap(finding => finding.stepIds ?? []));
  if (!ids.size) return undefined;
  // selectApprovedDesign authenticates these exact bytes against the validated supplied plan and confirmation.
  const bytes = design?.files.get(ORDINARY_PLAN_FILE);
  if (!bytes) throw new Error('Code draft feedback stepIds require the approved design plan.');
  const { scenario }: OrdinaryAcceptancePlan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const steps = [...scenario.steps.map(step => ({ stage: 'main' as const, step })),
    ...(scenario.reopen?.steps ?? []).map(step => ({ stage: 'reopen' as const, step }))];
  const focused = [...ids].map(id => {
    const matches = steps.filter(row => row.step.id === id);
    if (matches.length !== 1) throw new Error(`Code draft feedback stepId ${JSON.stringify(id)} is ${matches.length ? 'ambiguous' : 'unknown'} in the approved plan.`);
    return matches[0];
  });
  if (Buffer.byteLength(JSON.stringify(focused)) > byteLimit) throw new Error('Code draft feedback selected steps exceed 4096 bytes. Select fewer or smaller steps.');
  return focused;
}

export function validateCodeDraftFeedback(ref: ArtifactReference, draft?: ArtifactReference) {
  if (draft?.artifactId !== CODE_DRAFT || ref?.artifactId !== FEEDBACK || typeof ref.version !== 'string' || !/^[a-f0-9]{64}$/.test(ref.version)
    || typeof ref.location !== 'string' || !isAbsolute(ref.location) || resolve(ref.location) !== ref.location
    || !sameValue(Object.keys(ref).sort(), ['artifactId', 'location', 'version'])) throw new Error('Code draft feedback requires a pinned file and selected code draft.');
}

export function fundingCodeDraftFeedback(payload: PublicValidationAuthorization) {
  const refs = payload.sourceRefs.filter(ref => ref.artifactId === FEEDBACK);
  if (!refs.length) return undefined;
  if (refs.length !== 1) throw new Error('Select one code draft feedback file.');
  validateCodeDraftFeedback(refs[0], fundingCodeDraftSource(payload));
  return refs[0];
}

function line(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f\u2028\u2029]/u.test(value);
}

export async function selectCodeDraftFeedback(location: string, draft: ArtifactReference, targetRoot: string, expected?: ArtifactReference, design?: ApprovedDesign) {
  const path = resolve(location);
  if (within(targetRoot, path) || (await lstat(await safePath(dirname(path), basename(path)))).size > byteLimit) throw new Error('Code draft feedback requires an external file of at most 4096 bytes.');
  const bytes = await regularFile(dirname(path), basename(path));
  if (bytes.length > byteLimit) throw new Error('Code draft feedback exceeds 4096 bytes.');
  const reference = { artifactId: FEEDBACK, version: ordinaryDraftSha256(bytes), location: path };
  validateCodeDraftFeedback(reference, draft);
  if (expected && !sameValue(reference, expected)) throw new Error('Pinned code draft feedback changed.');
  const note = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!note || !sameValue(Object.keys(note).sort(), ['codeDraft', 'findings', 'formatVersion']) || note.formatVersion !== 'ordinary-code-draft-feedback/1'
    || !sameValue(note.codeDraft, draft) || !Array.isArray(note.findings) || !note.findings.length || note.findings.length > 4
    || !note.findings.every((finding: CodeDraftFinding) => finding && Object.keys(finding).every(key => key === 'observed' || key === 'hint' || key === 'stepIds')
      && line(finding.observed) && (finding.hint === undefined || line(finding.hint)))) throw new Error('Invalid code draft feedback or mismatched draft.');
  const findings: CodeDraftFinding[] = note.findings;
  for (const { stepIds } of findings) {
    if (stepIds !== undefined && (!Array.isArray(stepIds) || !stepIds.length || stepIds.length > 4 || !stepIds.every(line)
      || new Set(stepIds).size !== stepIds.length)) throw new Error('Code draft feedback stepIds must contain 1..4 distinct step identifiers per finding.');
  }
  const steps = focusedPlanSteps(findings, design);
  return { reference, findings, ...(steps ? { focusedPlanSteps: steps } : {}) };
}
