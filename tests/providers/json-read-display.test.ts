import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { ReadToolInput } from '@earendil-works/pi-coding-agent';
import { createWorkspaceTools } from '../../src/providers/workspace-tools.ts';
import { compactJsonReadBuffer } from '../../src/providers/json-read-display.ts';

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
  for (const args of [{}]) {
    const result = await f.read(f.compact, args);
    assert.deepEqual(result, { ...original, content: [{ ...original.content[0], text: expected }] });
  }
  for (const args of [{ offset: 1 }, { limit: 100 }]) assert.deepEqual(await f.read(f.compact, args), await f.read(f.original, args));
  assert.deepEqual(await readFile(join(f.root, 'input.json')), before);
});

for (const [name, text, args] of [
  ['later offset containing valid JSON', 'ignored\n { "valid" : true } ', { offset: 2 }],
  ['user limit with remaining note', ' { "valid" : true }\nsecond line', { limit: 1 }],
  ['default byte truncation', '[\n' + (' "' + 'x'.repeat(2000) + '",\n').repeat(30) + ' "end"\n]', {}],
  ['first line too large', '{ "big": "' + 'x'.repeat(60000) + '" }', {}],
  ['non JSON', 'read me 中文', {}], ['invalid JSON', '{ "x": 1, }', {}],
] as const) test('COS127 JSON SDK fallback retains ' + name, async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'input.json'), text, 'utf8');
  const original = await f.read(f.original, args), compact = await f.read(f.compact, args);
  assert.deepEqual(compact, original);
  if (name === 'user limit with remaining note') { assert.equal(original.details, undefined); assert.match(JSON.stringify(original.content), /more lines in file/); }
});

for (const [name, text, expected] of [
  ['byte limit', ' '.repeat(30000) + '{ "中文": "保留 空格", "n": 9007199254740993, "n": -0, "e": 1.20e+03 }' + ' '.repeat(30000), '{"中文":"保留 空格","n":9007199254740993,"n":-0,"e":1.20e+03}'],
  ['line limit', '[\n' + ' 1,\n'.repeat(2100) + ' 2\n]', '[' + '1,'.repeat(2100) + '2]'],
] as const) test('COS146 complete JSON compacts before SDK ' + name, async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'input.json'), text, 'utf8');
  assert.equal((await f.read(f.original)).details?.truncation?.truncated, true);
  const result = await f.read(f.compact);
  assert.equal(result.details?.truncation?.truncated ?? false, false);
  assert.equal(result.content[0].type === 'text' && result.content[0].text, expected);
  assert.equal(await readFile(join(f.root, 'input.json'), 'utf8'), text);
});

test('COS127 JSON display option retains original path and cancellation guards', async t => {
  const f = await fixture(t); await writeFile(join(f.root, 'outside.json'), '{ "secret" : true }', 'utf8');
  await assert.rejects(f.read(f.compact, { path: 'outside.json' }), /outside allowed/);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(f.read(f.compact, {}, cancelled.signal), { name: 'AbortError' });
});

test('COS146 invalid UTF-8, BOM, non-JSON and still-oversize buffers retain original SDK behavior', async t => {
  const f = await fixture(t);
  for (const value of [Buffer.from('{"a":1}'), Buffer.from('{ "a": 1 } trailing'), Buffer.from('{}\n{}'), Buffer.from('\u00a0{ "a": 1 }'),
    Buffer.from('\ufeff{ "a": 1 }'), Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0x80, 0x22, 0x7d]), Buffer.from('{ "big": "' + 'x'.repeat(51200) + '" }')]) {
    assert.equal(compactJsonReadBuffer(value), value);
    await writeFile(join(f.root, 'input.json'), value);
    assert.deepEqual(await f.read(f.compact), await f.read(f.original));
  }
});

test('COS146 compact byte boundary and raw line boundary retain the SDK limits', async t => {
  const f = await fixture(t);
  for (const size of [51200, 51201]) {
    const expected = '"' + 'x'.repeat(size - 2) + '"', source = '\n  ' + expected + '\n';
    await writeFile(join(f.root, 'input.json'), source, 'utf8');
    const result = await f.read(f.compact);
    if (size === 51200) { assert.equal(result.details, undefined); assert.equal(result.content[0].type === 'text' && result.content[0].text, expected); }
    else assert.deepEqual(result, await f.read(f.original));
  }
  for (const lines of [2000, 2001]) {
    await writeFile(join(f.root, 'input.json'), Array(lines).fill('plain').join('\n'), 'utf8');
    const result = await f.read(f.compact);
    assert.deepEqual(result, await f.read(f.original));
    assert.equal(result.details?.truncation?.truncated ?? false, lines > 2000);
  }
});

test('COS146 compact read retains native image detection', async t => {
  const f = await fixture(t);
  const png = await readFile(new URL('../../probes/2026-10-01-deepseek/vision-fixture-2026-09-30T17-47-57.205Z.png', import.meta.url));
  await writeFile(join(f.root, 'input.json'), png);
  const result = await f.read(f.compact);
  assert.deepEqual(result, await f.read(f.original));
  assert.ok(result.content.some(block => block.type === 'image'));
});

test('COS146 simultaneous whole and explicit raw reads support exact-text edits without changing source display bytes', async t => {
  const f = await fixture(t), source = '{\n  "中文": "保留 空格",\n  "value": 1\n}\n';
  await writeFile(join(f.root, 'input.json'), source, 'utf8');
  const expectedRaw = await f.read(f.original, { offset: 1, limit: 100 });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.read(f.compact, i % 2 ? { offset: 1, limit: 100 } : {})));
  for (const [i, result] of results.entries()) {
    if (i % 2) assert.deepEqual(result, expectedRaw);
    else assert.equal(result.content[0].type === 'text' && result.content[0].text, '{"中文":"保留 空格","value":1}');
  }
  assert.match(f.compact.description, /compact display.*source formatting.*exact-text.*offset\/limit/);
  assert.equal(await readFile(join(f.root, 'input.json'), 'utf8'), source);
  const tools = await createWorkspaceTools({ workspace: f.root, readPaths: ['input.json'], writePaths: ['input.json'], compactFullJsonReads: true });
  const edit = tools.find(tool => tool.name === 'edit')!;
  await edit.execute('exact-edit', { path: 'input.json', edits: [{ oldText: '  "value": 1', newText: '  "value": 2' }] }, undefined, undefined, undefined as never);
  assert.equal(await readFile(join(f.root, 'input.json'), 'utf8'), source.replace('"value": 1', '"value": 2'));
});

test('COS146 whole read rejects escaping paths, symlink scopes, and cancellation during dispatch', async t => {
  const f = await fixture(t);
  await assert.rejects(f.read(f.compact, { path: '../input.json' }), /outside allowed/);
  await mkdir(join(f.root, 'hidden')); await writeFile(join(f.root, 'hidden/input.json'), '{ "hidden": true }', 'utf8');
  await symlink(join(f.root, 'hidden'), join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const [read] = await createWorkspaceTools({ workspace: f.root, readPaths: ['linked'], writePaths: [], compactFullJsonReads: true });
  await assert.rejects(read.execute('link', { path: 'linked/input.json' }, undefined, undefined, undefined as never), /Symlink/);
  await writeFile(join(f.root, 'input.json'), '{ "a": 1 }', 'utf8');
  const cancelled = new AbortController(), pending = f.read(f.compact, {}, cancelled.signal); cancelled.abort();
  await assert.rejects(pending, /abort/i);
});
