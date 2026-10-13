import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { readFile, writeFile, realpath, lstat, stat, utimes, readdir } from 'node:fs/promises';
import { join, resolve, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFixedTransferValidationCaseNineEntry } from '../../probes/transfer/validation-case-nine-entry.ts';

export async function compactionSourcePrerequisites(t: TestContext) {
  const repository = await realpath(resolve(process.env.COS79_SOURCE_SEED ?? join(tmpdir(), 'cosmos-transfer-entry-T81i3U')));
  assert.ok(repository.startsWith(resolve(tmpdir()) + sep) && /^cosmos-transfer-entry-[a-z0-9]+$/i.test(basename(repository)));
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), snapshotPath = join(ledgerRoot, 'snapshot.json');
  const snapshot = await readFile(snapshotPath), info = await stat(snapshotPath), mappingPath = join(repository, 'docs/specs/github-issues.json'), mapping = await readFile(mappingPath);
  const seed = JSON.parse(await readFile(join(repository, '.cosmos/SOURCE-C8-fixture.json'), 'utf8'));
  assert.equal(seed.formatVersion, 'SOURCE-C8-before15/1');
  const history = await readFile(join(repository, '.cosmos/SOURCE-C9-proof-d40980df-e6ec-490f-902b-a592ef4c86ac/history-1.json'));
  assert.equal(JSON.parse(history.toString('utf8')).allocationClosureDecisions.length, 14);
  for (const file of ['.controller.lock', '.controller.lock.recovery']) await assert.rejects(lstat(join(ledgerRoot, file)), { code: 'ENOENT' });
  await assert.rejects(lstat(join(repository, '.cosmos/e2e/cos20-transfer-validation-9')), { code: 'ENOENT' });
  const git = async (...args: string[]) => (await promisify(execFile)('git', ['-c', 'user.name=SOURCE Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '--no-optional-locks', ...args], { cwd: repository, encoding: 'utf8', timeout: 5000 })).stdout.trim();
  assert.equal(await git('status', '--porcelain'), '');
  const originalHead = await git('rev-parse', 'HEAD'), unrelated = await git('commit-tree', `${originalHead}^{tree}`, '-m', 'SOURCE unrelated COS79');
  let networkCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { networkCalls++; throw new Error('NETWORK_DISABLED'); });
  const update = async (change: object) => {
    const value = JSON.parse(mapping.toString('utf8'));
    value.tasks = value.tasks.filter((item: any) => item.taskId !== 'COS-79');
    value.tasks.push({ taskId: 'COS-79', reviewedCommit: originalHead, mergeCommit: originalHead, reviewStatus: 'VALIDATION_CODING_COMPACTION_SOURCE_READY', integrationStatus: 'source-integrated', ...change });
    await writeFile(mappingPath, JSON.stringify(value), 'utf8'); await git('add', 'docs/specs/github-issues.json'); await git('commit', '-m', 'SOURCE COS79 prerequisite variant');
    const head = await git('rev-parse', 'HEAD'); await git('update-ref', 'refs/remotes/origin/main', head); return head;
  };
  try {
    await writeFile(snapshotPath, history);
    for (const change of [{ reviewStatus: 'SOURCE_NOT_READY' }, { reviewedCommit: unrelated }, { mergeCommit: unrelated }, {}]) {
      const head = await update(change), bytes = await readFile(snapshotPath), currentInfo = await stat(snapshotPath), files = await readdir(ledgerRoot);
      const pending = createFixedTransferValidationCaseNineEntry(seed.pins).preflightTransferValidationCaseNineRun({ repository, args: ['--validation-preflight', head] });
      if (Object.keys(change).length) await assert.rejects(pending, /COS-79|ancestor/);
      else { const result = await pending; assert.equal(result.paidRequests, 0); assert.ok(result.sourceApprovals.some(item => item.taskId === 'COS-79')); }
      assert.deepEqual(await readFile(snapshotPath), bytes); assert.equal((await stat(snapshotPath)).mtimeMs, currentInfo.mtimeMs); assert.deepEqual(await readdir(ledgerRoot), files);
      assert.equal(networkCalls, 0);
    }
  } finally {
    await writeFile(snapshotPath, snapshot); await utimes(snapshotPath, info.atimeMs / 1000, info.mtimeMs / 1000);
    await writeFile(mappingPath, mapping); await git('add', 'docs/specs/github-issues.json');
    if (await git('diff', '--cached', '--name-only')) await git('commit', '-m', 'SOURCE restore original prerequisite mapping');
    await git('update-ref', 'refs/remotes/origin/main', await git('rev-parse', 'HEAD'));
    assert.deepEqual(await readFile(snapshotPath), snapshot); assert.equal(networkCalls, 0);
  }
}
