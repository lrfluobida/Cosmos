import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, stat, lstat, readdir, unlink, cp, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransferCaseNineFixture } from './validation-case-nine.fixture.ts';
import { deriveTransferValidationCaseNineDeclaration } from '../../probes/transfer/validation-case-nine-declaration.ts';
import { bootstrapTransferValidationCaseNineToolchain, stageTransferValidationCaseNineInput } from '../../probes/transfer/validation-case-nine-driver.ts';
import { prepareTransferValidationCaseNineExecution } from '../../probes/transfer/validation-case-nine-task.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { outputLimitFixture, syntheticContext } from '../providers/request-output-limit.fixture.mjs';
import { compactionSourcePrerequisites } from './validation-case-nine-compaction.fixture.ts';

test('C9 reuses before15 accounting, authenticates its new history and binds current task factory and cold input', async t => {
  await withTransferCaseNineFixture(t, async f => {
    const snapshot = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), baseline: any = f.baseline;
    let prepares = 0; const host = { prepare: async () => { prepares++; }, execute: async () => { throw new Error('SOURCE no generation DAG'); } };
    async function refuse(pattern: RegExp) {
      const bytes = await readFile(snapshot), info = await stat(snapshot), files = await readdir(join(f.repository, '.cosmos'), { recursive: true });
      await assert.rejects(f.entry.runTransferValidationCaseNineWithHost({ repository: f.repository, args: f.args, host }), pattern);
      assert.equal(prepares, 0); assert.deepEqual(await readFile(snapshot), bytes); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
      assert.deepEqual(await readdir(join(f.repository, '.cosmos'), { recursive: true }), files);
      await assert.rejects(lstat(f.root), (error: any) => error.code === 'ENOENT');
    }
    for (const mutate of [
      (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 1 }),
      (s: any) => { s.ledger.allocationClosures.pop(); }, (s: any) => { s.allocationClosureDecisions.pop(); },
      (s: any) => { s.validation.cases[15].repair = { taskId: 'SOURCE-old-free-repair' }; },
      (s: any) => { s.validation.cases[15].quote.declaration.grants.coding.amountMicroCny++; },
      (s: any) => { s.ledger.allocationDelegations[7].caseId = 'foreign'; },
    ]) {
      const changed = structuredClone(baseline); mutate(changed); await writeFile(snapshot, JSON.stringify(changed), 'utf8');
      try { await refuse(/unknown|reconcil|Invalid|Validation|closed|audit|allocation|repair|declaration|delegation/); } finally { await writeFile(snapshot, original); }
    }
    const lock = join(f.ledgerRoot, '.controller.lock.recovery'); await writeFile(lock, 'SOURCE unresolved owner', 'utf8');
    try { await refuse(/owner|unresolved/); } finally { await unlink(lock); }
    const manifestPath = join(f.ledgerRoot, 'cos20-transfer-validation-9-reuse.json'), manifestBytes = await readFile(manifestPath);
    await writeFile(manifestPath, '{}', 'utf8'); try { await refuse(/manifest|historical|source|stage/i); } finally { await writeFile(manifestPath, manifestBytes); }
    const closurePath = join(f.ledgerRoot, baseline.allocationClosureDecisions[13].operatorDecision.source.location), closureBytes = await readFile(closurePath);
    await writeFile(closurePath, Buffer.concat([closureBytes, Buffer.from(' ')])); try { await refuse(/closure|source|bytes/); } finally { await writeFile(closurePath, closureBytes); }
    const mappingPath = join(f.repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), mapping = JSON.parse(mappingBytes.toString('utf8'));
    const unrelated = await f.git('commit-tree', `${f.head}^{tree}`, '-m', 'SOURCE unrelated C9 prerequisite');
    for (const [taskId, change] of [['COS-76', { reviewStatus: 'SOURCE_NOT_READY' }], ['COS-77', { reviewStatus: 'SOURCE_NOT_READY' }],
      ['COS-77', { reviewedCommit: unrelated }], ['COS-77', { mergeCommit: unrelated }]] as const) {
      const wrong = structuredClone(mapping); Object.assign(wrong.tasks.find((item: any) => item.taskId === taskId), change);
      await writeFile(mappingPath, JSON.stringify(wrong), 'utf8'); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE C9 refusal');
      f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
      await refuse(/COS-76|COS-77|ancestor/);
    }
    await writeFile(mappingPath, mappingBytes); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE restore C9 approvals');
    f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
    const first = await f.entry.preflightTransferValidationCaseNineRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
    assert.equal(first.paidRequests, 0); assert.equal(first.quote.declaration.grants.coding.amountMicroCny, 1_233_190);
    await f.costs(600_000);
    const second = await f.entry.preflightTransferValidationCaseNineRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
    assert.equal(second.quote.declaration.grants.coding.amountMicroCny, 1_120_718); assert.notEqual(second.admissionRef!.version, first.admissionRef!.version);
    const stale = { kind: 'operator_validation' as const, decisionId: `SOURCE-C9-stale-${randomUUID()}`, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: 'SOURCE-C9-stale', version: 'SOURCE-only', location: `SOURCE-C9-stale-${randomUUID()}.json` }, sourceRefs: [first.inheritedSource, first.admissionRef!] };
    await writeFile(join(f.ledgerRoot, stale.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...stale, source: undefined, quote: first.quote }), 'utf8');
    const identityReader = fixedTransferValidationInput(first.quote.declaration).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
    await assert.rejects(RunController.claimValidationCase({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader, quote: first.quote, decision: stale }), /stale|baseline|capacity|budget/);
    await writeFile(snapshot, original);
    t.diagnostic('SOURCE C9 history/owner/source/fee refusals and two authentic accounting variants passed; no old author or capture rerun.');

    const pi = await outputLimitFixture(t), configs: any[] = [], admissions: any[] = [], D = deriveTransferValidationCaseNineDeclaration(baseline);
    const sessionFactory: any = async (config: any) => {
      configs.push(config); return pi.create({ ...config, env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' }, budget: {
        beforeRequest: async (request: any) => { admissions.push(request); await config.budget.beforeRequest(request); }, afterResponse: config.budget.afterResponse } });
    };
    const started = await f.entry.startTransferValidationCaseNine({ repository: f.repository, args: f.args, host }), input = started.input; f.track(input);
    let current: Awaited<ReturnType<typeof createTransferReusedConsumerHost>> | undefined;
    try {
      await bootstrapTransferValidationCaseNineToolchain(input, async (job: any) => {
        assert.equal(job.authority.taskId, D.grants.planning.taskId);
        await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
        await symlink(fileURLToPath(new URL('../../templates/2d/node_modules', import.meta.url)), join(input.root, 'toolchain/node_modules'), 'junction');
        const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
        await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
        return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'SOURCE fixed bootstrap transport', cleanup: {} };
      });
      const scoped = await stageTransferValidationCaseNineInput(input, started.historical);
      current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
        work: input.work, resume: false, historicalStages: started.historical, sessionFactory, io: { build: async () => { throw new Error('SOURCE no build'); }, play: async () => { throw new Error('SOURCE no browser'); } } });
      const executionInput = { state: await input.controller.read(), window: input.window, requirement: scoped.requirement, host: current,
        historical: await started.historical.verify(input.signal), root: input.root, manifestRef: started.historical.manifestRef, capability: current.capability, signal: input.signal };
      const execution = await prepareTransferValidationCaseNineExecution(executionInput, false), prepared = execution.tasks[0];
      assert.equal(execution.tasks.length, 1); assert.equal(prepared.task.taskId, D.grants.coding.taskId);
      const receiptPath = join(input.root, 'execution-reused.json'), receipt = await readFile(receiptPath), receiptInfo = await stat(receiptPath);
      assert.deepEqual(await prepareTransferValidationCaseNineExecution(executionInput, true), execution);
      const wrongPolicy = { ...executionInput, host: { ...current, taskPolicies: structuredClone(current.taskPolicies) } }; wrongPolicy.host.taskPolicies[0].tools.pop();
      await assert.rejects(prepareTransferValidationCaseNineExecution(wrongPolicy, true), /execution|policy|changed/);
      const wrongPlan = { ...executionInput, host: { ...current, availableArtifacts: structuredClone(current.availableArtifacts) } }; wrongPlan.host.availableArtifacts.at(-1)!.version = 'SOURCE-wrong-plan';
      await assert.rejects(prepareTransferValidationCaseNineExecution(wrongPlan, true), /execution|current|input|changed/);
      await current.bindPreparedTasks([prepared]); await input.controller.registerTasks([prepared.task]);
      const task = structuredClone(prepared.task); task.state = 'ready'; await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-C9' }); await current.preAuthor!(task, input.signal);
      task.state = 'running'; const attemptId = randomUUID(); task.attempts = [{ attemptId, sessionRef: join(input.root, 'sessions', attemptId), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
      await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-C9' });
      const session = await current.roleFactory({ role: 'coding', task, controller: input.controller, requirement: scoped.requirement, workspace: prepared.workspace, stateDirectory: join(task.attempts[0].sessionRef, 'author') });
      try {
        assert.equal(typeof configs[0].requestOutputLimit, 'function'); assert.equal(configs[0].maxOutputTokens, 65536); assert.equal(configs[0].requestTimeoutMs, 600000);
        await pi.dispatch(syntheticContext());
        assert.equal(pi.dispatches.length, 1); assert.equal(pi.dispatches[0].maxTokens, 52730); assert.equal(admissions[0].estimatedMaxCostMicroCny, 1_233_184);
        const actual = (await input.controller.read()).requests.at(-1)!.validation!; assert.equal(actual.maxOutputTokens, 52730); assert.equal(actual.inputBytes, 405672);
        assert.deepEqual(configs.map(c => JSON.parse(c.context).role), ['coding']);
      } finally { await session.close(); }
      assert.deepEqual(await readFile(receiptPath), receipt); assert.equal((await stat(receiptPath)).mtimeMs, receiptInfo.mtimeMs);
      await current.closePreparation(); current = undefined; await input.work.cancelAndDrain('SOURCE C9 owner close'); await input.controller.close();
      const cold = await f.entry.startTransferValidationCaseNine({ repository: f.repository, args: f.args, host }, true); f.track(cold.input);
      assert.equal(cold.input.window.windowId, input.window.windowId); assert.equal(cold.input.window.deadlineAt, input.window.deadlineAt); assert.equal(prepares, 1);
      const coldScope = await stageTransferValidationCaseNineInput(cold.input, cold.historical, true); assert.deepEqual(coldScope.requirement, scoped.requirement);
      assert.deepEqual(await readFile(receiptPath), receipt); assert.equal((await stat(receiptPath)).mtimeMs, receiptInfo.mtimeMs);
      await cold.input.controller.stop('SOURCE C9 current task/factory/cold binding proof; no game or repair executed.');
      const after = await cold.input.controller.read();
      assert.equal(after.validation!.cases.length, 17); assert.deepEqual(after.validation!.cases.slice(0, 16), baseline.validation.cases);
      assert.deepEqual(after.ledger.entries.slice(0, baseline.ledger.entries.length), baseline.ledger.entries);
      assert.deepEqual(after.ledger.allocationClosures, baseline.ledger.allocationClosures); assert.deepEqual(after.allocationClosureDecisions, baseline.allocationClosureDecisions);
      t.diagnostic('SOURCE C9 actual task/factory + Pi cap52730/request1233184 and same-window cold input passed; no build/browser/repair rerun.');
    } finally { await current?.closePreparation().catch(() => {}); await input.work.cancelAndDrain('SOURCE C9 callback cleanup'); await input.controller.close(); }
  });
});

// Keep users of the same preserved SOURCE seed serial within this test file.
test('C9 requires reviewed compaction source and both ancestor SHAs before free admission', compactionSourcePrerequisites);
