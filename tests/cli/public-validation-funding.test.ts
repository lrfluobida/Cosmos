import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';
import { reservePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';

test('public new rejects an unverified funding binding before touching the host', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'cos109-cli-')), root = join(parent, '运行');
  t.after(() => removeOwned(tmpdir(), parent));
  const output = new PassThrough(); output.resume(); let hostCalls = 0;
  await assert.rejects(runCli(['new', root, '--brief', '鼠标配对', '--max-cny', '5', '--max-minutes', '30'], {
    funding: { fundingId: 'not-authorized' }, input: Readable.from([]), output,
    host: {
      async prepare() { hostCalls++; return { environmentReady: false, executionReady: false }; },
      async questions() { throw new Error('No questions expected'); },
      async draft() { throw new Error('No draft expected'); },
      async execute() { throw new Error('No execution expected'); },
    },
  } as Parameters<typeof runCli>[1]), /funding|authorization/i);
  assert.equal(hostCalls, 0);
});

test('real public stdin confirms the displayed draft before the original generation factory admits planning', { timeout: 120_000 }, async t => {
  const f = await fundingFixture(t), args = await f.authorization('stdin'), binding = await reservePublicValidationFunding(args);
  const input = new PassThrough(), output = new PassThrough(), phases: string[] = [];
  let answered = false, wrong = false, confirmed = false, displayed = false;
  output.on('data', data => {
    const text = data.toString('utf8');
    if (text.includes('游戏范围？') && !answered) { answered = true; input.write('全部配对获胜\n'); }
    if (text.includes('草稿 v1')) displayed = true;
    if (text.includes('确认当前版本请输入')) {
      assert.equal(displayed, true); assert.equal(phases.includes('planning'), false);
      if (!wrong) { wrong = true; input.write('confirm 0\n'); }
      else if (!confirmed) { confirmed = true; input.write('confirm 1\n'); }
    }
  });
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: async config => {
    const packet = JSON.parse(config.context!), phase = packet.role === 'design-intake' ? packet.input.phase : 'planning';
    return { close: async () => {}, async prompt() {
      if (phase === 'planning') assert.equal(confirmed, true);
      const requestId = `stdin-${phase}`;
      await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false,
        estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
      phases.push(phase);
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      if (phase === 'planning') throw new Error('Bounded free fixture ends after the real planning admission.');
      return { text: JSON.stringify(phase === 'questions' ? { questions: [{ id: 'scope', prompt: '游戏范围？' }] } : {
        acceptance: [{ acceptanceId: 'win', description: '点击配对', steps: ['点击两个相同目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
        scenario: { viewport: { width: 800, height: 600 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#pair', timeoutMs: 1000 },
          { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] }, unsupported: [],
      }) };
    } };
  } });
  host.prepare = async root => {
    await mkdir(join(root, 'toolchain'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}' : '{}', 'utf8');
    return { environmentReady: true, executionReady: true };
  };
  const result: any = await runCli(['new', args.runRoot, '--brief', args.payload.brief, '--max-cny', '5', '--max-minutes', '30'], { funding: binding, host, input, output });
  input.end();
  assert.deepEqual(phases, ['questions', 'draft', 'planning']); assert.equal(wrong && confirmed, true); assert.equal(result.outcome, 'incomplete');
  const state = await f.child(args.runRoot);
  assert.equal(state.run.runId, binding.runId); assert.equal(state.ledger.entries.length, 3);
  assert.equal(state.run.originalDeadlineAt && Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt), 1_800_000);
  assert.equal(state.run.humanDecisions[0].actorId, 'local-user');
  await assert.rejects(buildContinuationQuote({ root: args.runRoot, additionalMicroCny: 1, additionalDurationMs: 60_000 }), /funding/i);
  const controller = await RunController.open({ root: args.runRoot });
  await controller.stop('The bounded planning fixture is complete'); await controller.close();
  const settlement = await settlePublicValidationFunding({ ...args, fundingId: binding.fundingId });
  assert.equal(settlement.settledMicroCny, 30);
});

test('funded public new preserves the authorized identity and cap before host preparation', async t => {
  const f = await fundingFixture(t), args = await f.authorization(), binding = await reservePublicValidationFunding(args);
  const output = new PassThrough(); output.resume(); let checked = false;
  await runCli(['new', args.runRoot, '--brief', args.payload.brief, '--max-cny', '5', '--max-minutes', '30'], {
    funding: binding, input: Readable.from([]), output, host: {
      async prepare() {
        const state = await f.child(args.runRoot);
        assert.equal(state.run.runId, binding.runId); assert.equal(state.ledger.ledgerId, binding.ledgerId);
        assert.deepEqual(state.validationFunding, binding); assert.equal(state.ledger.limitMicroCny, 5_000_000);
        checked = true; return { environmentReady: false, executionReady: false };
      },
      async questions() { throw new Error('No questions expected'); },
      async draft() { throw new Error('No draft expected'); },
      async execute() { throw new Error('No execution expected'); },
    },
  });
  assert.equal(checked, true);
});
