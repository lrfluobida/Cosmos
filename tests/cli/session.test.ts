import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PassThrough, Readable } from 'node:stream';
import { runCli } from '../../src/cli/index.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import * as session from '../../src/cli/session.ts';
const proposal = { questions: [{ id: 'goal', prompt: '怎样获胜？' }], acceptance: [{ acceptanceId: 'win', description: '点击目标', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
  scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 }, { id: 'assert', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] }, unsupported: [] };
async function childSession(t: test.TestContext, brief: string, input: string) {
  assert.equal(typeof session.runProductSession, 'function', 'Public stdin interview session is required');
  const cwd = await mkdtemp(join(tmpdir(), 'cosmos-stdin-')); t.after(() => rm(cwd, { recursive: true, force: true }));
  const root = join(cwd, '中文 run');
  const source = `import {runCli} from ${JSON.stringify(new URL('../../src/cli/index.ts', import.meta.url).href)};
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const proposal=${JSON.stringify(proposal)};
const host={async prepare(){return {environmentReady:true,executionReady:true};},
async questions(input){return proposal.questions;},async draft(input){return {...proposal,brief:input.brief,answers:input.answers};},
async execute(input){await writeFile(join(input.root,'executed.json'),JSON.stringify({requirement:input.requirement,draft:input.draft}),'utf8');return {outcome:'awaiting_user_experience',delivery:'fixture-output'};}};
try{await runCli(['new',process.argv[1],'--brief',process.argv[2]],{host,input:process.stdin,output:process.stdout});}catch(error){console.error(error.message);process.exitCode=1;}`;
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
  let resumed = false; const output = new PassThrough(); output.resume();
  await runCli(['resume', initial.root], { input: Readable.from([]), output, host: {
    async prepare() { throw new Error('Generation resume must not repeat intake preparation'); },
    async questions() { throw new Error('Do not interview again'); }, async draft() { throw new Error('Do not draft again'); },
    async execute(input) { assert.equal(input.resume, true); assert.deepEqual(input.requirement, previous.requirement); assert.deepEqual(input.draft, previous.draft); resumed = true; return { outcome: 'fixture' }; },
  } });
  assert.equal(resumed, true); assert.equal(await readFile(join(initial.root, 'snapshot.json'), 'utf8'), snapshot);
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
