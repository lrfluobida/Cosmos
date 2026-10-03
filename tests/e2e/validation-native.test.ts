import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validationRunFixture } from './validation-run.fixture.ts';
import { runValidationWithHost } from '../../probes/e2e/validation-run.ts';
import { createValidationScopeReader } from '../../probes/e2e/validation-driver.ts';
import { requestReservation } from '../../probes/e2e/admission.ts';
import * as driver from '../../probes/e2e/validation-driver.ts';
import { offlineNativeFixture } from './validation-native.fixture.ts';
import { runPilotEntry } from '../../probes/e2e/run.ts';

// Tests supply no playable game. Source files and fake responses are explicitly offline fixture data.
test('fixed driver skips human confirmation and retains failed early native-role facts without another task or repair', async t => {
  assert.equal(typeof driver.generateValidationCase, 'function');
  const f = await validationRunFixture(t); let requests = 0;
  const result = await runValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: input => driver.generateValidationCase(input, {
    bootstrap: async () => { const target = join(input.root, 'toolchain'); await cp(join(f.repository, 'templates/2d'), target, { recursive: true }); return target; },
    build: async () => { throw new Error('No code phase expected'); }, media: async () => { throw new Error('No media phase expected'); }, play: async () => { throw new Error('No browser expected'); },
  }, async config => {
    const packet = JSON.parse(config.context);
    return { close: async () => {}, prompt: async () => {
      const request = { requestId: `offline-${++requests}`, modelId: 'deepseek-flash' as const, maxOutputTokens: config.maxOutputTokens, inputBytes: 20, hasImages: false };
      await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: requestReservation(request) });
      await config.budget.afterResponse({ requestId: request.requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: ['design', 'art', 'coding'].map(role => ({ taskId: `${input.window.caseId}-${role}`, role, objective: 'Offline fixture only',
        acceptanceIds: role === 'design' ? ['PILOT-DESIGN'] : role === 'art' ? ['PILOT-MEDIA'] : input.window.quote.requirements.acceptanceIds,
        dependsOn: role === 'art' ? [`${input.window.caseId}-design`] : role === 'coding' ? [`${input.window.caseId}-design`, `${input.window.caseId}-art`] : [] })) }) };
      assert.equal(packet.role, 'design');
      assert.match(packet.rules.join('\n'), /validationCase|historical/i);
      return { text: JSON.stringify({ summary: 'Offline incomplete fixture, generatedByCosmos:false', remaining: ['No design output authored in this test'], uncertainty: [] }) };
    } };
  }) } });
  assert.equal(result.outcome, 'failed'); assert.equal(requests, 2);
  const snapshot = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.validation.cases.at(-1).repair, null); assert.equal(snapshot.run.humanDecisions.length, 0);
  assert.equal(snapshot.requests.filter((request: any) => request.validation).length, 2);
  assert.ok(snapshot.tasks.find((task: any) => task.taskId.endsWith('-design')).state !== 'passed');
  assert.equal(snapshot.tasks.find((task: any) => task.taskId.endsWith('-coding')).attempts.length, 0);
  await assert.rejects(readFile(join(f.caseRoot, 'confirmed-requirement.json')), { code: 'ENOENT' });
  const requirement = JSON.parse(await readFile(join(f.caseRoot, 'validation-requirement.json'), 'utf8'));
  assert.equal(requirement.formatVersion, 'validation-requirement-1'); assert.equal(Object.hasOwn(requirement, 'confirmedBy'), false);
});

test('production flag routing exposes only readonly preflight or the fixed native declaration and rejects fixture knobs', async t => {
  const f = await validationRunFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  const result = await runPilotEntry(['--validation-preflight', f.head], f.repository); assert.equal(result.outcome, 'ready');
  await assert.rejects(runPilotEntry([...f.args, '--fixture'], f.repository), /Usage/);
  await assert.rejects(runPilotEntry([...f.args, '--root', f.caseRoot], f.repository), /Usage/);
  await assert.rejects(runPilotEntry([...f.args, '--host-evidenced-coding-handoff', '0'], f.repository), /Usage/);
  await assert.rejects(runPilotEntry(['--validation-case', f.head], f.repository), /Usage/);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
});

test('fixed native assembly authenticates post-build failure including dist and performs only one fresh coding repair', async t => {
  const f = await validationRunFixture(t); let fixture: ReturnType<typeof offlineNativeFixture> | undefined, failure: unknown;
  const result = await runValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    fixture = offlineNativeFixture(input);
    try { return await driver.generateValidationCase(input, fixture.io, fixture.sessionFactory); } catch (error) { failure = error; throw error; }
  } } });
  const state = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8')), source = state.tasks.find((task: any) => task.taskId.endsWith('-coding')), repair = state.tasks.find((task: any) => task.taskId.endsWith('-repair'));
  assert.equal(failure, undefined); assert.equal(result.outcome, 'passed', JSON.stringify({ gaps: 'gaps' in result ? result.gaps : [], tasks: state.tasks.map((task: any) => ({ taskId: task.taskId, state: task.state, reason: task.stateReason, failure: task.attempts[0]?.failure?.classification })) }));
  assert.equal(source.state, 'failed'); assert.equal(repair.state, 'passed'); assert.equal(repair.attempts.length, 1); assert.equal(state.validation.cases.at(-1).repair.taskId, repair.taskId);
  assert.equal(fixture!.calls.filter(call => call.role === 'coding').length, 2); assert.equal(fixture!.calls.length, 9);
  assert.ok(fixture!.calls.filter(call => ['coding', 'art'].includes(call.role)).every(call => call.cap === 65536));
  assert.equal(await readFile(join(f.caseRoot, 'authors/coding/src/main.ts'), 'utf8'), 'export const fixture = 1; // generatedByCosmos:false\n');
  assert.equal(await readFile(join(f.caseRoot, 'repair-workspace/authors/coding/src/main.ts'), 'utf8'), 'export const fixture = 2; // generatedByCosmos:false\n');
  assert.equal(source.artifacts[0].version, 'v1'); assert.equal(repair.artifacts[0].version, 'v2');
  const signature = JSON.parse(await readFile(join(f.caseRoot, `journal/task-${source.taskId}/failure-snapshot.json`), 'utf8'));
  assert.ok(signature.value.signature.some((entry: any) => entry.files.some((file: any) => file.path === 'dist/index.html')));
  assert.deepEqual(state.run.humanDecisions, []); assert.equal(state.run.originalDeadlineAt, '2026-10-01T18:16:16.857Z');
});
