import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../src/roles/requirements.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { executeGeneration, type HostInput } from '../../src/runtime/entrypoint.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { readRunStatus } from '../../src/cli/control.ts';

async function fixture(t: test.TestContext, failure: 'design' | 'art' | 'coding' | 'encoding' | 'design-missing' | 'coding-missing', interrupt?: 'capture' | 'verify' | 'review', childFailure = false) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-entry-group-')); t.after(() => rm(root, { recursive: true, force: true }));
  const intake = await IntakeController.create({ root, runId: 'group-game', ledgerId: 'original-ledger', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 10_000_000 }, { taskId: 'planning', amountMicroCny: 10_000_000 }] });
  const draft = withHostStages({ brief: '点击原创星星获胜', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '点星星显示胜利' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点星星', steps: ['点击星星'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'user', at: new Date().toISOString() });
  const original = await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  await mkdir(join(root, 'toolchain'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', name), name === 'vite.config.ts' ? 'export default {}' : '{}', 'utf8');
  const calls: string[] = []; let interrupted = false;
  const design = { summary: '原创点击游戏', implementationNotes: ['点击星星获胜'], acceptanceMapping: { win: '点击目标显示胜利' }, characters: [{ id: 'star', purpose: '目标', states: ['idle'] }], audio: [] };
  const media = { characters: [{ id: 'star', width: 32, height: 32, anchor: { x: 16, y: 16 }, layers: [{ id: 'body', shape: 'rect', x: 4, y: 4, width: 24, height: 24, fill: '#FFD700', stroke: '#000000', strokeWidth: 0 }], states: [{ name: 'idle', fps: 8, loop: true, frames: [{}] }] }], audio: [] };
  const createHost = async (input: HostInput) => {
    const host = await createBrowserHost({ ...input, io: {
      async build(project, taskId) {
        calls.push(`build:${taskId}`);
        if (failure === 'coding' && taskId === 'coding-task' || childFailure && taskId.endsWith('-successor')) return { passed: false, diagnostics: 'Fake compiler: wrong click handler.' };
        await mkdir(join(project, 'dist')); await cp(join(project, 'public/assets'), join(project, 'dist/assets'), { recursive: true }); await writeFile(join(project, 'dist/index.html'), '<button id="star">star</button>', 'utf8'); return { passed: true, diagnostics: 'Fake build' };
      },
      async play(plan) {
        calls.push(`play:${plan.taskId}`);
        return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan, outcome: 'passed', browser: { version: 'fake-browser' }, cleanup: { processExited: true }, errors: [], reportPath: 'fake', files: [], evidence: [],
          steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId, outcome: 'passed', expected: step.expected ?? 'input', actual: step.expected ?? 'input', screenshot: null })) } as any;
      },
    } });
    const capture = host.capture, verify = host.verify;
    host.capture = async (...args) => { const result = await capture(...args); if (interrupt === 'capture' && args[0].taskId.endsWith('-repair') && !interrupted) { interrupted = true; throw new RecoveryBlocked('Offline fixture interrupted after fixed capture.'); } return result; };
    host.verify = async (...args) => { if (interrupt === 'verify' && args[0].taskId.endsWith('-repair') && !interrupted) { interrupted = true; throw new RecoveryBlocked('Offline fixture interrupted after verify-started.'); } return verify(...args); };
    host.roleFactory = async input => {
      const billing = createRoleBudget({ controller: input.controller, taskId: input.task.taskId, evidenceDirectory: input.stateDirectory });
      return { actorId: `${input.role}-${input.task.taskId}`, contextId: `context-${input.role}-${input.task.taskId}`, close: async () => {}, prompt: async () => {
        calls.push(`${input.role}:${input.task.taskId}`); const requestId = `fake-${calls.length}`;
        await billing.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 10, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 20 });
        await billing.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        if (input.role === 'cosmos') return { text: JSON.stringify({ tasks: [
          { taskId: 'design-task', policyId: 'game-design', role: 'design', objective: '设计原创点击游戏', acceptanceIds: [DESIGN_ACCEPTANCE_ID], dependsOn: [] },
          { taskId: 'art-task', policyId: 'game-art', role: 'art', objective: '创作星星动画', acceptanceIds: [MEDIA_ACCEPTANCE_ID], dependsOn: ['design-task'] },
          { taskId: 'coding-task', policyId: 'game-code', role: 'coding', objective: draft.brief, acceptanceIds: ['win'], dependsOn: ['design-task', 'art-task'] },
        ] }) };
        if (input.role === 'reviewer') {
          if (interrupt === 'review' && input.task.taskId.endsWith('-repair') && !interrupted) { interrupted = true; throw new RecoveryBlocked('Offline fixture interrupted after review request.'); }
          return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: [...input.task.inputs, ...input.task.artifacts], evidenceIds: input.task.evidence.map(item => item.evidenceId) }) };
        }
        if (input.role === 'design' && !(failure === 'design-missing' && input.task.taskId === 'design-task')) await writeFile(join(root, 'authors/design/design.json'), failure === 'encoding' ? Buffer.from([0xff, 0xfe, 0x41]) : failure === 'design' && input.task.taskId === 'design-task' ? '{"原始错误":' : JSON.stringify(design));
        if (input.role === 'art') await writeFile(join(root, 'authors/art/media.json'), JSON.stringify(failure === 'art' && input.task.taskId === 'art-task' ? { characters: [], audio: [] } : media), 'utf8');
        if (input.role === 'coding') {
          await writeFile(join(root, 'authors/coding/src/main.ts'), '// fake provider output\n', 'utf8');
          if (!(failure === 'coding-missing' && input.task.taskId === 'coding-task')) await writeFile(join(root, 'authors/coding/index.html'), '<div id="app"></div>', 'utf8');
        }
        return { text: JSON.stringify({ summary: 'Scoped fake output', remaining: [], uncertainty: [] }) };
      } };
    };
    return host;
  };
  return { root, original, draft, requirement, createHost, calls };
}

for (const failure of ['design', 'art', 'coding'] as const) test(`${failure} repair completes the effective DAG with exact successors and no repeated passed ancestor charges`, async t => {
  const f = await fixture(t, failure), result = await executeGeneration({ ...f, resume: false });
  assert.equal(result.outcome, 'awaiting_user_experience');
  const plan = JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8')), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(plan.formatVersion, 2); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt); assert.equal(state.ledger.ledgerId, f.original.ledger.ledgerId);
  assert.equal(state.run.fees.settledMicroCny, 80); assert.equal(state.run.fees.reservedMicroCny, 0); assert.deepEqual(state.run.fees.unknownRequestIds, []);
  assert.deepEqual(state.ledger.allocations.slice(0, plan.allocationsBefore.length), plan.allocationsBefore);
  const failed = state.tasks.find((task: any) => task.taskId === `${failure}-task`); assert.equal(failed.state, 'failed'); assert.equal(failed.attempts.length, 1);
  const sourceIds = failure === 'design' ? ['design-task', 'art-task', 'coding-task'] : failure === 'art' ? ['art-task', 'coding-task'] : ['coding-task'];
  assert.deepEqual(plan.replacements.map((item: any) => item.sourceTaskId), sourceIds);
  assert.ok(plan.tasks.every((item: any) => state.tasks.find((task: any) => task.taskId === item.task.taskId)?.state === 'passed'));
  for (const role of ['design', 'art', 'coding']) assert.equal(f.calls.filter(call => call === `${role}:${role}-task`).length, sourceIds.includes(`${role}-task`) && role !== failure ? 0 : 1);
  const code = state.tasks.find((task: any) => task.taskId === (failure === 'coding' ? 'coding-task-repair' : 'coding-task-successor'));
  assert.deepEqual(code.inputs.filter((ref: any) => ['design', 'media'].includes(ref.artifactId)).map((ref: any) => [ref.artifactId, ref.version]), [['design', failure === 'design' ? 'v2' : 'v1'], ['media', failure === 'coding' ? 'v1' : 'v2']]);
  const snapshotBytes = await readFile(join(f.root, 'snapshot.json'), 'utf8');
  const status = await readRunStatus(f.root); assert.equal(status.tasks.find(task => task.taskId === `${failure}-task`)?.supersededBy, `${failure}-task-repair`);
  assert.equal(await readFile(join(f.root, 'snapshot.json'), 'utf8'), snapshotBytes);
  const before = [...f.calls], fees = state.run.fees;
  const resumed = await executeGeneration({ ...f, resume: true }); assert.equal(resumed.outcome, 'awaiting_user_experience'); assert.deepEqual(f.calls, before);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).run.fees, fees);
  if (failure !== 'coding') {
    const ref = plan.tasks.find((item: any) => item.task.taskId === `${failure}-task-repair`).task.context.interfaces.find((ref: any) => ref.artifactId.startsWith('failure-source-'));
    const manifest = JSON.parse(await readFile(join(f.root, ref.location, 'manifest.json'), 'utf8')); assert.equal(manifest.taskId, failed.taskId); assert.equal(manifest.attemptId, failed.attempts[0].attemptId);
    assert.notEqual(await readFile(join(f.root, ref.location, 'raw.json'), 'utf8'), await readFile(join(f.root, `authors/${failure}/${failure === 'design' ? 'design' : 'media'}.json`), 'utf8'));
  }
});

test('a repaired upstream fixed capture resumes without a second author call or a new group', async t => {
  const f = await fixture(t, 'design', 'capture'), first = await executeGeneration({ ...f, resume: false }); assert.equal(first.outcome, 'incomplete');
  const plan = await readFile(join(f.root, 'repair-plan.json'), 'utf8'), before = f.calls.filter(call => call === 'design:design-task-repair').length;
  const resumed = await executeGeneration({ ...f, resume: true }); assert.equal(resumed.outcome, 'awaiting_user_experience');
  assert.equal(f.calls.filter(call => call === 'design:design-task-repair').length, before); assert.equal(await readFile(join(f.root, 'repair-plan.json'), 'utf8'), plan);
});

for (const stage of ['verify', 'review'] as const) test(`an unreceipted ${stage} stage remains blocked and cannot consume another paid attempt`, async t => {
  const f = await fixture(t, 'art', stage), first = await executeGeneration({ ...f, resume: false }); assert.equal(first.outcome, 'incomplete');
  assert.equal(JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8')).formatVersion, 2);
  assert.equal(f.calls.filter(call => call === 'art:art-task-repair').length, 1);
  const before = [...f.calls], resumed = await executeGeneration({ ...f, resume: true }); assert.equal(resumed.outcome, 'incomplete'); assert.deepEqual(f.calls, before);
  assert.ok(resumed.gaps.some(gap => /durable|started|dependency/i.test(gap)));
});

test('a failed downstream successor does not receive another semantic repair', async t => {
  const f = await fixture(t, 'design', undefined, true), result = await executeGeneration({ ...f, resume: false }); assert.equal(result.outcome, 'incomplete');
  const plan = JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8')); assert.equal(plan.replacements.filter((item: any) => item.kind === 'repair').length, 1);
  assert.equal(result.taskHistory.filter(task => task.taskId.includes('-repair')).length, 1);
  const before = [...f.calls]; await executeGeneration({ ...f, resume: true }); assert.deepEqual(f.calls, before);
});

test('unknown output encoding remains insufficient evidence and cannot authorize a new group', async t => {
  const f = await fixture(t, 'encoding'), result = await executeGeneration({ ...f, resume: false }); assert.equal(result.outcome, 'incomplete');
  await assert.rejects(readFile(join(f.root, 'repair-plan.json')), { code: 'ENOENT' });
  assert.deepEqual(f.calls.filter(call => call.startsWith('design:')), ['design:design-task']);
});

for (const failure of ['design-missing', 'coding-missing'] as const) test(`${failure} gets bounded feedback only after preserving the missing-file fact and every existing author file`, async t => {
  const f = await fixture(t, failure), result = await executeGeneration({ ...f, resume: false }); assert.equal(result.outcome, 'awaiting_user_experience');
  const plan = JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8'));
  const repaired = plan.tasks.find((item: any) => item.task.taskId.endsWith('-repair'));
  const ref = repaired.task.context.interfaces.find((ref: any) => ref.artifactId.startsWith('failure-source-'));
  const manifest = JSON.parse(await readFile(join(f.root, ref.location, 'manifest.json'), 'utf8'));
  assert.equal(manifest.diagnosis.kind, 'missing_output'); assert.ok(manifest.files.some((file: any) => file.present === false));
  if (failure === 'coding-missing') {
    const file = manifest.files.find((file: any) => file.sourcePath === 'authors/coding/src/main.ts'); assert.equal(file.present, true);
    assert.equal(await readFile(join(f.root, ref.location, file.snapshotPath), 'utf8'), '// fake provider output\n');
  }
});

test('an old B upstream repair plan keeps its original semantics and allocation on resume', async t => {
  const f = await fixture(t, 'design');
  const createLegacyHost = async (input: HostInput) => { const host = await f.createHost(input); delete host.continuationTargets; return host; };
  const first = await executeGeneration({ ...f, createHost: createLegacyHost, resume: false }); assert.equal(first.outcome, 'incomplete');
  const plan = await readFile(join(f.root, 'repair-plan.json'), 'utf8'); assert.equal(JSON.parse(plan).formatVersion, undefined);
  const before = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), calls = [...f.calls];
  const resumed = await executeGeneration({ ...f, resume: true }); assert.equal(resumed.outcome, 'incomplete');
  assert.deepEqual(f.calls, calls); assert.equal(await readFile(join(f.root, 'repair-plan.json'), 'utf8'), plan);
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.deepEqual(after.ledger, before.ledger); assert.equal(after.tasks.length, 4);
  assert.equal(after.tasks.find((task: any) => task.taskId === 'art-task').attempts.length, 0);
});
