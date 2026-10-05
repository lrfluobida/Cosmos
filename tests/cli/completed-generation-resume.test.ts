import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { readExperienceStatus } from '../../src/runtime/experience.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnerLock } from '../../src/runtime/recovery/ownership.ts';
import { createRoleBudget, ROLE_PRICING_VERSION } from '../../src/roles/provider-budget.ts';
import { continuationSessionFixture } from './continuation-session.fixture.ts';

function output() { const stream = new PassThrough(); stream.resume(); return stream; }
async function experience(root: string, answer: 'approve' | 'reject') {
  return runCli(['experience', root], { input: Readable.from([answer + '\n']), output: output() }) as Promise<any>;
}
function noExecution() {
  const fail = async () => { throw new Error('Completed resume must not enter host preparation or execution'); };
  return { prepare: fail, execute: fail, questions: fail, draft: fail };
}
async function tree(root: string, prefix = ''): Promise<Record<string, unknown>> {
  const found: Record<string, unknown> = {};
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) Object.assign(found, await tree(root, path));
    else { const bytes = await readFile(join(root, path)), info = await stat(join(root, path)); found[path] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, mtimeMs: info.mtimeMs }; }
  }
  return found;
}
function continuationInput() {
  const input = new PassThrough(), stream = new PassThrough(); let text = '', answered = false;
  stream.on('data', bytes => { text += bytes; const match = text.match(/confirm (cq1-[a-f0-9]{64})/); if (match && !answered) { answered = true; input.end(`confirm ${match[1]}\n`); } });
  return { input, output: stream };
}

test('completed original public resume retains the immutable report and fixture stdin approval', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true });
  const decided = await experience(f.root, 'approve'); assert.equal(decided.userExperience, 'approved');
  const marker = await readFile(join(f.root, 'delivery/current-report.json')), before = [...f.calls], files = await tree(f.root);
  const resumed: any = await runCli(['resume', f.root], { host: f.host, input: Readable.from([]), output: output() });
  assert.deepEqual(await readFile(join(f.root, 'delivery/current-report.json')), marker, 'A completed resume must retain the original report UUID/hash');
  assert.equal(resumed.userExperience, 'approved'); assert.equal((await readExperienceStatus(f.root)).userExperience, 'approved');
  const runtime: any = await executeGeneration({ ...f, resume: true, createHost: async () => { throw new Error('No completed runtime host assembly'); } });
  assert.equal(runtime.report, resumed.report); assert.equal(runtime.userExperience, 'approved');
  assert.deepEqual(f.calls, before); assert.deepEqual(await tree(f.root), files);
});

test('completed explicit window public resume retains approval after a simulated deadline', async t => {
  const f = await continuationSessionFixture(t);
  const first: any = await runCli(['continue', f.root, '--add-cny', '1', '--add-minutes', '10'], { host: f.host, ...continuationInput() });
  assert.equal(first.outcome, 'awaiting_user_experience'); assert.equal((await experience(f.root, 'approve')).userExperience, 'approved');
  const before = [...f.calls], files = await tree(f.root), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const withinDeadline: any = await runCli(['resume', f.root, '--window', first.windowId], { host: noExecution(), input: Readable.from([]), output: output() });
  assert.equal(withinDeadline.report, first.report); assert.equal(withinDeadline.userExperience, 'approved');
  const dateNow = Date.now; Date.now = () => Date.parse(state.continuation.windows[0].deadlineAt) + 1000; // Offline clock fixture; no real 12h proof.
  try {
    const resumed: any = await runCli(['resume', f.root, '--window', first.windowId], { host: f.host, input: Readable.from([]), output: output() });
    assert.equal(resumed.report, first.report); assert.equal(resumed.userExperience, 'approved');
    const runtime: any = await executeGeneration({ ...f, resume: true, windowId: first.windowId });
    assert.equal(runtime.report, first.report); assert.equal(runtime.userExperience, 'approved');
  } finally { Date.now = dateNow; }
  assert.deepEqual(f.calls, before); assert.deepEqual(await tree(f.root), files);
});

test('completed direct runtime refuses a changed original confirmation source', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true }), path = join(f.root, f.requirement.sources[1].location);
  const confirmed = JSON.parse(await readFile(path, 'utf8')); confirmed.actorId = 'changed-user'; await writeFile(path, JSON.stringify(confirmed), 'utf8');
  const files = await tree(f.root), calls = [...f.calls];
  await assert.rejects(executeGeneration({ ...f, resume: true }), /confirmation|confirmed|确认/i);
  assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});

test('completed original pending and rejected decisions remain stable without host prerequisites', async t => {
  for (const decision of [null, 'reject'] as const) {
    const f = await continuationSessionFixture(t, { completeOriginal: true });
    const status: any = decision ? await experience(f.root, decision) : await readExperienceStatus(f.root);
    const files = await tree(f.root), calls = [...f.calls], marker = JSON.parse(await readFile(join(f.root, 'delivery/current-report.json'), 'utf8'));
    const reported = JSON.parse(await readFile(join(f.root, marker.report.location), 'utf8'));
    const now = Date.now; Date.now = () => Date.parse(f.original.run.originalDeadlineAt) + 1000; // Offline clock fixture.
    try {
      for (let repeat = 0; repeat < 2; repeat++) {
        const resumed: any = await runCli(['resume', f.root], { host: noExecution(), input: Readable.from([]), output: output() });
        assert.equal(resumed.report, marker.report.location); assert.equal(resumed.userExperience, status.userExperience); assert.equal(resumed.finalCompletion, 'pending');
        assert.equal(resumed.experienceTiming.automaticReportedAt, reported.reportedAt); assert.equal(resumed.experienceTiming.decidedAt, status.decision?.decidedAt ?? null);
        assert.equal(resumed.experienceTiming.elapsedSinceAutomaticReportMs, Math.max(0, (status.decision ? Date.parse(status.decision.decidedAt) : Date.now()) - Date.parse(reported.reportedAt)));
        assert.equal('generationEndedAt' in resumed, false);
      }
      const runtime: any = await executeGeneration({ ...f, resume: true, createHost: async () => { throw new Error('No runtime host assembly'); } });
      assert.equal(runtime.report, marker.report.location); assert.equal(runtime.userExperience, status.userExperience);
    } finally { Date.now = now; }
    assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
  }
});

test('completed report proof and mode drift reject before a writer or new report', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true }), calls = [...f.calls];
  const markerPath = join(f.root, 'delivery/current-report.json'), markerBytes = await readFile(markerPath), marker = JSON.parse(markerBytes.toString('utf8'));
  const reportPath = join(f.root, marker.report.location), reportBytes = await readFile(reportPath), original = JSON.parse(reportBytes.toString('utf8'));
  const select = async (report: any) => { const bytes = Buffer.from(JSON.stringify(report) + '\n'); await writeFile(reportPath, bytes); await writeFile(markerPath, JSON.stringify({ ...marker, sha256: createHash('sha256').update(bytes).digest('hex') }), 'utf8'); };
  for (const changed of ['hash', 'candidate', 'task', 'review', 'acceptance', 'mode', 'candidate-bytes']) {
    const report = structuredClone(original); let path: string | undefined, bytes: Buffer | undefined;
    if (changed === 'hash') await writeFile(reportPath, Buffer.concat([reportBytes, Buffer.from('\n')]));
    if (changed === 'candidate') { report.acceptedCandidate.candidateRef.version = 'wrong-version'; await select(report); }
    if (changed === 'task') { report.effectiveTasks[0].taskId = 'missing-task'; await select(report); }
    if (changed === 'review') { report.acceptedCandidate.review.reviewerId = report.acceptedCandidate.review.contextId; await select(report); }
    if (changed === 'acceptance') { report.acceptanceScope.acceptance[0].description = 'Changed confirmed acceptance'; await select(report); }
    if (changed === 'mode') { path = join(f.root, 'intake-mode.json'); await writeFile(path, JSON.stringify({ runId: f.original.run.runId, createdAt: f.original.events[0].at, draftMode: 'cos16-input/1' }), 'utf8'); }
    if (changed === 'candidate-bytes') { path = join(f.root, original.delivery, 'src/main.ts'); bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('// changed\n')])); }
    const files = await tree(f.root);
    await assert.rejects(runCli(['resume', f.root], { host: f.host, input: Readable.from([]), output: output() }), error => error instanceof Error && !error.message.startsWith('Usage:'));
    await assert.rejects(executeGeneration({ ...f, resume: true }));
    assert.deepEqual(await tree(f.root), files, `${changed} rejection must preserve its input and avoid all writer effects`); assert.deepEqual(f.calls, calls);
    await writeFile(reportPath, reportBytes); await writeFile(markerPath, markerBytes);
    if (path) { if (bytes) await writeFile(path, bytes); else await unlink(path); }
  }
  const files = await tree(f.root);
  await assert.rejects(runCli(['resume', f.root, '--window', 'wrong-window'], { host: f.host, input: Readable.from([]), output: output() }), /窗口/);
  await assert.rejects(runCli(['resume', f.root, '--adapter', 'sokoban'], { host: f.host, input: Readable.from([]), output: output() }), /mode/i);
  assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});

test('completed owner and charge gates reject read-only while durable stops remain final', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true });
  const reject = async (pattern: RegExp) => {
    const files = await tree(f.root), calls = [...f.calls];
    await assert.rejects(runCli(['resume', f.root], { host: f.host, input: Readable.from([]), output: output() }), pattern);
    await assert.rejects(executeGeneration({ ...f, resume: true }), pattern);
    assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
  };
  for (const [root, name] of [[f.root, '.controller.lock'], [join(f.root, 'registry'), '.commit.lock']]) {
    const lock = await OwnerLock.acquire(root, name); try { await reject(/owner|writer/i); } finally { await lock.close(); }
  }
  const controller = await RunController.open({ root: f.root });
  await controller.reserve({ requestId: 'pending-completion-charge', taskId: 'code-task', provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION, estimatedMaxCostMicroCny: 20 });
  await controller.close(); await reject(/reconciliation/i);
  const admitted = await RunController.open({ root: f.root });
  await admitted.admit('pending-completion-charge'); await admitted.markUnknown('pending-completion-charge', [{ artifactId: 'unknown', version: 'v1', location: 'snapshot.json#requests' }]);
  await admitted.close(); await reject(/reconciliation/i);
  const stopped = await RunController.open({ root: f.root }); await stopped.stop('Offline hard stop after delivery'); await stopped.close(); await reject(/stopped/i);
});

test('missing completion report keeps the existing legal receipt reconciliation path', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true }), controller = await RunController.open({ root: f.root });
  const billing = createRoleBudget({ controller, taskId: 'code-task', evidenceDirectory: join(f.root, 'sessions/completion-charge/author') });
  await billing.beforeRequest({ requestId: 'settlement-interrupted', modelId: 'deepseek-flash', inputBytes: 10, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 20 });
  controller.settle = async () => { throw new Error('Offline settlement interruption'); };
  await assert.rejects(billing.afterResponse({ requestId: 'settlement-interrupted', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }), /interruption/);
  await controller.close(); await unlink(join(f.root, 'delivery/current-report.json'));
  const calls = [...f.calls], result: any = await runCli(['resume', f.root], { host: f.host, input: Readable.from([]), output: output() });
  assert.equal(result.outcome, 'awaiting_user_experience'); assert.deepEqual(f.calls, calls);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), charged = state.ledger.entries.find((entry: any) => entry.requestId === 'settlement-interrupted');
  assert.equal(charged.status, 'settled'); assert.equal(charged.settledMicroCny, 10); assert.equal(charged.reservedMicroCny, 0);
  assert.equal(state.run.originalStartedAt, f.original.run.originalStartedAt); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
});

test('cold compiled public resume returns the same approved report without API credentials', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true }); await experience(f.root, 'approve');
  const files = await tree(f.root), calls = [...f.calls], repository = new URL('../../', import.meta.url);
  const compile = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', repository)), '-p', fileURLToPath(new URL('tsconfig.json', repository))], { encoding: 'utf8', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  assert.equal(compile.status, 0, compile.stderr + compile.stdout);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('dist/cli/index.js', repository)), 'resume', f.root], { encoding: 'utf8', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  assert.equal(child.status, 0, child.stderr + child.stdout); const result = JSON.parse(child.stdout);
  assert.equal(result.userExperience, 'approved'); assert.equal(result.finalCompletion, 'complete_for_report_scope');
  assert.equal(result.report, JSON.parse(await readFile(join(f.root, 'delivery/current-report.json'), 'utf8')).report.location);
  assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});
