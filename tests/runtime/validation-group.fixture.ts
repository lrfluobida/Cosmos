import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/index.ts';

export const vector = { planning: 400_000, design: 1_200_000, art: 2_800_000, coding: 2_800_000, repair: 2_800_000 };
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const evidence = [{ artifactId: 'offline-billing', version: 'v1', location: 'offline-billing.json' }];

/** Synthetic original allocations. No private snapshot, provider or generated game is used. */
export async function groupFixture(t: TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'cosmos-validation-group-')), root = join(base, 'ledger'), repositoryRoot = join(base, 'repository');
  let clock = Date.parse('2026-10-01T06:16:16.857Z'), serial = 0, current: any;
  const now = () => clock, owners: RunController[] = [];
  t.after(async () => { for (const owner of owners) await owner.close().catch(() => {}); assert.ok(base.startsWith(tmpdir())); await rm(base, { recursive: true, force: true }); });
  const original = await RunController.create({ root, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', specVersion: '1.0', kind: 'evaluation', scope: 'validation', now,
    allocations: [{ taskId: 'COS-16', amountMicroCny: 10_000_000 }, { taskId: 'offline-other-legacy', amountMicroCny: 74_596_040 }] });
  await original.importSettled({ requestId: 'prior-deepseek-direct-probes', taskId: 'offline-other-legacy', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 1_116_402, evidence });
  await original.close(); clock = Date.parse('2026-10-01T18:16:16.858Z');
  await mkdir(join(repositoryRoot, 'template'), { recursive: true }); await writeFile(join(repositoryRoot, 'template/package.json'), '{}\n', 'utf8');
  const files = [{ path: 'template/package.json', sha256: hash('{}\n') }];
  for (const grouped of [false, true]) await writeFile(join(repositoryRoot, grouped ? 'group.json' : 'old.json'), JSON.stringify({ specVersion: '1.0', requirementVersion: grouped ? 'group-v1' : 'old-v1',
    acceptanceIds: ['game'], stageAcceptanceIds: ['design', 'art'], rule: '原始额度与历史不变', ...(grouped ? { budgetGroup: { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 } } : {}) }), 'utf8');
  const declaration = async (caseId: string, grouped = true, ratio = 1): Promise<any> => {
    const path = grouped ? 'group.json' : 'old.json', amounts = grouped ? vector : { planning: 2_000_000, design: 1_900_000, art: 5_700_000, coding: 7_600_000, repair: 3_800_000 };
    return { formatVersion: grouped ? 'validation-declaration-3' : 'validation-declaration-2', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
      limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000, durationMs: 2_700_000, maxRequests: 80, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
      grants: Object.fromEntries(Object.entries(amounts).map(([role, amount]) => [role, { taskId: `${caseId}-${role}`, amountMicroCny: Math.floor(amount * ratio) }])),
      outputTokens: { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 },
      inputs: { requirements: { version: grouped ? 'group-v1' : 'old-v1', path, sha256: hash(await readFile(join(repositoryRoot, path))) }, template: { sha256: hash(JSON.stringify(files)), files } },
      ...(grouped ? { budgetGroup: { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 } } : {}) };
  };
  const context = { root, repositoryRoot, now, identityReader: async () => ({ reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(current) }) };
  const claim = async (d: any) => {
    current = d; const quote = await prepareValidationCase({ ...context, declaration: d }), decisionId = `offline-operator-${++serial}`;
    const decision = { kind: 'operator_validation' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date(now()).toISOString(),
      source: { artifactId: 'operator', version: decisionId, location: decisionId + '.json' }, sourceRefs: evidence };
    await writeFile(join(root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId, actorId: decision.actorId,
      decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...context, quote, decision });
    await mkdir(join(repositoryRoot, '.cosmos/e2e', window.caseId, 'registry'), { recursive: true });
    const controller = await RunController.openValidationCase({ ...context, caseId: window.caseId, windowId: window.windowId }); owners.push(controller);
    return { controller, window, quote, decision, declaration: d };
  };
  const close = async (value: Awaited<ReturnType<typeof claim>>) => {
    await value.controller.stop('Synthetic case finished.'); await value.controller.close(); clock++;
    current = value.declaration; const quote = await prepareValidationAllocationClosure({ ...context, caseIds: [value.window.caseId] });
    const decisionId = `offline-closure-${++serial}`, decision = { kind: 'operator_validation_allocation_closure' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date(now()).toISOString(),
      source: { artifactId: 'closure', version: decisionId, location: decisionId + '.json' }, sourceRefs: evidence };
    await writeFile(join(root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind, decisionId, actorId: decision.actorId,
      decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
    await applyValidationAllocationClosure({ ...context, quote, decision }); clock++; return quote;
  };
  await close(await claim(await declaration('cos20-old-group-fixture', false)));
  const beforeBytes = await readFile(join(root, 'snapshot.json')), before = JSON.parse(beforeBytes.toString('utf8'));
  const register = async (value: Awaited<ReturnType<typeof claim>>, role: 'design' | 'art' | 'coding') => {
    const task = taskFixture() as TaskContract, grant = value.declaration.grants[role], acceptanceId = role === 'coding' ? 'game' : role;
    Object.assign(task, { taskId: grant.taskId, runId: before.run.runId, kind: 'evaluation', specVersion: '1.0', authorId: `offline-${role}`, acceptanceIds: [acceptanceId],
      dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    task.acceptance[0].acceptanceId = acceptanceId; task.context.contextId = `offline-${role}-context`;
    task.budget = { ledgerId: before.ledger.ledgerId, allocationMicroCny: grant.amountMicroCny, originalDeadlineAt: before.run.originalDeadlineAt };
    await value.controller.registerTasks([task]); return task;
  };
  const request = (value: Awaited<ReturnType<typeof claim>>, role: keyof typeof vector, requestId: string, amount: number) => ({ requestId, taskId: value.declaration.grants[role].taskId,
    provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: amount,
    validation: { caseId: value.window.caseId, windowId: value.window.windowId, purpose: role === 'planning' ? 'planning' as const : 'author' as const,
      modelId: 'deepseek-flash' as const, maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
  const charge = async (value: Awaited<ReturnType<typeof claim>>, role: 'art' | 'coding', amount: number) => {
    await register(value, role); const id = `offline-charge-${++serial}`;
    await value.controller.reserve(request(value, role, id, amount)); await value.controller.admit(id); await value.controller.settle(id, amount, evidence);
  };
  return { ...context, before, beforeBytes, declaration, claim, close, register, request, charge, evidence,
    setCurrent: (value: any) => { current = value; }, snapshot: async () => JSON.parse((await readFile(join(root, 'snapshot.json'))).toString('utf8')) };
}
