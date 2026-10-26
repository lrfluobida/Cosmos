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
import { reservePublicValidationFunding, verifyPublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { runPublicValidationCli } from '../../probes/public-cli/validation.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { confirmedSource, silentOutput } from '../runtime/confirmed-requirements.fixture.ts';
import { readConfirmedRequirementsSource } from '../../src/runtime/confirmed-requirements-source.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';

for (const when of ['before-stop', 'after-close', 'after-settlement']) test(`v2 source drift ${when} does not block accounting or independent v1 funding`, async t => {
  const source = await confirmedSource(t), original = await readConfirmedRequirementsSource({ root: source.root, revision: 2, specVersion: '1.0' });
  const f = await fundingFixture(t), args = await f.authorization(`accounting-${when}`);
  await writeFile(join(args.sharedRoot, args.authorization.location), JSON.stringify({ ...args.payload, formatVersion: 'public-validation-authorization/2', brief: source.draft.brief, requirementsSource: original.source }), 'utf8');
  await runPublicValidationCli(['new', args.runRoot, '--shared-root', args.sharedRoot, '--authorization', join(args.sharedRoot, args.authorization.location)], {
    input: Readable.from([]), output: silentOutput(), host: { ordinaryProfile: 'ordinary-design/1',
      async prepare() { return { environmentReady: false, executionReady: false }; }, async questions() { throw new Error('No interview'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execution'); } },
  });
  const drift = async () => {
    const path = join(source.root, 'intake-answers/v2.json'), value = JSON.parse(await readFile(path, 'utf8'));
    value.answers.goal = '源回答发生变化'; await writeFile(path, JSON.stringify(value), 'utf8');
  };
  if (when === 'before-stop') {
    await drift();
    await assert.rejects(verifyPublicValidationFunding({ root: args.runRoot, snapshot: await f.child(args.runRoot), dispatch: true }), /source|answer/i);
  }
  const owner = await IntakeController.open({ root: args.runRoot }); await owner.stop('End this isolated source fixture'); await owner.close();
  if (when === 'after-close') await drift();
  const result = await settlePublicValidationFunding({ ...args, fundingId: args.payload.fundingId });
  assert.equal(result.settledMicroCny, 0);
  if (when === 'after-settlement') await drift();
  const next = await f.authorization(`independent-${when}`), binding = await reservePublicValidationFunding(next);
  assert.equal(binding.runId, next.payload.runId); assert.equal((await f.snapshot()).publicValidationFundings.length, 2);
});

test('v2 funding wrapper binds the original complete requirements without a new interview', async t => {
  const phases: string[] = [];
  const generated = await ordinaryHostFixture(t, { sessionFactory: async config => ({ close: async () => {}, async prompt() {
    const packet = JSON.parse(config.context!); phases.push(packet.role);
    const requestId = 'reused-planning';
    await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 });
    await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } as any });
    throw new Error('Controlled boundary ends after real planning admission');
  } }) });
  const source = await confirmedSource(t, { draft: generated.draft }), original = await readConfirmedRequirementsSource({ root: source.root, revision: 2, specVersion: '1.0' });
  const f = await fundingFixture(t), args = await f.authorization('requirements-v2');
  args.runRoot = generated.root;
  const payload = { ...args.payload, formatVersion: 'public-validation-authorization/2', brief: source.draft.brief, requirementsSource: original.source };
  payload.runRoot = generated.root;
  await writeFile(join(args.sharedRoot, args.authorization.location), JSON.stringify(payload), 'utf8');
  let interviews = 0;
  await runPublicValidationCli(['new', args.runRoot, '--shared-root', args.sharedRoot, '--authorization', join(args.sharedRoot, args.authorization.location)], {
    input: Readable.from([]), output: silentOutput(), host: { ...generated.host,
      async questions() { interviews++; throw new Error('No interview'); }, async draft() { interviews++; throw new Error('No interview'); } },
  });
  const state = await f.child(args.runRoot);
  assert.equal(interviews, 0); assert.deepEqual(state.requirementsSource, original.source); assert.deepEqual(state.run.humanDecisions, []);
  assert.equal(state.run.runId, args.payload.runId); assert.equal((await f.snapshot()).publicValidationFundings.length, 1);
  assert.deepEqual(phases, ['cosmos']); assert.equal(state.ledger.entries.length, 1); assert.equal(state.ledger.entries[0].taskId, 'planning');
  const path = join(source.root, 'intake-answers/v2.json'), answers = JSON.parse(await readFile(path, 'utf8'));
  answers.answers.goal = '生成结束后的源漂移'; await writeFile(path, JSON.stringify(answers), 'utf8');
  const settled = await settlePublicValidationFunding({ ...args, fundingId: args.payload.fundingId });
  assert.equal(settled.settledMicroCny, state.ledger.entries[0].settledMicroCny);
  assert.deepEqual((await f.snapshot()).publicValidationFundings[0].settlement.requests[0].entry, state.ledger.entries[0]);
});

for (const changed of ['v1-source', 'v2-missing', 'revision', 'hash', 'brief', 'frames', 'identity', 'source-drift']) test(`v2 funding rejects ${changed} before reservation or host preparation`, async t => {
  const source = await confirmedSource(t), original = await readConfirmedRequirementsSource({ root: source.root, revision: 2, specVersion: '1.0' });
  const f = await fundingFixture(t), args = await f.authorization(`invalid-${changed}`);
  const payload: any = { ...args.payload, formatVersion: 'public-validation-authorization/2', brief: source.draft.brief, requirementsSource: original.source };
  if (changed === 'v1-source') payload.formatVersion = 'public-validation-authorization/1';
  if (changed === 'v2-missing') delete payload.requirementsSource;
  if (changed === 'revision') payload.requirementsSource.revision = 1;
  if (changed === 'hash') payload.requirementsSource.draftSha256 = '0'.repeat(64);
  if (changed === 'brief') payload.brief = '不能改写原要求';
  if (changed === 'frames') payload.renderFrames = true;
  if (changed === 'identity') payload.runId = source.state.run.runId;
  if (changed === 'source-drift') {
    const path = join(source.root, 'intake-answers/v2.json'), value = JSON.parse(await readFile(path, 'utf8')); value.answers.goal = '漂移'; await writeFile(path, JSON.stringify(value), 'utf8');
  }
  await writeFile(join(args.sharedRoot, args.authorization.location), JSON.stringify(payload), 'utf8');
  const before = await readFile(join(args.sharedRoot, 'snapshot.json')); let prepares = 0;
  await assert.rejects(runPublicValidationCli(['new', args.runRoot, '--shared-root', args.sharedRoot, '--authorization', join(args.sharedRoot, args.authorization.location)], {
    input: Readable.from([]), output: silentOutput(), host: { async prepare() { prepares++; return { environmentReady: true, executionReady: true }; },
      async questions() { throw new Error('No interview'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execution'); } },
  }));
  assert.equal(prepares, 0); assert.deepEqual(await readFile(join(args.sharedRoot, 'snapshot.json')), before);
});

test('v2 funding initialization retries preserve the one original reservation and source bytes', async t => {
  for (const phase of ['before-snapshot', 'before-binding', 'during-binding']) {
    const source = await confirmedSource(t), original = await readConfirmedRequirementsSource({ root: source.root, revision: 2, specVersion: '1.0' });
    const f = await fundingFixture(t), args = await f.authorization(`reuse-${phase}`);
    await writeFile(join(args.sharedRoot, args.authorization.location), JSON.stringify({ ...args.payload, formatVersion: 'public-validation-authorization/2', brief: source.draft.brief, requirementsSource: original.source }), 'utf8');
    const command = ['new', args.runRoot, '--shared-root', args.sharedRoot, '--authorization', join(args.sharedRoot, args.authorization.location)];
    const write = SnapshotStore.prototype.write; let interrupted = false, prepared = 0;
    const io = { input: Readable.from([]), output: silentOutput(), host: { ordinaryProfile: 'ordinary-design/1' as const,
      async prepare() { prepared++; return { environmentReady: false, executionReady: false }; }, async questions() { throw new Error('No interview'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execution'); } } };
    SnapshotStore.prototype.write = async function(value: any) {
      if (!interrupted && this.root === args.runRoot && value.formatVersion === 'intake-1' && (phase === 'during-binding' ? value.draft !== null : value.draft === null)) {
        interrupted = true; if (phase === 'before-binding') await write.call(this, value); throw new Error('Injected source initialization interruption');
      }
      return write.call(this, value);
    };
    try { await assert.rejects(runPublicValidationCli(command, io), /Injected/); }
    finally { SnapshotStore.prototype.write = write; }
    assert.equal(prepared, 0);
    await runPublicValidationCli(command, { ...io, input: Readable.from([]) });
    assert.equal(prepared, 1); const state = await f.child(args.runRoot);
    assert.deepEqual(state.requirementsSource, original.source); assert.equal(state.confirmation, null);
    assert.equal((await f.snapshot()).publicValidationFundings.length, 1); assert.equal(state.run.runId, args.payload.runId);
    assert.deepEqual(await readFile(join(args.runRoot, 'requirements/v2/confirmation.json')), original.confirmationBytes);
  }
});

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

test('operator retries initialization writes using the original identity and ordinary resume', async t => {
  for (const afterWrite of [false, true]) {
    const f = await fundingFixture(t), args = await f.authorization(`init-${afterWrite}`), write = SnapshotStore.prototype.write;
    let interrupted = false, calls = 0;
    const output = new PassThrough(); output.resume();
    const io = { input: Readable.from([]), output, host: {
      async prepare() { calls++; return { environmentReady: false, executionReady: false }; },
      async questions() { throw new Error('No question'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execution'); },
    } };
    const command = ['new', args.runRoot, '--shared-root', args.sharedRoot, '--authorization', join(args.sharedRoot, args.authorization.location)];
    SnapshotStore.prototype.write = async function(value) {
      if (!interrupted && this.root === args.runRoot && (value as any).formatVersion === 'intake-1') {
        interrupted = true; if (afterWrite) await write.call(this, value); throw new Error('Injected intake write interruption');
      }
      return write.call(this, value);
    };
    try { await assert.rejects(runPublicValidationCli(command, io), /Injected/); }
    finally { SnapshotStore.prototype.write = write; }
    assert.equal(calls, 0);
    await runPublicValidationCli(command, { ...io, input: Readable.from([]) });
    assert.equal(calls, 1);
    assert.equal((await f.child(args.runRoot)).run.runId, args.payload.runId);
    assert.equal((await f.snapshot()).publicValidationFundings.length, 1);
    const state = await f.child(args.runRoot), controller = await IntakeController.open({ root: args.runRoot });
    await controller.stop('No calls made'); await controller.close();
    const settled = await settlePublicValidationFunding({ ...args, fundingId: state.validationFunding.fundingId });
    assert.equal(settled.settledMicroCny, 0);
  }
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
  // This v1 fixture supplies the original scenario-bearing draft contract.
  host.ordinaryProfile = undefined;
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
