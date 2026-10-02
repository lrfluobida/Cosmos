import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { snapshot } from '../../src/artifacts/paths.ts';
import type { TaskContract } from '../../src/contracts/index.ts';
import { DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID, withHostStages } from '../../src/roles/requirements.ts';
import type { RoleFactory } from '../../src/roles/factory.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { taskWindowBinding } from '../../src/runtime/execution-window.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';

const design = { summary: '原创点击游戏', implementationNotes: ['点击星星获胜'], acceptanceMapping: { win: '点击目标显示胜利' }, characters: [{ id: 'star', purpose: '目标', states: ['idle'] }], audio: [] };
const media = { characters: [{ id: 'star', width: 32, height: 32, anchor: { x: 16, y: 16 }, layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] };

/** Real controller, journal, registry and production host; all author/build/browser results are offline fixtures. */
async function fixture(t: test.TestContext, failedRole: 'design' | 'coding' = 'coding') {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-host-window-'));
  let time = Date.now() - 13 * 60 * 60 * 1000, continued = false;
  const now = () => time;
  const intake = await IntakeController.create({ root, runId: 'game', ledgerId: 'ledger', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    limitMicroCny: 100_000, allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }], now });
  const draft = withHostStages({ brief: '点击星星获胜', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '获胜' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击星星'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 }, { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } });
  const saved = await intake.saveDraft(draft as any), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-user', at: new Date(time).toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  let controller = await RunController.open({ root, now });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'toolchain'));
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}' : '{}', 'utf8');
  const ioCalls: any[] = [], roleCalls: string[] = [];
  const io = {
    async build(project: string, taskId: string, _signal: AbortSignal, authority?: any) {
      ioCalls.push({ kind: 'build', taskId, authority }); await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), '<p>Offline host fixture</p>', 'utf8');
      return { passed: true, diagnostics: 'Offline fake build' };
    },
    async play(plan: any, _signal: AbortSignal, authority?: any) {
      ioCalls.push({ kind: 'play', taskId: plan.taskId, authority });
      return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan, outcome: 'passed', browser: { version: 'offline' }, cleanup: { processExited: true }, errors: [], reportPath: 'offline.json', files: [], evidence: [],
        steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId, outcome: 'passed', expected: step.expected ?? 'input', actual: step.expected ?? 'input', screenshot: null })) } as any;
    },
  };
  let host = await createBrowserHost({ root, controller, requirement, draft, work: new OwnedWork(controller.signal), resume: false, io });
  const initial = await controller.read();
  const originals: PreparedTask[] = host.taskPolicies.map((policy, index) => {
    const task = taskFixture() as TaskContract, priorPolicies = index === 0 ? [] : index === 1 ? [host.taskPolicies[0]] : host.taskPolicies.slice(0, 2);
    const acceptanceIds = index === 0 ? [DESIGN_ACCEPTANCE_ID] : index === 1 ? [MEDIA_ACCEPTANCE_ID] : ['win'];
    Object.assign(task, { taskId: `original-${policy.role}`, kind: 'runtime_generation', runId: initial.run.runId, specVersion: requirement.specVersion, authorId: `author-${policy.role}`,
      objective: `Offline ${policy.role} output`, acceptanceIds, acceptance: requirement.acceptance.filter(item => acceptanceIds.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: [`evidence/original-${policy.role}/host-report.json`] })),
      inputs: [...host.availableArtifacts, ...priorPolicies.map(item => ({ artifactId: item.outputs[0].artifactId, version: item.outputs[0].version, location: item.outputs[0].location }))],
      dependsOn: priorPolicies.map(item => ({ taskId: `original-${item.role}`, requiredState: 'passed', state: 'not_started' })),
      context: { contextId: `context-${policy.role}`, rules: policy.rules, interfaces: [], knownFailures: [], tools: [] },
      ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths }, outputs: policy.outputs.map(item => ({ type: item.type, schema: item.schema, destination: item.destination })),
      budget: { ledgerId: initial.ledger.ledgerId, allocationMicroCny: policy.allocationMicroCny, originalDeadlineAt: initial.run.originalDeadlineAt }, state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
      handoff: { completed: [], remaining: [], uncertainty: [], resumeFrom: null }, review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    return { task, role: policy.role, workspace: root, expectedArtifacts: policy.outputs.map(item => ({ artifactId: item.artifactId, version: item.version, location: item.location })) };
  });
  let sequence = 0;
  const roleFactory: RoleFactory = async input => ({ actorId: input.role === 'reviewer' ? `reviewer-${input.task.taskId}` : input.task.authorId,
    contextId: input.role === 'reviewer' ? `review-${input.task.taskId}` : input.task.context.contextId, close: async () => {}, prompt: async () => {
      roleCalls.push(`${input.role}:${input.task.taskId}`);
      const requestId = `offline-${++sequence}`;
      await controller.reserve({ requestId, taskId: input.task.taskId, provider: 'offline', pricingVersion: 'fixture', estimatedMaxCostMicroCny: 10 }); await controller.admit(requestId);
      await controller.settle(requestId, 5, [{ artifactId: requestId, version: 'v1', location: 'offline-receipt.json' }]);
      if (input.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', inputVersions: [...input.task.inputs, ...input.task.artifacts], evidenceIds: input.task.evidence.map(item => item.evidenceId), findings: [] }) };
      if (continued) {
        const source = await snapshot(input.workspace);
        for (const ref of [...requirement.sources, ...input.task.inputs]) {
          assert.ok(source.has(ref.location) || [...source.keys()].some(name => name.startsWith(`${ref.location}/`)), `Missing mirrored input ${ref.location}`);
        }
      }
      if (input.role === 'design') await writeFile(join(input.workspace, 'authors/design/design.json'), !continued && failedRole === 'design' ? '{"incomplete":' : JSON.stringify(design), 'utf8');
      if (input.role === 'art') await writeFile(join(input.workspace, 'authors/art/media.json'), JSON.stringify(media), 'utf8');
      if (input.role === 'coding') {
        await writeFile(join(input.workspace, 'authors/coding/index.html'), continued ? '<div>fresh fixture</div>' : '<div>old partial fixture</div>', 'utf8');
        if (continued) await writeFile(join(input.workspace, 'authors/coding/src/main.ts'), '// Offline continuation fixture\n', 'utf8');
      }
      return { text: JSON.stringify({ summary: 'Offline role fixture', remaining: [], uncertainty: [] }) };
    } });
  const common = () => ({ controller, requirement, tasks: originals, sessionRoot: join(root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory,
    capture: host.capture, verify: host.verify, now, recovery: { journalRoot: join(root, 'journal'), artifactRoot: root, recoverCapture: host.recoverCapture } });
  const result = await executeTaskDag(common());
  assert.deepEqual(result.map(item => item.state), failedRole === 'design' ? ['failed', 'waiting_user', 'waiting_user'] : ['passed', 'passed', 'failed']);
  await controller.stop('Offline original stopped');
  const original = await controller.read(), oldAuthors = await snapshot(join(root, 'authors')); await controller.close();
  time += 13 * 60 * 60 * 1000; continued = true;
  const quote = await buildContinuationQuote({ root, additionalMicroCny: 10_000, additionalDurationMs: 600_000, now: time });
  const confirmation = { decisionId: 'host-decision', actorId: 'offline-user', decidedAt: new Date(time).toISOString(), source: { artifactId: 'continuation-confirmation', version: 'v1', location: 'confirmation.json' } };
  await writeFile(join(root, 'confirmation.json'), JSON.stringify({ formatVersion: 'continuation-confirmation-1', decisionId: confirmation.decisionId, actorId: confirmation.actorId, decidedAt: confirmation.decidedAt, confirmed: true, quote }), 'utf8');
  const window = await RunController.activateContinuation({ root, quote, confirmation, now }); controller = await RunController.open({ root, windowId: window.windowId, now });
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry' });
  const workspace = join(root, 'continuations/host-decision/workspace'); await mkdir(workspace, { recursive: true });
  const tasks = originals.map(item => {
    const grant = window.grants.find(grant => grant.sourceTaskId === item.task.taskId); if (!grant) return structuredClone(item);
    const task = structuredClone(item.task), output = item.role === 'coding' ? registry.candidateRef('game', 'continued-v1') : registry.artifactRef(item.role === 'design' ? 'design' : 'media', 'continued-v1');
    task.taskId = grant.taskId; task.authorId = `author-${grant.taskId}`; task.context.contextId = `context-${grant.taskId}`; task.budget.allocationMicroCny = grant.amountMicroCny;
    task.outputs[0].destination = output.location; task.dependsOn = task.dependsOn.map(dep => ({ ...dep, taskId: window.grants.find(grant => grant.sourceTaskId === dep.taskId)?.taskId ?? dep.taskId }));
    task.inputs = task.inputs.map(ref => {
      const source = originals.find(item => item.expectedArtifacts!.some(old => old.artifactId === ref.artifactId));
      return source && window.grants.some(grant => grant.sourceTaskId === source.task.taskId) ? registry.artifactRef(ref.artifactId, 'continued-v1') : ref;
    });
    return { ...item, task, workspace, expectedArtifacts: [output] };
  });
  const input = { root, controller, requirement, draft, work: new OwnedWork(controller.signal), resume: true, io, binding: { windowId: window.windowId, tasks } };
  host = await createBrowserHost(input as any);
  for (const item of tasks.filter(item => window.grants.some(grant => grant.taskId === item.task.taskId))) {
    await TaskJournal.open(common().recovery, { formatVersion: 2, executionWindow: taskWindowBinding(await controller.read(), item.task.taskId)!, runId: original.run.runId, ledgerId: original.ledger.ledgerId,
      originalStartedAt: original.run.originalStartedAt, originalDeadlineAt: original.run.originalDeadlineAt, limitMicroCny: original.ledger.limitMicroCny, requirement, prepared: item,
      reviewProtocolCorrections: 0, artifactRoot: root, sessionRoot: join(root, 'sessions') }, false);
  }
  await controller.registerTasks(tasks.filter(item => window.grants.some(grant => grant.taskId === item.task.taskId)).map(item => item.task));
  return { root, input, host, controller, tasks, window, original, oldAuthors, roleCalls, ioCalls, run: () => resumeTaskDag({ ...common(), tasks, windowId: window.windowId, preAuthor: (host as any).preAuthor } as any) };
}

for (const failedRole of ['coding', 'design'] as const) test(`production host uses fresh workspace and exact refs after ${failedRole} stopped`, async t => {
  const f = await fixture(t, failedRole), calls = f.roleCalls.length;
  assert.equal(typeof (f.host as any).preAuthor, 'function');
  const result = await f.run();
  assert.ok(result.tasks.every(item => item.state === 'passed'), JSON.stringify(result.blocked));
  assert.deepEqual(await snapshot(join(f.root, 'authors')), f.oldAuthors);
  assert.equal(f.roleCalls.slice(calls).filter(item => !item.startsWith('reviewer:')).length, f.window.grants.length);
  const reopened = await createBrowserHost(f.input as any);
  assert.equal((await reopened.finish(result.tasks)).delivery, undefined, 'A serialized report cannot recreate the original host WeakMap proof.');
  const delivery = await f.host.finish(result.tasks);
  assert.ok(delivery.delivery); assert.deepEqual(delivery.gaps, []);
  assert.equal(await readFile(join(f.root, delivery.delivery!, 'src/main.ts'), 'utf8'), '// Offline continuation fixture\n');
  assert.deepEqual(f.ioCalls.map(call => call.kind), ['build', 'play']);
  assert.ok(f.ioCalls.every(call => call.authority.taskId === call.taskId && call.authority.windowId === f.window.windowId && call.authority.deadlineAt === f.window.deadlineAt));
  assert.deepEqual((await f.controller.read()).stopReason, f.original.stopReason);
  assert.equal(await f.host.repair(result.tasks.at(-1)!, {} as any), null);
  assert.equal(await f.host.continuationTargets?.([], {} as any, {}), null);
});

test('changed original passed evidence blocks before any input mirror or new attempt', async t => {
  const f = await fixture(t), task = f.original.tasks.find(item => item.taskId === 'original-design')!;
  await writeFile(join(f.root, task.artifacts[0].location, '_cosmos/design.json'), JSON.stringify({ ...design, summary: 'changed after original review' }), 'utf8');
  const calls = f.roleCalls.length;
  await assert.rejects(f.run(), /fixed|evidence|changed/i);
  assert.equal(f.roleCalls.length, calls);
  assert.deepEqual(await snapshot(f.input.binding.tasks.find(item => item.role === 'coding')!.workspace), new Map());
  assert.ok((await f.controller.read()).tasks.filter(item => f.window.grants.some(grant => grant.taskId === item.taskId)).every(item => item.attempts.length === 0));
});

test('host refuses missing or wrong binding and cannot reinterpret a quoted task output', async t => {
  const f = await fixture(t);
  await assert.rejects(createBrowserHost({ ...f.input, binding: undefined } as any), /continuation|window/i);
  await assert.rejects(createBrowserHost({ ...f.input, binding: { ...f.input.binding, windowId: 'wrong-window' } } as any), /window/i);
  const tasks = structuredClone(f.tasks); tasks.at(-1)!.expectedArtifacts![0].location = 'registry/candidates/game/forged/project';
  await assert.rejects(createBrowserHost({ ...f.input, binding: { ...f.input.binding, tasks } } as any), /fixed|output|reference|binding/i);
});

test('reopening the same host binding retains already registered successor outputs', async t => {
  const f = await fixture(t), before = await f.controller.read();
  const reopened = await createBrowserHost(f.input as any);
  assert.equal(typeof (reopened as any).preAuthor, 'function');
  assert.deepEqual(await f.controller.read(), before);
});

test('preAuthor refuses unknown partial files in the new author area before mirroring or starting an attempt', async t => {
  const f = await fixture(t), item = f.tasks.find(item => item.role === 'coding')!;
  await mkdir(join(item.workspace, 'authors/coding'), { recursive: true });
  await writeFile(join(item.workspace, 'authors/coding/index.html'), '<p>unknown prior writer</p>', 'utf8');
  const before = await snapshot(item.workspace);
  await assert.rejects((f.host as any).preAuthor(item.task, f.controller.signal), /fresh|partial|author/i);
  assert.deepEqual(await snapshot(item.workspace), before);
  assert.equal((await f.controller.read()).tasks.find(task => task.taskId === item.task.taskId)!.attempts.length, 0);
});

test('current window stop prevents candidate promotion while keeping the original stop history', async t => {
  const f = await fixture(t), result = await f.run();
  assert.ok(result.tasks.every(task => task.state === 'passed'));
  await f.controller.stop('Stop this authorized fixture window before delivery');
  const count = f.ioCalls.length, delivery = await f.host.finish(result.tasks);
  assert.equal(delivery.delivery, undefined); assert.ok(delivery.gaps.length);
  assert.equal(f.ioCalls.length, count);
  assert.deepEqual((await f.controller.read()).stopReason, f.original.stopReason);
  const registry = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: 'registry' });
  assert.equal(await registry.current(), null);
});
