import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactCodeDraftFiles } from '../../src/runtime/code-draft-source.ts';

const page = 'authors/coding/index.html', source = 'authors/coding/src/game.ts';
const bytes = Buffer.from('\uFEFFexport const title = "小屋";\r\n');

test('compact code draft preserves exact UTF-8 bytes in stable path order', () => {
  const files = new Map([[source, bytes], [page, Buffer.from('<main/>')]]);
  assert.deepEqual(compactCodeDraftFiles(files), [{ path: page, content: '<main/>' }, { path: source, content: bytes.toString('utf8') }]);
});

test('compact code draft bounds the entire serialized list and falls back as a whole', () => {
  const overhead = Buffer.byteLength(JSON.stringify([{ path: source, content: '' }]));
  const exact = Buffer.alloc(65536 - overhead, 'x');
  assert.ok(compactCodeDraftFiles(new Map([[source, exact]])));
  for (const content of [Buffer.concat([exact, Buffer.from('x')]), Buffer.alloc(40_000, '"'), Buffer.from([0xff]), Buffer.from('a\0b')]) {
    assert.equal(compactCodeDraftFiles(new Map([[page, Buffer.alloc(0)], [source, content]])), undefined);
  }
  assert.equal(compactCodeDraftFiles(new Map([[source, Buffer.concat([exact, Buffer.from('x')])]])), undefined);
  for (const path of ['toolchain/src/tool.ts', 'authors/coding/src/../other.ts', 'authors/coding/src/.env', 'authors/coding/src/node_modules/tool/lib.ts', 'authors/coding/src/picture.png']) {
    assert.equal(compactCodeDraftFiles(new Map([[page, bytes], [path, bytes]])), undefined);
  }
  for (const literal of ['-----BEGIN RSA PRIVATE KEY-----', 'sk-' + 'x'.repeat(32)]) {
    assert.equal(compactCodeDraftFiles(new Map([[source, Buffer.from(literal)]])), undefined);
  }
});
