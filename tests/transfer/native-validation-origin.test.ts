import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { safePath, regularFile, snapshot } from '../../src/artifacts/paths.ts';

async function files(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos97-origin-'));
  t.after(async () => {
    t.mock.restoreAll(); syncBuiltinESMExports();
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('cos97-origin-'));
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, 'a.txt'), 'first', 'utf8'); await writeFile(join(root, 'b.txt'), 'second', 'utf8');
  return root;
}

for (const kind of ['safePath', 'regularFile', 'snapshot'] as const) test(`COS97 ${kind} rejects a pre-cancelled caller before reading`, async t => {
  const root = await files(t), caller = new AbortController(), reason = new Error('original path reader cancellation'); caller.abort(reason);
  const operation = kind === 'safePath' ? () => safePath(root, 'a.txt', caller.signal)
    : kind === 'regularFile' ? () => regularFile(root, 'a.txt', caller.signal) : () => snapshot(root, caller.signal);
  await assert.rejects(operation(), error => error === reason);
});

test('COS97 snapshot stops before the next file after cancellation during an actual file read', async t => {
  const root = await files(t), caller = new AbortController(), reason = new Error('cancelled after dispatched read');
  const read = fs.promises.readFile; let reads = 0;
  t.mock.method(fs.promises, 'readFile', async (...args: Parameters<typeof read>) => {
    const bytes = await read(...args);
    if (String(args[0]).startsWith(root)) { reads++; if (reads === 1) caller.abort(reason); }
    return bytes;
  });
  syncBuiltinESMExports();
  const pending = snapshot(root, caller.signal);
  try { await assert.rejects(pending, error => error === reason); }
  finally { assert.ok(reads > 0, 'The test must observe the actual production reader'); }
  assert.equal(reads, 1, 'No subsequent snapshot leaf may start after cancellation');
});
