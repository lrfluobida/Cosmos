import { createHash } from 'node:crypto';
import type { RunEvent } from './run-types.ts';

export interface IntakeSuccessorClaim { roundId: string; slot: 1; failureKind: 'schema' | 'length' | 'pre_admission_denied'; sourceSha256: string }
export const successorSourceHash = (intent: unknown) => createHash('sha256').update(JSON.stringify(intent)).digest('hex');

/** One durable ordinary slot, independent of whether the intake has public funding. */
export function intakeSuccessorClaims(events: RunEvent[]): IntakeSuccessorClaim[] {
  const claims: IntakeSuccessorClaim[] = [];
  for (const event of events.filter(event => event.type === 'intake_draft_successor_claimed')) {
    const claim = JSON.parse(event.reason) as IntakeSuccessorClaim;
    if (event.requestId !== null || !claim || Object.keys(claim).sort().join(',') !== 'failureKind,roundId,slot,sourceSha256'
      || !/^draft-[1-9]\d*$/.test(claim.roundId) || claim.slot !== 1 || !['schema', 'length', 'pre_admission_denied'].includes(claim.failureKind)
      || !/^[a-f0-9]{64}$/.test(claim.sourceSha256) || claims.some(previous => previous.roundId === claim.roundId)
      || events.some(prior => prior.sequence < event.sequence && ['generation_activated', 'stopped'].includes(prior.type))) {
      throw new Error('Invalid or duplicate intake draft successor claim.');
    }
    claims.push(claim);
  }
  return claims;
}
