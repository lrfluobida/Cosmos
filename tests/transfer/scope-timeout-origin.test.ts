import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { RunController } from '../../src/runtime/run.ts';
import type { ValidationRequirement } from '../../src/roles/execution-input.ts';
import { transferFixture } from './runtime-host.fixture.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';

const compiled = process.env.COSMOS_TEST_COMPILED === '1';
const scopeApi: typeof import('../../src/runtime/validation-scope.ts') = await import(compiled ? '../../dist/runtime/validation-scope.js' : '../../src/runtime/validation-scope.ts');
const { reserveTransferOrigin }: typeof import('../../src/runtime/adapters/transfer/loopback-origin.ts') = await import(compiled ? '../../dist/runtime/adapters/transfer/loopback-origin.js' : '../../src/runtime/adapters/transfer/loopback-origin.ts');
const { createTransferRuntimeHost }: typeof import('../../src/runtime/adapters/transfer/runtime-host.ts') = await import(compiled ? '../../dist/runtime/adapters/transfer/runtime-host.js' : '../../src/runtime/adapters/transfer/runtime-host.ts');

const interrupted = (signal: AbortSignal) => new Promise<never>((_, reject) => {
  signal.throwIfAborted(); signal.addEventListener('abort', () => reject(new Error('Synthetic IO interrupted')), { once: true });
});
const failure = (operation: Promise<unknown>) => operation.then(() => { throw new Error('Expected operation to fail'); }, error => error as Error);

async function originFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-scope-timeout-'));
  const abort = new AbortController(), source = { artifactId: 'source', version: 'v1', location: 'source.json' };
  const decision = { kind: 'operator_validation' as const, decisionId: 'SOURCE-decision', actorId: 'SOURCE-actor', decidedAt: new Date().toISOString(), source, sourceRefs: [source] };
  const identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: 'b'.repeat(64) }, quote = { identity };
  const operatorReceipt = Buffer.from(JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }));
  const window = { caseId: 'SOURCE-case', windowId: 'SOURCE-window', deadlineAt: new Date(Date.now() + 60000).toISOString(), quote,
    operatorDecision: { ...decision, sourceSha256: createHash('sha256').update(operatorReceipt).digest('hex') } };
  const requirement: ValidationRequirement = { formatVersion: 'validation-requirement-1', specVersion: '1.0', sources: [source],
    acceptance: [{ acceptanceId: 'SOURCE-check', description: 'Synthetic check', steps: ['Check'], expected: 'Passed', evidenceKinds: ['test_report'] }],
    validation: { runId: 'SOURCE-run', ledgerId: 'SOURCE-ledger', caseId: window.caseId, windowId: window.windowId, ...identity, decision } };
  const state = { formatVersion: 3, run: { runId: 'SOURCE-run', specVersion: '1.0' }, ledger: { ledgerId: 'SOURCE-ledger' }, validation: { currentCaseId: window.caseId, cases: [window] } };
  const controller = { signal: abort.signal, requireValidationCase() {}, async read() { return structuredClone(state); },
    async readValidationScopeAuthority() { return structuredClone({ runId: state.run.runId, specVersion: state.run.specVersion, ledgerId: state.ledger.ledgerId, window }); },
  } as unknown as RunController;
  const binding = { caseId: window.caseId, windowId: window.windowId, async readScope(_signal: AbortSignal) { return { requirement, operatorReceipt }; } };
  const input = { root, binding: { caseId: window.caseId, windowId: window.windowId, sourceVersion: identity.reviewedPlatformSha,
    requirementSha256: 'c'.repeat(64), runId: 'SOURCE-run', specVersion: '1.0' }, resume: false, signal: abort.signal,
    requireScope: async () => { await scopeApi.requireValidationScope(controller, requirement, binding); } };
  const origin = await reserveTransferOrigin(input);
  t.after(async () => { await origin.close(); assert.ok(root.startsWith(join(tmpdir(), 'cosmos-scope-timeout-'))); await rm(root, { recursive: true, force: true }); });
  return { root, abort, requirement, operatorReceipt, controller, binding, input, origin };
}

test('local scope timeout preserves origin for a healthy parallel and later verification', async t => {
  const f = await originFixture(t), before = await readFile(join(f.root, 'host-transfer-origin.json'));
  let reads = 0, started!: () => void, timedOut: Promise<Error>;
  const firstRead = new Promise<void>(resolve => { started = resolve; });
  f.binding.readScope = async signal => {
    reads++;
    if (reads === 1) { started(); await interrupted(signal); }
    if (reads === 2) await timedOut;
    return { requirement: f.requirement, operatorReceipt: f.operatorReceipt };
  };
  timedOut = failure(f.origin.verify()); await firstRead;
  const sibling = f.origin.verify();
  const timeoutError = await timedOut;
  assert.match(timeoutError.message, /timed out/); assert.equal(scopeApi.isValidationScopeTimeout(timeoutError), true);
  await sibling;
  await f.origin.verify(); assert.equal(reads, 3, 'Every operation must read the complete scope again');
  assert.deepEqual(await readFile(join(f.root, 'host-transfer-origin.json')), before);
  assert.equal(f.abort.signal.aborted, false); assert.equal((await fetch(f.origin.url)).status, 404);
  await f.origin.close(); await assert.rejects(fetch(f.origin.url));
  let initReads = 0;
  await assert.rejects(reserveTransferOrigin({ ...f.input, resume: true, requireScope: async () => {
    if (++initReads === 2) { assert.equal((await fetch(f.origin.url)).status, 404); throw timeoutError; }
    await f.input.requireScope();
  } }), error => error === timeoutError);
  assert.equal(initReads, 2); await assert.rejects(fetch(f.origin.url), 'Initialization failure still closes its newly owned listener');
});

test('real transfer host guard timeout preserves its origin before candidate binding', async t => {
  const f = await transferFixture(t), readScope = f.validation.readScope;
  let stall = false, reads = 0;
  f.validation.readScope = async signal => { reads++; if (stall) await interrupted(signal); return readScope(signal); };
  const host = await createTransferRuntimeHost(f.input); f.onCleanup(() => host.closePreparation());
  const before = await readFile(join(f.root, 'host-transfer-origin.json')), { url } = JSON.parse(before.toString('utf8'));
  const candidate = { artifactId: f.window.caseId + '-game', version: 'v1', location: 'registry/candidates/' + f.window.caseId + '-game/v1/project' };
  reads = 0; stall = true;
  const timeoutError = await failure(host.bindPreparedCandidate(candidate));
  assert.equal(scopeApi.isValidationScopeTimeout(timeoutError), true);
  assert.equal(reads, 1, 'Failure is in guard scope before origin.verify'); stall = false;
  assert.equal((await fetch(url)).status, 404);
  const later = await failure(host.bindPreparedCandidate(candidate));
  assert.equal(later.message, 'Transfer design: candidate inputs are not prepared', 'New call must progress to the absent synthetic prepared input');
  assert.ok(reads > 1); assert.deepEqual(await readFile(join(f.root, 'host-transfer-origin.json')), before);
  assert.equal(f.controller.signal.aborted, false); assert.equal(f.calls.length, 0);
  await assert.rejects(host.withPreparation(async () => { throw timeoutError; }), error => error === timeoutError);
  await assert.rejects(fetch(url), 'Final preparation cleanup still closes after a local timeout');
});

test('timeout during the final controller read retains the private timeout identity', async t => {
  const f = await originFixture(t), read = f.controller.read.bind(f.controller);
  const authority = f.controller.readValidationScopeAuthority.bind(f.controller);
  let reads = 0, authorityReads = 0, scopeSignal: AbortSignal | undefined;
  t.mock.method(f.controller, 'readValidationScopeAuthority', async () => { authorityReads++; return authority(); });
  f.binding.readScope = async signal => { scopeSignal = signal; return { requirement: f.requirement, operatorReceipt: f.operatorReceipt }; };
  f.controller.read = async () => {
    reads++; assert.ok(scopeSignal, 'The complete read must follow the trusted scope reader');
    await new Promise<void>(resolve => scopeSignal!.addEventListener('abort', () => resolve(), { once: true }));
    return read();
  };
  const error = await failure(f.origin.verify());
  assert.equal(reads, 1); assert.equal(authorityReads, 1);
  assert.equal(scopeApi.isValidationScopeTimeout(error), true); assert.equal(f.abort.signal.aborted, false);
  f.controller.read = read; await f.origin.verify(); assert.equal((await fetch(f.origin.url)).status, 404);
});

for (const duringTimeout of [false, true]) test(`controller abort closes origin and wins classification (timer race: ${duringTimeout})`, async t => {
  const f = await originFixture(t), reason = new Error('Synthetic run stopped');
  f.binding.readScope = async signal => {
    const pending = interrupted(signal);
    if (duringTimeout) signal.addEventListener('abort', () => f.abort.abort(reason), { once: true });
    else f.abort.abort(reason);
    return pending;
  };
  const error = await failure(f.origin.verify());
  assert.equal(error, reason); assert.equal(scopeApi.isValidationScopeTimeout(error), false);
  assert.equal(f.abort.signal.aborted, true); await assert.rejects(fetch(f.origin.url));
});

for (const changed of ['receipt', 'binding', 'forged-timeout', 'ordinary-error'] as const) test(`${changed} still closes origin`, async t => {
  const f = await originFixture(t);
  if (changed === 'receipt') {
    const path = join(f.root, 'host-transfer-origin.json'), receipt = JSON.parse(await readFile(path, 'utf8'));
    receipt.binding.runId += '-changed'; await writeFile(path, JSON.stringify(receipt), 'utf8');
  } else if (changed === 'binding') f.requirement.validation.windowId += '-changed';
  else {
    const error = new Error(changed === 'forged-timeout' ? 'Validation scope check timed out.' : 'Synthetic IO failed');
    if (changed === 'forged-timeout') error.name = 'ValidationScopeTimeoutError';
    assert.equal(scopeApi.isValidationScopeTimeout(error), false);
    f.binding.readScope = async () => { throw error; };
  }
  const error = await failure(f.origin.verify()); assert.equal(scopeApi.isValidationScopeTimeout(error), false);
  assert.equal(f.abort.signal.aborted, false); await assert.rejects(fetch(f.origin.url));
});

test('owner work cancellation closes the real host even when the controller remains active', async t => {
  const f = await transferFixture(t), readScope = f.validation.readScope;
  let armed = false;
  f.validation.readScope = async signal => {
    if (armed) {
      const pending = interrupted(signal);
      signal.addEventListener('abort', () => { void f.input.work.cancelAndDrain('Synthetic owned work cancelled'); }, { once: true });
      await pending;
    }
    return readScope(signal);
  };
  const host = await createTransferRuntimeHost(f.input); f.onCleanup(() => host.closePreparation());
  const { url } = JSON.parse(await readFile(join(f.root, 'host-transfer-origin.json'), 'utf8')); armed = true;
  const candidate = { artifactId: f.window.caseId + '-game', version: 'v1', location: 'registry/candidates/' + f.window.caseId + '-game/v1/project' };
  const error = await failure(host.bindPreparedCandidate(candidate));
  assert.equal(scopeApi.isValidationScopeTimeout(error), true);
  assert.equal(f.controller.signal.aborted, false); assert.equal(f.input.work.signal.aborted, true);
  await assert.rejects(fetch(url));
});

test('real author file tool stops before writing on guard timeout and rechecks a later call', async t => {
  const f = await transferFixture(t), readScope = f.validation.readScope;
  let armed = false, reads = 0, checked = false, actionFailure: unknown;
  f.validation.readScope = async signal => { if (armed && ++reads === 2) await interrupted(signal); return readScope(signal); };
  const host = await createTransferRuntimeHost(f.input); f.onCleanup(() => host.closePreparation());
  const { url } = JSON.parse(await readFile(join(f.root, 'host-transfer-origin.json'), 'utf8'));
  f.setDesignAction(async config => {
    try {
      const tool = config.tools.find((item: any) => item.name === 'write'), path = 'authors/design/design.json';
      const original = await readFile(join(config.workspace, path)); armed = true;
      const error = await failure(tool.execute('blocked-write', { path, content: 'must not be written' }));
      assert.equal(scopeApi.isValidationScopeTimeout(error), true); assert.equal(reads, 2);
      assert.deepEqual(await readFile(join(config.workspace, path)), original);
      assert.equal((await fetch(url)).status, 404);
      const before = reads; await tool.execute('later-write', { path, content: 'new independently validated call' });
      assert.ok(reads > before); assert.equal(await readFile(join(config.workspace, path), 'utf8'), 'new independently validated call');
      armed = false; checked = true;
    } catch (error) { actionFailure = error; }
    throw new Error('Synthetic provider ends after file-tool checks');
  });
  const tasks = f.prepare(host); host.validateTasks!(tasks);
  await host.withPreparation(() => executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory, preAuthor: host.preAuthor,
    capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
    recovery: { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture }, reviewProtocolCorrections: 1, authorProtocolCorrections: 1 }));
  if (actionFailure) throw actionFailure;
  assert.equal(checked, true); assert.ok(f.calls.every(call => call.kind === 'design')); await assert.rejects(fetch(url));
});
