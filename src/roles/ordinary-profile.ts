export type OrdinaryProfile = 'ordinary-design/1';
export interface ExperienceCriterion { criterionId: string; description: string; steps: string[]; expected: string }

export function validateOrdinaryProfile(value: unknown): asserts value is OrdinaryProfile | undefined {
  if (value !== undefined && value !== 'ordinary-design/1') throw new Error('Unknown ordinary profile.');
}
export function validateExperienceCriteria(value: unknown, acceptanceIds: string[]): asserts value is ExperienceCriterion[] {
  const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 16000;
  if (!Array.isArray(value) || value.length > 100 || new Set(value.map(item => item?.criterionId)).size !== value.length
    || value.some(item => !item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some(key => !['criterionId', 'description', 'steps', 'expected'].includes(key))
      || !text(item.criterionId) || acceptanceIds.includes(item.criterionId) || !text(item.description) || !text(item.expected)
      || !Array.isArray(item.steps) || !item.steps.length || item.steps.some((step: unknown) => !text(step)))) {
    throw new Error('Invalid ordinary experience criteria.');
  }
}
