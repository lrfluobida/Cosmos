import assert from 'node:assert/strict';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { roleToolEnvironment } from '../../src/roles/factory.ts';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { continuationSessionFixture } from './continuation-session.fixture.ts';
import { runCli } from '../../src/cli/index.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { readCompletionTiming } from '../../src/runtime/completion-timing.ts';
import { loadExperienceBinding, readExperienceStatus, recordExperience } from '../../src/runtime/experience.ts';
import { OwnerLock } from '../../src/runtime/recovery/ownership.ts';
import { readRunStatus } from '../../src/cli/control.ts';
import { RunController } from '../../src/runtime/run.ts';

const output = () => { const value = new PassThrough(); value.resume(); return value; };
async function tree(root: string, prefix = ''): Promise<any> {
  const result: any = {};
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) Object.assign(result, await tree(root, file));
    else { const bytes = await readFile(join(root, file)), info = await stat(join(root, file)); result[file] = { sha256: createHash('sha256').update(bytes).digest('hex'), mtime: info.mtimeMs, length: bytes.length }; }
  }
  return result;
}
function continueInput() {
  const input = new PassThrough(), stream = new PassThrough(); let text = '', sent = false;
  stream.on('data', bytes => { text += bytes; const match = text.match(/confirm (cq1-[a-f0-9]{64})/); if (!sent && match) { sent = true; input.end(`confirm ${match[1]}\n`); } });
  return { input, output: stream };
}
const noHost = { prepare: async () => { throw new Error('No completed host preparation'); }, execute: async () => { throw new Error('No completed execution'); }, questions: async () => [], draft: async () => { throw new Error('No interview'); } };

test('new completed ordinary CLI and direct resume reuse timing, report and real fixture decision without writes', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true });
  const timing = await readCompletionTiming(f.root); assert.equal(timing.required, true); assert.equal(timing.current.status, 'in_time');
  const approved: any = await runCli(['experience', f.root], { input: Readable.from(['approve\n']), output: output() }); assert.equal(approved.userExperience, 'approved');
  const files = await tree(f.root), calls = [...f.calls];
  const resumed: any = await runCli(['resume', f.root], { host: noHost as any, input: Readable.from([]), output: output() });
  const direct: any = await executeGeneration({ ...f, resume: true, createHost: async () => { throw new Error('No direct completed host'); } });
  assert.deepEqual(resumed.completionTiming, timing); assert.deepEqual(direct.completionTiming, timing); assert.equal(resumed.userExperience, 'approved');
  assert.equal(resumed.humanWaiting.startedAt, timing.current.endedAt); assert.ok(resumed.humanWaiting.elapsedMs >= 0);
  assert.equal(resumed.experienceTiming.automaticReportedAt, JSON.parse(await readFile(join(f.root, resumed.report), 'utf8')).reportedAt);
  assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});

test('legacy completed report keeps approval and readonly compatibility with timing unverified', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true });
  await runCli(['experience', f.root], { input: Readable.from(['approve\n']), output: output() });
  const files = await tree(f.root), calls = [...f.calls];
  const result: any = await runCli(['resume', f.root], { host: noHost as any, input: Readable.from([]), output: output() });
  assert.equal(result.completionTiming.required, false); assert.equal(result.completionTiming.current.status, 'unverified'); assert.equal(result.completionTiming.current.endedAt, null);
  assert.equal(result.userExperience, 'approved'); assert.equal(result.humanWaiting.startedAt, null); assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});

test('new missing and tampered timing sidecars deny approval and cannot reopen completed execution', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true });
  const binding = await loadExperienceBinding(f.root), file = `delivery/completion-${binding.report.version}.json`, bytes = await readFile(join(f.root, file));
  const marker = await readFile(join(f.root, 'delivery/current-report.json')), calls = [...f.calls];
  for (const fault of ['missing', 'end', 'binding', 'nonce']) {
    if (fault === 'missing') await unlink(join(f.root, file));
    else { const value = JSON.parse(bytes.toString('utf8')); if (fault === 'end') value.current.endedAt = new Date().toISOString(); else if (fault === 'nonce') value.nonce = 'f'.repeat(64); else value.binding.windowId = 'wrong-window'; await writeFile(join(f.root, file), JSON.stringify(value), 'utf8'); }
    const before = await tree(f.root);
    assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed');
    await assert.rejects(recordExperience(f.root, binding, 'approve'), /timing/i);
    const resumed: any = await runCli(['resume', f.root], { host: noHost as any, input: Readable.from([]), output: output() });
    assert.equal(resumed.outcome, 'incomplete'); assert.equal(resumed.finalCompletion, 'pending'); assert.equal(resumed.completionTiming.current.status, 'unconfirmed');
    assert.deepEqual(await tree(f.root), before); await writeFile(join(f.root, file), bytes);
  }
  assert.deepEqual(await readFile(join(f.root, 'delivery/current-report.json')), marker); assert.deepEqual(f.calls, calls);
});

test('active owners, changed closed snapshot and report bytes cannot borrow a timing pass', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true }), binding = await loadExperienceBinding(f.root);
  for (const name of ['.controller.lock', 'registry/.commit.lock']) { const owner = await OwnerLock.acquire(f.root, name); try { assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed'); } finally { await owner.close(); } }
  const snapshot = await readFile(join(f.root, 'snapshot.json')), changed = JSON.parse(snapshot.toString('utf8')); changed.events.at(-1).reason = '{}';
  await writeFile(join(f.root, 'snapshot.json'), JSON.stringify(changed), 'utf8'); assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed'); await writeFile(join(f.root, 'snapshot.json'), snapshot);
  const report = await readFile(join(f.root, binding.report.location)); await writeFile(join(f.root, binding.report.location), report.toString('utf8') + ' ', 'utf8');
  await assert.rejects(readCompletionTiming(f.root), /hash/i); await writeFile(join(f.root, binding.report.location), report);
  const dist = join(f.root, binding.acceptedCandidate.targetRoot, 'dist/index.html'), distBytes = await readFile(dist);
  await writeFile(dist, '<p>changed sealed package</p>', 'utf8'); assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed'); await writeFile(dist, distBytes);
  assert.equal((await readCompletionTiming(f.root)).current.status, 'in_time');
});

test('explicit continuation completion waits for preparation, retains original score and readonly window resume', async t => {
  let released!: () => void, entered!: () => void;
  const gate = new Promise<void>(done => { released = done; }), reached = new Promise<void>(done => { entered = done; });
  const f = await continuationSessionFixture(t, { onHost: async (input, host) => { if (input.binding) host.closePreparation = async () => { entered(); await gate; }; } });
  const running: Promise<any> = runCli(['continue', f.root, '--add-cny', '1', '--add-minutes', '10'], { host: f.host, ...continueInput() });
  await reached;
  assert.ok(!(await readdir(join(f.root, 'delivery'))).some(name => /^completion-.*\.json$/.test(name)));
  await new Promise(done => setTimeout(done, 80)); released(); const result = await running;
  assert.equal(result.completionTiming.current.status, 'in_time'); assert.equal(result.completionTiming.original.status, 'unverified');
  assert.equal(result.originalResult.outcome, 'not_met'); assert.equal(result.completionTiming.binding.originalDeadlineAt, f.original.run.originalDeadlineAt);
  const files = await tree(f.root), calls = [...f.calls];
  const resumed: any = await runCli(['resume', f.root, '--window', result.windowId], { host: noHost as any, input: Readable.from([]), output: output() });
  assert.deepEqual(resumed.completionTiming, result.completionTiming); assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
  assert.equal((await readRunStatus(f.root)).delivery.completionTiming.current.status, 'in_time');
});

test('a new continuation keeps its previously measured initial endpoint unchanged', async t => {
  const f = await continuationSessionFixture(t, { entrypointOriginal: true });
  const initial = await readCompletionTiming(f.root); assert.equal(initial.current.status, 'in_time');
  const before = await readFile(join(f.root, initial.binding.report.ref.location));
  const controller = await RunController.open({ root: f.root }); await controller.stop('Fixture requests an additional window'); await controller.close();
  const result: any = await runCli(['continue', f.root, '--add-cny', '1', '--add-minutes', '10'], { host: f.host, ...continueInput() });
  assert.equal(result.completionTiming.current.status, 'in_time'); assert.deepEqual(result.completionTiming.original, initial.current);
  assert.deepEqual(await readFile(join(f.root, initial.binding.report.ref.location)), before);
  assert.ok(Date.parse(result.completionTiming.current.endedAt) > Date.parse(initial.current.endedAt));
});

test('a flagged generation cannot downgrade to a legacy report by removing its timing requirement', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true });
  const markerPath = join(f.root, 'delivery/current-report.json'), marker = JSON.parse(await readFile(markerPath, 'utf8'));
  const reportPath = join(f.root, marker.report.location), report = JSON.parse(await readFile(reportPath, 'utf8')); delete report.requiresCompletionTiming;
  const bytes = Buffer.from(JSON.stringify(report) + '\n'); await writeFile(reportPath, bytes); marker.sha256 = createHash('sha256').update(bytes).digest('hex'); await writeFile(markerPath, JSON.stringify(marker), 'utf8');
  const timing = await readCompletionTiming(f.root); assert.equal(timing.required, true); assert.equal(timing.current.status, 'unconfirmed');
  const binding = await loadExperienceBinding(f.root); await assert.rejects(recordExperience(f.root, binding, 'approve'), /timing/i);
});

test('rewriting a sidecar and its public checksum cannot replace the actual fixed endpoint', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true }), binding = await loadExperienceBinding(f.root);
  const file = `delivery/completion-${binding.report.version}.json`, value = JSON.parse(await readFile(join(f.root, file), 'utf8'));
  value.observedAt = new Date(Date.parse(value.observedAt) + 1000).toISOString();
  for (const field of ['current', 'original']) { value[field].endedAt = value.observedAt; value[field].elapsedMs += 1000; }
  const bytes = Buffer.from(JSON.stringify(value) + '\n'); await writeFile(join(f.root, file), bytes);
  const digest = JSON.parse(await readFile(join(f.root, `${file}.sha256.json`), 'utf8')); digest.sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(f.root, `${file}.sha256.json`), JSON.stringify(digest), 'utf8');
  assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed'); await assert.rejects(recordExperience(f.root, binding, 'approve'), /timing/i);
});

test('a replacement signing key cannot replace the key bound before owner close', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true }), binding = await loadExperienceBinding(f.root);
  const file = `delivery/completion-${binding.report.version}.json`, value = JSON.parse(await readFile(join(f.root, file), 'utf8')), keys = generateKeyPairSync('ed25519');
  value.binding.verificationKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const bytes = Buffer.from(JSON.stringify(value) + '\n'); await writeFile(join(f.root, file), bytes);
  await writeFile(join(f.root, `${file}.sha256.json`), JSON.stringify({ binding: value.binding, sha256: createHash('sha256').update(bytes).digest('hex'), signature: sign(null, bytes, keys.privateKey).toString('base64') }), 'utf8');
  assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed'); await assert.rejects(recordExperience(f.root, binding, 'approve'), /timing/i);
});

for (const fault of ['late', 'cleanup-failed']) test(`new ${fault} completion retains automatic report but refuses final approval`, async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true, onHost: async (input, host) => {
    host.closePreparation = async () => { if (fault === 'late') t.mock.method(Date, 'now', () => Date.parse(input.requirement.confirmedAt) + 13 * 60 * 60 * 1000); else throw new Error('Injected cleanup failure'); };
  } });
  t.mock.restoreAll();
  const timing = await readCompletionTiming(f.root), binding = await loadExperienceBinding(f.root), before = await tree(f.root), calls = [...f.calls];
  assert.equal(timing.current.status, fault === 'late' ? 'late' : 'unconfirmed'); assert.equal(timing.eligible, false);
  await assert.rejects(runCli(['experience', f.root], { input: Readable.from(['approve\n']), output: output() }), /timing/i);
  const resumed: any = await runCli(['resume', f.root], { host: noHost as any, input: Readable.from([]), output: output() });
  assert.equal(resumed.outcome, 'incomplete'); assert.equal(resumed.finalCompletion, 'pending'); assert.deepEqual(await tree(f.root), before); assert.deepEqual(f.calls, calls);
  const original = JSON.parse(await readFile(join(f.root, binding.report.location), 'utf8')); assert.equal(original.automaticAcceptance, 'passed');
});

test('new stopped completion is returned readonly by direct and public resume with its original stop intact', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true, onHost: async (input, host) => {
    host.closePreparation = () => input.controller.stop('Fixture stop in final cleanup');
  } });
  const before = await tree(f.root), calls = [...f.calls];
  const direct: any = await executeGeneration({ ...f, resume: true, createHost: async () => { throw new Error('Stopped completed host must not reopen'); } });
  const cli: any = await runCli(['resume', f.root], { host: noHost as any, input: Readable.from([]), output: output() });
  assert.equal(direct.outcome, 'incomplete'); assert.equal(cli.outcome, 'incomplete'); assert.equal(direct.completionTiming.stopReason.code, 'manual');
  assert.deepEqual(direct.completionTiming, cli.completionTiming); assert.deepEqual(await tree(f.root), before); assert.deepEqual(f.calls, calls);
});

test('cold compiled CLI reuses the signed endpoint without credentials or any file mutation', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true }), timing = await readCompletionTiming(f.root), before = await tree(f.root);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url)), 'resume', f.root],
    { encoding: 'utf8', env: roleToolEnvironment(), windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr); const returned = JSON.parse(result.stdout);
  assert.equal(returned.completionTiming.current.endedAt, timing.current.endedAt); assert.deepEqual(await tree(f.root), before);
});
