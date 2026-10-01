import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../src/roles/requirements.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import { requestStop } from '../../src/cli/control.ts';
import * as entrypoint from '../../src/runtime/entrypoint.ts';
async function fixture(t: test.TestContext, stages = false) {
  assert.equal(typeof entrypoint.executeGeneration, 'function', 'Runtime host assembly is required');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-entrypoint-')); t.after(() => rm(root, { recursive: true, force: true }));
  const intake = await IntakeController.create({ root, runId: 'game', ledgerId: 'one-budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  let draft = { brief: '点击星星获胜', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '获胜' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击星星'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 }, { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } };
  if (stages) draft = withHostStages(draft as any) as any;
  const saved = await intake.saveDraft(draft as any);
  const requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'user', at: new Date().toISOString() });
  const original = await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const calls: string[] = [];
  const createHost = async ({ controller }: any) => {
    await mkdir(join(root, 'author'), { recursive: true }); await mkdir(join(root, 'review'), { recursive: true }); await mkdir(join(root, 'artifacts'), { recursive: true }); await mkdir(join(root, 'evidence'), { recursive: true });
    const artifact = { artifactId: 'game-output', version: 'v1', location: 'artifacts/game.txt' };
    return { capability: 'offline-fixture-v1', availableArtifacts: requirement.sources,
      taskPolicies: [{ policyId: 'code', role: 'coding', workspace: root, writePaths: ['author'], readOnlyPaths: ['requirements'], tools: [], allocationMicroCny: 100,
        outputs: [{ ...artifact, destination: artifact.location, type: 'game', schema: 'game/1' }] }],
      roleFactory: async (input: any) => {
        const billing = createRoleBudget({ controller, taskId: input.task.taskId, evidenceDirectory: input.stateDirectory });
        return { actorId: `${input.role}-actor`, contextId: `${input.role}-context`, close: async () => {}, prompt: async () => {
          calls.push(input.role); const requestId = `role-${calls.length}`;
          await billing.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 10, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 20 });
          await billing.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
          return { text: JSON.stringify(input.role === 'cosmos' ? { tasks: [{ taskId: 'code-task', policyId: 'code', role: 'coding', objective: draft.brief, acceptanceIds: ['win'], dependsOn: [] }] }
            : input.role === 'reviewer' ? { verdict: 'approved', inputVersions: [...input.task.inputs, ...input.task.artifacts], evidenceIds: input.task.evidence.map((item: any) => item.evidenceId), findings: [] }
              : { summary: 'Offline fixture output', remaining: [], uncertainty: [] }) };
        } };
      },
      capture: async () => { calls.push('capture'); await writeFile(join(root, artifact.location), 'offline fake author output', 'utf8'); return { artifacts: [artifact], reviewWorkspace: join(root, 'review') }; },
      verify: async (task: any) => {
        calls.push('verify'); const source = { artifactId: 'host-report', version: 'v1', location: 'evidence/host.json' }; await writeFile(join(root, source.location), '{"offlineFixture":true}', 'utf8');
        return [{ contractVersion: '1.0.0', evidenceId: 'host-check', taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report', source, artifactVersions: [...task.inputs, ...task.artifacts], outcome: 'passed', recordedAt: new Date().toISOString(), summary: 'Offline host fixture' }];
      },
      recoverCapture: async () => ({ artifacts: [artifact], reviewWorkspace: join(root, 'review') }),
      finish: async () => ({ delivery: artifact.location, gaps: [] }),
      repair: async () => null,
    };
  };
  return { root, draft, requirement, original, calls, createHost };
}
test('entrypoint uses the existing native planner, scheduler, host evidence and independent review', async t => {
  const f = await fixture(t);
  const result = await entrypoint.executeGeneration({ ...f, resume: false });
  assert.equal(result.outcome, 'awaiting_user_experience');
  assert.deepEqual(f.calls, ['cosmos', 'coding', 'capture', 'verify', 'reviewer']);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.run.runId, f.original.run.runId); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(state.run.fees.settledMicroCny, 30); assert.equal(state.tasks[0].state, 'passed');
});
test('crash resume reuses fixed passed artifacts without another planning or author request', async t => {
  const f = await fixture(t);
  await entrypoint.executeGeneration({ ...f, resume: false }); const before = [...f.calls];
  const result = await entrypoint.executeGeneration({ ...f, resume: true });
  assert.equal(result.outcome, 'awaiting_user_experience'); assert.deepEqual(f.calls, before);
});
test('a durable manual stop is rejected before host assembly or another request', async t => {
  const f = await fixture(t); const { RunController } = await import('../../src/runtime/run.ts');
  const controller = await RunController.open({ root: f.root }); await controller.stop('User hard stop'); await controller.close();
  await assert.rejects(entrypoint.executeGeneration({ ...f, resume: true }), /stopped/i); assert.deepEqual(f.calls, []);
});
test('a lost planning result does not become a free replan on resume', async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'planning-started.json'), '{"started":true}', 'utf8');
  await assert.rejects(entrypoint.executeGeneration({ ...f, resume: true }), /planning|plan/i); assert.deepEqual(f.calls, []);
});

test('multi-role coding repair finds its own task, preserves passed design/art and reports original failure', async t => {
  const f = await fixture(t, true), finished: any[][] = [];
  const createHost = async (input: any) => {
    const base = await f.createHost(input);
    const refs = (id: string, version = 'v1') => ({ artifactId: `${id}-output`, version, location: `artifacts/${id}-${version}.txt` });
    const tasks = [
      { taskId: 'design-task', policyId: 'design', role: 'design', acceptanceIds: [DESIGN_ACCEPTANCE_ID], dependsOn: [] },
      { taskId: 'art-task', policyId: 'art', role: 'art', acceptanceIds: [MEDIA_ACCEPTANCE_ID], dependsOn: ['design-task'] },
      { taskId: 'code-task', policyId: 'coding', role: 'coding', acceptanceIds: ['win'], dependsOn: ['design-task', 'art-task'] },
    ].map(task => ({ ...task, objective: task.role }));
    return { ...base,
      taskPolicies: tasks.map(task => ({ ...base.taskPolicies[0], policyId: task.policyId, role: task.role, writePaths: [`author/${task.role}`],
        outputs: [{ ...refs(task.taskId), destination: refs(task.taskId).location, type: 'fixture', schema: 'fixture/1' }] })),
      roleFactory: async (role: any) => { const session = await base.roleFactory(role); return role.role === 'cosmos' ? { ...session, async prompt() { await session.prompt(); return { text: JSON.stringify({ tasks }) }; } } : session; },
      capture: async (task: any) => {
        f.calls.push(`capture:${task.taskId}`); const version = task.taskId.endsWith('-repair') ? 'v2' : 'v1', id = task.taskId.replace(/-repair$/, ''), artifact = refs(id, version);
        await writeFile(join(f.root, artifact.location), `offline ${task.taskId}`, 'utf8'); return { artifacts: [artifact], reviewWorkspace: join(f.root, 'review') };
      },
      verify: async (task: any) => {
        f.calls.push(`verify:${task.taskId}`); const source = { artifactId: `report-${task.taskId}`, version: 'v1', location: `evidence/${task.taskId}.json` };
        await writeFile(join(f.root, source.location), '{"fixture":true}', 'utf8');
        return [{ contractVersion: '1.0.0', evidenceId: `check-${task.taskId}`, taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report', source,
          artifactVersions: [...task.inputs, ...task.artifacts], outcome: task.taskId === 'code-task' ? 'failed' : 'passed', recordedAt: new Date().toISOString(), summary: 'Offline check' }];
      },
      diagnoseFailure: (task: any) => task.taskId === 'code-task' ? new HostFailure([{ acceptanceId: 'win', checkId: 'click', classification: 'code_defect', summary: 'Click fails', reproduction: ['click'], actual: 'no win', expected: '胜利', evidenceRefs: ['evidence/code-task.json'] }]) : undefined,
      repair: async (task: any, feedback: any) => {
        assert.equal(task.taskId, 'code-task'); await mkdir(join(f.root, 'repair-feedback'), { recursive: true });
        await writeFile(join(f.root, feedback.reference.location), JSON.stringify(feedback), 'utf8'); const ref = refs('code-task', 'v2');
        return { expectedArtifacts: [ref], outputs: [{ type: 'fixture', schema: 'fixture/1', destination: ref.location }], allocationMicroCny: 100 };
      },
      finish: async (results: any[]) => { finished.push(results); return { delivery: 'artifacts/code-task-v2.txt', gaps: [] }; },
      recoverCapture: async (task: any) => ({ artifacts: task.artifacts, reviewWorkspace: join(f.root, 'review') }),
    };
  };
  const result = await entrypoint.executeGeneration({ ...f, createHost, resume: false });
  assert.equal(result.outcome, 'awaiting_user_experience');
  assert.deepEqual(finished[0].map(task => task.taskId), ['design-task', 'art-task', 'code-task-repair']);
  assert.equal(f.calls.filter(role => role === 'design').length, 1); assert.equal(f.calls.filter(role => role === 'art').length, 1);
  assert.equal(result.taskHistory.find((task: any) => task.taskId === 'code-task').state, 'failed');
  const before = [...f.calls]; const resumed = await entrypoint.executeGeneration({ ...f, createHost, resume: true });
  assert.equal(resumed.outcome, 'awaiting_user_experience'); assert.deepEqual(f.calls, before);
});

test('product host gives the same reviewer one durable billed protocol correction and does not renew it on resume', async t => {
  const f = await fixture(t);
  const createHost = async (input: any) => {
    const host = await f.createHost(input), factory = host.roleFactory;
    return { ...host, roleFactory: async (role: any) => {
      const session = await factory(role); let responses = 0;
      return role.role !== 'reviewer' ? session : { ...session, async prompt() {
        const reply = await session.prompt(); const value = JSON.parse(reply.text);
        if (++responses === 1) value.findings = ['Positive observation instead of an unresolved defect'];
        return { text: JSON.stringify(value) };
      } };
    } };
  };
  const result = await entrypoint.executeGeneration({ ...f, createHost, resume: false });
  assert.equal(result.outcome, 'awaiting_user_experience'); assert.equal(f.calls.filter(value => value === 'reviewer').length, 2);
  assert.equal(result.status.settledMicroCny, 40);
  const before = [...f.calls]; await entrypoint.executeGeneration({ ...f, createHost, resume: true }); assert.deepEqual(f.calls, before);
});

for (const stoppedRole of ['cosmos', 'coding']) test(`hard stop saves an incomplete delivery report during ${stoppedRole}`, async t => {
  const f = await fixture(t); let reached!: () => void; const active = new Promise<void>(resolve => { reached = resolve; });
  const createHost = async (input: any) => {
    const host = await f.createHost(input), factory = host.roleFactory;
    return { ...host, roleFactory: async (role: any) => {
      const session = await factory(role);
      return role.role !== stoppedRole ? session : { ...session, async prompt(_text: string, options: any) {
        reached(); await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve(), { once: true }));
        options.signal.throwIfAborted(); return { text: '' };
      } };
    } };
  };
  const running = entrypoint.executeGeneration({ ...f, createHost, resume: false }).then(result => ({ result }), error => ({ error }));
  await active; await requestStop(f.root); const completed = await running;
  assert.ok(completed.result, 'Stopping must preserve and report incomplete delivery rather than lose the handoff');
  assert.equal(completed.result.outcome, 'incomplete'); assert.equal(completed.result.status.stopReason.code, 'manual');
  assert.equal(completed.result.currentProject, f.root); assert.equal(completed.result.status.settledMicroCny, stoppedRole === 'cosmos' ? 0 : 10);
  assert.equal(JSON.parse(await readFile(join(f.root, completed.result.report), 'utf8')).outcome, 'incomplete');
});
