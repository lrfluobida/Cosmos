import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateGameDraft, confirmRequirements } from '../roles/requirements.ts';
import type { PreparationGameDraft } from '../roles/requirements.ts';
import { modeFromSelection } from '../roles/preparation-mode.ts';
import type { HostInput } from './entrypoint.ts';
import type { PreparedTask } from './orchestrator.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { requireOriginalTask } from './recovery/task-journal.ts';

export interface HumanPreparationInput extends Omit<HostInput, 'draft' | 'binding'> { draft: PreparationGameDraft }
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');

/** Fixed runtime import closure; type imports and unrelated repository files are excluded. */
async function executionSource() {
  const extension = import.meta.url.endsWith('.js') ? '.js' : '.ts', base = new URL('../', import.meta.url), files = new Map<string, string>();
  async function visit(url: URL, imports = true) {
    const path = await realpath(fileURLToPath(url)); if (files.has(path)) return;
    const bytes = await readFile(path); files.set(path, hash(bytes));
    if (!imports) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    for (const match of text.matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"](\.[^'"]+)['"]/g)) await visit(new URL(match[1], url));
  }
  // Dynamic modules/owned worker entrypoints selected by this production path.
  await visit(new URL(`cli/index${extension}`, base), false);
  for (const path of ['cli/session', 'cli/continuation-session', 'runtime/entrypoint-host', 'runtime/adapters/transfer/runtime-host',
    'runtime/coding-check-worker', 'acceptance/process', 'acceptance/runner']) {
    const url = new URL(path + extension, base);
    await visit(url);
  }
  const dependencies = [];
  for (const name of ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', 'typebox']) {
    const entry = await realpath(fileURLToPath(import.meta.resolve(name))); let folder = dirname(entry), manifest;
    for (;;) { try { const bytes = await readFile(join(folder, 'package.json')); const value = decode(bytes); if (value.name === name) { manifest = { path: join(folder, 'package.json'), sha256: hash(bytes), version: value.version }; break; } } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const parent = dirname(folder); if (parent === folder) throw new Error('Resolved runtime dependency manifest is missing.'); folder = parent; }
    dependencies.push({ name, entry, entrySha256: hash(await readFile(entry)), ...manifest });
  }
  const lockPath = await realpath(fileURLToPath(new URL('../../package-lock.json', import.meta.url)));
  const source = { variant: extension === '.js' ? 'compiled' : 'source', files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })),
    platformLock: { path: lockPath, sha256: hash(await readFile(lockPath)) }, dependencies };
  return { ...source, sha256: hash(JSON.stringify(source)), sourceVersion: createHash('sha1').update(JSON.stringify(source)).digest('hex') };
}
async function requireExecutionSource(source: Awaited<ReturnType<typeof executionSource>>) {
  const files = [...source.files, source.platformLock, ...source.dependencies.flatMap(item => [{ path: item.entry, sha256: item.entrySha256 }, { path: item.path!, sha256: item.sha256! }])];
  if (!(await Promise.all(files.map(async file => hash(await readFile(file.path)) === file.sha256))).every(Boolean)) throw new Error('Actual executed preparation source or dependency bytes changed.');
  for (const item of source.dependencies) if (await realpath(fileURLToPath(import.meta.resolve(item.name))) !== item.entry) throw new Error('Actual resolved preparation dependency source changed.');
}

/** Real human confirmation stays in its original run, ledger and execution authority. */
export async function createHumanPreparationScope(input: HumanPreparationInput) {
  const { root, controller, requirement, draft, work } = input;
  validateGameDraft(draft, modeFromSelection(draft.preparation));
  if (!draft.preparation || draft.unsupported.length || 'validation' in requirement) throw new Error('Human preparation requires its confirmed supported draft.');
  const initial = await controller.read();
  if (initial.ledger.entries.some(item => item.unknown || item.reservedMicroCny > 0)) throw new Error('Original human requests require reconciliation before preparation.');
  const decision = initial.run.humanDecisions.find(item => sameValue(item.evidence, requirement.sources));
  if (!decision || requirement.sources.length !== 2 || decision.decisionId !== `requirements-${requirement.sources[0].version}`
    || decision.actorId !== requirement.confirmedBy || decision.decidedAt !== requirement.confirmedAt) throw new Error('Original human confirmation identity changed.');
  const revision = Number(requirement.sources[0].version.slice(1));
  const confirmation = { revision, confirmed: true, actorId: requirement.confirmedBy, at: requirement.confirmedAt, runId: initial.run.runId, draft: requirement.sources[0] };
  const mode = { runId: initial.run.runId, createdAt: initial.events[0].at, draftMode: draft.preparation };
  const expectedRequirement = confirmRequirements({ ...draft, specVersion: initial.run.specVersion, sources: requirement.sources }, confirmation);
  if (!sameValue(expectedRequirement, requirement)) throw new Error('Complete human preparation requirement changed.');
  const sources = [{ location: requirement.sources[0].location, bytes: canonical(draft) }, { location: requirement.sources[1].location, bytes: canonical(confirmation) }, { location: 'intake-mode.json', bytes: canonical(mode) }];
  const fixed = { runId: initial.run.runId, ledgerId: initial.ledger.ledgerId, specVersion: initial.run.specVersion, startedAt: initial.run.originalStartedAt,
    deadlineAt: initial.run.originalDeadlineAt, requirement, sources: sources.map(item => ({ location: item.location, sha256: hash(item.bytes) })), execution: await executionSource() };
  const sourcePath = 'host-human-preparation-source.json', sourceReceipt = { formatVersion: 'human-preparation-source/1', ...fixed };
  let sourcePublished = false, tasks: PreparedTask[] | undefined;
  const requireCurrent = async () => {
    work.signal.throwIfAborted(); controller.requireExecutionWindow(); const state = await controller.read();
    if (state.formatVersion !== 1 || state.run.kind !== 'runtime_generation' || state.ledger.scope !== 'generation' || state.ledger.limitMicroCny !== 200_000_000
      || state.run.runId !== fixed.runId || state.ledger.ledgerId !== fixed.ledgerId || state.run.originalStartedAt !== fixed.startedAt || state.run.originalDeadlineAt !== fixed.deadlineAt
      || state.stopReason || Date.now() >= Date.parse(fixed.deadlineAt) || state.ledger.entries.some(item => item.unknown)
      || !state.run.humanDecisions.some(item => sameValue(item, decision))) throw new Error('Original human preparation scope, stop, cost or window changed.');
    for (const source of sources) if (!(await regularFile(root, source.location)).equals(source.bytes)) throw new Error('Original human confirmation source bytes changed.');
    await requireExecutionSource(fixed.execution);
    if (sourcePublished && !(await regularFile(root, sourcePath)).equals(canonical(sourceReceipt))) throw new Error('Original human preparation source binding bytes changed.');
    if (tasks) {
      const coding = tasks.find(item => item.role === 'coding')!;
      if (!(await regularFile(root, 'host-human-preparation-tasks.json')).equals(canonical({ formatVersion: 'human-preparation-tasks/1', runId: fixed.runId,
        ledgerId: fixed.ledgerId, sourceSha256: fixed.execution.sha256, tasks, repairTaskId: `${coding.task.taskId.slice(0, 57)}-repair` }))) throw new Error('Original human prepared task binding bytes changed.');
    }
    work.signal.throwIfAborted(); return state;
  };
  await requireCurrent();
  if (input.resume) { if (!sameValue(decode(await regularFile(root, sourcePath)), sourceReceipt)) throw new Error('Original human preparation source binding changed.'); }
  else await publishReceipt(join(root, sourcePath), sourceReceipt, work.signal);
  sourcePublished = true;
  const readBinding = async () => decode(await regularFile(root, 'host-human-preparation-tasks.json')) as { tasks: PreparedTask[]; repairTaskId: string };
  return { ...fixed, requireCurrent, bound: () => tasks !== undefined, tasks: () => { if (!tasks) throw new Error('Human preparation task binding is not sealed.'); return tasks; },
    async bind(originals: PreparedTask[]) {
      await requireCurrent(); const execution = decode(await regularFile(root, 'execution.json'));
      if (!sameValue(execution.requirement, requirement) || !sameValue(execution.tasks, originals)) throw new Error('Human tasks differ from the original sealed execution plan.');
      const coding = originals.find(item => item.role === 'coding'); if (!coding) throw new Error('Human coding task is missing.');
      const receipt = { formatVersion: 'human-preparation-tasks/1', runId: fixed.runId, ledgerId: fixed.ledgerId, sourceSha256: fixed.execution.sha256,
        tasks: originals, repairTaskId: `${coding.task.taskId.slice(0, 57)}-repair` };
      const state = await requireCurrent();
      if (input.resume || tasks) {
        try { if (!sameValue(await readBinding(), receipt)) throw new Error('Original human prepared task binding changed.'); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || tasks || state.tasks.length || originals.some(item => state.ledger.allocations.some(grant => grant.taskId === item.task.taskId))) throw error;
          await publishReceipt(join(root, 'host-human-preparation-tasks.json'), receipt, work.signal);
        }
      }
      else await publishReceipt(join(root, 'host-human-preparation-tasks.json'), receipt, work.signal);
      for (const item of originals) { const current = state.tasks.find(task => task.taskId === item.task.taskId);
        if (current) requireOriginalTask(item.task, current);
        else if ((input.resume || tasks) && (state.tasks.length || originals.some(original => state.ledger.allocations.some(grant => grant.taskId === original.task.taskId)))) throw new Error('Original human prepared task registration is incomplete.'); }
      tasks = structuredClone(originals);
    },
  };
}
export type HumanPreparationScope = Awaited<ReturnType<typeof createHumanPreparationScope>>;
