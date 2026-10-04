import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transferFixture, hash } from './runtime-host.fixture.ts';
import { createTransferRuntimeHost } from '../../probes/transfer/runtime-host.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { TestContext } from 'node:test';

const mapPath = 'authors/design/transfer-design.json';
function validator(config: any) {
  const tool = config.tools.find((tool: any) => tool.name === 'validate-transfer-design');
  assert.ok(tool, 'The original design session needs the trusted validation tool');
  return async (args = {}) => {
    const result = await tool.execute('design-check', args, undefined, undefined, undefined);
    return JSON.parse(result.content[0].text);
  };
}
async function run(t: TestContext, action: (config: any, f: Awaited<ReturnType<typeof transferFixture>>) => Promise<void>, all = false) {
  const f = await transferFixture(t); let actionError: unknown;
  f.setDesignAction(async config => { try { await action(config, f); } catch (error) { actionError = error; throw error; } });
  const host = await createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const tasks = f.prepare(host); assert.ok(host.validateTasks); host.validateTasks(tasks);
  const recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture };
  const options = { controller: f.controller, validation: f.validation, requirement: f.requirement, tasks: all ? tasks : tasks.slice(0, 1),
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, diagnoseFailure: host.diagnoseFailure, recovery,
    authorProtocolCorrections: 1 as const, reviewProtocolCorrections: 1 as const };
  const result = await host.withPreparation(() => executeTaskDag(options));
  if (actionError) throw actionError;
  return { ...f, host, tasks, result, options };
}

test('COS41 first pass seals once, same bytes reuse it, and generic design can be accurately updated', async t => {
  const f = await run(t, async config => {
    const check = validator(config), first = await check();
    assert.equal(first.passed, true); assert.equal(first.rewritesRemaining, 0);
    assert.deepEqual(await check(), first);
    const data = JSON.parse(await readFile(join(config.workspace, 'authors/design/design.json'), 'utf8'));
    data.summary = '已校验的合成设计说明';
    await config.tools.find((tool: any) => tool.name === 'write').execute('summary', { path: 'authors/design/design.json', content: JSON.stringify(data) });
  });
  assert.equal(f.result[0].state, 'passed'); assert.equal(f.result[0].attempts.length, 1);
  const folder = join(f.root, 'host-transfer-design-validation', f.result[0].taskId, f.result[0].attempts[0].attemptId);
  assert.deepEqual((await readdir(folder)).sort(), ['check-1-raw.json', 'check-1-result.json', 'check-1-started.json']);
  const saved = JSON.parse(await readFile(join(f.root, 'host-transfer-prepared-inputs.json'), 'utf8'));
  assert.equal(saved.frozen.designSha256, hash(await readFile(join(folder, 'check-1-raw.json'))));
  assert.ok(f.configs.filter(config => JSON.parse(config.context).role === 'reviewer').every(config => !config.tools.some((tool: any) => tool.name === 'validate-transfer-design')));
  const count = f.calls.length;
  const reopened = await createTransferRuntimeHost({ ...f.input, resume: true }); t.after(() => reopened.closePreparation());
  assert.ok(reopened.validateTasks); reopened.validateTasks(f.tasks);
  assert.deepEqual((await reopened.recoverCapture(f.result[0], { summary: 'Synthetic', remaining: [], uncertainty: [] }, f.controller.signal))?.artifacts, f.result[0].artifacts);
  assert.equal(f.calls.length, count);
});

test('COS41 invalid design gets one same-session rewrite with raw diagnosis and the original billing grant', async t => {
  let firstRaw: Buffer | undefined;
  const f = await run(t, async config => {
    const good = await readFile(join(config.workspace, mapPath)), bad = JSON.parse(good.toString('utf8')); bad.map.boxes.pop();
    firstRaw = Buffer.from(JSON.stringify(bad));
    const write = config.tools.find((tool: any) => tool.name === 'write'), check = validator(config);
    await write.execute('invalid', { path: mapPath, content: firstRaw.toString('utf8') });
    const first = await check(); assert.equal(first.passed, false); assert.equal(first.rewritesRemaining, 1);
    assert.match(first.diagnosis.message, /exactly two/); assert.deepEqual(await check(), first);
    const requestId = 'design-semantic-followup';
    await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
    await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    await write.execute('rewrite', { path: mapPath, content: good.toString('utf8') });
    assert.equal((await check()).passed, true);
  });
  assert.equal(f.result[0].state, 'passed'); assert.equal(f.result[0].attempts.length, 1);
  assert.equal(f.configs.filter(config => JSON.parse(config.context).role === 'design').length, 1);
  const folder = join(f.root, 'host-transfer-design-validation', f.result[0].taskId, f.result[0].attempts[0].attemptId);
  assert.deepEqual(await readFile(join(folder, 'check-1-raw.json')), firstRaw);
  const snapshot = await f.controller.read(), charged = snapshot.ledger.entries.find(entry => entry.requestId === 'design-semantic-followup')!;
  assert.equal(charged.taskId, f.result[0].taskId); assert.equal(charged.settledMicroCny, 10);
  assert.equal(snapshot.requests.find(item => item.requestId === charged.requestId)?.validation?.purpose, 'author');
  assert.equal(snapshot.validation!.cases[0].repair, null); assert.deepEqual(snapshot.run.humanDecisions, []);
});

for (const mode of ['skip', 'changed-after-pass', 'exhausted'] as const) test(`COS41 ${mode} stops downstream even with a valid final map`, async t => {
  const f = await run(t, async config => {
    if (mode === 'skip') return;
    const path = join(config.workspace, mapPath), good = await readFile(path), check = validator(config);
    if (mode === 'changed-after-pass') { assert.equal((await check()).passed, true); await writeFile(path, good.toString('utf8') + '\n', 'utf8'); return; }
    for (let i = 0; i < 2; i++) {
      const bad = JSON.parse(good.toString('utf8')); bad.map.boxes.pop(); bad.mapVersion += '-' + i;
      await writeFile(path, JSON.stringify(bad), 'utf8'); const result = await check();
      assert.equal(result.passed, false); assert.equal(result.rewritesRemaining, 1 - i);
    }
    await writeFile(path, good);
    await assert.rejects(check(), /exhausted/i);
  }, true);
  assert.equal(f.result[0].state, 'failed'); assert.equal(f.result[0].attempts.length, 1);
  assert.ok(!f.calls.some(item => ['art', 'coding'].includes(item.kind)));
  assert.equal((await f.controller.read()).validation!.cases[0].repair, null);
});

test('COS41 strict tool scope rejects path arguments and audit writes', async t => {
  const f = await run(t, async config => {
    const check = validator(config);
    await assert.rejects(check({ path: '../other.json' }), /argument|parameter/i);
    await assert.rejects(config.tools.find((tool: any) => tool.name === 'write').execute('audit', { path: 'host-transfer-design-validation/fake.json', content: '{}' }), /allowed task paths/i);
    assert.equal((await check()).passed, true);
  });
  assert.equal(f.result[0].state, 'passed');
});

test('COS41 incomplete validation receipt blocks recovery without another session or attempt', async t => {
  const f = await run(t, async config => { assert.equal((await validator(config)()).passed, true); });
  assert.equal(f.result[0].state, 'passed');
  const attempt = f.result[0].attempts[0], path = join(f.root, 'host-transfer-design-validation', f.result[0].taskId, attempt.attemptId, 'check-1-result.json');
  await unlink(path);
  const count = f.calls.length, reopened = await createTransferRuntimeHost({ ...f.input, resume: true }); t.after(() => reopened.closePreparation());
  assert.ok(reopened.validateTasks); reopened.validateTasks(f.tasks);
  assert.equal(await reopened.recoverCapture(f.result[0], { summary: 'Synthetic', remaining: [], uncertainty: [] }, f.controller.signal), null);
  await assert.rejects(resumeTaskDag({ ...f.options, roleFactory: reopened.roleFactory, recovery: { ...f.options.recovery, recoverCapture: reopened.recoverCapture } }), /capture|authority|receipt/i);
  assert.equal(f.calls.length, count);
  assert.equal((await f.controller.read()).tasks[0].attempts.length, 1);
});

test('COS41 invalid UTF-8 is retained exactly and author write tools do not change its encoding', async t => {
  const raw = Buffer.from([0xff, 0xfe, 0x00]);
  const f = await run(t, async config => {
    await writeFile(join(config.workspace, mapPath), raw);
    const result = await validator(config)(); assert.equal(result.passed, false); assert.match(result.diagnosis.message, /UTF-8/);
    await assert.rejects(config.tools.find((tool: any) => tool.name === 'write').execute('encoding', { path: mapPath, content: '{}' }), /not UTF-8/);
  });
  assert.equal(f.result[0].state, 'failed');
  assert.deepEqual(await readFile(join(f.root, 'host-transfer-design-validation', f.result[0].taskId, f.result[0].attempts[0].attemptId, 'check-1-raw.json')), raw);
});

test('COS41 started without result fails before capture and cannot gain another validation or author on resume', async t => {
  const f = await run(t, async (config, fixture) => {
    const check = validator(config); assert.equal((await check()).passed, true);
    const task = (await fixture.controller.read()).tasks[0], attempt = task.attempts[0];
    await unlink(join(fixture.root, 'host-transfer-design-validation', task.taskId, attempt.attemptId, 'check-1-result.json'));
    await assert.rejects(check(), /unknown|complete result/i);
  });
  assert.equal(f.result[0].state, 'failed'); assert.deepEqual(f.result[0].artifacts, []);
  const count = f.calls.length;
  const reopened = await createTransferRuntimeHost({ ...f.input, resume: true }); t.after(() => reopened.closePreparation());
  assert.ok(reopened.validateTasks); reopened.validateTasks(f.tasks);
  const result = await resumeTaskDag({ ...f.options, roleFactory: reopened.roleFactory, recovery: { ...f.options.recovery, recoverCapture: reopened.recoverCapture } });
  assert.ok(result.blocked.length); assert.equal(f.calls.length, count);
  assert.equal((await f.controller.read()).tasks[0].attempts.length, 1);
});

for (const changed of ['raw', 'result', 'binding'] as const) test(`COS41 changed ${changed} audit cannot recover a successful capture`, async t => {
  const f = await run(t, async config => { assert.equal((await validator(config)()).passed, true); });
  assert.equal(f.result[0].state, 'passed');
  const base = join(f.root, 'host-transfer-design-validation', f.result[0].taskId, f.result[0].attempts[0].attemptId);
  if (changed === 'raw') { const file = join(base, 'check-1-raw.json'); await writeFile(file, (await readFile(file)).toString('utf8') + '\n', 'utf8'); }
  else if (changed === 'result') { const file = join(base, 'check-1-result.json'), saved = JSON.parse(await readFile(file, 'utf8')); saved.result.rewritesRemaining = 1; await writeFile(file, JSON.stringify(saved), 'utf8'); }
  else {
    const file = join(base, 'check-1-started.json'), saved = JSON.parse(await readFile(file, 'utf8')); saved.binding.contextId = 'other-context';
    await writeFile(file, JSON.stringify(saved), 'utf8');
    const resultPath = join(base, 'check-1-result.json'), result = JSON.parse(await readFile(resultPath, 'utf8'));
    result.startedSha256 = hash(JSON.stringify(saved)); await writeFile(resultPath, JSON.stringify(result), 'utf8');
  }
  const count = f.calls.length, reopened = await createTransferRuntimeHost({ ...f.input, resume: true }); t.after(() => reopened.closePreparation());
  assert.ok(reopened.validateTasks); reopened.validateTasks(f.tasks);
  assert.equal(await reopened.recoverCapture(f.result[0], { summary: 'Synthetic', remaining: [], uncertainty: [] }, f.controller.signal), null);
  assert.equal(f.calls.length, count);
});

for (const bound of ['requests', 'unknown', 'deadline'] as const) test(`COS41 ${bound} authority cannot open another semantic submission`, async t => {
  let fixture: Awaited<ReturnType<typeof transferFixture>> | undefined;
  const outcome = await run(t, async (config, f) => {
    fixture = f; const check = validator(config), path = join(config.workspace, mapPath), good = await readFile(path);
    const bad = JSON.parse(good.toString('utf8')); bad.map.boxes.pop(); await writeFile(path, JSON.stringify(bad), 'utf8');
    assert.equal((await check()).rewritesRemaining, 1);
    if (bound === 'deadline') f.advance(2_700_001);
    else {
      const count = bound === 'requests' ? 79 : 1;
      for (let i = 0; i < count; i++) {
        const requestId = `design-bound-${i}`;
        await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
        await config.budget.afterResponse(bound === 'unknown' ? { requestId, outcome: 'unknown', elapsedMs: 1 }
          : { requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      }
    }
    const before = await f.controller.read();
    await writeFile(path, good); await assert.rejects(check(), error => f.controller.signal.aborted && error === f.controller.signal.reason
      || error instanceof Error && /authority|abort|cancel|limit|deadline|reconciliation/i.test(error.message));
    const after = await f.controller.read(); assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.requests, before.requests);
    const task = before.tasks[0]; assert.equal((await readdir(join(f.root, 'host-transfer-design-validation', task.taskId, task.attempts[0].attemptId))).length, 3);
    assert.equal(before.validation!.cases[0].repair, null);
  }).then(result => ({ result, error: undefined }), error => ({ result: undefined, error }));
  assert.ok(fixture);
  if (outcome.error) {
    assert.notEqual(outcome.error.code, 'ERR_ASSERTION');
    if (fixture.controller.signal.aborted) assert.equal(outcome.error, fixture.controller.signal.reason);
    else assert.match(String(outcome.error), /authority|abort|cancel|limit|deadline|scope|stopped|reconciliation/i);
  }
  else assert.ok(['failed', 'cancelled'].includes(outcome.result!.result[0].state));
  assert.ok(!fixture.calls.some(item => ['art', 'coding', 'reviewer'].includes(item.kind)));
});
