import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseReview } from '../../src/runtime/orchestrator.ts';
import { decodeModelJson } from '../../src/roles/protocol.ts';
import { parseDesignConcernReview } from '../../src/runtime/repair/design-concerns.ts';

// Pure parsing of an explicitly supplied closed run; never open its controller or write receipts.
const sourceRoot = process.env.COS138_REVIEW_SOURCE;
test('original R4 comparison references preserve the raw rejection and every finding', { skip: !sourceRoot }, async t => {
  const source = sourceRoot!, seen = new Map<string, Buffer>();
  const read = async (path: string) => { const bytes = await readFile(path); seen.set(path, bytes); return bytes.toString('utf8'); };
  const snapshot = JSON.parse(await read(join(source, 'snapshot.json'))), task = snapshot.tasks.find((task: any) => task.taskId === 'design-room-game');
  const origin = JSON.parse(await read(join(source, 'journal/task-design-room-game/origin.json')));
  const packet = JSON.parse(await read(join(source, 'journal/task-design-room-game/design-concerns.json'))).value;
  const reviewDir = join(source, 'sessions', packet.attemptId, 'review'), names = (await readdir(reviewDir)).filter(name => name.endsWith('.jsonl'));
  assert.equal(names.length, 1);
  const messages = (await read(join(reviewDir, names[0]))).trim().split('\n').map(line => JSON.parse(line).message).filter(Boolean);
  const raw = messages.filter(message => message.role === 'assistant').flatMap(message => message.content)
    .find(content => content.type === 'text' && content.text.includes('concernResolutions'))?.text;
  assert.equal(typeof raw, 'string');
  const original = decodeModelJson(raw) as any, { concernResolutions, ...base } = original;
  assert.equal(parseReview(JSON.stringify(base), task).verdict, 'changes_requested');
  const parsed = parseDesignConcernReview(raw, task, origin.requirement, packet, parseReview);
  assert.deepEqual(parsed, original);
  assert.equal(parsed.verdict, 'changes_requested'); assert.equal(parsed.findings.length, 8); assert.equal(parsed.concernResolutions.length, 2);
  for (const resolution of parsed.concernResolutions) assert.deepEqual(resolution.inputVersions.map(ref => ref.artifactId), ['requirement-draft', 'user-confirmation', 'design']);
  for (const [path, bytes] of seen) assert.deepEqual(await readFile(path), bytes);
  t.diagnostic(JSON.stringify({ rawSha256: createHash('sha256').update(raw).digest('hex'), rawBytes: Buffer.byteLength(raw),
    findings: parsed.findings.length, concerns: concernResolutions.length, unchangedSourceFiles: seen.size, sourceRoot }));
});
