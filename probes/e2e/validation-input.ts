import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { regularFile, safePath } from '../../src/artifacts/paths.ts';
import { freeze } from '../../src/roles/requirements.ts';
import { VALIDATION_CASE } from './validation-declaration.ts';

interface FrozenRequirements {
  requirementVersion: string; specVersion: string; scope: string; rules: string[];
  acceptanceIds: string[]; stageAcceptanceIds: string[]; [key: string]: unknown;
}
export interface FrozenValidationInput {
  kind: 'validation-case-input'; caseId: string; requirements: FrozenRequirements;
  manifest: typeof VALIDATION_CASE.inputs;
}
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** Fixed repository inputs only: never reads case sessions, shared snapshots or model configuration. */
export async function readValidationInput(repository: string): Promise<Readonly<FrozenValidationInput>> {
  const root = resolve(repository), expected = VALIDATION_CASE.inputs, actual: string[] = [];
  async function visit(folder: string): Promise<void> {
    for (const entry of await readdir(await safePath(root, folder), { withFileTypes: true })) {
      // These are also excluded by the existing generic toolchain copy.
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const name = `${folder}/${entry.name}`;
      await safePath(root, name);
      if (entry.isDirectory()) await visit(name); else actual.push(name);
    }
  }
  await visit('templates/2d');
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.template.files.map(file => file.path).sort())) throw new Error('Fixed generic template file set changed.');
  let requirementBytes: Buffer | undefined;
  for (const file of [expected.requirements, ...expected.template.files]) {
    const bytes = await regularFile(root, file.path); new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (hash(bytes) !== file.sha256) throw new Error(`Fixed validation input changed: ${file.path}`);
    if (file.path === expected.requirements.path) requirementBytes = bytes;
  }
  if (hash(JSON.stringify(expected.template.files)) !== expected.template.sha256) throw new Error('Fixed template declaration hash does not match its files.');
  const requirements = JSON.parse(requirementBytes!.toString('utf8')) as FrozenRequirements;
  if (requirements.requirementVersion !== expected.requirements.version || requirements.specVersion !== '1.0'
    || !Array.isArray(requirements.acceptanceIds) || requirements.acceptanceIds.length !== 8
    || !Array.isArray(requirements.stageAcceptanceIds) || requirements.stageAcceptanceIds.length !== 2) throw new Error('Fixed validation requirement version or acceptance scope changed.');
  return freeze({ kind: 'validation-case-input' as const, caseId: VALIDATION_CASE.caseId, requirements, manifest: structuredClone(expected) });
}
