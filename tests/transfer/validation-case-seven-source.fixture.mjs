import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setImmediate as tick, setTimeout as delay } from 'node:timers/promises';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { AsyncLocalStorage } from 'node:async_hooks';

// Only this child substitutes the source module's read boundary; its algorithm is imported unchanged.
const sourceURL = new URL('../../probes/transfer/validation-case-seven-source.ts', import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'node:fs/promises' && context.parentURL === sourceURL) return { shortCircuit: true,
    url: 'data:text/javascript,export { realpath } from "node:fs/promises"; export const readFile = (...args) => globalThis.cos96ReadFile(...args);' };
  return next(specifier, context);
} });
const source = await import(sourceURL); hooks.deregister();
const root = await realpath(await mkdtemp(join(tmpdir(), 'cos96-read-gate-'))), files = [];
for (let index = 0; index < 9; index++) {
  const path = join(root, `${index}.txt`), bytes = Buffer.from(`SOURCE COS96 file ${index}\n`);
  await writeFile(path, bytes); files.push({ path, sha256: validationHash(bytes) });
}
const value = { variant: 'source', files: files.slice(0, -1), platformLock: files.at(-1), dependencies: [], toolchain: { root, files: [], tools: [] } };
const receipt = { ...value, sha256: validationHash(JSON.stringify(value)) }, sentinel = 'C7 fixed runtime dependency set changed.';
const calls = [], pending = [], unhandled = [];
const operations = [], context = new AsyncLocalStorage();
let active = 0, peak = 0, releasing = false;
const onUnhandled = reason => unhandled.push(reason); process.on('unhandledRejection', onUnhandled);
globalThis.cos96ReadFile = (path, ...args) => {
  let release, reject;
  const gate = new Promise((yes, no) => { release = yes; reject = no; });
  const owner = operations[context.getStore()]; assert.ok(owner);
  const call = { index: files.findIndex(file => file.path === path), release, reject, settled: false, sha256: undefined };
  assert.notEqual(call.index, -1); calls.push(call); active++; peak = Math.max(peak, active);
  owner.active++; owner.peak = Math.max(owner.peak, owner.active);
  if (releasing) release();
  return gate.then(async () => { const bytes = await readFile(path, ...args); call.sha256 = validationHash(bytes); return bytes; })
    .finally(() => { call.settled = true; active--; owner.active--; });
};
function begin(signal = new AbortController().signal, leaf = false) {
  const state = { done: false, error: undefined };
  const id = operations.length; operations.push({ active: 0, peak: 0 });
  state.result = context.run(id, () => leaf ? source.requireKnownTransferCodingSourceFiles(files, signal)
    : source.requireFixedTransferCodingSource('seven', receipt, signal)).then(() => {}, error => { state.error = error; }).finally(() => { state.done = true; });
  pending.push(state.result); return state;
}
async function until(check) {
  const deadline = Date.now() + 3000;
  while (!check()) { assert.ok(Date.now() < deadline, 'Fixture event must arrive within its safety bound'); await delay(5); }
}
async function group(offset) {
  await until(() => calls.length > offset); await tick();
  assert.deepEqual(calls.slice(offset).map(call => call.index), files.slice(offset, offset + 4).map((_, index) => offset + index),
    'Four original-index reads must start before any gate is released');
  assert.equal(active, Math.min(4, files.length - offset)); return calls.slice(offset);
}
async function overlap() {
  const operation = begin();
  for (let offset = 0; offset < files.length; offset += 4) {
    const current = await group(offset);
    for (const call of current.slice(1)) call.release();
    await until(() => current.slice(1).every(call => call.settled)); await tick();
    assert.equal(operation.done, false); assert.equal(calls.length, offset + current.length, 'The next group waits for every dispatched read');
    current[0].release();
  }
  await operation.result; assert.equal(operation.error?.message, sentinel);
  assert.equal(calls.length, files.length); assert.equal(peak, 4); assert.equal(active, 0);
}
async function failure() {
  const operation = begin(), current = await group(0), earliest = new Error('SOURCE earliest index 0'), later = new Error('SOURCE later index 3');
  current[3].reject(later); await until(() => current[3].settled); await tick(); assert.equal(operation.done, false);
  current[0].reject(earliest); await until(() => current[0].settled); await tick(); assert.equal(operation.done, false, 'Failure must observe the remaining dispatched reads');
  current[1].release(); current[2].release(); await operation.result;
  assert.equal(operation.error, earliest); assert.equal(calls.length, 4); assert.equal(active, 0); assert.ok(current.every(call => call.settled));
}
async function freshAfter(offset) {
  releasing = true; const next = begin(); await next.result;
  assert.equal(next.error?.message, sentinel); assert.equal(calls.length, offset + files.length);
  assert.deepEqual(calls.slice(offset).map(call => call.index), files.map((_, index) => index)); assert.equal(active, 0);
}
async function cancellation(mode) {
  const abort = new AbortController(), reason = new Error('SOURCE caller cancelled');
  if (mode === 'pre-abort') {
    abort.abort(reason); const operation = begin(abort.signal); await operation.result;
    assert.equal(operation.error, reason); assert.equal(calls.length, 0); await freshAfter(0); return;
  }
  const operation = begin(abort.signal), current = await group(0); abort.abort(reason);
  if (mode === 'late-reject') {
    const first = new Error('SOURCE earliest late index 0');
    current[3].reject(new Error('SOURCE later late index 3')); await until(() => current[3].settled);
    current[0].reject(first); await until(() => current[0].settled); await tick(); assert.equal(operation.done, false);
    current[1].release(); current[2].release(); await operation.result; assert.equal(operation.error, first);
  } else {
    for (const call of current.slice(1)) call.release(); await until(() => current.slice(1).every(call => call.settled));
    await tick(); assert.equal(operation.done, false); current[0].release(); await operation.result; assert.equal(operation.error, reason);
  }
  assert.equal(calls.length, 4); assert.equal(active, 0); assert.ok(current.every(call => call.settled)); await freshAfter(4);
}
async function fresh() {
  await freshAfter(0); const original = await readFile(files[1].path);
  await writeFile(files[1].path, Buffer.concat([original, Buffer.from('SOURCE changed')]));
  const changed = begin(); await changed.result;
  assert.equal(changed.error?.message, 'C7 actual executed source or dependency bytes changed.');
  assert.equal(calls.length, 13); assert.notEqual(calls[10].sha256, files[1].sha256); assert.equal(active, 0);
  await writeFile(files[1].path, original); await freshAfter(13);
  const direct = begin(new AbortController().signal, true); await direct.result;
  assert.equal(direct.error, undefined); assert.equal(calls.length, 31);
  assert.deepEqual(calls.slice(22).map(call => call.sha256), files.map(file => file.sha256));
}
async function concurrent() {
  const first = begin(), second = begin(); await tick();
  assert.deepEqual(calls.map(call => call.index), [0, 1, 2, 3, 0, 1, 2, 3]); assert.equal(active, 8);
  releasing = true; for (const call of calls) call.release(); await Promise.all([first.result, second.result]);
  assert.equal(first.error?.message, sentinel); assert.equal(second.error?.message, sentinel);
  assert.equal(calls.length, 18); assert.equal(peak, 8); assert.equal(active, 0);
  assert.deepEqual(operations.map(operation => operation.peak), [4, 4]);
}
const mode = process.argv[2];
try {
  const run = { overlap, failure, fresh, concurrent, 'pre-abort': () => cancellation(mode), cancel: () => cancellation(mode), 'late-reject': () => cancellation(mode) };
  assert.equal(typeof run[mode], 'function'); await run[mode](); await tick();
  assert.equal(unhandled.length, 0); assert.ok(operations.every(operation => operation.peak <= 4 && operation.active === 0));
  console.log(JSON.stringify({ mode, passed: true, reads: calls.length, peak, perCallPeak: Math.max(...operations.map(operation => operation.peak)), active, unhandled: unhandled.length }));
} finally {
  releasing = true; for (const call of calls) call.release(); await Promise.allSettled(pending); await tick();
  process.removeListener('unhandledRejection', onUnhandled);
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true });
}
