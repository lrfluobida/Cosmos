import { DEFAULT_MAX_BYTES, truncateHead } from '@earendil-works/pi-coding-agent';

function jsonDisplay(buffer: Buffer, plan: boolean): string | undefined {
  let text: string;
  try {
    // Keep a BOM visible to JSON validation; decoding must not silently remove source bytes.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    const value = JSON.parse(text);
    if (plan && (value?.formatVersion !== 'ordinary-acceptance-plan/1' || !Array.isArray(value.scenario?.steps))) return;
  } catch { return; }
  let display = '', quoted = false, escaped = false, depth = 0, arrayDepth = 0;
  for (const char of text) {
    if (quoted) {
      display += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') continue;
    if (char === '"') quoted = true;
    if (plan && char === ']' && depth === arrayDepth) { display += '\n'; arrayDepth = 0; }
    display += char;
    if (!plan) continue;
    // Outer arrays hold main/reopen steps. Keep each nested observation on its step's line.
    if (char === '[' || char === '{') depth++;
    if (char === '[' && !arrayDepth) { arrayDepth = depth; display += '\n'; }
    if (char === ',' && depth === arrayDepth) display += '\n';
    if (char === ']' || char === '}') depth--;
  }
  return display;
}

/** Display-only whitespace removal, only if complete JSON fits the unchanged SDK limits. */
export function compactJsonReadBuffer(buffer: Buffer): Buffer {
  const display = jsonDisplay(buffer, false);
  return display === undefined || truncateHead(display).truncated || Buffer.byteLength(display) === buffer.length
    ? buffer : Buffer.from(display, 'utf8');
}

/** An oversized step or metadata line keeps the original source pagination for the whole plan. */
export function pagedPlanReadBuffer(buffer: Buffer): Buffer | undefined {
  const display = jsonDisplay(buffer, true);
  if (display !== undefined && display.split('\n').every(line => Buffer.byteLength(line) <= DEFAULT_MAX_BYTES)) return Buffer.from(display, 'utf8');
}
