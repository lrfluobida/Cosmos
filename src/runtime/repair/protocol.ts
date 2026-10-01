import type { ImageContent } from '@earendil-works/pi-ai';
import { open } from 'node:fs/promises';
import type { CreatedRole } from '../../roles/factory.ts';
import type { RunController } from '../run.ts';
import { executionWindowView } from '../execution-window.ts';

export class ReviewProtocolError extends Error {
  constructor() { super('Independent review did not return a valid fixed-version proposal.'); }
}

export interface ReviewCorrectionRecord {
  formatVersion: 1; taskId: string; attemptId: string;
  reviewerId: string; contextId: string; used: 1; recordedAt: string;
}

export function validateProtocolCorrections(value: unknown): asserts value is 0 | 1 {
  if (value !== 0 && value !== 1) throw new Error('Review protocol corrections must be 0 or 1.');
}

const correction = 'Your previous response did not satisfy the fixed review JSON protocol. Return only {verdict:"approved"|"changes_requested",inputVersions:all fixed packet inputs,evidenceIds:recorded host evidence IDs,findings:string[]}. findings contains only unresolved actionable defects, not positive observations or a review summary. If you independently conclude there are no unresolved defects, approved requires findings:[]. If defects remain, use changes_requested with nonempty findings. Preserve the exact fixed versions and evidence IDs. Do not change requirements, reinterpret failed host evidence, or remove a genuine defect to obtain approval. This is the only protocol correction allowed.';

/** Correct only a parse failure, inside the existing live native session. The
 * session retains both answers and applies its normal request admission hooks. */
export async function requestReview<T>(options: {
  reviewer: CreatedRole; controller: RunController; taskId: string;
  attemptId: string; correctionRecordPath: string;
  prompt: string; images?: ImageContent[]; signal: AbortSignal;
  maxCorrections: 0 | 1; parse: (text: string) => T; now?: () => number;
}): Promise<T> {
  validateProtocolCorrections(options.maxCorrections);
  for (let response = 0; response <= options.maxCorrections; response++) {
    options.signal.throwIfAborted();
    if (response > 0) {
      const state = await options.controller.read();
      const authority = await options.controller.executionAuthority(options.taskId), active = executionWindowView(state).executionWindow;
      const used = state.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
      const taskUsed = state.ledger.entries.filter(entry => entry.taskId === options.taskId).reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
      const allocation = state.ledger.allocations.find(entry => entry.taskId === options.taskId);
      if (!authority.admissionAllowed || active.stopReason || active.state !== 'running'
        || Date.parse(authority.deadlineAt) <= (options.now ?? Date.now)()
        || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)
        || used >= authority.effectiveLimitMicroCny || !allocation || taskUsed >= authority.taskGrantMicroCny) throw new ReviewProtocolError();
      const record: ReviewCorrectionRecord = { formatVersion: 1, taskId: options.taskId, attemptId: options.attemptId,
        reviewerId: options.reviewer.actorId, contextId: options.reviewer.contextId, used: 1,
        recordedAt: new Date((options.now ?? Date.now)()).toISOString() };
      // Existing or partial records consume the slot. Persist before any possible
      // dispatch so a later recovery cannot grant another correction for free.
      const file = await open(options.correctionRecordPath, 'wx');
      try { await file.writeFile(JSON.stringify(record, null, 2) + '\n', 'utf8'); await file.sync(); }
      finally { await file.close(); }
    }
    options.signal.throwIfAborted();
    // Provider/timeout/admission failures are not parse failures and never retry here.
    const answer = await options.reviewer.prompt(response === 0 ? options.prompt : correction, { signal: options.signal, ...(response === 0 && options.images ? { images: options.images } : {}) });
    options.signal.throwIfAborted();
    try { return options.parse(answer.text); }
    catch { if (response === options.maxCorrections) throw new ReviewProtocolError(); }
  }
  throw new ReviewProtocolError();
}
