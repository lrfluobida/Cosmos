import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { runProductSession, readConfirmedGeneration } from '../../src/cli/session.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { ordinaryDraft, profile, brief, questions } from '../roles/ordinary.fixture.ts';
import { validateGameDraft, withHostStages } from '../../src/roles/requirements.ts';
import { proposal as legacyProposal } from '../roles/interview-recovery.fixture.ts';

async function ordinarySession(t: test.TestContext, input = '点亮三个目标后显示完成。\nconfirm 1\n', change = {}, renderFrames = false) {
  const root = await mkdtemp(join(tmpdir(), 'cos111-session-')); t.after(() => removeOwned(tmpdir(), root));
  let text = '', executions = 0; const output = new PassThrough(); output.on('data', chunk => { text += chunk.toString(); });
  const host = { ordinaryProfile: profile, async prepare() { return { environmentReady: true, executionReady: true }; },
    async questions() { return questions; }, async draft(value: any) { return { ...ordinaryDraft(), brief: value.brief, answers: value.answers, ...change }; },
    async execute(value: any) { executions++; return { outcome: 'incomplete', draft: value.draft, requirement: value.requirement }; } };
  const result = await runProductSession({ command: 'new', root, brief, host, renderFrames, input: Readable.from([input]), output });
  return { root, host, result: result as any, text, executions };
}
test('ordinary public session confirms both requirement groups and persists the source-selected profile', async t => {
  const f = await ordinarySession(t);
  assert.equal(f.executions, 1); assert.match(f.text, /目标和状态容易辨识/); assert.match(f.text, /试玩并辨认目标状态/);
  assert.match(f.text, /运行时设计/); assert.doesNotMatch(f.text, /自动操作与检查/);
  const snapshot = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const confirmed = await readConfirmedGeneration(f.root, snapshot);
  assert.deepEqual(confirmed.draft, f.result.draft); assert.equal(confirmed.draft.ordinaryProfile, profile);
  assert.deepEqual(confirmed.requirement.acceptance, ordinaryDraft().acceptance);
  const origin = JSON.parse(await readFile(join(f.root, 'intake-origin.json'), 'utf8'));
  const answer = JSON.parse(await readFile(join(f.root, 'intake-answers/v1.json'), 'utf8'));
  assert.equal(origin.ordinaryProfile, profile); assert.equal(answer.ordinaryProfile, profile);
  const receipt = JSON.parse(await readFile(join(f.root, confirmed.requirement.sources[1].location), 'utf8'));
  assert.equal(receipt.ordinaryProfile, profile); assert.match(receipt.ordinaryDraftSha256, /^[a-f0-9]{64}$/);
});
test('ordinary unsupported and stale stdin do not confirm or activate a run', async t => {
  for (const f of [await ordinarySession(t, undefined, { unsupported: ['观察后自动选择动作尚未支持'] }),
    await ordinarySession(t, '点亮三个目标。\nconfirm 2\ncancel\n')]) {
    assert.equal(f.executions, 0);
    const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
    assert.equal(state.formatVersion, 'intake-1'); assert.equal(state.confirmation, null); assert.equal(state.run.originalStartedAt, undefined);
  }
});
test('ordinary resume uses the original profile even when the host now advertises legacy', async t => {
  const f = await ordinarySession(t, '点亮三个目标。\ncancel\n'), output = new PassThrough(); output.resume();
  const original = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const result: any = await runProductSession({ command: 'resume', root: f.root, input: Readable.from(['confirm 1\n']), output,
    host: { ...f.host, ordinaryProfile: undefined, async questions() { throw new Error('Do not ask again'); }, async draft() { throw new Error('Do not redraft'); } } });
  assert.equal(result.draft.ordinaryProfile, profile);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(state.ledger, original.ledger);
});
test('ordinary source gate rejects drift before resumed confirmation without creating a decision or clock', async t => {
  for (const changed of ['answers', 'questions', 'origin-brief', 'missing-answers', 'answer-profile']) {
    const f = await ordinarySession(t, '点亮三个目标。\ncancel\n');
    const path = join(f.root, changed === 'origin-brief' ? 'intake-origin.json' : 'intake-answers/v1.json');
    if (changed === 'missing-answers') await unlink(path);
    else {
      const value = JSON.parse(await readFile(path, 'utf8'));
      if (changed === 'answers') value.answers.goal = '缩小范围';
      if (changed === 'questions') value.questions[0].prompt = '不同问题';
      if (changed === 'origin-brief') value.brief = '不同需求';
      if (changed === 'answer-profile') delete value.ordinaryProfile;
      await writeFile(path, JSON.stringify(value), 'utf8');
    }
    const before = await readFile(join(f.root, 'snapshot.json'));
    let executions = 0; const output = new PassThrough(); output.resume();
    await assert.rejects(runProductSession({ command: 'resume', root: f.root, input: Readable.from(['confirm 1\n']), output,
      host: { ...f.host, async execute() { executions++; return { outcome: 'must-not-execute' }; } } }), /ordinary.*(answer|source|origin)|ENOENT/i);
    assert.equal(executions, 0);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    const state = JSON.parse(before.toString('utf8'));
    assert.equal(state.formatVersion, 'intake-1'); assert.equal(state.confirmation, null); assert.equal(state.run.originalStartedAt, undefined);
    await assert.rejects(readFile(join(f.root, 'requirements/v1/confirmation.json')), { code: 'ENOENT' });
  }
});
test('ordinary source gate rejects drift after confirmation while retaining the original decision', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos111-activation-source-')); t.after(() => removeOwned(tmpdir(), root));
  let prepares = 0, executions = 0, confirmedState: Buffer | undefined, confirmationBytes: Buffer | undefined;
  const output = new PassThrough(); output.resume();
  const host = { ordinaryProfile: profile,
    async prepare() {
      if (++prepares === 2) {
        confirmedState = await readFile(join(root, 'snapshot.json'));
        confirmationBytes = await readFile(join(root, 'requirements/v1/confirmation.json'));
        const path = join(root, 'intake-answers/v1.json'), value = JSON.parse(await readFile(path, 'utf8'));
        value.answers.goal = '确认后被替换的回答'; await writeFile(path, JSON.stringify(value), 'utf8');
      }
      return { environmentReady: true, executionReady: true };
    },
    async questions() { return questions; },
    async draft(value: any) { return { ...ordinaryDraft(), answers: value.answers }; },
    async execute() { executions++; return { outcome: 'must-not-execute' }; },
  };
  await assert.rejects(runProductSession({ command: 'new', root, brief, host, output,
    input: Readable.from(['点亮三个目标后显示完成。\nconfirm 1\n']) }), /ordinary.*(answer|source)/i);
  assert.equal(executions, 0); assert.equal(prepares, 2); assert.ok(confirmedState); assert.ok(confirmationBytes);
  assert.deepEqual(await readFile(join(root, 'snapshot.json')), confirmedState);
  assert.deepEqual(await readFile(join(root, 'requirements/v1/confirmation.json')), confirmationBytes);
  const state = JSON.parse(confirmedState.toString('utf8'));
  assert.equal(state.formatVersion, 'intake-1'); assert.ok(state.confirmation); assert.equal(state.run.originalStartedAt, undefined);
});
test('ordinary confirmation retains modular and render-frame selections', async t => {
  const draft = withHostStages({ ...ordinaryDraft(), codeProfile: 'modular-code/1' });
  const f = await ordinarySession(t, undefined, draft, true);
  const confirmed = await readConfirmedGeneration(f.root, JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')));
  assert.equal(confirmed.draft.codeProfile, 'modular-code/1'); assert.equal(confirmed.renderFrames, true);
  assert.deepEqual(confirmed.requirement.acceptance, draft.acceptance);
});
test('ordinary classic selection displays its partial policy scope before confirmation', async t => {
  const f = await ordinarySession(t, undefined, { benchmark: 'classic-pc-runtime-policy/1' });
  assert.match(f.text, /仅执行启动与离线存档重开/); assert.match(f.text, /230/); assert.match(f.text, /完整经典验收仍未通过/);
});
test('a new host default does not migrate an existing legacy intake', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos111-legacy-')); t.after(() => removeOwned(tmpdir(), root));
  const output = new PassThrough(); output.resume();
  const host = { async prepare() { return { environmentReady: true, executionReady: true }; }, async questions() { return questions; },
    async draft(value: any) { const draft = { ...legacyProposal, brief, questions, answers: value.answers }; validateGameDraft(draft); return draft; },
    async execute(value: any) { return value.draft; } };
  await runProductSession({ command: 'new', root, brief, host, output, input: Readable.from(['点击后获胜。\ncancel\n']) });
  const draft: any = await runProductSession({ command: 'resume', root, host: { ...host, ordinaryProfile: profile }, output, input: Readable.from(['confirm 1\n']) });
  assert.equal(draft.ordinaryProfile, undefined); assert.deepEqual(draft.scenario, legacyProposal.scenario);
});
for (const changed of ['origin', 'answer', 'draft', 'confirmation', 'profile-source']) test(`ordinary confirmed reader rejects changed ${changed}`, async t => {
  const f = await ordinarySession(t), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  if (changed === 'profile-source') await unlink(join(f.root, 'intake-ordinary-profile.json'));
  else {
    const name = changed === 'origin' ? 'intake-origin.json' : changed === 'answer' ? 'intake-answers/v1.json' : `requirements/v1/${changed}.json`;
    const path = join(f.root, name), value = JSON.parse(await readFile(path, 'utf8'));
    if (changed === 'draft') value.experienceCriteria[0].expected = '另一个体验要求';
    else if (changed === 'answer') value.answers.goal = '缩小范围';
    else delete value.ordinaryProfile;
    await writeFile(path, JSON.stringify(value), 'utf8');
  }
  await assert.rejects(readConfirmedGeneration(f.root, state), /profile|source|draft|answer|confirmation/i);
});
test('production host does not advertise or execute the unconnected ordinary profile', async t => {
  const f = await ordinarySession(t, '点亮三个目标。\ncancel\n');
  const repository = dirname(dirname(dirname(fileURLToPath(import.meta.url)))), host = createProductHost(repository);
  assert.equal(host.ordinaryProfile, undefined);
  assert.equal((await host.prepare(f.root)).executionReady, false);
  await assert.rejects(executeGeneration({ root: f.root, draft: ordinaryDraft(), requirement: {} as any, resume: false,
    async createHost() { throw new Error('Must not construct a host'); } }), /ordinary.*(connected|ready)|unconnected/i);
});
test('actual process stdin confirms the displayed ordinary revision without authorizing production execution', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos111-stdin-')); t.after(() => removeOwned(tmpdir(), root));
  const code = `import {runProductSession} from ${JSON.stringify(new URL('../../src/cli/session.ts', import.meta.url).href)};
const draft=${JSON.stringify(ordinaryDraft())};
const host={ordinaryProfile:draft.ordinaryProfile,async prepare(){return {environmentReady:true,executionReady:true}},async questions(){return draft.questions},
async draft(input){return {...draft,answers:input.answers}},async execute(input){return {outcome:'fixture-confirmed',profile:input.draft.ordinaryProfile,confirmedBy:input.requirement.confirmedBy}}};
await runProductSession({command:'new',root:process.argv[1],brief:draft.brief,host,input:process.stdin,output:process.stdout});`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code, root],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  let output = '', error = ''; child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { error += part; });
  child.stdin.end('点亮三个目标后显示完成。\nconfirm 1\n');
  assert.equal((await once(child, 'close'))[0], 0, error);
  assert.match(output, /目标和状态容易辨识/); assert.match(output, /fixture-confirmed/); assert.match(output, /local-user/);
});
