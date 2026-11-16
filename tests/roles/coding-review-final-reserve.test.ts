import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { createPiSession, type PiSessionOptions } from '../../src/providers/pi.ts';
import { reviewImageInputTokens } from '../../src/providers/review-image-quote.ts';
import { parseReview, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { requestReview } from '../../src/runtime/repair/protocol.ts';
import { codingReviewInstructions, ORDINARY_CODING_HANDOFF, parseCodingConcernReview, type CodingConcernReview } from '../../src/runtime/repair/coding-concerns.ts';
import { authorBudgetFixture } from './author-output-budget.fixture.ts';
import { validationRoutingFixture } from '../runtime/validation-routing.fixture.ts';
import { dagFixture } from '../runtime/recovery/dag-fixture.ts';

test('only selected sixteen-round ordinary reviewers receive the reserve and guidance', async t => {
  const f = await authorBudgetFixture(t);
  for (const [role, purpose, selected, maxRequests] of [['reviewer', undefined, true, 16], ['reviewer', undefined, true, 32],
    ['reviewer', undefined, false, 16], ['coding', undefined, true, 16], ['design', undefined, true, 16],
    ['art', undefined, true, 16], ['cosmos', 'planning', true, 16], ['reviewer', 'planning', true, 16]] as const) {
    await f.create({ ordinaryCodingReviewImageQuote: () => selected, maxRequests }, { ...f.input, role, purpose });
    const config = f.configs.at(-1)!;
    const expected = role === 'reviewer' && !purpose && selected && maxRequests === 16;
    assert.equal(config.ordinaryCodingReviewFinalReserve, expected ? true : undefined);
    assert.equal(config.systemPrompt.includes('At most fourteen may use tools'), expected);
  }
});

test('a real validation authority cannot select the ordinary review reserve', async t => {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning as any);
  await f.controller.registerTasks(planned.tasks.map(item => item.task));
  const coding = planned.tasks.find(item => item.role === 'coding')!;
  let config: PiSessionOptions | undefined;
  const factory = createRoleFactory({ maxRequests: 16, maxOutputTokens: 8192, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 1000,
    ordinaryCodingReviewImageQuote: () => { throw new Error('Validation cannot invoke ordinary selector'); },
    sessionFactory: async selected => { config = selected; return { prompt: async () => ({ text: '' }), close: async () => {} }; } });
  const reviewer = await factory({ controller: f.controller, validation: f.binding, requirement: f.requirement, role: 'reviewer', task: coding.task,
    workspace: coding.workspace, stateDirectory: join(f.planning.sessionRoot, 'cos232-review') });
  await reviewer.close();
  assert.equal(config!.ordinaryCodingReviewFinalReserve, undefined);
});

test('continuation authority skips the ordinary selector', async t => {
  const f = await authorBudgetFixture(t), authority = await f.controller.executionAuthority(f.input.task.taskId);
  t.mock.method(f.controller, 'executionAuthority', async () => ({ ...authority, windowId: 'continuation-fixture' }));
  await f.create({ maxRequests: 16, ordinaryCodingReviewImageQuote: () => { throw new Error('Continuation cannot invoke ordinary selector'); } },
    { ...f.input, role: 'reviewer' });
  assert.equal(f.configs[0].ordinaryCodingReviewFinalReserve, undefined);
});

for (const point of ['review-lost', 'correction-lost']) test(`durable ${point} recovery cannot restart a review or correction allowance`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos232-recovery-'));
  let f: Awaited<ReturnType<typeof dagFixture>> | undefined;
  t.after(async () => { await f?.controller.close(); await rm(root, { recursive: true, force: true }); });
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../runtime/recovery/dag-worker.ts', import.meta.url)), root, point],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { SYSTEMROOT: process.env.SYSTEMROOT, TEMP: tmpdir(), TMP: tmpdir() } });
  let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  const [code] = await once(child, 'close'); assert.equal(code, 23, stderr);
  await SnapshotStore.recover(join(root, 'state'));
  f = await dagFixture(root);
  const before = await f.controller.read(), calls = await f.calls();
  const result = await resumeTaskDag(f.options);
  assert.equal(result.blocked.length, 1);
  assert.deepEqual(await f.calls(), calls);
  assert.deepEqual(await f.controller.read(), before);
});

type Mode = 'approved' | 'changes_requested' | 'malformed' | 'stale' | 'stale-correction' | 'empty' | 'bad-correction' | 'incomplete' | 'concern' | 'concern-incomplete' | 'no-slot' | 'existing-slot' | 'early';
async function nativeFixture(t: TestContext, mode: Mode, guard?: { after: 14 | 15; kind: 'stop' | 'deadline' | 'stale' | 'balance' | 'unknown' | 'reserved' | 'reserved-full' }) {
  const allocation = 20_000_000, f = await authorBudgetFixture(t, allocation);
  const task = f.input.task;
  task.evidence[0].artifactVersions = [...task.inputs, ...task.artifacts];
  await mkdir(join(f.root, 'requirements'));
  await writeFile(join(f.root, 'requirements/v1.json'), '{"要求":"必须检查固定输入，未知不得记为通过"}', 'utf8');
  const images = Array.from({ length: 8 }, () => ({ type: 'image' as const, mimeType: 'image/png',
    data: '' }));
  // Eight actual PNG input blocks; synthetic decisions never claim to judge the historical game.
  const png = (await readFile(new URL('../../docs/research/assets/c14-independent-gameplay.png', import.meta.url))).toString('base64');
  images.forEach(image => { image.data = png; });
  const bodies: any[] = [], configs: PiSessionOptions[] = [], quotes: any[] = [];
  const correctionRecordPath = join(f.root, 'review-correction.json');
  const concerns: CodingConcernReview = { taskId: task.taskId, attemptId: task.attempts.at(-1)!.attemptId,
    authorId: task.authorId, contextId: task.context.contextId, originalProposal: { summary: 'Synthetic author', remaining: [], uncertainty: ['Startup has not been independently assessed.'] },
    originalProposalSha256: 'fixture', proposal: { summary: 'Synthetic author', remaining: [], uncertainty: ['Startup has not been independently assessed.'] },
    proposalSha256: 'fixture', capturedAt: '2026-10-01T00:30:00.000Z', signature: [],
    concerns: [{ concernId: 'coding-concern-1', text: 'Startup has not been independently assessed.', source: 'original', index: 0 }] };
  const specialized = mode.startsWith('concern');
  const verdict = { verdict: ['changes_requested', 'concern'].includes(mode) ? 'changes_requested' : 'approved', inputVersions: [...task.inputs, ...task.artifacts],
    evidenceIds: task.evidence.map(e => e.evidenceId), findings: ['changes_requested', 'concern'].includes(mode) ? ['AC-1 requires startup verification; the necessary startup observation remains unassessed.'] : [],
    ...(specialized ? { concernResolutions: [{ concernId: concerns.concerns[0].concernId, concernText: concerns.concerns[0].text, status: 'unresolved',
      basis: 'fixed_input', rationale: 'AC-1 startup cannot be independently established from inspected material; the startup observation remains unassessed.',
      acceptanceIds: task.acceptanceIds, inputVersions: task.inputs, evidenceIds: [], evidenceRefs: [] }] } : {}) };
  let payloadFailure: unknown, completed = 0;
  const imageParts = (body: any) => body.messages.flatMap((message: any) => Array.isArray(message.content) ? message.content.filter((part: any) => part.type === 'image_url') : []);
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    try {
      const request = url instanceof Request ? url : new Request(url, init);
      assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
      const body = JSON.parse(await request.text()), n = bodies.push(body);
      assert.ok(n <= 16, 'no provider request seventeen');
      assert.equal(imageParts(body).length, 8);
      assert.deepEqual(imageParts(body), imageParts(bodies[0]));
      if (n > 1 && n <= 15) assert.deepEqual(body.messages.slice(0, bodies[n - 2].messages.length), bodies[n - 2].messages, 'prior message bytes retained');
      assert.equal(body.max_tokens, 8192);
      const lastRecord = (await f.controller.read()).ledger.entries.at(-1)!;
      assert.equal(lastRecord.reservedMicroCny, reviewImageInputTokens(body, Buffer.byteLength(JSON.stringify(body))) * 2 + body.max_tokens * 8);
      let delta: object, finish: string;
      if (n <= 14 && mode !== 'early') {
        delta = { tool_calls: [{ index: 0, id: `cos232-read-${n}`, type: 'function', function: { name: 'read',
          arguments: JSON.stringify({ path: 'requirements/v1.json', offset: null, limit: null, evidenceOffset: null, evidenceDetails: null }) } }] };
        finish = 'tool_calls';
      } else {
        if (mode !== 'early') assert.equal(body.tools?.length ?? 0, 0);
        assert.equal(body.thinking.type, 'enabled');
        if (n === 16) {
          const record = JSON.parse(await readFile(correctionRecordPath, 'utf8'));
          assert.equal(record.used, 1); assert.equal(record.reviewerId, reviewer.actorId); assert.equal(record.contextId, reviewer.contextId);
          assert.ok(JSON.stringify(body.messages).includes('Correcting format grants no new evidence'));
          assert.ok(JSON.stringify(body.messages).includes('必须检查固定输入，未知不得记为通过'));
        }
        let text = JSON.stringify(verdict);
        if (mode === 'empty') text = '';
        else if (['incomplete', 'concern-incomplete'].includes(mode)) text = 'Review incomplete: AC-1 startup observation has not been assessed; no supported verdict.';
        else if (mode === 'bad-correction' || ['malformed', 'no-slot', 'existing-slot'].includes(mode) && n === 15) text = '{';
        else if (mode === 'stale-correction' || mode === 'stale' && n === 15) text = JSON.stringify({ ...verdict, inputVersions: [] });
        delta = { content: text }; finish = 'stop';
      }
      const chunk = { model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: finish }],
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    } catch (error) { payloadFailure = error; throw error; }
  });
  const reviewer = await f.create({ maxRequests: 16, ordinaryCodingReviewImageQuote: () => true,
    ordinaryCodingConcernReview: () => specialized, sessionFactory: async config => {
      configs.push(config);
      const before = config.budget.beforeRequest, after = config.budget.afterResponse;
      config.budget.beforeRequest = async request => { quotes.push(request); await before(request); };
      config.budget.afterResponse = async response => {
        await after(response); completed++;
        if (guard?.after !== completed) return;
        if (guard.kind === 'stop') await f.controller.stop('Synthetic boundary stop');
        if (guard.kind === 'deadline' || guard.kind === 'stale') {
          const current = await f.controller.executionAuthority(task.taskId);
          t.mock.method(f.controller, 'executionAuthority', async () => ({ ...current,
            ...(guard.kind === 'deadline' ? { deadlineAt: new Date(Date.now() - 1).toISOString() } : { taskGrantMicroCny: current.taskGrantMicroCny + 1 }) }));
        }
        if (guard.kind === 'balance') {
          const state = await f.controller.read();
          await f.spend(allocation - state.ledger.entries.reduce((sum, row) => sum + row.settledMicroCny, 0) - 1, 'synthetic-drain');
        }
        if (guard.kind === 'unknown' || guard.kind === 'reserved' || guard.kind === 'reserved-full') {
          const state = await f.controller.read();
          const amount = guard.kind === 'reserved-full' ? allocation - state.ledger.entries.reduce((sum, row) => sum + row.settledMicroCny, 0) - 1 : 1000;
          await f.controller.reserve({ requestId: 'synthetic-unresolved', taskId: task.taskId, provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: amount });
          if (guard.kind === 'unknown') {
            await f.controller.admit('synthetic-unresolved');
            await f.controller.markUnknown('synthetic-unresolved', []);
          }
        }
      };
      return createPiSession(config);
    } }, { ...f.input, role: 'reviewer', ...(specialized ? { codingConcernReview: concerns } : {}) });
  if (mode === 'existing-slot') await writeFile(correctionRecordPath, '{', 'utf8');
  const run = () => requestReview({ reviewer, controller: f.controller, taskId: task.taskId, attemptId: task.attempts.at(-1)!.attemptId,
    correctionRecordPath, maxCorrections: mode === 'no-slot' ? 0 : 1, prompt: 'Independently review these fixed inputs.', images,
    signal: f.controller.signal, parse: text => specialized ? parseCodingConcernReview(text, task, f.input.requirement, concerns, parseReview, ORDINARY_CODING_HANDOFF) : parseReview(text, task),
    ...(specialized ? { correctionPrompt: codingReviewInstructions(ORDINARY_CODING_HANDOFF) } : {}) });
  t.after(() => { assert.ifError(payloadFailure); });
  return { ...f, bodies, quotes, configs, correctionRecordPath, verdict, run, failure: () => payloadFailure };
}

for (const mode of ['approved', 'changes_requested', 'malformed', 'stale', 'stale-correction', 'empty', 'bad-correction', 'incomplete', 'concern', 'concern-incomplete', 'no-slot', 'existing-slot', 'early'] as const) {
  test(`actual factory/native/requestReview with eight images and original ledger: ${mode}`, async t => {
    const f = await nativeFixture(t, mode);
    if (['stale-correction', 'empty', 'bad-correction', 'incomplete', 'concern-incomplete', 'no-slot', 'existing-slot'].includes(mode)) await assert.rejects(f.run());
    else assert.deepEqual(await f.run().catch(error => { throw f.failure() ?? error; }), f.verdict);
    assert.ifError(f.failure());
    const count = mode === 'early' ? 1 : ['malformed', 'stale', 'stale-correction', 'empty', 'bad-correction', 'incomplete', 'concern-incomplete'].includes(mode) ? 16 : 15;
    assert.equal(f.bodies.length, count);
    const state = await f.controller.read();
    assert.equal(state.ledger.entries.length, count);
    assert.ok(state.ledger.entries.every(entry => entry.status === 'settled' && entry.reservedMicroCny === 0 && entry.settledMicroCny === 140));
    assert.equal(state.run.fees.settledMicroCny, count * 140);
    assert.equal(f.input.task.review.verdict, 'pending', 'a proposed verdict never promotes the task itself');
    const files = await readdir(f.input.stateDirectory);
    assert.equal(files.filter(file => file.endsWith('.jsonl')).length, 1);
    assert.equal(files.some(file => file === 'review.json'), false);
    for (const entry of state.ledger.entries) {
      const receipt = JSON.parse(await readFile(entry.evidence.find(ref => ref.artifactId === `billing-${entry.requestId}`)!.location, 'utf8'));
      assert.equal(receipt.request.hasImages, true);
      assert.equal(receipt.request.maxOutputTokens, 8192);
      assert.equal(receipt.outcome, 'settled');
    }
  });
}

for (const after of [14, 15] as const) for (const kind of ['stop', 'deadline', 'stale', 'balance', 'unknown', 'reserved', 'reserved-full'] as const) {
  if (after === 14 && kind === 'reserved') continue;
  test(`actual factory refuses reserved request after ${after} on ${kind}`, async t => {
    const f = await nativeFixture(t, after === 15 ? 'malformed' : 'approved', { after, kind });
    await assert.rejects(f.run());
    assert.ifError(f.failure());
    assert.equal(f.bodies.length, after, 'no provider dispatch after changed authority');
    assert.equal(f.input.task.review.verdict, 'pending');
  });
}

test('final admission retains affordable known concurrent reservation while correction still forbids it', async t => {
  const f = await nativeFixture(t, 'approved', { after: 14, kind: 'reserved' });
  assert.deepEqual(await f.run().catch(error => { throw f.failure() ?? error; }), f.verdict);
  assert.equal(f.bodies.length, 15);
  const state = await f.controller.read();
  assert.equal(state.ledger.entries.find(row => row.requestId === 'synthetic-unresolved')!.reservedMicroCny, 1000);
});
