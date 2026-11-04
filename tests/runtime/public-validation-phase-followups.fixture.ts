import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { TestContext } from 'node:test';
import { fundingFixture, fundedIntake, chargeIntake } from './public-validation-funding.fixture.ts';
import { settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import * as phases from '../../src/runtime/public-validation-phase-extension.ts';

export async function followupFixture(t: TestContext, historicalFunding = false) {
  const f = await fundingFixture(t, 20_000_000);
  for (const root of [f.root, f.repositoryRoot]) assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
  const options = { root: f.root, repositoryRoot: f.repositoryRoot, now: Date.now };
  const decide = async (quote: any, decisionId: string, kind: string, predecessor?: any) => {
    const decision = { kind, decisionId, actorId: 'offline-operator', decidedAt: new Date().toISOString(),
      source: { artifactId: 'phase', version: decisionId, location: `phase-${decisionId}-${quote.quoteId}.json` },
      sourceRefs: [...f.evidence, ...(predecessor ? [predecessor.operatorDecision.source] : [])] };
    const { source: _source, ...fields } = decision;
    await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: kind.replaceAll('_', '-') + '-decision/1', ...fields, quote }), 'utf8');
    return decision as any;
  };
  const close = async (name: string, phase?: any) => {
    if (!historicalFunding) return;
    const value = await fundedIntake({ ...f, authorization: async (...args) => {
      const auth = await f.authorization(...args);
      if (phase) auth.payload.sourceRefs = [...auth.payload.sourceRefs, phase.operatorDecision.source];
      await writeFile(join(f.root, auth.authorization.location), JSON.stringify(auth.payload), 'utf8'); return auth;
    } }, name);
    await chargeIntake(value, name + '-charge'); await value.controller.stop('Synthetic historical close'); await value.controller.close();
    await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId });
  };
  await close('thirty');
  const quote40 = await phases.preparePublicValidationPhaseExtension(options);
  const decision40 = await decide(quote40, 'offline-forty', 'operator_public_validation_phase_extension');
  const forty = await phases.applyPublicValidationPhaseExtension({ ...options, quote: quote40, decision: decision40 });
  await close('forty', forty);
  const quote45 = await phases.preparePublicValidationPhaseSuccessor({ ...options, toMicroCny: 45_000_000 });
  const decision45 = await decide(quote45, 'offline-forty-five', 'operator_public_validation_phase_successor', forty);
  const fortyFive = await phases.applyPublicValidationPhaseSuccessor({ ...options, quote: quote45, decision: decision45 });
  await close('forty-five', fortyFive);
  const prepare = (toMicroCny: number) => {
    assert.equal(typeof (phases as any).preparePublicValidationPhaseFollowup, 'function', 'Missing read-only followup API');
    return (phases as any).preparePublicValidationPhaseFollowup({ ...options, toMicroCny });
  };
  const decisionFor = async (quote: any, decisionId = `offline-${quote.toMicroCny}`) => {
    const state = await f.snapshot();
    return decide(quote, decisionId, 'operator_public_validation_phase_followup', state.publicValidationPhaseFollowups?.at(-1) ?? fortyFive);
  };
  const apply = (quote: any, decision: any) => (phases as any).applyPublicValidationPhaseFollowup({ ...options, quote, decision });
  const follow = async (toMicroCny: number) => {
    const quote = await prepare(toMicroCny), decision = await decisionFor(quote);
    return apply(quote, decision);
  };
  const authorization: typeof f.authorization = async (...args) => {
    const value = await f.authorization(...args), state = await f.snapshot();
    value.payload.sourceRefs = [...value.payload.sourceRefs, (state.publicValidationPhaseFollowups?.at(-1) ?? fortyFive).operatorDecision.source];
    await writeFile(join(f.root, value.authorization.location), JSON.stringify(value.payload), 'utf8');
    return value;
  };
  return { ...f, options, forty, fortyFive, decision40, decision45, prepare, decisionFor, apply, follow, authorization };
}
