import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { transferValidationFixture } from './validation-run.fixture.ts';
import { runTransferValidationWithHost } from '../../probes/transfer/validation-run.ts';
import { TRANSFER_VALIDATION_CASE as D } from '../../probes/transfer/validation-declaration.ts';
import { createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import type { TaskContract, ArtifactReference } from '../../src/contracts/index.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { RoleFactory } from '../../src/roles/factory.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';

async function api() {
  const module: any = await import('../../probes/transfer/validation-driver.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  assert.equal(typeof module.bootstrapTransferToolchain, 'function', 'COS43 fixed native bootstrap and assembly are missing'); return module;
}
async function bootstrap(a: any, input: any, calls: any[]) {
  return a.bootstrapTransferToolchain(input, async (job: any) => {
    calls.push(job);
    const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
    assert.equal(request.operation, 'bootstrap'); assert.equal(request.formatVersion, 'validation-worker-1');
    assert.equal(request.root, input.root); assert.equal(request.repository, input.repository);
    await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
    await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
    return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'OFFLINE worker transport only', cleanup: {} };
  });
}
test('the preparation envelope drains a fixed-scope rejection before planning can start', async () => {
  const a = await api(); let entered = false, closed = false;
  const host = { withPreparation: async (operation: () => Promise<unknown>) => { entered = true; try { return await operation(); } finally { closed = true; } } };
  const input = { repository: 'E:/offline-only', root: 'E:/offline-only/incorrect-root', ledgerRoot: 'E:/offline-only/.cosmos/validation-shared',
    controller: { requireValidationCase() {} }, signal: new AbortController().signal, window: { caseId: D.caseId, windowId: 'offline', quote: { declaration: D } } };
  await assert.rejects(a.executeTransferValidationDag(input, {}, {}, host), /fixed|roots/i);
  assert.equal(entered, true); assert.equal(closed, true);
});
test('bootstrap binds the new planning grant and fixed worker, then authenticates exact preparation input and operator bytes', async t => {
  const a = await api(), f = await transferValidationFixture(t), calls: any[] = []; let completed = false;
  await runTransferValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    try {
    await bootstrap(a, input, calls);
    assert.equal(calls.length, 1); assert.deepEqual(calls[0].authority, { caseId: D.caseId, windowId: input.window.windowId, taskId: D.grants.planning.taskId, deadlineAt: input.window.deadlineAt });
    assert.ok(calls[0].args.some((arg: string) => arg.endsWith('validation-worker.ts')));
    const { requirement, binding } = await a.stageTransferValidationInput(input);
    assert.equal(requirement.validation.caseId, D.caseId); assert.ok(!('confirmedBy' in requirement));
    assert.deepEqual((await binding.readScope(input.signal)).requirement, requirement);
    const before = await readFile(join(input.ledgerRoot, 'snapshot.json'));
    await writeFile(join(input.root, 'requirements/fixed.json'), '{}', 'utf8');
    await assert.rejects(binding.readScope(input.signal), /input|frozen|changed/i);
    assert.deepEqual(await readFile(join(input.ledgerRoot, 'snapshot.json')), before);
    completed = true; return { outcome: 'failed', gaps: ['OFFLINE bootstrap/input transport only'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(completed, true, 'Synthetic bootstrap assertions must complete, including errors normally captured by the one-shot entry');
});
test('real planner and DAG journal keep one original coding repair and effective finish inside the preparation envelope', async t => {
  const a = await api(), f = await transferValidationFixture(t), calls: string[] = []; let completed = false;
  await runTransferValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    try {
    await bootstrap(a, input, []); const { requirement, binding } = await a.stageTransferValidationInput(input);
    let inside = false, closed = false, planned: PreparedTask[] = [], finishIds: string[] = [], repairCount = 0;
    const refs = (role: string): ArtifactReference[] => [{ artifactId: `offline-${role}`, version: 'v1', location: `offline-output/${role}.json` }];
    const policies: any[] = ['design', 'art', 'coding'].map(role => ({ policyId: role, role, workspace: join(input.root, `offline-author-${role}`), allocationMicroCny: D.grants[role as 'design' | 'art' | 'coding'].amountMicroCny,
      writePaths: [`authors/${role}`], readOnlyPaths: ['requirements', 'offline-output'], tools: ['read'], rules: ['OFFLINE synthetic assembly; generatedByCosmos:false'],
      outputs: refs(role).map(ref => ({ ...ref, destination: ref.location, type: 'data', schema: 'offline/1' })) }));
    for (const policy of policies) await mkdir(policy.workspace, { recursive: true });
    const roleFactory: RoleFactory = async roleInput => ({ contextId: roleInput.role === 'reviewer' ? `review-${roleInput.task.taskId}` : roleInput.task.context.contextId,
      actorId: roleInput.role === 'reviewer' ? `review-${roleInput.task.taskId}` : roleInput.task.authorId, close: async () => {}, prompt: async () => {
        assert.equal(inside, true); calls.push(roleInput.role + ':' + roleInput.task.taskId);
        if (roleInput.purpose === 'planning') return { text: JSON.stringify({ tasks: ['design', 'art', 'coding'].map((role, index) => ({ taskId: D.grants[role as 'design' | 'art' | 'coding'].taskId, policyId: role, role,
          objective: 'OFFLINE synthetic assembly', acceptanceIds: index < 2 ? [['COSMOS-DESIGN', 'COSMOS-MEDIA'][index]] : requirement.acceptance.slice(0, 6).map((item: any) => item.acceptanceId),
          dependsOn: index === 0 ? [] : ['design', ...(index === 2 ? ['art'] : [])].map(prior => D.grants[prior as 'design' | 'art'].taskId) })) }) };
        if (roleInput.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', inputVersions: [...roleInput.task.inputs, ...roleInput.task.artifacts],
          evidenceIds: roleInput.task.evidence.map(item => item.evidenceId), findings: [], ...(roleInput.task.taskId === D.grants.repair.taskId ? { concernResolutions: [] } : {}) }) };
        return { text: JSON.stringify({ summary: 'OFFLINE synthetic output', remaining: [], uncertainty: [] }) };
      } });
    const host: any = {
      capability: 'OFFLINE synthetic assembly', availableArtifacts: requirement.sources, taskPolicies: policies, roleFactory,
      withPreparation: async (operation: () => Promise<unknown>) => { inside = true; try { return await operation(); } finally { inside = false; closed = true; } },
      validateTasks: (tasks: PreparedTask[]) => { assert.equal(inside, true); planned = tasks; assert.equal(tasks.length, 3); },
      preAuthor: async () => { assert.equal(inside, true); },
      capture: async (task: TaskContract) => {
        assert.equal(inside, true); const outputs = task.taskId === D.grants.repair.taskId ? [{ artifactId: 'offline-coding-repair', version: 'v2', location: 'offline-output/coding-repair.json' }] : planned.find(item => item.task.taskId === task.taskId)!.expectedArtifacts!;
        for (const ref of outputs) { await mkdir(dirname(join(input.root, ref.location)), { recursive: true }); await writeFile(join(input.root, ref.location), 'OFFLINE synthetic output; no target game\n', 'utf8'); }
        const reviewWorkspace = join(input.root, 'offline-review', task.taskId); await mkdir(reviewWorkspace, { recursive: true }); return { artifacts: outputs, reviewWorkspace };
      },
      verify: async (task: TaskContract) => {
        assert.equal(inside, true); const path = `offline-evidence/${task.taskId}.json`; await mkdir(dirname(join(input.root, path)), { recursive: true }); await writeFile(join(input.root, path), '{}\n', 'utf8');
        return [{ contractVersion: '1.0.0', evidenceId: `offline-evidence-${task.taskId}`, kind: 'test_report', source: { artifactId: `offline-evidence-${task.taskId}`, version: 'v1', location: path },
          taskId: task.taskId, acceptanceIds: task.acceptanceIds, artifactVersions: [...task.inputs, ...task.artifacts],
          recordedAt: new Date().toISOString(), outcome: task.taskId === D.grants.coding.taskId ? 'failed' : 'passed', summary: 'OFFLINE synthetic assembly evidence; no gameplay acceptance' }];
      },
      diagnoseFailure: (task: TaskContract) => new HostFailure([{ acceptanceId: task.acceptanceIds[0], checkId: 'offline-code-defect', classification: 'code_defect',
        summary: 'OFFLINE synthetic defect', reproduction: ['Synthetic injected failure'], expected: 'Synthetic pass', actual: 'Synthetic failure', evidenceRefs: [`offline-evidence/${task.taskId}.json`] }]),
      recoverCapture: async (task: TaskContract) => ({ artifacts: task.artifacts, reviewWorkspace: join(input.root, 'offline-review', task.taskId) }),
      prepareValidationRepair: async (source: PreparedTask, feedback: any, recovery: any) => {
        assert.equal(inside, true); repairCount++; assert.equal(source.task.taskId, D.grants.coding.taskId); assert.equal(recovery.journalRoot, join(input.root, 'journal'));
        await input.controller.claimValidationRepair({ sourceTaskId: source.task.taskId, feedback: feedback.reference });
        const repair = createLinkedRepairTask({ snapshot: await input.controller.read(), requirement, validation: binding, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(),
          estimate: { costMicroCny: 524488, durationMs: 180000, cleanupMs: 5000 }, source, taskId: D.grants.repair.taskId, allocationMicroCny: D.grants.repair.amountMicroCny,
          outputs: [{ type: 'data', schema: 'offline/1', destination: 'offline-output/coding-repair.json' }], expectedArtifacts: [{ artifactId: 'offline-coding-repair', version: 'v2', location: 'offline-output/coding-repair.json' }] });
        repair.workspace = join(input.root, 'offline-repair-author'); await mkdir(repair.workspace, { recursive: true });
        await mkdir(dirname(join(input.root, feedback.reference.location)), { recursive: true }); await writeFile(join(input.root, feedback.reference.location), await readFile(join(feedback.sessionRef, 'failure.json')));
        const origin = JSON.parse(await readFile(join(input.root, 'journal/task-' + source.task.taskId + '/origin.json'), 'utf8'));
        await TaskJournal.open(recovery, { ...origin, prepared: repair }, false); await input.controller.registerTasks([repair.task]);
        return repair;
      },
      finish: async (tasks: TaskContract[]) => { assert.equal(inside, true); finishIds = tasks.map(task => task.taskId); return { gaps: ['OFFLINE assembly has no generated game or accepted promotion'] }; },
    };
    const result = await a.executeTransferValidationDag(input, requirement, binding, host);
    assert.equal(closed, true); assert.equal(result.outcome, 'failed'); assert.equal(repairCount, 1, JSON.stringify(result.tasks.map((task: TaskContract) => ({ state: task.state, failure: task.attempts.at(-1)?.failure, handoff: task.handoff }))));
    assert.deepEqual(finishIds, [D.grants.design.taskId, D.grants.art.taskId, D.grants.repair.taskId]);
    assert.ok(!finishIds.includes(D.grants.coding.taskId));
    const execution = JSON.parse(await readFile(join(input.root, 'execution.json'), 'utf8')); assert.equal(execution.tasks.length, 3);
    const state = await input.controller.read(); assert.equal(state.tasks.find(task => task.taskId === D.grants.coding.taskId)!.state, 'failed');
    const origin = JSON.parse(await readFile(join(input.root, 'journal/task-' + D.grants.design.taskId + '/origin.json'), 'utf8'));
    assert.deepEqual(origin.requirement, requirement); assert.equal(origin.authorProtocolCorrections, 1); assert.equal(origin.codingHandoffClarifications, 1); assert.equal(origin.hostEvidencedCodingHandoff, 1);
    assert.equal(relative(input.root, origin.artifactRoot), '');
    completed = true; return result;
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(completed, true, 'Synthetic DAG assertions must complete, including errors normally captured by the one-shot entry');
});
