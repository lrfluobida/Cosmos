import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions } from '../../src/roles/factory.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { authorBudgetFixture, options } from './author-output-budget.fixture.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { validationRoutingFixture } from '../runtime/validation-routing.fixture.ts';

test('COS146 revision display selector is trusted, snapshotted, and limited to ordinary design authors', async t => {
  const f = await authorBudgetFixture(t);
  await mkdir(join(f.root, 'requirements')); await writeFile(join(f.root, 'requirements/v1.json'), '{ "value": 1 }', 'utf8');
  for (const selector of [true, false, null, 'revision']) assert.throws(() => createRoleFactory({ ...options, ordinaryDesignRevisionJsonReads: selector } as unknown as RoleFactoryOptions), /trusted selector/);
  let calls = 0;
  const mutable: RoleFactoryOptions = { ...options, sessionFactory: f.sessionFactory, ordinarySuppliedDesign: async () => assert.fail('Unexpected supplied design handoff'), ordinaryDesignRevisionJsonReads: async task => {
    calls++; assert.ok(Object.isFrozen(task)); assert.ok(Object.isFrozen(task.acceptanceIds)); assert.notEqual(task, f.input.task); return true;
  } };
  const factory = createRoleFactory(mutable); mutable.ordinaryDesignRevisionJsonReads = async () => false;
  for (const [role, purpose] of [['design', undefined], ['design', 'planning'], ['reviewer', undefined], ['art', undefined], ['coding', undefined], ['cosmos', undefined]] as const) {
    const session = await factory({ ...f.input, role, purpose }); await session.close();
    const config = f.configs.at(-1)!, read = config.tools!.find(tool => tool.name === 'read')!;
    assert.ok(!Object.hasOwn((read.parameters as { properties: object }).properties, 'planOffset'));
    if (role === 'design' && !purpose) assert.match(read.description, /^For JSON revision,/);
    else assert.doesNotMatch(read.description, /^For JSON (review|revision),/);
    const result = await read.execute('selection', { path: 'requirements/v1.json' }, undefined, undefined, undefined as never);
    assert.equal(result.content[0].type === 'text' && result.content[0].text, role === 'design' && !purpose ? '{"value":1}' : '{ "value": 1 }');
    assert.equal(config.maxOutputTokens, role === 'design' && !purpose ? 32768 : 8192);
    assert.equal(config.maxRequests, 32);
  }
  assert.equal(calls, 1);
  for (const ordinaryDesignRevisionJsonReads of [undefined, async () => false]) {
    await f.create({ ordinaryDesignRevisionJsonReads });
    assert.doesNotMatch(f.configs.at(-1)!.tools!.find(tool => tool.name === 'read')!.description, /compact display/);
    assert.doesNotMatch(f.configs.at(-1)!.tools!.find(tool => tool.name === 'read')!.description, /^For JSON (review|revision),/);
  }
  for (const selector of [async () => undefined, async () => 'true', async () => { throw new Error('unbound revision'); }]) {
    const count = f.configs.length;
    await assert.rejects(f.create({ ordinaryDesignRevisionJsonReads: selector } as unknown as Partial<RoleFactoryOptions>));
    assert.equal(f.configs.length, count, 'Invalid revision selection cannot create a session or publish guidance.');
  }
  assert.deepEqual((await f.controller.read()).ledger.entries, []);
});

test('fixed validation design and art authors retain the original timeout and read tools', async t => {
  const f = await validationRoutingFixture(t);
  const planned = await planTaskDag({ ...f.planning, roles: { ...f.roles, design: { ...f.roles.design, tools: ['read'] }, art: { ...f.roles.art, tools: ['read'] } } } as any);
  await f.controller.registerTasks(planned.tasks.map(item => item.task));
  let calls = 0;
  const factory = createRoleFactory({ ...options, ordinaryDesignRevisionJsonReads: async () => { calls++; return true; },
    designAuthorRequestTimeoutMs: 600000, artAuthorRequestTimeoutMs: 600000, ordinaryArtDesignInput: () => assert.fail('Unexpected validation art selection'),
    sessionFactory: async config => {
      const read = config.tools!.find(tool => tool.name === 'read')!;
      assert.doesNotMatch(read.description, /^For JSON (review|revision),|compact display/);
      assert.ok(!Object.hasOwn((read.parameters as { properties: object }).properties, 'planOffset'));
      assert.equal(config.requestTimeoutMs, 120000);
      return { prompt: async () => ({ text: '' }), close: async () => {} };
    } });
  for (const role of ['design', 'art'] as const) {
    const item = planned.tasks.find(item => item.role === role)!;
    const session = await factory({ controller: f.controller, validation: f.binding, requirement: f.requirement, role, task: item.task,
      workspace: item.workspace, stateDirectory: join(f.planning.sessionRoot, 'validation-' + role) });
    await session.close();
  }
  assert.equal(calls, 0);
});

for (const role of ['design', 'reviewer'] as const) test('COS146 native factory ' + role + ' receives complete compact JSON within the original display limit', async t => {
  const f = await authorBudgetFixture(t), path = 'requirements/v1.json';
  await mkdir(join(f.root, 'requirements'));
  const source = ' '.repeat(30000) + '{ "中文": "保留 空格", "n": 9007199254740993, "n": -0, "e": 1.20e+03 }' + ' '.repeat(30000);
  const expected = '{"中文":"保留 空格","n":9007199254740993,"n":-0,"e":1.20e+03}';
  await writeFile(join(f.root, path), source, 'utf8');
  const requests: any[] = [];
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text());
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com'); requests.push(body);
    assert.ok(requests.length <= 2, 'Only one read and one final response are needed.');
    const first = requests.length === 1;
    if (!first) assert.equal(body.messages.find((message: any) => message.role === 'tool').content, expected);
    const delta = first ? { tool_calls: [{ index: 0, id: 'complete-json', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path }) } }] } : { content: 'Complete JSON received.' };
    const chunk = { id: 'offline-json', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: first ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const session = await f.create({ ordinaryDesignRevisionJsonReads: async () => true, ordinaryDesignReviewBudget: () => true,
    sessionFactory: config => createPiSession(config) }, { ...f.input, role });
  assert.equal((await session.prompt('Read the complete JSON.')).text, 'Complete JSON received.');
  assert.equal(requests.length, 2);
  assert.match(requests[0].tools.find((tool: any) => tool.function.name === 'read').function.description, /compact display.*exact-text/);
  assert.equal(await readFile(join(f.root, path), 'utf8'), source);
});

for (const role of ['reviewer', 'art'] as const) test(`native ${role} follows compact plan continuation with strict-schema nullable arguments`, async t => {
  const f = await authorBudgetFixture(t), task = f.input.task;
  task.outputs[0].schema = 'game-design/2';
  const design = { artifactId: 'design', version: 'v2', location: 'registry/captures/design/v2/files' };
  if (role === 'art') task.inputs.push(design);
  const folder = (role === 'art' ? design : task.artifacts[0]).location + '/_cosmos', path = folder + '/acceptance-plan.json';
  const source = await readFile(new URL('../../docs/benchmark/cabin-hunt/acceptance-plan.json', import.meta.url));
  await mkdir(join(f.root, folder), { recursive: true }); await writeFile(join(f.root, path), source);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text());
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    assert.ok(++calls <= 3);
    const schema = body.tools.find((tool: any) => tool.function.name === 'read').function.parameters;
    assert.ok(schema.properties.planOffset);
    const pages = body.messages.filter((message: any) => message.role === 'tool').map((message: any) => message.content);
    const notice = /\n\n\[[^\n]*Use planOffset=(\d+) to continue\.\]$/;
    const next = !pages.length ? null : Number(notice.exec(pages[0])![1]);
    if (pages.length === 2) {
      const restored = JSON.parse(pages[0].replace(notice, '') + '\n' + pages[1]);
      assert.deepEqual(restored, JSON.parse(source.toString('utf8')));
      assert.deepEqual([restored.scenario.steps.length, restored.scenario.reopen.steps.length], [200, 198]);
    }
    const delta = pages.length === 2 ? { content: 'Both pages received.' } : { tool_calls: [{ index: 0, id: 'page-' + calls, type: 'function',
      function: { name: 'read', arguments: JSON.stringify({ path, offset: null, limit: null, planOffset: next }) } }] };
    const chunk = { id: 'offline-plan', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: pages.length === 2 ? 'stop' : 'tool_calls' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const session = await f.create({ ordinaryDesignReviewBudget: () => true, ordinaryArtDesignInput: () => design,
    sessionFactory: config => createPiSession(config) }, { ...f.input, role });
  assert.equal((await session.prompt('Read the complete plan.')).text, 'Both pages received.');
  assert.equal(calls, 3);
});
