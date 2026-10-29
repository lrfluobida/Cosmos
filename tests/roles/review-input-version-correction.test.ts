import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { CreatedRole } from '../../src/roles/factory.ts';
import { parseReview } from '../../src/runtime/orchestrator.ts';
import { designConcernReviewProtocol } from '../../src/runtime/repair/design-concerns.ts';
import { requestReview, ReviewProtocolError } from '../../src/runtime/repair/protocol.ts';
import { RunController } from '../../src/runtime/run.ts';
import { artifact, task as taskFixture } from '../contracts/fixtures.ts';

const now = () => Date.parse('2026-10-01T01:00:00Z');
const rejection = (task: TaskContract) => ({ verdict: 'changes_requested', inputVersions: [...task.inputs, ...task.artifacts],
  evidenceIds: task.evidence.map(item => item.evidenceId), findings: ['输入响应仍有真实缺陷。'] });

async function setup(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-review-input-correction-'));
  const task = taskFixture() as TaskContract;
  const controller = await RunController.create({ root: join(root, 'state'), runId: task.runId, ledgerId: task.budget.ledgerId,
    kind: 'runtime_generation', specVersion: task.specVersion, scope: 'validation', limitMicroCny: 1000,
    allocations: [{ taskId: task.taskId, amountMicroCny: 800 }], now });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const correctionRecordPath = join(root, 'review-correction.json'), prompts: string[] = [];
  const reviewer: CreatedRole = { actorId: 'independent-reviewer', contextId: 'independent-context',
    async prompt(prompt) {
      prompts.push(prompt);
      if (prompts.length === 2) assert.deepEqual(JSON.parse(await readFile(correctionRecordPath, 'utf8')), {
        formatVersion: 1, taskId: task.taskId, attemptId: 'attempt-1', reviewerId: reviewer.actorId,
        contextId: reviewer.contextId, used: 1, recordedAt: new Date(now()).toISOString(),
      });
      const reply = rejection(task);
      if (prompts.length === 1) reply.inputVersions.push(task.evidence[0].source);
      return { text: JSON.stringify(reply) };
    }, async close() {} };
  const options = { reviewer, controller, taskId: task.taskId, attemptId: 'attempt-1', correctionRecordPath,
    prompt: 'Review fixed inputs.', signal: new AbortController().signal, maxCorrections: 1 as 0 | 1,
    now, parse: (text: string) => parseReview(text, task), correctionPrompt: designConcernReviewProtocol };
  return { task, controller, options, prompts };
}

test('extra host reference gets a precise bounded correction without changing the independent rejection', async t => {
  const f = await setup(t), expected = [...f.task.inputs, ...f.task.artifacts];
  const invalid = { ...rejection(f.task), inputVersions: [...expected, f.task.evidence[0].source] };
  assert.throws(() => parseReview(JSON.stringify(invalid), f.task), { message: 'Review input versions are stale or incomplete.' });
  const result = await requestReview(f.options);
  assert.deepEqual(result, rejection(f.task));
  assert.equal(f.prompts.length, 2);
  assert.equal(f.prompts[0], f.options.prompt);
  assert.ok(f.prompts[1].startsWith(designConcernReviewProtocol));
  const diagnostic = f.prompts[1].slice(designConcernReviewProtocol.length);
  assert.match(diagnostic, /\$\.inputVersions\[2\]/);
  assert.ok(diagnostic.includes(JSON.stringify(expected)));
  assert.match(diagnostic, /exactly.*packet\.inputs/);
  assert.match(diagnostic, /host evidence.*evidenceIds/);
  assert.ok(diagnostic.includes(JSON.stringify(f.task.evidence.map(item => item.evidenceId))));
  assert.doesNotMatch(diagnostic, /evidence\/report\.json|输入响应仍有真实缺陷/);
  assert.ok(Buffer.byteLength(diagnostic, 'utf8') <= 4096);
  assert.throws(() => parseReview(JSON.stringify(invalid), f.task), /stale or incomplete/);
});

for (const [name, inputVersions, path] of [
  ['missing', [artifact('requirements', 'v1', 'requirements/v1.json')], '$.inputVersions[1]'],
  ['empty', [], '$.inputVersions[0]'],
  ['reordered', [artifact(), artifact('requirements', 'v1', 'requirements/v1.json')], '$.inputVersions[0]'],
  ['stale', [artifact('requirements', 'stale', 'requirements/v1.json'), artifact()], '$.inputVersions[0]'],
  ['extra-field', [{ ...artifact('requirements', 'v1', 'requirements/v1.json'), secret: 'RAW_SENTINEL' }, artifact()], '$.inputVersions[0]'],
  ['null', null, '$.inputVersions'], ['object', { secret: 'RAW_SENTINEL' }, '$.inputVersions'],
  ['string', 'RAW_SENTINEL', '$.inputVersions'], ['absent', undefined, '$.inputVersions'],
] as const) test(`fixed input diagnostic locates ${name} without echoing untrusted values`, async t => {
  const f = await setup(t), original = f.options.parse;
  f.options.parse = text => f.prompts.length === 1 ? original(JSON.stringify({ ...rejection(f.task), inputVersions })) : original(text);
  await requestReview(f.options);
  const diagnostic = f.prompts[1].slice(designConcernReviewProtocol.length);
  assert.ok(diagnostic.includes(`Field: ${path}.`));
  assert.doesNotMatch(diagnostic, /RAW_SENTINEL/);
  assert.ok(diagnostic.includes(JSON.stringify([...f.task.inputs, ...f.task.artifacts])));
});

test('a host source already in fixed inputs is retained exactly', async t => {
  const f = await setup(t);
  f.task.inputs.push(f.task.evidence[0].source);
  const result = await requestReview(f.options);
  assert.deepEqual(result.inputVersions, [...f.task.inputs, ...f.task.artifacts]);
  assert.ok(f.prompts[1].includes(JSON.stringify(result.inputVersions)));
});

test('oversized expected inputs are explicitly omitted and referred back to the fixed packet', async t => {
  const f = await setup(t);
  f.task.inputs = [artifact('长输入', 'v1', '输入/'.repeat(1600))];
  await requestReview(f.options);
  const diagnostic = f.prompts[1].slice(designConcernReviewProtocol.length);
  assert.ok(Buffer.byteLength(diagnostic, 'utf8') <= 4096);
  assert.match(diagnostic, /2 references omitted.*packet\.inputs/);
  assert.doesNotMatch(diagnostic, /输入\//);
  assert.ok(diagnostic.includes(JSON.stringify(f.task.evidence.map(item => item.evidenceId))));
});

test('oversized evidence identifiers cannot expand the diagnostic or suppress a short exact input list', async t => {
  const f = await setup(t);
  f.task.evidence[0].evidenceId = '记录'.repeat(1600);
  await requestReview(f.options);
  const diagnostic = f.prompts[1].slice(designConcernReviewProtocol.length);
  assert.ok(Buffer.byteLength(diagnostic, 'utf8') <= 4096);
  assert.ok(diagnostic.includes(JSON.stringify([...f.task.inputs, ...f.task.artifacts])));
  assert.match(diagnostic, /1 evidence IDs omitted.*packet\.evidence/);
});

test('unknown parse errors retain the exact specialized correction without exception or reply content', async t => {
  const f = await setup(t), original = f.options.parse;
  f.options.parse = text => {
    if (f.prompts.length === 1) throw Object.assign(new Error('RAW_SENTINEL'), { name: 'ReviewInputVersionsError', correctionDiagnostic: 'RAW_SENTINEL' });
    return original(text);
  };
  await requestReview(f.options);
  assert.equal(f.prompts[1], designConcernReviewProtocol);
});

test('generic review correction also retains its schema and adds the fixed input diagnosis', async t => {
  const f = await setup(t);
  await requestReview({ ...f.options, correctionPrompt: undefined });
  assert.match(f.prompts[1], /only protocol correction allowed/);
  assert.match(f.prompts[1], /Do not.*remove a genuine defect/);
  assert.match(f.prompts[1], /\$\.inputVersions\[2\]/);
});

test('a second invalid response still fails after exactly one durable correction', async t => {
  const f = await setup(t);
  f.options.parse = () => parseReview(JSON.stringify({ ...rejection(f.task), inputVersions: [] }), f.task);
  await assert.rejects(requestReview(f.options), ReviewProtocolError);
  assert.equal(f.prompts.length, 2);
});

test('zero corrections retains strict rejection and creates no correction record', async t => {
  const f = await setup(t);
  await assert.rejects(requestReview({ ...f.options, maxCorrections: 0 }), ReviewProtocolError);
  assert.equal(f.prompts.length, 1);
  await assert.rejects(readFile(f.options.correctionRecordPath), { code: 'ENOENT' });
});

for (const record of ['{', '{"used":1}']) test(`existing correction record ${record} prevents dispatch`, async t => {
  const f = await setup(t);
  await writeFile(f.options.correctionRecordPath, record, 'utf8');
  await assert.rejects(requestReview(f.options), { code: 'EEXIST' });
  assert.equal(f.prompts.length, 1);
  assert.equal(await readFile(f.options.correctionRecordPath, 'utf8'), record);
});

for (const failure of ['provider', 'timeout', 'admission']) test(`${failure} failure is never turned into a parse correction`, async t => {
  const f = await setup(t), error = new Error(`${failure} RAW_SENTINEL`);
  let calls = 0;
  f.options.reviewer.prompt = async () => { calls++; throw error; };
  await assert.rejects(requestReview(f.options), value => value === error);
  assert.equal(calls, 1);
  await assert.rejects(readFile(f.options.correctionRecordPath), { code: 'ENOENT' });
});

for (const guard of ['inactive', 'deadline', 'unknown']) test(`${guard} authority prevents the diagnosed correction`, async t => {
  const f = await setup(t), original = f.options.reviewer.prompt;
  f.options.reviewer.prompt = async (...args) => {
    const answer = await original(...args);
    if (guard === 'inactive') await f.controller.stop('offline guard');
    if (guard === 'deadline') f.options.now = () => Date.parse('2026-10-02T01:00:00Z');
    if (guard === 'unknown') {
      await f.controller.reserve({ requestId: 'unknown-fixture', taskId: f.task.taskId, provider: 'fixture', pricingVersion: 'fixture', estimatedMaxCostMicroCny: 1 });
      await f.controller.admit('unknown-fixture');
      await f.controller.markUnknown('unknown-fixture', [artifact('unknown-receipt', 'v1', 'evidence/unknown.json')]);
    }
    return answer;
  };
  await assert.rejects(requestReview(f.options), ReviewProtocolError);
  assert.equal(f.prompts.length, 1);
  await assert.rejects(readFile(f.options.correctionRecordPath), { code: 'ENOENT' });
});
