import { COS16_GROUP_GRANTS } from '../../src/contracts/budget.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { TRANSFER_VALIDATION_CASE as D1 } from '../../probes/transfer/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO as D2 } from '../../probes/transfer/validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE as D3 } from '../../probes/transfer/validation-case-three-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FOUR as D4 } from '../../probes/transfer/validation-case-four-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from '../../probes/transfer/validation-case-five-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from '../../probes/transfer/validation-case-six-declaration.ts';

/** Pure fee contract fixture; not a valid full snapshot or actual financial evidence. */
export function caseSevenFeeData(finalCost = 200_000) {
  const declarations = [D1, D2, D3, D4, D5, D6], entries: any[] = [], requests: any[] = [];
  const costs = { planning: 76_320, design: 601_462, art: 166_678, coding: 677_647, repair: 0 };
  const windows = declarations.map(declaration => ({ caseId: declaration.caseId, windowId: `SOURCE-${declaration.caseId}`,
    quote: { declaration }, stopReason: { code: 'manual' } }));
  function row(index: number, role: keyof typeof costs, amount: number, id: string) {
    const window = windows[index];
    entries.push({ requestId: id, taskId: declarations[index].grants[role].taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only',
      status: 'settled', unknown: false, reservedMicroCny: 0, settledMicroCny: amount,
      evidence: [{ artifactId: id, version: 'SOURCE-verified-cost', location: 'SOURCE-only-financial-evidence.json' }] });
    requests.push({ requestId: id, admittedAt: '2026-10-05T00:00:00.000Z', validation: { caseId: window.caseId, windowId: window.windowId, purpose: 'author' } });
  }
  for (const role of VALIDATION_ROLES) if (costs[role]) row(4, role, costs[role], `SOURCE-old-${role}`);
  for (let index = 0; index < 12; index++) row(5, 'coding', index === 11 ? 135_531 - 11_000 : 1_000, `SOURCE-C6-${index}`);
  row(5, 'coding', finalCost, 'SOURCE-C6-final');
  const allocations = [{ taskId: 'COS-16', amountMicroCny: 10_000_000 }, ...declarations.flatMap(d => Object.values(d.grants))];
  const allocationClosures = declarations.flatMap(d => VALIDATION_ROLES.map(role => ({ taskId: d.grants[role].taskId,
    releasedMicroCny: d.grants[role].amountMicroCny - entries.filter(e => e.taskId === d.grants[role].taskId).reduce((n, e) => n + e.settledMicroCny, 0) })));
  return { ledger: { contractVersion: '4.0.0', allocations, entries, allocationClosures,
    allocationDelegations: declarations.map(d => ({ caseId: d.caseId, taskIds: VALIDATION_ROLES.map(role => d.grants[role].taskId) })) },
    requests, validation: { cases: [...Array.from({ length: 8 }, (_, i) => ({ caseId: `cos20-native-validation-${i + 1}` })), ...windows] },
    expected: { ...COS16_GROUP_GRANTS, planning: 323_680, design: 598_538, art: 2_633_322, coding: 2_122_353 - 135_531 - finalCost } } as unknown as RunSnapshot & { expected: typeof COS16_GROUP_GRANTS };
}
