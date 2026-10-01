import { access, open, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PiBudget } from '../../src/providers/pi.ts';
import type { RunController } from '../../src/runtime/run.ts';
import { PILOT_LIMITS } from './admission.ts';

export async function assertPilotNotStarted(ledgerRoot: string): Promise<void> {
  try { await access(join(ledgerRoot, 'cos10-pilot.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error('A prior COS-10 pilot origin exists; preserve its deadline and inspect its saved state before any continuation');
}

/** The caller holds the shared controller lock. Claim before the journal or first reservation. */
export async function claimPilotOrigin(ledgerRoot: string, origin: { root: string; startedAt: string; deadlineAt: string; platformHead: string }): Promise<void> {
  const file = await open(join(ledgerRoot, 'cos10-pilot.json'), 'wx');
  try { await file.writeFile(JSON.stringify(origin, null, 2) + '\n', 'utf8'); await file.sync(); }
  finally { await file.close(); }
}

/** A new pilot gets one write-once origin. A later process cannot reset it by rerunning this entry. */
export async function createPilotGuard(options: { root: string; controller: RunController; deadlineAt: string; maxRequests: number }) {
  const deadline = Date.parse(options.deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('Pilot deadline expired');
  if (!Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1 || options.maxRequests > PILOT_LIMITS.maxRequests) throw new Error('Invalid pilot request limit');
  const journal = { startedAt: new Date().toISOString(), deadlineAt: options.deadlineAt, maxRequests: options.maxRequests, requestIds: [] as string[] };
  const path = join(options.root, 'pilot-budget.json');
  await writeFile(path, JSON.stringify(journal, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('Pilot deadline cleanup reserve reached')), Math.max(0, deadline - Date.now() - 5000));
  const signal = AbortSignal.any([abort.signal, options.controller.signal]);
  let pending: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const result = pending.then(action); pending = result.catch(() => {}); return result;
  };
  return {
    signal, deadlineAt: options.deadlineAt,
    remainingMs() { signal.throwIfAborted(); const left = deadline - Date.now(); if (left <= 0) throw new Error('Pilot deadline reached'); return left; },
    close() { clearTimeout(timer); },
    wrap(budget: PiBudget): PiBudget {
      return {
        beforeRequest: request => serial(async () => {
          signal.throwIfAborted();
          if (Date.now() >= deadline) throw new Error('Pilot deadline reached');
          if (journal.requestIds.length >= journal.maxRequests) throw new Error('Pilot request limit reached');
          if (journal.requestIds.includes(request.requestId)) throw new Error('Duplicate pilot request');
          const snapshot = await options.controller.read();
          if (snapshot.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) throw new Error('Reconcile existing request before serial pilot admission');
          const committed = snapshot.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
          if (committed + request.estimatedMaxCostMicroCny > PILOT_LIMITS.cumulativeMicroCny) throw new Error('Pilot cumulative budget cap reached');
          journal.requestIds.push(request.requestId);
          const temporary = `${path}.tmp`;
          await writeFile(temporary, JSON.stringify(journal, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
          await rename(temporary, path);
          await budget.beforeRequest(request);
        }),
        afterResponse: response => serial(() => budget.afterResponse(response)),
      };
    },
  };
}
export type PilotGuard = Awaited<ReturnType<typeof createPilotGuard>>;
