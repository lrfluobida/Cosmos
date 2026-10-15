import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { safePath, regularFile, snapshot } from '../../src/artifacts/paths.ts';
import { requireValidationPreparationScope } from '../../src/runtime/entrypoint-validation.ts';
import { transferFixture } from './runtime-host.fixture.ts';
import { createNativeValidationWaits } from '../../src/acceptance/native-validation-waits.ts';
import { createValidationPreparedBrowserHost, createNativeBrowserHostIO } from '../../src/runtime/entrypoint-host.ts';
import type { BrowserInputPreparation, BrowserPreparationContext } from '../../src/runtime/entrypoint-preparation.ts';

async function files(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos97-origin-'));
  t.after(async () => {
    t.mock.restoreAll(); syncBuiltinESMExports();
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('cos97-origin-'));
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, 'a.txt'), 'first', 'utf8'); await writeFile(join(root, 'b.txt'), 'second', 'utf8');
  return root;
}

for (const kind of ['safePath', 'regularFile', 'snapshot'] as const) test(`COS97 ${kind} rejects a pre-cancelled caller before reading`, async t => {
  const root = await files(t), caller = new AbortController(), reason = new Error('original path reader cancellation'); caller.abort(reason);
  const operation = kind === 'safePath' ? () => safePath(root, 'a.txt', caller.signal)
    : kind === 'regularFile' ? () => regularFile(root, 'a.txt', caller.signal) : () => snapshot(root, caller.signal);
  await assert.rejects(operation(), error => error === reason);
});

test('COS97 snapshot stops before the next file after cancellation during an actual file read', async t => {
  const root = await files(t), caller = new AbortController(), reason = new Error('cancelled after dispatched read');
  const read = fs.promises.readFile; let reads = 0;
  t.mock.method(fs.promises, 'readFile', async (...args: Parameters<typeof read>) => {
    const bytes = await read(...args);
    if (String(args[0]).startsWith(root)) { reads++; if (reads === 1) caller.abort(reason); }
    return bytes;
  });
  syncBuiltinESMExports();
  const pending = snapshot(root, caller.signal);
  try { await assert.rejects(pending, error => error === reason); }
  finally { assert.ok(reads > 0, 'The test must observe the actual production reader'); }
  assert.equal(reads, 1, 'No subsequent snapshot leaf may start after cancellation');
});

test('COS97 cancellation between safePath completion and directory dispatch starts no readdir', async t => {
  const root = await files(t), caller = new AbortController(), reason = new Error('cancelled after checked directory path');
  const inspect = fs.promises.lstat, readDirectory = fs.promises.readdir; let directories = 0;
  t.mock.method(fs.promises, 'lstat', async (...args: Parameters<typeof inspect>) => {
    const stat = await inspect(...args), path = String(args[0]);
    if (dirname(path) === path) {
      let turns = 3;
      const cancel = () => { if (--turns === 0) caller.abort(reason); else queueMicrotask(cancel); };
      queueMicrotask(cancel);
    }
    return stat;
  });
  t.mock.method(fs.promises, 'readdir', async (...args: Parameters<typeof readDirectory>) => { directories++; return readDirectory(...args); });
  syncBuiltinESMExports();
  await assert.rejects(snapshot(root, caller.signal), error => error === reason);
  assert.equal(directories, 0, 'The caller must be checked after the awaited path and before the next directory read');
});

test('COS97 preparation scope forwards a pre-cancelled caller before any scope reader', async t => {
  const f = await transferFixture(t), caller = new AbortController(), reason = new Error('cancelled preparation scope'); let reads = 0;
  const original = f.validation.readScope;
  t.mock.method(f.validation, 'readScope', async (signal: AbortSignal) => { reads++; return original(signal); }); caller.abort(reason);
  await assert.rejects(requireValidationPreparationScope({ ...f.input, adapterId: 'cos16-input/1' }, caller.signal), error => error === reason);
  assert.equal(reads, 0);
});

test('COS97 caller cancelled after the controller host guard cannot start the next preparation scope', async t => {
  const f = await transferFixture(t), caller = new AbortController(), reason = new Error('cancelled between host and scope'); let reads = 0;
  const host = f.controller.requireValidationHost.bind(f.controller), read = f.validation.readScope;
  t.mock.method(f.controller, 'requireValidationHost', async (...args: Parameters<typeof host>) => { await host(...args); caller.abort(reason); });
  t.mock.method(f.validation, 'readScope', async (signal: AbortSignal) => { reads++; return read(signal); });
  await assert.rejects(requireValidationPreparationScope({ ...f.input, adapterId: 'cos16-input/1' }, caller.signal), error => error === reason);
  assert.equal(reads, 0);
});

test('COS97 active preparation caller preserves complete fixed scope and native inner ownership', async t => {
  const f = await transferFixture(t);
  const waits = createNativeValidationWaits({ caseId: f.window.caseId, windowId: f.window.windowId,
    taskId: f.window.quote.declaration.grants.coding.taskId, deadlineAt: Date.parse(f.window.deadlineAt),
    signal: f.input.work.signal, trackRaw: start => f.input.work.run(start) });
  const scope = await requireValidationPreparationScope({ ...f.input, adapterId: 'cos16-input/1' }, waits.readSignal);
  assert.deepEqual(scope.window, f.window); assert.ok(waits.snapshot().rawReads.started >= 2);
  assert.equal(waits.snapshot().rawReads.pending, 0);
});

test('COS97 prepared host closures forward the original optional caller', async t => {
  const f = await transferFixture(t); let context!: BrowserPreparationContext, received: AbortSignal | undefined;
  const preparation: BrowserInputPreparation = { adapterId: 'cos16-input/1', designOutputs: [], designWritePaths: [], designRules: [], codingRules: [],
    initialize: async value => { context = value; }, requireCurrent: async () => {}, captureDesignExtras: async () => {}, verifyDesignExtras: async () => {},
    artExtraInputs: () => [], candidateExtraInputs: () => [], bindCandidate: async (_candidate, caller?: AbortSignal) => { received = caller; caller?.throwIfAborted(); },
    close: async () => {} };
  const host = await createValidationPreparedBrowserHost({ ...f.input, preparation });
  await t.test('pre-cancelled preparation scope', async () => {
    const caller = new AbortController(), reason = new Error('cancelled before captured preparation closure'); let reads = 0;
    const original = f.validation.readScope;
    t.mock.method(f.validation, 'readScope', async (signal: AbortSignal) => { reads++; return original(signal); }); caller.abort(reason);
    try { await assert.rejects(context.requireScope(caller.signal), error => error === reason); assert.equal(reads, 0); }
    finally { t.mock.restoreAll(); }
  });
  await t.test('cancellation after controller host blocks the next scope', async () => {
    const caller = new AbortController(), reason = new Error('cancelled inside captured host scope'); let reads = 0;
    const original = f.controller.requireValidationHost.bind(f.controller), reader = f.validation.readScope;
    t.mock.method(f.controller, 'requireValidationHost', async (...args: Parameters<typeof original>) => { await original(...args); caller.abort(reason); });
    t.mock.method(f.validation, 'readScope', async (signal: AbortSignal) => { reads++; return reader(signal); });
    try { await assert.rejects(context.requireScope(caller.signal), error => error === reason); assert.equal(reads, 0); }
    finally { t.mock.restoreAll(); }
  });
  await t.test('candidate binding preserves caller identity', async () => {
    const caller = new AbortController(), reason = new Error('cancelled captured candidate binding'); caller.abort(reason);
    await assert.rejects(host.bindPreparedCandidate(context.candidates.v1, caller.signal), error => error === reason);
    assert.equal(received, caller.signal);
  });
  await t.test('preparation initialization retains exact cleanup failures in its original owner', async () => {
    const failures: unknown[] = [], reason = new Error('pre-mount listener close failed');
    t.mock.method(f.input.work, 'retainCleanupFailure', (error: unknown) => { failures.push(error); });
    try { assert.equal(typeof context.retainCleanupFailure, 'function'); context.retainCleanupFailure!(reason); assert.deepEqual(failures, [reason]); }
    finally { t.mock.restoreAll(); }
  });
});

test('COS97 nativeIO rejects an untrusted or mismatched wait source before dispatch', async t => {
  const f = await transferFixture(t), taskId = f.window.quote.declaration.grants.coding.taskId, deadlineAt = Date.parse(f.window.deadlineAt);
  const io = createNativeBrowserHostIO(f.input), authority = { taskId, caseId: f.window.caseId, windowId: f.window.windowId, deadlineAt: f.window.deadlineAt };
  const waits = (caseId = f.window.caseId, windowId = f.window.windowId) => createNativeValidationWaits({ caseId, windowId, taskId, deadlineAt,
    signal: f.input.work.signal, trackRaw: start => f.input.work.run(start) });
  const original = waits(), series: any = { formatVersion: 'persistent-acceptance/1', segments: [{ plan: { taskId } }] }, sentinel = new Error('Fixture dispatch sentinel'); let dispatches = 0;
  t.mock.method(f.input.work, 'run', async () => { dispatches++; throw sentinel; });
  const options = (nativeValidationWaits: unknown): any => ({ evidenceRoot: f.root, deadlineAt, verifyBinding: async () => {}, nativeValidationWaits });
  for (const [name, source, value, hostAuthority] of [
    ['copied object', { ...original }, series, authority], ['wrong case', waits('another-case'), series, authority],
    ['wrong window', waits(f.window.caseId, 'another-window'), series, authority],
    ['generic series', original, { ...series, formatVersion: 'persistent-acceptance/generic-1' }, authority],
    ['human authority', original, series, { ...authority, caseId: undefined, windowId: null }],
  ] as const) await t.test(name, async () => {
    dispatches = 0;
    await assert.rejects(io.playPersistent!(value, options(source), hostAuthority), /native persistent wait source/i); assert.equal(dispatches, 0);
  });
  await t.test('legacy absent wait retains its existing dispatch', async () => {
    dispatches = 0;
    const plain = options(undefined); delete plain.nativeValidationWaits;
    await assert.rejects(io.playPersistent!(series, plain, authority), error => error === sentinel); assert.equal(dispatches, 1);
  });
});
