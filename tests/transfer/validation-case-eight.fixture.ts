import { caseSevenFeeData, transferCaseSevenFixture } from './validation-case-seven.fixture.ts';
import { deriveTransferValidationCaseSevenDeclaration } from '../../probes/transfer/validation-case-seven-declaration.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';
import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { join, resolve, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import type { TestContext } from 'node:test';
import type { TaskContract } from '../../src/contracts/types.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { createFixedTransferValidationCaseEightEntry } from '../../probes/transfer/validation-case-eight-entry.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { runChild } from '../../probes/e2e/host.ts';

/** Pure SOURCE-only cost rows, not an authenticated snapshot or financial evidence. */
export function caseEightFeeData(finalC6Cost = 207_689, c7Cost = 58_415) {
  const state: any = caseSevenFeeData(finalC6Cost), declaration = deriveTransferValidationCaseSevenDeclaration(state);
  const windowId = 'SOURCE-C7-window';
  state.validation.cases.push({ caseId: declaration.caseId, windowId, quote: { declaration }, stopReason: { code: 'insufficient_evidence' } });
  state.ledger.allocationDelegations.push({ caseId: declaration.caseId, taskIds: VALIDATION_ROLES.map(role => declaration.grants[role].taskId) });
  state.ledger.allocations.push(...Object.values(declaration.grants));
  for (let index = 0; index < 18; index++) {
    const requestId = `SOURCE-C7-coding-${index}`, amount = index === 17 ? c7Cost - 17_000 : 1000;
    state.ledger.entries.push({ requestId, taskId: declaration.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only', status: 'settled', unknown: false,
      reservedMicroCny: 0, settledMicroCny: amount, evidence: [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE-only-cost.json' }] });
    state.requests.push({ requestId, admittedAt: '2026-10-13T00:00:00.000Z', validation: { caseId: declaration.caseId, windowId, purpose: 'author' } });
  }
  state.ledger.allocationClosures.push(...VALIDATION_ROLES.map(role => ({ taskId: declaration.grants[role].taskId,
    releasedMicroCny: declaration.grants[role].amountMicroCny - (role === 'coding' ? c7Cost : 0) })));
  state.expected.coding -= c7Cost;
  return structuredClone(state);
}

/** Construct exactly one new authentic SOURCE/TEMP history; no SDK or external accounting. */
export async function transferCaseEightFixture(t: TestContext) {
  const started = Date.now(), f = await transferCaseSevenFixture({ after: () => {}, diagnostic: t.diagnostic.bind(t) } as any, 207_689);
  const D7 = deriveTransferValidationCaseSevenDeclaration(f.baseline);
  const result = await f.entry.runTransferValidationCaseSevenWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    const task = taskFixture() as TaskContract, acceptanceIds = input.window.quote.requirements.acceptanceIds;
    Object.assign(task, { taskId: D7.grants.coding.taskId, runId: input.window.quote.basis.runId, kind: 'evaluation', specVersion: '1.0', authorId: 'SOURCE-C7-coding',
      acceptanceIds, dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    task.acceptance = acceptanceIds.map(acceptanceId => ({ ...structuredClone(task.acceptance[0]), acceptanceId })); task.context.contextId = 'SOURCE-C7-coding-context';
    task.budget = { ledgerId: input.window.quote.basis.ledgerId, allocationMicroCny: D7.grants.coding.amountMicroCny, originalDeadlineAt: f.baseline.run.originalDeadlineAt };
    await input.controller.registerTasks([task]);
    for (let i = 0; i < 18; i++) {
      const requestId = `SOURCE-C7-author-${i}`, amount = i === 17 ? 41_415 : 1_000;
      await input.controller.reserve({ requestId, taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01',
        estimatedMaxCostMicroCny: Math.max(16_000, amount), validation: { caseId: D7.caseId, windowId: input.window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
      await input.controller.admit(requestId); await input.controller.settle(requestId, amount, [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE synthetic; no provider' }]);
    }
    return { outcome: 'failed', gaps: ['SOURCE C7 accounting history only; no generated game or SDK.'] };
  } } });
  assert.equal(result.outcome, 'failed');
  const identityReader = fixedTransferValidationInput(D7).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader }, quote = await prepareValidationAllocationClosure({ ...context, caseIds: [D7.caseId] });
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'SOURCE-C7-closure', actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
    source: { artifactId: 'SOURCE-C7-closure', version: 'v1', location: 'SOURCE-C7-closure.json' }, sourceRefs: [{ artifactId: 'SOURCE-C7-cost', version: 'SOURCE-only', location: 'SOURCE synthetic; no provider' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...decision, source: undefined, quote }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote, decision });
  await writeFile(join(f.ledgerRoot, 'cos20-transfer-validation-8-reuse.json'), await readFile(join(f.ledgerRoot, 'cos20-transfer-validation-7-reuse.json')));
  const head = await f.updateMapping(mapping => {
    for (const [taskId, reviewStatus] of Object.entries({ 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY' })) {
      let item = mapping.tasks.find((item: any) => item.taskId === taskId); if (!item) { item = { taskId }; mapping.tasks.push(item); }
      Object.assign(item, { reviewedCommit: f.head, mergeCommit: f.head, reviewStatus, integrationStatus: 'source-integrated' });
    }
  });
  await f.git('update-ref', 'refs/remotes/origin/main', head);
  const bytes = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  await writeFile(join(f.repository, '.cosmos/SOURCE-C8-fixture.json'), JSON.stringify({ formatVersion: 'SOURCE-C8-before15/1', head, pins: f.pins, snapshotSha256: validationHash(bytes), setupMs: Date.now() - started }), 'utf8');
  t.diagnostic(`SOURCE/TEMP C8 history ${f.repository}; setup ${Date.now() - started}ms, no provider.`);
  return loadTransferCaseEightFixture(f.repository);
}
export async function loadTransferCaseEightFixture(path: string) {
  const repository = await realpath(resolve(path));
  assert.ok(repository.startsWith(resolve(tmpdir()) + sep) && /^cosmos-transfer-entry-[a-z0-9]+$/i.test(basename(repository)), 'Only an owned SOURCE/TEMP fixture is accepted.');
  const marker = JSON.parse(await readFile(join(repository, '.cosmos/SOURCE-C8-fixture.json'), 'utf8')), ledgerRoot = join(repository, '.cosmos/validation-shared');
  assert.equal(marker.formatVersion, 'SOURCE-C8-before15/1');
  const bytes = await readFile(join(ledgerRoot, 'snapshot.json')); assert.equal(validationHash(bytes), marker.snapshotSha256);
  const baseline = JSON.parse(bytes.toString('utf8')); validateSnapshot(baseline);
  assert.equal(baseline.validation!.cases.length, 15); assert.equal(baseline.ledger.allocationClosures!.length, 75); assert.equal(baseline.allocationClosureDecisions!.length, 13);
  const git = async (...args: string[]) => { const result = await runChild('git', ['-c', 'user.name=SOURCE Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '--no-optional-locks', ...args], { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 }); assert.equal(result.code, 0); return result.stdout.trim(); };
  const manifest = JSON.parse(await readFile(join(ledgerRoot, 'cos20-transfer-validation-8-reuse.json'), 'utf8'));
  assert.equal(await git('rev-parse', 'HEAD'), marker.head);
  return { repository, ledgerRoot, baseline, head: marker.head as string, pins: marker.pins, git, manifest, entry: createFixedTransferValidationCaseEightEntry(marker.pins),
    root: join(repository, '.cosmos/e2e/cos20-transfer-validation-8'), args: ['--validation-case', marker.head, 'SOURCE C8 fixed fixture; no provider/human claim'] };
}
