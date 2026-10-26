import type { AgentToolResult, ReadToolDetails, ReadToolInput } from '@earendil-works/pi-coding-agent';

/** Display-only whitespace removal for a complete text result from the pinned SDK read tool. */
export function compactCompleteJsonRead(
  result: AgentToolResult<ReadToolDetails | undefined>, args: ReadToolInput,
): AgentToolResult<ReadToolDetails | undefined> {
  if (('isError' in result && result.isError) || (args.offset !== undefined && args.offset !== 1)
    || (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit <= 0))
    || result.content.length !== 1 || result.content[0].type !== 'text' || result.details?.truncation !== undefined) return result;
  const block = result.content[0], text = block.text;
  // A user limit can append this continuation notice without any truncation details.
  if (/\n\n\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/.test(text)
    || /\n\n\[Showing lines [^\n]+\]$/.test(text) || /^\[Line \d+ is [^\n]+, exceeds /.test(text)) return result;
  try { JSON.parse(text); } catch { return result; }
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
  return compact === text ? result : { ...result, content: [{ ...block, text: compact }] };
}
