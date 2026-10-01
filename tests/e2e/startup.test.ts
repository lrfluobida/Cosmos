import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createPilotGuard, openZeroRequestTrialGuard } from '../../probes/e2e/budget.ts';
import { checkTrialAdmission, claimTrial, TRIAL } from '../../probes/e2e/trial.ts';
import { claimStartupRecovery, readStartupRecovery, STARTUP_DEADLINE } from '../../probes/e2e/startup.ts';
import { generatePilot } from '../../probes/e2e/driver.ts';
import { writeJson } from '../../probes/e2e/host.ts';

test('production bootstrap host failure can recover once at zero requests without rewriting old records or inputs', async t => {
  const started = Date.parse('2026-10-01T11:43:38.426Z'); t.mock.timers.enable({ apis: ['Date'], now: started });
  const source = fileURLToPath(new URL('../../', import.meta.url)), repository = await mkdtemp(join(tmpdir(), 'cosmos-startup-test-'));
  const ledgerRoot = join(repository, '.cosmos/validation-shared');
  const controller = await RunController.create({ root: ledgerRoot, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', kind: 'evaluation', scope: 'validation', specVersion: '1.0',
    allocations: [{ taskId: 'COS-10', amountMicroCny: 10_000_000 }, { taskId: 'prior', amountMicroCny: 892_282 }], now: () => Date.parse('2026-10-01T06:16:16.857Z') });
  let guard: Awaited<ReturnType<typeof createPilotGuard>> | undefined;
  t.after(async () => { guard?.close(); await controller.close(); await rm(repository, { recursive: true, force: true }); });
  await controller.importSettled({ requestId: 'prior-deepseek-direct-probes', taskId: 'prior', provider: 'fixture', pricingVersion: 'fixture', actualCostMicroCny: 892_282, evidence: [{ artifactId: 'prior', version: 'v1', location: 'prior.json' }] });
  for (const name of ['probes/e2e/requirements.json', 'src/media/vector.ts', 'src/media/audio.ts']) {
    await mkdir(dirname(join(repository, name)), { recursive: true }); await cp(join(source, name), join(repository, name));
  }
  await cp(join(source, 'templates/2d'), join(repository, 'templates/2d'), { recursive: true, filter: path => !path.includes('node_modules') && !path.includes('dist') });
  const sha = 'a'.repeat(40), originalHead = '26aee74902b08ea7d32b8ebaf7a0a17ac286e051';
  const admission = await checkTrialAdmission({ snapshot: await controller.read(), now: started, platformHead: originalHead, isAncestor: async () => true,
    dependencies: [...Array.from({ length: 7 }, (_, i) => ({ taskId: `COS-0${i + 3}`, state: 'closed', reviewedCommit: sha, mergeCommit: sha })),
      { taskId: 'COS-11', state: 'open', reviewStatus: 'READY', integrationStatus: 'offline-verified-awaiting-live', reviewedCommit: TRIAL.cos11ReviewedCommit, mergeCommit: sha }] });
  const origin = await claimTrial({ repository, ledgerRoot, admission, previous: { root: 'old-fixture', results: ['old-result', 'old-continuation'], outcome: 'failed', requestCount: 13, deadlineAt: '2026-10-01T09:48:34.671Z' } });
  const root = origin.root, toolchain = join(root, 'toolchain'); await cp(join(repository, 'templates/2d'), toolchain, { recursive: true });
  const lock = JSON.parse(await readFile(join(toolchain, 'package-lock.json'), 'utf8'));
  for (const name of ['typescript', 'vite', 'phaser']) await writeJson(root, `toolchain/node_modules/${name}/package.json`, { version: lock.packages[`node_modules/${name}`].version });
  for (const name of ['typescript/bin/tsc', 'vite/bin/vite.js']) { await mkdir(dirname(join(toolchain, 'node_modules', name)), { recursive: true }); await writeFile(join(toolchain, 'node_modules', name), '// offline availability fixture\n', 'utf8'); }
  await writeJson(root, 'toolchain-install.json', { code: 0 });
  guard = await createPilotGuard({ root, controller, deadlineAt: origin.deadlineAt, maxRequests: 40 });
  let nativeCalls = 0;
  const call = (recovery: boolean) => generatePilot({ repository, root, prefix: TRIAL.id, controller, guard: guard!, toolchain, childAllocationCapMicroCny: 19_000_000,
    confirmedAt: origin.startedAt, trial: true, startupRecovery: recovery, sessionFactory: async () => { nativeCalls++; throw new Error('OFFLINE_NATIVE_BOUNDARY'); } });
  const failure = t.mock.method(ArtifactRegistry.prototype, 'registerCapture', async () => {
    throw Object.assign(new Error('SECRET_SENTINEL_DO_NOT_LOG'), { code: 'EPERM', syscall: 'rename', path: join(root, 'registry/tmp/fixture'), dest: join(root, 'registry/captures/fixed/v1') });
  });
  await assert.rejects(call(false), /Trusted startup/); failure.mock.restore();
  assert.equal(nativeCalls, 0);
  const diagnostic = await readFile(join(root, 'startup-diagnostics/initial/requirements-capture.json'), 'utf8');
  assert.doesNotMatch(diagnostic, /SECRET_SENTINEL/); assert.equal(JSON.parse(diagnostic).code, 'EPERM'); assert.equal(JSON.parse(diagnostic).path, 'registry/tmp/fixture');
  const journal = JSON.parse(await readFile(join(root, 'pilot-budget.json'), 'utf8'));
  await writeJson(root, 'result.json', { outcome: 'failed', root, platformHead: originalHead, startedAt: origin.startedAt, deadlineAt: origin.deadlineAt, trialCommittedMicroCny: 0, trialJournal: journal });
  const names = ['origin.json', 'pilot-budget.json', 'result.json', 'inputs/requirements.json'];
  const before = await Promise.all(names.map(name => readFile(join(root, name))));
  const current = await readStartupRecovery(repository, ledgerRoot, controller); assert.equal(current.journal.requestIds.length, 0);
  await assert.rejects(readStartupRecovery(repository, ledgerRoot, controller, Date.parse(STARTUP_DEADLINE)), /deadline expired/);
  await writeFile(join(root, 'pilot-budget.json'), JSON.stringify({ ...journal, requestIds: ['unexpected'] }), 'utf8');
  await assert.rejects(readStartupRecovery(repository, ledgerRoot, controller), /counter/); await writeFile(join(root, 'pilot-budget.json'), before[1]);
  const originalInput = await readFile(join(root, 'inputs/character-format.ts'));
  await writeFile(join(root, 'inputs/character-format.ts'), '// altered', 'utf8');
  await assert.rejects(readStartupRecovery(repository, ledgerRoot, controller), /frozen input changed/); await writeFile(join(root, 'inputs/character-format.ts'), originalInput);
  for (const extra of ['.env', 'src/extra.ts']) {
    const path = join(toolchain, extra); await writeFile(path, '// unexpected fixture input', 'utf8');
    await assert.rejects(readStartupRecovery(repository, ledgerRoot, controller), /non-vendor template file set/); await rm(path);
  }
  await claimStartupRecovery(current, sha);
  await assert.rejects(readStartupRecovery(repository, ledgerRoot, controller), /already exists/);
  guard.close(); guard = await openZeroRequestTrialGuard({ root, ledgerRoot, controller, origin: current.origin, journal: current.journal });
  await assert.rejects(call(true), /OFFLINE_NATIVE_BOUNDARY/); assert.equal(nativeCalls, 1);
  assert.equal((await controller.read()).tasks.length, 0); assert.equal((await controller.read()).ledger.entries.length, 1);
  for (const [index, name] of names.entries()) assert.ok((await readFile(join(root, name))).equals(before[index]), name);
  assert.equal(guard.deadlineAt, STARTUP_DEADLINE); assert.equal(JSON.parse(await readFile(join(root, 'pilot-budget.json'), 'utf8')).requestIds.length, 0);
});
