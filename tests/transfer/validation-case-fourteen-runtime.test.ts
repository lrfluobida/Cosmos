import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, stat, lstat, readdir, unlink, cp, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransferCaseFourteenFixture } from './validation-case-fourteen.fixture.ts';
import { deriveTransferValidationCaseFourteenDeclaration } from '../../probes/transfer/validation-case-fourteen-declaration.ts';
import { bootstrapTransferValidationCaseFourteenToolchain, stageTransferValidationCaseFourteenInput } from '../../probes/transfer/validation-case-fourteen-driver.ts';
import { prepareTransferValidationCaseFourteenExecution } from '../../probes/transfer/validation-case-fourteen-task.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { outputLimitFixture, syntheticContext } from '../providers/request-output-limit.fixture.mjs';
import { createFixedTransferValidationCaseFourteenEntry } from '../../probes/transfer/validation-case-fourteen-entry.ts';
import { createFixedTransferValidationCaseThirteenEntry } from '../../probes/transfer/validation-case-thirteen-entry.ts';
import { createFixedTransferValidationCaseSevenEntry } from '../../probes/transfer/validation-case-seven-entry.ts';
import { validationBudgetGroup, budgetCapacity } from '../../src/contracts/budget.ts';
import { verifyValidationBudgetSources } from '../../src/runtime/validation-budget.ts';

test('C14 preserves C13 history and binds its partial group envelope through real host Pi and cold input', async t => {
  await withTransferCaseFourteenFixture(t, async f => {
    assert.deepEqual(f.manifest.stages.map((stage: any) => stage.role), ['design', 'art']);
    assert.ok(f.manifest.stages.every((stage: any) => stage.task.state === 'passed'));
    assert.equal(f.manifest.captures.length, 7);
    assert.equal(f.baseline.validation.cases.length, 21); assert.equal(f.baseline.ledger.allocationDelegations.length, 13);
    assert.equal(f.baseline.ledger.allocationClosures.length, 105); assert.equal(f.baseline.allocationClosureDecisions.length, 19);
    const prior = f.baseline.requests.filter((request: any) => request.validation?.caseId === 'cos20-transfer-validation-13');
    assert.equal(prior.length, 47); assert.ok(prior.every((request: any) => request.admittedAt !== null && request.validation.purpose === 'author'));
    const entry = createFixedTransferValidationCaseFourteenEntry(f.pins);
    const snapshot = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), baseline: any = f.baseline;
    const beforeD14 = deriveTransferValidationCaseFourteenDeclaration(f.beforeFunding);
    assert.deepEqual(deriveTransferValidationCaseFourteenDeclaration(baseline), beforeD14);
    assert.equal(f.beforeFunding.ledger.contractVersion, '4.0.0'); assert.equal(baseline.ledger.contractVersion, '5.0.0');
    assert.equal(validationBudgetGroup(f.beforeFunding.ledger)!.allocatedMicroCny, 9_100_314);
    assert.equal(validationBudgetGroup(baseline.ledger)!.limitMicroCny, 11_600_314);
    assert.equal(budgetCapacity(baseline.ledger).allocatedMicroCny - budgetCapacity(f.beforeFunding.ledger).allocatedMicroCny, 1_600_314);
    assert.ok(baseline.validation.cases.slice(8).every((window: any) => window.quote.formatVersion === 'validation-case-quote-2'));
    const readD14 = fixedTransferValidationInput(beforeD14).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
    const identity = await readD14(new AbortController().signal);
    assert.equal(identity.frozenCaseInputHash, baseline.validation.cases.at(-1).quote.identity.frozenCaseInputHash);
    let prepares = 0; const host = { prepare: async () => { prepares++; }, execute: async () => { throw new Error('SOURCE no generation DAG'); } };
    async function refuse(pattern: RegExp) {
      const bytes = await readFile(snapshot), info = await stat(snapshot), files = await readdir(join(f.repository, '.cosmos'), { recursive: true });
      await assert.rejects(entry.runTransferValidationCaseFourteenWithHost({ repository: f.repository, args: f.args, host }), pattern);
      assert.equal(prepares, 0); assert.deepEqual(await readFile(snapshot), bytes); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
      assert.deepEqual(await readdir(join(f.repository, '.cosmos'), { recursive: true }), files);
      await assert.rejects(lstat(f.root), (error: any) => error.code === 'ENOENT');
    }
    await writeFile(snapshot, JSON.stringify(f.beforeFunding), 'utf8');
    try { await readD14(new AbortController().signal); await refuse(/audited ledger/); } finally { await writeFile(snapshot, original); }
    for (const previous of [createFixedTransferValidationCaseSevenEntry(f.pins).runTransferValidationCaseSevenWithHost,
      createFixedTransferValidationCaseThirteenEntry(f.pins).runTransferValidationCaseThirteenWithHost]) {
      const bytes = await readFile(snapshot), info = await stat(snapshot);
      await assert.rejects(previous({ repository: f.repository, args: f.args, host }), /audited ledger/);
      assert.equal(prepares, 0); assert.deepEqual(await readFile(snapshot), bytes); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
    }
    for (const mutate of [
      (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 1 }),
      (s: any) => { s.ledger.allocationClosures.pop(); }, (s: any) => { s.allocationClosureDecisions.pop(); },
      (s: any) => { s.validation.cases[20].repair = { taskId: 'SOURCE-old-free-repair' }; },
      (s: any) => { s.validation.cases[20].quote.declaration.grants.coding.amountMicroCny++; },
      (s: any) => { s.ledger.allocationDelegations[12].caseId = 'foreign'; },
    ]) {
      const changed = structuredClone(baseline); mutate(changed); await writeFile(snapshot, JSON.stringify(changed), 'utf8');
      try { await refuse(/unknown|reconcil|Invalid|Validation|closed|audit|allocation|repair|declaration|delegation/); } finally { await writeFile(snapshot, original); }
    }
    const lock = join(f.ledgerRoot, '.controller.lock.recovery'); await writeFile(lock, 'SOURCE unresolved owner', 'utf8');
    try { await refuse(/owner|unresolved/); } finally { await unlink(lock); }
    const manifestPath = join(f.ledgerRoot, 'cos20-transfer-validation-14-reuse.json'), manifestBytes = await readFile(manifestPath);
    await writeFile(manifestPath, '{}', 'utf8'); try { await refuse(/manifest|historical|source|stage/i); } finally { await writeFile(manifestPath, manifestBytes); }
    const closurePath = join(f.ledgerRoot, baseline.allocationClosureDecisions[18].operatorDecision.source.location), closureBytes = await readFile(closurePath);
    await writeFile(closurePath, Buffer.concat([closureBytes, Buffer.from(' ')])); try { await refuse(/closure|source|bytes/); } finally { await writeFile(closurePath, closureBytes); }
    const supplementPath = join(f.ledgerRoot, baseline.allocationSupplementDecisions[0].operatorDecision.source.location), supplementBytes = await readFile(supplementPath);
    await writeFile(supplementPath, Buffer.concat([supplementBytes, Buffer.from(' ')]));
    try { await refuse(/supplement|source|bytes/); await assert.rejects(verifyValidationBudgetSources(f.ledgerRoot, baseline), /supplement source/); }
    finally { await writeFile(supplementPath, supplementBytes); }
    const mappingPath = join(f.repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), mapping = JSON.parse(mappingBytes.toString('utf8'));
    const unrelated = await f.git('commit-tree', `${f.head}^{tree}`, '-m', 'SOURCE unrelated C14 prerequisite');
    for (const [taskId, change] of [['COS-89', { reviewStatus: 'SOURCE_NOT_READY' }], ['COS-90', { reviewStatus: 'SOURCE_NOT_READY' }],
      ['COS-89', { reviewedCommit: unrelated }], ['COS-89', { mergeCommit: unrelated }],
      ['COS-90', { reviewedCommit: unrelated }], ['COS-90', { mergeCommit: unrelated }]] as const) {
      const wrong = structuredClone(mapping); Object.assign(wrong.tasks.find((item: any) => item.taskId === taskId), change);
      await writeFile(mappingPath, JSON.stringify(wrong), 'utf8'); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE C14 refusal');
      f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
      await refuse(/COS-89|COS-90|ancestor/);
    }
    await writeFile(mappingPath, mappingBytes); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE restore C14 approvals');
    f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
    const first = await entry.preflightTransferValidationCaseFourteenRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
    assert.equal(first.paidRequests, 0); assert.equal(first.quote.declaration.limits.incrementalMicroCny, 2_500_000);
    assert.notEqual(first.quote.budgetGroup!.allocatedMicroCny, first.quote.basis.allocatedMicroCny); assert.equal(first.quote.declaration.grants.coding.amountMicroCny, 1_900_000);
    await f.costs(1_100_000);
    const alternate = JSON.parse(await readFile(snapshot, 'utf8'));
    assert.deepEqual(deriveTransferValidationCaseFourteenDeclaration(alternate), first.quote.declaration);
    const alternateBytes = await readFile(snapshot), alternateInfo = await stat(snapshot);
    await assert.rejects(f.fund(), /supplement|history/i);
    assert.deepEqual(await readFile(snapshot), alternateBytes); assert.equal((await stat(snapshot)).mtimeMs, alternateInfo.mtimeMs);
    const stale = { kind: 'operator_validation' as const, decisionId: `SOURCE-C14-stale-${randomUUID()}`, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: 'SOURCE-C14-stale', version: 'SOURCE-only', location: `SOURCE-C14-stale-${randomUUID()}.json` }, sourceRefs: [first.inheritedSource, first.admissionRef!] };
    await writeFile(join(f.ledgerRoot, stale.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...stale, source: undefined, quote: first.quote }), 'utf8');
    await assert.rejects(RunController.claimValidationCase({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader: readD14, quote: first.quote, decision: stale }), /stale|baseline|capacity|budget|quote/i);
    await writeFile(snapshot, original);
    t.diagnostic('SOURCE C14 fixed D14 before/after genuine supplement and lower-cost supplement rejection passed.');

    const pi = await outputLimitFixture(t), configs: any[] = [], admissions: any[] = [], D = deriveTransferValidationCaseFourteenDeclaration(baseline);
    const sessionFactory: any = async (config: any) => {
      configs.push(config); return pi.create({ ...config, env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' }, budget: {
        beforeRequest: async (request: any) => { admissions.push(request); await config.budget.beforeRequest(request); }, afterResponse: config.budget.afterResponse } });
    };
    const started = await entry.startTransferValidationCaseFourteen({ repository: f.repository, args: f.args, host }), input = started.input; f.track(input);
    let current: Awaited<ReturnType<typeof createTransferReusedConsumerHost>> | undefined;
    try {
      await bootstrapTransferValidationCaseFourteenToolchain(input, async (job: any) => {
        assert.equal(job.authority.taskId, D.grants.planning.taskId);
        await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
        await symlink(fileURLToPath(new URL('../../templates/2d/node_modules', import.meta.url)), join(input.root, 'toolchain/node_modules'), 'junction');
        const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
        await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
        return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'SOURCE fixed bootstrap transport', cleanup: {} };
      });
      const scoped = await stageTransferValidationCaseFourteenInput(input, started.historical);
      current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
        work: input.work, resume: false, historicalStages: started.historical, sessionFactory, io: { build: async () => { throw new Error('SOURCE no build'); }, play: async () => { throw new Error('SOURCE no browser'); } } });
      const executionInput = { state: await input.controller.read(), window: input.window, requirement: scoped.requirement, host: current,
        historical: await started.historical.verify(input.signal), root: input.root, manifestRef: started.historical.manifestRef, capability: current.capability, signal: input.signal };
      const execution = await prepareTransferValidationCaseFourteenExecution(executionInput, false), prepared = execution.tasks[0];
      const authorPath = join(prepared.workspace, 'authors/coding');
      assert.deepEqual(await readdir(authorPath).catch((error: any) => { if (error.code === 'ENOENT') return []; throw error; }), []);
      assert.equal(execution.tasks.length, 1); assert.equal(prepared.task.taskId, D.grants.coding.taskId);
      const receiptPath = join(input.root, 'execution-reused.json'), receipt = await readFile(receiptPath), receiptInfo = await stat(receiptPath);
      assert.deepEqual(await prepareTransferValidationCaseFourteenExecution(executionInput, true), execution);
      const wrongPolicy = { ...executionInput, host: { ...current, taskPolicies: structuredClone(current.taskPolicies) } }; wrongPolicy.host.taskPolicies[0].tools.pop();
      await assert.rejects(prepareTransferValidationCaseFourteenExecution(wrongPolicy, true), /execution|policy|changed/);
      const wrongPlan = { ...executionInput, host: { ...current, availableArtifacts: structuredClone(current.availableArtifacts) } }; wrongPlan.host.availableArtifacts.at(-1)!.version = 'SOURCE-wrong-plan';
      await assert.rejects(prepareTransferValidationCaseFourteenExecution(wrongPlan, true), /execution|current|input|changed/);
      await current.bindPreparedTasks([prepared]); await input.controller.registerTasks([prepared.task]);
      const task = structuredClone(prepared.task); task.state = 'ready'; await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-C14' }); await current.preAuthor!(task, input.signal);
      task.state = 'running'; const attemptId = randomUUID(); task.attempts = [{ attemptId, sessionRef: join(input.root, 'sessions', attemptId), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
      await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-C14' });
      const session = await current.roleFactory({ role: 'coding', task, controller: input.controller, requirement: scoped.requirement, workspace: prepared.workspace, stateDirectory: join(task.attempts[0].sessionRef, 'author') });
      try {
        assert.equal(typeof configs[0].requestOutputLimit, 'function'); assert.equal(configs[0].maxOutputTokens, 65536); assert.equal(configs[0].requestTimeoutMs, 600000);
        await pi.dispatch(syntheticContext());
        assert.equal(pi.dispatches.length, 1); assert.equal(pi.dispatches[0].maxTokens, 65536); assert.equal(admissions[0].estimatedMaxCostMicroCny, 1_335_632);
        const actual = (await input.controller.read()).requests.at(-1)!.validation!; assert.equal(actual.maxOutputTokens, 65536); assert.equal(actual.inputBytes, 405672);
        assert.deepEqual(configs.map(c => JSON.parse(c.context).role), ['coding']);
      } finally { await session.close(); }
      assert.deepEqual(await readFile(receiptPath), receipt); assert.equal((await stat(receiptPath)).mtimeMs, receiptInfo.mtimeMs);
      await current.closePreparation(); current = undefined; await input.work.cancelAndDrain('SOURCE C14 owner close'); await input.controller.close();
      const activeBytes = await readFile(snapshot), active = JSON.parse(activeBytes.toString('utf8'));
      assert.equal(active.validation.cases.at(-1).quote.budgetGroup.allocatedMicroCny, first.quote.budgetGroup!.allocatedMicroCny);
      const expectedAllocated = first.quote.budgetGroup!.allocatedMicroCny + 2_500_000;
      const { validationBudgetGroup } = await import('../../src/contracts/budget.ts');
      assert.equal(validationBudgetGroup(active.ledger)!.allocatedMicroCny, expectedAllocated); assert.equal(expectedAllocated, 11_600_314);
      active.validation.cases.at(-1).quote.budgetGroup.allocatedMicroCny++; await writeFile(snapshot, JSON.stringify(active), 'utf8');
      try { await assert.rejects(entry.startTransferValidationCaseFourteen({ repository: f.repository, args: f.args, host }, true), /quote|basis|allocation|changed|Invalid|identity/i); }
      finally { await writeFile(snapshot, activeBytes); }
      const cold = await entry.startTransferValidationCaseFourteen({ repository: f.repository, args: f.args, host }, true); f.track(cold.input);
      assert.equal(cold.input.window.windowId, input.window.windowId); assert.equal(cold.input.window.deadlineAt, input.window.deadlineAt); assert.equal(prepares, 1);
      const coldScope = await stageTransferValidationCaseFourteenInput(cold.input, cold.historical, true); assert.deepEqual(coldScope.requirement, scoped.requirement);
      assert.deepEqual(deriveTransferValidationCaseFourteenDeclaration(await cold.input.controller.read()), beforeD14);
      await writeFile(supplementPath, Buffer.concat([supplementBytes, Buffer.from(' ')]));
      try { await assert.rejects(stageTransferValidationCaseFourteenInput(cold.input, cold.historical, true), /supplement|source/i); }
      finally { await writeFile(supplementPath, supplementBytes); }
      assert.deepEqual(await readFile(receiptPath), receipt); assert.equal((await stat(receiptPath)).mtimeMs, receiptInfo.mtimeMs);
      await cold.input.controller.stop('SOURCE C14 current task/factory/cold binding proof; no game or repair executed.');
      const after = await cold.input.controller.read();
      assert.equal(after.validation!.cases.length, 22); assert.deepEqual(after.validation!.cases.slice(0, 21), baseline.validation.cases);
      assert.deepEqual(after.ledger.entries.slice(0, baseline.ledger.entries.length), baseline.ledger.entries);
      assert.deepEqual(after.requests.slice(0, baseline.requests.length), baseline.requests); assert.deepEqual(after.tasks.slice(0, baseline.tasks.length), baseline.tasks);
      assert.deepEqual(after.ledger.allocationClosures, baseline.ledger.allocationClosures); assert.deepEqual(after.allocationClosureDecisions, baseline.allocationClosureDecisions);
      t.diagnostic('SOURCE C14 actual task/factory + Pi cap65536/request1335632 and same-window cold input passed; no build/browser/repair rerun.');
    } finally { await current?.closePreparation().catch(() => {}); await input.work.cancelAndDrain('SOURCE C14 callback cleanup'); await input.controller.close(); }
  });
});

test('C14 supplement finance negatives and authenticated report limit reuse settled SOURCE history', async t => {
  await withTransferCaseFourteenFixture(t, async f => {
    const entry = createFixedTransferValidationCaseFourteenEntry(f.pins), snapshot = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(snapshot);
    const D = deriveTransferValidationCaseFourteenDeclaration(f.beforeFunding);
    assert.deepEqual(deriveTransferValidationCaseFourteenDeclaration(f.baseline), D);
    assert.equal(validationBudgetGroup(f.beforeFunding.ledger)!.allocatedMicroCny, 9_100_314);
    assert.equal(validationBudgetGroup(f.baseline.ledger)!.limitMicroCny, 11_600_314);
    assert.equal(budgetCapacity(f.baseline.ledger).allocatedMicroCny - budgetCapacity(f.beforeFunding.ledger).allocatedMicroCny, 1_600_314);
    assert.ok(f.baseline.validation.cases.slice(8).every((window: any) => window.quote.formatVersion === 'validation-case-quote-2'));
    const read = fixedTransferValidationInput(D).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
    let prepares = 0; const inert = { prepare: async () => { prepares++; }, execute: async () => { throw new Error('SOURCE no author'); } };
    await writeFile(snapshot, JSON.stringify(f.beforeFunding), 'utf8');
    try {
      const bytes = await readFile(snapshot), info = await stat(snapshot), identity = await read(new AbortController().signal);
      assert.equal(identity.frozenCaseInputHash, f.beforeFunding.validation.cases.at(-1).quote.identity.frozenCaseInputHash);
      await assert.rejects(entry.runTransferValidationCaseFourteenWithHost({ repository: f.repository, args: f.args, host: inert }), /audited ledger/);
      assert.equal(prepares, 0); assert.deepEqual(await readFile(snapshot), bytes); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
    } finally { await writeFile(snapshot, original); }
    for (const old of [createFixedTransferValidationCaseSevenEntry(f.pins).runTransferValidationCaseSevenWithHost,
      createFixedTransferValidationCaseThirteenEntry(f.pins).runTransferValidationCaseThirteenWithHost]) {
      const bytes = await readFile(snapshot), info = await stat(snapshot);
      await assert.rejects(old({ repository: f.repository, args: f.args, host: inert }), /audited ledger/);
      assert.equal(prepares, 0); assert.deepEqual(await readFile(snapshot), bytes); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
    }
    const supplement = join(f.ledgerRoot, f.baseline.allocationSupplementDecisions[0].operatorDecision.source.location), supplementBytes = await readFile(supplement), supplementInfo = await stat(supplement);
    await writeFile(supplement, Buffer.concat([supplementBytes, Buffer.from(' ')]));
    try {
      await assert.rejects(entry.runTransferValidationCaseFourteenWithHost({ repository: f.repository, args: f.args, host: inert }), /supplement|source/i);
      await assert.rejects(verifyValidationBudgetSources(f.ledgerRoot, f.baseline), /supplement source/);
      assert.equal(prepares, 0); assert.deepEqual(await readFile(snapshot), original);
    } finally { await writeFile(supplement, supplementBytes); await import('node:fs/promises').then(fs => fs.utimes(supplement, supplementInfo.atimeMs / 1000, supplementInfo.mtimeMs / 1000)); }
    for (const mutate of [(s: any) => { s.ledger.allocationSupplements[0].targetCaseId = 'cos20-transfer-validation-15'; },
      (s: any) => { s.ledger.allocationSupplements[0].grants.coding.amountMicroCny++; }]) {
      const wrong = structuredClone(f.baseline); mutate(wrong); await writeFile(snapshot, JSON.stringify(wrong), 'utf8');
      try { await assert.rejects(entry.runTransferValidationCaseFourteenWithHost({ repository: f.repository, args: f.args, host: inert }), /Invalid|supplement|allocation/i); assert.equal(prepares, 0); }
      finally { await writeFile(snapshot, original); }
    }
    const first = await entry.preflightTransferValidationCaseFourteenRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
    assert.equal(first.quote.formatVersion, 'validation-case-quote-3'); assert.equal(first.quote.budgetGroup!.supplement!.limitMicroCny, 11_600_314);
    await f.costs(1_100_000); assert.deepEqual(deriveTransferValidationCaseFourteenDeclaration(JSON.parse(await readFile(snapshot, 'utf8'))), D);
    const alternate = await readFile(snapshot), alternateInfo = await stat(snapshot); await assert.rejects(f.fund(), /supplement|history/i);
    assert.deepEqual(await readFile(snapshot), alternate); assert.equal((await stat(snapshot)).mtimeMs, alternateInfo.mtimeMs);
    const stale = { kind: 'operator_validation' as const, decisionId: `SOURCE-C14-stale-${randomUUID()}`, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: 'SOURCE-C14-stale', version: 'SOURCE-only', location: `SOURCE-C14-stale-${randomUUID()}.json` }, sourceRefs: [first.inheritedSource, first.admissionRef!] };
    await writeFile(join(f.ledgerRoot, stale.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...stale, source: undefined, quote: first.quote }), 'utf8');
    await assert.rejects(RunController.claimValidationCase({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader: read, quote: first.quote, decision: stale }), /stale|baseline|capacity|budget|quote/i);
    await writeFile(snapshot, original);
    const report = await entry.runTransferValidationCaseFourteenWithHost({ repository: f.repository, args: f.args, host: {
      prepare: async () => { prepares++; }, execute: async input => {
        let workers = 0;
        await writeFile(supplement, Buffer.concat([supplementBytes, Buffer.from(' ')]));
        try { await assert.rejects(bootstrapTransferValidationCaseFourteenToolchain(input, async () => { workers++; throw new Error('Unexpected worker dispatch'); }), /supplement|source/i); assert.equal(workers, 0); }
        finally { await writeFile(supplement, supplementBytes); }
        const task = structuredClone(f.baseline.tasks.at(-1));
        task.taskId = D.grants.coding.taskId; task.context.contextId = 'SOURCE-C14-report-context'; task.budget.allocationMicroCny = D.grants.coding.amountMicroCny;
        await input.controller.registerTasks([task]);
        await input.controller.reserve({ requestId: 'SOURCE-C14-cross-old-limit', taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 1_000_000,
          validation: { caseId: D.caseId, windowId: input.window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 2000, inputBytes: 0, hasImages: false } });
        await input.controller.admit('SOURCE-C14-cross-old-limit');
        await input.controller.settle('SOURCE-C14-cross-old-limit', 1_000_000, [{ artifactId: 'SOURCE-C14-cross-old-limit', version: 'SOURCE-only', location: 'SOURCE accounting; no SDK or game' }]);
        return { outcome: 'failed', gaps: ['SOURCE report-limit representative; no game execution.'] };
      },
    } });
    assert.ok('budgetGroup' in report); assert.ok(report.budgetGroup.current!.committedMicroCny > 10_000_000);
    assert.equal(report.budgetGroup.current!.limitMicroCny, 11_600_314); assert.ok(!report.gaps.includes('Applicable fee limits were exceeded.'));
    await writeFile(join(f.archive, 'report-above-old-capacity.json'), JSON.stringify(report));
    t.diagnostic('SOURCE C14 missing finance/source negatives, fixed identity bootstrap and >10m report guard passed; no host positive repeated.');
  });
});
