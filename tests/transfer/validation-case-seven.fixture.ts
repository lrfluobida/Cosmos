import { COS16_GROUP_GRANTS } from '../../src/contracts/budget.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { TRANSFER_VALIDATION_CASE as D1 } from '../../probes/transfer/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO as D2 } from '../../probes/transfer/validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE as D3 } from '../../probes/transfer/validation-case-three-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FOUR as D4 } from '../../probes/transfer/validation-case-four-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from '../../probes/transfer/validation-case-five-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from '../../probes/transfer/validation-case-six-declaration.ts';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { join, resolve, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { runChild } from '../../probes/e2e/host.ts';
import { transferCaseSixFixture } from './validation-case-six.fixture.ts';
import { createFixedTransferValidationCaseSixEntry } from '../../probes/transfer/validation-case-six-entry.ts';
import { createFixedTransferValidationCaseSevenEntry } from '../../probes/transfer/validation-case-seven-entry.ts';
import { RunController } from '../../src/runtime/run.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';

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

/** One actual synthetic history/receipt lineage, reused by all new combination boundaries. */
export async function transferCaseSevenFixture(t: TestContext, finalCost = 200_000) {
  const f = await transferCaseSixFixture(t, undefined, true), first = f.baseline.validation.cases[8], source = f.baseline.validation.cases[12];
  const pins = { reviewedPlatformSha: source.quote.identity.reviewedPlatformSha, windowId: source.windowId,
    parentAllocation: first.quote.budgetGroup.parentAllocation, authorizationDecisionId: first.operatorDecision.decisionId };
  const six = createFixedTransferValidationCaseSixEntry(pins), seven = createFixedTransferValidationCaseSevenEntry(pins);
  const result: any = await six.runTransferValidationCaseSixWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    const task = taskFixture() as TaskContract, acceptanceIds = input.window.quote.requirements.acceptanceIds;
    Object.assign(task, { taskId: D6.grants.coding.taskId, runId: input.window.quote.basis.runId, kind: 'evaluation', specVersion: '1.0', authorId: 'SOURCE-C6-coding',
      acceptanceIds, dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    task.acceptance = acceptanceIds.map(acceptanceId => ({ ...structuredClone(task.acceptance[0]), acceptanceId }));
    task.context.contextId = 'SOURCE-C6-coding-context'; task.budget = { ledgerId: input.window.quote.basis.ledgerId, allocationMicroCny: D6.grants.coding.amountMicroCny, originalDeadlineAt: f.baseline.run.originalDeadlineAt };
    await input.controller.registerTasks([task]);
    for (let i = 0; i < 13; i++) {
      const requestId = `SOURCE-C6-coding-${i}`, amount = i === 11 ? 135_531 - 11_000 : 1_000;
      await input.controller.reserve({ requestId, taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01',
        estimatedMaxCostMicroCny: i === 12 ? 974_882 : Math.max(16_000, amount), validation: { caseId: D6.caseId, windowId: input.window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
      await input.controller.admit(requestId);
      if (i === 12) await input.controller.markUnknown(requestId, [{ artifactId: 'SOURCE-C6-unknown-response', version: 'v1', location: 'SOURCE-C6-unknown-response.json' }]);
      else await input.controller.settle(requestId, amount, [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE synthetic cost evidence' }]);
    }
    return { outcome: 'failed', gaps: ['SOURCE C6 stopped with unresolved final request; zero SDK calls.'] };
  } } });
  assert.equal(result.outcome, 'failed');
  const snapshot = join(f.ledgerRoot, 'snapshot.json'), unknownBytes = await readFile(snapshot);
  await assert.rejects(seven.preflightTransferValidationCaseSevenRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /unknown|reconciliation/);
  assert.deepEqual(await readFile(snapshot), unknownBytes);
  const identityReader = fixedTransferValidationInput(D6).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const controller = await RunController.openValidationCase({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader,
    caseId: D6.caseId, windowId: result.windowId, accountingOnly: true });
  const financial = { formatVersion: 'SOURCE-fixture-cost/1', requestId: 'SOURCE-C6-coding-12', actualCostMicroCny: finalCost, evidence: 'Synthetic verified fixture; no external provider.' };
  await writeFile(join(f.ledgerRoot, 'SOURCE-C6-reconciliation.json'), JSON.stringify(financial), 'utf8');
  try { await controller.settle(financial.requestId, finalCost, [{ artifactId: 'SOURCE-C6-reconciled-cost', version: `SOURCE-${finalCost}`, location: 'SOURCE-C6-reconciliation.json' }]); }
  finally { await controller.close(); }
  await assert.rejects(seven.preflightTransferValidationCaseSevenRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /closed|audit|allocation/);
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader }, quote = await prepareValidationAllocationClosure({ ...context, caseIds: [D6.caseId] });
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'SOURCE-C6-closure', actorId: 'SOURCE-coordinator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'SOURCE-C6-closure', version: 'v1', location: 'SOURCE-C6-closure.json' }, sourceRefs: [{ artifactId: 'SOURCE-C6-reconciled-cost', version: `SOURCE-${finalCost}`, location: 'SOURCE-C6-reconciliation.json' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...decision, source: undefined, quote }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote, decision });
  await writeFile(join(f.ledgerRoot, 'cos20-transfer-validation-7-reuse.json'), await readFile(join(f.ledgerRoot, 'cos20-transfer-validation-6-reuse.json')));
  const head = await f.updateMapping(mapping => {
    for (const [taskId, reviewStatus] of Object.entries({ 'COS-57': 'TRANSFER_CASE_SIX_SOURCE_READY', 'COS-59': 'CODING_REQUEST_TIMEOUT_SOURCE_READY' })) Object.assign(mapping.tasks.find((item: any) => item.taskId === taskId), { reviewedCommit: f.head, mergeCommit: f.head, reviewStatus, integrationStatus: 'source-integrated' });
  });
  await f.git('update-ref', 'refs/remotes/origin/main', head);
  const baseline = JSON.parse((await readFile(snapshot)).toString('utf8'));
  return { ...f, head, pins, baseline, entry: seven, root: join(f.repository, '.cosmos/e2e/cos20-transfer-validation-7'), args: ['--validation-case', head, 'SOURCE synthetic authorized C7; no provider/human claim'] };
}

/** Test-only replay of an exact archived SOURCE/TEMP seed; public runners never read this selector. */
export async function loadTransferCaseSevenCheckpoint(path: string) {
  const repository = await realpath(resolve(path));
  assert.ok(repository.startsWith(resolve(tmpdir()) + sep) && /^cosmos-transfer-entry-[a-z0-9]+$/i.test(basename(repository)), 'Checkpoint must be the exact owned SOURCE/TEMP fixture.');
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), bytes = await readFile(join(ledgerRoot, 'snapshot.json'));
  const restore = JSON.parse(await readFile(join(repository, '.cosmos/SOURCE-stale-C7-setup/restore-manifest.json'), 'utf8'));
  assert.equal(restore.status, 'setup-only-not-final-proof'); assert.equal(validationHash(bytes), restore.checkpointSha256);
  assert.equal(validationHash(bytes), restore.quote.basis.snapshotSha256);
  const baseline = JSON.parse(bytes.toString('utf8')); validateSnapshot(baseline);
  assert.equal(baseline.validation!.cases.length, 14); assert.equal(baseline.ledger.allocationClosures!.length, 70); assert.equal(baseline.allocationClosureDecisions!.length, 12);
  const git = async (...args: string[]) => { const result = await runChild('git', ['-c', 'user.name=SOURCE Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '--no-optional-locks', ...args], { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 }); assert.equal(result.code, 0); return result.stdout.trim(); };
  const head = await git('rev-parse', 'HEAD'), mapping = JSON.parse(await readFile(join(repository, 'docs/specs/github-issues.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(ledgerRoot, 'cos20-transfer-validation-7-reuse.json'), 'utf8'));
  assert.equal(manifest.originalRoot, join(repository, '.cosmos/e2e', D5.caseId));
  const first = baseline.validation!.cases[8], source = baseline.validation!.cases[12], pins = { reviewedPlatformSha: source.quote.identity.reviewedPlatformSha,
    windowId: source.windowId, parentAllocation: first.quote.budgetGroup!.parentAllocation, authorizationDecisionId: first.operatorDecision.decisionId };
  return { repository, ledgerRoot, baseline, head, pins, mapping, git, manifest, entry: createFixedTransferValidationCaseSevenEntry(pins),
    passed: { root: manifest.originalRoot, result: manifest.stages.map((stage: any) => stage.task) },
    root: join(repository, '.cosmos/e2e/cos20-transfer-validation-7'), args: ['--validation-case', head, 'SOURCE exact checkpoint replay; no provider/human claim'] };
}
