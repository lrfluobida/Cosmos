import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixedTransferValidationCaseSevenEntry } from '../../probes/transfer/validation-case-seven-entry.ts';
import { TRANSFER_CASE_SEVEN_HISTORICAL_SOURCE } from '../../probes/transfer/validation-case-seven-run.ts';
import { transferCaseSevenFixture, loadTransferCaseSevenCheckpoint } from './validation-case-seven.fixture.ts';
import { readFile, cp, mkdir, writeFile, stat, unlink, lstat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { syntheticTransferSessions } from './validation-case-six-stages.fixture.ts';
import { syntheticReports } from './passed-stage-reuse-reports.fixture.ts';
import { prepareTransferValidationCaseSevenExecution } from '../../probes/transfer/validation-case-seven-task.ts';
import { stageTransferValidationCaseSevenInput, bootstrapTransferValidationCaseSevenToolchain, executeTransferValidationCaseSevenDag } from '../../probes/transfer/validation-case-seven-driver.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validationBudgetGroup } from '../../src/contracts/budget.ts';
import { deriveTransferValidationCaseSevenDeclaration } from '../../probes/transfer/validation-case-seven-declaration.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';

test('fixed C7 atomically claims original remainder, reopens its own pending coding repair and promotes current v2 through the real driver', async t => {
  const evidenceContext = { after: () => {}, diagnostic: t.diagnostic.bind(t) } as any;
  const f = process.env.COS60_SOURCE_CHECKPOINT_SEED ? await loadTransferCaseSevenCheckpoint(process.env.COS60_SOURCE_CHECKPOINT_SEED) : await transferCaseSevenFixture(evidenceContext);
  const first = f.baseline.validation!.cases[8], source = f.baseline.validation!.cases[12];
  const D = deriveTransferValidationCaseSevenDeclaration(f.baseline);
  t.diagnostic(`SOURCE/TEMP C7 proof retained at ${f.repository}`);
  const entry = createFixedTransferValidationCaseSevenEntry({ reviewedPlatformSha: source.quote.identity.reviewedPlatformSha, windowId: source.windowId,
    parentAllocation: first.quote.budgetGroup.parentAllocation, authorizationDecisionId: first.operatorDecision.decisionId });
  const snapshot = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), base: any = f.baseline;
  async function refuse(pattern: RegExp) {
    const bytes = await readFile(snapshot), info = await stat(snapshot);
    await assert.rejects(entry.preflightTransferValidationCaseSevenRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), pattern);
    assert.deepEqual(await readFile(snapshot), bytes); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
    await assert.rejects(lstat(f.root), (error: any) => error.code === 'ENOENT');
    await assert.rejects(lstat(join(f.ledgerRoot, `${D.caseId}.json`)), (error: any) => error.code === 'ENOENT');
  }
  for (const mutate of [
    (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 974882, settledMicroCny: 0 }),
    (s: any) => { s.allocationClosureDecisions.pop(); },
    (s: any) => { s.validation.cases[13].stopReason = null; },
    (s: any) => { s.ledger.allocationDelegations[5].caseId = 'cos20-foreign'; },
    (s: any) => { s.validation.cases[8].quote.budgetGroup.parentAllocation.index = 4; },
    (s: any) => { s.ledger.entries.at(-1).taskId = s.validation.cases[13].quote.declaration.grants.design.taskId; },
  ]) { const changed = structuredClone(base); mutate(changed); await writeFile(snapshot, JSON.stringify(changed), 'utf8'); try { await refuse(/unknown|reconcil|Invalid|Validation|group|snapshot|delegation|declaration|costs/); } finally { await writeFile(snapshot, original); } }
  for (const guard of [join(f.ledgerRoot, '.controller.lock.recovery'), join(f.passed!.root, 'registry/.commit.lock.recovery')]) {
    await writeFile(guard, 'SOURCE unresolved owner', 'utf8'); await refuse(/ownership|owner|unresolved/); await unlink(guard);
  }
  const mappingPath = join(f.repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), approved = JSON.parse(mappingBytes.toString('utf8'));
  const unrelated = await f.git('commit-tree', `${f.head}^{tree}`, '-m', 'SOURCE unrelated reviewed source');
  for (const [taskId, change] of [['COS-57', { reviewStatus: 'READY' }], ['COS-59', { reviewStatus: 'SOURCE_NOT_READY' }], ['COS-57', { reviewedCommit: unrelated }], ['COS-59', { mergeCommit: unrelated }]] as const) {
    const mapping = structuredClone(approved); Object.assign(mapping.tasks.find((item: any) => item.taskId === taskId), change);
    await writeFile(mappingPath, JSON.stringify(mapping), 'utf8'); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE admission refusal');
    f.head = await f.git('rev-parse', 'HEAD'); await f.git('update-ref', 'refs/remotes/origin/main', f.head);
    await refuse(/COS-57|COS-59|ancestor/);
  }
  await writeFile(mappingPath, mappingBytes); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE restore exact reviewed approvals');
  f.head = await f.git('rev-parse', 'HEAD'); await f.git('update-ref', 'refs/remotes/origin/main', f.head); f.args[1] = f.head;
  const amountQuote = await entry.preflightTransferValidationCaseSevenRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  const last = base.allocationClosureDecisions.at(-1), changed = structuredClone(base), final = changed.ledger.entries.at(-1);
  final.settledMicroCny += 250000; final.evidence.push({ artifactId: 'SOURCE-C6-second-actual-cost', version: 'SOURCE-450000', location: 'SOURCE-only-second-financial-variant.json' });
  changed.ledger.allocationClosures.splice(-5); changed.allocationClosureDecisions.pop();
  changed.events = changed.events.filter((event: any) => !(event.type === 'validation_allocation_closed' && event.reason.includes(last.operatorDecision.decisionId)));
  changed.events.forEach((event: any, i: number) => { event.sequence = i + 1; }); changed.revision = last.quote.basis.revision;
  changed.run.fees.settledMicroCny += 250000; validateSnapshot(changed); await writeFile(snapshot, JSON.stringify(changed, null, 2) + '\n', 'utf8');
  const identityReader = fixedTransferValidationInput(changed.validation!.cases[13].quote.declaration).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const closure = await prepareValidationAllocationClosure({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader, caseIds: [changed.validation!.currentCaseId] });
  const costDecision = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'SOURCE-C6-second-cost-closure', actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
    source: { artifactId: 'SOURCE-second-closure', version: 'v1', location: 'SOURCE-C6-second-cost-closure.json' }, sourceRefs: [{ artifactId: 'SOURCE-second-cost', version: 'SOURCE-450000', location: 'SOURCE-only-second-financial-variant.json' }] };
  await writeFile(join(f.ledgerRoot, costDecision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...costDecision, source: undefined, quote: closure }), 'utf8');
  await applyValidationAllocationClosure({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader, quote: closure, decision: costDecision });
  const secondQuote = await entry.preflightTransferValidationCaseSevenRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(secondQuote.quote.declaration.grants.coding.amountMicroCny, amountQuote.quote.declaration.grants.coding.amountMicroCny - 250000);
  assert.notEqual(secondQuote.admissionRef!.version, amountQuote.admissionRef!.version); assert.notEqual(secondQuote.quote.quoteId, amountQuote.quote.quoteId);
  const oldDecision = { kind: 'operator_validation' as const, decisionId: 'SOURCE-stale-C7-quote', actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
    source: { artifactId: 'SOURCE-stale-operator', version: 'v1', location: 'SOURCE-stale-C7-quote.json' }, sourceRefs: [amountQuote.inheritedSource, amountQuote.admissionRef!] };
  await writeFile(join(f.ledgerRoot, oldDecision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...oldDecision, source: undefined, quote: amountQuote.quote }), 'utf8');
  await assert.rejects(RunController.claimValidationCase({ root: f.ledgerRoot, repositoryRoot: f.repository, identityReader: fixedTransferValidationInput(D).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head }), quote: amountQuote.quote, decision: oldDecision }), /stale|baseline|capacity|budget/);
  await writeFile(snapshot, original); assert.equal(validationHash(await readFile(snapshot)), validationHash(original));
  t.diagnostic('SOURCE/TEMP readonly history/owner/source refusals and two valid14-case financial quotes verified; stale amount quote refused.');
  const manifest = await readFile(join(f.ledgerRoot, 'cos20-transfer-validation-7-reuse.json')), oldOrigin = await readFile(join(f.passed!.root, `journal/task-${f.passed!.result[0].taskId}/origin.json`));
  const ready = await entry.preflightTransferValidationCaseSevenRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(ready.quote.budgetGroup!.availableAllocationMicroCny, Object.values(D.grants).reduce((sum, grant) => sum + grant.amountMicroCny, 0)); assert.equal(ready.paidRequests, 0);
  let hostPreparation = 0, bootstraps = 0; const calls: Parameters<typeof syntheticTransferSessions>[0] = [], nativeTransport = syntheticTransferSessions(calls);
  const sessionFactory = async (config: any) => {
    const packet = JSON.parse(config.context), window = await config.requestWindow();
    assert.equal(config.requestTimeoutMs, packet.role === 'coding' ? 600000 : 120000);
    assert.equal(window.cleanupMs, 5000);
    return nativeTransport(config);
  };
  const transport = { async build(project: string, taskId: string) {
    if (taskId === D.grants.coding.taskId) return { passed: false, work: project, diagnostics: 'SOURCE current generated defect', results: [{ code: 1, stdout: 'src/main.ts(1,1): error TS2322: synthetic fixture', stderr: '' }] };
    await mkdir(join(project, 'dist')); await cp(join(project, 'public/assets'), join(project, 'dist/assets'), { recursive: true }); await writeFile(join(project, 'dist/index.html'), '<p>SOURCE transport</p>', 'utf8');
    return { passed: true, work: project, diagnostics: 'SOURCE transport', results: [{ code: 0, stdout: '', stderr: '' }, { code: 0, stdout: '', stderr: '' }] };
  }, async play() { throw new Error('Persistent adapter required'); }, playPersistent: (series: any, options: any) => syntheticReports(series, options) };
  const host = { prepare: async () => { hostPreparation++; }, execute: async (input: any, historical: any, resume: boolean) => {
    assert.equal(resume, true);
    const scoped = await stageTransferValidationCaseSevenInput(input, historical, true);
    const current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
      work: input.work, resume: true, historicalStages: historical, sessionFactory, io: transport });
    return executeTransferValidationCaseSevenDag(input, scoped.requirement, scoped.binding, current, historical, true);
  } };
  const started = await entry.startTransferValidationCaseSeven({ repository: f.repository, args: f.args, host });
  const input = started.input, deadline = input.window.deadlineAt;
  try {
    await bootstrapTransferValidationCaseSevenToolchain(input, async (job: any) => {
      bootstraps++; assert.equal(job.authority.taskId, D.grants.planning.taskId); const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
      await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
      await symlink(fileURLToPath(new URL('../../templates/2d/node_modules', import.meta.url)), join(input.root, 'toolchain/node_modules'), 'junction');
      await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
      return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'SOURCE transport', cleanup: {} };
    });
    const scoped = await stageTransferValidationCaseSevenInput(input, started.historical);
    const current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
      work: input.work, resume: false, historicalStages: started.historical, sessionFactory, io: transport });
    const inherited = await started.historical.verify(input.signal), execution = await prepareTransferValidationCaseSevenExecution({ state: await input.controller.read(),
      window: input.window, requirement: scoped.requirement, host: current, historical: inherited, root: input.root, manifestRef: started.historical.manifestRef, capability: current.capability, signal: input.signal }, false);
    const prepared = execution.tasks[0]; await current.bindPreparedTasks([prepared]);
    const recovery = { artifactRoot: input.root, journalRoot: join(input.root, 'journal'), recoverCapture: current.recoverCapture };
    const failed = await executeTaskDag({ controller: input.controller, requirement: scoped.requirement, validation: scoped.binding, historicalDependencies: started.historical,
      tasks: [prepared], sessionRoot: join(input.root, 'sessions'), availableArtifacts: current.availableArtifacts, roleFactory: current.roleFactory, preAuthor: current.preAuthor,
      capture: current.capture, verify: current.verify, reviewImages: current.reviewImages, diagnoseFailure: current.diagnoseFailure, recovery,
      reviewProtocolCorrections: 1, authorProtocolCorrections: 1, codingHandoffClarifications: 1, hostEvidencedCodingHandoff: 1 });
    assert.equal(failed[0].state, 'failed'); assert.equal(failed[0].attempts[0].failure!.classification, 'code_defect');
    const feedback = JSON.parse(await readFile(join(failed[0].attempts[0].sessionRef, 'failure.json'), 'utf8'));
    const repair = await current.prepareValidationRepair({ ...prepared, task: failed[0] }, feedback, recovery); await current.bindPreparedTasks([repair]);
    assert.equal(repair.task.taskId, D.grants.repair.taskId); await assert.rejects(current.prepareValidationRepair({ ...prepared, task: failed[0] }, feedback, recovery), /claimed|already/);
    await current.closePreparation(); await input.work.cancelAndDrain('SOURCE cold owner closed'); await input.controller.close();
  } catch (error) { await input.work.cancelAndDrain('SOURCE setup failed').catch(() => {}); await input.controller.close().catch(() => {}); throw error; }
  const beforeResume = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  const result: any = await entry.runTransferValidationCaseSevenWithHost({ repository: f.repository, args: f.args, host });
  if (result.outcome !== 'passed') t.diagnostic(JSON.stringify({ tasks: result.tasks?.map((task: any) => ({ taskId: task.taskId, state: task.state, failure: task.attempts.at(-1)?.failure })), calls: calls.map(call => ({ role: call.role, taskId: call.taskId })) }));
  assert.equal(result.outcome, 'passed', JSON.stringify(result.gaps)); assert.equal(result.accepted.version, 'v2'); assert.equal(result.windowId, input.window.windowId); assert.equal(result.deadlineAt, deadline);
  assert.equal(hostPreparation, 1); assert.equal(bootstraps, 1); assert.deepEqual(calls.map(call => call.role), ['coding', 'coding', 'reviewer']);
  assert.ok(calls.filter(call => call.role === 'coding').every(call => call.tools.includes('check-game-build')));
  const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(after.validation.cases.length, 15); assert.equal(after.ledger.allocationDelegations.length, 7);
  assert.deepEqual(after.validation.cases.slice(0, 14), f.baseline.validation.cases); assert.deepEqual(after.allocationClosureDecisions, f.baseline.allocationClosureDecisions);
  assert.deepEqual(after.ledger.allocationClosures, f.baseline.ledger.allocationClosures); assert.deepEqual(after.tasks.filter((task: any) => task.taskId.startsWith(source.caseId)), f.baseline.tasks.filter((task: any) => task.taskId.startsWith(source.caseId)));
  assert.deepEqual(after.ledger.entries.slice(0, f.baseline.ledger.entries.length), f.baseline.ledger.entries);
  assert.deepEqual(after.ledger.allocations, beforeResume.ledger.allocations); assert.deepEqual(after.ledger.allocationDelegations, beforeResume.ledger.allocationDelegations);
  assert.equal(after.run.originalStartedAt, f.baseline.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, f.baseline.run.originalDeadlineAt);
  assert.equal(validationBudgetGroup(after.ledger)!.allocatedMicroCny, 10000000);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'cos20-transfer-validation-7-reuse.json')), manifest); assert.deepEqual(await readFile(join(f.passed!.root, `journal/task-${f.passed!.result[0].taskId}/origin.json`)), oldOrigin);
  await assert.rejects(entry.runTransferValidationCaseSevenWithHost({ repository: f.repository, args: f.args, host }), /same active|stopped|resume/i);
  assert.equal(hostPreparation, 1); assert.equal(bootstraps, 1);
});
