import { caseNineFeeData } from './validation-case-nine.fixture.ts';
import { deriveTransferValidationCaseNineDeclaration } from '../../probes/transfer/validation-case-nine-declaration.ts';
import { deriveTransferValidationCaseTenDeclaration } from '../../probes/transfer/validation-case-ten-declaration.ts';
import { deriveTransferValidationCaseElevenDeclaration } from '../../probes/transfer/validation-case-eleven-declaration.ts';
import { deriveTransferValidationCaseTwelveDeclaration } from '../../probes/transfer/validation-case-twelve-declaration.ts';
import { VALIDATION_ROLES } from '../../src/runtime/validation-validation.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, stat, lstat, realpath, mkdir, rename, unlink, utimes } from 'node:fs/promises';
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

/** Pure SOURCE arithmetic rows; authenticated history uses the saved SOURCE view below. */
export function caseTenFeeData(c9Cost = 960_162) {
  const state: any = caseNineFeeData(), declaration = deriveTransferValidationCaseNineDeclaration(state), windowId = 'SOURCE-C9-cost-window';
  state.formatVersion = 3; state.revision = 1;
  state.validation.cases.push({ caseId: declaration.caseId, windowId, quote: { declaration }, stopReason: { code: 'manual' }, repair: null });
  state.ledger.allocationDelegations.push({ caseId: declaration.caseId, taskIds: VALIDATION_ROLES.map(role => declaration.grants[role].taskId) });
  state.ledger.allocations.push(...Object.values(declaration.grants));
  for (let i = 0; i < 31; i++) {
    const requestId = `SOURCE-C9-cost-${i}`, amount = i === 30 ? c9Cost - 30_000 : 1000;
    state.ledger.entries.push({ requestId, taskId: declaration.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only', status: 'settled', unknown: false,
      reservedMicroCny: 0, settledMicroCny: amount, evidence: [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE-only-C9-cost.json' }] });
    state.requests.push({ requestId, admittedAt: '2026-10-14T00:00:00.000Z', validation: { caseId: declaration.caseId, windowId, purpose: 'author' } });
  }
  state.ledger.allocationClosures.push(...VALIDATION_ROLES.map(role => ({ taskId: declaration.grants[role].taskId,
    releasedMicroCny: declaration.grants[role].amountMicroCny - (role === 'coding' ? c9Cost : 0) })));
  return structuredClone(state);
}

/** Four fixed SOURCE views only; append predecessor accounting without rebuilding historical roles. */
export async function withFixedTransferSuccessorFixture(t: TestContext, selected: 'ten' | 'eleven' | 'twelve' | 'thirteen', operation: (f: {
  repository: string; ledgerRoot: string; root: string; head: string; pins: any; baseline: any; manifest: any;
  args: string[]; git(...args: string[]): Promise<string>; costs(amount: number): Promise<any>; track(input: ValidationHostInput): void;
}) => Promise<void>) {
  assert.ok(selected === 'ten' || selected === 'eleven' || selected === 'twelve' || selected === 'thirteen');
  const ten = selected === 'ten', eleven = selected === 'eleven', twelve = selected === 'twelve', currentCase = ten ? 10 : eleven ? 11 : twelve ? 12 : 13;
  const beforeCases = currentCase + 6, beforeAudits = currentCase + 4, requestCount = ten ? 31 : eleven ? 40 : twelve ? 41 : 52;
  const repository = await realpath(resolve(join(tmpdir(), 'cosmos-transfer-entry-T81i3U')));
  assert.ok(repository.startsWith(resolve(tmpdir()) + sep) && /^cosmos-transfer-entry-[a-z0-9]+$/i.test(basename(repository)));
  const saved = join(repository, ten ? '.cosmos/SOURCE-C9-proof-d40980df-e6ec-490f-902b-a592ef4c86ac/history-1.json'
    : eleven ? '.cosmos/SOURCE-C10-proof-f99d7222-2af2-48df-97c7-89c0ae61c0c2/history-1.json'
    : twelve ? '.cosmos/SOURCE-C11-proof-78dbfb2d-c819-4830-8f0c-294b8d94d49c/history-1.json'
    : '.cosmos/SOURCE-C12-proof-75afa07b-c73d-4916-b84b-4de8e5372fa0/history-1.json');
  const beforeBytes = await readFile(saved), before = JSON.parse(beforeBytes.toString('utf8')); validateSnapshot(before);
  assert.equal(before.validation!.cases.length, beforeCases); assert.equal(before.ledger.allocationDelegations!.length, beforeCases - 8);
  assert.equal(before.ledger.allocationClosures!.length, beforeCases * 5); assert.equal(before.allocationClosureDecisions!.length, beforeAudits);
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), snapshot = join(ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), originalInfo = await stat(snapshot);
  validateSnapshot(JSON.parse(original.toString('utf8')));
  const oldRoot = join(repository, '.cosmos/e2e/cos20-transfer-validation-8');
  const historyRoots = Array.from({ length: currentCase - 9 }, (_, index) => join(repository, `.cosmos/e2e/cos20-transfer-validation-${index + 9}`));
  const root = join(repository, `.cosmos/e2e/cos20-transfer-validation-${currentCase}`);
  for (const path of [...historyRoots, root, join(ledgerRoot, `cos20-transfer-validation-${currentCase}.json`)]) await assert.rejects(lstat(path), (error: any) => error.code === 'ENOENT');
  for (const folder of [ledgerRoot, oldRoot]) for (const file of ['.controller.lock', '.controller.lock.recovery', 'registry/.commit.lock', 'registry/.commit.lock.recovery'])
    await assert.rejects(lstat(join(folder, file)), (error: any) => error.code === 'ENOENT');
  const proofFiles = [join(ledgerRoot, 'cos20-transfer-validation-8.json'), join(oldRoot, 'origin.json'), join(oldRoot, 'execution-reused.json'), join(ledgerRoot, 'cos20-transfer-validation-8-reuse.json')];
  const protectedFiles = await Promise.all(proofFiles.map(async path => ({ path, bytes: await readFile(path), info: await stat(path) })));
  const marker = JSON.parse(await readFile(join(repository, '.cosmos/SOURCE-C8-fixture.json'), 'utf8'));
  const manifest = JSON.parse(protectedFiles[3].bytes.toString('utf8')), previous = ten ? deriveTransferValidationCaseNineDeclaration(before)
    : eleven ? deriveTransferValidationCaseTenDeclaration(before) : twelve ? deriveTransferValidationCaseElevenDeclaration(before) : deriveTransferValidationCaseTwelveDeclaration(before), id = randomUUID();
  const archive = join(repository, `.cosmos/SOURCE-C${currentCase}-proof-${id}`); await mkdir(archive); await writeFile(join(archive, 'original-snapshot.json'), original);
  const git = async (...args: string[]) => { const result = await runChild('git', ['-c', 'user.name=SOURCE Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '--no-optional-locks', ...args], { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 }); assert.equal(result.code, 0); return result.stdout.trim(); };
  const mappingPath = join(repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), mappingInfo = await stat(mappingPath), mapping = JSON.parse(mappingBytes.toString('utf8')), oldHead = await git('rev-parse', 'HEAD');
  const owners = new Set<ValidationHostInput>(); let controller: RunController | undefined, generation = 0;
  const costs = async (amount: number) => {
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
  try {
    for (const [taskId, reviewStatus] of Object.entries({ 'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY',
      'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY', 'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY', 'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY', 'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY',
      ...(!ten ? { 'COS-82': 'TRANSFER_CASE_TEN_SOURCE_READY', 'COS-83': 'AUTHOR_TOOL_SCOPE_SOURCE_READY' } : {}),
      ...(!ten && !eleven ? { 'COS-84': 'TRANSFER_CASE_ELEVEN_SOURCE_READY', 'COS-85': 'OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY' } : {}),
      ...(selected === 'thirteen' ? { 'COS-86': 'TRANSFER_CASE_TWELVE_SOURCE_READY', 'COS-87': 'PARALLEL_GIT_IDENTITY_SOURCE_READY' } : {}) })) {
      let item = mapping.tasks.find((item: any) => item.taskId === taskId); if (!item) { item = { taskId }; mapping.tasks.push(item); }
      Object.assign(item, { reviewedCommit: oldHead, mergeCommit: oldHead, reviewStatus, integrationStatus: 'source-integrated' });
    }
    await writeFile(mappingPath, JSON.stringify(mapping), 'utf8'); await git('add', 'docs/specs/github-issues.json'); await git('commit', '-m', `SOURCE C${currentCase} prerequisites`);
    const head = await git('rev-parse', 'HEAD'); await git('update-ref', 'refs/remotes/origin/main', head); for (const path of historyRoots) await mkdir(path);
    const manifestPath = join(ledgerRoot, `cos20-transfer-validation-${currentCase}-reuse.json`);
    try { assert.deepEqual(await readFile(manifestPath), protectedFiles[3].bytes); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(manifestPath, protectedFiles[3].bytes); }
    const baseline = await costs(ten ? 960_162 : eleven ? 1_086_265 : twelve ? 1_336_555 : 1_664_926);
    await operation({ repository, ledgerRoot, root, head, pins: marker.pins, baseline, manifest, args: ['--validation-case', head, `SOURCE C${currentCase} fixed ${selected === 'thirteen' ? 'two-and-a-half' : 'three'} yuan envelope; no paid/human claim`], git, costs, track: input => { owners.add(input); } });
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
    await writeFile(mappingPath, mappingBytes); await git('add', 'docs/specs/github-issues.json');
    if (await git('diff', '--cached', '--name-only')) await git('commit', '-m', 'SOURCE restore prior prerequisite bytes');
    await git('update-ref', 'refs/remotes/origin/main', await git('rev-parse', 'HEAD')); await utimes(mappingPath, mappingInfo.atimeMs / 1000, mappingInfo.mtimeMs / 1000);
    for (const file of protectedFiles) { assert.deepEqual(await readFile(file.path), file.bytes); assert.equal((await stat(file.path)).mtimeMs, file.info.mtimeMs); }
    assert.deepEqual(await readFile(snapshot), original); assert.ok(Math.abs((await stat(snapshot)).mtimeMs - originalInfo.mtimeMs) < 1); assert.deepEqual(await readFile(mappingPath), mappingBytes);
    t.diagnostic(`SOURCE C${currentCase} proof ${archive}; original snapshot and prior proof bytes preserved.`);
  }
}
export function withFixedThreeYuanTransferFixture(t: TestContext, selected: 'ten' | 'eleven' | 'twelve', operation: Parameters<typeof withFixedTransferSuccessorFixture>[2]) {
  assert.ok(selected === 'ten' || selected === 'eleven' || selected === 'twelve');
  return withFixedTransferSuccessorFixture(t, selected, operation);
}
export function withTransferCaseTenFixture(t: TestContext, operation: Parameters<typeof withFixedThreeYuanTransferFixture>[2]) {
  return withFixedThreeYuanTransferFixture(t, 'ten', operation);
}
