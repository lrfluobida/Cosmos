import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { transferCaseTwoFixture } from './validation-case-two.fixture.ts';
import { runTransferValidationCaseTwoWithHost } from '../../probes/transfer/validation-run.ts';
import { TRANSFER_VALIDATION_CASE_TWO as D } from '../../probes/transfer/validation-case-two-declaration.ts';
import { createTransferValidationCaseTwoIdentityReader } from '../../probes/transfer/validation-input.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';

/** Ten temporary synthetic stopped cases. Never reads actual Root records or calls a provider. */
export async function transferCaseThreeFixture(t: TestContext, fees = { planning: 16_206, design: 145_322 }) {
  const f = await transferCaseTwoFixture(t); let charged = false;
  await runTransferValidationCaseTwoWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    try {
    const task = taskFixture() as TaskContract, acceptanceId = input.window.quote.requirements.stageAcceptanceIds[0];
    Object.assign(task, { taskId: D.grants.design.taskId, runId: input.window.quote.basis.runId, kind: 'evaluation', specVersion: '1.0', authorId: 'offline-case2-design',
      acceptanceIds: [acceptanceId], dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    task.acceptance[0].acceptanceId = acceptanceId; task.context.contextId = 'offline-case2-design-context';
    task.budget = { ledgerId: input.window.quote.basis.ledgerId, allocationMicroCny: D.grants.design.amountMicroCny, originalDeadlineAt: f.baseline.run.originalDeadlineAt };
    await input.controller.registerTasks([task]);
    for (const role of ['planning', 'design'] as const) {
      const requestId = `OFFLINE-transfer-case2-${role}`;
      await input.controller.reserve({ requestId, taskId: D.grants[role].taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: role === 'planning' ? 20_000 : 200_000,
        validation: { caseId: input.window.caseId, windowId: input.window.windowId, purpose: role === 'planning' ? 'planning' : 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
      await input.controller.admit(requestId);
      await input.controller.settle(requestId, fees[role], [{ artifactId: `OFFLINE-${role}-cost`, version: 'v1', location: 'OFFLINE synthetic no provider' }]);
    }
    charged = true; return { outcome: 'failed', gaps: ['OFFLINE synthetic case2 design failure, generatedByCosmos:false'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(charged, true);
  const identityReader = createTransferValidationCaseTwoIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader };
  const quote = await prepareValidationAllocationClosure({ ...context, caseIds: [D.caseId] }), decisionId = 'OFFLINE-transfer-case2-closure';
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'offline-closure', version: 'v1', location: `${decisionId}.json` }, sourceRefs: [{ artifactId: 'offline-only', version: f.head, location: 'OFFLINE synthetic; generatedByCosmos:false' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
    decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote, decision });
  const baseline = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(baseline.validation.cases.length, 10); assert.equal(baseline.allocationClosureDecisions.length, 8);
  return { ...f, root: join(f.repository, '.cosmos/e2e/cos20-transfer-validation-3'), baseline };
}
