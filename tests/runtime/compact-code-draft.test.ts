import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactCodeDraftFiles } from '../../src/runtime/code-draft-source.ts';

const page = 'authors/coding/index.html', source = 'authors/coding/src/game.ts', note = 'authors/coding/src/audioProbeNote.md';
const bytes = Buffer.from('\uFEFFexport const title = "小屋";\r\n');

test('compact code draft preserves exact UTF-8 bytes in stable path order', () => {
  const markdown = Buffer.from('# 音效探针说明\r\n\r\n保留作者记录，供后续修复参考。\r\n');
  const files = new Map([[source, bytes], [note, markdown], [page, Buffer.from('<main/>')]]);
  assert.deepEqual(compactCodeDraftFiles(files), [{ path: page, content: '<main/>' },
    { path: note, content: markdown.toString('utf8') }, { path: source, content: bytes.toString('utf8') }]);
});

test('compact code draft bounds the entire serialized list and falls back as a whole', () => {
  for (const path of [source, note]) {
    const overhead = Buffer.byteLength(JSON.stringify([{ path, content: '' }]));
    const exact = Buffer.alloc(65536 - overhead, 'x');
    assert.ok(compactCodeDraftFiles(new Map([[path, exact]])));
    for (const content of [Buffer.concat([exact, Buffer.from('x')]), Buffer.alloc(40_000, '"'), Buffer.from([0xff]), Buffer.from('a\0b')]) {
      assert.equal(compactCodeDraftFiles(new Map([[page, Buffer.alloc(0)], [path, content]])), undefined);
    }
    assert.equal(compactCodeDraftFiles(new Map([[path, Buffer.concat([exact, Buffer.from('x')])]])), undefined);
  }
  for (const path of ['toolchain/src/tool.ts', 'authors/coding/src/../other.ts', 'authors/coding/src/.env', 'authors/coding/src/node_modules/tool/lib.ts', 'authors/coding/src/picture.png',
    'authors/coding/README.md', 'authors/coding/src/.hidden/note.md', 'authors/coding/src/node_modules/note.md', 'authors/coding/src/note.txt', 'authors/coding/src/note.mdx']) {
    assert.equal(compactCodeDraftFiles(new Map([[page, bytes], [path, bytes]])), undefined);
  }
  for (const literal of ['-----BEGIN RSA PRIVATE KEY-----', 'sk-' + 'x'.repeat(32)]) {
    assert.equal(compactCodeDraftFiles(new Map([[source, Buffer.from(literal)]])), undefined);
  }
});
