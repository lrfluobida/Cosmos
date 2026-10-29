import { truncateHead } from '@earendil-works/pi-coding-agent';

/** Display-only whitespace removal, only if complete JSON fits the unchanged SDK limits. */
export function compactJsonReadBuffer(buffer: Buffer): Buffer {
  let text: string;
  try {
    // Keep a BOM visible to JSON validation; decoding must not silently remove source bytes.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    JSON.parse(text);
  } catch { return buffer; }
  let compact = '', quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) {
      compact += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') { quoted = true; compact += char; }
    else if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') compact += char;
  }
  return compact === text || truncateHead(compact).truncated ? buffer : Buffer.from(compact, 'utf8');
}
