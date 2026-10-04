import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { transferValidationFixture } from './validation-run.fixture.ts';
import { runTransferValidationWithHost } from '../../probes/transfer/validation-run.ts';
import { TRANSFER_VALIDATION_CASE as D } from '../../probes/transfer/validation-declaration.ts';
import { createTransferValidationIdentityReader } from '../../probes/transfer/validation-input.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';

/** Extends the old temporary synthetic history; never reads Root's actual ledger or case. */
export async function transferCaseTwoFixture(t: TestContext) {
  const f = await transferValidationFixture(t); let charged = false;
  await runTransferValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    const requestId = 'OFFLINE-transfer-case1-planning';
    await input.controller.reserve({ requestId, taskId: D.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 20_000,
      validation: { caseId: input.window.caseId, windowId: input.window.windowId, purpose: 'planning', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
    await input.controller.admit(requestId);
    await input.controller.settle(requestId, 14_102, [{ artifactId: 'OFFLINE-planning-cost', version: 'v1', location: 'OFFLINE synthetic no provider' }]);
    charged = true; return { outcome: 'failed', gaps: ['OFFLINE synthetic case1 failure, generatedByCosmos:false'] };
  } } });
  assert.equal(charged, true);
  const identityReader = createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader };
  const quote = await prepareValidationAllocationClosure({ ...context, caseIds: [D.caseId] }), decisionId = 'OFFLINE-transfer-case1-closure';
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'offline-closure', version: 'v1', location: `${decisionId}.json` }, sourceRefs: [{ artifactId: 'offline-only', version: f.head, location: 'OFFLINE synthetic; generatedByCosmos:false' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
    decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote, decision });
  const baseline = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(baseline.validation.cases.length, 9); assert.equal(baseline.allocationClosureDecisions.length, 7);
  return { ...f, root: join(f.repository, '.cosmos/e2e/cos20-transfer-validation-2'), baseline };
}
