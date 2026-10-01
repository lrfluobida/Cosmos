import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { lstat, rename, unlink, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { regularFile } from '../artifacts/paths.ts';
import { budgetSummary } from '../contracts/index.ts';
import { validateIntakeSnapshot } from '../runtime/intake.ts';
import type { IntakeSnapshot } from '../runtime/intake.ts';
import { validateSnapshot } from '../runtime/run-validation.ts';
import type { RunSnapshot } from '../runtime/run-types.ts';
import { SnapshotStore } from '../runtime/store.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';

/** Reuses the durable warning event; notification state never changes the ledger. */
export async function startBudgetWarnings(root: string, notify: (message: string) => void, intervalMs = 1000) {
  let closed = false, active: Promise<void> | undefined;
  const tick = async () => {
    const snapshot = await readRunSnapshot(root), warning = snapshot.events.find(event => event.type === 'budget_warning');
    if (!warning) return;
    const path = join(root, 'cli-budget-warning.json');
    try { await publishReceipt(path, { runId: snapshot.run.runId, ledgerId: snapshot.ledger.ledgerId, eventSequence: warning.sequence }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return; throw error; }
    const summary = budgetSummary(snapshot.ledger);
    notify(`费用提示：已结算与预留合计达到 80%；当前剩余额度 ¥${(summary.availableMicroCny / 1_000_000).toFixed(6)}，总上限 ¥${(snapshot.ledger.limitMicroCny / 1_000_000).toFixed(2)}。`);
  };
  await tick();
  const timer = setInterval(() => {
    if (closed || active) return;
    active = tick().catch(() => {}).finally(() => { active = undefined; });
  }, intervalMs); timer.unref();
  return { async close() { closed = true; clearInterval(timer); await active; } };
}

export async function recoverRunOwner(root: string): Promise<void> {
  const lock = await lstat(join(root, '.controller.lock')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (lock) await SnapshotStore.recover(root);
}

export async function readRunSnapshot(root: string): Promise<IntakeSnapshot | RunSnapshot> {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(resolve(root), 'snapshot.json')));
  if (value.formatVersion === 'intake-1') validateIntakeSnapshot(value); else validateSnapshot(value);
  return value;
}
/** Read-only status never opens a writer, reconciles charges or updates a deadline. */
export async function readRunStatus(root: string) {
  const snapshot = await readRunSnapshot(root), intake = snapshot.formatVersion === 'intake-1';
  const generated = intake ? null : snapshot as RunSnapshot;
  const continuation = generated ? await readContinuationStatus(root, generated) : null;
  return { runId: snapshot.run.runId, ledgerId: snapshot.ledger.ledgerId, phase: intake ? 'intake' : 'generation', revision: snapshot.revision,
    draftRevision: intake ? snapshot.draft?.revision ?? null : null,
    confirmed: intake ? snapshot.confirmation !== null : generated!.run.humanDecisions.some(decision => decision.decisionId.startsWith('requirements-v') && decision.evidence.some(ref => ref.artifactId === 'user-confirmation')),
    originalStartedAt: generated?.run.originalStartedAt ?? null, originalDeadlineAt: generated?.run.originalDeadlineAt ?? null,
    state: generated?.run.state ?? (snapshot.stopReason ? 'waiting_user' : 'intake'), stopped: snapshot.stopReason !== null, stopReason: snapshot.stopReason,
    expired: generated ? Date.now() >= Date.parse(generated.run.originalDeadlineAt) : false,
    limitMicroCny: snapshot.ledger.limitMicroCny, ...budgetSummary(snapshot.ledger),
    settledMicroCny: snapshot.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0),
    reservedMicroCny: snapshot.ledger.entries.reduce((sum, entry) => sum + entry.reservedMicroCny, 0),
    unknownRequestIds: snapshot.ledger.entries.filter(entry => entry.unknown).map(entry => entry.requestId),
    tasks: generated?.tasks.map(task => ({ taskId: task.taskId, state: task.state, remaining: task.handoff.remaining, uncertainty: task.handoff.uncertainty, resumeFrom: task.handoff.resumeFrom,
      supersededBy: continuation?.state === 'registered' ? continuation.replacements.find(item => item.sourceTaskId === task.taskId)?.replacementTaskId ?? null : null })) ?? [],
    continuation,
    resumePolicy: 'Only verifiable interruptions without a durable stop may resume within their original window. Manual stop, deadline and budget stop remain final.',
  };
}
/** Display-only lineage. Execution separately validates contracts, origins and evidence. */
async function readContinuationStatus(root: string, snapshot: RunSnapshot) {
  try {
    const plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, 'repair-plan.json')));
    const replacements: { sourceTaskId: string; replacementTaskId: string }[] = plan.formatVersion === 2 ? plan.replacements : [{ sourceTaskId: plan.sourceTaskId, replacementTaskId: plan.replacementTaskId }];
    if (!Array.isArray(replacements) || !replacements.length || replacements.length > 3 || !Array.isArray(plan.tasks)
      || plan.formatVersion !== undefined && plan.formatVersion !== 2
      || plan.formatVersion === 2 && (plan.runId !== snapshot.run.runId || plan.ledgerId !== snapshot.ledger.ledgerId || plan.originalStartedAt !== snapshot.run.originalStartedAt
        || plan.originalDeadlineAt !== snapshot.run.originalDeadlineAt || plan.limitMicroCny !== snapshot.ledger.limitMicroCny)
      || replacements.some(item => !snapshot.tasks.some(task => task.taskId === item.sourceTaskId) || !plan.tasks.some((task: any) => task.task?.taskId === item.replacementTaskId))) throw new Error('Invalid lineage');
    const count = replacements.filter(item => snapshot.tasks.some(task => task.taskId === item.replacementTaskId)).length;
    return { state: count === replacements.length ? 'registered' : count ? 'blocked' : 'pending_registration', replacements };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return { state: 'blocked', replacements: [] as { sourceTaskId: string; replacementTaskId: string }[] };
  }
}
interface ControlRecord { formatVersion: 1; runId: string; token: string; endpoint: string }
async function record(root: string): Promise<ControlRecord> {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, 'cli-control.json')));
    if (value.formatVersion !== 1 || typeof value.runId !== 'string' || !/^[\da-f-]{36}$/.test(value.token)
      || value.endpoint !== endpoint(value.token)) throw new Error('Invalid control record');
    return value;
  } catch { throw new Error('No active owner control channel; inspect status and use crash recovery when eligible.'); }
}
const endpoint = (token: string) => process.platform === 'win32' ? `\\\\.\\pipe\\cosmos-${token}` : join(tmpdir(), `cosmos-${token}.sock`);

/** Call only while this host owns the run controller. The author never receives this channel. */
export async function startControl(root: string, runId: string, stopAndDrain: () => Promise<void>) {
  root = resolve(root);
  const value: ControlRecord = { formatVersion: 1, runId, token: randomUUID(), endpoint: '' }; value.endpoint = endpoint(value.token);
  const server = createServer(socket => {
    socket.setEncoding('utf8'); socket.setTimeout(5000, () => socket.destroy());
    let input = '', handled = false;
    socket.on('error', () => {});
    socket.on('data', part => {
      input += part;
      if (input.length > 4096) { socket.destroy(); return; }
      if (handled || !input.includes('\n')) return;
      handled = true;
      void (async () => {
        try {
          const message = JSON.parse(input);
          if (message.runId !== runId || message.token !== value.token || message.command !== 'stop') throw new Error('Invalid control identity.');
          socket.setTimeout(0);
          await stopAndDrain();
          const state = await readRunStatus(root);
          if (!state.stopped) throw new Error('Stop did not become durable.');
          socket.end(JSON.stringify({ runId, stopped: true }) + '\n');
        } catch { socket.end(JSON.stringify({ error: 'Stop or drain is unconfirmed; inspect the original run.' }) + '\n'); }
      })();
    });
  });
  server.listen(value.endpoint); await once(server, 'listening');
  const temporary = join(root, `.cli-control-${value.token}.tmp`);
  try { await writeFile(temporary, JSON.stringify(value) + '\n', { encoding: 'utf8', flag: 'wx' }); await rename(temporary, join(root, 'cli-control.json')); }
  catch (error) { server.close(); await unlink(temporary).catch(() => {}); throw error; }
  return { async close() {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    const current = await record(root).catch(() => null);
    if (current?.token === value.token) await unlink(join(root, 'cli-control.json'));
  } };
}

export async function requestStop(root: string): Promise<{ runId: string; stopped: true }> {
  root = resolve(root);
  const current = await record(root), snapshot = await readRunSnapshot(root);
  if (current.runId !== snapshot.run.runId) throw new Error('Control channel belongs to another run.');
  return new Promise((accept, reject) => {
    const socket = createConnection(current.endpoint); socket.setEncoding('utf8'); let output = '';
    const timeout = setTimeout(() => socket.destroy(new Error('Stop drain is unconfirmed; owner did not acknowledge.')), 15000);
    socket.on('connect', () => socket.write(JSON.stringify({ command: 'stop', runId: current.runId, token: current.token }) + '\n'));
    socket.on('data', part => { output += part; if (output.length > 4096) socket.destroy(new Error('Invalid control response.')); });
    socket.on('error', () => { clearTimeout(timeout); reject(new Error('Stop or drain is unconfirmed; no active owner acknowledgement.')); });
    socket.on('end', () => {
      clearTimeout(timeout);
      try { const result = JSON.parse(output); if (result.runId !== current.runId || result.stopped !== true) throw new Error('Unconfirmed stop or drain.'); accept(result); }
      catch { reject(new Error('Stop or drain is unconfirmed; inspect the original run.')); }
    });
  });
}
