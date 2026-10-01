import assert from 'node:assert/strict';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { DagOptions } from '../../src/runtime/orchestrator.ts';
import { RunController } from '../../src/runtime/run.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import { createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import type { EvidenceContract, RequirementContract, TaskContract } from '../../src/contracts/types.ts';
import { artifact, requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

// Extracted from the native COS-10 c1 review on 2026-10-01. IDs/paths below are
// rebound to an offline task, but the contradictory verdict/findings are retained.
const positiveFinding = 'The document explicitly makes no claim that any gameplay acceptance, additionalHostChecks or independent verdict has passed; pending host capture/verification, independent review and downstream art/code/build/browser work are correctly characterized as not being unfinished design work and are not design blockers.';
const now = () => Date.parse('2026-10-01T01:00:00Z');
const requirement = requirementFixture() as RequirementContract;

async function setup(t: test.TestContext, mode: string, corrections: 0 | 1 = 1) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-repair-protocol-'));
  const workspace = join(root, 'author'), reviewWorkspace = join(root, 'review');
  await mkdir(workspace); await mkdir(reviewWorkspace);
  const controller = await RunController.create({ root: join(root, 'state'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'design', amountMicroCny: 800 }], now });
  const task = taskFixture() as TaskContract;
  Object.assign(task, { taskId: 'design', dependsOn: [], state: 'not_started', attempts: [], evidence: [], artifacts: [] });
  task.budget = { ledgerId: 'ledger-1', allocationMicroCny: 800, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
  task.context.tools = ['read'];
  const abort = new AbortController();
  const prompts: string[] = [], directories: string[] = [];
  let authorCalls = 0, reviewerCalls = 0, verifyCalls = 0, closed = false;
  const factory = createRoleFactory({ maxOutputTokens: 100, maxRequests: 4, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => {
      const packet = JSON.parse(config.context);
      if (packet.role === 'reviewer') { directories.push(config.stateDirectory); await mkdir(config.stateDirectory, { recursive: true }); }
      return { async prompt(prompt, options) {
        options?.signal?.throwIfAborted();
        for (const ref of packet.interfaces.filter((ref: { artifactId: string }) => ref.artifactId.startsWith('repair-feedback-'))) {
          const observed = await config.tools.find(tool => tool.name === 'read')!.execute('feedback', { path: ref.location }, options?.signal, undefined, undefined as any);
          assert.match(JSON.stringify(observed), /sourceAttemptId/);
        }
        if (packet.role !== 'reviewer') {
          authorCalls++;
          return { text: JSON.stringify({ summary: '设计已生成', remaining: mode === 'remaining' ? ['Host verification and independent review', 'Coding and art tasks remain unexecuted.'] : [], uncertainty: [] }) };
        }
        assert.equal(closed, false); prompts.push(prompt); reviewerCalls++;
        const requestId = `review-${reviewerCalls}`;
        await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: 100, inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: mode === 'budget' ? 800 : 100 });
        const verdict = { verdict: 'approved', inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: EvidenceContract) => e.evidenceId), findings: [] as string[] };
        if (reviewerCalls === 1 || mode === 'invalid-twice') verdict.findings = [positiveFinding];
        if (mode === 'changes') { verdict.verdict = 'changes_requested'; verdict.findings = ['缺少资源不足时的正常输入响应。']; }
        if (mode === 'corrected-changes' && reviewerCalls === 2) { verdict.verdict = 'changes_requested'; verdict.findings = ['发现真实未解决缺陷。']; }
        if (mode === 'stale' && reviewerCalls === 2) verdict.inputVersions = [artifact('game', 'stale')];
        if (mode === 'cancel') abort.abort();
        const text = mode === 'json' && reviewerCalls === 1 ? '{ invalid json' : JSON.stringify(verdict);
        await appendFile(join(config.stateDirectory, 'offline-transcript.jsonl'), JSON.stringify({ prompt, text }) + '\n', 'utf8');
        await config.budget.afterResponse({ requestId, outcome: mode === 'unknown' ? 'unknown' : 'settled', elapsedMs: 1, responseModel: 'deepseek-flash', usage: { input: mode === 'budget' ? 396 : 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        return { text };
      }, async close() { if (packet.role === 'reviewer') closed = true; } };
    },
  });
  const options: DagOptions & { reviewProtocolCorrections: 0 | 1 } = { controller, requirement, tasks: [{ task, role: 'design', workspace }], sessionRoot: join(root, 'sessions'), availableArtifacts: task.inputs, roleFactory: factory, reviewProtocolCorrections: corrections, now, signal: abort.signal,
    capture: async () => ({ artifacts: [artifact()], reviewWorkspace }),
    verify: async task => { verifyCalls++; return [{ contractVersion: '1.0.0', evidenceId: 'host', taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report', source: artifact('host', 'v1', 'evidence/host.json'), artifactVersions: [...task.inputs, ...task.artifacts], outcome: mode === 'failed-host' ? 'failed' : 'passed', recordedAt: new Date(now()).toISOString(), summary: '宿主检查' }]; },
  };
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  return { root, controller, options, prompts, directories, counts: () => ({ authorCalls, reviewerCalls, verifyCalls, closed }) };
}

test('one explicit correction obtains a new strict response in the same live reviewer session', async t => {
  const f = await setup(t, 'positive');
  const [result] = await executeTaskDag(f.options);
  assert.equal(result.state, 'passed');
  assert.deepEqual(f.counts(), { authorCalls: 1, reviewerCalls: 2, verifyCalls: 1, closed: true });
  assert.equal(f.directories.length, 1);
  assert.match(f.prompts[1], /findings.*unresolved|unresolved.*findings/i);
  assert.match(f.prompts[1], /changes_requested/);
  const transcript = (await readFile(join(f.directories[0], 'offline-transcript.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(JSON.parse(transcript[0].text).findings[0], positiveFinding);
  assert.deepEqual(JSON.parse(transcript[1].text).findings, []);
  const state = await f.controller.read();
  assert.equal(state.ledger.entries.length, 2);
  assert.equal(state.run.fees.settledMicroCny, 20);
  assert.equal(result.attempts.length, 1);
  const correction = JSON.parse(await readFile(join(result.attempts[0].sessionRef, 'review-correction.json'), 'utf8'));
  assert.equal(correction.taskId, result.taskId);
  assert.equal(correction.attemptId, result.attempts[0].attemptId);
  assert.equal(correction.reviewerId, result.review.reviewerId);
  assert.equal(correction.contextId, result.review.contextId);
  assert.equal(correction.used, 1);
});

test('a previously consumed correction record blocks another corrective prompt', async t => {
  const f = await setup(t, 'positive'), capture = f.options.capture;
  f.options.capture = async (task, proposal, signal) => {
    // A partial record after a crash is also conservatively treated as consumed.
    await writeFile(join(task.attempts[0].sessionRef, 'review-correction.json'), '{', { encoding: 'utf8', flag: 'wx' });
    return capture(task, proposal, signal);
  };
  const [result] = await executeTaskDag(f.options);
  assert.equal(result.state, 'waiting_user');
  assert.equal(f.counts().reviewerCalls, 1);
});

for (const mode of ['invalid-twice', 'stale', 'unknown', 'cancel', 'budget', 'deadline', 'remaining', 'failed-host', 'changes', 'corrected-changes', 'json']) test(`protocol correction respects ${mode}`, async t => {
  const f = await setup(t, mode);
  if (mode === 'deadline') f.options.now = () => f.counts().reviewerCalls ? Date.parse(f.options.tasks[0].task.budget.originalDeadlineAt) : now();
  const [result] = await executeTaskDag(f.options);
  const expected = mode === 'json' ? 'passed' : ['changes', 'corrected-changes'].includes(mode) ? 'needs_changes' : mode === 'cancel' ? 'cancelled' : ['remaining', 'failed-host'].includes(mode) ? 'failed' : 'waiting_user';
  assert.equal(result.state, expected);
  assert.equal(f.counts().reviewerCalls, ['remaining', 'failed-host'].includes(mode) ? 0 : ['changes', 'unknown', 'cancel', 'budget', 'deadline'].includes(mode) ? 1 : 2);
  if (mode === 'remaining') { assert.equal(f.counts().verifyCalls, 0); assert.ok(result.handoff.remaining.includes('Host verification and independent review')); }
  if (mode === 'unknown') assert.equal((await f.controller.read()).run.fees.unknownRequestIds.length, 1);
});

test('default and explicit zero corrections preserve the strict one-response behavior', async t => {
  for (const explicit of [false, true]) {
    const f = await setup(t, 'positive', 0);
    if (!explicit) delete (f.options as Partial<typeof f.options>).reviewProtocolCorrections;
    const [result] = await executeTaskDag(f.options);
    assert.equal(result.state, 'waiting_user'); assert.equal(f.counts().reviewerCalls, 1);
  }
});

test('failed handoff stores fixed acceptance, artifacts and source attempt without guessing it complete', async t => {
  const f = await setup(t, 'remaining');
  const [result] = await executeTaskDag(f.options);
  const feedback = JSON.parse(await readFile(join(result.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.equal(feedback.sourceTaskId, result.taskId);
  assert.equal(feedback.sourceAttemptId, result.attempts[0].attemptId);
  assert.deepEqual(feedback.acceptance, result.acceptance);
  assert.deepEqual(feedback.artifactVersions, [...result.inputs, ...result.artifacts]);
  assert.equal(feedback.issues[0].classification, 'insufficient_evidence');
  assert.equal(feedback.issues[0].checkId, 'author_handoff');
});

test('raw host/provider exception text is absent from persisted failure feedback', async t => {
  const f = await setup(t, 'positive');
  f.options.verify = async () => { throw new Error('SECRET_SENTINEL provider body must not be persisted'); };
  const [result] = await executeTaskDag(f.options);
  const raw = await readFile(join(result.attempts[0].sessionRef, 'failure.json'), 'utf8');
  assert.doesNotMatch(raw + JSON.stringify(result), /SECRET_SENTINEL/);
  assert.equal(JSON.parse(raw).issues[0].classification, 'insufficient_evidence');
});

test('a passed-step witness in a failed host report cannot pass the task or start review', async t => {
  const f = await setup(t, 'failed-host');
  // This stands for the trusted verify callback's already executed report.
  const report = { outcome: 'failed', steps: [{ id: 'start', outcome: 'passed' }, { id: 'resource', outcome: 'failed' }] };
  f.options.diagnoseFailure = task => new HostFailure([{ acceptanceId: 'AC-1', checkId: 'resource', classification: 'code_defect', summary: 'Resource input fails', reproduction: ['Click card'], actual: 'No response', expected: 'Resource rejection shown', evidenceRefs: [task.evidence[0].source.location] }],
    report.steps.filter(step => step.outcome === 'passed').map(step => ({ acceptanceId: 'AC-1', checkId: step.id, evidenceId: task.evidence[0].evidenceId })));
  const [result] = await executeTaskDag(f.options);
  assert.equal(result.state, 'failed'); assert.equal(f.counts().reviewerCalls, 0);
  assert.equal(result.evidence.length, 1); assert.equal(result.evidence[0].outcome, 'failed');
  const feedback = JSON.parse(await readFile(join(result.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.deepEqual(feedback.passedChecks, [{ acceptanceId: 'AC-1', checkId: 'start', evidenceId: 'host' }]);
});

test('invalid host diagnosis cannot corrupt the durable failed task', async t => {
  const f = await setup(t, 'failed-host');
  f.options.diagnoseFailure = () => new HostFailure([{ acceptanceId: 'not-in-this-task', checkId: 'start', classification: 'code_defect', summary: 'bad adapter', reproduction: ['Click'], actual: 'bad', expected: 'good', evidenceRefs: [] }]);
  const [result] = await executeTaskDag(f.options);
  assert.equal(result.state, 'failed');
  assert.equal(result.attempts[0].failure?.classification, 'insufficient_evidence');
  assert.deepEqual((await f.controller.read()).tasks[0], result);
});

for (const stale of [false, true]) test(`linked code repair gets fresh host evidence and independent review; stale evidence=${stale}`, async t => {
  const f = await setup(t, 'positive');
  f.options.tasks[0].workspace = f.root;
  f.options.tasks[0].role = 'coding';
  const verify = f.options.verify, capture = f.options.capture;
  f.options.verify = async task => {
    if (task.taskId === 'design') throw new HostFailure([{ acceptanceId: 'AC-1', checkId: 'start-click', classification: 'code_defect', summary: 'Start input fails', reproduction: ['Click start'], actual: 'No response', expected: 'Game starts', evidenceRefs: [] }]);
    const evidence = await verify(task, f.options.signal!);
    if (stale) evidence[0].artifactVersions = [...task.inputs, artifact()];
    return evidence;
  };
  f.options.capture = async (task, proposal, signal) => {
    const captured = await capture(task, proposal, signal);
    if (task.taskId === 'repair-1') {
      captured.artifacts = [artifact('game', 'v2', 'artifacts/game/v2')];
      for (const ref of task.context.interfaces.filter(ref => ref.artifactId.startsWith('repair-feedback-'))) {
        await mkdir(dirname(join(captured.reviewWorkspace, ref.location)), { recursive: true });
        await copyFile(join(f.root, ref.location), join(captured.reviewWorkspace, ref.location));
      }
    }
    return captured;
  };
  const [failed] = await executeTaskDag(f.options);
  assert.equal(failed.state, 'failed');
  const feedback = JSON.parse(await readFile(join(failed.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.equal(feedback.issues[0].classification, 'code_defect');
  const linked = createLinkedRepairTask({ snapshot: await f.controller.read(), requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: now(), estimate: { costMicroCny: 100, durationMs: 1000, cleanupMs: 100 },
    source: { task: failed, role: 'coding', workspace: f.root }, taskId: 'repair-1', allocationMicroCny: 200,
    outputs: [{ type: 'game', schema: 'game/1', destination: 'artifacts/game/v2' }], expectedArtifacts: [artifact('game', 'v2', 'artifacts/game/v2')] });
  await mkdir(dirname(join(f.root, feedback.reference.location)), { recursive: true });
  await copyFile(join(failed.attempts[0].sessionRef, 'failure.json'), join(f.root, feedback.reference.location));
  const [repaired] = await executeTaskDag({ ...f.options, tasks: [linked] });
  assert.equal(repaired.state, stale ? 'failed' : 'passed');
  assert.equal(f.counts().reviewerCalls, stale ? 0 : 2);
  assert.deepEqual((await f.controller.read()).tasks.find(task => task.taskId === failed.taskId), failed);
  if (!stale) assert.notEqual(repaired.review.reviewerId, repaired.authorId);
});
