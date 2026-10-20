import { createHash } from 'node:crypto';
import { regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateOrdinaryProfile } from '../roles/ordinary-profile.ts';
import type { OrdinaryProfile } from '../roles/ordinary-profile.ts';

export const ORDINARY_PROFILE_SOURCE = 'intake-ordinary-profile.json';
export function ordinaryDraftSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
async function optional(root: string, path: string): Promise<any | undefined> {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, path))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
/** A separate write-once source detects deletion of the selectable fields. It grants no execution authority. */
export async function readOrdinaryProfile(root: string, identity: { runId: string; createdAt: string }, expected?: { ordinaryProfile?: OrdinaryProfile }): Promise<OrdinaryProfile | undefined> {
  const source = await optional(root, ORDINARY_PROFILE_SOURCE), origin = await optional(root, 'intake-origin.json');
  const profile = source?.ordinaryProfile;
  validateOrdinaryProfile(profile); validateOrdinaryProfile(origin?.ordinaryProfile);
  if (expected) validateOrdinaryProfile(expected.ordinaryProfile);
  if (source !== undefined && (!profile || !sameValue(source, { ...identity, ordinaryProfile: profile }))
    || profile !== origin?.ordinaryProfile || expected && profile !== expected.ordinaryProfile) throw new Error('Original ordinary profile source changed.');
  if (profile && (!origin || origin.runId !== identity.runId || typeof origin.brief !== 'string' || !origin.brief.trim() || origin.draftMode !== undefined)) {
    throw new Error('Original ordinary profile origin changed.');
  }
  return profile;
}
