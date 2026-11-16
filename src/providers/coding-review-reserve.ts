import type { AgentSession } from '@earendil-works/pi-coding-agent';

export const codingReviewReserveGuidance = 'This review permits at most sixteen model response rounds. At most fourteen may use tools; the host reserves a tool-free decision and one possible format correction. Return a supported verdict earlier when ready. Prioritize fixed requirements and decisive evidence; continue partial selected details before claiming they were assessed.';
const honesty = 'Use only facts already inspected and the existing exact review schema. Preserve genuine unresolved concerns, defects and exact input/evidence identities. If current evidence supports requesting changes for an unresolved concern, explain that precise evidence gap without inventing an observed code defect. If you cannot independently support either verdict, state that review is incomplete and name the unassessed evidence; the host will keep the task incomplete. Never turn unread evidence into success or invent facts to obtain approval.';
export const codingReviewCorrectionGuidance = 'All tools are disabled. Correcting format grants no new evidence or work. ' + honesty;

/** Reserve a decision in the original native review, without deciding its content. */
export function installCodingReviewReserve(session: AgentSession, requestsLeft: () => number,
  fail: (code: string, message: string) => Error) {
  const previous = session.agent.finishTurn;
  let phase: 'fresh' | 'reading' | 'final' | 'returned' | 'correction' | 'done' = 'fresh';
  const disableTools = () => {
    if (session.getAllTools().some(tool => tool.exposure === 'codemode' || tool.exposure === 'deferred')) {
      throw fail('readonly_unavailable', 'Native tool registry cannot isolate the coding review decision.');
    }
    session.setActiveToolsByName([]);
    if (session.getActiveToolNames().length || session.getCallableToolNames().length) {
      throw fail('readonly_unavailable', 'Native tools remain callable during the coding review decision.');
    }
  };
  session.agent.finishTurn = async (turn, signal) => {
    const decision = await previous?.(turn, signal) ?? undefined;
    if (!['toolUse', 'stop'].includes(turn.message.stopReason)) return decision;
    const stop = turn.message.stopReason === 'stop' && !turn.toolResults.length
      && !turn.message.content.some(block => block.type === 'toolCall');
    if (phase === 'final' || phase === 'correction') {
      phase = phase === 'final' ? 'returned' : 'done';
      if (!stop) fail('incomplete', 'The coding review decision requires a completed tool-free response.');
      return { action: 'end' };
    }
    if (phase !== 'reading' || decision?.action === 'end') return decision;
    if (stop) { phase = 'returned'; return { action: 'end' }; }
    if (requestsLeft() > 2) return decision;
    try {
      signal?.throwIfAborted();
      phase = 'final';
      disableTools();
      await session.sendCustomMessage({ customType: 'cosmos-coding-review-decision', display: true,
        content: 'All tools are now disabled. Give your independent review result now. ' + honesty });
      signal?.throwIfAborted();
      return { action: 'continue' };
    } catch (error) {
      fail(signal?.aborted ? 'cancelled' : 'readonly_unavailable', error instanceof Error ? error.message : 'Cannot isolate the coding review decision.');
      return { action: 'end' };
    }
  };
  return {
    hasReturned: () => phase === 'returned',
    start() {
      if (phase !== 'fresh') throw fail('incomplete', 'The coding review cannot restart its original prompt.');
      phase = 'reading';
    },
    correct() {
      if (phase !== 'returned') throw fail('incomplete', 'The coding review permits one correction after its original response.');
      phase = 'correction';
      disableTools();
    },
  };
}
