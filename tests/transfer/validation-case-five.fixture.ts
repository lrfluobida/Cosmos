import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { transferCaseFourFixture } from './validation-case-four.fixture.ts';
import { runTransferValidationCaseFourWithHost } from '../../probes/transfer/validation-run.ts';
import { TRANSFER_VALIDATION_CASE_FOUR as D } from '../../probes/transfer/validation-case-four-declaration.ts';
import { createTransferValidationCaseFourIdentityReader } from '../../probes/transfer/validation-input.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';

/** Twelve stopped temporary synthetic cases; never reads actual Root records or calls a provider. */
export async function transferCaseFiveFixture(t: TestContext, fees = { planning: 14_294, design: 200_400 }) {
  const f = await transferCaseFourFixture(t); let charged = false;
  await runTransferValidationCaseFourWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    try {
      const task = taskFixture() as TaskContract, acceptanceId = input.window.quote.requirements.stageAcceptanceIds[0];
      Object.assign(task, { taskId: D.grants.design.taskId, runId: input.window.quote.basis.runId, kind: 'evaluation', specVersion: '1.0', authorId: 'offline-case4-design',
        acceptanceIds: [acceptanceId], dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
        review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
      task.acceptance[0].acceptanceId = acceptanceId; task.context.contextId = 'offline-case4-design-context';
      task.budget = { ledgerId: input.window.quote.basis.ledgerId, allocationMicroCny: D.grants.design.amountMicroCny, originalDeadlineAt: f.baseline.run.originalDeadlineAt };
      await input.controller.registerTasks([task]);
      for (const role of ['planning', 'design'] as const) {
        const requestId = `OFFLINE-transfer-case4-${role}`;
        await input.controller.reserve({ requestId, taskId: D.grants[role].taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: role === 'planning' ? 20_000 : 250_000,
          validation: { caseId: input.window.caseId, windowId: input.window.windowId, purpose: role === 'planning' ? 'planning' : 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
        await input.controller.admit(requestId);
        await input.controller.settle(requestId, fees[role], [{ artifactId: `OFFLINE-case4-${role}-cost`, version: 'v1', location: 'OFFLINE synthetic no provider' }]);
      }
      charged = true; return { outcome: 'failed', gaps: ['OFFLINE synthetic case4 design review failure, generatedByCosmos:false'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(charged, true);
  const identityReader = createTransferValidationCaseFourIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader };
  const quote = await prepareValidationAllocationClosure({ ...context, caseIds: [D.caseId] }), decisionId = 'OFFLINE-transfer-case4-closure';
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'offline-closure', version: 'v1', location: `${decisionId}.json` }, sourceRefs: [{ artifactId: 'offline-only', version: f.head, location: 'OFFLINE synthetic; generatedByCosmos:false' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
    decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote, decision });
  const baseline = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(baseline.validation.cases.length, 12); assert.equal(baseline.allocationClosureDecisions.length, 10);
  // Explicit synthetic approval only. Production Source50 may still be NOT_READY.
  const head = await f.updateMapping(mapping => {
    const item = mapping.tasks.find((item: any) => item.taskId === 'COS-50');
    Object.assign(item, { reviewedCommit: f.head, mergeCommit: f.head, reviewStatus: 'CAPTURE_LAYOUT_CONTRACT_SOURCE_READY', integrationStatus: 'offline-verified-awaiting-live' });
  });
  return { ...f, head, root: join(f.repository, '.cosmos/e2e/cos20-transfer-validation-5'), baseline,
    args: ['--validation-case', head, 'OFFLINE synthetic standing operator source; generatedByCosmos:false'] };
}
