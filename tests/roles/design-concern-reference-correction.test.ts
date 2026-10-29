import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { ExecutionRequirement } from '../../src/roles/execution-input.ts';
import type { CreatedRole } from '../../src/roles/factory.ts';
import { parseReview } from '../../src/runtime/orchestrator.ts';
import { designConcernReviewProtocol, indexDesignConcerns, parseDesignConcernReview } from '../../src/runtime/repair/design-concerns.ts';
import type { DesignConcernReview, DesignReviewProposal } from '../../src/runtime/repair/design-concerns.ts';
import { requestReview, ReviewProtocolError } from '../../src/runtime/repair/protocol.ts';
import { RunController } from '../../src/runtime/run.ts';
import { artifact, requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

const now = () => Date.parse('2026-10-01T01:00:00Z');
const referenceMessage = 'Design resolution references an unauthorized input or stale output.';

function fixture(count = 3, oversizedCapture = false) {
  const task = taskFixture() as TaskContract, requirement = requirementFixture() as ExecutionRequirement;
  task.artifacts = [artifact('design', 'v2', oversizedCapture ? '固定路径/'.repeat(2000) : 'registry/captures/design/v2/files')];
  task.context.interfaces = [artifact('design', 'v1', 'registry/captures/design/v1/files')];
  task.evidence[0].artifactVersions = [...task.inputs, ...task.artifacts];
  const proposal = { summary: '作者原始报告', remaining: Array.from({ length: count }, (_, i) => `原始待解决项 ${i} MODEL_PROSE`), uncertainty: [] };
  const packet: DesignConcernReview = { formatVersion: 'ordinary-design-concern-review/1', policy: 'independent-review/2',
    taskId: task.taskId, attemptId: 'attempt-1', authorId: task.authorId, contextId: task.context.contextId,
    proposal, proposalSha256: 'fixture', capture: task.artifacts[0], capturedAt: new Date(now()).toISOString(),
    concerns: indexDesignConcerns(proposal), signature: [], authorSources: [] };
  const valid: DesignReviewProposal = { verdict: 'changes_requested', inputVersions: [...task.inputs, ...task.artifacts],
    evidenceIds: task.evidence.map(item => item.evidenceId), findings: Array.from({ length: 9 }, (_, i) => `真实缺陷 ${i} MODEL_FINDING`),
    concernResolutions: packet.concerns.map((concern, row) => ({ concernId: concern.concernId, concernText: proposal.remaining[row],
      status: 'unresolved', basis: row === count - 1 ? 'fixed_input' : 'captured_output', rationale: 'AC-1 需要核对原始要求 MODEL_RATIONALE',
      acceptanceIds: task.acceptanceIds, inputVersions: row === count - 1 ? [...task.inputs, ...task.context.interfaces] : task.artifacts,
      evidenceIds: [], evidenceRefs: [] })) };
  const invalid = structuredClone(valid);
  for (const row of invalid.concernResolutions) { row.evidenceIds = [task.evidence[0].evidenceId]; row.evidenceRefs = [task.evidence[0].source]; }
  invalid.concernResolutions[count - 1].inputVersions.push(packet.capture);
  const parse = (value: unknown) => parseDesignConcernReview(JSON.stringify(value), task, requirement, packet, parseReview);
  return { task, requirement, packet, valid, invalid, parse };
}

async function setup(t: test.TestContext, f = fixture()) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-concern-reference-'));
  const controller = await RunController.create({ root: join(root, 'state'), runId: f.task.runId, ledgerId: f.task.budget.ledgerId,
    kind: 'runtime_generation', specVersion: f.task.specVersion, scope: 'validation', limitMicroCny: 1000,
    allocations: [{ taskId: f.task.taskId, amountMicroCny: 800 }], now });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const correctionRecordPath = join(root, 'review-correction.json'), prompts: string[] = [], replies = [f.invalid, f.valid];
  const reviewer: CreatedRole = { actorId: 'independent-reviewer', contextId: 'independent-context',
    async prompt(prompt) {
      prompts.push(prompt);
      if (prompts.length === 2) assert.deepEqual(JSON.parse(await readFile(correctionRecordPath, 'utf8')), {
        formatVersion: 1, taskId: f.task.taskId, attemptId: 'attempt-1', reviewerId: reviewer.actorId,
        contextId: reviewer.contextId, used: 1, recordedAt: new Date(now()).toISOString(),
      });
      return { text: JSON.stringify(replies[prompts.length - 1]) };
    }, async close() {} };
  const options = { reviewer, controller, taskId: f.task.taskId, attemptId: 'attempt-1', correctionRecordPath,
    prompt: 'Review the frozen packet.', signal: new AbortController().signal, maxCorrections: 1 as 0 | 1, now,
    parse: (text: string) => parseDesignConcernReview(text, f.task, f.requirement, f.packet, parseReview), correctionPrompt: designConcernReviewProtocol };
  return { ...f, prompts, replies, options };
}

function issues(diagnostic: string): { path: string; reason: string }[] {
  const line = diagnostic.split('\n').find(line => line.startsWith('Issues: '));
  assert.ok(line, 'the known reference failure must provide typed field diagnostics');
  return JSON.parse(line.slice('Issues: '.length));
}

test('R18-shaped reference errors reach one durable correction together and preserve all rejection findings', async t => {
  const f = await setup(t), before = structuredClone(f.invalid);
  assert.throws(() => f.parse(f.invalid), { message: referenceMessage });
  const result = await requestReview(f.options), diagnostic = f.prompts[1].slice(designConcernReviewProtocol.length);
  assert.deepEqual(result, f.valid);
  assert.equal(result.verdict, 'changes_requested'); assert.equal(result.findings.length, 9);
  assert.deepEqual(result.concernResolutions.map(row => row.status), ['unresolved', 'unresolved', 'unresolved']);
  assert.deepEqual(result.findings, f.invalid.findings); assert.deepEqual(f.invalid, before);
  assert.deepEqual(issues(diagnostic), [
    { path: '$.concernResolutions[0].evidenceIds', reason: 'evidence_ids_must_be_empty' },
    { path: '$.concernResolutions[0].evidenceRefs', reason: 'evidence_refs_must_be_empty' },
    { path: '$.concernResolutions[1].evidenceIds', reason: 'evidence_ids_must_be_empty' },
    { path: '$.concernResolutions[1].evidenceRefs', reason: 'evidence_refs_must_be_empty' },
    { path: '$.concernResolutions[2].evidenceIds', reason: 'evidence_ids_must_be_empty' },
    { path: '$.concernResolutions[2].evidenceRefs', reason: 'evidence_refs_must_be_empty' },
    { path: '$.concernResolutions[2].inputVersions[2]', reason: 'unauthorized_input_reference' },
  ]);
  assert.ok(Buffer.byteLength(diagnostic, 'utf8') <= 4096); assert.match(diagnostic, /0 issues omitted/);
  assert.ok(diagnostic.includes(JSON.stringify(f.packet.capture)));
  assert.match(diagnostic, /fixed_input/); assert.match(diagnostic, /captured_output/);
  assert.match(diagnostic, /evidenceIds.*evidenceRefs.*empty/);
  assert.match(diagnostic, /already.*complete.*frozen.*same session/);
  assert.match(diagnostic, /missing.*evidence/); assert.match(diagnostic, /independent/);
  assert.doesNotMatch(diagnostic, /MODEL_|Fixed inputVersions diagnostic/);
  assert.equal(f.prompts.length, 2); assert.ok(f.prompts[1].startsWith(designConcernReviewProtocol));
  assert.throws(() => f.parse(f.invalid), { message: referenceMessage });
});

for (const mode of ['missing-capture', 'duplicate', 'unauthorized', 'malformed-reference'] as const) test(`known ${mode} failure diagnoses the exact safe field`, async t => {
  const f = await setup(t), reply = structuredClone(f.valid), row = reply.concernResolutions[0];
  let expected: { path: string; reason: string }[];
  if (mode === 'missing-capture') {
    row.inputVersions = f.task.inputs;
    expected = [{ path: '$.concernResolutions[0].inputVersions', reason: 'missing_current_capture' }];
  } else {
    const badRef = mode === 'duplicate' ? f.packet.capture : mode === 'unauthorized' ? artifact('MODEL_REF', 'MODEL_VERSION', 'MODEL_LOCATION') : null;
    Object.assign(row, { inputVersions: [f.packet.capture, badRef] });
    expected = [{ path: '$.concernResolutions[0].inputVersions[1]', reason: mode === 'duplicate' ? 'duplicate_input_reference' : 'unauthorized_input_reference' }];
  }
  f.replies[0] = reply;
  assert.throws(() => f.parse(reply), { message: mode === 'missing-capture' ? 'Design resolution must reference the current capture.' : referenceMessage });
  await requestReview(f.options);
  const diagnostic = f.prompts[1].slice(designConcernReviewProtocol.length);
  assert.deepEqual(issues(diagnostic), expected); assert.doesNotMatch(diagnostic, /MODEL_/);
});

test('reference issues include missing current capture even when evidence channels also fail', async t => {
  const f = await setup(t); f.replies[0].concernResolutions[0].inputVersions = f.task.inputs;
  assert.throws(() => f.parse(f.replies[0]), { message: referenceMessage });
  await requestReview(f.options);
  assert.ok(issues(f.prompts[1]).some(issue => issue.path === '$.concernResolutions[0].inputVersions' && issue.reason === 'missing_current_capture'));
});

for (const mode of ['identity', 'shape', 'identifiers', 'host-proof'] as const) test(`${mode} gate retains its original generic failure`, async t => {
  const f = await setup(t), reply = structuredClone(f.valid), row = reply.concernResolutions[0];
  const message = mode === 'identity' ? 'Invalid design concern identity, original text or rationale.'
    : mode === 'shape' ? 'Design resolution needs exact fixed references.'
      : mode === 'identifiers' ? 'Design resolution identifiers must be unique.' : 'Design resolution lacks current passing host proof.';
  if (mode === 'identity') row.concernId = 'MODEL_ID';
  if (mode === 'shape') Object.assign(row, { inputVersions: null });
  if (mode === 'identifiers') row.evidenceIds = ['MODEL_ID', 'MODEL_ID'];
  if (mode === 'host-proof') row.basis = 'host_evidence';
  f.replies[0] = reply;
  assert.throws(() => f.parse(reply), { message });
  await requestReview(f.options); assert.equal(f.prompts[1], designConcernReviewProtocol);
});

test('top-level fixed-input validation keeps precedence and its existing diagnostic', async t => {
  const f = await setup(t); f.replies[0].inputVersions.push(f.task.evidence[0].source);
  assert.throws(() => f.parse(f.replies[0]), { message: 'Review input versions are stale or incomplete.' });
  await requestReview(f.options); assert.match(f.prompts[1], /Fixed inputVersions diagnostic/);
  assert.doesNotMatch(f.prompts[1], /Issues: /);
});

test('a later unrelated guard preserves the first reference rejection and stops field collection', async t => {
  const f = await setup(t), reply = structuredClone(f.valid);
  reply.concernResolutions[0].inputVersions = f.task.inputs;
  reply.concernResolutions[1].concernText = 'MODEL_CHANGED';
  f.replies[0] = reply;
  assert.throws(() => f.parse(reply), { message: 'Design resolution must reference the current capture.' });
  await requestReview(f.options);
  assert.deepEqual(issues(f.prompts[1]), [{ path: '$.concernResolutions[0].inputVersions', reason: 'missing_current_capture' }]);
});

test('large multibyte context and many known errors remain bounded with complete JSON and explicit omissions', async t => {
  const f = await setup(t, fixture(120, true));
  await requestReview(f.options);
  const diagnostic = f.prompts[1].slice(designConcernReviewProtocol.length), listed = issues(diagnostic);
  assert.ok(Buffer.byteLength(diagnostic, 'utf8') <= 4096);
  const omitted = diagnostic.match(/(\d+) issues omitted/); assert.ok(omitted);
  assert.equal(listed.length + Number(omitted[1]), 241); assert.ok(Number(omitted[1]) > 0);
  assert.match(diagnostic, /1 current capture reference omitted/); assert.doesNotMatch(diagnostic, /固定路径|MODEL_/);
});

test('unknown exception lookalikes cannot add model text to the specialized correction', async t => {
  const f = await setup(t), parse = f.options.parse;
  f.options.parse = text => {
    if (f.prompts.length === 1) throw Object.assign(new Error('MODEL_EXCEPTION'), { name: 'DesignConcernReferenceError', correctionDiagnostic: 'MODEL_DIAGNOSTIC' });
    return parse(text);
  };
  await requestReview(f.options); assert.equal(f.prompts[1], designConcernReviewProtocol);
});

test('a second invalid concern reply still fails after exactly one recorded correction', async t => {
  const f = await setup(t); f.replies[1] = f.invalid;
  await assert.rejects(requestReview(f.options), ReviewProtocolError); assert.equal(f.prompts.length, 2);
  assert.equal(JSON.parse(await readFile(f.options.correctionRecordPath, 'utf8')).used, 1);
});

test('zero corrections retains strict concern rejection without a correction record', async t => {
  const f = await setup(t);
  await assert.rejects(requestReview({ ...f.options, maxCorrections: 0 }), ReviewProtocolError);
  assert.equal(f.prompts.length, 1); await assert.rejects(readFile(f.options.correctionRecordPath), { code: 'ENOENT' });
});

test('an existing partial correction record prevents a diagnosed correction dispatch', async t => {
  const f = await setup(t); await writeFile(f.options.correctionRecordPath, '{', 'utf8');
  await assert.rejects(requestReview(f.options), { code: 'EEXIST' }); assert.equal(f.prompts.length, 1);
  assert.equal(await readFile(f.options.correctionRecordPath, 'utf8'), '{');
});
