import { access, mkdir, open, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import type { ArtifactReference } from '../../src/contracts/types.ts';
import type { RunController } from '../../src/runtime/run.ts';
import { regularFile, safePath } from '../../src/artifacts/paths.ts';
import { files, jsonFile } from './host.ts';
import { TRIAL } from './trial.ts';
import type { PilotJournal } from './budget.ts';

export const STARTUP_DEADLINE = '2026-10-01T12:43:38.426Z';
const originalHead = '26aee74902b08ea7d32b8ebaf7a0a17ac286e051';
const inputs = [['requirements.json', 'probes/e2e/requirements.json'], ['character-format.ts', 'src/media/vector.ts'], ['audio-format.ts', 'src/media/audio.ts']] as const;
function need(value: unknown, message: string): asserts value { if (!value) throw new Error(`Startup recovery: ${message}`); }
async function absent(root: string, name: string): Promise<void> {
  try { await access(await safePath(root, name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`Startup recovery: ${name} already exists`);
}
async function syncedJson(root: string, name: string, value: unknown): Promise<void> {
  const path = await safePath(root, name); await mkdir(dirname(path), { recursive: true });
  const file = await open(path, 'wx');
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8'); await file.sync(); }
  finally { await file.close(); }
}

export async function verifyStartupInputs(repository: string, root: string): Promise<void> {
  need(same((await readdir(await safePath(root, 'inputs'))).sort(), inputs.map(([name]) => name).sort()), 'input file set changed');
  for (const [name, source] of inputs) need((await regularFile(root, `inputs/${name}`)).equals(await regularFile(repository, source)), `frozen input changed: ${name}`);
}

type Phase = 'registry-create' | 'input-validation' | 'requirements-capture' | 'template-capture';
function inside(root: string, value: unknown): string | null {
  if (typeof value !== 'string' || !isAbsolute(value)) return null;
  const part = relative(resolve(root), resolve(value)).replaceAll('\\', '/');
  return part && part !== '..' && !part.startsWith('../') && !isAbsolute(part) ? part : null;
}
/** This wrapper is used only before native sessions. Never persist free exception/provider text. */
export async function startupStep<T>(options: { root: string; phase: Phase; captureRef?: ArtifactReference; signal: AbortSignal; recovery?: boolean }, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    const failure = error as NodeJS.ErrnoException & { dest?: unknown };
    await syncedJson(options.root, `startup-diagnostics/${options.recovery ? 'recovery' : 'initial'}/${options.phase}.json`, {
      phase: options.phase, captureRef: options.captureRef ?? null,
      code: typeof failure?.code === 'string' && /^E[A-Z0-9_]{1,39}$/.test(failure.code) ? failure.code : null,
      syscall: typeof failure?.syscall === 'string' && ['open', 'rename', 'mkdir', 'lstat', 'stat', 'copyfile', 'read', 'write', 'link', 'unlink', 'rmdir', 'scandir'].includes(failure.syscall) ? failure.syscall : null,
      path: inside(options.root, failure?.path), dest: inside(options.root, failure?.dest), guardAborted: options.signal.aborted,
    });
    throw new Error('Trusted startup step failed; inspect its bounded diagnostic record.');
  }
}

export interface StartupRecovery { root: string; ledgerRoot: string; origin: any; journal: PilotJournal; failedResult: any }
/** Narrow admission for the observed zero-request, unpublished bootstrap only. It never edits live state. */
export async function readStartupRecovery(repository: string, ledgerRoot: string, controller: RunController, now = Date.now()): Promise<StartupRecovery> {
  const root = await safePath(repository, `.cosmos/e2e/${TRIAL.id}`);
  for (const name of ['startup-recovery-origin.json', 'startup-recovery-result.json', 'sessions', 'authors', 'confirmed-requirement.json', 'plan-reference.json']) await absent(root, name);
  const [marker, origin, journal, failedResult, snapshot] = await Promise.all([
    jsonFile(ledgerRoot, `${TRIAL.id}.json`), jsonFile(root, 'origin.json'), jsonFile(root, 'pilot-budget.json'), jsonFile(root, 'result.json'), controller.read(),
  ]);
  need(same(marker, origin) && origin.trialId === TRIAL.id && resolve(origin.root) === resolve(root) && same(origin.limits, TRIAL)
    && origin.platformHead === originalHead && resolve(origin.budgets.sharedLedger) === resolve(ledgerRoot), 'fixed marker/origin/config changed');
  need(origin.startedAt === '2026-10-01T11:43:38.426Z' && origin.deadlineAt === STARTUP_DEADLINE && journal.deadlineAt === STARTUP_DEADLINE
    && journal.maxRequests === 40 && journal.requestIds.length === 0 && same(journal, failedResult.trialJournal), 'original deadline or zero request counter changed');
  need(Number.isFinite(now) && now + 5000 < Date.parse(STARTUP_DEADLINE), 'original deadline expired');
  need(failedResult.outcome === 'failed' && failedResult.root === origin.root && failedResult.platformHead === originalHead && failedResult.trialCommittedMicroCny === 0
    && failedResult.startedAt === origin.startedAt && failedResult.deadlineAt === origin.deadlineAt, 'original failed result changed');
  const { run, ledger } = snapshot;
  need(run.runId === origin.runId && run.ledgerId === origin.ledgerId && ledger.ledgerId === origin.ledgerId && run.specVersion === '1.0'
    && run.originalDeadlineAt === '2026-10-01T18:16:16.857Z' && run.state === 'running' && !snapshot.stopReason && ledger.limitMicroCny === 150_000_000, 'shared run changed or stopped');
  need(!ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0 || ['reserved', 'unknown'].includes(entry.status)), 'unknown or in-flight charge');
  need(same(ledger.entries.map(entry => entry.requestId), origin.baselineRequestIds)
    && origin.baselineCommittedMicroCny === 892_282 && ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0) === 892_282, 'ledger requests or fees changed');
  need(!snapshot.tasks.some(task => task.taskId.startsWith(TRIAL.id)) && !run.taskIds.some(id => id.startsWith(TRIAL.id)), 'this trial already has tasks');
  const registryEntries = await readdir(await safePath(root, 'registry'));
  need(registryEntries.every(name => ['captures', 'candidates', 'tmp'].includes(name)), 'registry has a lock, publication or unexpected file');
  for (const name of ['registry/tmp', 'registry/candidates']) need((await readdir(await safePath(root, name))).length === 0, 'registry has temporary work or candidates');
  for (const name of await readdir(await safePath(root, 'registry/captures'))) {
    need([`${TRIAL.id}-requirements`, `${TRIAL.id}-template`].includes(name), 'unexpected capture namespace');
    need((await readdir(await safePath(root, `registry/captures/${name}`))).length === 0, 'a capture version already exists');
  }
  await verifyStartupInputs(repository, root);
  const templateFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', '.gitignore', ...(await files(join(repository, 'templates/2d/src'))).map(name => `src/${name}`)];
  const expectedTree = new Set(templateFiles);
  for (const name of templateFiles) { const parts = name.split('/'); while (parts.pop() && parts.length) expectedTree.add(parts.join('/') + '/'); }
  const actualTree: string[] = [];
  async function inspectTemplate(folder = ''): Promise<void> {
    for (const entry of await readdir(await safePath(root, folder ? `toolchain/${folder}` : 'toolchain'), { withFileTypes: true })) {
      if (!folder && entry.name === 'node_modules') continue;
      const name = folder ? `${folder}/${entry.name}` : entry.name;
      actualTree.push(name + (entry.isDirectory() ? '/' : ''));
      if (entry.isDirectory()) await inspectTemplate(name);
    }
  }
  await inspectTemplate();
  need(same(actualTree.sort(), [...expectedTree].sort()), 'non-vendor template file set changed');
  for (const name of templateFiles) need((await regularFile(root, `toolchain/${name}`)).equals(await regularFile(repository, `templates/2d/${name}`)), `generic template/lock changed: ${name}`);
  need((await jsonFile(root, 'toolchain-install.json')).code === 0, 'original toolchain installation did not pass');
  const lock = await jsonFile(root, 'toolchain/package-lock.json');
  for (const name of ['typescript', 'vite', 'phaser']) need((await jsonFile(root, `toolchain/node_modules/${name}/package.json`)).version === lock.packages[`node_modules/${name}`].version, `installed ${name} version differs from the original lock`);
  for (const name of ['typescript/bin/tsc', 'vite/bin/vite.js']) await regularFile(root, `toolchain/node_modules/${name}`);
  return { root, ledgerRoot, origin, journal, failedResult };
}

export async function claimStartupRecovery(value: StartupRecovery, platformHead: string): Promise<void> {
  await syncedJson(value.root, 'startup-recovery-origin.json', { trialId: TRIAL.id, root: value.root, originalResult: 'result.json', claimedAt: new Date().toISOString(),
    originalPlatformHead: value.origin.platformHead, platformHead, startedAt: value.origin.startedAt, deadlineAt: value.origin.deadlineAt,
    originalJournal: value.journal, baselineCommittedMicroCny: value.origin.baselineCommittedMicroCny, maxStartupRecoveries: 1,
    diagnosis: 'Original host publication failure is unknown and was not reproduced in three offline replicas; no capture is retroactively claimed successful.',
    scope: 'Reuse verified host inputs and installed generic toolchain, then retry unpublished bootstrap once within the original clock/counter. No model task or semantic repair has yet occurred.' });
}
