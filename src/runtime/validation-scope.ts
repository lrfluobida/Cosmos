import { createHash } from 'node:crypto';
import { sameValue } from '../contracts/validation.ts';
import { isValidationRequirement, validateExecutionRequirement } from '../roles/execution-input.ts';
import type { ExecutionRequirement, ValidationRequirement } from '../roles/execution-input.ts';
import type { RunController } from './run.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { currentValidationCase } from './validation-validation.ts';

export interface ValidationExecutionBinding {
  caseId: string; windowId: string;
  /** Trusted read-only host capability, like capture/verify. The public driver fixes this implementation. */
  readScope(signal: AbortSignal): Promise<{ requirement: ValidationRequirement; operatorReceipt: Uint8Array }>;
  /** Private source opt-in. Operator refs bind this exact digest; actual bytes are read at every scope gate. */
  historicalManifest?: { reference: ArtifactReference; readBytes(signal: AbortSignal): Promise<Uint8Array> };
}
export interface ValidationJournalBinding { caseId: string; windowId: string; quoteId: string; startedAt: string; deadlineAt: string }

/** Read complete scope and real operator receipt before any session, task or journal write. */
export async function requireValidationScope(controller: RunController, requirement: ExecutionRequirement, binding: ValidationExecutionBinding) {
  const { caseId, windowId, readScope } = binding;
  controller.requireValidationCase(caseId, windowId);
  if (!isValidationRequirement(requirement) || validateExecutionRequirement(requirement, 'operator_validation').length || typeof readScope !== 'function') throw new Error('Explicit validation requirement and trusted scope reader are required.');
  const before = await controller.read(), window = currentValidationCase(before), data = requirement.validation;
  const { sourceSha256, ...decision } = window.operatorDecision;
  if (data.runId !== before.run.runId || data.ledgerId !== before.ledger.ledgerId || data.caseId !== caseId || data.windowId !== windowId
    || requirement.specVersion !== before.run.specVersion || !sameValue(decision, data.decision)
    || data.reviewedPlatformSha !== window.quote.identity.reviewedPlatformSha || data.frozenCaseInputHash !== window.quote.identity.frozenCaseInputHash) throw new Error('Validation input differs from its current persistent case authority.');
  const timeout = Math.min(5000, Date.parse(window.deadlineAt) - Date.now() - 5000);
  if (timeout <= 0) throw new Error('Validation scope cannot finish inside the current case deadline.');
  const abort = new AbortController(), signal = AbortSignal.any([controller.signal, abort.signal]);
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(new Error('Validation scope check was cancelled or timed out.')); signal.addEventListener('abort', onAbort, { once: true }); });
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    signal.throwIfAborted();
    const observed = await Promise.race([Promise.resolve().then(() => readScope(signal)), cancelled]);
    signal.throwIfAborted();
    if (!observed || !sameValue(observed.requirement, requirement) || !(observed.operatorReceipt instanceof Uint8Array)
      || createHash('sha256').update(observed.operatorReceipt).digest('hex') !== sourceSha256) throw new Error('Fixed validation scope or actual operator source bytes changed.');
    const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(observed.operatorReceipt));
    if (!sameValue(receipt, { formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
      actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: window.quote })) throw new Error('Operator source does not bind this exact validation quote.');
    if (binding.historicalManifest) {
      const fixed = binding.historicalManifest;
      if (!/^[a-f0-9]{64}$/.test(fixed.reference.version) || !decision.sourceRefs.some(ref => sameValue(ref, fixed.reference))
        || typeof fixed.readBytes !== 'function') throw new Error('Historical manifest must use its exact operator-covered digest reference.');
      const bytes = await Promise.race([Promise.resolve().then(() => fixed.readBytes(signal)), cancelled]);
      if (!(bytes instanceof Uint8Array) || createHash('sha256').update(bytes).digest('hex') !== fixed.reference.version) throw new Error('Actual historical manifest bytes changed.');
    }
    controller.requireValidationCase(caseId, windowId);
    const snapshot = await controller.read();
    if (!sameValue(currentValidationCase(snapshot), window) || Date.now() >= Date.parse(window.deadlineAt) - 5000) throw new Error('Validation authority changed while reading fixed scope.');
    signal.throwIfAborted(); return { snapshot, window };
  } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); abort.abort(); }
}

export function validationJournalBinding(window: Awaited<ReturnType<typeof requireValidationScope>>['window']): ValidationJournalBinding {
  return { caseId: window.caseId, windowId: window.windowId, quoteId: window.quote.quoteId, startedAt: window.startedAt, deadlineAt: window.deadlineAt };
}
