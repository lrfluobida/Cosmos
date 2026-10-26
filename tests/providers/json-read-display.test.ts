import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { AgentToolResult, ReadToolDetails, ReadToolInput } from '@earendil-works/pi-coding-agent';
import { createWorkspaceTools } from '../../src/providers/workspace-tools.ts';
import { compactCompleteJsonRead } from '../../src/providers/json-read-display.ts';

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos127-read-'));
  t.after(async () => { assert.ok(root.startsWith(join(tmpdir(), 'cos127-read-'))); await rm(root, { recursive: true, force: true }); });
  const options = { workspace: root, readPaths: ['input.json'], writePaths: [] };
  const [original] = await createWorkspaceTools(options);
  const [compact] = await createWorkspaceTools({ ...options, compactFullJsonReads: true });
  const read = (tool: typeof original, args: Partial<ReadToolInput> = {}, signal?: AbortSignal) => tool.execute('read', { path: 'input.json', ...args }, signal, undefined, undefined as never);
  return { root, original, compact, read };
}

for (const [text, expected] of [
  [' \r\n{ "z": 9007199254740993, "a": 1.20e+03, "z": -0, "中": "中文 空格\\t\\n\\u4e2d\\\"\\\\" }\t', '{"z":9007199254740993,"a":1.20e+03,"z":-0,"中":"中文 空格\\t\\n\\u4e2d\\\"\\\\"}'],
  [' [ 1, { "two" : [true, null] } ]\n', '[1,{"two":[true,null]}]'],
  [' \n "中文\\\" \\\\" \t', '"中文\\\" \\\\"'],
  [' \t -0.1200e-02\r\n', '-0.1200e-02'], [' \n true \t', 'true'], ['\r null\n', 'null'],
] as const) test('COS127 JSON complete SDK read preserves lexical data: ' + expected.slice(0, 30), async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'input.json'), text, 'utf8');
  const before = await readFile(join(f.root, 'input.json')), original = await f.read(f.original);
  assert.equal(original.content[0].type === 'text' && original.content[0].text, text);
  for (const args of [{}, { offset: 1 }, { limit: 100 }]) {
    const result = await f.read(f.compact, args);
    assert.deepEqual(result, { ...original, content: [{ ...original.content[0], text: expected }] });
  }
  assert.deepEqual(await readFile(join(f.root, 'input.json')), before);
});

for (const [name, text, args] of [
  ['later offset containing valid JSON', 'ignored\n { "valid" : true } ', { offset: 2 }],
  ['user limit with remaining note', ' { "valid" : true }\nsecond line', { limit: 1 }],
  ['default line truncation', '[\n' + ' 1,\n'.repeat(2100) + ' 2\n]', {}],
  ['default byte truncation', '[\n' + (' "' + 'x'.repeat(2000) + '",\n').repeat(30) + ' "end"\n]', {}],
  ['first line too large', '{ "big": "' + 'x'.repeat(60000) + '" }', {}],
  ['non JSON', 'read me 中文', {}], ['invalid JSON', '{ "x": 1, }', {}],
] as const) test('COS127 JSON SDK fallback retains ' + name, async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'input.json'), text, 'utf8');
  const original = await f.read(f.original, args), compact = await f.read(f.compact, args);
  assert.deepEqual(compact, original);
  if (name === 'user limit with remaining note') { assert.equal(original.details, undefined); assert.match(JSON.stringify(original.content), /more lines in file/); }
});

test('COS127 JSON display option retains original path and cancellation guards', async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'outside.json'), '{ "secret" : true }', 'utf8');
  await assert.rejects(f.read(f.compact, { path: 'outside.json' }), /outside allowed/);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(f.read(f.compact, {}, cancelled.signal), { name: 'AbortError' });
});

test('COS127 JSON helper preserves details, result flags, text metadata and original objects on fallback', () => {
  const result = { content: [{ type: 'text' as const, text: '{ "a": 1 }', annotation: 'retain' }], details: {}, extra: 'retain', isError: false };
  const compact = compactCompleteJsonRead(result, { path: 'input.json' });
  assert.deepEqual(compact, { ...result, content: [{ ...result.content[0], text: '{"a":1}' }] });
  assert.equal(compact.details, result.details); assert.equal(result.content[0].text, '{ "a": 1 }');
  for (const args of [{ offset: 0 }, { offset: 2 }, { offset: NaN }, { offset: 1.5 }, { limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: Infinity }, { limit: NaN },
    { limit: Number.MAX_SAFE_INTEGER + 1 }, { offset: null }, { offset: '1' }, { limit: null }, { limit: '1' }]) {
    assert.equal(compactCompleteJsonRead(result, { path: 'input.json', ...args } as ReadToolInput), result);
  }
  const uncertain = [
    { ...result, isError: true }, { ...result, details: { truncation: {} } },
    { ...result, content: [] }, { ...result, content: [...result.content, { type: 'text', text: '{}' }] },
    { ...result, content: [{ type: 'image', data: 'synthetic', mimeType: 'image/png' }] },
    { ...result, content: [...result.content, { type: 'image', data: 'synthetic', mimeType: 'image/png' }] },
    ...['{"a":1}', '{ "a": 1 } trailing', '{}\n{}', '\u00a0{ "a": 1 }', '{ "a": 1 }\n\n[1 more lines in file. Use offset=2 to continue.]',
      '{ "a": 1 }\n\n[Showing lines 1-2 of 3. Use offset=3 to continue.]', '[Line 1 is 60KB, exceeds 50KB limit. Use bash: ...]']
      .map(text => ({ ...result, content: [{ type: 'text', text }] })),
  ];
  for (const value of uncertain) assert.equal(compactCompleteJsonRead(value as AgentToolResult<ReadToolDetails | undefined>, { path: 'input.json' }), value);
});
