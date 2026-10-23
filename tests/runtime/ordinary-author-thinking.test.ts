import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { createPiSession } from '../../src/providers/pi.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { readConfirmedGeneration } from '../../src/cli/session.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

for (const [label, gameplayIds, experienceIds] of [
  ['escaped IDs', ['light', '柜"门\\开'], ['readable', '视"感\\亮']],
  ['literal labels', ['gameplayId', '__proto__'], ['criterionId']],
  ['empty experience', ['toggle'], []],
  ['legacy', ['light'], undefined],
] as const) test(`COS121 host mapping example parses with complete actual ${label}`, async t => {
  const f = await ordinaryHostFixture(t);
  const original = f.draft.acceptance.find(item => item.acceptanceId === 'light')!;
  f.draft.acceptance = [...f.draft.acceptance.filter(item => item.acceptanceId !== 'light'), ...gameplayIds.map(acceptanceId => ({ ...original, acceptanceId }))];
  if (experienceIds) f.draft.experienceCriteria = experienceIds.map(criterionId => ({ ...f.draft.experienceCriteria[0], criterionId }));
  else {
    const legacy = f.draft as any; delete legacy.ordinaryProfile; delete legacy.experienceCriteria; legacy.scenario = f.scenario;
    f.host.ordinaryProfile = undefined;
  }
  let inspected = false;
  f.host.execute = async input => {
    const controller = await RunController.open({ root: f.root });
    try {
      const host = await createBrowserHost({ ...input, controller, work: new OwnedWork(controller.signal), ...f.hostOptions });
      const policy = host.taskPolicies.find(item => item.role === 'design')!, rules = policy.rules!.join('\n');
      const example = rules.match(/^Mapping JSON example \(replace all placeholder descriptions\): (.+)$/m);
      assert.ok(example, 'The real design policy must provide a separately parseable JSON mapping example.');
      const value = JSON.parse(example[1]);
      assert.deepEqual(Object.keys(value), ['acceptanceMapping', ...(experienceIds ? ['experienceMapping'] : [])]);
      assert.deepEqual(Object.keys(value.acceptanceMapping).sort(), [...gameplayIds].sort());
      if (experienceIds) assert.deepEqual(Object.keys(value.experienceMapping).sort(), [...experienceIds].sort());
      for (const mapping of Object.values(value) as Record<string, unknown>[]) {
        for (const description of Object.values(mapping)) { assert.equal(typeof description, 'string'); assert.match(description as string, /REPLACE/); }
      }
      assert.match(rules, /JSON objects.*actual.*IDs.*non-empty string/);
      assert.match(rules, /not arrays or nested objects/); assert.match(rules, /placeholders.*not completed design or acceptance evidence/);
      assert.doesNotMatch(rules, /acceptanceMapping:\{gameplayId:string\}|experienceMapping:\{criterionId:string\}/);
      assert.deepEqual(policy.tools, ['read', 'write', 'edit', 'validate-game-design']);
      assert.deepEqual(policy.readOnlyPaths, ['requirements', 'registry']);
      assert.deepEqual(policy.writePaths, ['authors/design/design.json', ...(experienceIds ? ['authors/design/acceptance-plan.json'] : [])]);
      inspected = true; return { outcome: 'incomplete', gaps: [] };
    } finally { await controller.close(); }
  };
  await f.execute(); assert.equal(inspected, true); assert.equal(f.packets.length, 0); assert.equal(f.plays.length, 0);
});

test('ordinary design alone disables thinking in native SDK payload while original admission and host gates remain', async t => {
  const f = await ordinaryHostFixture(t), scripted = f.hostOptions.sessionFactory!, payloads: any[] = [], configs: any[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text());
    const state: any = await readRunSnapshot(f.root), config = configs.at(-1), packet = JSON.parse(config.context);
    payloads.push({ role: packet.role, taskId: packet.taskId, body });
    assert.equal(body.model, 'deepseek-flash'); assert.equal(state.requests.at(-1).requestId, state.ledger.entries.at(-1).requestId);
    const entry = state.ledger.entries.at(-1); assert.equal(entry.status, 'reserved'); assert.equal(entry.taskId, packet.taskId);
    assert.ok(entry.reservedMicroCny > body.max_tokens * 8, 'The existing estimator reserves input and the unchanged output cap before dispatch.');
    const design = packet.role === 'design', output = design ? Math.min(body.max_tokens, 9001) : 10;
    const chunk = { id: 'offline-cos113', model: 'deepseek-flash', choices: [{ index: 0, delta: { content: design ? '完整设计内容。'.repeat(5000) : 'Complete' },
      finish_reason: design && body.max_tokens < 9001 ? 'length' : 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: output, total_tokens: 30 + output } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  t.after(() => fetchMock.mock.restore());
  f.hostOptions.sessionFactory = async config => {
    configs.push(config);
    const native = await createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos113' } });
    try { await native.prompt('Exercise the original role request configuration.'); }
    catch (error) { t.diagnostic(`Controlled native response failure: ${(error as Error & { code?: string }).code}: ${(error as Error).message}`); throw error; }
    finally { await native.close(); }
    return scripted(config);
  };
  const result: any = await f.execute();
  t.diagnostic(JSON.stringify(payloads.map(({ role, taskId, body }) => ({ role, taskId, model: body.model, thinking: body.thinking, reasoning_effort: body.reasoning_effort, max_tokens: body.max_tokens }))));
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(payloads.length, 7);
  for (const { role, body } of payloads) {
    assert.deepEqual(body.thinking, { type: role === 'design' ? 'disabled' : 'enabled' });
    assert.equal(body.reasoning_effort, role === 'design' ? undefined : 'low');
    assert.equal(body.max_tokens, role === 'art' || role === 'coding' ? 65536 : role === 'design' ? 32768 : 8192);
  }
  const state: any = await readRunSnapshot(f.root);
  for (const config of configs) {
    const packet = JSON.parse(config.context), task = state.tasks.find((task: any) => task.taskId === packet.taskId);
    assert.equal(config.maxRequests, packet.role === 'design' ? 32 : 16); assert.equal(config.requestTimeoutMs, packet.role === 'coding' ? 600000 : 120000);
    if (packet.role === 'design') assert.match(config.systemPrompt, /at most 32 model requests/);
    else assert.doesNotMatch(config.systemPrompt, /model requests/);
    assert.equal(packet.budget.originalDeadlineAt, state.run.originalDeadlineAt);
    if (task) assert.equal(packet.budget.allocationMicroCny, task.budget.allocationMicroCny);
  }
  assert.equal(state.ledger.limitMicroCny, 200000000); assert.equal(state.ledger.entries.length, 7);
  assert.ok(state.ledger.entries.every((entry: any) => entry.status === 'settled'));
  const design = configs.find(config => JSON.parse(config.context).role === 'design'), rules = JSON.parse(design.context).rules.join('\n');
  assert.match(rules, /First write authors\/design\/design\.json/);
  assert.match(rules, /Then write authors\/design\/acceptance-plan\.json.*bounded.*write\/edit/);
  assert.match(rules, /validate-game-design/);
  assert.ok(f.checks.length > 0 && f.checks.every(value => JSON.parse(value.content[0].text).passed));
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 3);
  assert.ok(f.packets.filter(packet => packet.role === 'reviewer').every(packet => packet.ownership.writePaths.length === 0));
  assert.equal(f.plays.length, 1); assert.deepEqual(f.plays[0].plan.steps.filter((step: any) => !step.id.startsWith('host-media-')), f.scenario.steps);
});

test('COS124 modular ordinary host enables budget selection only for design while capture and independent review remain required', async t => {
  const f = await ordinaryHostFixture(t, { modular: true }), scripted = f.hostOptions.sessionFactory!, configs: any[] = [];
  f.hostOptions.sessionFactory = async config => { configs.push(config); return scripted(config); };
  const result: any = await f.execute(); assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  for (const config of configs) {
    const role = JSON.parse(config.context).role;
    assert.equal(config.maxOutputTokens, role === 'art' || role === 'coding' ? 65536 : role === 'design' ? 32768 : 8192);
    assert.equal(typeof config.requestOutputLimit, role === 'design' ? 'function' : 'undefined');
  }
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 5); assert.ok(f.checks.length); assert.equal(f.plays.length, 1);
});

test('COS124 legacy browser host retains the original author cap without budget selection', async t => {
  const f = await ordinaryHostFixture(t), scripted = f.hostOptions.sessionFactory!, configs: any[] = [], draft = f.draft as any;
  delete draft.ordinaryProfile; delete draft.experienceCriteria; draft.scenario = f.scenario; f.host.ordinaryProfile = undefined;
  f.hostOptions.sessionFactory = async config => { configs.push(config); return scripted(config); };
  await f.execute();
  const design = configs.find(config => JSON.parse(config.context).role === 'design'); assert.ok(design);
  assert.equal(design.maxOutputTokens, 8192); assert.equal(design.requestOutputLimit, undefined);
});

test('ordinary failed insufficient evidence remains closed to redispatch after author configuration changes', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'capability' }), initial: any = await f.execute();
  assert.equal(initial.acceptedCandidate, undefined);
  const before: any = await readRunSnapshot(f.root), design = before.tasks.find((task: any) => task.taskId === 'design-task');
  assert.equal(design.state, 'failed'); assert.equal(design.attempts[0].failure.classification, 'insufficient_evidence');
  const feedback = await readFile(join(design.attempts[0].sessionRef, 'failure.json'));
  const confirmed = await readConfirmedGeneration(f.root, before), count = f.packets.length;
  const resumed: any = await f.host.execute({ root: f.root, ...confirmed, resume: true });
  assert.equal(resumed.acceptedCandidate, undefined); assert.equal(f.packets.length, count);
  const after: any = await readRunSnapshot(f.root);
  assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.ledger, before.ledger);
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.deepEqual(await readFile(join(design.attempts[0].sessionRef, 'failure.json')), feedback);
  assert.equal(after.tasks.some((task: any) => task.taskId.includes('repair')), false);
});
