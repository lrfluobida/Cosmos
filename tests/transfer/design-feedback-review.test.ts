import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transferFixture, hash } from './runtime-host.fixture.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import * as oracle from '../../probes/transfer/oracle.ts';
import type { TestContext } from 'node:test';

let oracleCalls = 0;
// Only count actual calls; every invocation forwards the real normative oracle.
mock.module(new URL('../../probes/transfer/oracle.ts', import.meta.url), { namedExports: { ...oracle,
  validateTransferDesign: (...args: Parameters<typeof oracle.validateTransferDesign>) => { oracleCalls++; return oracle.validateTransferDesign(...args); } } });
const { createTransferRuntimeHost } = await import('../../probes/transfer/runtime-host.ts');

function check(config: any) {
  return async () => JSON.parse((await config.tools.find((tool: any) => tool.name === 'validate-transfer-design').execute('review-check', {})).content[0].text);
}
async function run(t: TestContext, action: (config: any, f: Awaited<ReturnType<typeof transferFixture>>) => Promise<void>) {
  const f = await transferFixture(t); let actionError: unknown;
  f.setDesignAction(async config => { try { await action(config, f); } catch (error) { actionError = error; throw error; } });
  const host = await createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const tasks = f.prepare(host); assert.ok(host.validateTasks); host.validateTasks(tasks);
  const result = await host.withPreparation(() => executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks: tasks.slice(0, 1),
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory, preAuthor: host.preAuthor,
    capture: host.capture, verify: host.verify, authorProtocolCorrections: 1, reviewProtocolCorrections: 1,
    recovery: { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture } }));
  if (actionError) throw actionError;
  return { ...f, host, tasks, result };
}
const folder = (f: Awaited<ReturnType<typeof run>>) => join(f.root, 'host-transfer-design-validation', f.result[0].taskId, f.result[0].attempts[0].attemptId);

test('COS41 review correction same-byte concurrent reads perform zero additional oracle calls', async t => {
  const f = await run(t, async (config, fixture) => {
    const path = join(config.workspace, 'authors/design/transfer-design.json'), good = await readFile(path), bad = JSON.parse(good.toString('utf8'));
    bad.map.boxes.pop(); await writeFile(path, JSON.stringify(bad), 'utf8');
    const validate = check(config), before = oracleCalls, first = await validate();
    assert.equal(first.passed, false); assert.equal(oracleCalls - before, 1);
    const task = (await fixture.controller.read()).tasks[0], root = join(fixture.root, 'host-transfer-design-validation', task.taskId, task.attempts[0].attemptId);
    const names = await readdir(root), copies = await Promise.all(names.map(name => readFile(join(root, name))));
    const afterFirst = oracleCalls, repeated = await Promise.all([validate(), validate(), validate()]);
    assert.deepEqual(repeated, [first, first, first]); assert.equal(oracleCalls - afterFirst, 0);
    assert.deepEqual(await readdir(root), names); assert.deepEqual(await Promise.all(names.map(name => readFile(join(root, name)))), copies);
    await writeFile(path, good);
    const beforeRewrite = oracleCalls; assert.equal((await validate()).passed, true); assert.equal(oracleCalls - beforeRewrite, 1);
    const afterPass = oracleCalls; assert.equal((await validate()).passed, true); assert.equal(oracleCalls - afterPass, 0);
  });
  assert.equal(f.result[0].state, 'passed'); assert.equal(f.result[0].attempts.length, 1);
});

test('COS41 review correction records real canonical start and completion times within original authority', async t => {
  const before = Date.now();
  const f = await run(t, async config => { assert.equal((await check(config)()).passed, true); });
  assert.equal(f.result[0].state, 'passed');
  const start = JSON.parse(await readFile(join(folder(f), 'check-1-started.json'), 'utf8'));
  const result = JSON.parse(await readFile(join(folder(f), 'check-1-result.json'), 'utf8'));
  assert.equal(typeof start.startedAt, 'string'); assert.equal(typeof result.completedAt, 'string');
  assert.equal(new Date(start.startedAt).toISOString(), start.startedAt); assert.equal(new Date(result.completedAt).toISOString(), result.completedAt);
  assert.ok(before <= Date.parse(start.startedAt) && Date.parse(start.startedAt) <= Date.parse(result.completedAt) && Date.parse(result.completedAt) <= Date.now());
  assert.equal(start.authority.sourceVersion, f.requirement.validation.reviewedPlatformSha);
  assert.equal(start.authority.windowId, f.window.windowId); assert.equal(start.authority.deadlineAt, f.window.deadlineAt);
  assert.ok(Date.parse(result.completedAt) < Date.parse(f.window.deadlineAt));
});

test('COS41 review correction a rehashed cached result cannot turn an invalid submission into a pass', async t => {
  const f = await run(t, async (config, fixture) => {
    const path = join(config.workspace, 'authors/design/transfer-design.json'), bad = JSON.parse(await readFile(path, 'utf8')); bad.map.boxes.pop();
    await writeFile(path, JSON.stringify(bad), 'utf8'); const validate = check(config); assert.equal((await validate()).passed, false);
    const task = (await fixture.controller.read()).tasks[0], file = join(fixture.root, 'host-transfer-design-validation', task.taskId, task.attempts[0].attemptId, 'check-1-result.json');
    const saved = JSON.parse(await readFile(file, 'utf8')); saved.result = { passed: true, rewritesRemaining: 0, mapVersion: bad.mapVersion };
    saved.resultSha256 = hash(JSON.stringify(saved.result)); await writeFile(file, JSON.stringify(saved), 'utf8');
    const before = oracleCalls; await assert.rejects(validate(), /changed|cache|receipt/i); assert.equal(oracleCalls, before);
  });
  assert.equal(f.result[0].state, 'failed'); assert.deepEqual(f.result[0].artifacts, []);
});

for (const changed of ['missing', 'noncanonical', 'reversed', 'deadline', 'window-start', 'round-order'] as const) test(`COS41 review correction ${changed} validation time blocks recovery`, async t => {
  const f = await run(t, async config => {
    if (changed === 'round-order') {
      const path = join(config.workspace, 'authors/design/transfer-design.json'), good = await readFile(path), bad = JSON.parse(good.toString('utf8'));
      bad.map.boxes.pop(); await writeFile(path, JSON.stringify(bad), 'utf8'); assert.equal((await check(config)()).passed, false); await writeFile(path, good);
    }
    assert.equal((await check(config)()).passed, true);
  });
  assert.equal(f.result[0].state, 'passed');
  const ordinal = changed === 'round-order' ? 2 : 1;
  const startPath = join(folder(f), `check-${ordinal}-started.json`), resultPath = join(folder(f), `check-${ordinal}-result.json`);
  const start = JSON.parse(await readFile(startPath, 'utf8')), result = JSON.parse(await readFile(resultPath, 'utf8'));
  if (changed === 'missing') delete result.completedAt;
  if (changed === 'noncanonical') result.completedAt = new Date(start.startedAt).toUTCString();
  if (changed === 'reversed') result.completedAt = new Date(Date.parse(start.startedAt) - 1).toISOString();
  if (changed === 'deadline') result.completedAt = f.window.deadlineAt;
  if (changed === 'window-start') start.startedAt = new Date(Date.parse(f.window.startedAt) - 1).toISOString();
  if (changed === 'round-order') {
    const first = JSON.parse(await readFile(join(folder(f), 'check-1-result.json'), 'utf8'));
    start.startedAt = new Date(Date.parse(first.completedAt) - 1).toISOString();
  }
  await writeFile(startPath, JSON.stringify(start), 'utf8'); result.startedSha256 = hash(JSON.stringify(start)); await writeFile(resultPath, JSON.stringify(result), 'utf8');
  const count = f.calls.length, reopened = await createTransferRuntimeHost({ ...f.input, resume: true }); t.after(() => reopened.closePreparation());
  assert.ok(reopened.validateTasks); reopened.validateTasks(f.tasks);
  assert.equal(await reopened.recoverCapture(f.result[0], { summary: 'Synthetic', remaining: [], uncertainty: [] }, f.controller.signal), null);
  assert.equal(f.calls.length, count);
});
