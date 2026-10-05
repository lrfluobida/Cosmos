import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixedTransferValidationCaseSixEntry } from '../../probes/transfer/validation-case-six-entry.ts';
import { TRANSFER_CASE_SIX_HISTORICAL_SOURCE } from '../../probes/transfer/validation-case-six-run.ts';
import { transferCaseSixFixture } from './validation-case-six.fixture.ts';
import { readFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { syntheticTransferSessions } from './validation-case-six-stages.fixture.ts';
import { syntheticReports } from './passed-stage-reuse-reports.fixture.ts';
import { prepareTransferValidationCaseSixExecution } from '../../probes/transfer/validation-case-six-task.ts';
import { stageTransferValidationCaseSixInput, bootstrapTransferValidationCaseSixToolchain, executeTransferValidationCaseSixDag } from '../../probes/transfer/validation-case-six-driver.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validationBudgetGroup } from '../../src/contracts/budget.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D } from '../../probes/transfer/validation-case-six-declaration.ts';

test('fixed case6 entry exposes only its trusted assembly and native runtime consumer', async () => {
  const entry: any = createFixedTransferValidationCaseSixEntry(TRANSFER_CASE_SIX_HISTORICAL_SOURCE);
  assert.equal(typeof entry.startTransferValidationCaseSix, 'function', 'Atomic fixed C6 startup is missing.');
  assert.equal(typeof entry.runTransferValidationCaseSixWithHost, 'function', 'C6 current-window run/resume is missing.');
  const driver: any = await import('../../probes/transfer/validation-case-six-driver.ts');
  assert.equal(typeof driver.executeTransferValidationCaseSixDag, 'function', 'Actual C6 reused consumer DAG is missing.');
  await assert.rejects(entry.startTransferValidationCaseSix({ repository: 'SOURCE nonexistent', args: ['--validation-preflight', 'a'.repeat(40)],
    host: { prepare: async () => {}, execute: async () => { throw new Error('Must not execute'); } } }), /case intent/);
});

test('fixed C6 atomically claims original remainder, reopens its own pending coding repair and promotes current v2 through the real driver', async t => {
  const f = await transferCaseSixFixture(t, undefined, true), first = f.baseline.validation.cases[8], source = f.baseline.validation.cases[12];
  const entry = createFixedTransferValidationCaseSixEntry({ reviewedPlatformSha: source.quote.identity.reviewedPlatformSha, windowId: source.windowId,
    parentAllocation: first.quote.budgetGroup.parentAllocation, authorizationDecisionId: first.operatorDecision.decisionId });
  const manifest = await readFile(join(f.ledgerRoot, 'cos20-transfer-validation-6-reuse.json')), oldOrigin = await readFile(join(f.passed!.root, `journal/task-${f.passed!.result[0].taskId}/origin.json`));
  const ready = await entry.preflightTransferValidationCaseSixRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(ready.quote.budgetGroup!.availableAllocationMicroCny, 8477893); assert.equal(ready.paidRequests, 0);
  let hostPreparation = 0, bootstraps = 0; const calls: Parameters<typeof syntheticTransferSessions>[0] = [], sessionFactory = syntheticTransferSessions(calls);
  const transport = { async build(project: string, taskId: string) {
    if (taskId === D.grants.coding.taskId) return { passed: false, work: project, diagnostics: 'SOURCE current generated defect', results: [{ code: 1, stdout: 'src/main.ts(1,1): error TS2322: synthetic fixture', stderr: '' }] };
    await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), '<p>SOURCE transport</p>', 'utf8');
    return { passed: true, work: project, diagnostics: 'SOURCE transport', results: [{ code: 0, stdout: '', stderr: '' }, { code: 0, stdout: '', stderr: '' }] };
  }, async play() { throw new Error('Persistent adapter required'); }, playPersistent: (series: any, options: any) => syntheticReports(series, options) };
  const host = { prepare: async () => { hostPreparation++; }, execute: async (input: any, historical: any, resume: boolean) => {
    assert.equal(resume, true);
    const scoped = await stageTransferValidationCaseSixInput(input, historical, true);
    const current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
      work: input.work, resume: true, historicalStages: historical, sessionFactory, io: transport });
    return executeTransferValidationCaseSixDag(input, scoped.requirement, scoped.binding, current, historical, true);
  } };
  const started = await entry.startTransferValidationCaseSix({ repository: f.repository, args: f.args, host });
  const input = started.input, deadline = input.window.deadlineAt;
  try {
    await bootstrapTransferValidationCaseSixToolchain(input, async (job: any) => {
      bootstraps++; assert.equal(job.authority.taskId, D.grants.planning.taskId); const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
      await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
      await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
      return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'SOURCE transport', cleanup: {} };
    });
    const scoped = await stageTransferValidationCaseSixInput(input, started.historical);
    const current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
      work: input.work, resume: false, historicalStages: started.historical, sessionFactory, io: transport });
    const inherited = await started.historical.verify(input.signal), execution = await prepareTransferValidationCaseSixExecution({ state: await input.controller.read(),
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
  const result: any = await entry.runTransferValidationCaseSixWithHost({ repository: f.repository, args: f.args, host });
  if (result.outcome !== 'passed') t.diagnostic(JSON.stringify({ tasks: result.tasks?.map((task: any) => ({ taskId: task.taskId, state: task.state, failure: task.attempts.at(-1)?.failure })), calls: calls.map(call => ({ role: call.role, taskId: call.taskId })) }));
  assert.equal(result.outcome, 'passed', JSON.stringify(result.gaps)); assert.equal(result.accepted.version, 'v2'); assert.equal(result.windowId, input.window.windowId); assert.equal(result.deadlineAt, deadline);
  assert.equal(hostPreparation, 1); assert.equal(bootstraps, 1); assert.deepEqual(calls.map(call => call.role), ['coding', 'coding', 'reviewer']);
  assert.ok(calls.filter(call => call.role === 'coding').every(call => call.tools.includes('check-game-build')));
  const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(after.validation.cases.length, 14); assert.equal(after.ledger.allocationDelegations.length, 6);
  assert.deepEqual(after.validation.cases.slice(0, 13), f.baseline.validation.cases); assert.deepEqual(after.allocationClosureDecisions, f.baseline.allocationClosureDecisions);
  assert.deepEqual(after.ledger.allocationClosures, f.baseline.ledger.allocationClosures); assert.deepEqual(after.tasks.filter((task: any) => task.taskId.startsWith(source.caseId)), f.baseline.tasks.filter((task: any) => task.taskId.startsWith(source.caseId)));
  assert.deepEqual(after.ledger.entries.slice(0, f.baseline.ledger.entries.length), f.baseline.ledger.entries);
  assert.deepEqual(after.ledger.allocations, beforeResume.ledger.allocations); assert.deepEqual(after.ledger.allocationDelegations, beforeResume.ledger.allocationDelegations);
  assert.equal(after.run.originalStartedAt, f.baseline.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, f.baseline.run.originalDeadlineAt);
  assert.equal(validationBudgetGroup(after.ledger)!.allocatedMicroCny, 10000000);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'cos20-transfer-validation-6-reuse.json')), manifest); assert.deepEqual(await readFile(join(f.passed!.root, `journal/task-${f.passed!.result[0].taskId}/origin.json`)), oldOrigin);
  await assert.rejects(entry.runTransferValidationCaseSixWithHost({ repository: f.repository, args: f.args, host }), /same active|stopped|resume/i);
  assert.equal(hostPreparation, 1); assert.equal(bootstraps, 1);
});
