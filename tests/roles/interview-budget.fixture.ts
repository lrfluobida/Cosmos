import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';
import { reservePublicValidationFunding, publishFundedOrigin } from '../../src/runtime/public-validation-funding.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { fakeInterviewSdk } from './interview-recovery.fixture.ts';
import type { Reply } from './interview-recovery.fixture.ts';
import { answers, questions, profile, proposal } from './ordinary.fixture.ts';

/** Temporary real funded controller and native Pi; synthetic transport only. */
export async function budgetFixture(t: TestContext, replies: Reply[] = ['draft'], now?: () => number, response: unknown = proposal) {
  let owner: IntakeController | undefined;
  t.after(async () => { await owner?.close(); });
  const shared = await fundingFixture(t), args = await shared.authorization();
  const binding = await reservePublicValidationFunding(args), root = args.runRoot;
  await publishFundedOrigin(root, { runId: binding.runId, brief: args.payload.brief, limits: binding.limits, ordinaryProfile: profile, validationFunding: binding });
  const controller = await IntakeController.create({ root, runId: binding.runId, ledgerId: binding.ledgerId, specVersion: '1.0',
    ...binding.limits, ordinaryProfile: profile, validationFunding: binding, interviewTaskId: 'intake', maxRequests: 8, ...(now ? { now } : {}),
    allocations: [{ taskId: 'intake', amountMicroCny: 250_000 }, { taskId: 'planning', amountMicroCny: 250_000 }] });
  owner = controller;
  await mkdir(join(root, 'intake-answers'));
  await writeFile(join(root, 'intake-answers/v1.json'), JSON.stringify({ brief: args.payload.brief, questions, answers, ordinaryProfile: profile }), 'utf8');
  const sdk = fakeInterviewSdk(t, replies, false, response);
  const options = { controller, roundId: 'draft-1', brief: args.payload.brief, questions, answers,
    maxOutputTokens: 16384, requestTimeoutMs: 5000, capabilities: 'Normal mouse input and visible assertions.',
    estimatedMaxCostMicroCny: (r: { inputBytes: number; maxOutputTokens: number }) => r.inputBytes * 2 + r.maxOutputTokens * 8,
    sessionFactory: sdk.sessionFactory };
  return { root, controller, options, ...sdk, async spend(amount: number, requestId = 'prior') {
    const budget = createRoleBudget({ controller, taskId: 'intake', evidenceDirectory: join(root, 'intake-sessions', requestId) });
    await budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 1, hasImages: false, estimatedMaxCostMicroCny: amount });
    await budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', stopReason: 'stop', elapsedMs: 1,
      usage: { input: Math.floor(amount / 2), output: 0, cacheRead: amount % 2 ? 25 : 0, cacheWrite: 0, totalTokens: 1,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  }, async native() {
    const directory = join(root, 'intake-sessions/draft-1/native'), names = await readdir(directory);
    assert.equal(names.length, 1);
    const path = join(directory, names[0]), bytes = await readFile(path);
    return { path, bytes, rows: bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line)) };
  }, legacyFactory: (config: PiSessionOptions) => createPiSession({ ...config, requestOutputLimit: undefined, env: { DEEPSEEK_API_KEY: 'offline-fixture' } }) };
}
