import assert from 'node:assert/strict';
import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { readConfirmedRequirementsSource } from '../../src/runtime/confirmed-requirements-source.ts';
import { publishReceiptBytes } from '../../src/runtime/recovery/receipt-file.ts';
import { confirmedSource, temporaryRun } from './confirmed-requirements.fixture.ts';

for (const intake of [false, true]) test(`complete original revision reads without a controller (intake=${intake})`, async t => {
  const f = await confirmedSource(t, { intake }), before = await readFile(join(f.root, 'snapshot.json'));
  const actual = await readConfirmedRequirementsSource({ root: f.root, revision: 2, specVersion: '1.0' });
  assert.deepEqual(actual.draft, f.draft); assert.equal(actual.source.runId, f.state.run.runId);
  assert.equal(actual.confirmed.actorId, 'local-user'); assert.equal(actual.requirement.confirmedAt, actual.confirmed.at);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  for (const change of [{ revision: 1 }, { draftSha256: '0'.repeat(64) }, { confirmationSha256: '0'.repeat(64) }, { runId: 'wrong' }]) {
    await assert.rejects(readConfirmedRequirementsSource({ root: f.root, revision: 2, specVersion: '1.0', expected: { ...actual.source, ...change } }), /source.*changed/i);
  }
  await assert.rejects(readConfirmedRequirementsSource({ root: f.root, revision: 1, specVersion: '1.0' }), /exact.*revision/i);
  await assert.rejects(readConfirmedRequirementsSource({ root: f.root, revision: 2, specVersion: 'wrong' }), /spec version/i);
});
for (const changed of ['experience', 'brief', 'questions', 'acceptance', 'unsupported', 'answers', 'profile', 'identity', 'options', 'receipt', 'legacy-digest', 'missing']) test(`source rejects changed ${changed}`, async t => {
  const f = await confirmedSource(t), original = await readConfirmedRequirementsSource({ root: f.root, revision: 2, specVersion: '1.0' });
  const name = changed === 'answers' ? 'intake-answers/v2.json' : changed === 'profile' ? 'intake-ordinary-profile.json'
    : `requirements/v2/${['identity', 'options', 'receipt', 'legacy-digest'].includes(changed) ? 'confirmation' : 'draft'}.json`;
  const path = join(f.root, name), value = JSON.parse(await readFile(path, 'utf8'));
  if (changed === 'experience') value.experienceCriteria[0].expected = '改变后的体验';
  else if (changed === 'brief') value.brief = '改变完整需求';
  else if (changed === 'questions') value.questions[0].prompt = '改变问题';
  else if (changed === 'acceptance') value.acceptance[0].expected = '改变客观条目';
  else if (changed === 'unsupported') value.unsupported.push('不能执行');
  else if (changed === 'answers') value.answers.goal = '改变后的答案';
  else if (changed === 'options') delete value.modularRepairPolicy;
  else if (changed === 'receipt') value.actorId = 'different-user';
  else if (changed === 'legacy-digest') delete value.ordinaryDraftSha256;
  else value.runId = 'changed';
  if (changed === 'missing') await unlink(path); else await writeFile(path, JSON.stringify(value), 'utf8');
  await assert.rejects(readConfirmedRequirementsSource({ root: f.root, revision: 2, specVersion: '1.0', expected: original.source }), /changed|source|ENOENT/i);
});
test('a standalone confirmation receipt cannot approve an unconfirmed source', async t => {
  const f = await confirmedSource(t, { unconfirmed: true });
  await writeFile(join(f.root, 'requirements/v2/confirmation.json'), JSON.stringify({ confirmed: true, actorId: 'local-user', revision: 2 }), 'utf8');
  await assert.rejects(readConfirmedRequirementsSource({ root: f.root, revision: 2, specVersion: '1.0' }), /confirmation/i);
});
test('byte publisher retains non-ASCII whitespace and makes one independent immutable file', async t => {
  const root = await temporaryRun(t), path = join(root, 'copied.json'), bytes = Buffer.from('{\r\n\t"要求": "完整原始字节"\r\n}\r\n');
  await publishReceiptBytes(path, bytes);
  assert.deepEqual(await readFile(path), bytes); assert.equal((await stat(path)).nlink, 1);
  await assert.rejects(publishReceiptBytes(path, Buffer.from('{}')), { code: 'EEXIST' });
  assert.deepEqual(await readFile(path), bytes);
});
