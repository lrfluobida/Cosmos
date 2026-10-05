import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { preflightTransferValidationCaseSixRun } from '../../probes/transfer/validation-case-six-run.ts';

test('case6 free preflight refuses unresolved owner recovery before reading a baseline or creating ownership', async t => {
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-C6-idle-')), ledgerRoot = join(repository, '.cosmos/validation-shared');
  t.after(async () => { assert.ok(resolve(repository).startsWith(resolve(tmpdir()) + '\\')); await rm(repository, { recursive: true, force: true }); });
  await mkdir(ledgerRoot, { recursive: true });
  const recovery = join(ledgerRoot, '.controller.lock.recovery'), content = Buffer.from('SOURCE-only unresolved recovery'); await writeFile(recovery, content);
  const before = await stat(recovery);
  await assert.rejects(preflightTransferValidationCaseSixRun({ repository, args: ['--validation-preflight', 'a'.repeat(40)] }), /ownership|owner/i);
  assert.deepEqual(await readFile(recovery), content); assert.equal((await stat(recovery)).mtimeMs, before.mtimeMs);
  await assert.rejects(stat(join(ledgerRoot, '.controller.lock')), { code: 'ENOENT' });
});
