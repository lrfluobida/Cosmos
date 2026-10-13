import { caseEightFeeData } from './validation-case-eight.fixture.ts';
import { deriveTransferValidationCaseEightDeclaration } from '../../probes/transfer/validation-case-eight-declaration.ts';
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
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { runChild } from '../../probes/e2e/host.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';
import type { TestContext } from 'node:test';
import { createFixedTransferValidationCaseNineEntry } from '../../probes/transfer/validation-case-nine-entry.ts';

/** SOURCE-only arithmetic rows. Authenticated history is built separately from the saved before15 seed. */
export function caseNineFeeData(c8Cost = 487_528) {
  const state = caseEightFeeData(), declaration = deriveTransferValidationCaseEightDeclaration(state), windowId = 'SOURCE-C8-cost-window';
  state.validation.cases.push({ caseId: declaration.caseId, windowId, quote: { declaration }, stopReason: { code: 'manual' }, repair: null });
  state.ledger.allocationDelegations.push({ caseId: declaration.caseId, taskIds: VALIDATION_ROLES.map(role => declaration.grants[role].taskId) });
  state.ledger.allocations.push(...Object.values(declaration.grants));
  for (let i = 0; i < 14; i++) {
    const requestId = `SOURCE-C8-cost-${i}`, amount = i === 13 ? c8Cost - 13_000 : 1000;
    state.ledger.entries.push({ requestId, taskId: declaration.grants.coding.taskId, provider: 'deepseek', pricingVersion: 'SOURCE-only', status: 'settled', unknown: false,
      reservedMicroCny: 0, settledMicroCny: amount, evidence: [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE-only-C8-cost.json' }] });
    state.requests.push({ requestId, admittedAt: '2026-10-14T00:00:00.000Z', validation: { caseId: declaration.caseId, windowId, purpose: 'author' } });
  }
  state.ledger.allocationClosures.push(...VALIDATION_ROLES.map(role => ({ taskId: declaration.grants[role].taskId,
    releasedMicroCny: declaration.grants[role].amountMicroCny - (role === 'coding' ? c8Cost : 0) })));
  state.expected.coding -= c8Cost;
  return structuredClone(state);
}

/** Reuse only the already verified SOURCE/TEMP before15 bytes; never regenerate C5 or reopen its proof. */
export async function withTransferCaseNineFixture(t: TestContext, operation: (f: {
  repository: string; ledgerRoot: string; root: string; head: string; pins: any; original: any; baseline: any; manifest: any;
  entry: ReturnType<typeof createFixedTransferValidationCaseNineEntry>; args: string[];
  git(...args: string[]): Promise<string>; costs(amount: number): Promise<any>; track(input: ValidationHostInput): void;
}) => Promise<void>) {
  const repository = await realpath(resolve(process.env.COS78_SOURCE_SEED ?? join(tmpdir(), 'cosmos-transfer-entry-T81i3U')));
  assert.ok(repository.startsWith(resolve(tmpdir()) + sep) && /^cosmos-transfer-entry-[a-z0-9]+$/i.test(basename(repository)), 'Only the owned SOURCE/TEMP seed is permitted.');
  const marker = JSON.parse(await readFile(join(repository, '.cosmos/SOURCE-C8-fixture.json'), 'utf8'));
  assert.equal(marker.formatVersion, 'SOURCE-C8-before15/1');
  const before15 = await readFile(join(repository, '.cosmos/SOURCE-C8-before15.json'));
  assert.equal(validationHash(before15), marker.snapshotSha256);
  const before = JSON.parse(before15.toString('utf8')); validateSnapshot(before);
  assert.equal(before.validation!.cases.length, 15); assert.equal(before.ledger.allocationDelegations!.length, 7);
  assert.equal(before.ledger.allocationClosures!.length, 75); assert.equal(before.allocationClosureDecisions!.length, 13);
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), snapshot = join(ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), originalInfo = await stat(snapshot);
  const proof = JSON.parse(original.toString('utf8')); validateSnapshot(proof); assert.ok(proof.validation!.cases.every(window => window.stopReason));
  const oldRoot = join(repository, '.cosmos/e2e/cos20-transfer-validation-8');
  for (const root of [ledgerRoot, oldRoot]) for (const file of ['.controller.lock', '.controller.lock.recovery', 'registry/.commit.lock', 'registry/.commit.lock.recovery'])
    await assert.rejects(lstat(join(root, file)), (error: any) => error.code === 'ENOENT');
  const proofFiles = [join(ledgerRoot, 'cos20-transfer-validation-8.json'), join(oldRoot, 'origin.json'), join(oldRoot, 'execution-reused.json'),
    join(ledgerRoot, 'cos20-transfer-validation-8-reuse.json')];
  const frozenProof = await Promise.all(proofFiles.map(async path => ({ path, bytes: await readFile(path), info: await stat(path) })));
  const manifest = JSON.parse(frozenProof[3].bytes.toString('utf8')), D8 = deriveTransferValidationCaseEightDeclaration(before), id = randomUUID();
  const archive = join(repository, `.cosmos/SOURCE-C9-proof-${id}`); await mkdir(archive);
  await writeFile(join(archive, 'original-snapshot.json'), original);
  const git = async (...args: string[]) => { const result = await runChild('git', ['-c', 'user.name=SOURCE Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '--no-optional-locks', ...args], { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 }); assert.equal(result.code, 0); return result.stdout.trim(); };
  const mappingPath = join(repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), mapping = JSON.parse(mappingBytes.toString('utf8')), oldHead = await git('rev-parse', 'HEAD');
  for (const [taskId, reviewStatus] of Object.entries({ 'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY' })) {
    let item = mapping.tasks.find((item: any) => item.taskId === taskId); if (!item) { item = { taskId }; mapping.tasks.push(item); }
    Object.assign(item, { reviewedCommit: oldHead, mergeCommit: oldHead, reviewStatus, integrationStatus: 'source-integrated' });
  }
  await writeFile(mappingPath, JSON.stringify(mapping), 'utf8'); await git('add', 'docs/specs/github-issues.json'); await git('commit', '-m', 'SOURCE C9 prerequisites');
  const head = await git('rev-parse', 'HEAD'); await git('update-ref', 'refs/remotes/origin/main', head);
  const owners = new Set<ValidationHostInput>();
  let controller: RunController | undefined, generation = 0;
  const root = join(repository, '.cosmos/e2e/cos20-transfer-validation-9');
  await assert.rejects(lstat(root), (error: any) => error.code === 'ENOENT');
  const costs = async (amount: number) => {
    assert.ok(Number.isSafeInteger(amount) && amount >= 13_000); await writeFile(snapshot, before15);
    const identityReader = fixedTransferValidationInput(D8).createTransferValidationIdentityReader({ repository, reviewedPlatformSha: await git('rev-parse', 'HEAD') });
    const context = { root: ledgerRoot, repositoryRoot: repository, identityReader };
    const quote = await prepareValidationCase({ ...context, declaration: D8 }), key = `SOURCE-C9-C8-costs-${id}-${++generation}`;
    const decision = { kind: 'operator_validation' as const, decisionId: key, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: key, version: 'SOURCE-only', location: `${key}.json` }, sourceRefs: [{ artifactId: key, version: 'SOURCE-only', location: 'SOURCE accounting fixture; not a game run' }] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...context, quote, decision });
    controller = await RunController.openValidationCase({ ...context, caseId: D8.caseId, windowId: window.windowId });
    try {
      const task = taskFixture() as TaskContract, acceptanceIds = quote.requirements.acceptanceIds;
      Object.assign(task, { taskId: D8.grants.coding.taskId, runId: quote.basis.runId, kind: 'evaluation', specVersion: '1.0', authorId: `${key}-author`, acceptanceIds,
        dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
        review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
      task.acceptance = acceptanceIds.map(acceptanceId => ({ ...structuredClone(task.acceptance[0]), acceptanceId })); task.context.contextId = `${key}-context`;
      task.budget = { ledgerId: quote.basis.ledgerId, allocationMicroCny: D8.grants.coding.amountMicroCny, originalDeadlineAt: before.run.originalDeadlineAt };
      await controller.registerTasks([task]);
      for (let i = 0; i < 14; i++) {
        const requestId = `${key}-${i}`, actual = i === 13 ? amount - 13_000 : 1000;
        await controller.reserve({ requestId, taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: Math.max(16_000, actual),
          validation: { caseId: D8.caseId, windowId: window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
        await controller.admit(requestId); await controller.settle(requestId, actual, [{ artifactId: requestId, version: 'SOURCE-settled', location: 'SOURCE synthetic accounting; no SDK' }]);
      }
      await controller.stop('SOURCE C8 accounting-only history completed; no author, capture or repair executed.');
    } finally { await controller.close(); controller = undefined; }
    const closure = await prepareValidationAllocationClosure({ ...context, caseIds: [D8.caseId] });
    const close = { kind: 'operator_validation_allocation_closure' as const, decisionId: `${key}-closure`, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: `${key}-closure`, version: 'SOURCE-only', location: `${key}-closure.json` }, sourceRefs: [decision.source] };
    await writeFile(join(ledgerRoot, close.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...close, source: undefined, quote: closure }), 'utf8');
    await applyValidationAllocationClosure({ ...context, quote: closure, decision: close });
    const bytes = await readFile(snapshot), state = JSON.parse(bytes.toString('utf8')); validateSnapshot(state);
    assert.equal(state.validation!.cases.length, 16); assert.equal(state.ledger.allocationClosures!.length, 80); assert.equal(state.allocationClosureDecisions!.length, 14);
    assert.deepEqual(state.validation!.cases.slice(0, 15), before.validation!.cases); assert.deepEqual(state.ledger.entries.slice(0, before.ledger.entries.length), before.ledger.entries);
    await writeFile(join(archive, `history-${generation}.json`), bytes); return state;
  };
  try {
    const manifestPath = join(ledgerRoot, 'cos20-transfer-validation-9-reuse.json');
    try { assert.deepEqual(await readFile(manifestPath), frozenProof[3].bytes); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(manifestPath, frozenProof[3].bytes); }
    const baseline = await costs(487_528);
    await operation({ repository, ledgerRoot, root, head, pins: marker.pins, original: before, baseline, manifest,
      entry: createFixedTransferValidationCaseNineEntry(marker.pins), args: ['--validation-case', head, 'SOURCE C9 fixed binding; no provider/human claim'], git, costs, track: input => { owners.add(input); } });
  } finally {
    await controller?.close();
    for (const input of owners) { await input.work.cancelAndDrain('SOURCE C9 fixture cleanup'); await input.controller.close(); }
    await assert.rejects(lstat(join(ledgerRoot, '.controller.lock')), (error: any) => error.code === 'ENOENT');
    await writeFile(join(archive, 'result-snapshot.json'), await readFile(snapshot));
    await writeFile(snapshot, original); await utimes(snapshot, originalInfo.atimeMs / 1000, originalInfo.mtimeMs / 1000);
    if (await lstat(root).then(() => true, (error: any) => { if (error.code === 'ENOENT') return false; throw error; })) {
      assert.equal(await realpath(root), join(repository, '.cosmos/e2e/cos20-transfer-validation-9'));
      await rename(root, join(archive, 'case9'));
      const markerPath = join(ledgerRoot, 'cos20-transfer-validation-9.json'); await writeFile(join(archive, 'case9-marker.json'), await readFile(markerPath)); await unlink(markerPath);
    }
    for (const file of frozenProof) { assert.deepEqual(await readFile(file.path), file.bytes); assert.equal((await stat(file.path)).mtimeMs, file.info.mtimeMs); }
    assert.deepEqual(await readFile(snapshot), original); assert.ok(Math.abs((await stat(snapshot)).mtimeMs - originalInfo.mtimeMs) < 1);
    t.diagnostic(`SOURCE C9 history/current proof ${archive}; old snapshot/root/marker/receipt bytes preserved; no history regeneration.`);
  }
}
