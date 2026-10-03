import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const evidence = [{ artifactId: 'offline-billing', version: 'v1', location: 'offline-billing.json' }];

export async function allocationFixture(t: test.TestContext, acceptanceIds = ['game']) {
  const base = await mkdtemp(join(tmpdir(), 'cosmos-allocation-closure-')), root = join(base, 'ledger'), repositoryRoot = join(base, 'repository');
  t.after(() => rm(base, { recursive: true, force: true }));
  let clock = Date.parse('2026-10-01T06:16:16.857Z'), platformSha = 'a'.repeat(40);
  const now = () => clock;
  const controller = await RunController.create({ root, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', kind: 'evaluation', scope: 'validation', specVersion: '1.0',
    allocations: [{ taskId: 'legacy', amountMicroCny: 84_596_040 }], now });
  await controller.importSettled({ requestId: 'legacy-spent', taskId: 'legacy', provider: 'fixture', pricingVersion: 'v1', actualCostMicroCny: 1_116_402, evidence });
  await controller.close(); clock += 12 * 60 * 60 * 1000 + 1;
  await mkdir(join(repositoryRoot, 'template'), { recursive: true });
  const requirements = JSON.stringify({ specVersion: '1.0', requirementVersion: 'fixture-v1', acceptanceIds, stageAcceptanceIds: ['design', 'art'], rule: '保留原始验收与费用' });
  const template = '{"fixture":true}\n', files = [{ path: 'template/package.json', sha256: hash(template) }];
  await writeFile(join(repositoryRoot, 'requirements.json'), requirements, 'utf8'); await writeFile(join(repositoryRoot, files[0].path), template, 'utf8');
  const declaration = (caseId: string, version: 1 | 2 = 2): ValidationDeclaration => ({
    formatVersion: version === 1 ? 'validation-declaration-1' : 'validation-declaration-2', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
    limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000, durationMs: 2_700_000, maxRequests: version === 1 ? 40 : 80,
      maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
    grants: Object.fromEntries(Object.entries({ planning: 2_000_000, design: 1_900_000, art: 5_700_000, coding: 7_600_000, repair: 3_800_000 })
      .map(([role, amountMicroCny]) => [role, { taskId: `${caseId}-${role}`, amountMicroCny }])) as ValidationDeclaration['grants'],
    outputTokens: { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 },
    inputs: { requirements: { version: 'fixture-v1', path: 'requirements.json', sha256: hash(requirements) }, template: { sha256: hash(JSON.stringify(files)), files } },
  });
  const identityReader = async (_signal: AbortSignal) => ({ reviewedPlatformSha: platformSha, frozenCaseInputHash: validationInputHash(declaration('cos20-fixture')) });
  const context = { root, repositoryRoot, now, identityReader }, caseIds = ['cos20-native-validation-1', 'cos20-native-validation-2', 'cos20-native-validation-3'];
  for (let i = 0; i < caseIds.length; i++) {
    const d = declaration(caseIds[i], i < 2 ? 1 : 2), quote = await prepareValidationCase({ ...context, declaration: d });
    const decision = { kind: 'operator_validation' as const, decisionId: `case-decision-${i}`, actorId: 'offline-coordinator', decidedAt: new Date(now()).toISOString(),
      source: { artifactId: `case-decision-${i}`, version: 'v1', location: `operator-${i}.json` }, sourceRefs: evidence };
    await writeFile(join(root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
      actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...context, quote, decision });
    await mkdir(join(repositoryRoot, '.cosmos/e2e', window.caseId, 'registry'), { recursive: true });
    const owner = await RunController.openValidationCase({ ...context, caseId: window.caseId, windowId: window.windowId });
    try {
      if (i) {
        const requestId = `case-${i}-spent`;
        await owner.reserve({ requestId, taskId: d.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 1_000_008,
          validation: { caseId: window.caseId, windowId: window.windowId, purpose: 'planning', modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 500_000, hasImages: false } });
        await owner.admit(requestId); await owner.settle(requestId, i === 1 ? 857_751 : 68_875, evidence);
      }
      await owner.stop(`Stopped fixture case ${i + 1}`);
    } finally { await owner.close(); }
    clock += 1;
  }
  platformSha = 'b'.repeat(40); // A closure must bind current reviewed code, preserving old case quote identities.
  const originalBytes = await readFile(join(root, 'snapshot.json'));
  return { ...context, caseIds, declaration, originalBytes, original: JSON.parse(originalBytes.toString('utf8')), base,
    changeIdentity: () => { platformSha = 'c'.repeat(40); }, advance: (ms: number) => { clock += ms; } };
}

export async function closureDecision(f: Awaited<ReturnType<typeof allocationFixture>>, quote: unknown) {
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'closure-1', actorId: 'offline-coordinator', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'allocation-closure-decision', version: 'v1', location: 'closure-operator.json' },
    sourceRefs: [{ artifactId: 'standing-validation-budget', version: 'v1', location: 'offline-user-source' }] };
  await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
    decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  return decision;
}
