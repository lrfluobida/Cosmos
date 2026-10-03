import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type test from 'node:test';
import type { TaskContract } from '../../src/contracts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { createValidationIdentityReader } from '../../probes/e2e/validation-identity.ts';
import { runChild } from '../../probes/e2e/host.ts';

/** Synthetic historical declarations through the actual core; no provider, human confirmation or real case files. */
async function seedPriorCase(repository: string, root: string, head: string, number: 1 | 2 | 3 | 4 | 5 | 6 | 7, options: { stop: boolean; exposure?: 'reserved' | 'unknown' }) {
  const caseId = `cos20-native-validation-${number}`, declaration: ValidationDeclaration = { ...structuredClone(VALIDATION_CASE), formatVersion: number >= 3 ? 'validation-declaration-2' : 'validation-declaration-1', caseId,
    limits: { ...VALIDATION_CASE.limits, maxRequests: number >= 3 ? 80 : 40 },
    grants: Object.fromEntries(Object.entries(VALIDATION_CASE.grants).map(([role, grant]) => [role, { ...grant, taskId: `${caseId}-${role}` }])) as ValidationDeclaration['grants'] };
  const label = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'][number - 1];
  let clock = Date.parse(['2026-10-02T11:58:02.694Z', '2026-10-02T15:39:49.986Z', '2026-10-03T00:00:00.000Z', '2026-10-03T08:06:12.677Z', '2026-10-03T09:28:05.370Z', '2026-10-03T12:00:00.000Z', '2026-10-03T15:47:24.285Z'][number - 1]);
  const identity = await createValidationIdentityReader({ repository, reviewedPlatformSha: head })(new AbortController().signal);
  const context = { root, repositoryRoot: repository, identityReader: async () => structuredClone(identity), now: () => clock };
  const quote = await prepareValidationCase({ ...context, declaration }), decision = { kind: 'operator_validation' as const, decisionId: `offline-case-${label}-operator`, actorId: 'offline-coordinator',
    decidedAt: new Date(clock).toISOString(), source: { artifactId: 'operator-validation-decision', version: `offline-case-${label}`, location: `offline-case-${label}-operator.json` },
    sourceRefs: [{ artifactId: 'offline-fixture-source', version: head, location: 'OFFLINE synthetic operator source; generatedByCosmos:false' }] };
  await writeFile(join(root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId: window.caseId, windowId: window.windowId });
  try {
    if (number === 7) {
      const task: TaskContract = { contractVersion: '1.0.0', taskId: declaration.grants.coding.taskId, kind: 'evaluation', runId: 'validation-2026-10-01', specVersion: '1.0',
        authorId: 'offline-synthetic-coding', acceptanceIds: [...quote.requirements.acceptanceIds], objective: 'OFFLINE accounting fixture; generatedByCosmos:false', dependsOn: [], inputs: [],
        context: { contextId: 'offline-synthetic-coding-context', rules: ['Synthetic accounting only; no provider or playable game'], interfaces: [], knownFailures: [], tools: [] },
        ownership: { writePaths: ['offline'], readOnlyPaths: [] }, outputs: [{ type: 'offline', schema: 'offline/1', destination: 'offline/sample.json' }],
        acceptance: quote.requirements.acceptanceIds.map(acceptanceId => ({ acceptanceId, steps: ['Synthetic accounting only'], expected: 'No generated game acceptance', evidenceDestinations: ['offline/sample.json'] })),
        budget: { ledgerId: 'cosmos-validation', allocationMicroCny: declaration.grants.coding.amountMicroCny, originalDeadlineAt: '2026-10-01T18:16:16.857Z' },
        state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: ['Synthetic accounting only'], uncertainty: [], resumeFrom: null },
        review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } };
      await controller.registerTasks([task]);
    }
    const request = (requestId: string, estimatedMaxCostMicroCny = 8) => ({ requestId, taskId: declaration.grants[number === 7 ? 'coding' : 'planning'].taskId, provider: 'deepseek',
      pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny,
      validation: { caseId, windowId: window.windowId, purpose: number === 7 ? 'author' as const : 'planning' as const, modelId: 'deepseek-flash' as const, maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
    if (number > 1) {
      // One accounting sample per case; request exhaustion was already verified separately.
      const requestId = `offline-case-${label}-sample`, amount = number === 2 ? 857_751 : number === 3 ? 68_875 : number === 4 ? 11_432 : number === 5 ? 901_041 : number === 6 ? 1_280_416 : 1_223_114;
      await controller.reserve(request(requestId, amount)); await controller.admit(requestId);
      await controller.settle(requestId, amount, [{ artifactId: 'offline-synthetic-accounting', version: 'v1', location: 'offline.json' }]);
    }
    if (options.exposure) {
      const requestId = `offline-case-${label}-${options.exposure}`;
      await controller.reserve(request(requestId));
      // Synthetic admission intent only; no provider is invoked. Stop retains its unresolved reservation.
      await controller.admit(requestId);
      if (options.exposure === 'unknown') await controller.markUnknown(requestId, [{ artifactId: 'offline-synthetic-accounting', version: 'v1', location: 'offline.json' }]);
    }
    clock = number === 7 ? Date.parse('2026-10-03T15:56:47.389Z') : clock + 1000;
    if (options.stop) await controller.stop(`OFFLINE synthetic case ${number} failure; zero API requests.`);
  } finally { await controller.close(); }
  await mkdir(join(repository, '.cosmos/e2e', caseId, 'registry'), { recursive: true });
  return { ...context, declaration, quote, decision, window };
}

/** Offline temporary repository and historical ledger facts, never a real authorization or generated game. */
export async function validationRunFixture(t: test.TestContext, options: { caseOne?: 'absent' | 'unstopped'; caseTwo?: 'absent' | 'unstopped'; caseThree?: 'absent' | 'unstopped'; caseFour?: 'absent' | 'unstopped'; caseFive?: 'absent' | 'unstopped'; caseSix?: 'absent' | 'unstopped'; caseSeven?: 'absent' | 'unstopped'; exposure?: 'reserved' | 'unknown'; closure?: 'none' | 'first-two' | 'first-three' | 'first-four' | 'first-five' | 'first-six'; cos22RunFailed?: boolean; historicalSourceUnmerged?: boolean } = {}) {
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-validation-entry-')), original = fileURLToPath(new URL('../../', import.meta.url));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const git = async (...args: string[]) => {
    const result = await runChild('git', ['-c', 'user.name=Offline Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${join(repository, '.git/no-hooks')}`, ...args],
      { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 });
    assert.equal(result.code, 0, 'Offline Git operation failed'); return result.stdout.trim();
  };
  await git('init', '--initial-branch=main'); await git('config', 'core.autocrlf', 'false');
  for (const file of [VALIDATION_CASE.inputs.requirements, ...VALIDATION_CASE.inputs.template.files, ...['src/media/vector.ts', 'src/media/audio.ts'].map(path => ({ path }))]) {
    await mkdir(dirname(join(repository, file.path)), { recursive: true }); await writeFile(join(repository, file.path), await readFile(join(original, file.path)));
  }
  await writeFile(join(repository, '.gitignore'), '.cosmos/\n', 'utf8'); await git('add', '.'); await git('commit', '-m', 'Offline frozen source');
  const ancestor = await git('rev-parse', 'HEAD'), dependencies = ['COS-06', 'COS-07', 'COS-08', 'COS-09', 'COS-11', 'COS-12', 'COS-13', 'COS-18', 'COS-19', 'COS-20', 'COS-21', 'COS-22', 'COS-23', 'COS-24', 'COS-25', 'COS-26', 'COS-27', 'COS-28', 'COS-29', 'COS-30', 'COS-31', 'COS-32'];
  const markers: Record<string, string> = { 'COS-20': 'CASE_TWO_SOURCE_READY', 'COS-21': 'WINDOWS_PUBLICATION_SOURCE_READY', 'COS-22': 'VERSIONED_CASE_THREE_SOURCE_READY', 'COS-23': 'AUTHOR_PROTOCOL_SOURCE_READY', 'COS-24': 'VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY', 'COS-25': 'CASE_FOUR_SOURCE_READY', 'COS-26': 'PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY', 'COS-27': 'CASE_FIVE_SOURCE_READY', 'COS-28': 'HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY', 'COS-29': 'CASE_SIX_SOURCE_READY', 'COS-30': 'HOST_EVIDENCED_HANDOFF_SOURCE_READY', 'COS-31': 'CASE_SEVEN_SOURCE_READY', 'COS-32': 'BROWSER_DEFECT_CLASSIFICATION_SOURCE_READY' };
  const mapping = { tasks: dependencies.map(taskId => ({ taskId, state: 'open', reviewStatus: markers[taskId] ?? 'SOURCE_READY',
    integrationStatus: taskId === 'COS-22' && options.cos22RunFailed ? 'actual-validation-failed-author-handoff' : 'offline-verified-awaiting-live', reviewedCommit: ancestor, mergeCommit: ancestor })) };
  await mkdir(join(repository, 'docs/specs'), { recursive: true }); await writeFile(join(repository, 'docs/specs/github-issues.json'), JSON.stringify(mapping), 'utf8');
  await git('add', '.'); await git('commit', '-m', 'Offline source approvals'); const head = await git('rev-parse', 'HEAD');
  let historicalHead = head;
  if (options.historicalSourceUnmerged) {
    await git('commit', '--allow-empty', '-m', 'Offline unmerged historical quote source');
    historicalHead = await git('rev-parse', 'HEAD');
  }
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), caseRoot = join(repository, '.cosmos/e2e', VALIDATION_CASE.caseId);
  const old = await RunController.create({ root: ledgerRoot, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', specVersion: '1.0', kind: 'evaluation', scope: 'validation',
    now: () => Date.parse('2026-10-01T06:16:16.857Z'), allocations: [{ taskId: 'prior', amountMicroCny: 84_596_040 }] });
  await old.importSettled({ requestId: 'prior-deepseek-direct-probes', taskId: 'prior', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 1_116_402,
    evidence: [{ artifactId: 'offline-prior', version: 'v1', location: 'offline-source.json' }] });
  const originalSnapshot = await old.read(); await old.close();
  const caseOne = options.caseOne === 'absent' ? null : await seedPriorCase(repository, ledgerRoot, historicalHead, 1, { stop: options.caseOne !== 'unstopped' });
  const caseTwo = options.caseOne === 'unstopped' || options.caseTwo === 'absent' ? null : await seedPriorCase(repository, ledgerRoot, historicalHead, 2, { stop: options.caseTwo !== 'unstopped' });
  const caseThree = options.caseOne === 'absent' && options.caseTwo === 'absent' || options.caseOne === 'unstopped' || options.caseTwo === 'unstopped' || options.caseThree === 'absent'
    ? null : await seedPriorCase(repository, ledgerRoot, historicalHead, 3, { stop: options.caseThree !== 'unstopped' });
  if (options.historicalSourceUnmerged) {
    await git('switch', '--detach', head); await git('branch', '-m', 'main', 'offline-used-historical-main'); await git('switch', '-c', 'main', head);
  }
  async function closeCases(caseIds: string[], label: string) {
    const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = await import('../../src/runtime/validation-allocations.ts');
    const identity = await createValidationIdentityReader({ repository, reviewedPlatformSha: head })(new AbortController().signal);
    const identityReader = async () => structuredClone(identity), context = { root: ledgerRoot, repositoryRoot: repository, identityReader };
    const quote = await prepareValidationAllocationClosure({ ...context, caseIds });
    const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId: `offline-allocation-closure-${label}`, actorId: 'offline-coordinator', decidedAt: new Date().toISOString(),
      source: { artifactId: 'offline-closure-source', version: 'v1', location: `offline-closure-source-${label}.json` }, sourceRefs: [{ artifactId: 'offline-standing-validation', version: head, location: 'OFFLINE fixture only; generatedByCosmos:false' }] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
      decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
    await applyValidationAllocationClosure({ ...context, quote, decision });
  }
  if (caseTwo && caseThree && options.caseThree !== 'unstopped' && options.closure !== 'none') {
    await closeCases([...(caseOne ? [caseOne] : []), caseTwo, ...(options.closure === 'first-two' ? [] : [caseThree])].map(item => item.window.caseId), 'first-three');
  }
  const caseFour = !caseThree || options.caseThree === 'unstopped' || ['none', 'first-two'].includes(options.closure ?? '') || options.caseFour === 'absent'
    ? null : await seedPriorCase(repository, ledgerRoot, head, 4, { stop: options.caseFour !== 'unstopped' });
  if (caseFour && options.caseFour !== 'unstopped' && options.closure !== 'first-three') await closeCases([caseFour.window.caseId], 'four');
  const caseFive = !caseFour || options.caseFour === 'unstopped' || options.closure === 'first-three' || options.caseFive === 'absent'
    ? null : await seedPriorCase(repository, ledgerRoot, head, 5, { stop: options.caseFive !== 'unstopped' });
  if (caseFive && options.caseFive !== 'unstopped' && options.closure !== 'first-four') await closeCases([caseFive.window.caseId], 'five');
  const caseSix = !caseFive || options.caseFive === 'unstopped' || options.closure === 'first-four' || options.caseSix === 'absent'
    ? null : await seedPriorCase(repository, ledgerRoot, head, 6, { stop: options.caseSix !== 'unstopped' });
  if (caseSix && options.caseSix !== 'unstopped' && options.closure !== 'first-five') await closeCases([caseSix.window.caseId], 'six');
  const caseSeven = !caseSix || options.caseSix === 'unstopped' || options.closure === 'first-five' || options.caseSeven === 'absent'
    ? null : await seedPriorCase(repository, ledgerRoot, head, 7, { stop: options.caseSeven !== 'unstopped', exposure: options.exposure });
  if (caseSeven && options.caseSeven !== 'unstopped' && !options.exposure && options.closure !== 'first-six') await closeCases([caseSeven.window.caseId], 'seven');
  return { repository, ledgerRoot, caseRoot, head, git, mapping, originalSnapshot, caseOne, caseTwo, caseThree, caseFour, caseFive, caseSix, caseSeven,
    args: ['--validation-case', head, 'OFFLINE fixture coordinator standing authorization source; generatedByCosmos:false'] };
}
