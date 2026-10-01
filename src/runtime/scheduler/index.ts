import { realpath } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { PreparedTask } from '../orchestrator.ts';
import type { RunController } from '../run.ts';
import { pathsOverlap } from '../../roles/factory.ts';

export interface SchedulingOptions {
  /** Initial supported bounds. Omitted means two simultaneous task attempts. */
  maxParallel?: 1 | 2;
  /** Time reserved for stopping owned operations before the original deadline. */
  cleanupMs?: number;
  /** Exclusive host resources (browser, build directory, promotion target, etc.). */
  resources?: Record<string, string[]>;
}

async function physicalPath(path: string): Promise<string> {
  const suffix: string[] = []; let existing = resolve(path);
  for (;;) {
    try { return resolve(await realpath(existing), ...suffix); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(existing) === existing) throw error;
      suffix.unshift(basename(existing)); existing = dirname(existing);
    }
  }
}

/** Fixed ownership is checked before registering or dispatching any task. */
export async function assertTaskWriteIsolation(tasks: PreparedTask[]): Promise<void> {
  const paths = await Promise.all(tasks.map(item => Promise.all(item.task.ownership.writePaths.map(path => physicalPath(resolve(item.workspace, path))))));
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
    if (paths[i].some(a => paths[j].some(b => pathsOverlap(a, b, tasks[i].workspace)))) throw new Error('Task write paths conflict across workspaces.');
  }
}

export function validateScheduling(tasks: PreparedTask[], options: SchedulingOptions): void {
  if (![1, 2].includes(options.maxParallel ?? 2) || !Number.isSafeInteger(options.cleanupMs ?? 5000) || (options.cleanupMs ?? 5000) < 0) throw new Error('Scheduling requires parallelism 1 or 2 and a nonnegative cleanup duration.');
  for (const [id, keys] of Object.entries(options.resources ?? {})) {
    if (!tasks.some(item => item.task.taskId === id) || !Array.isArray(keys) || keys.length > 32 || new Set(keys).size !== keys.length || keys.some(key => typeof key !== 'string' || !key.trim() || key.length > 128)) throw new Error('Invalid host task resource declaration.');
  }
}

/** Runs the existing task executor. A completed local dependency is inspected by
 * that executor before any phase dispatch; a historical passed flag cannot
 * bypass a blocked result from the current recovery. */
export async function scheduleTasks(input: {
  tasks: PreparedTask[]; controller: RunController; options: SchedulingOptions;
  exclusive: boolean; signal: AbortSignal; now?: () => number;
  execute(item: PreparedTask): Promise<void>;
}): Promise<void> {
  const { tasks, controller, options, signal } = input;
  validateScheduling(tasks, options);
  const width = input.exclusive ? 1 : options.maxParallel ?? 2;
  const now = input.now ?? Date.now;
  const cutoff = Date.parse((await controller.read()).run.originalDeadlineAt) - (options.cleanupMs ?? 5000);
  const pending = [...tasks], done = new Set<string>(), resources = new Set<string>();
  const active = new Map<string, Promise<{ id: string; error?: unknown }>>();
  let timerFailure: unknown;
  const stopAtCutoff = async () => { if (!signal.aborted && now() >= cutoff) await controller.stop('Scheduler reserved the remaining original time for cancellation and saving work.'); };
  const timer = setTimeout(() => { void stopAtCutoff().catch(error => { timerFailure = error; }); }, Math.max(1, cutoff - now()));
  timer.unref();
  const keys = (item: PreparedTask) => options.resources?.[item.task.taskId] ?? [];
  try {
    while (pending.length || active.size) {
      await stopAtCutoff();
      if (timerFailure) throw timerFailure;
      let launched = false;
      for (let index = 0; index < pending.length && active.size < width;) {
        const item = pending[index];
        const ready = item.task.dependsOn.every(dep => !tasks.some(t => t.task.taskId === dep.taskId) || done.has(dep.taskId));
        if (!ready || keys(item).some(key => resources.has(key))) { index++; continue; }
        pending.splice(index, 1); for (const key of keys(item)) resources.add(key);
        const id = item.task.taskId;
        // On cancellation execute only records the stopped/blocked handoff; its
        // existing signal gate prevents creation of a role or host operation.
        active.set(id, input.execute(item).then(() => ({ id }), error => ({ id, error })));
        launched = true;
      }
      if (!active.size) { if (pending.length) throw new Error('Scheduler cannot resolve task dependencies.'); break; }
      if (launched && active.size < width) continue;
      const result = await Promise.race(active.values());
      active.delete(result.id); done.add(result.id);
      for (const key of keys(tasks.find(item => item.task.taskId === result.id)!)) resources.delete(key);
      if (result.error) throw result.error;
    }
  } catch (error) {
    await controller.stop('Scheduler execution failed; drain owned work before recovery.');
    throw error;
  } finally {
    clearTimeout(timer);
    await Promise.allSettled(active.values());
  }
}

/** Human/CLI status from the original durable run; no completion inference. */
export async function schedulerStatus(controller: RunController) {
  const snapshot = await controller.read();
  const providers = [...new Set(snapshot.ledger.entries.map(entry => entry.provider))].map(provider => {
    const entries = snapshot.ledger.entries.filter(entry => entry.provider === provider);
    return { provider, settledMicroCny: entries.reduce((n, e) => n + e.settledMicroCny, 0), reservedMicroCny: entries.reduce((n, e) => n + e.reservedMicroCny, 0), unknownRequestIds: entries.filter(e => e.unknown).map(e => e.requestId) };
  });
  return { ...(await controller.summary()), providers, tasks: snapshot.tasks.map(task => ({ taskId: task.taskId, state: task.state, reason: task.stateReason, remaining: task.handoff.remaining, uncertainty: task.handoff.uncertainty, resumeFrom: task.handoff.resumeFrom, artifacts: task.artifacts, evidenceIds: task.evidence.map(e => e.evidenceId) })) };
}
