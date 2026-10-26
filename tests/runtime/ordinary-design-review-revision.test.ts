import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { deliveryTaskProofs, readCompletedGeneration } from '../../src/runtime/experience.ts';
import { readDesignRevisionPlan, readDesignSelection } from '../../src/runtime/entrypoint-design-revision.ts';
import { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { lazyStream } from '@earendil-works/pi-ai';
import { createPiSession } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import type { RunController } from '../../src/runtime/run.ts';
import { readConfirmedRequirementsSource } from '../../src/runtime/confirmed-requirements-source.ts';
import { runProductSession } from '../../src/cli/session.ts';
import { Readable, Writable } from 'node:stream';

test('initial ordinary design failure reports only persisted task proofs', async t => {
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    return packet.role === 'design' ? { ...fallback, prompt: async () => { throw new Error('Synthetic failed design author'); } } : fallback;
  } });
  const result: any = await f.execute(), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.length, 1); assert.equal(state.tasks[0].state, 'failed');
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, 1);
  assert.equal(f.packets.some(packet => ['reviewer', 'art', 'coding'].includes(packet.role)), false);
  assert.deepEqual(result.effectiveTasks, deliveryTaskProofs(state.tasks));
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.automaticAcceptance, 'not_passed'); assert.equal(result.acceptedCandidate, undefined);
  assert.equal(result.ordinaryDesignReview.revisionAttempted, false); assert.equal(result.ordinaryDesignReview.selectedVersion, null);
  assert.match(result.gaps.join(' '), /素材/); assert.match(result.gaps.join(' '), /完成游戏/);
  assert.equal(result.completionTiming.current.status, 'in_time'); assert.ok(result.completionTiming.cleanup.every((row: any) => row.outcome === 'closed'));
  for (const path of ['ordinary-design-revision-plan.json', 'ordinary-design-selection.json', 'journal/task-art-task/origin.json', 'journal/task-coding-task/origin.json']) await assert.rejects(readFile(join(f.root, path)), { code: 'ENOENT' });
  assert.equal(state.ledger.allocations.some((row: any) => ['art-task', 'coding-task'].includes(row.taskId)), false);
});

test('independent rejection reaches one revision with frozen feedback and isolated source', async t => {
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, limits: { limitMicroCny: 5000000, durationMs: 1800000 },
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({
        verdict: 'changes_requested', findings: ['原需求的完成状态需要明确说明。'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId),
      }) }) };
      if (packet.role === 'design' && packet.taskId !== 'design-task') return { close: fallback.close, prompt: async () => {
        assert.match(config.workspace, /continuations[\\/]design-task-revision[\\/]workspace$/);
        const invoke = async (name: string, args: any) => config.tools!.find(tool => tool.name === name)!.execute('revision-source', args, undefined, undefined, undefined as any);
        const feedback = packet.inputs.find((ref: any) => ref.artifactId.startsWith('ordinary-design-review-feedback-'));
        assert.ok(feedback); assert.equal(packet.inputs.some((ref: any) => ref.artifactId === 'design'), false);
        const read = await invoke('read', { path: feedback.location }); assert.match(JSON.stringify(read), /independent_model_review/);
        await invoke('read', { path: 'authors/design/design.json' });
        const edited = await invoke('edit', { path: 'authors/design/design.json', edits: [{ oldText: '原创鼠标游戏', newText: '原创鼠标游戏，点击后明确显示完成状态' }] });
        assert.equal((edited as any).isError ?? false, false);
        await invoke('validate-game-design', {});
        return { text: JSON.stringify({ summary: 'Read fixed feedback and clarified original requirement', remaining: [], uncertainty: [] }) };
      } };
      return fallback;
    } });
  const result: any = await f.execute();
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const original = state.tasks.find((task: any) => task.taskId === 'design-task');
  assert.equal(original.state, 'needs_changes');
  assert.equal(original.evidence.every((e: any) => e.outcome === 'passed'), true);
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, 2);
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  const revision = state.tasks.find((task: any) => task.taskId === 'design-task-revision');
  assert.equal(revision.state, 'passed'); assert.equal(revision.artifacts[0].version, 'v2');
  for (const packet of f.packets.filter(packet => ['art', 'coding'].includes(packet.role))) assert.equal(packet.inputs.find((ref: any) => ref.artifactId === 'design').version, 'v2');
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
  assert.equal((await readCompletedGeneration(f.root, execution.requirement))!.outcome, 'awaiting_user_experience');
  const before = await readFile(join(f.root, 'snapshot.json'));
  const reader = { read: async () => state };
  await readDesignSelection(f.root, reader, execution);
  for (const path of ['ordinary-design-selection.json', 'ordinary-design-revision-plan.json', 'design-review-feedback/design-task.json',
    'journal/task-design-task/review.json', original.artifacts[0].location + '/_cosmos/design.json', execution.requirement.sources[0].location,
    'continuations/design-task-revision/workspace/' + original.artifacts[0].location + '/_cosmos/design.json',
    'reviews/design-task-revision/' + original.artifacts[0].location + '/_cosmos/design.json']) {
    const saved = await readFile(join(f.root, path)); await writeFile(join(f.root, path), '{}', 'utf8');
    try { await assert.rejects(readDesignSelection(f.root, reader, execution)); await assert.rejects(readCompletedGeneration(f.root, execution.requirement)); }
    finally { await writeFile(join(f.root, path), saved); }
  }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

async function rejectedFixture(t: TestContext, mode: string) {
  let denied = false;
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, fault: mode === 'recovery-coding-repair' ? 'code-repair' : undefined, limits: { limitMicroCny: 5000000, durationMs: 1800000 },
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      if (packet.role === 'reviewer' && packet.taskId === 'design-task') return {
        close: async () => {
          await fallback.close();
          if (mode === 'missing-review-started') await rename(join(f.root, 'journal/task-design-task/review-started.json'), join(f.root, 'journal/task-design-task/review-started.preserved.json'));
          if (mode === 'source-bytes') await writeFile(join(f.root, 'registry/captures/design/v1/files/_cosmos/design.json'), '{}', 'utf8');
          if (mode === 'bad-signature' || mode === 'same-author') {
            const path = join(f.root, 'journal/task-design-task/review.json'), review = JSON.parse(await readFile(path, 'utf8'));
            if (mode === 'bad-signature') review.value.signature = [];
            else review.value.reviewerId = 'design-task-author';
            await writeFile(path, JSON.stringify(review), 'utf8');
          }
        }, prompt: async () => ({ text: JSON.stringify({ verdict: 'changes_requested', findings: mode === 'empty' ? [] : mode === 'blank' ? ['  '] : ['保留全部原需求，明确完成状态。'],
          inputVersions: packet.inputs, evidenceIds: mode === 'duplicate-evidence' ? [packet.evidence[0].evidenceId, packet.evidence[0].evidenceId] : packet.evidence.map((e: any) => e.evidenceId) }) }),
      };
      if (packet.taskId !== 'design-task' && packet.role === 'design') return { close: fallback.close, prompt: async () => {
        const invoke = async (name: string, args: any) => config.tools!.find(tool => tool.name === name)!.execute('negative-revision', args, undefined, undefined, undefined as any);
        if (mode === 'scope') {
          const ref = packet.inputs.find((ref: any) => ref.artifactId === 'user-confirmation'), before = await readFile(join(f.root, ref.location));
          try { const result = await invoke('write', { path: ref.location, content: '{}' }); denied = !!(result as any).isError; }
          catch { denied = true; }
          assert.equal(denied, true); assert.deepEqual(await readFile(join(f.root, ref.location)), before);
        }
        if (mode !== 'unchanged') await invoke('edit', { path: 'authors/design/design.json', edits: [{ oldText: '原创鼠标游戏', newText: '原创鼠标游戏完成状态说明' }] });
        await invoke('validate-game-design', {});
        return { text: JSON.stringify({ summary: 'Bounded synthetic revision', remaining: [], uncertainty: [] }) };
      } };
      if (packet.role === 'reviewer' && packet.taskId !== 'design-task') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({
        verdict: mode.startsWith('recovery') ? 'approved' : 'changes_requested', findings: mode.startsWith('recovery') ? [] : ['修订仍未满足完整原需求。'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId),
      }) }) };
      return fallback;
    } });
  return { f, denied: () => denied };
}
for (const mode of ['rejection', 'unchanged', 'scope']) test(`revision ${mode} stops without a third author or downstream`, async t => {
  const { f, denied } = await rejectedFixture(t, mode), result: any = await f.execute();
  assert.equal(f.packets.filter(p => p.role === 'design').length, 2);
  assert.equal(f.packets.filter(p => p.role === 'reviewer').length, mode === 'unchanged' ? 1 : 2);
  assert.equal(f.packets.filter(p => ['art', 'coding'].includes(p.role)).length, 0);
  assert.equal(result.outcome, 'incomplete'); assert.match(result.gaps.join(' '), mode === 'unchanged' ? /no_output_change/ : /design_revision_limit/);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.length, 2); assert.equal(state.ledger.allocations.some((item: any) => ['art-task', 'coding-task'].includes(item.taskId)), false);
  if (mode === 'rejection') {
    assert.deepEqual(result.effectiveTasks, deliveryTaskProofs(state.tasks.filter((task: any) => task.taskId === 'design-task-revision')));
    assert.deepEqual(result.taskHistory.map((task: any) => task.taskId), ['design-task', 'design-task-revision']);
    assert.equal(result.ordinaryDesignReview.revisionAttempted, true); assert.equal(result.ordinaryDesignReview.selectedVersion, null);
    assert.equal(result.ordinaryDesignReview.sourceTaskId, 'design-task');
    assert.match(result.gaps.join(' '), /素材/); assert.match(result.gaps.join(' '), /完成游戏/);
    assert.equal(result.completionTiming.current.status, 'in_time'); assert.ok(result.completionTiming.cleanup.every((row: any) => row.outcome === 'closed'));
  }
  assert.equal((await readFile(join(f.root, 'registry/captures/design/v1/files/_cosmos/design.json'), 'utf8')).includes('原创鼠标游戏'), true);
  if (mode === 'scope') assert.equal(denied(), true);
});

for (const boundary of ['plan', 'registered', 'author-started', 'captured', 'review-started', 'review-recorded', 'selection', 'coding-repair']) test(`revision recovery ${boundary} preserves completed work and never repeats unknown calls`, async t => {
  const { f } = await rejectedFixture(t, `recovery-${boundary}`); let interrupted = false;
  f.host.execute = async input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...f.hostOptions });
    if (input.resume) return host;
    const stop = () => { interrupted = true; throw new RecoveryBlocked(`Synthetic interruption at ${boundary}.`); };
    const bind = host.bindPreparedTasks!.bind(host);
    host.bindPreparedTasks = async tasks => {
      await bind(tasks);
      if (!interrupted && (boundary === 'plan' && tasks.some(item => item.task.taskId === 'design-task-revision')
        || boundary === 'selection' && tasks.some(item => item.role === 'art'))) stop();
    };
    const register = hostInput.controller.registerTasks.bind(hostInput.controller);
    hostInput.controller.registerTasks = async tasks => {
      await register(tasks); if (!interrupted && boundary === 'registered' && tasks.some(task => task.taskId === 'design-task-revision')) stop();
    };
    const save = hostInput.controller.saveTask.bind(hostInput.controller);
    hostInput.controller.saveTask = async (...args) => {
      await save(...args);
      if (!interrupted && boundary === 'captured' && args[0].taskId === 'design-task-revision' && args[0].artifacts.length && !args[0].evidence.length) stop();
      if (!interrupted && boundary === 'review-recorded' && args[0].taskId === 'design-task-revision' && args[0].state === 'passed') stop();
    };
    const roles = host.roleFactory;
    host.roleFactory = async roleInput => {
      if (!interrupted && (boundary === 'author-started' && roleInput.task.taskId === 'design-task-revision' && roleInput.role === 'design'
        || boundary === 'coding-repair' && roleInput.task.taskId === 'coding-task-repair' && roleInput.role === 'coding')) stop();
      const session = await roles(roleInput);
      if (roleInput.task.taskId !== 'design-task-revision' || roleInput.role !== 'reviewer') return session;
      return { ...session, prompt: async (...args) => { if (!interrupted && boundary === 'review-started') stop(); return session.prompt(...args); } };
    };
    return host;
  } });
  const first: any = await f.execute(); assert.equal(interrupted, true);
  // A complete review receipt may finish in the same invocation; the resume must still reuse it.
  assert.equal(first.outcome, boundary === 'review-recorded' ? 'awaiting_user_experience' : 'incomplete');
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
  const before = f.packets.map(p => ({ taskId: p.taskId, role: p.role }));
  const resumed = await f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true });
  assert.equal(f.packets.filter(p => p.role === 'cosmos').length, 1);
  assert.equal(f.packets.filter(p => p.taskId === 'design-task' && p.role === 'design').length, 1);
  assert.ok(f.packets.filter(p => p.role === 'design').length <= 2);
  if (['author-started', 'review-started', 'coding-repair'].includes(boundary)) {
    assert.equal(resumed.outcome, 'incomplete'); assert.deepEqual(f.packets.map(p => ({ taskId: p.taskId, role: p.role })), before);
  } else {
    assert.equal(resumed.outcome, 'awaiting_user_experience', JSON.stringify(resumed.gaps));
    assert.equal(f.packets.filter(p => p.taskId === 'design-task-revision' && p.role === 'design').length, 1);
    assert.equal(f.packets.filter(p => p.taskId === 'design-task-revision' && p.role === 'reviewer').length, 1);
  }
});

for (const mode of ['deadline', 'reserved', 'unknown', 'cancelled']) test(`revision resources ${mode} stop before the second author`, async t => {
  const { f } = await rejectedFixture(t, `resource-${mode}`); let controller: RunController;
  const sessions = f.hostOptions.sessionFactory!;
  f.hostOptions.sessionFactory = async config => {
    const session = await sessions(config), packet = JSON.parse(config.context!);
    if (packet.role !== 'reviewer' || packet.taskId !== 'design-task') return session;
    return { ...session, prompt: async (...args) => {
      if (mode === 'reserved' || mode === 'unknown') {
        await controller.reserve({ requestId: `synthetic-${mode}`, taskId: packet.taskId, provider: 'deepseek', pricingVersion: 'synthetic', estimatedMaxCostMicroCny: 100 });
        if (mode === 'unknown') { await controller.admit(`synthetic-${mode}`); await controller.markUnknown(`synthetic-${mode}`, [{ artifactId: 'synthetic-unknown', version: 'v1', location: 'snapshot.json' }]); }
      }
      if (mode === 'cancelled') await controller.stop('Synthetic cancellation');
      return session.prompt(...args);
    }, close: async () => {
      await session.close();
      if (mode === 'deadline') { const state = await controller.read(); t.mock.method(Date, 'now', () => Date.parse(state.run.originalDeadlineAt) - 184999); }
    } };
  };
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => { controller = hostInput.controller; return createBrowserHost({ ...hostInput, ...f.hostOptions }); } });
  const result: any = await f.execute();
  assert.equal(result.outcome, 'incomplete'); assert.equal(f.packets.filter(p => p.role === 'design').length, 1);
  assert.equal(f.packets.filter(p => ['art', 'coding'].includes(p.role)).length, 0);
  await assert.rejects(readFile(join(f.root, 'ordinary-design-revision-plan.json')), { code: 'ENOENT' });
});
for (const mode of ['empty', 'blank', 'duplicate-evidence', 'missing-review-started', 'source-bytes', 'bad-signature', 'same-author']) test(`source rejection ${mode} cannot authorize revision`, async t => {
  const { f } = await rejectedFixture(t, mode), result: any = await f.execute();
  assert.equal(f.packets.filter(p => p.role === 'design').length, 1);
  assert.equal(f.packets.filter(p => ['art', 'coding'].includes(p.role)).length, 0);
  assert.equal(result.outcome, 'incomplete');
  await assert.rejects(readFile(join(f.root, 'ordinary-design-revision-plan.json')), { code: 'ENOENT' });
});

test('new ordinary policy preserves the coding repair slot after a trusted art failure', async t => {
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, limits: { limitMicroCny: 5000000, durationMs: 1800000 }, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role !== 'art' || packet.taskId !== 'art-task') return fallback;
    return { ...fallback, prompt: async (...args) => { const result = await fallback.prompt(...args); await writeFile(join(config.workspace, 'authors/art/media.json'), '{}', 'utf8'); return result; } };
  } });
  const result: any = await f.execute(); assert.equal(result.outcome, 'incomplete');
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), art = state.tasks.find((task: any) => task.taskId === 'art-task');
  const feedback = JSON.parse(await readFile(join(art.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.equal(feedback.issues[0].classification, 'code_defect');
  assert.equal(f.packets.filter(p => p.role === 'art').length, 1); assert.equal(f.packets.filter(p => p.role === 'coding').length, 0);
  assert.equal(state.ledger.allocations.some((row: any) => row.taskId.includes('repair') || row.taskId.includes('successor')), false);
  await assert.rejects(readFile(join(f.root, 'repair-plan.json')), { code: 'ENOENT' });
});

test('revision identity collision with an unregistered downstream task stops before dispatch', async t => {
  const { f } = await rejectedFixture(t, 'collision'), sessions = f.hostOptions.sessionFactory!;
  f.hostOptions.sessionFactory = async config => {
    const session = await sessions(config), packet = JSON.parse(config.context!);
    if (packet.role !== 'cosmos') return session;
    return { ...session, prompt: async (...args) => {
      const response = await session.prompt(...args), proposal = JSON.parse(response.text);
      for (const task of proposal.tasks) { if (task.taskId === 'art-task') task.taskId = 'design-task-revision'; task.dependsOn = task.dependsOn.map((id: string) => id === 'art-task' ? 'design-task-revision' : id); }
      return { ...response, text: JSON.stringify(proposal) };
    } };
  };
  const result: any = await f.execute();
  assert.equal(f.packets.filter(p => p.role === 'design').length, 1);
  assert.equal(f.packets.filter(p => ['art', 'coding'].includes(p.role)).length, 0);
  assert.match(result.gaps.join(' '), /revision_identity_collision/);
  await assert.rejects(readFile(join(f.root, 'ordinary-design-revision-plan.json')), { code: 'ENOENT' });
});

test('revision recovery preserves orphan review-started without an origin and sends no author request', async t => {
  const { f } = await rejectedFixture(t, 'orphan');
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...f.hostOptions }), bind = host.bindPreparedTasks!.bind(host);
    if (!input.resume) host.bindPreparedTasks = async tasks => {
      await bind(tasks);
      if (tasks.some(item => item.task.taskId === 'design-task-revision')) throw new RecoveryBlocked('Synthetic interruption after fixed revision plan.');
    };
    return host;
  } });
  await f.execute();
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
  const folder = join(f.root, 'journal/task-design-task-revision'); await mkdir(folder, { recursive: true });
  const orphan = Buffer.from(JSON.stringify({ formatVersion: 1, taskId: 'design-task-revision', attemptId: 'unknown-attempt', value: { reviewerId: 'unknown-reviewer', contextId: 'unknown-context' } }));
  await writeFile(join(folder, 'review-started.json'), orphan);
  const before = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const result = await f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true });
  assert.equal(f.packets.filter(p => p.role === 'design').length, 1);
  assert.match(result.gaps.join(' '), /missing_origin_with_journal_records/);
  assert.deepEqual(await readFile(join(folder, 'review-started.json')), orphan);
  await assert.rejects(readFile(join(folder, 'origin.json')), { code: 'ENOENT' });
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(after.ledger.entries, before.ledger.entries); assert.equal(after.tasks.length, 1);
});

for (const { maximum, full } of [{ maximum: false, full: false }, { maximum: true, full: false },
  ...(process.env.COS134_CONFIRMED_SOURCE ? [{ maximum: false, full: true }] : [])]) test(`native revision ${full ? 'complete confirmed source' : maximum ? 'maximum reservation stops' : 'settlements retain review and coding repair'} without network`, async t => {
  const confirmed = full ? await readConfirmedRequirementsSource({ root: process.env.COS134_CONFIRMED_SOURCE!, revision: 2, specVersion: '1.0' }) : undefined;
  const seedRoot = process.env.COS134_DESIGN_SEED;
  const seed = full ? { design: await readFile(join(seedRoot!, 'design.json'), 'utf8'), plan: await readFile(join(seedRoot!, 'acceptance-plan.json'), 'utf8') } : undefined;
  const design = seed && JSON.parse(seed.design);
  const requests: any[] = []; let packetForRuntime: any, network = 0;
  let native: AgentSession | undefined;
  const prompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', async function (this: AgentSession, ...args: Parameters<typeof prompt>) { native = this; return prompt.apply(this, args); });
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('NETWORK_DISABLED'); });
  const create = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function (...args: Parameters<typeof create>) {
    const packet = packetForRuntime, runtime = await create.apply(ModelRuntime, args); let round = 0, actionRound = 0;
    runtime.streamSimple = ((model: any, context: any, config: any) => {
      round++; const inputBytes = requestInputBytes(context), revision = packet.taskId === 'design-task-revision', reviewer = packet.role === 'reviewer';
      const summary = native?.isCompacting ?? false;
      if (!summary) actionRound++;
      const amount = maximum ? 2 * inputBytes + 8 * config.maxTokens : summary ? 16000 : revision ? actionRound === 1 ? 16000 : 64000 : 8;
      const inputTokens = maximum ? inputBytes : 0, outputTokens = maximum ? config.maxTokens : amount / 8;
      requests.push({ taskId: packet.taskId, role: packet.role, round, actionRound, kind: summary ? 'summary' : 'ordinary', inputBytes, cap: config.maxTokens, quote: 2 * inputBytes + 8 * config.maxTokens, settlement: amount,
        tools: context.messages.filter((message: any) => message.role === 'toolResult').map((message: any) => ({ name: message.toolName, error: !!message.isError, truncated: !!message.details?.truncation })) });
      let content: any[], stopReason = 'stop';
      if (summary) content = [{ type: 'text', text: 'Synthetic context summary. Full original confirmed requirements, the rejected capture and independent review feedback remain fixed scoped inputs. The author read all five complete files and edited its isolated design and acceptance plan. Preserve all original acceptance and experience criteria. Next run validate-game-design and return the handoff; the independent reviewer must check the complete original requirements. This is SOURCE control-flow and capacity evidence only.' }];
      else if (revision && actionRound === 1) {
        const ref = packet.interfaces.find((ref: any) => ref.artifactId === 'design'), current = reviewer ? packet.inputs.find((ref: any) => ref.artifactId === 'design') : ref;
        const paths = [...packet.inputs.filter((ref: any) => ['requirement-draft', 'user-confirmation'].includes(ref.artifactId)).map((ref: any) => ref.location),
          `${current.location}/_cosmos/design.json`, `${current.location}/_cosmos/acceptance-plan.json`, packet.inputs.find((ref: any) => ref.artifactId.startsWith('ordinary-design-review-feedback-')).location,
          ...(reviewer ? [packet.evidence[0].source.location] : [])];
        content = paths.map((path: string, index: number) => ({ type: 'toolCall', id: `read-${index}`, name: 'read', arguments: { path } })); stopReason = 'toolUse';
      } else if (revision && !reviewer && actionRound === 2) {
        content = [{ path: 'authors/design/design.json', edits: [full
          ? { oldText: JSON.stringify(design.summary), newText: JSON.stringify(design.summary + '（完整确认来源的合成修订容量样本）') }
          : { oldText: '原创鼠标游戏', newText: '原创鼠标游戏：点击后显示完成' }] },
          { path: 'authors/design/acceptance-plan.json', edits: [{ oldText: '"formatVersion":', newText: '"formatVersion" :' }] }]
          .map((arguments_, index) => ({ type: 'toolCall', id: `edit-${index}`, name: 'edit', arguments: arguments_ })); stopReason = 'toolUse';
      } else if (revision && !reviewer && actionRound === 3) {
        content = [{ type: 'toolCall', id: 'check', name: 'validate-game-design', arguments: {} }]; stopReason = 'toolUse';
      } else content = [{ type: 'text', text: JSON.stringify(reviewer
        ? { verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }
        : { summary: 'Synthetic native transport and real scoped tools only', remaining: [], uncertainty: [] }) }];
      return lazyStream(model, async () => (async function* () {
        await config.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens } }, model);
        yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', stopReason, timestamp: Date.now(),
          usage: { input: inputTokens, output: outputTokens, cacheRead: 0, cacheWrite: 0, totalTokens: inputTokens + outputTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } };
      })() as any);
    }) as typeof runtime.streamSimple;
    return runtime;
  });
  const admissions: any[] = [];
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, fault: 'code-repair', limits: { limitMicroCny: 5000000, durationMs: 1800000 },
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      const put = async (path: string, content: string) => { const target = join(config.workspace, path); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, content, 'utf8'); };
      if (full && packet.role === 'cosmos') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({ tasks: [
        { taskId: 'design-task', policyId: 'game-design', role: 'design', objective: '按完整固定原需求设计', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
        { taskId: 'art-task', policyId: 'game-art', role: 'art', objective: '合成媒体源码容量代表', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design-task'] },
        { taskId: 'coding-task', policyId: 'game-code', role: 'coding', objective: '完整原需求 SOURCE 控制链代表', acceptanceIds: confirmed!.draft.acceptance.filter(item => !item.acceptanceId.startsWith('COSMOS-')).map(item => item.acceptanceId), dependsOn: ['design-task', 'art-task'] },
      ] }) }) };
      if (full && packet.role === 'design' && packet.taskId === 'design-task') return { close: fallback.close, prompt: async () => {
        await put('authors/design/design.json', seed!.design); await put('authors/design/acceptance-plan.json', seed!.plan);
        const checked = await config.tools!.find(tool => tool.name === 'validate-game-design')!.execute('full-source-check', {}, undefined, undefined, undefined as any);
        assert.equal(JSON.parse((checked as any).content[0].text).passed, true);
        return { text: JSON.stringify({ summary: 'Existing TEMP design bytes as synthetic control-chain seed only', remaining: [], uncertainty: [] }) };
      } };
      if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({ verdict: 'changes_requested',
        findings: [full ? '固定完整原需求要求保存后产生未保存变化，当前计划的该项证据不足。' : '完整原需求要求点击后显示完成，设计说明需明确。'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }) }) };
      if (full && packet.role === 'reviewer' && packet.taskId !== 'design-task-revision') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }) }) };
      if (packet.taskId !== 'design-task-revision' && !['art', 'coding'].includes(packet.role)) return fallback;
      packetForRuntime = packet;
      const session = await createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos134-synthetic' }, budget: {
        beforeRequest: async request => {
          const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
          const committed = state.ledger.entries.filter((row: any) => row.taskId === packet.taskId).reduce((sum: number, row: any) => sum + row.settledMicroCny + row.reservedMicroCny, 0);
          admissions.push({ taskId: packet.taskId, role: packet.role, available: packet.budget.allocationMicroCny - committed - (packet.role === 'design' ? 300000 : 0), ...request });
          await config.budget.beforeRequest(request);
        }, afterResponse: response => config.budget.afterResponse(response),
      } });
      return { ...session, prompt: async (...args) => {
        if (packet.taskId !== 'design-task-revision') {
          if (!full) await fallback.prompt(...args);
          else if (packet.role === 'art') await put('authors/art/media.json', JSON.stringify({ characters: design.characters.map((character: any) => ({ id: character.id, width: 32, height: 32, anchor: { x: 16, y: 16 },
            layers: [{ id: 'body', shape: 'rect', x: 1, y: 1, width: 30, height: 30, fill: '#FFD700', stroke: '#000000', strokeWidth: 0 }], states: character.states.map((name: string) => ({ name, fps: 1, loop: true, frames: [{}] })) })),
            audio: design.audio.map((clip: any) => ({ id: clip.id, sampleRate: 22050, duration: 0.05, loop: clip.loop, notes: [{ midi: 65, start: 0, duration: 0.05, gain: 0.1, wave: 'sine', attack: 0.002, release: 0.003 }] })) }));
          else { await put('authors/coding/index.html', '<p>SOURCE fixture only</p><script type="module" src="/src/main.ts"></script>');
            await put('authors/coding/src/main.ts', packet.taskId === 'coding-task' ? 'const wrong: number = "bad";\n' : 'export const syntheticFixture = true;\n'); }
        }
        return session.prompt(...args);
      } };
    } });
  if (full) f.host.execute = input => executeGeneration({ ...input, createHost: hostInput => createBrowserHost({ ...hostInput, ...f.hostOptions }) });
  const result: any = full ? await runProductSession({ command: 'new', root: f.root, host: f.host, requirementsFrom: { root: process.env.COS134_CONFIRMED_SOURCE!, revision: 2 },
    limits: { limitMicroCny: 5000000, durationMs: 1800000 }, input: Readable.from([]), output: new Writable({ write(_chunk, _encoding, done) { done(); } }) }) : await f.execute();
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  await writeFile(join(f.root, 'cos134-native-evidence.json'), JSON.stringify({ scope: 'Synthetic settlements and provider transport; real Pi, tools, controller reserve/admit/settle. No semantic recall or generated game claim.',
    ...(confirmed ? { confirmedSource: confirmed.source, acceptanceIds: confirmed.draft.acceptance.map(item => item.acceptanceId), experienceIds: confirmed.draft.experienceCriteria!.map(item => item.criterionId) } : {}), network, requests, admissions }, null, 2) + '\n', 'utf8');
  assert.equal(network, 0); assert.ok(requests.every(row => row.tools.every((tool: any) => !tool.error && !tool.truncated)));
  assert.deepEqual(requests.map(row => row.inputBytes), admissions.map(row => row.inputBytes));
  assert.ok(state.ledger.entries.every((row: any) => row.status === 'settled' && row.reservedMicroCny === 0 && !row.unknown));
  if (maximum) {
    assert.equal(result.outcome, 'incomplete'); assert.equal(f.packets.some(p => ['art', 'coding'].includes(p.role)), false);
    assert.ok(state.ledger.entries.filter((row: any) => row.taskId === 'design-task-revision').reduce((sum: number, row: any) => sum + row.settledMicroCny, 0) <= 900000);
  } else {
    assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
    const revision = admissions.filter(row => row.taskId === 'design-task-revision');
    assert.deepEqual(revision.filter(row => row.role === 'design').map(row => row.available), full ? [600000, 584000, 520000, 504000, 440000] : [600000, 584000, 520000, 456000]);
    assert.deepEqual(revision.filter(row => row.role === 'reviewer').map(row => row.available), full ? [676000, 660000] : [692000, 676000]);
    assert.deepEqual(revision.filter(row => row.role === 'reviewer').map(row => row.maxOutputTokens), [8192, 8192]);
    assert.equal(900000 - state.ledger.entries.filter((row: any) => row.taskId === 'design-task-revision').reduce((sum: number, row: any) => sum + row.settledMicroCny, 0), full ? 596000 : 612000);
    assert.deepEqual(state.ledger.allocations.filter((row: any) => !['intake', 'planning'].includes(row.taskId)).map((row: any) => [row.taskId, row.amountMicroCny]),
      [['design-task', 1125000], ['design-task-revision', 900000], ['art-task', 900000], ['coding-task', 1125000], ['coding-task-repair', 450000]]);
    for (const id of ['art-task', 'coding-task', 'coding-task-repair']) {
      const first = admissions.find(row => row.taskId === id); assert.ok(first); assert.ok(first.maxOutputTokens >= 8192 && first.maxOutputTokens <= 65536); assert.ok(first.estimatedMaxCostMicroCny <= first.available);
    }
    const repair = admissions.find(row => row.taskId === 'coding-task-repair'); assert.ok(repair.inputBytes <= 192232); assert.ok(repair.maxOutputTokens < 65536);
    const before = f.packets.length, execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
    assert.equal((await readCompletedGeneration(f.root, execution.requirement))!.outcome, 'awaiting_user_experience'); assert.equal(f.packets.length, before);
  }
});
