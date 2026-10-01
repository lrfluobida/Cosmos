/** Decode model messages only. Durable JSON files keep their strict JSON readers. */
export function decodeModelJson(text: string): unknown {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch {
    const fence = /(?:^|\r?\n)[ \t]*```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/.exec(text);
    if (!fence) throw new Error('Model response requires one complete JSON object.');
    const outside = text.slice(0, fence.index) + text.slice(fence.index + fence[0].length);
    // Braces/brackets or another code fence could hide a competing payload.
    // Reject that ambiguity instead of choosing which model answer to trust.
    const extraJson = outside.split(/\r?\n/).some(line => {
      // Keep quoted spaces and escapes together; JSON.parse validates each token.
      const tokens = line.match(/"(?:\\.|[^"\\])*"|\S+/g) ?? [];
      return tokens.length > 0 && tokens.every(token => {
        try { JSON.parse(token); return true; } catch { return false; }
      });
    });
    if (/[{}\[\]]|```|~~~/.test(outside) || extraJson) throw new Error('Model response contains ambiguous JSON or code blocks.');
    try { value = JSON.parse(fence[1]); }
    catch { throw new Error('Model JSON code block is incomplete or invalid.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Model response must contain a JSON object.');
  return value;
}
