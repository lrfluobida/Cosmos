import type { Context } from '@earendil-works/pi-ai';

/** Quote a copy without unsent tool metadata; retain the full context for identity and dispatch. */
export function requestInputBytes(context: Context): number {
  const messages = context.messages.map(message => {
    if (message.role !== 'toolResult') return message;
    const { details: _details, ...quoted } = message;
    return quoted;
  });
  return Buffer.byteLength(JSON.stringify({ ...context, messages }));
}
