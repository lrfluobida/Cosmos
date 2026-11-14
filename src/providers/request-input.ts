import { isDeepStrictEqual } from 'node:util';
import type { Context } from '@earendil-works/pi-ai';

/** Omit only identical repeated reads for a feedback coder. Distinct files/pages and
 * observations across writes or errors stay visible; the native journal stays intact. */
export function withRecentReadResults(context: Context): Context {
  const reads = new Map<string, Record<string, unknown>>();
  const previous: { index: number; args: Record<string, unknown>; text: string }[] = [];
  const messages = [...context.messages];
  for (const [index, message] of context.messages.entries()) {
    if (message.role !== 'toolResult') {
      reads.clear();
      if (message.role === 'assistant') {
        // Even a failed write or an unknown tool can separate different observations.
        if (message.content.some(call => call.type === 'toolCall' && call.name !== 'read')) previous.length = 0;
        for (const call of message.content) {
          if (call.type === 'toolCall' && call.name === 'read' && typeof call.arguments?.path === 'string') reads.set(call.id, call.arguments);
        }
      }
      continue;
    }
    const args = reads.get(message.toolCallId);
    const [block] = message.content;
    if (!args || message.toolName !== 'read' || message.isError || message.content.length !== 1 || block.type !== 'text') {
      previous.length = 0;
      continue;
    }
    const match = previous.findIndex(item => isDeepStrictEqual(item.args, args));
    if (match !== -1) {
      const [item] = previous.splice(match, 1), earlier = context.messages[item.index];
      if (item.text === block.text && earlier.role === 'toolResult') messages[item.index] = { ...earlier,
        content: [{ type: 'text', text: '[Earlier identical read output omitted; the later matching read retains the complete text.]' }] };
    }
    previous.push({ index, args, text: block.text });
  }
  return { ...context, messages };
}

/** Quote a copy without unsent tool metadata; retain the full context for identity and dispatch. */
export function requestInputBytes(context: Context): number {
  const messages = context.messages.map(message => {
    if (message.role !== 'toolResult') return message;
    const { details: _details, ...quoted } = message;
    return quoted;
  });
  return Buffer.byteLength(JSON.stringify({ ...context, messages }));
}
