import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { createValidationIdentityReader } from '../../probes/e2e/validation-identity.ts';
import { runChild } from '../../probes/e2e/host.ts';

/** Synthetic case 1 history through the actual core; no provider, human confirmation or real case files. */
async function seedStoppedCaseOne(repository: string, root: string, head: string, options: { stop: boolean; exposure?: 'reserved' | 'unknown' }) {
  const caseId = 'cos20-native-validation-1', declaration: ValidationDeclaration = { ...structuredClone(VALIDATION_CASE), caseId,
    grants: Object.fromEntries(Object.entries(VALIDATION_CASE.grants).map(([role, grant]) => [role, { ...grant, taskId: `${caseId}-${role}` }])) as ValidationDeclaration['grants'] };
  let clock = Date.parse('2026-10-02T11:58:02.694Z');
  const context = { root, repositoryRoot: repository, identityReader: createValidationIdentityReader({ repository, reviewedPlatformSha: head }), now: () => clock };
  const quote = await prepareValidationCase({ ...context, declaration }), decision = { kind: 'operator_validation' as const, decisionId: 'offline-case-one-operator', actorId: 'offline-coordinator',
    decidedAt: new Date(clock).toISOString(), source: { artifactId: 'operator-validation-decision', version: 'offline-case-one', location: 'offline-case-one-operator.json' },
    sourceRefs: [{ artifactId: 'offline-fixture-source', version: head, location: 'OFFLINE synthetic operator source; generatedByCosmos:false' }] };
  await writeFile(join(root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId: window.caseId, windowId: window.windowId });
  try {
    if (options.exposure) {
      const requestId = `offline-case-one-${options.exposure}`;
      await controller.reserve({ requestId, taskId: declaration.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 8,
        validation: { caseId, windowId: window.windowId, purpose: 'planning', modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
      // Synthetic admission intent only; no provider is invoked. Stop retains its unresolved reservation.
      await controller.admit(requestId);
      if (options.exposure === 'unknown') await controller.markUnknown(requestId, [{ artifactId: 'offline-synthetic-accounting', version: 'v1', location: 'offline.json' }]);
    }
    clock = Date.parse('2026-10-02T11:58:09.818Z');
    if (options.stop) await controller.stop('OFFLINE synthetic case 1 startup failure; zero API requests.');
  } finally { await controller.close(); }
  return { ...context, declaration, quote, decision, window };
}

/** Offline temporary repository and historical ledger facts, never a real authorization or generated game. */
export async function validationRunFixture(t: test.TestContext, options: { caseOne?: 'absent' | 'unstopped'; exposure?: 'reserved' | 'unknown' } = {}) {
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
  const ancestor = await git('rev-parse', 'HEAD'), dependencies = ['COS-06', 'COS-07', 'COS-08', 'COS-09', 'COS-11', 'COS-12', 'COS-13', 'COS-18', 'COS-19', 'COS-21'];
  const mapping = { tasks: dependencies.map(taskId => ({ taskId, state: 'open', reviewStatus: taskId === 'COS-21' ? 'WINDOWS_PUBLICATION_SOURCE_READY' : 'SOURCE_READY',
    integrationStatus: 'offline-verified-awaiting-live', reviewedCommit: ancestor, mergeCommit: ancestor })) };
  await mkdir(join(repository, 'docs/specs'), { recursive: true }); await writeFile(join(repository, 'docs/specs/github-issues.json'), JSON.stringify(mapping), 'utf8');
  await git('add', '.'); await git('commit', '-m', 'Offline source approvals'); const head = await git('rev-parse', 'HEAD');
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), caseRoot = join(repository, '.cosmos/e2e', VALIDATION_CASE.caseId);
  const old = await RunController.create({ root: ledgerRoot, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', specVersion: '1.0', kind: 'evaluation', scope: 'validation',
    now: () => Date.parse('2026-10-01T06:16:16.857Z'), allocations: [{ taskId: 'prior', amountMicroCny: 84_596_040 }] });
  await old.importSettled({ requestId: 'prior-deepseek-direct-probes', taskId: 'prior', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 1_116_402,
    evidence: [{ artifactId: 'offline-prior', version: 'v1', location: 'offline-source.json' }] });
  const originalSnapshot = await old.read(); await old.close();
  const caseOne = options.caseOne === 'absent' ? null : await seedStoppedCaseOne(repository, ledgerRoot, head, { stop: options.caseOne !== 'unstopped', exposure: options.exposure });
  return { repository, ledgerRoot, caseRoot, head, git, mapping, originalSnapshot, caseOne,
    args: ['--validation-case', head, 'OFFLINE fixture coordinator standing authorization source; generatedByCosmos:false'] };
}
