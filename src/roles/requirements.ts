import { validateRequirement } from '../contracts/index.ts';
import type { RequirementContract } from '../contracts/index.ts';

export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export interface ClarificationInput {
  brief: string;
  specVersion: string;
  sources: RequirementContract['sources'];
  acceptance: RequirementContract['acceptance'];
  questions: { id: string; prompt: string }[];
  answers: Record<string, string>;
}

/** Host-supplied concentrated questions and acceptance draft; this phase makes no model calls. */
export function prepareClarification(input: ClarificationInput) {
  if (!input.brief?.trim() || input.questions.length < 1 || input.questions.length > 12) throw new Error('A brief and 1 to 12 clarification questions are required.');
  if (new Set(input.questions.map(q => q.id)).size !== input.questions.length || input.questions.some(q => !q.id.trim() || !q.prompt.trim())) throw new Error('Question IDs and prompts must be non-empty and unique.');
  if (Object.keys(input.answers).some(id => !input.questions.some(q => q.id === id))) throw new Error('Answers must refer to declared questions.');
  const missingQuestionIds = input.questions.filter(q => typeof input.answers[q.id] !== 'string' || !input.answers[q.id].trim()).map(q => q.id);
  return freeze(structuredClone({ brief: input.brief, specVersion: input.specVersion, sources: input.sources, acceptance: input.acceptance, questions: input.questions, answers: input.answers, missingQuestionIds }));
}

/** Called only with the user's explicit confirmation of this exact draft and its answers. */
export function confirmRequirements(draft: ClarificationInput, confirmation: { confirmed: boolean; actorId: string; at: string }): RequirementContract {
  const current = prepareClarification(draft);
  if (current.missingQuestionIds.length) throw new Error('Required clarification answers are missing.');
  if (confirmation.confirmed !== true) throw new Error('Explicit user confirmation is required.');
  const result: RequirementContract = { contractVersion: '1.0.0', specVersion: current.specVersion, sources: current.sources, acceptance: current.acceptance, confirmedBy: confirmation.actorId, confirmedAt: confirmation.at };
  const errors = validateRequirement(result);
  if (errors.length) throw new Error(`Invalid confirmed requirement: ${errors.map(e => e.message).join('; ')}`);
  return freeze(result);
}
