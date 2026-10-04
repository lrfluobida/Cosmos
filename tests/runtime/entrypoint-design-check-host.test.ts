import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transferFixture, ids, hash } from '../transfer/runtime-host.fixture.ts';
import { createTransferRuntimeHost } from '../../probes/transfer/runtime-host.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { validateDesign } from '../../src/runtime/entrypoint-media.ts';
import { validationBrowserFixture } from './entrypoint-host-validation.fixture.ts';
import { snapshot } from '../../src/artifacts/paths.ts';

const path = 'authors/design/design.json';
const illegal = () => ({ summary: 'x', implementationNotes: ['x'], acceptanceMapping: Object.fromEntries(ids.map(id => [id, 'x'])),
  characters: [{ id: 'box', purpose: 'box', states: ['idle', 'pushed', 'onTarget'] }], audio: [] });

test('COS46 original design session self-checks identifiers then captures the author correction with its sealed map unchanged', async t => {
  assert.throws(() => validateDesign(illegal(), ids), /Invalid media spec: identifier/);
  const f = await transferFixture(t); let checked = false, actionError: unknown;
  f.setDesignAction(async config => { try {
    const generic = config.tools.find((tool: any) => tool.name === 'validate-game-design');
    assert.ok(generic, 'The original design session needs its declared generic self-check tool');
    const transfer = config.tools.find((tool: any) => tool.name === 'validate-transfer-design');
    assert.ok(transfer);
    const map = await readFile(join(config.workspace, 'authors/design/transfer-design.json'));
    assert.equal(JSON.parse((await transfer.execute('seal', {})).content[0].text).passed, true);
    const write = config.tools.find((tool: any) => tool.name === 'write');
    await write.execute('invalid', { path, content: JSON.stringify(illegal()) });
    const before = await f.controller.read();
    const invalid = JSON.parse((await generic.execute('self-check', {})).content[0].text);
    assert.equal(invalid.passed, false);
    assert.equal(invalid.errors[0].path, 'characters[0].states[2]');
    assert.match(invalid.errors[0].message, /\^\[a-z\]\[a-z0-9-\]\{0,47\}\$/);
    const corrected = illegal(); corrected.characters[0].states[2] = 'on-target';
    await write.execute('author-fix', { path, content: JSON.stringify(corrected) });
    const passed = JSON.parse((await generic.execute('current-check', {})).content[0].text);
    assert.deepEqual(passed, { passed: true, errors: [] });
    assert.deepEqual(await f.controller.read(), before, 'Read-only feedback does not change fees, requests, grants or task attempts.');
    assert.deepEqual(await readFile(join(config.workspace, 'authors/design/transfer-design.json')), map);
    assert.equal(JSON.parse((await transfer.execute('same-map', {})).content[0].text).rewritesRemaining, 0);
    checked = true;
  } catch (error) { actionError = error; throw error; } });
  const host = await createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const designPolicy = host.taskPolicies.find(policy => policy.role === 'design')!;
  assert.ok(designPolicy.tools.includes('validate-game-design'));
  assert.match(designPolicy.rules!.join('\n'), /con\/prn\/aux\/nul\/com1\.\.9\/lpt1\.\.9/);
  assert.match(host.taskPolicies.find(policy => policy.role === 'art')!.rules!.join('\n'), /layer IDs/);
  const tasks = f.prepare(host); host.validateTasks!(tasks);
  const results = await host.withPreparation(() => executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement,
    tasks: tasks.slice(0, 1), sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, diagnoseFailure: host.diagnoseFailure,
    recovery: { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture }, authorProtocolCorrections: 1, reviewProtocolCorrections: 1 }));
  if (actionError) throw actionError;
  assert.equal(checked, true); assert.equal(results[0].state, 'passed'); assert.equal(results[0].attempts.length, 1);
  assert.equal(f.configs.filter(config => JSON.parse(config.context).role === 'design').length, 1);
  assert.ok(f.configs.filter(config => JSON.parse(config.context).role === 'reviewer').every(config => !config.tools.some((tool: any) => tool.name === 'validate-game-design')));
  assert.equal(f.calls.some(call => ['art', 'coding', 'build', 'play'].includes(call.kind)), false);
  const saved = JSON.parse(await readFile(join(f.root, 'host-transfer-prepared-inputs.json'), 'utf8'));
  const raw = await readFile(join(f.root, 'host-transfer-design-validation', results[0].taskId, results[0].attempts[0].attemptId, 'check-1-raw.json'));
  assert.equal(saved.frozen.designSha256, hash(raw));
});

/** No prompt/provider dispatch; only the real host/factory tools on a temporary running task. */
async function operatorAuthor(t: test.TestContext) {
  const f = await validationBrowserFixture(t); let scopeRequirement = f.requirement;
  const host = await f.create({ validation: { ...f.validation, readScope: async (signal: AbortSignal) => ({ ...await f.validation.readScope(signal), requirement: scopeRequirement }) } });
  const tasks = f.prepare(host); host.validateTasks!(tasks);
  await f.controller.registerTasks(tasks.map(item => item.task)); await host.preAuthor!(tasks[0].task, f.controller.signal);
  const task = structuredClone(tasks[0].task); task.state = 'ready'; await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  task.state = 'running'; task.attempts = [{ attemptId: 'self-check-attempt', sessionRef: join(f.root, 'sessions/self-check-attempt'),
    startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  const roleInput = { controller: f.controller, requirement: f.requirement, role: 'design' as const, task, workspace: tasks[0].workspace,
    stateDirectory: join(f.root, 'sessions/self-check-attempt/author') };
  const session = await host.roleFactory(roleInput); t.after(() => session.close());
  const config = f.configs.at(-1)!, tool = config.tools.find(tool => tool.name === 'validate-game-design')!; assert.ok(tool);
  const file = join(config.workspace, path);
  await writeFile(file, JSON.stringify({ ...illegal(), acceptanceMapping: { observe: '观测' }, characters: [{ id: 'box', purpose: '箱子', states: ['idle'] }] }), 'utf8');
  const call = async (args: any = {}) => JSON.parse((await (tool.execute as any)('self-check', args, undefined, undefined, undefined)).content[0].text);
  return { ...f, host, tasks, task, roleInput, config, tool, file, call, setScope: (value: typeof f.requirement) => { scopeRequirement = value; } };
}

test('COS46 operator self-check is read-only, absent from other roles, and bound to its original task/workspace', async t => {
  const f = await operatorAuthor(t), before = await f.controller.read(), files = await snapshot(f.root);
  assert.deepEqual(await f.call(), { passed: true, errors: [] });
  await assert.rejects(f.call({ path: 'other.json' }), /no arguments/);
  await assert.rejects(f.host.roleFactory({ ...f.roleInput, role: 'art' }), /role|grant|assigned/i);
  await assert.rejects(f.host.roleFactory({ ...f.roleInput, task: { ...f.task, taskId: f.declaration.grants.art.taskId } }), /binding|original|recorded|grant/i);
  await assert.rejects(f.host.roleFactory({ ...f.roleInput, workspace: f.root }), /workspace|binding/i);
  const reviewWorkspace = join(f.root, 'reviews', f.task.taskId); await mkdir(reviewWorkspace, { recursive: true });
  const reviewer = await f.host.roleFactory({ ...f.roleInput, role: 'reviewer', workspace: reviewWorkspace, stateDirectory: join(f.root, 'sessions/self-check-attempt/review') });
  await reviewer.close(); assert.ok(!f.configs.at(-1)!.tools.some(tool => tool.name === 'validate-game-design'));
  assert.deepEqual(await f.controller.read(), before);
  assert.deepEqual(await snapshot(f.root), files, 'The empty review directory does not add files and the checks write nothing.');
  assert.equal(f.calls.length, 0);
});

test('COS46 generic check revalidates fixed source and window on each call', async t => {
  const f = await operatorAuthor(t), before = await f.controller.read();
  assert.equal((await f.call()).passed, true);
  const source = join(f.root, f.requirement.sources[0].location), bytes = await readFile(source);
  await writeFile(source, Buffer.concat([bytes, Buffer.from(' ')])); await assert.rejects(f.call(), /frozen|input|source/i); await writeFile(source, bytes);
  const changed = structuredClone(f.requirement); changed.validation.windowId = 'wrong-window'; f.setScope(changed);
  await assert.rejects(f.call(), /fixed|scope|source|case|window/i); f.setScope(f.requirement);
  assert.equal((await f.call()).passed, true);
  f.changeIdentity(); await assert.rejects(f.call(), /identity|source|reviewed|scope/i);
  assert.deepEqual(await f.controller.read(), before); assert.equal(f.calls.length, 0);
});

for (const boundary of ['stop', 'deadline'] as const) test(`COS46 self-check refuses the original ${boundary} boundary`, async t => {
  const f = await operatorAuthor(t); assert.equal((await f.call()).passed, true); const before = await f.controller.read();
  if (boundary === 'stop') await f.controller.stop('Synthetic manual stop'); else f.advance(2_700_001);
  await assert.rejects(f.call());
  const after = await f.controller.read(); assert.equal(after.validation!.cases[0].stopReason!.code, boundary === 'stop' ? 'manual' : 'deadline');
  assert.deepEqual(after.ledger, before.ledger); assert.equal(f.calls.length, 0);
});

test('COS46 a previous pass does not replace capture validation of changed actual bytes', async t => {
  const f = await operatorAuthor(t); assert.equal((await f.call()).passed, true);
  const value = JSON.parse(await readFile(f.file, 'utf8')); value.characters[0].states[0] = 'onTarget'; await writeFile(f.file, JSON.stringify(value), 'utf8');
  assert.equal((await f.call()).passed, false);
  await assert.rejects(f.host.capture(f.task, { summary: 'Self-check passed earlier', remaining: [], uncertainty: [] }, f.controller.signal), /unresolved failures/i);
  const diagnostic = JSON.parse(await readFile(join(f.root, 'failure-sources', f.task.taskId, f.task.attempts[0].attemptId, 'manifest.json'), 'utf8'));
  assert.equal(diagnostic.diagnosis.kind, 'invalid_schema'); assert.match(diagnostic.diagnosis.message, /fixed schema|design roster/i);
  assert.equal((await f.controller.read()).tasks[0].artifacts.length, 0); assert.equal(f.calls.length, 0);
});
