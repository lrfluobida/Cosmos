import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, stat, lstat, realpath, mkdir, rename, unlink, utimes, readdir } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { runChild } from '../../probes/e2e/host.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';
import type { TestContext } from 'node:test';

import { deriveTransferValidationCaseFourteenDeclaration, transferCaseFourteenHistory } from '../../probes/transfer/validation-case-fourteen-declaration.ts';
import { caseThirteenFeeData } from './validation-case-thirteen.fixture.ts';
import { deriveTransferValidationCaseThirteenDeclaration } from '../../probes/transfer/validation-case-thirteen-declaration.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';

/** Pure SOURCE arithmetic rows; authenticated history is appended through the original APIs. */
export function caseFourteenFeeData(c13Cost = 1_641_136) {
  const state: any = caseThirteenFeeData(), declaration = deriveTransferValidationCaseThirteenDeclaration(state), windowId = 'SOURCE-C13-cost-window';
  state.validation.cases.push({ caseId: declaration.caseId, windowId, quote: { declaration }, stopReason: { code: 'manual' }, repair: null });
  state.ledger.allocationDelegations.push({ caseId: declaration.caseId, taskIds: VALIDATION_ROLES.map(role => declaration.grants[role].taskId) });
  state.ledger.allocations.push(...Object.values(declaration.grants));
  for (let i = 0; i < 47; i++) {
    const requestId = `SOURCE-C13-cost-${i}`, amount = i === 46 ? c13Cost - 46_000 : 1000;
    state.ledger.entries.push({ requestId, taskId: declaration.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only', status: 'settled', unknown: false,
      reservedMicroCny: 0, settledMicroCny: amount, evidence: [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE-only-C13-cost.json' }] });
    state.requests.push({ requestId, admittedAt: '2026-10-14T00:00:00.000Z', validation: { caseId: declaration.caseId, windowId, purpose: 'author' } });
  }
  state.ledger.allocationClosures.push(...VALIDATION_ROLES.map(role => ({ taskId: declaration.grants[role].taskId,
    releasedMicroCny: declaration.grants[role].amountMicroCny - (role === 'coding' ? c13Cost : 0) })));
  return structuredClone(state);
}

/** Fixed C14 SOURCE view only; append predecessor accounting without rebuilding historical roles. */
export async function withTransferCaseFourteenFixture(t: TestContext, operation: (f: {
  repository: string; ledgerRoot: string; root: string; head: string; pins: any; baseline: any; manifest: any;
  beforeFunding: any; archive: string; fund(): Promise<any>; args: string[]; git(...args: string[]): Promise<string>; costs(amount: number): Promise<any>; track(input: ValidationHostInput): void;
}) => Promise<void>) {
  const currentCase = 14, beforeCases = 20, beforeAudits = 18, requestCount = 47;
  const repository = await realpath(resolve(join(tmpdir(), 'cosmos-transfer-entry-T81i3U')));
  assert.ok(repository.startsWith(resolve(tmpdir()) + sep) && /^cosmos-transfer-entry-[a-z0-9]+$/i.test(basename(repository)));
  const saved = join(repository, '.cosmos/SOURCE-C13-proof-6daadf13-4334-44c6-b00b-006f3116c153/history-1.json');
  const beforeBytes = await readFile(saved), before = JSON.parse(beforeBytes.toString('utf8')); validateSnapshot(before);
  assert.equal(before.validation!.cases.length, beforeCases); assert.equal(before.ledger.allocationDelegations!.length, beforeCases - 8);
  assert.equal(before.ledger.allocationClosures!.length, beforeCases * 5); assert.equal(before.allocationClosureDecisions!.length, beforeAudits);
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), snapshot = join(ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), originalInfo = await stat(snapshot);
  validateSnapshot(JSON.parse(original.toString('utf8')));
  const originalFiles = new Set(await readdir(ledgerRoot));
  const oldRoot = join(repository, '.cosmos/e2e/cos20-transfer-validation-8');
  const historyRoots = Array.from({ length: currentCase - 9 }, (_, index) => join(repository, `.cosmos/e2e/cos20-transfer-validation-${index + 9}`));
  const root = join(repository, `.cosmos/e2e/cos20-transfer-validation-${currentCase}`);
  for (const path of [...historyRoots, root, join(ledgerRoot, `cos20-transfer-validation-${currentCase}.json`)]) await assert.rejects(lstat(path), (error: any) => error.code === 'ENOENT');
  for (const folder of [ledgerRoot, oldRoot]) for (const file of ['.controller.lock', '.controller.lock.recovery', 'registry/.commit.lock', 'registry/.commit.lock.recovery'])
    await assert.rejects(lstat(join(folder, file)), (error: any) => error.code === 'ENOENT');
  const proofFiles = [join(ledgerRoot, 'cos20-transfer-validation-8.json'), join(oldRoot, 'origin.json'), join(oldRoot, 'execution-reused.json'), join(ledgerRoot, 'cos20-transfer-validation-8-reuse.json')];
  const protectedFiles = await Promise.all(proofFiles.map(async path => ({ path, bytes: await readFile(path), info: await stat(path) })));
  const marker = JSON.parse(await readFile(join(repository, '.cosmos/SOURCE-C8-fixture.json'), 'utf8'));
  const manifest = JSON.parse(protectedFiles[3].bytes.toString('utf8')), previous = deriveTransferValidationCaseThirteenDeclaration(before), id = randomUUID();
  const archive = join(repository, `.cosmos/SOURCE-C${currentCase}-proof-${id}`); await mkdir(archive); await writeFile(join(archive, 'original-snapshot.json'), original);
  const git = async (...args: string[]) => { const result = await runChild('git', ['-c', 'user.name=SOURCE Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '--no-optional-locks', ...args], { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 }); assert.equal(result.code, 0); return result.stdout.trim(); };
  const mappingPath = join(repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), mappingInfo = await stat(mappingPath), mapping = JSON.parse(mappingBytes.toString('utf8')), oldHead = await git('rev-parse', 'HEAD');
  const owners = new Set<ValidationHostInput>(); let controller: RunController | undefined, generation = 0;
  const costs = async (amount: number) => {
    if (process.env.COS91_SOURCE_REUSE) {
      const reuse = await realpath(process.env.COS91_SOURCE_REUSE);
      assert.ok(reuse.startsWith(join(repository, '.cosmos', 'SOURCE-C14-proof-')));
      assert.ok(amount === 1_641_136 || amount === 1_100_000);
      const bytes = await readFile(join(reuse, `history-${amount === 1_641_136 ? 1 : 2}.json`)), state = JSON.parse(bytes.toString('utf8')); validateSnapshot(state);
      assert.deepEqual(state.validation!.cases.slice(0, beforeCases), before.validation!.cases);
      const costs = state.ledger.entries.filter((entry: any) => entry.taskId === previous.grants.coding.taskId);
      assert.equal(costs.length, 47); assert.equal(costs.reduce((sum: number, row: any) => sum + row.settledMicroCny, 0), amount);
      assert.equal(state.ledger.contractVersion, '4.0.0'); assert.equal(state.allocationClosureDecisions!.length, 19);
      for (const source of [state.validation!.cases.at(-1)!.operatorDecision.source, state.allocationClosureDecisions!.at(-1)!.operatorDecision.source]) {
        const bytes = await readFile(join(reuse, 'ledger-new-files', source.location)); await writeFile(join(ledgerRoot, source.location), bytes);
      }
      await writeFile(snapshot, bytes); await writeFile(join(archive, `history-${++generation}.json`), bytes);
      t.diagnostic(`SOURCE C14 reused original-API accounting variant ${generation} from ${reuse}`); return state;
    }
    const leadingCosts = (requestCount - 1) * 1000;
    assert.ok(Number.isSafeInteger(amount) && amount >= leadingCosts); await writeFile(snapshot, beforeBytes);
    const identityReader = fixedTransferValidationInput(previous).createTransferValidationIdentityReader({ repository, reviewedPlatformSha: await git('rev-parse', 'HEAD') });
    const context = { root: ledgerRoot, repositoryRoot: repository, identityReader }, quote = await prepareValidationCase({ ...context, declaration: previous }), key = `SOURCE-C${currentCase}-C${currentCase - 1}-costs-${id}-${++generation}`;
    const decision = { kind: 'operator_validation' as const, decisionId: key, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: key, version: 'SOURCE-only', location: `${key}.json` }, sourceRefs: [{ artifactId: key, version: 'SOURCE-only', location: 'SOURCE accounting fixture; not a game run' }] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...context, quote, decision });
    controller = await RunController.openValidationCase({ ...context, caseId: previous.caseId, windowId: window.windowId });
    try {
      const task = taskFixture() as TaskContract, acceptanceIds = quote.requirements.acceptanceIds;
      Object.assign(task, { taskId: previous.grants.coding.taskId, runId: quote.basis.runId, kind: 'evaluation', specVersion: '1.0', authorId: `${key}-author`, acceptanceIds,
        dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
      task.acceptance = acceptanceIds.map(acceptanceId => ({ ...structuredClone(task.acceptance[0]), acceptanceId })); task.context.contextId = `${key}-context`;
      task.budget = { ledgerId: quote.basis.ledgerId, allocationMicroCny: previous.grants.coding.amountMicroCny, originalDeadlineAt: before.run.originalDeadlineAt };
      await controller.registerTasks([task]);
      for (let i = 0; i < requestCount; i++) {
        const requestId = `${key}-${i}`, actual = i === requestCount - 1 ? amount - leadingCosts : 1000;
        await controller.reserve({ requestId, taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: Math.max(16_000, actual),
          validation: { caseId: previous.caseId, windowId: window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
        await controller.admit(requestId); await controller.settle(requestId, actual, [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE synthetic accounting; no SDK' }]);
      }
      await controller.stop(`SOURCE C${currentCase - 1} accounting-only history; no author, capture or repair executed.`);
    } finally { await controller.close(); controller = undefined; }
    const closure = await prepareValidationAllocationClosure({ ...context, caseIds: [previous.caseId] });
    const close = { kind: 'operator_validation_allocation_closure' as const, decisionId: `${key}-closure`, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: `${key}-closure`, version: 'SOURCE-only', location: `${key}-closure.json` }, sourceRefs: [decision.source] };
    await writeFile(join(ledgerRoot, close.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...close, source: undefined, quote: closure }), 'utf8');
    await applyValidationAllocationClosure({ ...context, quote: closure, decision: close });
    const bytes = await readFile(snapshot), state = JSON.parse(bytes.toString('utf8')); validateSnapshot(state);
    assert.equal(state.validation!.cases.length, beforeCases + 1); assert.equal(state.ledger.allocationClosures!.length, (beforeCases + 1) * 5); assert.equal(state.allocationClosureDecisions!.length, beforeAudits + 1);
    assert.deepEqual(state.validation!.cases.slice(0, beforeCases), before.validation!.cases); assert.deepEqual(state.ledger.entries.slice(0, before.ledger.entries.length), before.ledger.entries);
    await writeFile(join(archive, `history-${generation}.json`), bytes); t.diagnostic(`SOURCE C${currentCase} C${currentCase - 1} accounting variant ${generation} saved`); return state;
  };
  const fund = async () => {
    const before = JSON.parse(await readFile(snapshot, 'utf8')), declaration = deriveTransferValidationCaseFourteenDeclaration(before);
    const identityReader = fixedTransferValidationInput(declaration).createTransferValidationIdentityReader({ repository, reviewedPlatformSha: await git('rev-parse', 'HEAD') });
    const context = { root: ledgerRoot, repositoryRoot: repository, identityReader }, quote = await RunController.prepareValidationGroupSupplement(context), key = `SOURCE-C14-supplement-${id}-${generation}`;
    const decision = { kind: 'operator_validation_group_supplement' as const, decisionId: key, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: key, version: 'SOURCE-only', location: `${key}.json` }, sourceRefs: [{ artifactId: key, version: 'SOURCE-only', location: 'SOURCE internal supplement; no paid run' }] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-group-supplement-decision-1', ...decision, source: undefined, quote }), 'utf8');
    await RunController.applyValidationGroupSupplement({ ...context, quote, decision });
    const state = JSON.parse(await readFile(snapshot, 'utf8')); validateSnapshot(state);
    assert.deepEqual(deriveTransferValidationCaseFourteenDeclaration(state), declaration);
    assert.equal(JSON.stringify(transferCaseFourteenHistory(state)), JSON.stringify(transferCaseFourteenHistory(before)));
    assert.deepEqual(state.ledger.allocations, before.ledger.allocations); assert.deepEqual(state.validation, before.validation);
    await writeFile(join(archive, `funded-${generation}.json`), JSON.stringify(state)); return state;
  };
  try {
    for (const [taskId, reviewStatus] of Object.entries({ 'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY',
      'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY', 'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY', 'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY', 'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY',
      'COS-82': 'TRANSFER_CASE_TEN_SOURCE_READY', 'COS-83': 'AUTHOR_TOOL_SCOPE_SOURCE_READY',
      'COS-84': 'TRANSFER_CASE_ELEVEN_SOURCE_READY', 'COS-85': 'OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY',
      'COS-86': 'TRANSFER_CASE_TWELVE_SOURCE_READY', 'COS-87': 'PARALLEL_GIT_IDENTITY_SOURCE_READY',
      'COS-88': 'TRANSFER_CASE_THIRTEEN_SOURCE_READY', 'COS-89': 'AFFORDABLE_CODING_COMPACTION_SOURCE_READY',
      'COS-90': 'VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY' })) {
      let item = mapping.tasks.find((item: any) => item.taskId === taskId); if (!item) { item = { taskId }; mapping.tasks.push(item); }
      Object.assign(item, { reviewedCommit: oldHead, mergeCommit: oldHead, reviewStatus, integrationStatus: 'source-integrated' });
    }
    await writeFile(mappingPath, JSON.stringify(mapping), 'utf8'); await git('add', 'docs/specs/github-issues.json'); await git('commit', '-m', `SOURCE C${currentCase} prerequisites`);
    const head = await git('rev-parse', 'HEAD'); await git('update-ref', 'refs/remotes/origin/main', head); for (const path of historyRoots) await mkdir(path);
    const manifestPath = join(ledgerRoot, `cos20-transfer-validation-${currentCase}-reuse.json`);
    try { assert.deepEqual(await readFile(manifestPath), protectedFiles[3].bytes); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(manifestPath, protectedFiles[3].bytes); }
    const beforeFunding = await costs(1_641_136), baseline = await fund();
    await operation({ repository, ledgerRoot, root, head, pins: marker.pins, baseline, beforeFunding, archive, fund, manifest, args: ['--validation-case', head, 'SOURCE C14 fixed two-and-a-half yuan envelope; no paid/human claim'], git, costs, track: input => { owners.add(input); } });
  } finally {
    await controller?.close();
    for (const input of owners) { await input.work.cancelAndDrain(`SOURCE C${currentCase} fixture cleanup`); await input.controller.close(); }
    await assert.rejects(lstat(join(ledgerRoot, '.controller.lock')), (error: any) => error.code === 'ENOENT');
    await writeFile(join(archive, 'result-snapshot.json'), await readFile(snapshot));
    await writeFile(snapshot, original); await utimes(snapshot, originalInfo.atimeMs / 1000, originalInfo.mtimeMs / 1000);
    for (const [path, destination] of [[root, `case${currentCase}`], ...historyRoots.map((path, index) => [path, `synthetic-case${index + 9}-history`])]) if (await lstat(path).then(() => true, (error: any) => { if (error.code === 'ENOENT') return false; throw error; })) {
      assert.equal(await realpath(path), path); assert.ok(path.startsWith(join(repository, '.cosmos/e2e') + sep)); await rename(path, join(archive, destination));
    }
    const markerPath = join(ledgerRoot, `cos20-transfer-validation-${currentCase}.json`);
    if (await lstat(markerPath).then(() => true, (error: any) => { if (error.code === 'ENOENT') return false; throw error; })) { await writeFile(join(archive, `case${currentCase}-marker.json`), await readFile(markerPath)); await unlink(markerPath); }
    const extra = (await readdir(ledgerRoot)).filter(name => !originalFiles.has(name)); await mkdir(join(archive, 'ledger-new-files'));
    for (const name of extra) { const path = join(ledgerRoot, name); assert.ok((await lstat(path)).isFile()); await rename(path, join(archive, 'ledger-new-files', name)); }
    await writeFile(mappingPath, mappingBytes); await git('add', 'docs/specs/github-issues.json');
    if (await git('diff', '--cached', '--name-only')) await git('commit', '-m', 'SOURCE restore prior prerequisite bytes');
    await git('update-ref', 'refs/remotes/origin/main', await git('rev-parse', 'HEAD')); await utimes(mappingPath, mappingInfo.atimeMs / 1000, mappingInfo.mtimeMs / 1000);
    for (const file of protectedFiles) { assert.deepEqual(await readFile(file.path), file.bytes); assert.equal((await stat(file.path)).mtimeMs, file.info.mtimeMs); }
    assert.deepEqual(await readFile(snapshot), original); assert.ok(Math.abs((await stat(snapshot)).mtimeMs - originalInfo.mtimeMs) < 1); assert.deepEqual(await readFile(mappingPath), mappingBytes);
    t.diagnostic(`SOURCE C${currentCase} proof ${archive}; original snapshot and prior proof bytes preserved.`);
  }
}
