import { sameValue } from '../contracts/validation.ts';
import { HOST_STAGE_ACCEPTANCE, MODULE_STAGE_ACCEPTANCE, validateGameDraft, withHostStages } from './requirements.ts';
import type { OrdinaryGameDraft } from './requirements.ts';

export interface DraftSchemaDiagnostic { code: 'proposal_fields' | 'draft_fields' | 'acceptance_fields' | 'experience_fields'; message: string }
export type OrdinaryDraftInput = Pick<OrdinaryGameDraft, 'brief' | 'questions' | 'answers'>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 16000;
const steps = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(text);
const fields = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const invalid = (code: DraftSchemaDiagnostic['code'], message: string) => ({ ok: false as const, diagnostic: { code, message } });

/** Only model field shapes produce diagnostics; trusted input and full contract errors still throw. */
export function ordinaryDraftProposal(proposal: unknown, input: OrdinaryDraftInput):
  { ok: true; draft: OrdinaryGameDraft } | { ok: false; diagnostic: DraftSchemaDiagnostic } {
  if (!object(proposal) || !fields(proposal, ['acceptance', 'experienceCriteria', 'unsupported', 'benchmark', 'codeProfile'])) {
    return invalid('proposal_fields', 'Invalid design draft proposal fields. Allowed: acceptance, experienceCriteria, unsupported, benchmark, codeProfile.');
  }
  if (!Array.isArray(proposal.unsupported) || !proposal.unsupported.every(text)) return invalid('draft_fields', 'Invalid game draft fields: unsupported must be an array of nonempty strings.');
  const acceptance = proposal.acceptance;
  if (Array.isArray(acceptance)) for (const item of acceptance) {
    const stage = object(item) && [...HOST_STAGE_ACCEPTANCE, ...(proposal.codeProfile ? MODULE_STAGE_ACCEPTANCE : [])].find(stage => stage.acceptanceId === item.acceptanceId);
    if (stage && !sameValue(stage, item)) throw new Error('Host stage acceptance cannot be redefined.');
  }
  if (!Array.isArray(acceptance) || !acceptance.length || acceptance.length > 100 || acceptance.some(item => !object(item)
    || !fields(item, ['acceptanceId', 'description', 'steps', 'expected', 'evidenceKinds']) || !text(item.acceptanceId) || !text(item.description)
    || !steps(item.steps) || !text(item.expected) || !Array.isArray(item.evidenceKinds) || !item.evidenceKinds.length
    || item.evidenceKinds.some(kind => !['test_report', 'screenshot', 'video', 'log', 'user_decision'].includes(kind)))) {
    return invalid('acceptance_fields', 'Invalid acceptance draft fields: each item requires acceptanceId, description, steps, expected and evidenceKinds.');
  }
  const experience = proposal.experienceCriteria;
  if (!Array.isArray(experience) || experience.length > 100 || experience.some(item => !object(item)
    || !fields(item, ['criterionId', 'description', 'steps', 'expected']) || !text(item.criterionId) || !text(item.description) || !steps(item.steps) || !text(item.expected))) {
    return invalid('experience_fields', 'Invalid ordinary experience criteria fields: each item permits only criterionId, description, steps and expected; evidenceKinds is an acceptance field.');
  }
  const draft = { ...structuredClone(proposal), brief: input.brief, questions: structuredClone(input.questions), answers: structuredClone(input.answers), ordinaryProfile: 'ordinary-design/1' } as OrdinaryGameDraft;
  const selected = draft.codeProfile ? withHostStages(draft) : draft;
  validateGameDraft(selected, 'browser', 'ordinary-design/1');
  return { ok: true, draft: selected };
}

export function schemaCorrectionInput(input: OrdinaryDraftInput & { phase: string }, proposal: unknown, diagnostic: DraftSchemaDiagnostic) {
  return { ...input, schemaCorrection: { diagnostic, rejectedProposal: proposal,
    instruction: 'Preserve every original requirement in the complete brief, questions and answers. Return the complete corrected proposal. Do not weaken requirements or change host stages.',
    allowedFields: { proposal: ['acceptance', 'experienceCriteria', 'unsupported', 'benchmark', 'codeProfile'],
      acceptance: ['acceptanceId', 'description', 'steps', 'expected', 'evidenceKinds'], experienceCriteria: ['criterionId', 'description', 'steps', 'expected'] } } };
}
