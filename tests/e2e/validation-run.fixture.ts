import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { runChild } from '../../probes/e2e/host.ts';

/** Offline temporary repository and historical ledger facts, never a real authorization or generated game. */
export async function validationRunFixture(t: test.TestContext) {
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-validation-entry-')), original = fileURLToPath(new URL('../../', import.meta.url));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const git = async (...args: string[]) => {
    const result = await runChild('git', ['-c', 'user.name=Offline Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${join(repository, '.git/no-hooks')}`, ...args],
      { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 });
    assert.equal(result.code, 0, 'Offline Git operation failed'); return result.stdout.trim();
  };
  await git('init', '--initial-branch=main'); await git('config', 'core.autocrlf', 'false');
  for (const file of [VALIDATION_CASE.inputs.requirements, ...VALIDATION_CASE.inputs.template.files, ...['src/media/vector.ts', 'src/media/audio.ts'].map(path => ({ path }))]) {
    await mkdir(dirname(join(repository, file.path)), { recursive: true }); await writeFile(join(repository, file.path), await readFile(join(original, file.path)));
  }
  await writeFile(join(repository, '.gitignore'), '.cosmos/\n', 'utf8'); await git('add', '.'); await git('commit', '-m', 'Offline frozen source');
  const ancestor = await git('rev-parse', 'HEAD'), dependencies = ['COS-06', 'COS-07', 'COS-08', 'COS-09', 'COS-11', 'COS-12', 'COS-13', 'COS-18', 'COS-19'];
  const mapping = { tasks: dependencies.map(taskId => ({ taskId, state: 'open', reviewStatus: 'SOURCE_READY', integrationStatus: 'offline-verified-awaiting-live', reviewedCommit: ancestor, mergeCommit: ancestor })) };
  await mkdir(join(repository, 'docs/specs'), { recursive: true }); await writeFile(join(repository, 'docs/specs/github-issues.json'), JSON.stringify(mapping), 'utf8');
  await git('add', '.'); await git('commit', '-m', 'Offline source approvals'); const head = await git('rev-parse', 'HEAD');
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), caseRoot = join(repository, '.cosmos/e2e', VALIDATION_CASE.caseId);
  const old = await RunController.create({ root: ledgerRoot, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', specVersion: '1.0', kind: 'evaluation', scope: 'validation',
    now: () => Date.parse('2026-10-01T06:16:16.857Z'), allocations: [{ taskId: 'prior', amountMicroCny: 84_596_040 }] });
  await old.importSettled({ requestId: 'prior-deepseek-direct-probes', taskId: 'prior', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 1_116_402,
    evidence: [{ artifactId: 'offline-prior', version: 'v1', location: 'offline-source.json' }] });
  await old.close();
  return { repository, ledgerRoot, caseRoot, head, git, mapping, args: ['--validation-case', head, 'OFFLINE fixture coordinator standing authorization source; generatedByCosmos:false'] };
}
