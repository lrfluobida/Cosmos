import { requirePng } from '../acceptance/png.ts';

const contextLimit = 1_000_000;
const pngPrefix = 'data:image/png;base64,';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

/** Upper bound on a pinned DeepSeek chat body. Only complete, inline screenshot bytes receive the vision tariff. */
export function reviewImageInputTokens(body: Record<string, unknown>, wireBytes: number): number {
  if (body.model !== 'deepseek-flash' || !Array.isArray(body.messages) || wireBytes > 48 * 1024 * 1024
    || !only(body, ['model', 'messages', 'stream', 'stream_options', 'max_tokens', 'tools', 'thinking', 'reasoning_effort'])
    || body.tools !== undefined && (!Array.isArray(body.tools) || !body.tools.every(tool => object(tool) && tool.type === 'function'))) return contextLimit;
  let encodedBytes = 0, images = 0, parts = 0;
  for (const message of body.messages) {
    if (!object(message) || !['system', 'user', 'assistant', 'tool'].includes(String(message.role))
      || !only(message, ['role', 'content', 'tool_calls', 'tool_call_id', 'name', 'reasoning_content'])) return contextLimit;
    if (typeof message.content === 'string' || message.role === 'assistant' && message.content === null) continue;
    if (message.role !== 'user' || !Array.isArray(message.content)) return contextLimit;
    for (const part of message.content) {
      parts++;
      if (!object(part)) return contextLimit;
      if (part.type === 'text' && typeof part.text === 'string' && only(part, ['type', 'text'])) continue;
      if (part.type !== 'image_url' || !only(part, ['type', 'image_url']) || !object(part.image_url) || !only(part.image_url, ['url'])
        || typeof part.image_url.url !== 'string' || !part.image_url.url.startsWith(pngPrefix)) return contextLimit;
      const data = part.image_url.url.slice(pngPrefix.length);
      const bytes = Buffer.from(data, 'base64');
      if (bytes.length > 32 * 1024 * 1024 || bytes.toString('base64') !== data) return contextLimit;
      try { requirePng(bytes); } catch { return contextLimit; }
      encodedBytes += data.length;
      images++;
    }
  }
  if (!images || images > 600) return contextLimit;
  // https://api-docs.deepseek.com/guides/vision/ caps each image independently at 1024 tokens. Charge all other serialized bytes
  // at one token per byte, with additional room for provider message, content and function framing.
  const framing = 1024 + 64 * body.messages.length + 32 * parts + 256 * (body.tools?.length ?? 0);
  return Math.min(contextLimit, wireBytes - encodedBytes + images * 1024 + framing);
}
