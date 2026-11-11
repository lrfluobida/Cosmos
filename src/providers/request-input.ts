import { resolve } from 'node:path';
import type { Context } from '@earendil-works/pi-ai';
import { within } from '../artifacts/paths.ts';

/** Project older file reads for an ordinary feedback coder. Keep the most recent read batch
 * and up to 12 KiB of earlier editable source, newest first. The native journal stays intact. */
export function withRecentReadResults(context: Context, workspace: string, writePaths: readonly string[]): Context {
  const writable = writePaths.map(path => resolve(workspace, path));
  const reads = new Map<string, string>();
  const older: { index: number; batch: number; path: string }[] = [];
  let batch = 0, latestRead = -1;
  for (const [index, message] of context.messages.entries()) {
    if (message.role !== 'toolResult') {
      reads.clear();
      if (message.role === 'assistant') {
        batch = index;
        for (const call of message.content) {
          if (call.type === 'toolCall' && call.name === 'read' && typeof call.arguments?.path === 'string') reads.set(call.id, call.arguments.path);
        }
      }
      continue;
    }
    const path = reads.get(message.toolCallId);
    if (!path || message.toolName !== 'read' || message.isError) continue;
    latestRead = batch;
    const [block] = message.content;
    if (message.content.length === 1 && block.type === 'text' && Buffer.byteLength(block.text) > 1024) older.push({ index, batch, path });
  }
  const messages = [...context.messages];
  let sourceBytes = 12 * 1024;
  for (const item of older.reverse()) {
    const message = context.messages[item.index];
    if (item.batch === latestRead || message.role !== 'toolResult') continue;
    const bytes = Buffer.byteLength(JSON.stringify(message.content));
    if (bytes <= sourceBytes && writable.some(root => within(root, resolve(workspace, item.path)))) {
      sourceBytes -= bytes;
      continue;
    }
    messages[item.index] = { ...message, content: [{ type: 'text', text: '[Earlier read output omitted. Use the original read arguments to read this file again.]' }] };
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
