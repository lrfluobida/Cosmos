import { validateLedger, validateRun, validateTask } from '../contracts/index.ts';
import type { RunSnapshot } from './run-types.ts';

function timestamp(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** Reject corrupt committed data before constructing a controller or authorizing work. */
export function validateSnapshot(value: unknown): asserts value is RunSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid run snapshot.');
  const state = value as RunSnapshot;
  if (state.formatVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 1 || !Array.isArray(state.tasks) || !Array.isArray(state.requests) || !Array.isArray(state.events)) throw new Error('Invalid runtime snapshot format.');
  const stop = state.stopReason;
  if (stop !== null && (!stop || !['deadline', 'charge_overrun', 'manual'].includes(stop.code) || !timestamp(stop.at) || typeof stop.reason !== 'string' || !stop.reason.trim())) throw new Error('Invalid snapshot stop reason.');
  const ledgerIssues = validateLedger(state.ledger);
  // Billing facts can exceed an estimate. Preserve those facts only in a halted run.
  const acceptedOverrun = stop?.code === 'charge_overrun' && state.run?.state === 'waiting_user';
  const issues = [...validateRun(state.run), ...ledgerIssues.filter(issue => !(acceptedOverrun && ['budget_exceeded', 'allocation_exceeded'].includes(issue.code)))];
  if (issues.length) throw new Error(`Invalid run snapshot: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
  const { run, ledger } = state;
  if (stop && run.state !== 'waiting_user') throw new Error('Stopped snapshot must remain waiting_user.');
  if (run.ledgerId !== ledger.ledgerId || run.taskIds.length !== ledger.allocations.length || run.taskIds.some(id => !ledger.allocations.some(a => a.taskId === id))) throw new Error('Snapshot run and shared ledger identities do not match.');
  const reserved = ledger.entries.reduce((sum, e) => sum + e.reservedMicroCny, 0);
  const settled = ledger.entries.reduce((sum, e) => sum + e.settledMicroCny, 0);
  const unknown = ledger.entries.filter(e => e.unknown).map(e => e.requestId).sort();
  if (!Number.isSafeInteger(reserved + settled) || run.fees.reservedMicroCny !== reserved || run.fees.settledMicroCny !== settled || JSON.stringify([...run.fees.unknownRequestIds].sort()) !== JSON.stringify(unknown)) throw new Error('Snapshot fees do not reconcile with the shared ledger.');
  if (state.requests.length !== ledger.entries.length || new Set(state.requests.map(r => r.requestId)).size !== state.requests.length) throw new Error('Invalid snapshot request metadata.');
  for (const record of state.requests) {
    const entry = ledger.entries.find(e => e.requestId === record.requestId);
    if (!entry || (record.admittedAt !== null && !timestamp(record.admittedAt)) || (entry.status === 'unknown' && record.admittedAt === null)) throw new Error('Invalid snapshot admission record.');
  }
  if (new Set(state.tasks.map(task => task.taskId)).size !== state.tasks.length) throw new Error('Duplicate snapshot task.');
  for (const task of state.tasks) {
    const errors = validateTask(task);
    const allocation = ledger.allocations.find(a => a.taskId === task.taskId);
    if (errors.length || !allocation || task.runId !== run.runId || task.kind !== run.kind || task.specVersion !== run.specVersion || task.budget.ledgerId !== ledger.ledgerId || task.budget.allocationMicroCny !== allocation.amountMicroCny || task.budget.originalDeadlineAt !== run.originalDeadlineAt) throw new Error('Invalid snapshot task or task/run contract mismatch.');
  }
  const eventTypes = ['created', 'reserved', 'admitted', 'settled', 'unknown', 'cancelled', 'imported', 'budget_warning', 'stopped', 'task_saved', 'generation_activated'];
  if (!state.events.length || state.events[0].type !== 'created') throw new Error('Missing snapshot creation history.');
  state.events.forEach((event, i) => {
    if (!event || event.sequence !== i + 1 || !timestamp(event.at) || !eventTypes.includes(event.type) || typeof event.reason !== 'string' || (event.requestId !== null && !ledger.entries.some(entry => entry.requestId === event.requestId))) throw new Error('Invalid snapshot event history.');
  });
}
