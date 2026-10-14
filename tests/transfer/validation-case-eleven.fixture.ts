import { caseTenFeeData, withFixedThreeYuanTransferFixture } from './validation-case-ten.fixture.ts';
import type { TestContext } from 'node:test';
import { deriveTransferValidationCaseTenDeclaration } from '../../probes/transfer/validation-case-ten-declaration.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';

/** Pure SOURCE arithmetic rows; never a substitute for authenticated case history. */
export function caseElevenFeeData(c10Cost = 1_086_265) {
  const state: any = caseTenFeeData(), declaration = deriveTransferValidationCaseTenDeclaration(state), windowId = 'SOURCE-C10-cost-window';
  state.validation.cases.push({ caseId: declaration.caseId, windowId, quote: { declaration }, stopReason: { code: 'manual' }, repair: null });
  state.ledger.allocationDelegations.push({ caseId: declaration.caseId, taskIds: VALIDATION_ROLES.map(role => declaration.grants[role].taskId) });
  state.ledger.allocations.push(...Object.values(declaration.grants));
  for (let i = 0; i < 40; i++) {
    const requestId = `SOURCE-C10-cost-${i}`, amount = i === 39 ? c10Cost - 39_000 : 1000;
    state.ledger.entries.push({ requestId, taskId: declaration.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only', status: 'settled', unknown: false,
      reservedMicroCny: 0, settledMicroCny: amount, evidence: [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE-only-C10-cost.json' }] });
    state.requests.push({ requestId, admittedAt: '2026-10-14T00:00:00.000Z', validation: { caseId: declaration.caseId, windowId, purpose: 'author' } });
  }
  state.ledger.allocationClosures.push(...VALIDATION_ROLES.map(role => ({ taskId: declaration.grants[role].taskId,
    releasedMicroCny: declaration.grants[role].amountMicroCny - (role === 'coding' ? c10Cost : 0) })));
  return structuredClone(state);
}
export function withTransferCaseElevenFixture(t: TestContext, operation: Parameters<typeof withFixedThreeYuanTransferFixture>[2]) {
  return withFixedThreeYuanTransferFixture(t, 'eleven', operation);
}
