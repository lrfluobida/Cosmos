import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { reservePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { fundedIntakeWork } from '../../src/runtime/public-validation-funding-validation.ts';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';
import { fakeInterviewSdk, type Reply } from '../roles/interview-recovery.fixture.ts';
import { PiSessionError } from '../../src/providers/pi.ts';

async function fixture(t: test.TestContext, replies: Reply[]) {
  const f = await fundingFixture(t), args = await f.authorization('truncation'), binding = await reservePublicValidationFunding(args);
  const sdk = fakeInterviewSdk(t, replies, true);
  const product = { ...createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: sdk.sessionFactory }), ordinaryProfile: undefined };
  const executed: any[] = []; let text = ''; const output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  const host = { ...product, async prepare() { return { environmentReady: true, executionReady: true }; },
    async execute(input: any) { executed.push(input); return { outcome: 'incomplete', fixtureOnly: true }; } };
  const run = (command: 'new' | 'resume', lines = '') => runCli(command === 'new'
    ? ['new', args.runRoot, '--brief', args.payload.brief, '--max-cny', '5', '--max-minutes', '30'] : ['resume', args.runRoot],
    { host, output, input: Readable.from([lines]), ...(command === 'new' ? { funding: binding } : {}) });
  return { ...f, ...args, ...sdk, run, product, executed, text: () => text };
}

test('funded public resume preserves old answers and charges, then requires actual draft confirmation', async t => {
  const f = await fixture(t, ['questions', 'length', 'draft']);
  await assert.rejects(f.run('new', '点击后显示胜利\n'), /truncated/);
  const failed = await f.child(f.runRoot);
  assert.equal(failed.requests.length, 2); assert.equal(failed.draft, null); assert.equal(failed.confirmation, null);
  assert.equal(failed.ledger.entries.reduce((sum: number, row: any) => sum + row.settledMicroCny, 0), 82_311);
  assert.equal(fundedIntakeWork(failed).pending.length, 0);
  const round = join(f.runRoot, 'intake-sessions/draft-1');
  const native = join('intake-sessions/draft-1/native', (await readdir(join(round, 'native')))[0]);
  const oldFiles = ['intake-answers/v1.json', 'intake-sessions/questions-1/reply.json', 'intake-sessions/draft-1/intent.json', native,
    ...failed.ledger.entries.map((row: any) => row.evidence.find((ref: any) => ref.artifactId.startsWith('billing-')).location)];
  const oldBytes = await Promise.all(oldFiles.map((path: string) => readFile(path.startsWith(f.runRoot) ? path : join(f.runRoot, path))));
  await f.run('resume', 'cancel\n');
  const prepared = await f.child(f.runRoot);
  assert.equal(prepared.formatVersion, 'intake-1'); assert.equal(prepared.draft.revision, 1); assert.equal(prepared.confirmation, null);
  assert.equal(prepared.run.originalStartedAt, undefined); assert.equal(prepared.requests.length, 3); assert.equal(f.executed.length, 0);
  assert.deepEqual(prepared.ledger.entries.slice(0, 2), failed.ledger.entries);
  assert.match(f.text(), /草稿 v1/); assert.match(f.text(), /confirm 1/);
  assert.deepEqual(f.configs.map(x => x.maxOutputTokens), [4096, 8192, 16384]);
  assert.deepEqual(f.bodies[2].messages, f.bodies[1].messages);
  for (let i = 0; i < oldFiles.length; i++) assert.ok((await readFile(oldFiles[i].startsWith(f.runRoot) ? oldFiles[i] : join(f.runRoot, oldFiles[i]))).equals(oldBytes[i]));
  const answers = JSON.parse(oldBytes[0].toString('utf8')), controller = await IntakeController.open({ root: f.runRoot });
  try { await f.product.draft({ controller, roundId: 'draft-1', ...answers }); } finally { await controller.close(); }
  assert.equal(f.bodies.length, 3);
  await f.run('resume', 'confirm 1\n');
  const active = await f.child(f.runRoot);
  assert.equal(f.executed.length, 1); assert.equal(f.executed[0].requirement.confirmedBy, 'local-user');
  assert.equal(active.run.runId, failed.run.runId); assert.equal(active.ledger.ledgerId, failed.ledger.ledgerId);
  assert.deepEqual(active.ledger, prepared.ledger); assert.equal(active.ledger.limitMicroCny, 5_000_000);
  assert.equal(Date.parse(active.run.originalDeadlineAt) - Date.parse(active.run.originalStartedAt), 1_800_000);
  assert.equal(f.bodies.length, 3);
  const shared = await f.snapshot(); assert.equal(shared.publicValidationFundings.length, 1);
  assert.equal(shared.publicValidationFundings[0].settlement, undefined); assert.equal(shared.publicValidationFundings[0].binding.limits.limitMicroCny, 5_000_000);
});

test('successor cannot bypass the original public funding authorization gate', async t => {
  const f = await fixture(t, ['questions', 'length', 'draft']);
  await assert.rejects(f.run('new', '点击后显示胜利\n'), /truncated/);
  const controller = await IntakeController.open({ root: f.runRoot }), before = await controller.read();
  const path = join(f.sharedRoot, f.authorization.location), original = await readFile(path), authorization = JSON.parse(original.toString('utf8'));
  authorization.actorId = 'changed'; await writeFile(path, JSON.stringify(authorization), 'utf8');
  try {
    const answers = JSON.parse(await readFile(join(f.runRoot, 'intake-answers/v1.json'), 'utf8'));
    await assert.rejects(f.product.draft({ controller, roundId: 'draft-1', ...answers }), (error: unknown) => error instanceof PiSessionError && error.code === 'admission_rejected');
    assert.equal(f.bodies.length, 2);
    assert.deepEqual((await controller.read()).ledger, before.ledger);
  } finally { await writeFile(path, original); await controller.close(); }
});
