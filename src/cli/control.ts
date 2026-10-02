import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { lstat, rename, unlink, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { budgetSummary } from '../contracts/index.ts';
import { validateIntakeSnapshot } from '../runtime/intake.ts';
import type { IntakeSnapshot } from '../runtime/intake.ts';
import { validateSnapshot } from '../runtime/run-validation.ts';
import type { RunSnapshot } from '../runtime/run-types.ts';
import { SnapshotStore } from '../runtime/store.ts';
import { RunController } from '../runtime/run.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';
import { executionWindowView } from '../runtime/execution-window.ts';

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

export async function recoverRunOwner(root: string): Promise<boolean> {
  const lock = await lstat(join(root, '.controller.lock')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!lock) return false;
  await SnapshotStore.recover(root); return true;
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
  const view = generated ? executionWindowView(generated) : null;
  const continuation = generated ? await readContinuationStatus(root, generated) : null;
  return { runId: snapshot.run.runId, ledgerId: snapshot.ledger.ledgerId, phase: intake ? 'intake' : 'generation', revision: snapshot.revision,
    draftRevision: intake ? snapshot.draft?.revision ?? null : null,
    confirmed: intake ? snapshot.confirmation !== null : generated!.run.humanDecisions.some(decision => decision.decisionId.startsWith('requirements-v') && decision.evidence.some(ref => ref.artifactId === 'user-confirmation')),
    originalStartedAt: generated?.run.originalStartedAt ?? null, originalDeadlineAt: generated?.run.originalDeadlineAt ?? null,
    state: view?.executionWindow.state ?? (snapshot.stopReason ? 'waiting_user' : 'intake'), stopped: (view?.executionWindow.stopReason ?? (view ? null : snapshot.stopReason)) !== null,
    stopReason: view ? view.executionWindow.stopReason : snapshot.stopReason,
    original: view?.original ?? null, executionWindow: view?.executionWindow ?? null,
    expired: view ? Date.now() >= Date.parse(view.executionWindow.deadlineAt) : false,
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
interface ControlRecord { formatVersion: 1 | 2; runId: string; token: string; endpoint: string; windowId?: string }
interface ControlAck { runId: string; stopped: true; windowId?: string }
class ControlUnavailable extends Error {}
function requireWindow(snapshot: IntakeSnapshot | RunSnapshot, windowId?: string): void {
  if (snapshot.formatVersion === 2) {
    if (!windowId || snapshot.continuation!.currentWindowId !== windowId) throw new Error('Stop requires the explicit current execution window.');
  } else if (windowId !== undefined) throw new Error('Original run does not have this execution window.');
}
function acknowledged(snapshot: IntakeSnapshot | RunSnapshot, windowId?: string): ControlAck {
  requireWindow(snapshot, windowId);
  const stop = snapshot.formatVersion === 2 ? executionWindowView(snapshot).executionWindow.stopReason : snapshot.stopReason;
  if (!stop) throw new Error('Stop did not become durable in the requested window.');
  return { runId: snapshot.run.runId, stopped: true, ...(windowId ? { windowId } : {}) };
}
async function record(root: string): Promise<ControlRecord | null> {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, 'cli-control.json')));
    if (![1, 2].includes(value.formatVersion) || typeof value.runId !== 'string' || !/^[\da-f-]{36}$/.test(value.token)
      || (value.formatVersion === 1 ? value.windowId !== undefined : typeof value.windowId !== 'string' || !value.windowId.trim())
      || value.endpoint !== endpoint(value.token)) throw new Error('Invalid control record');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('Invalid owner control channel; stop or drain is unconfirmed.');
  }
}
const endpoint = (token: string) => process.platform === 'win32' ? `\\\\.\\pipe\\cosmos-${token}` : join(tmpdir(), `cosmos-${token}.sock`);

/** Call only while this host owns the run controller. The author never receives this channel. */
export async function startControl(root: string, runId: string, stopAndDrain: () => Promise<void>, windowId?: string) {
  root = resolve(root);
  const snapshot = await readRunSnapshot(root); requireWindow(snapshot, windowId);
  if (snapshot.run.runId !== runId) throw new Error('Control channel belongs to another run.');
  const value: ControlRecord = { formatVersion: windowId ? 2 : 1, runId, token: randomUUID(), endpoint: '', ...(windowId ? { windowId } : {}) }; value.endpoint = endpoint(value.token);
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
          if (message.runId !== runId || message.token !== value.token || message.command !== 'stop' || message.windowId !== windowId) throw new Error('Invalid control identity or window.');
          const latest = await readRunSnapshot(root); requireWindow(latest, windowId);
          if (latest.run.runId !== runId) throw new Error('Control run identity changed.');
          socket.setTimeout(0);
          await stopAndDrain();
          const state = await readRunSnapshot(root);
          if (state.run.runId !== runId) throw new Error('Control run identity changed.');
          socket.end(JSON.stringify(acknowledged(state, windowId)) + '\n');
        } catch { socket.end(JSON.stringify({ ...(windowId ? { runId, windowId } : {}), error: 'Stop or drain is unconfirmed; inspect the requested run window.' }) + '\n'); }
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

async function stopRecoveredWindow(root: string, snapshot: RunSnapshot, windowId: string): Promise<ControlAck> {
  const registry = await lstat(await safePath(root, 'registry/.commit.lock')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (registry) throw new Error('Registry writer ownership is unresolved; stop or drain is unconfirmed.');
  if (!await recoverRunOwner(root)) throw new Error('Missing owner marker cannot prove writer quiescence; stop or drain is unconfirmed.');
  const current = await readRunSnapshot(root); requireWindow(current, windowId);
  if (current.run.runId !== snapshot.run.runId) throw new Error('Run identity changed before owner recovery.');
  const controller = await RunController.open({ root, windowId });
  try { await controller.stop('CLI user stopped the recovered execution window.'); return acknowledged(await controller.read(), windowId); }
  finally { await controller.close(); }
}

export async function requestStop(root: string, windowId?: string): Promise<ControlAck> {
  root = resolve(root);
  const snapshot = await readRunSnapshot(root); requireWindow(snapshot, windowId);
  const current = await record(root);
  if (!current) {
    if (snapshot.formatVersion === 2) return stopRecoveredWindow(root, snapshot, windowId!);
    throw new Error('No active owner control channel; inspect status and use crash recovery when eligible.');
  }
  if (current.runId !== snapshot.run.runId) throw new Error('Control channel belongs to another run.');
  if (current.windowId !== windowId) throw new Error('Control channel belongs to another execution window.');
  return new Promise<ControlAck>((accept, reject) => {
    const socket = createConnection(current.endpoint); socket.setEncoding('utf8'); let output = '', connected = false;
    const timeout = setTimeout(() => socket.destroy(new Error('Stop drain is unconfirmed; owner did not acknowledge.')), 15000);
    socket.on('connect', () => { connected = true; socket.write(JSON.stringify({ command: 'stop', runId: current.runId, token: current.token, ...(windowId ? { windowId } : {}) }) + '\n'); });
    socket.on('data', part => { output += part; if (output.length > 4096) socket.destroy(new Error('Invalid control response.')); });
    socket.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      reject(!connected && ['ENOENT', 'ECONNREFUSED'].includes(error.code ?? '') ? new ControlUnavailable('No active owner control channel.') : new Error('Stop or drain is unconfirmed; no active owner acknowledgement.'));
    });
    socket.on('end', () => {
      clearTimeout(timeout);
      try { const result = JSON.parse(output); if (result.runId !== current.runId || result.stopped !== true || result.windowId !== windowId) throw new Error('Unconfirmed stop or drain.'); accept(result); }
      catch { reject(new Error('Stop or drain is unconfirmed; inspect the original run.')); }
    });
  }).catch(error => {
    if (snapshot.formatVersion === 2 && error instanceof ControlUnavailable) return stopRecoveredWindow(root, snapshot, windowId!);
    throw error;
  });
}
