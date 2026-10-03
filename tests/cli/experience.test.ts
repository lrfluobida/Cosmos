import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { runCli } from '../../src/cli/index.ts';
import { readRunStatus } from '../../src/cli/control.ts';
import { RunController } from '../../src/runtime/run.ts';
import { publishGenerationReport } from '../../src/runtime/experience.ts';
import { OwnerLock } from '../../src/runtime/recovery/ownership.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { passedTask } from '../contracts/fixtures.ts';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-experience-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const controller = await RunController.create({ root, runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'generation',
    now: () => Date.parse('2026-10-01T00:00:00.000Z'), allocations: [{ taskId: 'COS-example', amountMicroCny: 50_000_000 }] });
  const state = await controller.read(); await controller.close();
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry' });
  await mkdir(join(root, 'author')); await writeFile(join(root, 'author/main.ts'), '// 临时契约测试，不是真实游戏\n', 'utf8');
  const capture = await registry.registerCapture({ taskId: 'COS-example', artifactRef: registry.artifactRef('code', 'v1'), sourceRoot: 'author',
    files: [{ source: 'main.ts', destination: 'src/main.ts' }], ownership: { writePaths: ['src'], readOnlyPaths: [] }, dependencies: [],
    metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'Offline contract fixture', sourceRefs: ['fixture'] } } });
  const ref = registry.candidateRef('game', 'v1');
  await registry.stageCandidate({ taskId: 'COS-example', authorId: 'author-1', contextId: 'author-context', candidateRef: ref, targetRoot: ref.location,
    inputs: [capture.artifactRef], expectedDeps: [capture.artifactRef], ownership: { writePaths: ['src'], readOnlyPaths: [] } });
  const evidence = await registry.verifyCandidate(ref, { build: async () => ({ passed: true, evidenceIds: ['build'] }), acceptance: async () => ({ passed: true, evidenceIds: ['evidence-1'] }) });
  const accepted = await registry.promoteCandidate(ref, { evidence, review: { candidateRef: ref, attemptId: evidence.attemptId,
    reviewerId: 'reviewer-1', contextId: 'review-context', verdict: 'approved', evidenceIds: ['evidence-1'] } });
  const replaceCandidate = async () => {
    const candidateRef = registry.candidateRef('game', 'v2');
    await registry.stageCandidate({ taskId: 'COS-example', authorId: 'author-1', contextId: 'author-context', candidateRef, targetRoot: candidateRef.location,
      inputs: [capture.artifactRef], expectedDeps: [capture.artifactRef], ownership: { writePaths: ['src'], readOnlyPaths: [] } });
    const proof = await registry.verifyCandidate(candidateRef, { build: async () => ({ passed: true, evidenceIds: ['build-v2'] }), acceptance: async () => ({ passed: true, evidenceIds: ['check-v2'] }) });
    await registry.promoteCandidate(candidateRef, { evidence: proof, review: { candidateRef, attemptId: proof.attemptId,
      reviewerId: 'reviewer-1', contextId: 'review-context', verdict: 'approved', evidenceIds: ['check-v2'] } });
  };
  const task = passedTask() as TaskContract; task.dependsOn = []; task.artifacts = [ref]; task.evidence[0].artifactVersions = [...task.inputs, ref];
  task.review.inputVersions = structuredClone([...task.inputs, ref]); state.tasks = [task as any]; state.run.artifacts = [ref];
  await writeFile(join(root, 'snapshot.json'), JSON.stringify(state) + '\n', 'utf8');
  const report = { formatVersion: 'generation-report-1', reportedAt: new Date().toISOString(), automaticAcceptance: 'passed', outcome: 'awaiting_user_experience',
    runId: state.run.runId, ledgerId: state.ledger.ledgerId, windowId: null, currentProject: root, delivery: accepted.targetRoot, gaps: [], acceptedCandidate: accepted,
    acceptanceScope: { capability: 'browser-input-media2d-v1', acceptance: [{ acceptanceId: 'AC-1', description: '临时点击切片', steps: ['点击'], expected: '获胜', evidenceKinds: ['test_report'] }],
      notCovered: ['完整经典 PC 基准未覆盖；仅确认上述需求与正常输入路径。', '手感、美术辨识度与整体体验由用户试玩。'] },
    effectiveTasks: [{ taskId: task.taskId, attemptId: task.attempts.at(-1)!.attemptId, artifacts: task.artifacts, review: task.review }] };
  await mkdir(join(root, 'delivery'));
  const reportRef = { artifactId: 'automated-delivery-report', version: '00000000-0000-4000-8000-000000000001', location: 'delivery/report-00000000-0000-4000-8000-000000000001.json' };
  const publish = async (value = report, version = reportRef.version) => {
    const ref = { ...reportRef, version, location: `delivery/report-${version}.json` }, bytes = Buffer.from(JSON.stringify(value) + '\n');
    await writeFile(join(root, ref.location), bytes); await writeFile(join(root, 'delivery/current-report.json'), JSON.stringify({ formatVersion: 1, report: ref, sha256: digest(bytes) }) + '\n', 'utf8');
    return ref;
  };
  await publish();
  const command = async (answer?: string, mutate?: () => Promise<void>, failAfterReceipt = false) => {
    const input = new PassThrough(), output = new PassThrough(); let text = '', supplied = false;
    output.on('data', part => { text += part.toString(); if (failAfterReceipt && part.toString().includes('体验已通过')) throw new Error('Synthetic interruption after durable receipt'); if (!supplied && text.includes('approve')) { supplied = true; void (async () => { await mutate?.(); if (answer === '[interrupt]') process.emit('SIGINT'); input.end(answer === undefined || answer === '[interrupt]' ? '' : answer + '\n'); })(); } });
    const result = await runCli(['experience', root], { input, output }); return { result: result as any, text };
  };
  return { root, state, task, report, accepted, publish, command, replaceCandidate };
}

test('explicit stdin approval and rejection persist exact scoped evidence and recover without changing run accounting', async t => {
  for (const decision of ['approve', 'reject']) {
    const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
    const { result, text } = await f.command(decision);
    assert.equal(result.userExperience, decision === 'approve' ? 'approved' : 'rejected');
    assert.equal(result.finalCompletion, decision === 'approve' ? 'complete_for_report_scope' : 'pending');
    assert.match(text, /临时点击切片/); assert.match(text, /完整经典/); assert.match(text, /v1/);
    assert.doesNotMatch(text, /approve [a-f0-9]{64}/, 'People should not have to copy a binding hash');
    const status = await readRunStatus(f.root); assert.equal(status.delivery?.userExperience, result.userExperience);
    assert.equal(status.delivery?.automaticAcceptance, 'passed'); assert.equal(status.delivery?.finalCompletion, result.finalCompletion);
    const files = await readdir(join(f.root, 'delivery/experience')); assert.equal(files.length, 1);
    const receipt = JSON.parse(await readFile(join(f.root, 'delivery/experience', files[0]), 'utf8'));
    assert.equal(receipt.actorId, 'local-user'); assert.equal(receipt.source.kind, 'cli-stdin'); assert.equal(receipt.source.rawInput, decision);
    assert.deepEqual(receipt.binding.acceptedCandidate, f.accepted); assert.ok(Number.isFinite(Date.parse(receipt.decidedAt)));
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before, 'Past deadline approval must not resume, extend or bill the original run');
  }
  const interrupted = await fixture(t), before = await readFile(join(interrupted.root, 'snapshot.json'));
  await assert.rejects(interrupted.command('approve', undefined, true), /Synthetic interruption/);
  assert.equal((await readRunStatus(interrupted.root)).delivery?.userExperience, 'approved', 'The durable receipt recovers without a second state write');
  assert.deepEqual(await readFile(join(interrupted.root, 'snapshot.json')), before);
});

test('EOF, cancellation and ambiguous input never create a human decision', async t => {
  for (const answer of [undefined, 'cancel', 'yes', 'approve wrong-version', '[interrupt]']) {
    const f = await fixture(t); assert.equal((await f.command(answer)).result.outcome, 'unconfirmed');
    assert.equal((await readRunStatus(f.root)).delivery?.userExperience, 'not_confirmed');
    await assert.rejects(readdir(join(f.root, 'delivery/experience')), { code: 'ENOENT' });
  }
});

test('automatic failure, missing accepted candidate and non-independent review cannot enter the experience gate', async t => {
  for (const failure of ['automatic', 'candidate', 'review', 'legacy', 'validation']) {
    const f = await fixture(t);
    if (failure === 'automatic') { f.report.automaticAcceptance = 'not_passed'; await f.publish(); }
    if (failure === 'candidate') await unlink(join(f.root, 'registry/current.json'));
    if (failure === 'review') { f.report.acceptedCandidate.review.reviewerId = 'author-1'; await writeFile(join(f.root, 'registry/current.json'), JSON.stringify(f.report.acceptedCandidate), 'utf8'); await f.publish(); }
    if (failure === 'legacy') { delete (f.report as any).formatVersion; await f.publish(); }
    if (failure === 'validation') { f.state.ledger.scope = 'validation'; f.state.ledger.limitMicroCny = 150_000_000; f.state.run.kind = 'evaluation'; f.state.tasks[0].kind = 'evaluation'; await writeFile(join(f.root, 'snapshot.json'), JSON.stringify(f.state), 'utf8'); }
    await assert.rejects(f.command('approve'), (error: Error) => !error.message.startsWith('Usage:') && /automatic|accepted|independent|report|generation|体验|自动|候选|报告|正式/i.test(error.message));
    await assert.rejects(readdir(join(f.root, 'delivery/experience')), { code: 'ENOENT' });
  }
});

test('commit rechecks candidate version, immutable report bytes and current report selection after stdin waiting', async t => {
  for (const changed of ['candidate', 'report-bytes', 'report-selection']) {
    const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(f.command('approve', async () => {
      if (changed === 'candidate') await f.replaceCandidate();
      if (changed === 'report-bytes') await writeFile(join(f.root, 'delivery/report-00000000-0000-4000-8000-000000000001.json'), JSON.stringify({ ...f.report, gaps: ['Changed'] }), 'utf8');
      if (changed === 'report-selection') await f.publish(f.report, '00000000-0000-4000-8000-000000000002');
    }), /changed|stale|hash|candidate|report|变化|改变|报告|候选|ENOENT/i);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    await assert.rejects(readdir(join(f.root, 'delivery/experience')), { code: 'ENOENT' });
  }
});

test('repeated decisions are idempotent, conflicts and forged source do not overwrite, and a new report starts pending', async t => {
  const f = await fixture(t); await f.command('approve');
  const files = await readdir(join(f.root, 'delivery/experience')), path = join(f.root, 'delivery/experience', files[0]), bytes = await readFile(path);
  const repeated = await f.command('approve'); assert.deepEqual(await readFile(path), bytes); assert.match(repeated.text, /最终体验：已通过/);
  await assert.rejects(f.command('reject'), /conflict|冲突/i); assert.deepEqual(await readFile(path), bytes);
  const forged = JSON.parse(bytes.toString('utf8')); forged.source.kind = 'model-output'; await writeFile(path, JSON.stringify(forged), 'utf8');
  assert.equal((await readRunStatus(f.root)).delivery?.userExperience, 'not_confirmed');
  await assert.rejects(f.command('approve'), /source|receipt|来源|回执/i);
  await writeFile(path, bytes);
  const published = await publishGenerationReport(f.root, { outcome: 'awaiting_user_experience', runId: f.state.run.runId, ledgerId: f.state.ledger.ledgerId,
    delivery: f.accepted.targetRoot, acceptedCandidate: f.accepted, gaps: [], effectiveTasks: f.report.effectiveTasks },
  { capability: f.report.acceptanceScope.capability, unsupported: [], requirement: { acceptance: f.report.acceptanceScope.acceptance } as RequirementContract });
  assert.equal(published.automaticAcceptance, 'passed'); assert.equal(published.finalCompletion, 'pending');
  assert.equal((await readRunStatus(f.root)).delivery?.userExperience, 'not_confirmed');
  assert.equal((await f.command('approve')).result.finalCompletion, 'complete_for_report_scope');
  assert.equal((await readdir(join(f.root, 'delivery/experience'))).length, 2);
});

for (const point of ['run-owner', 'registry-owner', 'receipt-sync']) test(`interrupt at ${point} cancels before receipt publication and releases owned locks`, async t => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const f = await fixture(t), snapshot = await readFile(join(f.root, 'snapshot.json')), marker = await readFile(join(f.root, 'delivery/current-report.json'));
    const probe = await open(join(f.root, 'sync-probe.tmp'), 'wx'), prototype = Object.getPrototypeOf(probe), sync = prototype.sync;
    await probe.close(); await unlink(join(f.root, 'sync-probe.tmp'));
    const acquire = OwnerLock.acquire; let armed = false, interrupted = false;
    OwnerLock.acquire = async function(root, name, ...args) {
      const owner = await acquire.call(this, root, name, ...args);
      if (point === 'run-owner' && name === '.controller.lock' || point === 'registry-owner' && name === '.commit.lock') { interrupted = true; process.emit(signal); }
      if (point === 'receipt-sync' && name === '.commit.lock') armed = true;
      return owner;
    };
    prototype.sync = async function() { await sync.call(this); if (armed) { armed = false; interrupted = true; process.emit(signal); } };
    try { assert.equal((await f.command('approve')).result.outcome, 'unconfirmed'); }
    finally { OwnerLock.acquire = acquire; prototype.sync = sync; }
    assert.equal(interrupted, true, 'The cancellation must occur inside commit, after explicit stdin');
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), snapshot); assert.deepEqual(await readFile(join(f.root, 'delivery/current-report.json')), marker);
    for (const path of ['.controller.lock', 'registry/.commit.lock']) await assert.rejects(readFile(join(f.root, path)), { code: 'ENOENT' });
    const receipts = await readdir(join(f.root, 'delivery/experience')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    assert.deepEqual(receipts, [], 'Cancellation cannot leave a decision or partial receipt');
    assert.equal((await readRunStatus(f.root)).delivery?.userExperience, 'not_confirmed');
  }
});

test('receipt publisher keeps legacy write-once behavior and cleans aborted synced temporary bytes before linking', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-receipt-cancel-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'receipt.json'); await publishReceipt(path, { original: true }); const bytes = await readFile(path);
  await assert.rejects(publishReceipt(path, { replaced: true }), { code: 'EEXIST' }); assert.deepEqual(await readFile(path), bytes);
  const probe = await open(join(root, 'sync-probe.tmp'), 'wx'), prototype = Object.getPrototypeOf(probe), sync = prototype.sync;
  await probe.close(); await unlink(join(root, 'sync-probe.tmp')); const cancellation = new AbortController();
  prototype.sync = async function() { await sync.call(this); cancellation.abort(); };
  try { await assert.rejects(publishReceipt(join(root, 'cancelled.json'), { decision: 'approved' }, cancellation.signal), error => error === cancellation.signal.reason); }
  finally { prototype.sync = sync; }
  assert.deepEqual(await readdir(root), ['receipt.json']); assert.deepEqual(await readFile(path), bytes);
});

test('late interruption after atomic receipt publication returns and recovers the committed decision', async t => {
  const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json')), close = OwnerLock.prototype.close; let interrupted = false;
  OwnerLock.prototype.close = async function() { await close.call(this); if (!interrupted) { interrupted = true; process.emit('SIGTERM'); } };
  let result: any;
  try { result = (await f.command('approve')).result; } finally { OwnerLock.prototype.close = close; }
  assert.equal(interrupted, true); assert.equal(result.userExperience, 'approved'); assert.equal(result.finalCompletion, 'complete_for_report_scope');
  assert.equal((await readRunStatus(f.root)).delivery?.userExperience, 'approved'); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  const files = await readdir(join(f.root, 'delivery/experience')), path = join(f.root, 'delivery/experience', files[0]), bytes = await readFile(path); assert.equal(files.length, 1);
  await f.command('approve'); assert.deepEqual(await readFile(path), bytes);
});
