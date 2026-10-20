import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { groupFixture } from './validation-group.fixture.ts';
import type { PublicValidationAuthorization } from '../../src/runtime/public-validation-funding-types.ts';
import { PassThrough, Readable } from 'node:stream';
import { runCli } from '../../src/cli/index.ts';
import { reservePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';

export async function fundingFixture(t: TestContext, spent = 1_116_402) {
  const f = await groupFixture(t, spent);
  const authorization = async (name = 'one', limitMicroCny = 5_000_000) => {
    const shared = await f.snapshot(), runRoot = resolve(f.root, '..', `公共运行-${name}`);
    const payload: PublicValidationAuthorization = {
      formatVersion: 'public-validation-authorization/1', fundingId: name,
      sharedRoot: resolve(f.root), sharedRunId: shared.run.runId, sharedLedgerId: shared.ledger.ledgerId,
      runRoot, runId: `game-${name}`, ledgerId: `game-${name}-budget`,
      limits: { limitMicroCny, durationMs: 1_800_000 }, brief: '鼠标配对小游戏', renderFrames: false,
      decisionId: `operator-${name}`, actorId: 'offline-operator', decidedAt: new Date().toISOString(), sourceRefs: f.evidence,
    };
    const ref = { artifactId: 'funding-authorization', version: name, location: `funding-${name}.json` };
    await writeFile(join(f.root, ref.location), JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return { sharedRoot: resolve(f.root), runRoot, authorization: ref, payload };
  };
  return { ...f, authorization, child: async (root: string) => JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')) };
}

export async function fundedIntake(f: Awaited<ReturnType<typeof fundingFixture>>, name = 'one', cap = 5_000_000) {
  const args = await f.authorization(name, cap), binding = await reservePublicValidationFunding(args);
  const output = new PassThrough(); output.resume();
  await runCli(['new', args.runRoot, '--brief', args.payload.brief, '--max-cny', (cap / 1_000_000).toFixed(6), '--max-minutes', '30'], {
    funding: binding, input: Readable.from([]), output, host: {
      async prepare() { return { environmentReady: false, executionReady: false }; },
      async questions() { throw new Error('No question'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execution'); },
    },
  });
  const controller = await IntakeController.open({ root: args.runRoot });
  return { ...args, binding, controller };
}

export async function chargeIntake(value: Awaited<ReturnType<typeof fundedIntake>>, requestId: string, input = 1, estimate = 20) {
  const budget = createRoleBudget({ controller: value.controller, taskId: 'intake', evidenceDirectory: join(value.runRoot, 'intake-sessions', requestId) });
  await budget.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: estimate });
  await budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input, output: 0, cacheRead: 0, cacheWrite: 0 } as any });
}
