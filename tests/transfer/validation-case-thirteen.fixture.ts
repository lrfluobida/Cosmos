import { caseTwelveFeeData } from './validation-case-twelve.fixture.ts';
import { withFixedTransferSuccessorFixture } from './validation-case-ten.fixture.ts';
import type { TestContext } from 'node:test';
import { deriveTransferValidationCaseTwelveDeclaration } from '../../probes/transfer/validation-case-twelve-declaration.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';

/** Pure SOURCE arithmetic rows; authenticated history is appended through the original APIs. */
export function caseThirteenFeeData(c12Cost = 1_664_926) {
  const state: any = caseTwelveFeeData(), declaration = deriveTransferValidationCaseTwelveDeclaration(state), windowId = 'SOURCE-C12-cost-window';
  state.validation.cases.push({ caseId: declaration.caseId, windowId, quote: { declaration }, stopReason: { code: 'manual' }, repair: null });
  state.ledger.allocationDelegations.push({ caseId: declaration.caseId, taskIds: VALIDATION_ROLES.map(role => declaration.grants[role].taskId) });
  state.ledger.allocations.push(...Object.values(declaration.grants));
  for (let i = 0; i < 52; i++) {
    const requestId = `SOURCE-C12-cost-${i}`, amount = i === 51 ? c12Cost - 51_000 : 1000;
    state.ledger.entries.push({ requestId, taskId: declaration.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only', status: 'settled', unknown: false,
      reservedMicroCny: 0, settledMicroCny: amount, evidence: [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE-only-C12-cost.json' }] });
    state.requests.push({ requestId, admittedAt: '2026-10-14T00:00:00.000Z', validation: { caseId: declaration.caseId, windowId, purpose: 'author' } });
  }
  state.ledger.allocationClosures.push(...VALIDATION_ROLES.map(role => ({ taskId: declaration.grants[role].taskId,
    releasedMicroCny: declaration.grants[role].amountMicroCny - (role === 'coding' ? c12Cost : 0) })));
  return structuredClone(state);
}
export function withTransferCaseThirteenFixture(t: TestContext, operation: Parameters<typeof withFixedTransferSuccessorFixture>[2]) {
  return withFixedTransferSuccessorFixture(t, 'thirteen', operation);
}
