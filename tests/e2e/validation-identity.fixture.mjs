import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as tick, setTimeout as delay } from 'node:timers/promises';
import { runChild } from '../../probes/e2e/host.ts';
import { browserProcessAbsent } from '../../src/acceptance/process.ts';

// This process alone substitutes the command boundary; the production identity reader is unchanged.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './host.ts' && context.parentURL === new URL('../../probes/e2e/validation-identity.ts', import.meta.url).href) {
      return { shortCircuit: true, url: 'data:text/javascript,export const runChild = (...args) => globalThis.cos87RunChild(...args);' };
    }
    return next(specifier, context);
  },
});
const { createReviewedValidationIdentityReader } = await import('../../probes/e2e/validation-identity.ts');
hooks.deregister();
const root = await realpath(await mkdtemp(join(tmpdir(), 'cos87-identity-'))), head = 'a'.repeat(40), manifest = { fixture: 'COS87' };
const fields = ['branch', 'head', 'index', 'status'];
const values = { root, branch: 'main', head, index: 'H source.ts\0', status: '' };
const commands = [['rev-parse', '--show-toplevel'], ['symbolic-ref', '--quiet', '--short', 'HEAD'], ['rev-parse', 'HEAD'], ['ls-files', '-v', '-z'],
  ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none']];
const calls = [], controllers = [], pending = [];
let active = 0, maxActive = 0, inputs = 0;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(check) {
  const deadline = Date.now() + 3000;
  while (!await check()) { assert.ok(Date.now() < deadline, 'Fixture event must arrive within its safety bound'); await delay(5); }
}
function fieldFor(executable, args, options) {
  assert.equal(executable, 'git'); assert.equal(options.cwd, root);
  assert.deepEqual(args.slice(0, 5), ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false']);
  const index = commands.findIndex(command => JSON.stringify(command) === JSON.stringify(args.slice(5)));
  assert.notEqual(index, -1); assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 5000);
  return ['root', ...fields][index];
}
function begin(read) {
  const controller = new AbortController(), state = { done: false, value: undefined, error: undefined };
  controllers.push(controller);
  const result = read(controller.signal).then(value => { state.value = value; }, error => { state.error = error; }).finally(() => { state.done = true; });
  pending.push(result); return { controller, state, result };
}
const reader = readInput => createReviewedValidationIdentityReader({ repository: root, reviewedPlatformSha: head }, readInput);
function controlledCommands() {
  globalThis.cos87RunChild = (executable, args, options) => {
    const field = fieldFor(executable, args, options), gate = deferred();
    const call = { field, options, resolve: (stdout = values[field], code = 0) => gate.resolve({ code, stdout, stderr: '' }), reject: gate.reject };
    calls.push(call); active++; maxActive = Math.max(maxActive, active);
    const abort = () => gate.reject(options.signal.reason);
    options.signal.addEventListener('abort', abort, { once: true });
    return gate.promise.finally(() => { active--; options.signal.removeEventListener('abort', abort); });
  };
}
async function beforeGroup(offset) {
  await until(() => calls.length > offset);
  assert.deepEqual(calls.slice(offset).map(call => call.field), ['root']);
  calls[offset].resolve();
  await until(() => calls.length > offset + 1); await tick();
  assert.deepEqual(calls.slice(offset + 1).map(call => call.field), fields, 'All four Git queries must start before any query is released');
  assert.equal(active, 4); return calls.slice(offset + 1);
}
function sharedDeadline(group) {
  for (let i = 1; i < group.length; i++) {
    assert.equal(group[i].options.signal, group[0].options.signal);
    assert.ok(group[i].options.timeoutMs <= group[i - 1].options.timeoutMs, 'Every query uses the remaining shared deadline');
  }
}

async function overlap() {
  controlledCommands();
  let input;
  const read = reader(async () => { inputs++; input = deferred(); return input.promise; });
  for (let attempt = 0; attempt < 2; attempt++) {
    const offset = calls.length, operation = begin(read), before = await beforeGroup(offset);
    for (const call of before.slice(1)) call.resolve();
    await tick(); assert.equal(inputs, attempt); assert.equal(operation.state.done, false);
    before[0].resolve(); await until(() => inputs === attempt + 1);
    assert.equal(calls.length, offset + 5, 'After inspection must wait for fixed input');
    input.resolve({ manifest }); await until(() => calls.length > offset + 5); await tick();
    const after = calls.slice(offset + 5); assert.deepEqual(after.map(call => call.field), fields); assert.equal(active, 4);
    for (const call of after.slice(0, 3)) call.resolve();
    await tick(); assert.equal(operation.state.done, false); after[3].resolve();
    await operation.result; assert.equal(operation.state.error, undefined); assert.equal(operation.state.value.reviewedPlatformSha, head);
    assert.equal(calls.length, offset + 9); sharedDeadline(calls.slice(offset));
  }
  assert.equal(inputs, 2); assert.equal(maxActive, 4); assert.equal(active, 0);
  assert.notEqual(calls[0].options.signal, calls[9].options.signal, 'Later reads have a fresh deadline and signal');
}

async function failures() {
  controlledCommands();
  const read = reader(async () => { inputs++; return { manifest }; });
  for (const earliest of [0, 1, 2, 3]) {
    const offset = calls.length, operation = begin(read), group = await beforeGroup(offset);
    const errors = fields.map(field => new Error(`${field} failed`));
    for (let i = 3; i > earliest; i--) group[i].reject(errors[i]);
    for (let i = 0; i < earliest; i++) group[i].resolve();
    await tick(); assert.equal(operation.state.done, false, 'A failed sibling cannot bypass the unsettled query');
    group[earliest].reject(errors[earliest]); await operation.result;
    assert.equal(operation.state.error, errors[earliest]); assert.equal(active, 0); assert.equal(inputs, 0); assert.equal(calls.length, offset + 5);
  }
  const offset = calls.length, operation = begin(read), group = await beforeGroup(offset);
  group[3].reject(new Error('status failed first')); group[0].resolve(); group[1].resolve(); group[2].resolve('S source.ts\0');
  await operation.result; assert.match(operation.state.error.message, /index flags/); assert.equal(inputs, 0); assert.equal(active, 0);
}

async function children(mode) {
  let settled = 0;
  const owned = [];
  globalThis.cos87RunChild = (executable, args, options) => {
    const field = fieldFor(executable, args, options); calls.push({ field, options });
    if (field === 'root') return Promise.resolve({ code: 0, stdout: root, stderr: '' });
    active++; maxActive = Math.max(maxActive, active);
    const childSource = `const fs = require('node:fs'); fs.writeFileSync(process.argv[1], String(process.pid));
      const timer = setInterval(() => { if (fs.existsSync(process.argv[2])) { clearInterval(timer); process.stdout.write(JSON.parse(process.argv[3])); process.exitCode = Number(process.argv[4]); } }, 10);`;
    const command = runChild(process.execPath, ['-e', childSource, join(root, `${field}.pid`), join(root, field === 'branch' ? 'branch-release' : 'release'), JSON.stringify(values[field]), field === 'branch' ? '9' : '0'], options)
      .finally(() => { active--; settled++; });
    owned.push(command); return command;
  };
  const operation = begin(reader(async () => { inputs++; return { manifest }; }));
  try {
    await until(async () => (await readdir(root)).filter(name => name.endsWith('.pid')).length === 4);
    const pids = await Promise.all(fields.map(async field => Number(await readFile(join(root, `${field}.pid`), 'utf8'))));
    sharedDeadline(calls); assert.equal(active, 4); assert.equal(maxActive, 4);
    if (mode === 'abort') operation.controller.abort(new Error('COS87 caller abort'));
    if (mode === 'child-failure') {
      await writeFile(join(root, 'branch-release'), '', 'utf8'); await until(() => settled === 1); await tick();
      assert.equal(operation.state.done, false, 'A real failed child cannot leave siblings running after rejection');
      await writeFile(join(root, 'release'), '', 'utf8');
    }
    await operation.result;
    assert.ok(operation.state.error); assert.equal(inputs, 0); assert.equal(active, 0); assert.equal(settled, 4);
    if (mode === 'child-failure') assert.match(operation.state.error.message, /Git check failed/);
    else {
      assert.equal(calls[0].options.signal.aborted, true);
      assert.match(operation.state.error.message, /abort|timed out/i);
      assert.equal(calls[0].options.signal.reason.name, mode === 'timeout' ? 'TimeoutError' : 'Error');
    }
    for (const pid of pids) assert.equal(browserProcessAbsent(pid), true, `Owned PID ${pid} must have exited before reader rejection`);
    console.log(JSON.stringify({ mode, pids, allExited: true, settled }));
  } finally { operation.controller.abort(); await operation.result; await Promise.allSettled(owned); }
}

try {
  const scenario = process.argv[2];
  if (scenario === 'overlap') await overlap();
  else if (scenario === 'failures') await failures();
  else { assert.ok(['child-failure', 'abort', 'timeout'].includes(scenario)); await children(scenario); }
  console.log(JSON.stringify({ scenario, queries: calls.length, inputs, maxActive, active }));
} finally {
  for (const controller of controllers) controller.abort();
  await Promise.allSettled(pending); await rm(root, { recursive: true, force: true });
}
