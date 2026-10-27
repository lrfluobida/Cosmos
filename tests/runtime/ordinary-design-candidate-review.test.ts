import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import type { TestContext } from 'node:test';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RecoveryBlocked, TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import { readCompletedGeneration } from '../../src/runtime/experience.ts';

const proposal = { summary: '候选保留原始作者报告。', remaining: ['需要独审核对最终计划顺序。'], uncertainty: ['作者不能确定最后修改后的自检状态。'] };
function review(packet: any, verdict: 'approved' | 'changes_requested', resolved = verdict === 'approved') {
  return { verdict, findings: verdict === 'approved' ? [] : ['light: 当前设计还缺少明确的完成状态说明，需修改设计后重新核对。'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId),
    concernResolutions: packet.designConcernReview.concerns.map((concern: any) => ({ concernId: concern.concernId,
      concernText: packet.designConcernReview.proposal[concern.field][concern.index], status: resolved ? 'resolved' : 'unresolved', basis: 'captured_output',
      rationale: 'light/readable: 在 _cosmos/design.json 与 acceptance-plan.json 中逐项核对完成状态和可见顺序；此为独立文本判断，不声称运行游戏通过。',
      acceptanceIds: packet.acceptance.map((row: any) => row.acceptanceId), inputVersions: packet.inputs.filter((ref: any) => ref.artifactId === 'design'), evidenceIds: [], evidenceRefs: [] })) };
}
for (const revisionPolicy of ['independent-review/1', 'independent-review/2'] as const) test(`${revisionPolicy} frozen design candidate keeps concerns and applies its exact review gate`, async t => {
  const f = await ordinaryHostFixture(t, { revisionPolicy, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'design') return { ...fallback, prompt: async (...args) => { await fallback.prompt(...args); return { text: JSON.stringify(proposal) }; } };
    if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { ...fallback, prompt: async () => {
      assert.deepEqual(packet.designConcernReview.proposal, proposal);
      return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId),
        concernResolutions: packet.designConcernReview.concerns.map((concern: any) => ({ concernId: concern.concernId, concernText: proposal[concern.field as 'remaining' | 'uncertainty'][concern.index],
          status: 'resolved', basis: 'host_evidence', rationale: 'light/readable: 当前 host-report.json 核对最终 acceptance-plan 的结构和 light 条目；完整范围另行独审。',
          acceptanceIds: packet.acceptance.map((row: any) => row.acceptanceId), inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId), evidenceRefs: packet.evidence.map((row: any) => row.source) })) }) };
    } };
    return fallback;
  } });
  const result: any = await f.execute(), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  if (revisionPolicy === 'independent-review/1') {
    assert.equal(state.tasks[0].state, 'failed'); assert.equal(state.tasks[0].artifacts[0].version, 'v1');
    assert.equal(f.packets.some(packet => ['reviewer', 'art', 'coding'].includes(packet.role)), false);
  } else {
    assert.equal(f.packets.filter(packet => packet.role === 'reviewer' && packet.taskId === 'design-task').length, 1, JSON.stringify(result.gaps));
    assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
    const author = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/author.json'), 'utf8'));
    assert.deepEqual(author.value.proposal, proposal); assert.deepEqual(state.tasks[0].handoff.remaining, []); assert.deepEqual(state.tasks[0].handoff.uncertainty, []);
  }
});

async function candidateFixture(t: TestContext, mode = 'revision', cutAfterDesign = false, fault?: string) {
  const f = await ordinaryHostFixture(t, { revisionPolicy: 'independent-review/2', fault, limits: { limitMicroCny: 5000000, durationMs: 1800000 },
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      if (cutAfterDesign && packet.role === 'art') throw new Error('Synthetic cutoff after independently reviewed design.');
      if (packet.role === 'design') return { ...fallback, prompt: async (...args) => {
        if (packet.taskId === 'design-task') { await fallback.prompt(...args); return { text: JSON.stringify(proposal) }; }
        const feedback = packet.inputs.find((ref: any) => ref.artifactId.startsWith('ordinary-design-review-feedback-'));
        const tool = (name: string, args: any) => config.tools!.find(tool => tool.name === name)!.execute('candidate-revision', args, undefined, undefined, undefined as any);
        const read = await tool('read', { path: feedback.location }); assert.match(JSON.stringify(read), /候选保留原始作者报告/);
        await tool('read', { path: packet.interfaces.find((ref: any) => ref.artifactId === 'design').location + '/_cosmos/design.json' });
        if (mode !== 'nochange') await tool('edit', { path: 'authors/design/design.json', edits: [{ oldText: '原创鼠标游戏', newText: '原创鼠标游戏：明确点击后完成' }] });
        await tool('validate-game-design', {});
        return { text: JSON.stringify({ summary: '按原固定feedback修订自己的输出。', remaining: [], uncertainty: [] }) };
      } };
      if (packet.role === 'reviewer' && packet.designConcernReview) return { ...fallback, prompt: async () => {
        if (packet.taskId !== 'design-task') {
          const read = config.tools!.find(tool => tool.name === 'read')!;
          const feedback = packet.inputs.find((ref: any) => ref.artifactId.startsWith('ordinary-design-review-feedback-'));
          await read.execute('review-original-feedback', { path: feedback.location }, undefined, undefined, undefined as any);
          await read.execute('review-original-design', { path: packet.interfaces.find((ref: any) => ref.artifactId === 'design').location + '/_cosmos/design.json' }, undefined, undefined, undefined as any);
        }
        const verdict = packet.taskId === 'design-task' && mode !== 'approved' || mode === 'second-rejection' ? 'changes_requested' : 'approved';
        const result = review(packet, verdict, mode === 'other-gap' || verdict === 'approved');
        if (mode === 'invalid-review') result.concernResolutions = [];
        return { text: JSON.stringify(result) };
      } };
      return fallback;
    } });
  return f;
}
for (const mode of ['revision', 'nochange', 'second-rejection', 'other-gap', 'invalid-review']) test(`/2 candidate ${mode} preserves the single revision and fresh review boundary`, async t => {
  const f = await candidateFixture(t, mode), result: any = await f.execute(), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(f.packets.filter(p => p.role === 'design').length, mode === 'invalid-review' ? 1 : 2);
  assert.equal(f.packets.filter(p => p.role === 'reviewer' && p.taskId.startsWith('design-task')).length, ['nochange', 'invalid-review'].includes(mode) ? 1 : 2);
  const author = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/author.json'), 'utf8')); assert.deepEqual(author.value.proposal, proposal);
  const concerns = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/design-concerns.json'), 'utf8')); assert.deepEqual(concerns.value.proposal, proposal);
  if (['revision', 'other-gap'].includes(mode)) {
    assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
    for (const packet of f.packets.filter(p => ['art', 'coding'].includes(p.role))) assert.equal(packet.inputs.find((ref: any) => ref.artifactId === 'design').version, 'v2');
    const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
    assert.equal(execution.ordinaryDesignRevisionPolicy, 'independent-review/2');
    assert.equal((await readCompletedGeneration(f.root, execution.requirement))!.outcome, 'awaiting_user_experience');
    for (const taskId of ['design-task', 'design-task-revision', 'art-task', 'coding-task']) {
      const origin = JSON.parse(await readFile(join(f.root, `journal/task-${taskId}/origin.json`), 'utf8'));
      assert.equal(origin.ordinaryDesignRevisionPolicy, taskId.startsWith('design-task') ? 'independent-review/2' : undefined);
    }
  } else {
    assert.equal(result.outcome, 'incomplete'); assert.equal(f.packets.some(p => ['art', 'coding'].includes(p.role)), false);
    if (mode === 'invalid-review') assert.ok(await readFile(join(state.tasks[0].attempts[0].sessionRef, 'review-correction.json')));
  }
});

test('/2 malformed capture cannot reach host-evidence review despite a confident report', async t => {
  const f = await ordinaryHostFixture(t, { revisionPolicy: 'independent-review/2', fault: 'coverage' }); await f.execute();
  assert.equal(f.packets.some(p => ['reviewer', 'art', 'coding'].includes(p.role)), false);
});

for (const boundary of ['capture', 'design-concerns', 'verify-started', 'verified', 'review-started', 'review', 'system-handoff', 'correction-started']) test(`/2 cold recovery ${boundary} reuses complete receipts and blocks unknown work`, async t => {
  const f = await candidateFixture(t, 'approved', true); let interrupted = false, reviewPrompts = 0, hostChecks = 0;
  const write = TaskJournal.prototype.write;
  t.mock.method(TaskJournal.prototype, 'write', async function (this: TaskJournal, ...args: Parameters<typeof write>) {
    await write.apply(this, args);
    if (!interrupted && args[0] === boundary) { interrupted = true; throw new RecoveryBlocked(`Synthetic interruption after ${boundary}.`); }
  });
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...f.hostOptions }), verify = host.verify;
    host.verify = async (...args) => { if (args[0].taskId === 'design-task') hostChecks++; return verify(...args); };
    const roles = host.roleFactory;
    host.roleFactory = async roleInput => {
      const role = await roles(roleInput); if (roleInput.role !== 'reviewer' || roleInput.task.taskId !== 'design-task') return role;
      return { ...role, prompt: async (...args) => {
        reviewPrompts++;
        if (boundary === 'correction-started' && !interrupted) {
          if (reviewPrompts === 1) return { text: '{}' };
          interrupted = true; throw new RecoveryBlocked('Synthetic interruption after protocol correction started.');
        }
        return role.prompt(...args);
      } };
    };
    if (boundary === 'system-handoff' && !input.resume) {
      const save = hostInput.controller.saveTask.bind(hostInput.controller);
      hostInput.controller.saveTask = async (...args) => {
        await save(...args);
        if (!interrupted && args[0].taskId === 'design-task' && args[0].review.verdict === 'pending' && args[0].attempts.at(-1)?.outcome === 'passed') {
          interrupted = true; throw new RecoveryBlocked('Synthetic interruption after deterministic system handoff.');
        }
      };
    }
    return host;
  } });
  await f.execute(); assert.equal(interrupted, true);
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8')), beforePrompts = reviewPrompts;
  await f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), task = state.tasks.find((row: any) => row.taskId === 'design-task');
  assert.equal(f.packets.filter(p => p.role === 'design').length, 1);
  if (['verify-started', 'review-started', 'correction-started'].includes(boundary)) {
    assert.notEqual(task.state, 'passed'); assert.equal(reviewPrompts, beforePrompts);
    assert.equal(f.packets.some(p => ['art', 'coding'].includes(p.role)), false);
  } else { assert.equal(task.state, 'passed'); assert.equal(reviewPrompts, 1); }
  assert.equal(hostChecks, boundary === 'verify-started' ? 0 : 1);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'journal/task-design-task/author.json'), 'utf8')).value.proposal, proposal);
});

test('/2 verified host failure and changed origin cannot be promoted or re-dispatched', async t => {
  const f = await candidateFixture(t, 'approved', true);
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...f.hostOptions }), verify = host.verify;
    host.verify = async (...args) => (await verify(...args)).map(row => ({ ...row, outcome: 'failed' as const }));
    return host;
  } });
  await f.execute(); assert.equal(f.packets.some(p => p.role === 'reviewer'), false);
  const originPath = join(f.root, 'journal/task-design-task/origin.json'), bytes = await readFile(originPath), origin = JSON.parse(bytes.toString('utf8'));
  delete origin.ordinaryDesignRevisionPolicy; await writeFile(originPath, JSON.stringify(origin), 'utf8');
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8')), before = f.packets.length;
  await f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true });
  assert.equal(f.packets.length, before); await writeFile(originPath, bytes);
});

test('/2 format correction preserves the original unstructured self-report for independent review', async t => {
  const originalReply = '原始自述：尚不能确认完整覆盖。这不是合法的 JSON。'; let reviewed = false;
  const f = await ordinaryHostFixture(t, { revisionPolicy: 'independent-review/2', sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'design') return { ...fallback, prompt: async (...args) => { await fallback.prompt(...args); return { text: originalReply }; }, readonlyPrompt: async () => ({ text: JSON.stringify(proposal) }) };
    if (packet.designConcernReview) return { ...fallback, prompt: async () => {
      reviewed = true; assert.equal(packet.designConcernReview.originalReply, originalReply); assert.deepEqual(packet.designConcernReview.proposal, proposal);
      return { text: JSON.stringify(review(packet, 'approved')) };
    } };
    if (packet.role === 'art') throw new Error('Synthetic cutoff after reviewed design.');
    return fallback;
  } });
  await f.execute(); assert.equal(reviewed, true);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(state.tasks[0].state, 'passed');
  const correction = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/author-correction-started.json'), 'utf8'));
  assert.equal(correction.value.originalReply, originalReply);
});

test('/2 read mirror tamper is rejected before the reviewer can inspect another capture', async t => {
  const f = await candidateFixture(t, 'approved', true);
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...f.hostOptions }), verify = host.verify;
    host.verify = async (...args) => { const evidence = await verify(...args);
      if (args[0].taskId === 'design-task') await writeFile(join(f.root, 'reviews/design-task/registry/captures/design/v1/files/_cosmos/design.json'), '{}', 'utf8');
      return evidence;
    }; return host;
  } });
  await f.execute(); assert.equal(f.packets.some(p => p.role === 'reviewer'), false);
});

test('old /1 cold execution and missing or unknown policy never acquire /2 reviewer authority', async t => {
  const f = await ordinaryHostFixture(t, { revisionPolicy: 'independent-review/1', sessionFactory: async (config, fallback) => {
    return JSON.parse(config.context!).role === 'design' ? { ...fallback, prompt: async (...args) => { await fallback.prompt(...args); return { text: JSON.stringify(proposal) }; } } : fallback;
  } });
  await f.execute(); const executionPath = join(f.root, 'execution.json'), executionBytes = await readFile(executionPath), execution = JSON.parse(executionBytes.toString('utf8'));
  const originPath = join(f.root, 'journal/task-design-task/origin.json'), origin = await readFile(originPath), before = f.packets.length;
  await f.host.execute({ root: f.root, draft: f.draft, requirement: execution.requirement, resume: true });
  assert.equal(f.packets.length, before); assert.deepEqual(await readFile(originPath), origin);
  for (const value of [null, 'unknown']) {
    await writeFile(executionPath, JSON.stringify({ ...execution, ordinaryDesignRevisionPolicy: value }), 'utf8');
    await assert.rejects(f.host.execute({ root: f.root, draft: f.draft, requirement: execution.requirement, resume: true }), /revision policy/);
  }
  await writeFile(executionPath, executionBytes); assert.equal(f.packets.length, before);
});
