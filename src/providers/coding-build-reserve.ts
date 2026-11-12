import { randomUUID } from 'node:crypto';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { decodeModelJson } from '../roles/protocol.ts';

type BuildFeedback = { passed: boolean; diagnostics: string };

export class MissingCodingEntryError extends Error {}

function buildFeedback(content: readonly { type: string; text?: string }[]): BuildFeedback {
  const value = content.length === 1 && content[0].type === 'text' && JSON.parse(content[0].text!);
  if (!value || typeof value.passed !== 'boolean' || typeof value.diagnostics !== 'string') throw new Error('Invalid coding build feedback.');
  return { passed: value.passed, diagnostics: value.diagnostics };
}

/** Finish the original coding attempt using the same scoped compiler and native request accounting. */
export function installCodingBuildReserve(session: AgentSession, requestsLeft: () => number, isReadonly: () => boolean,
  fail: (code: string, message: string) => Error) {
  const name = 'check-game-build', previous = session.agent.finishTurn;
  let build: BuildFeedback | undefined, closing = false, handoff = false;
  session.agent.finishTurn = async (turn, signal) => {
    const decision = await previous?.(turn, signal) ?? undefined;
    if (isReadonly() || !['toolUse', 'stop'].includes(turn.message.stopReason)) return decision;
    const stop = turn.message.stopReason === 'stop' && !turn.toolResults.length;
    if (handoff) {
      if (!stop) fail('incomplete', 'The coding handoff requires a completed tool-free response.');
      return { action: 'end' };
    }
    try {
      const changed = turn.toolResults.some(result => result.toolName === 'write' || result.toolName === 'edit');
      const checks = turn.toolResults.filter(result => result.toolName === name);
      const repairing = closing && build?.passed === false;
      // A check in a batch with a write may have observed the old bytes, regardless of result ordering.
      if (changed || checks.length > 1 || checks[0]?.isError) build = undefined;
      else if (checks.length) build = buildFeedback(checks[0].content);
      if (stop && build?.passed && !closing) return decision;
      const left = requestsLeft();
      if (!stop && left > 4 && !closing) return decision;
      if (closing && build && !changed && !checks.length && !stop && left > 1) return decision;
      const wasClosing = closing;
      closing = true;
      if (!build) {
        const tool = turn.context.tools?.find(tool => tool.name === name);
        if (!tool) throw new Error('Scoped coding build tool is unavailable.');
        signal?.throwIfAborted();
        try {
          const result = await tool.execute(randomUUID(), {}, signal);
          build = buildFeedback(result.content);
        } catch (error) {
          if (!(error instanceof MissingCodingEntryError)) throw error;
          build = { passed: false, diagnostics: error.message };
        }
        signal?.throwIfAborted();
      }
      handoff = left <= 1 || (stop && (build.passed || wasClosing)) || (repairing && build.passed);
      if (handoff) {
        session.setActiveToolsByName([]);
        if (session.getCallableToolNames().length) throw new Error('Native tools remain callable during the coding handoff.');
      }
      const instruction = handoff
        ? 'Return the final JSON {summary,remaining,uncertainty} now. Include every unresolved compiler or gameplay defect.'
        : 'Use the remaining editable rounds for the reported defects or unfinished required behavior. Read the affected lines and make focused edits. The host will check changed source again before your final JSON.';
      await session.sendCustomMessage({ customType: 'cosmos-current-coding-build', display: true,
        content: 'Current check-game-build feedback: ' + JSON.stringify(build) + '\n' + instruction });
      return { action: 'continue' };
    } catch (error) {
      fail(signal?.aborted ? 'cancelled' : 'coding_build_check', error instanceof Error ? error.message : 'Current coding build check failed.');
      return { action: 'end' };
    }
  };
  return (text: string) => {
    if (build?.passed !== false) return text;
    let proposal;
    try { proposal = decodeModelJson(text) as { remaining?: unknown; uncertainty?: unknown }; }
    catch { return text; } // The existing author protocol handles format errors and its single read-only correction.
    if (Array.isArray(proposal.remaining) && Array.isArray(proposal.uncertainty)
      && ![...proposal.remaining, ...proposal.uncertainty].some(value => typeof value === 'string' && value.trim())) {
      throw fail('coding_build_check', 'The author reported no unresolved work after a failed build: ' + build.diagnostics);
    }
    return text;
  };
}
