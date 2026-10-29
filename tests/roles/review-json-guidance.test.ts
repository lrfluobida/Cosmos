import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createReadTool } from '@earendil-works/pi-coding-agent';
import { createPiSession, createWorkspaceTools } from '../../src/providers/pi.ts';
import { authorBudgetFixture } from './author-output-budget.fixture.ts';

const enabled = { ordinaryDesignReviewBudget: () => true };
const guidance = /^For JSON review, first request the complete file without numeric offset\/limit:/;

test('COS149 selected reviewer gets bounded complete JSON guidance without changing the read contract', async t => {
  const f = await authorBudgetFixture(t);
  await f.create(enabled, { ...f.input, role: 'reviewer' });
  const selected = f.configs[0].tools!.find(tool => tool.name === 'read')!;
  const original = (await createWorkspaceTools({ workspace: f.root, readPaths: f.input.task.inputs.map(ref => ref.location), writePaths: [], compactFullJsonReads: true }))[0];
  assert.match(selected.description, guidance);
  assert.ok(selected.description.endsWith(original.description), 'Keep the SDK and exact-text editing instructions.');
  const prefix = selected.description.slice(0, -original.description.length);
  assert.ok(Buffer.byteLength(prefix, 'utf8') <= 512);
  assert.match(prefix, /omit offset and limit when optional; if the tool schema requires them, set both to null/);
  assert.match(prefix, /Do not fill in numeric defaults/);
  assert.match(prefix, /truncation or remaining lines.*paging instructions until complete/);
  assert.match(prefix, /never treat a partial result as the full file/);
  assert.match(prefix, /non-JSON files and targeted raw-source reads/);
  assert.equal(selected.parameters, original.parameters);
  assert.equal(selected.executionMode, original.executionMode);
  assert.deepEqual(selected.constrainedSampling, original.constrainedSampling);
  assert.equal(selected.prepareArguments, original.prepareArguments);
  assert.doesNotMatch(original.description, guidance, 'Do not mutate shared SDK metadata.');
  assert.deepEqual(f.configs[0].tools!.map(tool => tool.name), ['read']);
  assert.equal(f.configs[0].maxOutputTokens, 8192);
  assert.equal(f.configs[0].thinkingLevel, 'low');
});

test('COS149 guidance stays out of unselected reviewers, authors, revisions and planning', async t => {
  const f = await authorBudgetFixture(t);
  for (const ordinaryDesignReviewBudget of [undefined, () => false]) {
    await f.create({ ordinaryDesignReviewBudget }, { ...f.input, role: 'reviewer' });
    assert.doesNotMatch(f.configs.at(-1)!.tools!.find(tool => tool.name === 'read')!.description, guidance);
  }
  for (const [role, purpose] of [['design', undefined], ['art', undefined], ['coding', undefined], ['cosmos', undefined],
    ['cosmos', 'planning'], ['reviewer', 'planning']] as const) {
    await f.create(enabled, { ...f.input, role, purpose });
    assert.doesNotMatch(f.configs.at(-1)!.tools!.find(tool => tool.name === 'read')!.description, guidance);
  }
  await f.create({ ...enabled, ordinaryDesignRevisionJsonReads: async () => true });
  const revision = f.configs.at(-1)!.tools!.find(tool => tool.name === 'read')!;
  assert.doesNotMatch(revision.description, guidance);
  assert.match(revision.description, /compact display.*exact-text/);
  assert.deepEqual((await f.controller.read()).ledger.entries, []);
});

for (const windowed of [false, true]) test(`COS149 native SYNTHETIC ${windowed ? 'explicit window remains raw' : 'schema-required nulls return complete JSON'}`, async t => {
  const f = await authorBudgetFixture(t), path = 'requirements/v1.json';
  await mkdir(join(f.root, 'requirements'));
  const items = Array.from({ length: 450 }, (_, index) => index);
  const source = ' '.repeat(30000) + '{\n "中文": "保留 空格", "n": 9007199254740993, "n": -0, "e": 1.20e+03,\n "items": [\n'
    + items.join(',\n') + '\n ]\n}' + ' '.repeat(30000);
  const compact = '{"中文":"保留 空格","n":9007199254740993,"n":-0,"e":1.20e+03,"items":[' + items.join(',') + ']}';
  await writeFile(join(f.root, path), source, 'utf8');
  const args = windowed ? { path, offset: 1, limit: 400 } : { path, offset: null, limit: null };
  const raw = await createReadTool(f.root).execute('raw-control', { path, offset: 1, limit: 400 });
  const expected = windowed ? raw.content[0].type === 'text' && raw.content[0].text : compact;
  let requests = 0, wireGuidanceBytes = 0, payloadFailure: unknown;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    try {
      const request = input instanceof Request ? input : new Request(input, init);
      assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
      const body = JSON.parse(await request.text());
      assert.ok(++requests <= 2, 'Only one synthetic read choice and one acknowledgement.');
      const read = body.tools.find((tool: any) => tool.function.name === 'read').function;
      assert.match(read.description, guidance);
      assert.equal(read.strict, true);
      assert.deepEqual(read.parameters.required, ['path', 'offset', 'limit']);
      assert.deepEqual(read.parameters.properties.path, createReadTool(f.root).parameters.properties.path);
      for (const name of ['offset', 'limit'] as const) assert.deepEqual(read.parameters.properties[name].anyOf,
        [createReadTool(f.root).parameters.properties[name], { type: 'null' }]);
      const withoutGuidance = structuredClone(body);
      const oldDescription = withoutGuidance.tools.find((tool: any) => tool.function.name === 'read').function;
      oldDescription.description = oldDescription.description.slice(oldDescription.description.indexOf('\n\n') + 2);
      wireGuidanceBytes = Buffer.byteLength(JSON.stringify(body)) - Buffer.byteLength(JSON.stringify(withoutGuidance));
      assert.ok(wireGuidanceBytes > 0 && wireGuidanceBytes <= 520);
      if (requests === 2) {
        assert.equal(body.messages.find((message: any) => message.role === 'tool').content, expected);
        const call = body.messages.find((message: any) => message.tool_calls)?.tool_calls[0];
        assert.deepEqual(JSON.parse(call.function.arguments), args, 'The native harness must preserve the synthetic model choice.');
      }
      const first = requests === 1;
      const delta = first ? { tool_calls: [{ index: 0, id: 'synthetic-read-choice', type: 'function', function: { name: 'read', arguments: JSON.stringify(args) } }] }
        : { content: 'Synthetic read result received; no semantic review performed.' };
      const chunk = { id: 'offline-cos149', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: first ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    } catch (error) { payloadFailure = error; throw error; }
  });
  const session = await f.create({ ...enabled, sessionFactory: config => createPiSession(config) }, { ...f.input, role: 'reviewer' });
  const result = await session.prompt('Exercise one synthetic read choice.').catch(error => { throw payloadFailure ?? error; });
  assert.equal(result.text, 'Synthetic read result received; no semantic review performed.');
  assert.equal(requests, 2);
  assert.equal(await readFile(join(f.root, path), 'utf8'), source);
  t.diagnostic(`Added guidance serialized bytes: ${wireGuidanceBytes}; choice: ${JSON.stringify(args)}.`);
});
