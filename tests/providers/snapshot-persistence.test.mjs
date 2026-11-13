import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { RunController } from '../../src/runtime/run.ts';
import { outputLimitFixture, syntheticContext } from './request-output-limit.fixture.mjs';

for (const [code, transient, afterSend] of [
  ['EPERM', true, false], ['EPERM', false, false], ['ENOSPC', false, false], ['ENOSPC', false, true],
]) test(`snapshot rename ${code}, transient=${transient}, afterSend=${afterSend}`, { skip: code === 'EPERM' && process.platform !== 'win32' }, async t => {
  const f = await outputLimitFixture(t);
  const root = join(f.root, 'run'), target = join(root, 'snapshot.json');
  const controller = await RunController.create({ root, runId: 'test', ledgerId: 'ledger', kind: 'evaluation', specVersion: 'v1',
    scope: 'validation', allocations: [{ taskId: 'task', amountMicroCny: 1000 }] });
  const budget = createRoleBudget({ controller, taskId: 'task', evidenceDirectory: join(root, 'evidence') });
  const session = await f.create({ estimatedMaxCostMicroCny: 100, budget });
  const rename = fs.rename, failure = Object.assign(new Error('sensitive fixture contents'), { code, syscall: 'rename' });
  let attempts = 0, temporary, pendingBytes, preparedBytes;
  const hook = t.mock.method(fs, 'rename', async (source, destination) => {
    if (destination === target) {
      const bytes = await fs.readFile(source), next = JSON.parse(bytes);
      const stage = next.events.at(-1).type;
      if (stage === (afterSend ? 'unknown' : 'admitted')) {
        if (attempts === 0) {
          temporary = source;
          pendingBytes = await fs.readFile(target);
          preparedBytes = bytes;
        }
        assert.equal(source, temporary);
        assert.deepEqual(bytes, preparedBytes);
        assert.match(basename(source), /^\.snapshot-.*\.tmp$/);
        if (++attempts === 1 || !transient) throw failure;
      }
    }
    return rename(source, destination);
  });
  syncBuiltinESMExports();
  try {
    const dispatch = () => f.dispatch(syntheticContext(1024));
    if (transient) {
      await dispatch();
      assert.equal(attempts, 2);
      assert.equal(f.dispatches.length, 1);
      const state = await controller.read();
      assert.equal(state.ledger.entries.length, 1);
      assert.equal(state.ledger.entries[0].status, 'settled');
    } else {
      const diagnostic = new RegExp(`Snapshot persistence failed.*rename.*${code}`);
      await assert.rejects(dispatch(), diagnostic);
      await assert.rejects(session.prompt('retry'), diagnostic);
      await assert.rejects(controller.read(), error => {
        assert.equal(error.cause, failure);
        assert.match(error.message, diagnostic);
        assert.doesNotMatch(error.message, /sensitive|\.tmp/);
        return true;
      });
      assert.equal(f.dispatches.length, afterSend ? 1 : 0);
      assert.equal(attempts, code === 'EPERM' ? 6 : 1);
      assert.deepEqual(await fs.readFile(target), pendingBytes);
      assert.equal(JSON.parse(pendingBytes).requests[0].admittedAt !== null, afterSend);
      if (afterSend) {
        const cleanup = new Error('synthetic lock release failure');
        const blockRelease = t.mock.method(fs, 'unlink', async () => { throw cleanup; });
        syncBuiltinESMExports();
        try {
          await assert.rejects(controller.close(), error => {
            assert.ok(error instanceof AggregateError);
            assert.equal(error.cause.cause, failure);
            assert.equal(error.errors[1], cleanup);
            assert.match(error.message, diagnostic);
            return true;
          });
          assert.equal((await fs.stat(join(root, '.controller.lock'))).isFile(), true);
        } finally {
          blockRelease.mock.restore();
          syncBuiltinESMExports();
        }
      }
    }
    assert.equal((await fs.readdir(root)).some(name => name.endsWith('.tmp')), false);
  } finally {
    hook.mock.restore();
    syncBuiltinESMExports();
    await controller.close();
  }
});

test('funded public CLI reports the failed generation admission and leaves the reservation unadmitted', async t => {
  const { ordinaryHostFixture } = await import('../runtime/ordinary-design.fixture.ts');
  const { confirmedSource, silentOutput } = await import('../runtime/confirmed-requirements.fixture.ts');
  const { readConfirmedRequirementsSource } = await import('../../src/runtime/confirmed-requirements-source.ts');
  const { fundingFixture } = await import('../runtime/public-validation-funding.fixture.ts');
  const { runPublicValidationCli } = await import('../../probes/public-cli/validation.ts');
  let sends = 0;
  const generated = await ordinaryHostFixture(t, { productionDefault: true, sessionFactory: async config => ({
    async close() {}, async prompt() {
      await config.budget.beforeRequest({ requestId: 'pending', modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens,
        inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 });
      sends++; throw new Error('unexpected provider dispatch');
    },
  }) });
  const source = await confirmedSource(t, { draft: generated.draft });
  const original = await readConfirmedRequirementsSource({ root: source.root, revision: 2, specVersion: '1.0' });
  const f = await fundingFixture(t), args = await f.authorization('snapshot-write-failure');
  const authorization = join(args.sharedRoot, args.authorization.location);
  await fs.writeFile(authorization, JSON.stringify({ ...args.payload, formatVersion: 'public-validation-authorization/2',
    runRoot: generated.root, brief: source.draft.brief, requirementsSource: original.source }), 'utf8');
  const target = join(generated.root, 'snapshot.json'), rename = fs.rename;
  const failure = Object.assign(new Error('private path or request contents'), { code: 'ENOSPC' });
  let prior;
  const hook = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === target && JSON.parse(await fs.readFile(from)).events.at(-1)?.type === 'admitted') {
      prior = await fs.readFile(to);
      throw failure;
    }
    return rename(from, to);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(runPublicValidationCli(['new', generated.root, '--shared-root', args.sharedRoot, '--authorization', authorization],
      { input: Readable.from([]), output: silentOutput(), host: generated.host }), error => {
        assert.equal(error.cause, failure);
        assert.equal(error.message, 'Snapshot persistence failed during rename (ENOSPC).');
        return true;
      });
    assert.equal(sends, 0);
    assert.deepEqual(await fs.readFile(target), prior);
    assert.equal(JSON.parse(prior).requests.find(row => row.requestId === 'pending').admittedAt, null);
  } finally {
    hook.mock.restore();
    syncBuiltinESMExports();
  }
});
