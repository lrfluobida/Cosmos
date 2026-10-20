import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PassThrough, Readable } from 'node:stream';
import { runCli } from '../../src/cli/index.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import * as session from '../../src/cli/session.ts';
const proposal = { questions: [{ id: 'goal', prompt: '怎样获胜？' }], acceptance: [{ acceptanceId: 'win', description: '点击目标', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
  scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 }, { id: 'assert', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] }, unsupported: [] };
async function childSession(t: test.TestContext, brief: string, input: string, options: string[] = []) {
  assert.equal(typeof session.runProductSession, 'function', 'Public stdin interview session is required');
  const cwd = await mkdtemp(join(tmpdir(), 'cosmos-stdin-')); t.after(() => rm(cwd, { recursive: true, force: true }));
  const root = join(cwd, '中文 run');
  const source = `import {runCli} from ${JSON.stringify(new URL('../../src/cli/index.ts', import.meta.url).href)};
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const proposal=${JSON.stringify(proposal)};
const host={async prepare(){return {environmentReady:true,executionReady:true};},
async questions(input){return proposal.questions;},async draft(input){return {...proposal,brief:input.brief,answers:input.answers};},
async execute(input){await writeFile(join(input.root,'executed.json'),JSON.stringify({requirement:input.requirement,draft:input.draft}),'utf8');return {outcome:'awaiting_user_experience',delivery:'fixture-output'};}};
try{await runCli(['new',process.argv[1],'--brief',process.argv[2],...${JSON.stringify(options)}],{host,input:process.stdin,output:process.stdout});}catch(error){console.error(error.message);process.exitCode=1;}`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source, root, brief], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  let stdout = '', stderr = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  child.stdin.end(input); const code = (await once(child, 'close'))[0];
  return { root, code, stdout, stderr };
}
for (const brief of ['点击星星得分', '搜集宝物']) test(`real stdin confirms the displayed exact draft for ${brief}`, async t => {
  const result = await childSession(t, brief, '点击目标获胜\nconfirm 1\n');
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /草稿 v1/); assert.ok(result.stdout.includes(brief));
  const executed = JSON.parse(await readFile(join(result.root, 'executed.json'), 'utf8'));
  assert.equal(executed.draft.brief, brief); assert.equal(executed.requirement.confirmedBy, 'local-user');
  const snapshot = JSON.parse(await readFile(join(result.root, 'snapshot.json'), 'utf8')); assert.equal(snapshot.formatVersion, 1);
});
test('stdin refusal leaves an intake and never calls generation', async t => {
  const result = await childSession(t, '点击星星得分', '获胜\ncancel\n');
  assert.equal(result.code, 0, result.stderr);
  await assert.rejects(readFile(join(result.root, 'executed.json')), { code: 'ENOENT' });
  const snapshot = JSON.parse(await readFile(join(result.root, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.formatVersion, 'intake-1'); assert.equal(snapshot.confirmation, null);
});
test('real stdin activates the selected five-yuan thirty-minute original window', async t => {
  const result = await childSession(t, '鼠标记忆配对', '配对全部卡片获胜\nconfirm 1\n', ['--max-cny', '5', '--max-minutes', '30']);
  assert.equal(result.code, 0, result.stderr);
  const state = JSON.parse(await readFile(join(result.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.formatVersion, 1); assert.equal(state.ledger.limitMicroCny, 5_000_000);
  assert.equal(Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt), 1_800_000);
  assert.deepEqual(JSON.parse(await readFile(join(result.root, 'intake-origin.json'), 'utf8')).limits, { limitMicroCny: 5_000_000, durationMs: 1_800_000 });
  assert.match(result.stdout, /¥5 总额/); assert.match(result.stdout, /30 分钟/);
});
test('editing an answer invalidates revision one and only exact revision two can generate', async t => {
  const result = await childSession(t, '点击星星得分', '获胜\nedit\n第二种胜利\nconfirm 1\nconfirm 2\n');
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /当前版本/);
  const executed = JSON.parse(await readFile(join(result.root, 'executed.json'), 'utf8'));
  assert.equal(executed.draft.answers.goal, '第二种胜利'); assert.equal(executed.requirement.sources[0].version, 'v2');
});
test('stdin EOF never becomes an implied confirmation', async t => {
  const result = await childSession(t, '点击星星得分', '获胜\n');
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /未确认|输入结束/);
  await assert.rejects(readFile(join(result.root, 'executed.json')), { code: 'ENOENT' });
});

test('public resume reuses the recorded confirmation and original identity without a new interview', async t => {
  const initial = await childSession(t, '点击星星得分', '获胜\nconfirm 1\n'); assert.equal(initial.code, 0, initial.stderr);
  const previous = JSON.parse(await readFile(join(initial.root, 'executed.json'), 'utf8')), snapshot = await readFile(join(initial.root, 'snapshot.json'), 'utf8');
  let resumed = false, stdout = ''; const output = new PassThrough(); output.on('data', chunk => { stdout += chunk; });
  const result = { outcome: 'incomplete', delivery: 'registry/candidates/game/v2/project', report: 'delivery/report-fixture.json', gaps: ['音频体验尚待确认'] };
  await runCli(['resume', initial.root], { input: Readable.from([]), output, host: {
    async prepare() { throw new Error('Generation resume must not repeat intake preparation'); },
    async questions() { throw new Error('Do not interview again'); }, async draft() { throw new Error('Do not draft again'); },
    async execute(input) { assert.equal(input.resume, true); assert.deepEqual(input.requirement, previous.requirement); assert.deepEqual(input.draft, previous.draft); resumed = true; return result; },
  } });
  assert.equal(resumed, true); assert.equal(await readFile(join(initial.root, 'snapshot.json'), 'utf8'), snapshot);
  for (const value of [result.outcome, result.delivery, result.report, result.gaps[0]]) assert.ok(stdout.includes(value), `resume stdout must show ${value}`);
});

test('missing execution prerequisites stop the public flow before interview billing or formal timing', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-cli-gate-')); t.after(() => rm(root, { recursive: true, force: true }));
  const output = new PassThrough(); output.resume(); let requests = 0;
  const result = await runCli(['new', root, '--brief', '点击星星'], { input: Readable.from([]), output, host: {
    async prepare() { return { environmentReady: true, executionReady: false, reason: 'G3 尚未通过' }; },
    async questions() { requests++; throw new Error('No interview admission'); }, async draft() { requests++; throw new Error('No draft admission'); },
    async execute() { requests++; throw new Error('No generation admission'); },
  } });
  assert.equal(result.outcome, 'waiting_prerequisites'); assert.equal(requests, 0);
  const snapshot = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.formatVersion, 'intake-1'); assert.equal(snapshot.run.originalStartedAt, undefined); assert.deepEqual(snapshot.ledger.entries, []);
});

test('intake resume reconciles a durable receipt before allowing another interview step', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-intake-receipt-')); t.after(() => rm(root, { recursive: true, force: true }));
  const output = new PassThrough(); output.resume();
  const blockedHost = { async prepare() { return { environmentReady: true, executionReady: false }; }, async questions() { return proposal.questions; },
    async draft() { throw new Error('No draft required'); }, async execute() { throw new Error('No generation required'); } };
  await runCli(['new', root, '--brief', '点击星星'], { input: Readable.from([]), output, host: blockedHost });
  const controller = await IntakeController.open({ root }), before = await controller.read();
  const budget = createRoleBudget({ controller, taskId: 'intake', evidenceDirectory: join(root, 'intake-sessions/questions-1') });
  await budget.beforeRequest({ requestId: 'reply-lost', modelId: 'deepseek-flash', inputBytes: 10, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 100 });
  const settle = controller.settle;
  controller.settle = async () => { throw new Error('Simulated settlement interruption after durable receipt'); };
  await assert.rejects(budget.afterResponse({ requestId: 'reply-lost', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }));
  controller.settle = settle; await controller.close();
  let checked = false;
  await runCli(['resume', root], { input: Readable.from([]), output, host: { ...blockedHost, async prepare() { return { environmentReady: true, executionReady: true }; },
    async questions(input) { const snapshot = await input.controller.read(); assert.equal(snapshot.ledger.entries[0].status, 'settled'); checked = true; return proposal.questions; },
  } });
  const final = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  assert.equal(checked, true); assert.equal(final.ledger.entries.length, 1); assert.equal(final.ledger.entries[0].settledMicroCny, 10);
  assert.equal(final.ledger.ledgerId, before.ledger.ledgerId); assert.equal(final.createdAt, before.createdAt); assert.equal(final.run.originalStartedAt, undefined);
});

test('selected intake and formal resume preserve settled fees, limits and the original clock', async t => {
  const f = await childSession(t, '鼠标记忆配对', '配对获胜\ncancel\n', ['--max-cny', '5', '--max-minutes', '30']);
  assert.equal(f.code, 0, f.stderr);
  const intake = await IntakeController.open({ root: f.root });
  await intake.reserve({ requestId: 'synthetic-settled', taskId: 'intake', provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: 10 });
  await intake.admit('synthetic-settled');
  await intake.settle('synthetic-settled', 10, [{ artifactId: 'fixture-bill', version: 'v1', location: 'fixture-bill.json' }]);
  const before = await intake.read(); await intake.close();
  let executions = 0;
  const output = new PassThrough(); output.resume();
  const host = { async prepare() { return { environmentReady: true, executionReady: true }; },
    async questions() { throw new Error('Do not re-interview'); }, async draft() { throw new Error('Do not redraft'); },
    async execute() { executions++; return { outcome: 'incomplete' }; } };
  await runCli(['resume', f.root], { host, output, input: Readable.from(['confirm 1\n']) });
  const active = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(active.ledger, before.ledger); assert.equal(active.run.fees.settledMicroCny, 10);
  assert.equal(Date.parse(active.run.originalDeadlineAt) - Date.parse(active.run.originalStartedAt), 1_800_000);
  await runCli(['resume', f.root], { host, output, input: Readable.from([]) });
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), active); assert.equal(executions, 2);
  const controller = await RunController.open({ root: f.root });
  await controller.stop('Synthetic owner persisted a manual stop.'); await controller.close();
  const stopped = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(runCli(['resume', f.root], { host, output, input: Readable.from([]) }), /stopped|停止/i);
  assert.equal(executions, 2); assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(stopped));
});

for (const phase of ['intake', 'formal']) test(`changed ${phase} limit sources reject before owner recovery and host effects`, async t => {
  const f = await childSession(t, '鼠标记忆配对', `配对获胜\n${phase === 'intake' ? 'cancel' : 'confirm 1'}\n`, ['--max-cny', '5', '--max-minutes', '30']);
  assert.equal(f.code, 0, f.stderr);
  const path = join(f.root, 'intake-origin.json'), originBytes = await readFile(path), origin = JSON.parse(originBytes.toString('utf8'));
  const snapshot = await readFile(join(f.root, 'snapshot.json')), lock = join(f.root, '.controller.lock');
  await writeFile(lock, 'source guard must reject before owner recovery', 'utf8');
  let calls = 0; const output = new PassThrough(); output.resume();
  const fail = async () => { calls++; throw new Error('Host must not be reached'); };
  const host = { prepare: fail, questions: fail, draft: fail, execute: fail };
  for (const mutation of ['money', 'duration', 'deleted', 'partial', 'invalid', 'origin']) {
    const next = structuredClone(origin);
    if (mutation === 'money') next.limits.limitMicroCny++;
    if (mutation === 'duration') next.limits.durationMs += 60_000;
    if (mutation === 'deleted') delete next.limits;
    if (mutation === 'partial') delete next.limits.durationMs;
    if (mutation === 'invalid') next.limits.limitMicroCny = 0;
    if (mutation === 'origin') await unlink(path); else await writeFile(path, JSON.stringify(next), 'utf8');
    await assert.rejects(runCli(['resume', f.root], { host, output, input: Readable.from([]) }), /limit|origin|限额|来源/i, mutation);
    assert.equal(calls, 0); assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(snapshot));
    assert.equal(await readFile(lock, 'utf8'), 'source guard must reject before owner recovery');
    await writeFile(path, originBytes);
  }
  await unlink(lock);
});

test('internal lower-limit API confirmations without a public origin keep their original contract', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos107-internal-')); t.after(() => rm(root, { recursive: true, force: true }));
  const intake = await IntakeController.create({ root, runId: 'internal-game', ledgerId: 'internal-budget', specVersion: '1.0',
    interviewTaskId: 'intake', maxRequests: 1, limitMicroCny: 1000, durationMs: 120_000, allocations: [{ taskId: 'intake', amountMicroCny: 100 }] });
  try {
    const saved = await intake.saveDraft({ ...proposal, brief: '点击星星', answers: { goal: '获胜' } } as any);
    const requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'internal-owner', at: new Date().toISOString() });
    const state = await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
    assert.deepEqual((await session.readConfirmedGeneration(root, state)).requirement, requirement);
    assert.equal(state.ledger.limitMicroCny, 1000);
  } finally { await intake.close(); }
});
