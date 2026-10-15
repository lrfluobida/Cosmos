import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase, validationInputHash, verifyValidationIdentity } from '../../src/runtime/validation-window.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { requireValidationScope, isValidationScopeTimeout } from '../../src/runtime/validation-scope.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { createNativeValidationWaits, associateNativeReadSignal } from '../../src/acceptance/native-validation-waits.ts';
import { currentValidationCase } from '../../src/runtime/validation-validation.ts';
import type { TaskContract } from '../../src/contracts/index.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Real small controller and file authority; no SDK, browser or historical request replay. */
async function fixture(t: TestContext, historicalBytes?: Uint8Array) {
  const base = await mkdtemp(join(tmpdir(), 'cos95-scope-')), root = join(base, 'ledger'), repositoryRoot = join(base, 'platform');
  const controllers: RunController[] = [];
  t.after(async () => {
    for (const controller of controllers) await controller.close();
    assert.equal(dirname(resolve(base)), resolve(tmpdir())); assert.ok(basename(base).startsWith('cos95-scope-'));
    await rm(base, { recursive: true, force: true });
  });
  let clock = Date.now() - 2000;
  const now = () => clock;
  const old = await RunController.create({ root, runId: 'scope-run', ledgerId: 'scope-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0',
    durationMs: 1000, now, allocations: [{ taskId: 'legacy', amountMicroCny: 1_000_000 }] });
  controllers.push(old);
  await old.importSettled({ requestId: 'prior', taskId: 'legacy', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 100,
    evidence: [{ artifactId: 'prior', version: 'v1', location: 'prior.json' }] });
  const original = await old.read(); await old.close(); clock += 2000;
  await mkdir(join(repositoryRoot, 'template'), { recursive: true });
  const requirements = JSON.stringify({ specVersion: '1.0', requirementVersion: 'fixture-v1', acceptanceIds: ['game-1'], stageAcceptanceIds: ['design-1', 'media-1'], rule: '保留固定验收' });
  const template = '{"fixture":true}\n', sourcePath = join(repositoryRoot, 'requirements.json');
  await writeFile(sourcePath, requirements, 'utf8'); await writeFile(join(repositoryRoot, 'template/package.json'), template, 'utf8');
  const files = [{ path: 'template/package.json', sha256: hash(template) }], caseId = 'cos20-scope-authority';
  const declaration: ValidationDeclaration = {
    formatVersion: 'validation-declaration-1', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
    limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000, durationMs: 2_700_000, maxRequests: 40, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
    grants: {
      planning: { taskId: `${caseId}-planning`, amountMicroCny: 2_000_000 },
      design: { taskId: `${caseId}-design`, amountMicroCny: 1_900_000 },
      art: { taskId: `${caseId}-art`, amountMicroCny: 5_700_000 },
      coding: { taskId: `${caseId}-coding`, amountMicroCny: 7_600_000 },
      repair: { taskId: `${caseId}-repair`, amountMicroCny: 3_800_000 },
    },
    outputTokens: { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 },
    inputs: { requirements: { version: 'fixture-v1', path: 'requirements.json', sha256: hash(requirements) }, template: { sha256: hash(JSON.stringify(files)), files } },
  };
  const identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(declaration) };
  let readIdentity = async (_signal: AbortSignal) => ({ ...identity });
  const context = { root, repositoryRoot, identityReader: async (signal: AbortSignal) => readIdentity(signal), now };
  const quote = await prepareValidationCase({ ...context, declaration });
  const decision = { kind: 'operator_validation' as const, decisionId: 'scope-decision', actorId: 'offline-operator', decidedAt: new Date(now()).toISOString(),
    source: { artifactId: 'operator', version: 'v1', location: 'operator.json' }, sourceRefs: [{ artifactId: 'source', version: 'fixture-v1', location: 'requirements.json' },
      ...(historicalBytes ? [{ artifactId: 'historical', version: hash(historicalBytes), location: 'historical.json' }] : [])] };
  const operatorPath = join(root, decision.source.location);
  await writeFile(operatorPath, JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId, windowId: window.windowId }); controllers.push(controller);
  const requirement = createValidationRequirement({ specVersion: '1.0', sources: decision.sourceRefs,
    acceptance: [{ acceptanceId: 'game-1', description: '固定验收', steps: ['读取固定输入'], expected: '原始字节保持', evidenceKinds: ['test_report'] }],
    validation: { runId: original.run.runId, ledgerId: original.ledger.ledgerId, caseId, windowId: window.windowId, ...identity, decision } });
  let reads = 0;
  const binding = { caseId, windowId: window.windowId, readScope: async (signal: AbortSignal) => {
    signal.throwIfAborted(); reads++;
    assert.equal(hash(await readFile(sourcePath)), declaration.inputs.requirements.sha256, 'Fixed source bytes changed');
    const operatorReceipt = await readFile(operatorPath); signal.throwIfAborted();
    return { requirement, operatorReceipt };
  } };
  return { controller, binding, requirement, window, original, declaration, context, sourcePath, operatorPath,
    now, advance: (ms: number) => { clock += ms; }, reads: () => reads,
    setIdentityReader: (reader: typeof readIdentity) => { readIdentity = reader; } };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const actor = { role: 'system' as const, actorId: 'scope-fixture' };

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
}
function nativeReads(f: Fixture) {
  const work = new OwnedWork(f.controller.signal);
  const waits = createNativeValidationWaits({ caseId: f.window.caseId, windowId: f.window.windowId,
    taskId: f.declaration.grants.coding.taskId, deadlineAt: Date.now() + 60_000, signal: work.signal,
    trackRaw: start => work.run(start) });
  return { work, waits };
}

for (const leaf of ['readScope', 'readBytes'] as const) test(`COS97 ${leaf} remains owned after the private scope race times out`, async t => {
  const bytes = Buffer.from('fixed historical bytes'), f = await fixture(t, bytes), n = nativeReads(f);
  const entered = deferred(), gate = deferred(); let laterReads = 0;
  const original = f.binding.readScope;
  const binding = { ...f.binding,
    readScope: async (signal: AbortSignal) => {
      if (leaf === 'readScope') { entered.resolve(); await gate.promise; signal.throwIfAborted(); laterReads++; }
      return original(signal);
    }, historicalManifest: { reference: f.requirement.sources[1], readBytes: async (signal: AbortSignal) => {
      if (leaf === 'readBytes') { entered.resolve(); await gate.promise; signal.throwIfAborted(); laterReads++; }
      return bytes;
    } } };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const pending = requireValidationScope(f.controller, f.requirement, binding, n.waits.readSignal);
  const failed = assert.rejects(pending, (error: unknown) => isValidationScopeTimeout(error));
  try {
    await entered.promise; t.mock.timers.tick(5000); await failed;
    assert.equal(n.waits.snapshot().rawReads.pending, 1, 'An inner reader outlives the scope race');
    const draining = assert.rejects(n.work.cancelAndDrain('fixture stop', 100), /did not quiesce/);
    t.mock.timers.tick(100); await draining;
    assert.equal(n.waits.snapshot().rawReads.pending, 1);
  } finally { gate.resolve(); await n.work.cancelAndDrain('fixture reader released'); }
  assert.equal(n.waits.snapshot().rawReads.pending, 0); assert.equal(laterReads, 0);
});

test('COS97 identity raw work remains owned after its original five second race returns', async t => {
  const f = await fixture(t), n = nativeReads(f), entered = deferred(), gate = deferred();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const pending = verifyValidationIdentity({ ...f.context, signal: n.waits.readSignal,
    identityReader: async () => { entered.resolve(); await gate.promise; return f.window.quote.identity; } }, f.declaration);
  const failed = assert.rejects(pending, /identity reader timed out/);
  try {
    await entered.promise; t.mock.timers.tick(5000); await failed;
    assert.equal(n.waits.snapshot().rawReads.pending, 1, 'Identity work remains independently owned');
    const draining = assert.rejects(n.work.cancelAndDrain('fixture stop', 100), /did not quiesce/);
    t.mock.timers.tick(100); await draining;
  } finally { gate.resolve(); await n.work.cancelAndDrain('fixture identity released'); }
  assert.equal(n.waits.snapshot().rawReads.pending, 0);
});

test('COS97 scope caller cancellation preserves its exact reason and keeps the raw reader owned', async t => {
  const f = await fixture(t), n = nativeReads(f), caller = new AbortController(), entered = deferred(), gate = deferred();
  const signal = associateNativeReadSignal(n.waits.readSignal, AbortSignal.any([n.waits.readSignal, caller.signal]));
  const reason = new Error('exact caller cancellation');
  const binding = { ...f.binding, readScope: async (active: AbortSignal) => {
    entered.resolve(); await gate.promise; active.throwIfAborted(); return f.binding.readScope(active);
  } };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const pending = requireValidationScope(f.controller, f.requirement, binding, signal);
  const failed = assert.rejects(pending, (error: unknown) => error === reason);
  try {
    await entered.promise; caller.abort(reason); t.mock.timers.tick(5000); await failed;
    assert.equal(n.waits.snapshot().rawReads.pending, 1);
  } finally { gate.resolve(); await n.work.cancelAndDrain('fixture cancelled reader released'); }
  assert.equal(n.waits.snapshot().rawReads.pending, 0); assert.equal(f.reads(), 0);
});

for (const native of [false, true]) test(`COS97 historical reader preserves its method receiver (native: ${native})`, async t => {
  const bytes = Buffer.from('receiver-bound historical bytes'), f = await fixture(t, bytes);
  const n = native ? nativeReads(f) : undefined;
  const binding = { ...f.binding, historicalManifest: { reference: f.requirement.sources[1],
    async readBytes(signal: AbortSignal) {
      signal.throwIfAborted(); assert.equal(this.reference.version, hash(bytes)); return bytes;
    } } };
  const result = await requireValidationScope(f.controller, f.requirement, binding, n?.waits.readSignal);
  assert.deepEqual(result.window, f.window); assert.equal(n?.waits.snapshot().rawReads.pending ?? 0, 0);
});

test('COS97 pre-cancelled controller reads and host guard preserve the caller reason with zero identity reads', async t => {
  const f = await fixture(t), caller = new AbortController(), reason = new Error('cancelled before controller queue'); let reads = 0;
  f.setIdentityReader(async () => { reads++; return f.window.quote.identity; }); caller.abort(reason);
  const calls = [() => f.controller.read(caller.signal), () => f.controller.readValidationScopeAuthority(caller.signal),
    () => f.controller.validationAuthority(f.declaration.grants.coding.taskId, 'reviewer', caller.signal),
    () => f.controller.requireValidationHost(f.window.caseId, f.window.windowId,
      join(f.context.repositoryRoot, '.cosmos/e2e', f.window.caseId), caller.signal)];
  for (const call of calls) await assert.rejects(call(), (error: unknown) => error === reason);
  assert.equal(reads, 0);
});

test('COS97 controller identity guard preserves the native inner raw owner through its combined signal', async t => {
  const f = await fixture(t), n = nativeReads(f), entered = deferred(), gate = deferred();
  f.setIdentityReader(async () => { entered.resolve(); await gate.promise; return f.window.quote.identity; });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const pending = f.controller.requireValidationHost(f.window.caseId, f.window.windowId,
    join(f.context.repositoryRoot, '.cosmos/e2e', f.window.caseId), n.waits.readSignal);
  const failed = assert.rejects(pending, /identity reader timed out/);
  try {
    await entered.promise; t.mock.timers.tick(5000); await failed;
    assert.equal(n.waits.snapshot().rawReads.pending, 1);
    const draining = assert.rejects(n.work.cancelAndDrain('fixture controller reader stop', 100), /did not quiesce/);
    t.mock.timers.tick(100); await draining;
  } finally { gate.resolve(); await n.work.cancelAndDrain('fixture controller reader released'); }
  assert.equal(n.waits.snapshot().rawReads.pending, 0);
});

test('COS97 queued cancellation starts no subsequent identity reader after the preceding host guard', async t => {
  const f = await fixture(t), caller = new AbortController(), entered = deferred(), gate = deferred(); let reads = 0;
  f.setIdentityReader(async () => { reads++; if (reads === 1) { entered.resolve(); await gate.promise; } return f.window.quote.identity; });
  const root = join(f.context.repositoryRoot, '.cosmos/e2e', f.window.caseId);
  const first = f.controller.requireValidationHost(f.window.caseId, f.window.windowId, root);
  await entered.promise;
  const second = f.controller.requireValidationHost(f.window.caseId, f.window.windowId, root, caller.signal);
  const reason = new Error('cancelled in controller queue'), failed = assert.rejects(second, error => error === reason);
  caller.abort(reason); gate.resolve(); await first; await failed; assert.equal(reads, 1);
});

test('COS97 controller cancellation retains precedence over a separate caller cancellation', async t => {
  const f = await fixture(t), caller = new AbortController();
  await f.controller.stop('Original controller stop'); caller.abort(new Error('later caller stop'));
  await assert.rejects(f.controller.read(caller.signal), error => error === f.controller.signal.reason);
  await assert.rejects(f.controller.requireValidationHost(f.window.caseId, f.window.windowId,
    join(f.context.repositoryRoot, '.cosmos/e2e', f.window.caseId), caller.signal), error => error === f.controller.signal.reason);
});

function codingTask(f: Fixture): TaskContract {
  const task = taskFixture() as TaskContract, grant = f.declaration.grants.coding;
  Object.assign(task, { taskId: grant.taskId, kind: 'evaluation', runId: f.original.run.runId, specVersion: f.original.run.specVersion,
    authorId: 'coding-author', dependsOn: [], state: 'not_started', attempts: [], evidence: [], artifacts: [], acceptanceIds: ['game-1'] });
  task.acceptance[0].acceptanceId = 'game-1'; task.context.contextId = 'coding-context';
  task.budget = { ledgerId: f.original.ledger.ledgerId, allocationMicroCny: grant.amountMicroCny, originalDeadlineAt: f.original.run.originalDeadlineAt };
  return task;
}

async function repairSource(f: Fixture) {
  const task = codingTask(f), feedback = { artifactId: 'failure-feedback', version: 'coding-attempt', location: 'feedback/coding.json' };
  await f.controller.registerTasks([task]); task.state = 'ready'; await f.controller.saveTask(task, actor);
  task.state = 'running'; task.attempts = [{ attemptId: feedback.version, sessionRef: 'sessions/coding', startedAt: new Date(f.now()).toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await f.controller.saveTask(task, actor);
  task.state = 'failed'; task.stateReason = '合成编译失败'; task.attempts[0].endedAt = new Date(f.now()).toISOString(); task.attempts[0].outcome = 'failed';
  task.attempts[0].failure = { classification: 'code_defect', summary: '合成失败', reproduction: ['fixture'], actual: 'failed', expected: 'passed', evidenceRefs: [feedback.location] };
  await f.controller.saveTask(task, actor);
  return { sourceTaskId: task.taskId, feedback };
}

function pauseReader(f: Fixture) {
  const read = f.binding.readScope;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  f.binding.readScope = async signal => { const result = await read(signal); entered(); await gate; return result; };
  return { started, release };
}

test('scope clones one full snapshot and one isolated authority view', async t => {
  const f = await fixture(t), clone = globalThis.structuredClone, inputs: string[][] = [];
  let fullCopies = 0;
  const observer = t.mock.method(globalThis, 'structuredClone', <T>(value: T, options?: Parameters<typeof clone>[1]): T => {
    if (typeof value === 'object' && value !== null) {
      inputs.push(Object.keys(value));
      if ('formatVersion' in value && 'run' in value && 'ledger' in value && 'tasks' in value && 'requests' in value && 'events' in value) fullCopies++;
    }
    return clone(value, options);
  });
  try { await requireValidationScope(f.controller, f.requirement, f.binding); }
  finally { observer.mock.restore(); }
  t.diagnostic(JSON.stringify({ fullCopies, cloneInputs: inputs }));
  assert.equal(fullCopies, 1, 'A scope call must copy the full snapshot only after the trusted reader');
  assert.deepEqual(inputs, [['runId', 'specVersion', 'ledgerId', 'window'], Object.keys(await f.controller.read())]);
  assert.equal(f.reads(), 1);
});

test('authority view preserves every window field without mutable controller aliases', async t => {
  const f = await fixture(t), source = await repairSource(f);
  await f.controller.claimValidationRepair(source);
  const snapshot = await f.controller.read(), view = await f.controller.readValidationScopeAuthority();
  const expected = { runId: snapshot.run.runId, specVersion: snapshot.run.specVersion, ledgerId: snapshot.ledger.ledgerId, window: currentValidationCase(snapshot) };
  assert.deepEqual(view, expected); assert.deepEqual(Object.keys(view.window), Object.keys(expected.window));
  view.runId = 'changed'; view.specVersion = 'changed'; view.ledgerId = 'changed';
  view.window.deadlineAt = 'changed'; view.window.operatorDecision.sourceRefs[0].location = 'changed';
  view.window.quote.identity.reviewedPlatformSha = 'changed'; view.window.quote.basis.requestIds.push('changed');
  assert.ok(view.window.repair); view.window.repair.feedback.location = 'changed';
  assert.deepEqual(await f.controller.read(), snapshot);
  await f.controller.stop('合成窗口停止');
  const stopped = await f.controller.read(), stoppedView = await f.controller.readValidationScopeAuthority();
  assert.deepEqual(stoppedView.window, currentValidationCase(stopped));
  assert.ok(stoppedView.window.stopReason); stoppedView.window.stopReason.reason = 'changed';
  assert.deepEqual(await f.controller.read(), stopped);
});

test('authority projection waits for the preceding repair update in the controller queue', async t => {
  const f = await fixture(t), source = await repairSource(f);
  const pending = f.controller.claimValidationRepair(source), projected = f.controller.readValidationScopeAuthority();
  const repair = await pending;
  assert.deepEqual((await projected).window.repair, repair);
});

test('authority projection expires the current window through the original persistence queue', async t => {
  const f = await fixture(t);
  f.advance(f.declaration.limits.durationMs);
  const view = await f.controller.readValidationScopeAuthority(), snapshot = await f.controller.read();
  assert.equal(view.window.stopReason?.code, 'deadline'); assert.equal(f.controller.signal.aborted, true);
  assert.deepEqual(view.window, currentValidationCase(snapshot));
  assert.deepEqual(JSON.parse(await readFile(join(f.context.root, 'snapshot.json'), 'utf8')), snapshot);
  await assert.rejects(requireValidationScope(f.controller, f.requirement, f.binding), /deadline|stopped/i);
  assert.equal(f.reads(), 0);
});

test('closed owners, non-validation runs and wrong window opens cannot supply scope authority', async t => {
  const f = await fixture(t);
  await f.controller.close();
  await assert.rejects(f.controller.readValidationScopeAuthority(), /closed/);
  await assert.rejects(RunController.openValidationCase({ ...f.context, caseId: f.window.caseId, windowId: 'wrong-window' }), /Wrong validation/);
  const legacy = await RunController.create({ root: join(f.context.repositoryRoot, 'legacy'), runId: 'legacy', ledgerId: 'legacy-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0', allocations: [{ taskId: 'legacy', amountMicroCny: 100 }] });
  try { await assert.rejects(legacy.readValidationScopeAuthority(), /operator validation profile/); }
  finally { await legacy.close(); }
});

test('scope rejects a real repair window change while the trusted reader is pending', async t => {
  const f = await fixture(t), source = await repairSource(f), gate = pauseReader(f);
  const result = assert.rejects(requireValidationScope(f.controller, f.requirement, f.binding), /authority changed/);
  await gate.started;
  try { await f.controller.claimValidationRepair(source); }
  finally { gate.release(); }
  await result; assert.equal(f.controller.signal.aborted, false);
});

for (const boundary of ['stop', 'deadline'] as const) test(`scope rejects ${boundary} while the trusted reader is pending`, async t => {
  const f = await fixture(t), gate = pauseReader(f);
  const result = assert.rejects(requireValidationScope(f.controller, f.requirement, f.binding), boundary === 'stop' ? /Synthetic stop/ : /deadline/i);
  await gate.started;
  try {
    if (boundary === 'stop') await f.controller.stop('Synthetic stop during scope');
    else f.advance(f.declaration.limits.durationMs);
  } finally { gate.release(); }
  await result;
});

for (const duringRead of [false, true]) test(`scope retains its five second deadline reserve (reader pending: ${duringRead})`, async t => {
  const f = await fixture(t), deadline = Date.parse(f.window.deadlineAt);
  if (!duringRead) {
    t.mock.method(Date, 'now', () => deadline - 5000);
    await assert.rejects(requireValidationScope(f.controller, f.requirement, f.binding), /cannot finish inside/);
    assert.equal(f.reads(), 0);
  } else {
    const gate = pauseReader(f), result = assert.rejects(requireValidationScope(f.controller, f.requirement, f.binding), /authority changed/);
    await gate.started;
    t.mock.method(Date, 'now', () => deadline - 5000); gate.release();
    await result; assert.equal(f.controller.signal.aborted, false);
  }
});

test('scope returns the latest full snapshot after a legal task update during its reader', async t => {
  const f = await fixture(t), task = codingTask(f);
  await f.controller.registerTasks([task]); const before = await f.controller.read(), gate = pauseReader(f);
  const pending = requireValidationScope(f.controller, f.requirement, f.binding);
  await gate.started;
  try { task.state = 'ready'; await f.controller.saveTask(task, actor); }
  finally { gate.release(); }
  const { snapshot, window } = await pending;
  assert.equal(snapshot.revision, before.revision + 1); assert.deepEqual(snapshot.tasks.find(item => item.taskId === task.taskId), task);
  assert.equal(snapshot.events.length, before.events.length + 1); assert.equal(snapshot.events.at(-1)?.type, 'task_saved');
  assert.deepEqual(snapshot, await f.controller.read()); assert.deepEqual(window, currentValidationCase(before));
});

for (const source of ['input', 'receipt'] as const) test(`the next independent scope rereads changed ${source} bytes`, async t => {
  const f = await fixture(t), path = source === 'input' ? f.sourcePath : f.operatorPath, bytes = await readFile(path);
  await requireValidationScope(f.controller, f.requirement, f.binding); assert.equal(f.reads(), 1);
  await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(requireValidationScope(f.controller, f.requirement, f.binding), source === 'input' ? /Fixed source bytes changed/ : /operator source bytes changed/);
  assert.equal(f.reads(), 2); assert.equal(f.controller.signal.aborted, false);
  await writeFile(path, bytes);
  await requireValidationScope(f.controller, f.requirement, f.binding); assert.equal(f.reads(), 3);
});
