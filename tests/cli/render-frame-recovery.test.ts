import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { continuationSessionFixture } from './continuation-session.fixture.ts';
import { roleToolEnvironment } from '../../src/roles/factory.ts';

const output = () => { const stream = new PassThrough(); stream.resume(); return stream; };
const noHost = () => { const fail = async () => { throw new Error('No host or SDK call in readonly/refusal'); }; return { prepare: fail, questions: fail, draft: fail, execute: fail }; };
async function tree(root: string, prefix = ''): Promise<Record<string, unknown>> {
  const found: Record<string, unknown> = {};
  for (const file of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${file.name}` : file.name;
    if (file.isDirectory()) Object.assign(found, await tree(root, path));
    else { const bytes = await readFile(join(root, path)), info = await stat(join(root, path)); found[path] = { sha256: createHash('sha256').update(bytes).digest('hex'), mtimeMs: info.mtimeMs }; }
  }
  return found;
}
function confirmWindow(beforeConfirm?: () => Promise<void>) {
  const input = new PassThrough(), stream = new PassThrough(); let text = '', replied = false;
  stream.on('data', bytes => { text += bytes; const match = text.match(/confirm (cq1-[a-f0-9]{64})/); if (match && !replied) { replied = true; void (async () => { await beforeConfirm?.(); input.end(`confirm ${match[1]}\n`); })(); } });
  return { input, output: stream };
}
test('completed selected original public/direct/status remain readonly including sample and endpoint bytes', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true, renderFrames: true });
  const decided: any = await runCli(['experience', f.root], { input: Readable.from(['approve\n']), output: output() }); assert.equal(decided.userExperience, 'approved');
  const files = await tree(f.root), calls = [...f.calls];
  const resumed: any = await runCli(['resume', f.root], { host: noHost(), input: Readable.from([]), output: output() });
  const direct: any = await executeGeneration({ ...f, resume: true, createHost: async () => { throw new Error('No completed assembly'); } });
  const status: any = await runCli(['status', f.root], { output: output() });
  assert.equal(direct.report, resumed.report); assert.equal(resumed.userExperience, 'approved'); assert.equal(status.renderFrames.enabled, true);
  assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});
test('first coding continuation keeps source capture and restores selection into the original authorized scope', async t => {
  let bound = false;
  const f = await continuationSessionFixture(t, { renderFrames: true, onHost: async (input, host) => {
    if (input.binding) { assert.equal(input.renderFrames, true); assert.ok(host.availableArtifacts.some((ref: any) => ref.artifactId === 'render-frame-observer')); bound = true; }
  } });
  const before = await readFile(join(f.root, 'registry/captures/render-frame-observer/v1/files/_cosmos/render-frame-observer.ts'));
  const result: any = await runCli(['continue', f.root, '--add-cny', '1', '--add-minutes', '10'], { host: f.host, ...confirmWindow() });
  assert.equal(result.outcome, 'awaiting_user_experience'); assert.equal(bound, true);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.run.originalStartedAt, f.original.run.originalStartedAt); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt); assert.equal(state.ledger.ledgerId, f.original.ledger.ledgerId);
  assert.ok((await readFile(join(f.root, 'registry/captures/render-frame-observer/v1/files/_cosmos/render-frame-observer.ts'))).equals(before));
  const files = await tree(f.root), calls = [...f.calls];
  const resumed: any = await runCli(['resume', f.root, '--window', result.windowId], { host: noHost(), input: Readable.from([]), output: output() });
  const direct: any = await executeGeneration({ ...f, resume: true, windowId: result.windowId });
  assert.equal(resumed.report, result.report); assert.equal(direct.report, result.report); assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});
test('selection drift during stdin confirmation refuses before first window activation', async t => {
  const f = await continuationSessionFixture(t, { renderFrames: true });
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(runCli(['continue', f.root, '--add-cny', '1', '--add-minutes', '10'], { host: f.host, ...confirmWindow(async () => {
    const path = join(f.root, 'intake-origin.json'), origin = JSON.parse(await readFile(path, 'utf8')); delete origin.renderFrames; await writeFile(path, JSON.stringify(origin), 'utf8');
  }) }), /selection|source|采样|选择/i);
  assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before));
});
test('lost confirmed selection, changed source/capture and available observer refuse without writer effects', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, renderFrames: true });
  const originPath = join(f.root, 'intake-origin.json'), receiptPath = join(f.root, f.requirement.sources[1].location), executionPath = join(f.root, 'execution.json');
  const capturePath = join(f.root, 'registry/captures/render-frame-observer/v1/files/_cosmos/render-frame-observer.ts');
  const saved = new Map(await Promise.all([originPath, receiptPath, executionPath, capturePath].map(async path => [path, await readFile(path)] as const)));
  const changes = [
    async () => { for (const path of [originPath, receiptPath]) { const value = JSON.parse(saved.get(path)!.toString('utf8')); delete value.renderFrames; await writeFile(path, JSON.stringify(value), 'utf8'); } },
    async () => { const value = JSON.parse(saved.get(receiptPath)!.toString('utf8')); value.renderFrames.observerSha256 = 'f'.repeat(64); await writeFile(receiptPath, JSON.stringify(value), 'utf8'); },
    async () => { await writeFile(capturePath, '// changed fixture capture\n', 'utf8'); },
    async () => { const value = JSON.parse(saved.get(executionPath)!.toString('utf8')); value.availableArtifacts = value.availableArtifacts.filter((ref: any) => ref.artifactId !== 'render-frame-observer'); await writeFile(executionPath, JSON.stringify(value), 'utf8'); },
    async () => { const value = JSON.parse(saved.get(executionPath)!.toString('utf8')); value.availableArtifacts.find((ref: any) => ref.artifactId === 'render-frame-observer').version = 'v2'; await writeFile(executionPath, JSON.stringify(value), 'utf8'); },
  ];
  for (const change of changes) {
    await change(); const files = await tree(f.root), calls = [...f.calls];
    await assert.rejects(runCli(['resume', f.root], { host: noHost(), input: Readable.from([]), output: output() }));
    await assert.rejects(executeGeneration({ ...f, resume: true })); await assert.rejects(runCli(['status', f.root], { output: output() }));
    assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
    for (const [path, bytes] of saved) await writeFile(path, bytes);
  }
});
test('cold compiled CLI keeps selected signed report, sample and decision without credentials or mutation', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true, renderFrames: true });
  await runCli(['experience', f.root], { input: Readable.from(['approve\n']), output: output() });
  const files = await tree(f.root), calls = [...f.calls], cli = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
  const resume = spawnSync(process.execPath, [cli, 'resume', f.root, '--render-frames', 'true'], { encoding: 'utf8', env: roleToolEnvironment(), windowsHide: true, timeout: 15000 });
  assert.equal(resume.status, 0, resume.stderr); const resumed = JSON.parse(resume.stdout); assert.equal(resumed.userExperience, 'approved');
  const status = spawnSync(process.execPath, [cli, 'status', f.root], { encoding: 'utf8', env: roleToolEnvironment(), windowsHide: true, timeout: 15000 });
  assert.equal(status.status, 0, status.stderr); assert.equal(JSON.parse(status.stdout).renderFrames.enabled, true);
  assert.deepEqual(await tree(f.root), files); assert.deepEqual(f.calls, calls);
});
