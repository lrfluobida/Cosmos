import type { TestContext } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { groupFixture } from './validation-group.fixture.ts';

/** All charges/closures use the production controller in a fresh TEMP repository. */
export async function supplementFixture(t: TestContext, closeSecond = true, initialChargeMicroCny?: number) {
  const f = await groupFixture(t, initialChargeMicroCny), first = await f.claim(await f.declaration('cos20-supplement-first'));
  await f.charge(first, 'art', 2_400_000); await f.charge(first, 'coding', 2_500_000); await f.close(first);
  const d = await f.declaration('cos20-supplement-second');
  for (const [role, amount] of Object.entries({ planning: 1, design: 1, art: 2_599_997, coding: 2_500_000, repair: 1 })) d.grants[role].amountMicroCny = amount;
  const second = await f.claim(d);
  await f.charge(second, 'art', 2_300_000); await f.charge(second, 'coding', 1_900_314);
  if (closeSecond) await f.close(second);
  const before = await f.snapshot();
  const target = await f.declaration('cos20-transfer-validation-14');
  for (const [role, amount] of Object.entries({ planning: 1, design: 1, art: 1, coding: 1_900_000, repair: 599_997 })) target.grants[role].amountMicroCny = amount;
  target.limits.incrementalMicroCny = 2_500_000;
  const decision = async (quote: unknown, decisionId = 'offline-supplement-1') => {
    const value = { kind: 'operator_validation_group_supplement' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date(f.now()).toISOString(),
      source: { artifactId: 'supplement', version: decisionId, location: `${decisionId}.json` }, sourceRefs: f.evidence };
    await writeFile(join(f.root, value.source.location), JSON.stringify({ formatVersion: 'operator-validation-group-supplement-decision-1', kind: value.kind,
      decisionId, actorId: value.actorId, decidedAt: value.decidedAt, sourceRefs: value.sourceRefs, quote }), 'utf8');
    return value;
  };
  return { ...f, second, beforeSupplement: before, target, decision };
}
