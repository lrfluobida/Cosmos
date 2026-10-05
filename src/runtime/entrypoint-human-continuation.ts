import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import type { PreparationGameDraft } from '../roles/requirements.ts';
import type { HostInput } from './entrypoint.ts';
import type { PreparedTask } from './orchestrator.ts';
import type { HumanContinuationPreparation } from './continuation-preparation.ts';
import { deriveHumanContinuationPreparation, readHumanContinuationLineage } from './continuation-preparation.ts';
import { executionSource, requireExecutionSource } from './entrypoint-human-preparation.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { requireOriginalTask } from './recovery/task-journal.ts';

export interface HumanContinuationInput extends Omit<HostInput, 'draft' | 'binding'> {
  draft: PreparationGameDraft; binding: { windowId: string; tasks: PreparedTask[]; preparation: HumanContinuationPreparation };
}
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
async function optional(root: string, path: string) {
  try { return await regularFile(root, path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

/** Current authorization is separate from the original stopped human scope and its passed provenance. */
export async function createHumanContinuationScope(input: HumanContinuationInput) {
  const { root, controller, requirement, work } = input, binding = structuredClone(input.binding), initial = await controller.read();
  controller.requireExecutionWindow(binding.windowId);
  const window = initial.continuation!.windows.find(item => item.windowId === binding.windowId)!;
  const preparation = await deriveHumanContinuationPreparation(root, initial, window, binding.tasks);
  if (!preparation || !sameValue(preparation, binding.preparation)) throw new Error('Current human preparation descriptor changed.');
  const lineage = (await readHumanContinuationLineage(root, initial))!;
  if (!sameValue(lineage.requirement, requirement) || !sameValue(lineage.draft, input.draft)) throw new Error('Current human continuation changed its confirmed requirement.');
  const execution = await executionSource(root), confirmationBytes = await regularFile(root, window.confirmation.source.location);
  const fixed = { runId: initial.run.runId, ledgerId: initial.ledger.ledgerId, specVersion: initial.run.specVersion,
    startedAt: initial.run.originalStartedAt, deadlineAt: initial.run.originalDeadlineAt, requirement, execution,
    windowId: window.windowId, decisionId: window.decisionId, preparation };
  const sourcePath = `continuations/${window.decisionId}/human-source.json`, taskPath = `continuations/${window.decisionId}/human-tasks.json`;
  const source = { formatVersion: 'human-continuation-source/1', ...fixed, quoteId: window.quote.quoteId,
    originalSourceSha256: preparation.originalSources.find(item => item.path === 'host-human-preparation-source.json')!.sha256,
    confirmationSha256: hash(confirmationBytes) };
  let published = false, bound = false;
  const taskReceipt = { formatVersion: 'human-continuation-tasks/1', runId: fixed.runId, ledgerId: fixed.ledgerId, windowId: fixed.windowId,
    sourceSha256: hash(canonical(source)), preparation, tasks: binding.tasks };
  const requireCurrent = async () => {
    work.signal.throwIfAborted(); controller.requireExecutionWindow(binding.windowId); const state = await controller.read();
    const current = state.continuation?.windows.find(item => item.windowId === binding.windowId);
    if (state.formatVersion !== 2 || state.run.runId !== fixed.runId || state.ledger.ledgerId !== fixed.ledgerId || state.ledger.limitMicroCny !== 200_000_000
      || state.run.originalStartedAt !== fixed.startedAt || state.run.originalDeadlineAt !== fixed.deadlineAt || !current || !sameValue(current, window)
      || current.stopReason || Date.now() >= Date.parse(current.deadlineAt) || state.ledger.entries.some(entry => entry.unknown
        || entry.reservedMicroCny > 0 && entry.taskId !== preparation.taskId)) throw new Error('Current human continuation authority, stop, deadline or accounting changed.');
    if (!(await regularFile(root, current.confirmation.source.location)).equals(confirmationBytes) || hash(confirmationBytes) !== current.confirmation.sourceSha256) throw new Error('Current human continuation confirmation bytes changed.');
    await requireExecutionSource(execution);
    const actual = await readHumanContinuationLineage(root, state);
    if (!actual || !sameValue(actual.sources, preparation.originalSources)) throw new Error('Original human passed lineage changed.');
    if (published && !(await regularFile(root, sourcePath)).equals(canonical(source))) throw new Error('Current human continuation source receipt changed.');
    if (bound && !(await regularFile(root, taskPath)).equals(canonical(taskReceipt))) throw new Error('Current human continuation task receipt changed.');
    work.signal.throwIfAborted(); return state;
  };
  await requireCurrent();
  const previous = await optional(root, sourcePath);
  if (previous) { if (!previous.equals(canonical(source))) throw new Error('Stored human continuation source differs from current execution.'); }
  else {
    if (initial.tasks.some(task => task.taskId === preparation.taskId) || initial.ledger.entries.some(entry => entry.taskId === preparation.taskId)) throw new Error('Registered continuation cannot manufacture missing source receipt.');
    await publishReceipt(join(root, sourcePath), source, work.signal);
  }
  published = true;
  return { ...fixed, lineage, requireCurrent, bound: () => bound, tasks: () => binding.tasks,
    async bind(tasks: PreparedTask[]) {
      const state = await requireCurrent();
      if (!sameValue(tasks, binding.tasks)) throw new Error('Human continuation tasks differ from the exact complete binding.');
      const bytes = await optional(root, taskPath);
      if (bytes) { if (!bytes.equals(canonical(taskReceipt))) throw new Error('Human continuation task binding changed.'); }
      else {
        if (state.tasks.some(task => task.taskId === preparation.taskId)) throw new Error('Registered continuation task binding is missing.');
        await publishReceipt(join(root, taskPath), taskReceipt, work.signal);
      }
      for (const item of tasks) { const current = state.tasks.find(task => task.taskId === item.task.taskId); if (current) requireOriginalTask(item.task, current); }
      bound = true;
    },
  };
}
export type HumanContinuationScope = Awaited<ReturnType<typeof createHumanContinuationScope>>;
