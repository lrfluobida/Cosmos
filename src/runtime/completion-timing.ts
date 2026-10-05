import { lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArtifactReference } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { readRunSnapshot } from '../cli/control.ts';
import type { RunSnapshot } from './run-types.ts';
import type { RunController } from './run.ts';
import type { OwnedWork } from './recovery/owned-work.ts';
import { idleHash, requireNoRegistryWriter } from './window-idle.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { bounded } from '../acceptance/deadline.ts';
import { codingInputSignature } from './coding-check-worker.ts';
import { createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
export interface CompletionBinding {
  runId: string; ledgerId: string; windowId: string | null; originalStartedAt: string; originalDeadlineAt: string; startedAt: string; deadlineAt: string;
  report: { ref: ArtifactReference; sha256: string; reportedAt: string } | null; candidate: unknown; taskProofs: unknown[];
  candidateSignature: string | null;
  resources: string[];
  verificationKey: string;
}
export interface ClosedCompletionProof { state: RunSnapshot; snapshotBytes: Buffer; nonce: string }
export interface CleanupResult { name: string; outcome: 'closed' | 'failed'; error?: string }
const taskProofs = (state: RunSnapshot, ids: string[]) => ids.map(id => state.tasks.find(task => task.taskId === id)).map(task => task
  ? { taskId: task.taskId, attemptId: task.attempts.at(-1)?.attemptId ?? null, artifacts: task.artifacts, review: task.review } : null);
const scope = (state: RunSnapshot) => {
  const window = state.continuation?.windows.find(item => item.windowId === state.continuation?.currentWindowId);
  return { runId: state.run.runId, ledgerId: state.ledger.ledgerId, windowId: window?.windowId ?? null,
    originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt,
    startedAt: window?.startedAt ?? state.run.originalStartedAt, deadlineAt: window?.deadlineAt ?? state.run.originalDeadlineAt };
};
const stopReason = (state: RunSnapshot) => state.formatVersion === 2
  ? state.continuation!.windows.find(window => window.windowId === state.continuation!.currentWindowId)!.stopReason : state.stopReason;
async function currentReport(root: string) {
  return (await import('./experience.ts')).readAutomaticReport(root);
}
async function capture(root: string, state: RunSnapshot, published?: string, resources: string[] = [], verificationKey = ''): Promise<CompletionBinding> {
  const binding: CompletionBinding = { ...scope(state), report: null, candidate: null, candidateSignature: null, taskProofs: [], resources, verificationKey };
  if (!published) return binding;
  const { marker, report } = await currentReport(root);
  if (published !== marker.report.location || report.runId !== binding.runId || report.ledgerId !== binding.ledgerId || report.windowId !== binding.windowId || report.requiresCompletionTiming !== true) throw new Error('Completion publication belongs to another run or window.');
  return { ...binding, report: { ref: marker.report, sha256: marker.sha256, reportedAt: report.reportedAt }, candidate: report.acceptedCandidate ?? null,
    candidateSignature: report.acceptedCandidate ? await codingInputSignature(root, [report.acceptedCandidate.candidateRef.location]) : null, taskProofs: report.effectiveTasks };
}
const absent = async (root: string, name: string) => !await lstat(await safePath(root, name)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
async function stable(root: string, binding: CompletionBinding, snapshotBytes: Buffer, allowExperienceOwner = false) {
  if (!allowExperienceOwner && (!await absent(root, '.controller.lock') || !await absent(root, 'registry/.commit.lock'))) throw new Error('Completion owner or registry writer is active.');
  if (!snapshotBytes.equals(await regularFile(root, 'snapshot.json'))) throw new Error('Closed completion snapshot changed.');
  const state = await readRunSnapshot(root); if (state.formatVersion === 'intake-1' || !sameValue(scope(state), scopeFromBinding(binding))) throw new Error('Completion scope changed.');
  if (binding.report) {
    const { marker, report } = await currentReport(root);
    if (!sameValue(marker.report, binding.report.ref) || marker.sha256 !== binding.report.sha256 || !sameValue(report.acceptedCandidate ?? null, binding.candidate)
      || !sameValue(report.effectiveTasks, binding.taskProofs) || !sameValue(taskProofs(state, report.effectiveTasks.map((item: any) => item.taskId)), binding.taskProofs)) throw new Error('Completion report, candidate or task proofs changed.');
    if (binding.candidate) {
      const { ArtifactRegistry } = await import('../artifacts/index.ts');
      if (!sameValue(await new ArtifactRegistry(root, 'registry').current(), binding.candidate)) throw new Error('Completion candidate version changed.');
      if (await codingInputSignature(root, [(binding.candidate as any).candidateRef.location]) !== binding.candidateSignature) throw new Error('Completion package bytes changed.');
    }
  }
}
const scopeFromBinding = ({ report: _report, candidate: _candidate, candidateSignature: _signature, taskProofs: _proofs, resources: _resources, verificationKey: _key, ...value }: CompletionBinding) => value;
function receiptAuthentic(bytes: Buffer, value: any, digest: any): boolean {
  return digest.sha256 === idleHash(bytes) && sameValue(digest.binding, value.binding) && typeof digest.signature === 'string'
    && verify(null, bytes, createPublicKey({ key: Buffer.from(value.binding.verificationKey, 'base64'), format: 'der', type: 'spki' }), Buffer.from(digest.signature, 'base64'));
}
function grade(start: string, deadline: string, end: string | null) {
  const a = Date.parse(start), b = Date.parse(deadline), c = end === null ? NaN : Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && b > a && c >= a
    ? { status: c <= b ? 'in_time' as const : 'late' as const, startedAt: start, deadlineAt: deadline, endedAt: end, elapsedMs: c - a }
    : { status: 'unconfirmed' as const, startedAt: start, deadlineAt: deadline, endedAt: null, elapsedMs: null };
}

/** Additional windows reuse a proven initial endpoint, never their own end as its score. */
async function originalGrade(root: string, state: RunSnapshot, binding: CompletionBinding, end: string | null) {
  if (!binding.windowId) return grade(binding.originalStartedAt, binding.originalDeadlineAt, end);
  const unverified = { status: 'unverified', startedAt: binding.originalStartedAt, deadlineAt: binding.originalDeadlineAt, endedAt: null, elapsedMs: null };
  const names = await readdir(await safePath(root, 'delivery')).catch(() => []);
  const originals: unknown[] = [];
  for (const name of names.filter(name => /^completion-[a-f0-9-]{36}\.json$/.test(name))) {
    const bytes = await regularFile(root, `delivery/${name}`), value = decode(bytes);
    if (value.binding?.windowId !== null || value.binding?.runId !== binding.runId || value.binding?.ledgerId !== binding.ledgerId) continue;
    try {
      const digest = decode(await regularFile(root, `delivery/${name}.sha256.json`)), anchor = state.events.find(event => event.sequence === value.anchorSequence), reason = JSON.parse(anchor?.reason ?? '{}');
      const report = value.binding.report, reported = await regularFile(root, report.ref.location);
      if (!receiptAuthentic(bytes, value, digest) || anchor?.type !== 'run_owner_drained'
        || reason.completionSha256 !== idleHash(JSON.stringify(value.binding)) || reason.nonceSha256 !== idleHash(value.nonce ?? '')
        || value.binding.originalStartedAt !== binding.originalStartedAt || value.binding.originalDeadlineAt !== binding.originalDeadlineAt
        || report.sha256 !== idleHash(reported) || decode(reported).requiresCompletionTiming !== true) throw new Error('Initial completion proof changed.');
      if (value.binding.candidate && await codingInputSignature(root, [value.binding.candidate.candidateRef.location]) !== value.binding.candidateSignature) throw new Error('Initial package bytes changed.');
      if (value.cleanup.every((result: CleanupResult) => result.outcome === 'closed') && sameValue(value.current, grade(binding.originalStartedAt, binding.originalDeadlineAt, value.observedAt))) originals.push(value.current);
    } catch { return unverified; }
  }
  return originals.length === 1 ? originals[0] : unverified;
}

/** Runs after report publication; all cleanup steps are attempted before owner release. */
export async function finishCompletion(input: { root: string; controller: RunController; work: OwnedWork; published?: string; cleanup: { name: string; close(): Promise<unknown> }[] }) {
  const cleanupStarted = Date.now();
  // This one invocation alone can sign its post-close endpoint. Only its public key is persisted.
  const keys = generateKeyPairSync('ed25519'), verificationKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const results: CleanupResult[] = []; let proof: ClosedCompletionProof | undefined, binding: CompletionBinding | undefined;
  const attempt = async (name: string, close: () => Promise<unknown>, resource = false) => {
    try { await (resource ? bounded(close, 5000, `Completion ${name}`) : close()); results.push({ name, outcome: 'closed' }); } catch (error) { results.push({ name, outcome: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  };
  try { binding = await capture(input.root, await input.controller.read(), input.published, input.cleanup.map(item => item.name), verificationKey); }
  catch (error) {
    results.push({ name: 'report-binding', outcome: 'failed', error: error instanceof Error ? error.message : String(error) });
    try { binding = await capture(input.root, await input.controller.read(), undefined, input.cleanup.map(item => item.name), verificationKey); } catch {}
  }
  for (const resource of input.cleanup) await attempt(resource.name, resource.close, true);
  await attempt('owner-drain', async () => { if (!binding) throw new Error('Completion binding was not established.'); proof = await input.controller.closeForCompletion(input.work, binding); });
  if (!proof) { await attempt('owned-work-fallback', () => input.work.cancelAndDrain('Completion fallback cleanup')); await attempt('owner-close-fallback', () => input.controller.close()); }
  const now = Date.now(), observedAt = Number.isSafeInteger(now) && Math.abs(now) <= 8.64e15 ? new Date(now).toISOString() : null;
  if (!binding) return { required: true, current: { status: 'unconfirmed', endedAt: null, elapsedMs: null }, reason: 'Completion binding is unavailable.', cleanup: results };
  let confirmed = !!proof && !!binding.report && !!observedAt && !results.some(result => result.outcome === 'failed') && now >= cleanupStarted
    && Date.parse(observedAt) >= Date.parse(binding.report.reportedAt) && Date.parse(observedAt) >= Date.parse(proof.state.events.at(-1)!.at);
  if (proof && confirmed) try { await stable(input.root, binding, proof.snapshotBytes); } catch (error) { confirmed = false; results.push({ name: 'closed-binding', outcome: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  const state = proof?.state ?? await readRunSnapshot(input.root), anchor = proof?.state.events.at(-1), file = binding.report ? `delivery/completion-${binding.report.ref.version}.json` : `delivery/completion-unreported-${state.revision}.json`;
  const value = { formatVersion: 'completion-timing/1', binding, snapshotSha256: idleHash(proof?.snapshotBytes ?? await regularFile(input.root, 'snapshot.json')),
    anchorSequence: anchor?.sequence ?? null, nonce: proof?.nonce ?? null, cleanup: results, cleanupStarted, observedAt,
    current: grade(binding.startedAt, binding.deadlineAt, confirmed ? observedAt : null), original: await originalGrade(input.root, state as RunSnapshot, binding, confirmed ? observedAt : null),
    charges: state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny) ? 'unreconciled' : 'settled', stopReason: stopReason(state as RunSnapshot), eligible: false };
  value.eligible = value.current.status === 'in_time' && value.charges === 'settled' && !value.stopReason;
  try {
    await mkdir(join(input.root, dirname(file)), { recursive: true }); await publishReceipt(await safePath(input.root, file), value);
    const bytes = await regularFile(input.root, file);
    await publishReceipt(await safePath(input.root, `${file}.sha256.json`), { sha256: idleHash(bytes), binding, signature: sign(null, bytes, keys.privateKey).toString('base64') });
    if (proof) await stable(input.root, binding, proof.snapshotBytes);
  } catch (error) { return { required: true, current: { status: 'unconfirmed', endedAt: null, elapsedMs: null }, reason: error instanceof Error ? error.message : String(error), cleanup: results }; }
  return { required: true, ...value };
}

/** Fixed evidence only: reading cannot invent an endpoint or reopen execution. */
export async function readCompletionTiming(root: string, allowExperienceOwner = false): Promise<any> {
  const { marker, report } = await currentReport(root);
  const original = await readRunSnapshot(root), windowId = original.formatVersion === 2 ? original.continuation!.currentWindowId : null;
  const anchoredTiming = original.events.some(event => {
    if (!['run_owner_drained', 'window_owner_drained'].includes(event.type)) return false;
    try { const value = JSON.parse(event.reason); return value.windowId === windowId && typeof value.completionSha256 === 'string'; } catch { return false; }
  });
  if (report.requiresCompletionTiming === undefined && !anchoredTiming) return { required: false, current: { status: 'unverified', endedAt: null, elapsedMs: null }, original: { status: 'unverified', endedAt: null, elapsedMs: null } };
  const unconfirmed = (reason: string) => ({ required: true, current: { status: 'unconfirmed', endedAt: null, elapsedMs: null }, original: { status: 'unconfirmed', endedAt: null, elapsedMs: null }, reason });
  try {
    if (report.requiresCompletionTiming !== true) throw new Error('Invalid trusted completion requirement.');
    const file = `delivery/completion-${marker.report.version}.json`, bytes = await regularFile(root, file), value = decode(bytes), digest = decode(await regularFile(root, `${file}.sha256.json`));
    const snapshotBytes = await regularFile(root, 'snapshot.json'), state = await readRunSnapshot(root);
    if (state.formatVersion === 'intake-1' || value.formatVersion !== 'completion-timing/1' || value.snapshotSha256 !== idleHash(snapshotBytes)
      || !receiptAuthentic(bytes, value, digest)) throw new Error('Completion sidecar or snapshot bytes changed.');
    const expected = await capture(root, state, marker.report.location, value.binding?.resources, value.binding?.verificationKey);
    if (!sameValue(value.binding, expected)) throw new Error('Completion sidecar binding changed.');
    await stable(root, expected, snapshotBytes, allowExperienceOwner);
    const anchor = state.events.find(event => event.sequence === value.anchorSequence), reason = JSON.parse(anchor?.reason ?? '{}');
    if (!['run_owner_drained', 'window_owner_drained'].includes(anchor?.type ?? '') || reason.windowId !== expected.windowId || reason.nonceSha256 !== idleHash(value.nonce ?? '')
      || reason.completionSha256 !== idleHash(JSON.stringify(expected))) throw new Error('Completion owner-close anchor is unproven.');
    const charges = state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny) ? 'unreconciled' : 'settled';
    if (!Array.isArray(expected.resources) || !Array.isArray(value.cleanup) || value.charges !== charges
      || [...expected.resources, 'owner-drain'].some(name => value.cleanup.filter((result: CleanupResult) => result.name === name).length !== 1)) throw new Error('Completion resource or accounting facts changed.');
    const confirmed = value.cleanup.every((result: CleanupResult) => result.outcome === 'closed') && !!value.observedAt && Number.isFinite(value.cleanupStarted)
      && Date.parse(value.observedAt) >= value.cleanupStarted && Date.parse(value.observedAt) >= Date.parse(expected.report!.reportedAt) && Date.parse(value.observedAt) >= Date.parse(anchor!.at);
    if (!sameValue(value.current, grade(expected.startedAt, expected.deadlineAt, confirmed ? value.observedAt : null))
      || !sameValue(value.original, await originalGrade(root, state, expected, confirmed ? value.observedAt : null))) throw new Error('Completion endpoint or elapsed time changed.');
    if (!sameValue(value.stopReason, stopReason(state)) || value.eligible !== (value.current.status === 'in_time' && charges === 'settled' && !stopReason(state))) throw new Error('Completion stop or final eligibility changed.');
    return { required: true, ...value };
  } catch (error) { return unconfirmed(error instanceof Error ? error.message : String(error)); }
}
