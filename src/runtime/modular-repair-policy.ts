import { isDeepStrictEqual } from 'node:util';
import { regularFile } from '../artifacts/paths.ts';
import { validationHash } from './validation-validation.ts';
import type { IntakeSnapshot } from './intake.ts';
import type { RunSnapshot } from './run-types.ts';

const ORIGINAL_POLICY = Object.freeze({ version: 'module-repair/1' as const, codeProfile: 'modular-code/1', moduleCount: 2,
  maxRepairTasks: 1, maxTaskAttempts: 2, successor: 'unstarted-integration-only', grant: 'original-unallocated-remainder' });
export interface ModularRepairPolicy { version: 'module-repair/1'; sha256: string; policy: typeof ORIGINAL_POLICY }
export function currentModularRepairPolicy(): ModularRepairPolicy {
  return { version: ORIGINAL_POLICY.version, sha256: validationHash(JSON.stringify(ORIGINAL_POLICY)), policy: { ...ORIGINAL_POLICY } };
}
/** Known original policy semantics remain readable independently of the active installed policy. */
export function validateModularRepairPolicy(value: unknown): asserts value is ModularRepairPolicy | undefined {
  if (value === undefined) return;
  const binding = value as ModularRepairPolicy;
  if (!binding || binding.version !== 'module-repair/1' || !isDeepStrictEqual(binding.policy, ORIGINAL_POLICY)
    || binding.sha256 !== validationHash(JSON.stringify(binding.policy)) || Object.keys(binding).some(key => !['version', 'sha256', 'policy'].includes(key))) throw new Error('Original modular repair policy is invalid.');
}
export async function requireCurrentModularRepairPolicy(binding?: ModularRepairPolicy): Promise<void> {
  validateModularRepairPolicy(binding);
  if (binding && !isDeepStrictEqual(binding, currentModularRepairPolicy())) throw new Error('Installed modular repair policy changed; original execution cannot migrate.');
}
export const policyVersionSuffix = (binding?: ModularRepairPolicy) => {
  validateModularRepairPolicy(binding); return binding ? `-module-repair-${binding.sha256}` : '';
};
export const policyCreatedSuffix = (binding?: ModularRepairPolicy) => {
  validateModularRepairPolicy(binding); return binding ? ` Modular-repair policy: ${binding.sha256}.` : '';
};
async function optional(root: string, path: string): Promise<any | undefined> {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, path))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
/** Absence in an old origin means old integration-only scope; absence under an anchor is corruption. */
export async function readModularRepairPolicy(root: string, state: IntakeSnapshot | RunSnapshot): Promise<ModularRepairPolicy | undefined> {
  const origin = await optional(root, 'intake-origin.json');
  let binding: ModularRepairPolicy | undefined, ref: { version: string } | undefined;
  if (state.formatVersion === 'intake-1') binding = state.modularRepairPolicy;
  else {
    const decision = state.run.humanDecisions.find(row => row.decisionId.startsWith('requirements-v'));
    const source = decision?.evidence.find(ref => ref.artifactId === 'user-confirmation'); ref = source;
    const receipt = source ? await optional(root, source.location) : undefined; binding = receipt?.modularRepairPolicy;
    if (binding) {
      const frame: typeof import('./render-frame-selection.ts') = await import('./render-frame-selection.ts');
      frame.validateFrameSelection(receipt.renderFrames);
      const revision = receipt.revision;
      if (!decision || !Number.isSafeInteger(revision) || revision < 1 || decision.decisionId !== `requirements-v${revision}`
        || receipt.runId !== state.run.runId || receipt.confirmed !== true || receipt.actorId !== decision.actorId || receipt.at !== decision.decidedAt
        || !isDeepStrictEqual(receipt.renderFrames, origin?.renderFrames)
        || !isDeepStrictEqual(receipt.draft, { artifactId: 'requirement-draft', version: `v${revision}`, location: `requirements/v${revision}/draft.json` })
        || !isDeepStrictEqual(receipt.draft, decision.evidence[0]) || decision.evidence.length !== 2
        || !isDeepStrictEqual(source, { artifactId: 'user-confirmation', version: frame.frameConfirmationVersion(revision, receipt.renderFrames, binding), location: `requirements/v${revision}/confirmation.json` })) throw new Error('Original policy confirmation identity changed.');
    }
  }
  validateModularRepairPolicy(binding);
  if (!isDeepStrictEqual(binding, origin?.modularRepairPolicy)) throw new Error('Original modular policy source changed.');
  const suffix = policyVersionSuffix(binding), created = state.events[0]?.reason;
  if (ref && (binding ? !ref.version.endsWith(suffix) : ref.version.includes('-module-repair-'))
    || (binding ? !created?.endsWith(policyCreatedSuffix(binding)) : created?.includes(' Modular-repair policy: '))) throw new Error('Original policy version anchor changed or is missing.');
  if (binding && (!origin || origin.runId !== state.run.runId || typeof origin.brief !== 'string')) throw new Error('Original policy intake identity changed.');
  return binding && structuredClone(binding);
}
