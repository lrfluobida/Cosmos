import { access, open, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PiBudget } from '../../src/providers/pi.ts';
import type { RunController } from '../../src/runtime/run.ts';
import { isDeepStrictEqual } from 'node:util';
import { PILOT_LIMITS } from './admission.ts';
import { jsonFile } from './host.ts';
import { TRIAL } from './trial.ts';
import { STARTUP_DEADLINE } from './startup.ts';

export interface PilotJournal { startedAt: string; deadlineAt: string; maxRequests: number; requestIds: string[] }

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
  return activeGuard(options, journal);
}

/** Called only after the one-shot continuation gate validates marker, origin, ledger and exact old journal. */
export async function openPilotGuard(options: { root: string; ledgerRoot: string; controller: RunController; journal: PilotJournal }) {
  const current = await jsonFile(options.root, 'pilot-budget.json');
  if (!isDeepStrictEqual(current, options.journal)) throw new Error('Original pilot journal changed');
  const marker = await jsonFile(options.ledgerRoot, 'cos10-pilot.json'), origin = await jsonFile(options.root, 'origin.json');
  if (resolve(marker.root) !== resolve(options.root) || marker.startedAt !== origin.startedAt || marker.deadlineAt !== origin.deadlineAt || marker.deadlineAt !== current.deadlineAt
    || !isDeepStrictEqual(origin.limits, PILOT_LIMITS) || current.maxRequests !== PILOT_LIMITS.maxRequests) throw new Error('Original marker, deadline or limits changed');
  return activeGuard({ ...options, deadlineAt: current.deadlineAt, maxRequests: current.maxRequests }, structuredClone(current));
}

/** The one authorized bootstrap recovery reuses the exact original empty journal; it never writes a new clock/counter. */
export async function openZeroRequestTrialGuard(options: { root: string; ledgerRoot: string; controller: RunController; origin: any; journal: PilotJournal }) {
  const [origin, marker, journal, recovery] = await Promise.all([jsonFile(options.root, 'origin.json'), jsonFile(options.ledgerRoot, `${TRIAL.id}.json`),
    jsonFile(options.root, 'pilot-budget.json'), jsonFile(options.root, 'startup-recovery-origin.json')]);
  if (!isDeepStrictEqual(origin, options.origin) || !isDeepStrictEqual(origin, marker) || !isDeepStrictEqual(journal, options.journal)
    || !isDeepStrictEqual(origin.limits, TRIAL) || !isDeepStrictEqual(recovery.originalJournal, journal)
    || resolve(origin.root) !== resolve(options.root) || origin.deadlineAt !== STARTUP_DEADLINE || journal.deadlineAt !== STARTUP_DEADLINE
    || recovery.deadlineAt !== STARTUP_DEADLINE || journal.maxRequests !== 40 || journal.requestIds.length !== 0) throw new Error('Original zero-request trial identity or journal changed');
  return activeGuard({ ...options, deadlineAt: journal.deadlineAt, maxRequests: journal.maxRequests }, structuredClone(journal));
}

function activeGuard(options: { root: string; controller: RunController; deadlineAt: string; maxRequests: number }, journal: PilotJournal) {
  const deadline = Date.parse(options.deadlineAt), path = join(options.root, 'pilot-budget.json');
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('Pilot deadline expired');
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
