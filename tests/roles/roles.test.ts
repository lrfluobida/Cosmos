import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { EvidenceContract, RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { prepareClarification, confirmRequirements } from '../../src/roles/requirements.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { PiSessionError } from '../../src/providers/pi.ts';
import { requirement as requirementFixture, task as taskFixture, artifact } from '../contracts/fixtures.ts';

const requirement = requirementFixture() as RequirementContract;
const now = () => Date.parse('2026-10-01T01:00:00.000Z');
const fenced = (text: string) => `Design deliverables are complete.\n\`\`\`json\n${text}\n\`\`\`\nHost verification follows.`;

for (const wrapped of [false, true]) for (const invalid of [false, true]) test(`Cosmos plans host-scoped tasks, wrapped=${wrapped}, incomplete coverage rejected=${invalid}`, async t => {
  const f = await fixture(t), seen: any[] = [];
  const factory = createRoleFactory({ maxOutputTokens: 500, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => { seen.push(config); return { async prompt() {
      const packet = JSON.parse(config.context);
      assert.deepEqual(packet.inputs, requirement.sources);
      assert.ok(packet.ownership.readPaths.includes(requirement.sources[0].location));
      const source = await config.tools.find(tool => tool.name === 'read')!.execute('requirements', { path: requirement.sources[0].location }, undefined, undefined, undefined as any);
      assert.match(JSON.stringify(source), /鼠标操作/);
      const text = JSON.stringify({ tasks: [{ taskId: 'generated-code', role: 'coding', objective: 'Implement the confirmed interaction', acceptanceIds: invalid ? [] : ['AC-1'], dependsOn: [] }] });
      return { text: wrapped ? fenced(text) : text };
    }, async close() {} }; } });
  const action = planTaskDag({ controller: f.controller, requirement, planningTaskId: 'planning', workspace: f.workspace, sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: factory,
    roles: { coding: { workspace: f.workspace, allocationMicroCny: 300, writePaths: ['game'], readOnlyPaths: ['requirements'], tools: ['read', 'write', 'edit'], outputs: [{ artifactId: 'game', version: 'v1', destination: 'artifacts/game/v1', type: 'game', schema: 'game/1' }] } } });
  if (invalid) await assert.rejects(action, /acceptance|coverage/i);
  else {
    const plan = await action;
    assert.equal(plan.tasks[0].task.taskId, 'generated-code');
    assert.deepEqual(plan.tasks[0].task.acceptance[0].steps, requirement.acceptance[0].steps);
    assert.deepEqual(plan.tasks[0].task.ownership.writePaths, ['game']);
    assert.deepEqual(plan.tasks[0].expectedArtifacts, [artifact()]);
    assert.equal(JSON.parse(await readFile(plan.plan.location, 'utf8')).status, 'validated_proposal');
    assert.equal((await f.controller.read()).tasks.length, 0);
  }
  assert.equal(seen.length, 1);
});

for (const missing of [true, false]) test(`planning rejects missing or stale confirmed source before dispatch: ${missing ? 'missing' : 'stale'}`, async t => {
  const f = await fixture(t), seen: any[] = [];
  const factory = createRoleFactory({ maxOutputTokens: 500, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => { seen.push(config); return { async prompt() { return { text: JSON.stringify({ tasks: [{ taskId: 'generated-code', role: 'coding', objective: 'Implement', acceptanceIds: ['AC-1'], dependsOn: [] }] }) }; }, async close() {} }; } });
  await assert.rejects(planTaskDag({ controller: f.controller, requirement, planningTaskId: 'planning', workspace: f.workspace, sessionRoot: join(f.root, 'sessions'), availableArtifacts: missing ? [] : [{ ...requirement.sources[0], version: 'old' }], roleFactory: factory,
    roles: { coding: { workspace: f.workspace, allocationMicroCny: 300, writePaths: ['game'], readOnlyPaths: ['requirements'], tools: ['read', 'write', 'edit'], outputs: [{ artifactId: 'game', version: 'v1', destination: 'artifacts/game/v1', type: 'game', schema: 'game/1' }] } } }), /confirmed.*source|source.*version/i);
  assert.equal(seen.length, 0);
});

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-roles-'));
  const workspace = join(root, 'author'), reviewWorkspace = join(root, 'snapshot');
  await mkdir(join(workspace, 'game'), { recursive: true });
  await mkdir(join(workspace, 'requirements'), { recursive: true });
  await writeFile(join(workspace, 'requirements/v1.json'), JSON.stringify({ brief: '原创小游戏', answers: { controls: '鼠标操作' } }), 'utf8');
  await mkdir(join(reviewWorkspace, 'artifacts/game/v1'), { recursive: true });
  await mkdir(join(reviewWorkspace, 'requirements'), { recursive: true });
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'planning', amountMicroCny: 100 }], now });
  const task = taskFixture() as TaskContract;
  Object.assign(task, { taskId: 'code', state: 'not_started', dependsOn: [], attempts: [], artifacts: [], evidence: [] });
  task.context.tools = ['read', 'write', 'edit'];
  task.budget.allocationMicroCny = 300;
  task.budget.originalDeadlineAt = (await controller.read()).run.originalDeadlineAt;
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  return { root, workspace, reviewWorkspace, controller, task };
}

function passingEvidence(task: TaskContract): EvidenceContract[] {
  return [{ contractVersion: '1.0.0', evidenceId: `${task.taskId}-test`, taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report', source: artifact('report', 'v1', 'evidence/test.json'), artifactVersions: [...task.inputs, artifact()], outcome: 'passed', recordedAt: new Date(now()).toISOString(), summary: '真实宿主测试通过' }];
}

function mockFactory(seen: any[], review?: (packet: any) => unknown, wrap = (text: string) => text) {
  return createRoleFactory({ maxOutputTokens: 512, maxRequests: 2, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => {
      const packet = JSON.parse(config.context); seen.push({ config, packet });
      return { async prompt(_text, { signal } = {}) {
        signal?.throwIfAborted();
        return { text: wrap(JSON.stringify(packet.role === 'reviewer' ? review?.(packet) ?? { verdict: 'approved', inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: EvidenceContract) => e.evidenceId), findings: [] } : { summary: '代码已生成', remaining: [], uncertainty: [] })) };
      }, async close() {} };
    },
  });
}

test('clarification cannot manufacture confirmation while required answers are missing', () => {
  const draft = prepareClarification({ brief: '制作一个原创小游戏', specVersion: 'spec-v1', sources: requirement.sources, acceptance: requirement.acceptance, questions: [{ id: 'controls', prompt: '操作方式？' }], answers: {} });
  assert.deepEqual(draft.missingQuestionIds, ['controls']);
  assert.throws(() => confirmRequirements(draft, { confirmed: true, actorId: 'user', at: new Date(now()).toISOString() }), /answer/i);
  const answered = prepareClarification({ ...draft, answers: { controls: '鼠标' } });
  assert.throws(() => confirmRequirements(answered, { confirmed: false, actorId: 'user', at: new Date(now()).toISOString() }), /confirm/i);
  const fixed = confirmRequirements(answered, { confirmed: true, actorId: 'user', at: new Date(now()).toISOString() });
  assert.equal(fixed.confirmedBy, 'user');
  assert.equal(Object.isFrozen(fixed.acceptance[0]), true);
});

test('planned tasks append atomically without resetting allocation, charges or deadline', async t => {
  const { controller, task } = await fixture(t);
  await controller.reserve({ requestId: 'planning', taskId: 'planning', provider: 'offline', pricingVersion: 'test', estimatedMaxCostMicroCny: 50 });
  await controller.admit('planning');
  await controller.settle('planning', 40, [artifact('receipt', 'v1', 'receipts/planning.json')]);
  const original = await controller.read();
  await controller.registerTasks([task]);
  await assert.rejects(controller.registerTasks([task]), /already|duplicate/i);
  const tooBig = structuredClone(task); tooBig.taskId = 'overspend'; tooBig.budget.allocationMicroCny = 601;
  await assert.rejects(controller.registerTasks([tooBig]), /budget|allocat/i);
  const current = await controller.read();
  assert.equal(current.run.originalDeadlineAt, original.run.originalDeadlineAt);
  assert.equal(current.ledger.limitMicroCny, original.ledger.limitMicroCny);
  assert.equal(current.run.fees.settledMicroCny, 40);
  assert.equal(current.tasks.length, 1);
  await controller.stop('停止');
  const later = structuredClone(task); later.taskId = 'late';
  await assert.rejects(controller.registerTasks([later]), /stop/i);
});

test('dependency order uses persisted states and fixed artifact versions', async t => {
  const f = await fixture(t), seen: any[] = [], second = structuredClone(f.task);
  second.taskId = 'art'; second.authorId = 'artist'; second.context.contextId = 'art-context'; second.ownership.writePaths = ['art'];
  second.inputs.push(artifact()); second.dependsOn = [{ taskId: 'code', requiredState: 'passed', state: 'not_started' }];
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: second, role: 'art', workspace: f.workspace }, { task: f.task, role: 'coding', workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: mockFactory(seen), now,
    capture: async task => ({ artifacts: [task.taskId === 'art' ? artifact('art-output', 'v1', 'art/output.json') : artifact()], reviewWorkspace: f.reviewWorkspace }),
    verify: async task => [{ ...passingEvidence(task)[0], artifactVersions: [...task.inputs, ...task.artifacts] }] });
  assert.deepEqual(results.map(r => [r.taskId, r.state]), [['code', 'passed'], ['art', 'passed']]);
  assert.deepEqual(seen.map(s => s.packet.role), ['coding', 'reviewer', 'art', 'reviewer']);
  assert.equal(results[1].dependsOn[0].state, 'passed');
});

for (const mode of ['wrong-input', 'review-workspace', 'bad-capture', 'bad-evidence', 'wrong-output', 'changes-requested'] as const) {
  test(`retains a recoverable handoff for ${mode}`, async t => {
    const f = await fixture(t), seen: any[] = [];
    const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace, expectedArtifacts: [artifact()] }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: mode === 'wrong-input' ? [] : f.task.inputs, roleFactory: mockFactory(seen, packet => ({ verdict: 'changes_requested', inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: EvidenceContract) => e.evidenceId), findings: ['运行结果需要修复'] })), now,
      capture: async () => ({ artifacts: mode === 'bad-capture' ? undefined as any : mode === 'wrong-output' ? [artifact('game', 'old')] : [artifact()], reviewWorkspace: mode === 'review-workspace' ? f.workspace : f.reviewWorkspace }),
      verify: async task => mode === 'bad-evidence' ? undefined as any : passingEvidence(task) });
    assert.equal(results[0].state, mode === 'changes-requested' ? 'needs_changes' : mode === 'wrong-input' ? 'waiting_user' : 'failed');
    assert.ok(results[0].handoff.remaining.length);
    assert.equal((await f.controller.read()).tasks[0].state, results[0].state);
  });
}

test('cancellation blocks author writes', async t => {
  const f = await fixture(t), seen: any[] = [];
  const base = mockFactory(seen);
  // Exercise the real file-tool wrapper after its run signal is cancelled.
  const role = await base({ role: 'coding', task: f.task, requirement, workspace: f.workspace, stateDirectory: join(f.root, 'tools'), controller: f.controller });
  await f.controller.stop('停止工具');
  const write = seen[0].config.tools.find((tool: any) => tool.name === 'write');
  await assert.rejects(write.execute('late', { path: 'game/late.ts', content: 'late' }));
  await role.close();
});

for (const stale of [false, true]) test(`review image transport rejects stale sources: ${stale}`, async t => {
  const f = await fixture(t), seen: any[] = [], imageCalls: any[] = [];
  const factory = createRoleFactory({ maxOutputTokens: 100, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => {
      const packet = JSON.parse(config.context); seen.push(packet);
      return { async prompt(_text, options) { imageCalls.push(options?.images); return { text: JSON.stringify(packet.role === 'reviewer' ? { verdict: 'approved', inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: EvidenceContract) => e.evidenceId), findings: [] } : { summary: 'done', remaining: [], uncertainty: [] }) }; }, async close() {} };
    } });
  const image = { type: 'image' as const, mimeType: 'image/png', data: 'aG9zdC1maXh0dXJl' };
  const result = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: factory, now,
    capture: async () => ({ artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }), verify: async task => passingEvidence(task),
    reviewImages: async task => [{ source: { ...task.evidence[0].source, ...(stale ? { version: 'old' } : {}) }, image }] });
  assert.equal(result[0].state, stale ? 'failed' : 'passed');
  assert.equal(imageCalls[0], undefined);
  assert.deepEqual(imageCalls[1], stale ? undefined : [image]);
});

test('host tools are scoped by declared name and reviewer read-only capability', async t => {
  const f = await fixture(t), seen: any[] = [];
  f.task.context.tools.push('build', 'inspect');
  const factory = createRoleFactory({ maxOutputTokens: 100, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    hostTools: async ({ childEnv }) => {
      assert.equal(childEnv.DEEPSEEK_API_KEY, undefined);
      return [{ readOnly: false, tool: { name: 'build' } as any }, { readOnly: true, tool: { name: 'inspect' } as any }, { readOnly: true, tool: { name: 'undeclared' } as any }];
    }, sessionFactory: async config => { seen.push(config); return { async prompt() { return { text: '' }; }, async close() {} }; } });
  const author = await factory({ role: 'cosmos', task: f.task, requirement, workspace: f.workspace, stateDirectory: join(f.root, 'a'), controller: f.controller });
  const reviewer = await factory({ role: 'reviewer', task: f.task, requirement, workspace: f.reviewWorkspace, stateDirectory: join(f.root, 'r'), controller: f.controller });
  assert.deepEqual(seen[0].tools.map((tool: any) => tool.name), ['read', 'write', 'edit', 'build', 'inspect']);
  assert.deepEqual(seen[1].tools.map((tool: any) => tool.name), ['read', 'inspect']);
  await author.close(); await reviewer.close();
});

test('native role boundary keeps author writes scoped and reviewer tools read only', async t => {
  const { root, workspace, reviewWorkspace, controller, task } = await fixture(t);
  const seen: any[] = [], factory = mockFactory(seen);
  const author = await factory({ role: 'coding', task, requirement, workspace, stateDirectory: join(root, 'sessions/a'), controller });
  const write = seen[0].config.tools.find((tool: any) => tool.name === 'write');
  await write.execute('ok', { path: 'game/main.ts', content: '// 中文保留' });
  await assert.rejects(write.execute('bad', { path: 'requirements/spec.json', content: 'changed' }), /allowed/i);
  assert.equal(await readFile(join(workspace, 'game/main.ts'), 'utf8'), '// 中文保留');
  await author.close();
  task.artifacts = [artifact()]; task.evidence = passingEvidence(task);
  const reviewer = await factory({ role: 'reviewer', task, requirement, workspace: reviewWorkspace, stateDirectory: join(root, 'sessions/r'), controller });
  assert.deepEqual(seen[1].config.tools.map((tool: any) => tool.name), ['read']);
  assert.notEqual(seen[0].packet.contextId, seen[1].packet.contextId);
  assert.equal(seen[1].packet.summary, undefined);
  assert.equal(seen[1].packet.handoff, undefined);
  await reviewer.close();
});

for (const scope of ['absolute-input', 'absolute-write', 'absolute-read-only', 'absolute-interface'] as const) {
  test(`ownership uses the actual workspace for mixed path forms: ${scope}`, async t => {
    const f = await fixture(t), seen: any[] = [], factory = mockFactory(seen);
    const fixedPath = join(f.workspace, 'game', 'fixed.json');
    await writeFile(fixedPath, '固定输入不可覆盖', 'utf8');
    if (scope === 'absolute-input') f.task.inputs.push(artifact('fixed', 'v1', fixedPath));
    if (scope === 'absolute-write') { f.task.ownership.writePaths = [join(f.workspace, 'game')]; f.task.inputs.push(artifact('fixed', 'v1', 'game/fixed.json')); }
    if (scope === 'absolute-read-only') f.task.ownership.readOnlyPaths.push(join(f.workspace, 'game'));
    if (scope === 'absolute-interface') f.task.context.interfaces.push(artifact('fixed-api', 'v1', fixedPath));
    await assert.rejects(async () => {
      const role = await factory({ role: 'coding', task: f.task, requirement, workspace: f.workspace, stateDirectory: join(f.root, 'sessions'), controller: f.controller });
      try { await seen[0].config.tools.find((tool: any) => tool.name === 'write').execute('overwrite', { path: 'game/fixed.json', content: 'overwritten' }); }
      finally { await role.close(); }
    }, /overlap|scope/i);
    assert.equal(seen.length, 0);
    assert.equal(await readFile(fixedPath, 'utf8'), '固定输入不可覆盖');
  });
}

test('cross-task ownership rejects mixed absolute and relative overlapping writes before dispatch', async t => {
  const f = await fixture(t), seen: any[] = [], other = structuredClone(f.task);
  other.taskId = 'art'; other.context.contextId = 'art-context'; other.ownership.writePaths = [join(f.workspace, 'game/subdir')];
  await assert.rejects(executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace }, { task: other, role: 'art', workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: mockFactory(seen), now,
    capture: async () => ({ artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }), verify: async task => passingEvidence(task) }), /conflict/i);
  assert.equal(seen.length, 0);
});

test('DAG completion needs host evidence and a separate frozen review context', async t => {
  const f = await fixture(t), seen: any[] = [];
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: mockFactory(seen), now,
    capture: async () => ({ artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }), verify: async task => passingEvidence(task) });
  assert.equal(results[0].state, 'passed');
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0].config.stateDirectory, seen[1].config.stateDirectory);
  assert.deepEqual(results[0].review.inputVersions, [...f.task.inputs, artifact()]);
  assert.equal((await f.controller.read()).tasks[0].state, 'passed');
});

for (const wrapped of [false, true]) for (const sample of [
  { name: 'approved-with-positive-notes', verdict: 'approved', findings: ['The schema is complete.', 'Every fixed requirement is covered.'], state: 'waiting_user', recorded: 'pending' },
  { name: 'approved-with-no-defects', verdict: 'approved', findings: [], state: 'passed', recorded: 'approved' },
  { name: 'changes-without-defects', verdict: 'changes_requested', findings: [], state: 'waiting_user', recorded: 'pending' },
  { name: 'changes-with-real-defect', verdict: 'changes_requested', findings: ['Required click behavior is missing; normal input has no effect.'], state: 'needs_changes', recorded: 'changes_requested' },
]) test(`review findings protocol: ${sample.name}, wrapped=${wrapped}`, async t => {
  const f = await fixture(t), seen: any[] = [];
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace }],
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, now,
    roleFactory: mockFactory(seen, packet => ({ verdict: sample.verdict, inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: EvidenceContract) => e.evidenceId), findings: sample.findings }), wrapped ? fenced : undefined),
    capture: async () => ({ artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }), verify: async task => passingEvidence(task),
  });
  assert.equal(results[0].state, sample.state); assert.equal(results[0].review.verdict, sample.recorded);
  assert.equal(results[0].evidence.length, 1); assert.equal(results[0].evidence[0].outcome, 'passed');
  const prompt = seen.find(item => item.packet.role === 'reviewer').config.systemPrompt;
  assert.match(prompt, /findings contains only unresolved actionable defects/);
  assert.match(prompt, /approved requires findings:\[\]/);
  assert.match(prompt, /changes_requested requires at least one such defect/);
  assert.match(prompt, /Do not hide actual defects/);
});

for (const stale of [true, false]) test(`only current selected review evidence can approve while history stays intact: ${stale}`, async t => {
  const f = await fixture(t), seen: any[] = [];
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: mockFactory(seen, packet => ({ verdict: 'approved', inputVersions: packet.inputs, evidenceIds: [stale ? 'old-test' : 'code-test'], findings: [] })), now,
    capture: async () => ({ artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }), verify: async task => {
      const current = passingEvidence(task)[0], old = structuredClone(current);
      old.evidenceId = 'old-test'; old.artifactVersions[0].version = 'old';
      return [current, old];
    } });
  assert.equal(results[0].state === 'passed', !stale);
  assert.equal(results[0].evidence.length, 2);
  assert.equal(results[0].evidence[1].artifactVersions[0].version, 'old');
  assert.equal((await f.controller.read()).tasks[0].evidence.length, 2);
});

test('unfinished author handoff is retained without paying for an approval attempt', async t => {
  const f = await fixture(t), seen: any[] = [], base = mockFactory(seen);
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: async input => {
    const session = await base(input);
    return input.role === 'reviewer' ? session : { ...session, async prompt() { return { text: JSON.stringify({ summary: '部分完成', remaining: ['还需要实现输入'], uncertainty: [] }) }; } };
  }, now, capture: async () => ({ artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }), verify: async task => passingEvidence(task) });
  assert.equal(results[0].state, 'failed');
  assert.ok(results[0].handoff.remaining.includes('还需要实现输入'));
  assert.equal(seen.length, 1);
});

for (const field of ['remaining', 'uncertainty'] as const) test(`wrapped author preserves unresolved ${field} without review`, async t => {
  const f = await fixture(t), seen: any[] = [], base = mockFactory(seen);
  let captures = 0;
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'design', workspace: f.workspace }],
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, now, roleFactory: async input => {
      const session = await base(input);
      return { ...session, async prompt() { return { text: fenced(JSON.stringify({ summary: 'Partial work', remaining: [], uncertainty: [], [field]: ['Required work is unresolved'] })) }; } };
    }, capture: async (_task, proposal) => { captures++; assert.deepEqual(proposal[field], ['Required work is unresolved']); return { artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }; },
    verify: async () => { throw new Error('Unresolved handoff must not reach verification'); },
  });
  assert.equal(captures, 1); assert.equal(seen.length, 1); assert.equal(results[0].state, 'failed');
  assert.ok(results[0].handoff[field].includes('Required work is unresolved'));
});

test('ambiguous author message cannot reach capture', async t => {
  const f = await fixture(t), seen: any[] = [];
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'design', workspace: f.workspace }],
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, now,
    roleFactory: mockFactory(seen, undefined, text => `${fenced(text)}\n${text}`),
    capture: async () => { assert.fail('Ambiguous response reached capture'); }, verify: async () => [],
  });
  assert.notEqual(results[0].state, 'passed'); assert.equal(seen.length, 1);
});

test('truncated author response persists its precise diagnosis and settled fee without capture or retry', async t => {
  const f = await fixture(t);
  let calls = 0;
  const factory = createRoleFactory({ maxOutputTokens: 100, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 200,
    sessionFactory: async config => ({ async prompt() {
      calls++;
      await config.budget.beforeRequest({ requestId: 'truncated', modelId: 'deepseek-flash', maxOutputTokens: 100, inputBytes: 20, hasImages: false, estimatedMaxCostMicroCny: 200 });
      await config.budget.afterResponse({ requestId: 'truncated', outcome: 'settled', stopReason: 'length', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 30, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      throw new PiSessionError('incomplete', 'SECRET_RAW_PROVIDER_ERROR');
    }, async close() {} }),
  });
  const [result] = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'art', workspace: f.workspace }],
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: factory, now,
    capture: async () => { assert.fail('Truncated response reached capture'); }, verify: async () => [],
  });
  assert.notEqual(result.state, 'passed'); assert.equal(calls, 1); assert.equal(result.attempts.length, 1);
  const feedback = JSON.parse(await readFile(join(result.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.equal(feedback.issues[0].checkId, 'provider_output_truncated');
  assert.equal(feedback.issues[0].classification, 'insufficient_evidence');
  assert.match(feedback.issues[0].actual, /token limit.*incomplete/);
  assert.equal(feedback.charges[0].settledMicroCny, 140); assert.equal(feedback.charges[0].reservedMicroCny, 0);
  assert.doesNotMatch(JSON.stringify(feedback), /SECRET_RAW_PROVIDER_ERROR/);
});

for (const mode of ['missing', 'stale', 'self-approval', 'unconfirmed', 'dependency', 'overlap'] as const) {
  test(`rejects ${mode} before it can become passed`, async t => {
    const f = await fixture(t), seen: any[] = [];
    const fixed = structuredClone(requirement);
    if (mode === 'unconfirmed') fixed.confirmedBy = '';
    if (mode === 'dependency') f.task.dependsOn = [{ taskId: 'missing', requiredState: 'passed', state: 'passed' }];
    if (mode === 'overlap') f.task.ownership.readOnlyPaths.push('game/config');
    const options = { controller: f.controller, requirement: fixed, tasks: [{ task: f.task, role: 'coding' as const, workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: mockFactory(seen, packet => ({ verdict: 'approved', ...(mode === 'self-approval' ? { reviewerId: f.task.authorId } : {}), inputVersions: mode === 'stale' ? [artifact('game', 'old')] : packet.inputs, evidenceIds: packet.evidence.map((e: EvidenceContract) => e.evidenceId), findings: [] })), now,
      capture: async () => ({ artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }), verify: async (task: TaskContract) => mode === 'missing' ? [] : passingEvidence(task) };
    if (['unconfirmed', 'dependency', 'overlap'].includes(mode)) {
      await assert.rejects(executeTaskDag(options)); assert.equal(seen.length, 0);
    } else {
      const results = await executeTaskDag(options);
      assert.notEqual(results[0].state, 'passed');
      assert.ok(results[0].handoff.remaining.length);
    }
  });
}

test('cancellation preserves handoff and dispatches no dependent session', async t => {
  const f = await fixture(t), seen: any[] = [];
  const dependent = structuredClone(f.task); dependent.taskId = 'art'; dependent.context.contextId = 'art-context'; dependent.ownership.writePaths = ['art']; dependent.dependsOn = [{ taskId: 'code', requiredState: 'passed', state: 'not_started' }];
  const results = await executeTaskDag({ controller: f.controller, requirement, tasks: [{ task: f.task, role: 'coding', workspace: f.workspace }, { task: dependent, role: 'art', workspace: f.workspace }], sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.task.inputs, roleFactory: mockFactory(seen), now,
    capture: async () => { await f.controller.stop('取消生成'); return { artifacts: [artifact()], reviewWorkspace: f.reviewWorkspace }; }, verify: async task => passingEvidence(task) });
  assert.equal(seen.length, 1);
  assert.equal(results[0].state, 'cancelled');
  assert.equal(results[1].state, 'cancelled');
  assert.ok(results[0].handoff.remaining.length);
});
