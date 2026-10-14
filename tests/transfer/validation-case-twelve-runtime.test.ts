import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, stat, lstat, readdir, unlink, cp, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransferCaseTwelveFixture } from './validation-case-twelve.fixture.ts';
import { deriveTransferValidationCaseTwelveDeclaration } from '../../probes/transfer/validation-case-twelve-declaration.ts';
import { bootstrapTransferValidationCaseTwelveToolchain, stageTransferValidationCaseTwelveInput } from '../../probes/transfer/validation-case-twelve-driver.ts';
import { prepareTransferValidationCaseTwelveExecution } from '../../probes/transfer/validation-case-twelve-task.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { outputLimitFixture, syntheticContext } from '../providers/request-output-limit.fixture.mjs';
import { createFixedTransferValidationCaseTwelveEntry } from '../../probes/transfer/validation-case-twelve-entry.ts';

test('C12 preserves C11 history and binds its partial group envelope through real host Pi and cold input', async t => {
  await withTransferCaseTwelveFixture(t, async f => {
    assert.deepEqual(f.manifest.stages.map((stage: any) => stage.role), ['design', 'art']);
    assert.ok(f.manifest.stages.every((stage: any) => stage.task.state === 'passed'));
    assert.equal(f.manifest.captures.length, 7);
    assert.equal(f.baseline.validation.cases.length, 19); assert.equal(f.baseline.ledger.allocationDelegations.length, 11);
    assert.equal(f.baseline.ledger.allocationClosures.length, 95); assert.equal(f.baseline.allocationClosureDecisions.length, 17);
    const prior = f.baseline.requests.filter((request: any) => request.validation?.caseId === 'cos20-transfer-validation-11');
    assert.equal(prior.length, 41); assert.ok(prior.every((request: any) => request.admittedAt !== null && request.validation.purpose === 'author'));
    const entry = createFixedTransferValidationCaseTwelveEntry(f.pins);
    const snapshot = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), baseline: any = f.baseline;
    let prepares = 0; const host = { prepare: async () => { prepares++; }, execute: async () => { throw new Error('SOURCE no generation DAG'); } };
    async function refuse(pattern: RegExp) {
      const bytes = await readFile(snapshot), info = await stat(snapshot), files = await readdir(join(f.repository, '.cosmos'), { recursive: true });
      await assert.rejects(entry.runTransferValidationCaseTwelveWithHost({ repository: f.repository, args: f.args, host }), pattern);
      assert.equal(prepares, 0); assert.deepEqual(await readFile(snapshot), bytes); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
      assert.deepEqual(await readdir(join(f.repository, '.cosmos'), { recursive: true }), files);
      await assert.rejects(lstat(f.root), (error: any) => error.code === 'ENOENT');
    }
    for (const mutate of [
      (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 1 }),
      (s: any) => { s.ledger.allocationClosures.pop(); }, (s: any) => { s.allocationClosureDecisions.pop(); },
      (s: any) => { s.validation.cases[18].repair = { taskId: 'SOURCE-old-free-repair' }; },
      (s: any) => { s.validation.cases[18].quote.declaration.grants.coding.amountMicroCny++; },
      (s: any) => { s.ledger.allocationDelegations[10].caseId = 'foreign'; },
    ]) {
      const changed = structuredClone(baseline); mutate(changed); await writeFile(snapshot, JSON.stringify(changed), 'utf8');
      try { await refuse(/unknown|reconcil|Invalid|Validation|closed|audit|allocation|repair|declaration|delegation/); } finally { await writeFile(snapshot, original); }
    }
    const lock = join(f.ledgerRoot, '.controller.lock.recovery'); await writeFile(lock, 'SOURCE unresolved owner', 'utf8');
    try { await refuse(/owner|unresolved/); } finally { await unlink(lock); }
    const manifestPath = join(f.ledgerRoot, 'cos20-transfer-validation-12-reuse.json'), manifestBytes = await readFile(manifestPath);
    await writeFile(manifestPath, '{}', 'utf8'); try { await refuse(/manifest|historical|source|stage/i); } finally { await writeFile(manifestPath, manifestBytes); }
    const closurePath = join(f.ledgerRoot, baseline.allocationClosureDecisions[16].operatorDecision.source.location), closureBytes = await readFile(closurePath);
    await writeFile(closurePath, Buffer.concat([closureBytes, Buffer.from(' ')])); try { await refuse(/closure|source|bytes/); } finally { await writeFile(closurePath, closureBytes); }
    const mappingPath = join(f.repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), mapping = JSON.parse(mappingBytes.toString('utf8'));
    const unrelated = await f.git('commit-tree', `${f.head}^{tree}`, '-m', 'SOURCE unrelated C12 prerequisite');
    for (const [taskId, change] of [['COS-84', { reviewStatus: 'SOURCE_NOT_READY' }], ['COS-85', { reviewStatus: 'SOURCE_NOT_READY' }],
      ['COS-84', { reviewedCommit: unrelated }], ['COS-84', { mergeCommit: unrelated }],
      ['COS-85', { reviewedCommit: unrelated }], ['COS-85', { mergeCommit: unrelated }]] as const) {
      const wrong = structuredClone(mapping); Object.assign(wrong.tasks.find((item: any) => item.taskId === taskId), change);
      await writeFile(mappingPath, JSON.stringify(wrong), 'utf8'); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE C12 refusal');
      f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
      await refuse(/COS-84|COS-85|ancestor/);
    }
    await writeFile(mappingPath, mappingBytes); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE restore C12 approvals');
    f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
    const first = await entry.preflightTransferValidationCaseTwelveRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
    assert.equal(first.paidRequests, 0); assert.equal(first.quote.declaration.limits.incrementalMicroCny, 3_000_000);
    assert.notEqual(first.quote.budgetGroup!.allocatedMicroCny, first.quote.basis.allocatedMicroCny); assert.equal(first.quote.declaration.grants.coding.amountMicroCny, 2_400_000);
    await f.costs(1_100_000);
    const second = await entry.preflightTransferValidationCaseTwelveRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
    assert.equal(second.quote.declaration.grants.coding.amountMicroCny, 2_400_000);
    assert.equal(second.quote.budgetGroup!.availableAllocationMicroCny - first.quote.budgetGroup!.availableAllocationMicroCny, 236_555); assert.notEqual(second.admissionRef!.version, first.admissionRef!.version);
    const stale = { kind: 'operator_validation' as const, decisionId: `SOURCE-C12-stale-${randomUUID()}`, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: 'SOURCE-C12-stale', version: 'SOURCE-only', location: `SOURCE-C12-stale-${randomUUID()}.json` }, sourceRefs: [first.inheritedSource, first.admissionRef!] };
    await writeFile(join(f.ledgerRoot, stale.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...stale, source: undefined, quote: first.quote }), 'utf8');
    const identityReader = fixedTransferValidationInput(first.quote.declaration).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
    await assert.rejects(RunController.claimValidationCase({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader, quote: first.quote, decision: stale }), /stale|baseline|capacity|budget/);
    await writeFile(snapshot, original);
    t.diagnostic('SOURCE C12 history/owner/source/fee refusals and two authentic accounting variants passed; no old author or capture rerun.');

    const pi = await outputLimitFixture(t), configs: any[] = [], admissions: any[] = [], D = deriveTransferValidationCaseTwelveDeclaration(baseline);
    const sessionFactory: any = async (config: any) => {
      configs.push(config); return pi.create({ ...config, env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' }, budget: {
        beforeRequest: async (request: any) => { admissions.push(request); await config.budget.beforeRequest(request); }, afterResponse: config.budget.afterResponse } });
    };
    const started = await entry.startTransferValidationCaseTwelve({ repository: f.repository, args: f.args, host }), input = started.input; f.track(input);
    let current: Awaited<ReturnType<typeof createTransferReusedConsumerHost>> | undefined;
    try {
      await bootstrapTransferValidationCaseTwelveToolchain(input, async (job: any) => {
        assert.equal(job.authority.taskId, D.grants.planning.taskId);
        await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
        await symlink(fileURLToPath(new URL('../../templates/2d/node_modules', import.meta.url)), join(input.root, 'toolchain/node_modules'), 'junction');
        const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
        await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
        return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'SOURCE fixed bootstrap transport', cleanup: {} };
      });
      const scoped = await stageTransferValidationCaseTwelveInput(input, started.historical);
      current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
        work: input.work, resume: false, historicalStages: started.historical, sessionFactory, io: { build: async () => { throw new Error('SOURCE no build'); }, play: async () => { throw new Error('SOURCE no browser'); } } });
      const executionInput = { state: await input.controller.read(), window: input.window, requirement: scoped.requirement, host: current,
        historical: await started.historical.verify(input.signal), root: input.root, manifestRef: started.historical.manifestRef, capability: current.capability, signal: input.signal };
      const execution = await prepareTransferValidationCaseTwelveExecution(executionInput, false), prepared = execution.tasks[0];
      const authorPath = join(prepared.workspace, 'authors/coding');
      assert.deepEqual(await readdir(authorPath).catch((error: any) => { if (error.code === 'ENOENT') return []; throw error; }), []);
      assert.equal(execution.tasks.length, 1); assert.equal(prepared.task.taskId, D.grants.coding.taskId);
      const receiptPath = join(input.root, 'execution-reused.json'), receipt = await readFile(receiptPath), receiptInfo = await stat(receiptPath);
      assert.deepEqual(await prepareTransferValidationCaseTwelveExecution(executionInput, true), execution);
      const wrongPolicy = { ...executionInput, host: { ...current, taskPolicies: structuredClone(current.taskPolicies) } }; wrongPolicy.host.taskPolicies[0].tools.pop();
      await assert.rejects(prepareTransferValidationCaseTwelveExecution(wrongPolicy, true), /execution|policy|changed/);
      const wrongPlan = { ...executionInput, host: { ...current, availableArtifacts: structuredClone(current.availableArtifacts) } }; wrongPlan.host.availableArtifacts.at(-1)!.version = 'SOURCE-wrong-plan';
      await assert.rejects(prepareTransferValidationCaseTwelveExecution(wrongPlan, true), /execution|current|input|changed/);
      await current.bindPreparedTasks([prepared]); await input.controller.registerTasks([prepared.task]);
      const task = structuredClone(prepared.task); task.state = 'ready'; await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-C12' }); await current.preAuthor!(task, input.signal);
      task.state = 'running'; const attemptId = randomUUID(); task.attempts = [{ attemptId, sessionRef: join(input.root, 'sessions', attemptId), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
      await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-C12' });
      const session = await current.roleFactory({ role: 'coding', task, controller: input.controller, requirement: scoped.requirement, workspace: prepared.workspace, stateDirectory: join(task.attempts[0].sessionRef, 'author') });
      try {
        assert.equal(typeof configs[0].requestOutputLimit, 'function'); assert.equal(configs[0].maxOutputTokens, 65536); assert.equal(configs[0].requestTimeoutMs, 600000);
        await pi.dispatch(syntheticContext());
        assert.equal(pi.dispatches.length, 1); assert.equal(pi.dispatches[0].maxTokens, 65536); assert.equal(admissions[0].estimatedMaxCostMicroCny, 1_335_632);
        const actual = (await input.controller.read()).requests.at(-1)!.validation!; assert.equal(actual.maxOutputTokens, 65536); assert.equal(actual.inputBytes, 405672);
        assert.deepEqual(configs.map(c => JSON.parse(c.context).role), ['coding']);
      } finally { await session.close(); }
      assert.deepEqual(await readFile(receiptPath), receipt); assert.equal((await stat(receiptPath)).mtimeMs, receiptInfo.mtimeMs);
      await current.closePreparation(); current = undefined; await input.work.cancelAndDrain('SOURCE C12 owner close'); await input.controller.close();
      const activeBytes = await readFile(snapshot), active = JSON.parse(activeBytes.toString('utf8'));
      assert.equal(active.validation.cases.at(-1).quote.budgetGroup.allocatedMicroCny, first.quote.budgetGroup!.allocatedMicroCny);
      const expectedAllocated = first.quote.budgetGroup!.allocatedMicroCny + 3_000_000;
      const { validationBudgetGroup } = await import('../../src/contracts/budget.ts');
      assert.equal(validationBudgetGroup(active.ledger)!.allocatedMicroCny, expectedAllocated); assert.ok(expectedAllocated < 10_000_000);
      active.validation.cases.at(-1).quote.budgetGroup.allocatedMicroCny++; await writeFile(snapshot, JSON.stringify(active), 'utf8');
      try { await assert.rejects(entry.startTransferValidationCaseTwelve({ repository: f.repository, args: f.args, host }, true), /quote|basis|allocation|changed|Invalid|identity/i); }
      finally { await writeFile(snapshot, activeBytes); }
      const cold = await entry.startTransferValidationCaseTwelve({ repository: f.repository, args: f.args, host }, true); f.track(cold.input);
      assert.equal(cold.input.window.windowId, input.window.windowId); assert.equal(cold.input.window.deadlineAt, input.window.deadlineAt); assert.equal(prepares, 1);
      const coldScope = await stageTransferValidationCaseTwelveInput(cold.input, cold.historical, true); assert.deepEqual(coldScope.requirement, scoped.requirement);
      assert.deepEqual(await readFile(receiptPath), receipt); assert.equal((await stat(receiptPath)).mtimeMs, receiptInfo.mtimeMs);
      await cold.input.controller.stop('SOURCE C12 current task/factory/cold binding proof; no game or repair executed.');
      const after = await cold.input.controller.read();
      assert.equal(after.validation!.cases.length, 20); assert.deepEqual(after.validation!.cases.slice(0, 19), baseline.validation.cases);
      assert.deepEqual(after.ledger.entries.slice(0, baseline.ledger.entries.length), baseline.ledger.entries);
      assert.deepEqual(after.requests.slice(0, baseline.requests.length), baseline.requests); assert.deepEqual(after.tasks.slice(0, baseline.tasks.length), baseline.tasks);
      assert.deepEqual(after.ledger.allocationClosures, baseline.ledger.allocationClosures); assert.deepEqual(after.allocationClosureDecisions, baseline.allocationClosureDecisions);
      t.diagnostic('SOURCE C12 actual task/factory + Pi cap65536/request1335632 and same-window cold input passed; no build/browser/repair rerun.');
    } finally { await current?.closePreparation().catch(() => {}); await input.work.cancelAndDrain('SOURCE C12 callback cleanup'); await input.controller.close(); }
  });
});
