import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { transferCaseFiveFixture } from './validation-case-five.fixture.ts';
import { runTransferValidationCaseFiveWithHost } from '../../probes/transfer/validation-run.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D } from '../../probes/transfer/validation-case-five-declaration.ts';
import { createTransferValidationCaseFiveIdentityReader } from '../../probes/transfer/validation-input.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import { genuineCaseFiveStages } from './validation-case-six-stages.fixture.ts';
import { buildPassedStageManifest } from './passed-stage-reuse.fixture.ts';

/** Thirteen stopped TEMP cases; 65 admitted C5 requests and one pre-admission cancellation. No provider. */
export async function transferCaseSixFixture(t: TestContext, fees = { planning: 16938, design: 255740, art: 166678, coding: 677647 }, withStages = false) {
  const f = await transferCaseFiveFixture(t); let charged = false, passed: Awaited<ReturnType<typeof genuineCaseFiveStages>> | undefined;
  await runTransferValidationCaseFiveWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    try {
    if (withStages) passed = await genuineCaseFiveStages(input, fees);
    const contracts = passed ? [passed.coding.task] : (['design', 'art', 'coding'] as const).map(role => {
      const task = taskFixture() as TaskContract, acceptanceIds = role === 'coding' ? input.window.quote.requirements.acceptanceIds : [input.window.quote.requirements.stageAcceptanceIds[role === 'art' ? 1 : 0]];
      Object.assign(task, { taskId: D.grants[role].taskId, runId: input.window.quote.basis.runId, kind: 'evaluation', specVersion: '1.0', authorId: `OFFLINE-case5-${role}`,
        acceptanceIds, dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
        review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
      task.acceptance = acceptanceIds.map(acceptanceId => ({ ...structuredClone(task.acceptance[0]), acceptanceId })); task.context.contextId = `OFFLINE-case5-${role}-context`;
      task.budget = { ledgerId: input.window.quote.basis.ledgerId, allocationMicroCny: D.grants[role].amountMicroCny, originalDeadlineAt: f.baseline.run.originalDeadlineAt };
      return task;
    });
    await input.controller.registerTasks(contracts);
    const counts = { planning: 3, design: 20, art: 15, coding: 27 };
    const current = await input.controller.read();
    for (const role of ['planning', 'design', 'art', 'coding'] as const) {
      const oldRows = current.ledger.entries.filter(entry => entry.taskId === D.grants[role].taskId), count = counts[role] - oldRows.length;
      let remaining = fees[role] - oldRows.reduce((sum, row) => sum + row.settledMicroCny, 0);
      for (let index = 0; index < count; index++) {
        const amount = Math.floor(remaining / (count - index)); remaining -= amount;
        const requestId = `OFFLINE-case5-${role}-${index}`;
        await input.controller.reserve({ requestId, taskId: D.grants[role].taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: Math.max(amount, 16_000),
          validation: { caseId: input.window.caseId, windowId: input.window.windowId, purpose: role === 'planning' ? 'planning' : 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
        await input.controller.admit(requestId); await input.controller.settle(requestId, amount, [{ artifactId: `OFFLINE-${role}-${index}`, version: 'v1', location: 'OFFLINE synthetic no provider' }]);
      }
    }
    const requestId = 'OFFLINE-case5-before-admission';
    await input.controller.reserve({ requestId, taskId: D.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 16_000,
      validation: { caseId: input.window.caseId, windowId: input.window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
    await input.controller.cancel(requestId, [{ artifactId: 'OFFLINE-cancelled', version: 'v1', location: 'OFFLINE synthetic no provider' }], { provenNoCost: true });
    charged = true; return { outcome: 'failed', gaps: ['OFFLINE C5 stopped before coding capture; generatedByCosmos:false'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(charged, true);
  const identityReader = createTransferValidationCaseFiveIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader };
  const quote = await prepareValidationAllocationClosure({ ...context, caseIds: [D.caseId] }), decisionId = 'OFFLINE-case5-closure';
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId, actorId: 'OFFLINE-coordinator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'OFFLINE-closure', version: 'v1', location: `${decisionId}.json` }, sourceRefs: [{ artifactId: 'OFFLINE-only', version: f.head, location: 'OFFLINE synthetic; generatedByCosmos:false' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
    decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote, decision });
  const baseline = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  let manifest: any;
  if (passed) { manifest = (await buildPassedStageManifest(passed)).manifest; await writeFile(join(f.ledgerRoot, 'cos20-transfer-validation-6-reuse.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8'); }
  const head = await f.updateMapping(mapping => {
    for (const [taskId, reviewStatus] of Object.entries({ 'COS-51': 'TRANSFER_CASE_FIVE_SOURCE_READY', 'COS-52': 'PRODUCTION_TRANSFER_RUNTIME_SOURCE_READY',
      'COS-53': 'HUMAN_PREPARATION_DRAFT_SOURCE_READY', 'COS-54': 'ROLE_FILE_INVENTORY_SOURCE_READY', 'COS-55': 'CODING_BUILD_FEEDBACK_SOURCE_READY', 'COS-56': 'HISTORICAL_PASSED_STAGES_SOURCE_READY' })) {
      Object.assign(mapping.tasks.find((item: any) => item.taskId === taskId), { reviewedCommit: f.head, mergeCommit: f.head, reviewStatus, integrationStatus: 'offline-verified-awaiting-live' });
    }
  });
  await f.git('update-ref', 'refs/remotes/origin/main', head);
  return { ...f, head, baseline, passed, manifest, root: join(f.repository, '.cosmos/e2e/cos20-transfer-validation-6'),
    args: ['--validation-case', head, 'OFFLINE synthetic standing source; generatedByCosmos:false'] };
}
