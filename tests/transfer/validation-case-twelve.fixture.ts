import { caseElevenFeeData } from './validation-case-eleven.fixture.ts';
import { withFixedThreeYuanTransferFixture } from './validation-case-ten.fixture.ts';
import type { TestContext } from 'node:test';
import { deriveTransferValidationCaseElevenDeclaration } from '../../probes/transfer/validation-case-eleven-declaration.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';

/** Pure SOURCE arithmetic rows; authenticated history is appended through the original APIs. */
export function caseTwelveFeeData(c11Cost = 1_336_555) {
  const state: any = caseElevenFeeData(), declaration = deriveTransferValidationCaseElevenDeclaration(state), windowId = 'SOURCE-C11-cost-window';
  state.validation.cases.push({ caseId: declaration.caseId, windowId, quote: { declaration }, stopReason: { code: 'manual' }, repair: null });
  state.ledger.allocationDelegations.push({ caseId: declaration.caseId, taskIds: VALIDATION_ROLES.map(role => declaration.grants[role].taskId) });
  state.ledger.allocations.push(...Object.values(declaration.grants));
  for (let i = 0; i < 41; i++) {
    const requestId = `SOURCE-C11-cost-${i}`, amount = i === 40 ? c11Cost - 40_000 : 1000;
    state.ledger.entries.push({ requestId, taskId: declaration.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only', status: 'settled', unknown: false,
      reservedMicroCny: 0, settledMicroCny: amount, evidence: [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE-only-C11-cost.json' }] });
    state.requests.push({ requestId, admittedAt: '2026-10-14T00:00:00.000Z', validation: { caseId: declaration.caseId, windowId, purpose: 'author' } });
  }
  state.ledger.allocationClosures.push(...VALIDATION_ROLES.map(role => ({ taskId: declaration.grants[role].taskId,
    releasedMicroCny: declaration.grants[role].amountMicroCny - (role === 'coding' ? c11Cost : 0) })));
  return structuredClone(state);
}
export function withTransferCaseTwelveFixture(t: TestContext, operation: Parameters<typeof withFixedThreeYuanTransferFixture>[2]) {
  return withFixedThreeYuanTransferFixture(t, 'twelve', operation);
}
