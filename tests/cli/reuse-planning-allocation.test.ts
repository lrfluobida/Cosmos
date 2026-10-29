import assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { requirePublicRunLimits } from '../../src/cli/run-limits.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { readConfirmedRequirementsSource, readReferencedRequirements } from '../../src/runtime/confirmed-requirements-source.ts';
import { reservePublicValidationFunding, settlePublicValidationFunding, verifyPublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { confirmedSource, silentOutput, snapshot, temporaryRun } from '../runtime/confirmed-requirements.fixture.ts';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';

const pausedHost = () => ({ ordinaryProfile: 'ordinary-design/1' as const,
  async prepare() { return { environmentReady: false, executionReady: false }; },
  async questions() { throw new Error('No interview'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execution'); } });
const newArgs = (root: string, source: string, limit = 5000000) => ['new', root, '--requirements-from', source, '--requirements-revision', '2',
  '--max-cny', (limit / 1000000).toFixed(6), '--max-minutes', '30'];
const io = () => ({ host: pausedHost(), input: Readable.from([]), output: silentOutput() });
const json = async (root: string, name: string) => JSON.parse(await readFile(join(root, name), 'utf8'));

test('new reuse reallocates only the two initial shares and preserves rounding and zero-share limits', async t => {
  const source = await confirmedSource(t), before = await readFile(join(source.root, 'snapshot.json'));
  for (const limit of [5000000, ...Array.from({ length: 10 }, (_, i) => 30 + i), 1, 19, 20]) {
    const root = await temporaryRun(t), share = Math.floor(limit / 20);
    await runCli(newArgs(root, source.root, limit), io());
    const state = await snapshot(root), origin = await json(root, 'intake-origin.json');
    assert.deepEqual(state.ledger.allocations, [{ taskId: 'intake', amountMicroCny: 0 }, { taskId: 'planning', amountMicroCny: 2 * share }]);
    assert.equal(origin.planningAllocation, share ? 'reuse-intake-share' : undefined);
    assert.equal(state.ledger.limitMicroCny - state.ledger.allocations.reduce((sum: number, row: any) => sum + row.amountMicroCny, 0), limit - 2 * share);
    assert.deepEqual(state.requests, []); assert.deepEqual(state.ledger.entries, []);
  }
  assert.deepEqual(await readFile(join(source.root, 'snapshot.json')), before);
});

for (const legacy of [false, true]) test(`unfunded origin-only initialization retains its ${legacy ? 'legacy' : 'new'} choice`, async t => {
  const source = await confirmedSource(t), root = await temporaryRun(t), write = SnapshotStore.prototype.write;
  let interrupted = false;
  SnapshotStore.prototype.write = async function(value: any) {
    if (!interrupted && this.root === root) { interrupted = true; throw new Error('allocation-origin-only'); }
    return write.call(this, value);
  };
  try { await assert.rejects(runCli(newArgs(root, source.root), io()), /allocation-origin-only/); }
  finally { SnapshotStore.prototype.write = write; }
  const origin = await json(root, 'intake-origin.json');
  assert.equal(origin.planningAllocation, 'reuse-intake-share');
  const originalBytes = await readFile(join(root, 'intake-origin.json')); await unlink(join(root, 'intake-origin.json'));
  await assert.rejects(runCli(newArgs(root, source.root), io()), /existing|origin/i);
  await writeFile(join(root, 'intake-origin.json'), originalBytes);
  if (legacy) { delete origin.planningAllocation; await writeFile(join(root, 'intake-origin.json'), JSON.stringify(origin), 'utf8'); }
  const bytes = await readFile(join(root, 'intake-origin.json'));
  await runCli(newArgs(root, source.root), io());
  assert.deepEqual((await snapshot(root)).ledger.allocations.map((row: any) => row.amountMicroCny), legacy ? [250000, 250000] : [0, 500000]);
  assert.deepEqual(await readFile(join(root, 'intake-origin.json')), bytes);
});

test('local limits and source readers reject marker or base-allocation drift and retain activated additions', async t => {
  const source = await confirmedSource(t), root = await temporaryRun(t);
  await runCli(newArgs(root, source.root), io());
  const state = await snapshot(root), origin = await json(root, 'intake-origin.json');
  assert.equal(origin.planningAllocation, 'reuse-intake-share');
  for (const marker of [undefined, null, true, 1, 'unknown']) {
    const changed = { ...origin, planningAllocation: marker };
    if (marker === undefined) delete changed.planningAllocation;
    assert.throws(() => requirePublicRunLimits(state, changed, true));
  }
  const changed = structuredClone(state); changed.ledger.allocations[1].amountMicroCny--;
  assert.throws(() => requirePublicRunLimits(changed, origin, true));
  assert.throws(() => requirePublicRunLimits(state, { ...origin, requirementsSource: undefined }, true));
  const host = { ...pausedHost(), async prepare() { return { environmentReady: true, executionReady: true }; }, async execute() { return { outcome: 'source-only' }; } };
  await runCli(['resume', root], { ...io(), host });
  const active = await snapshot(root); active.ledger.allocations.push({ taskId: 'new-role', amountMicroCny: 1 });
  assert.doesNotThrow(() => requirePublicRunLimits(active, origin, true));
  await writeFile(join(root, 'intake-origin.json'), JSON.stringify({ ...origin, planningAllocation: null }), 'utf8');
  await assert.rejects(readReferencedRequirements(root, await snapshot(root)));
  await unlink(join(root, 'intake-origin.json'));
  await assert.rejects(runCli(['resume', root], io()), /origin|source/i);
});

for (const legacy of [false, true]) test(`funded origin-only ${legacy ? 'legacy v2' : 'new v2'} reuse survives retry and local accounting does not reread source`, async t => {
  const source = await confirmedSource(t), original = await readConfirmedRequirementsSource({ root: source.root, revision: 2, specVersion: '1.0' });
  const f = await fundingFixture(t), args = await f.authorization(legacy ? 'legacy-choice' : 'new-choice');
  await writeFile(join(args.sharedRoot, args.authorization.location), JSON.stringify({ ...args.payload, formatVersion: 'public-validation-authorization/2', brief: source.draft.brief, requirementsSource: original.source }), 'utf8');
  const funding = await reservePublicValidationFunding(args), write = SnapshotStore.prototype.write; let interrupted = false;
  SnapshotStore.prototype.write = async function(value: any) {
    if (!interrupted && this.root === args.runRoot) { interrupted = true; throw new Error('funded-origin-only'); }
    return write.call(this, value);
  };
  try { await assert.rejects(runCli(newArgs(args.runRoot, source.root), { ...io(), funding }), /funded-origin-only/); }
  finally { SnapshotStore.prototype.write = write; }
  const origin = await json(args.runRoot, 'intake-origin.json'); assert.equal(origin.planningAllocation, 'reuse-intake-share');
  const originalBytes = await readFile(join(args.runRoot, 'intake-origin.json')); await unlink(join(args.runRoot, 'intake-origin.json'));
  await assert.rejects(runCli(newArgs(args.runRoot, source.root), { ...io(), funding }), /origin/i);
  await writeFile(join(args.runRoot, 'intake-origin.json'), originalBytes);
  if (legacy) { delete origin.planningAllocation; await writeFile(join(args.runRoot, 'intake-origin.json'), JSON.stringify(origin), 'utf8'); }
  const bytes = await readFile(join(args.runRoot, 'intake-origin.json'));
  await runCli(newArgs(args.runRoot, source.root), { ...io(), funding });
  const state = await snapshot(args.runRoot);
  assert.deepEqual(state.ledger.allocations.map((row: any) => row.amountMicroCny), legacy ? [250000, 250000] : [0, 500000]);
  assert.deepEqual(await readFile(join(args.runRoot, 'intake-origin.json')), bytes);
  await unlink(join(source.root, 'requirements/v2/draft.json'));
  await verifyPublicValidationFunding({ root: args.runRoot, snapshot: state, dispatch: false });
  await assert.rejects(verifyPublicValidationFunding({ root: args.runRoot, snapshot: state, dispatch: true }));
  await writeFile(join(args.runRoot, 'intake-origin.json'), JSON.stringify({ ...origin, planningAllocation: null }), 'utf8');
  await assert.rejects(verifyPublicValidationFunding({ root: args.runRoot, snapshot: state, dispatch: false }));
  await writeFile(join(args.runRoot, 'intake-origin.json'), bytes);
  const owner = await IntakeController.open({ root: args.runRoot }); await owner.stop('End the isolated accounting fixture'); await owner.close();
  assert.equal((await settlePublicValidationFunding({ ...args, fundingId: funding.fundingId })).settledMicroCny, 0);
});

test('a legacy source snapshot before binding keeps its two original grants through activation', async t => {
  const source = await confirmedSource(t), root = await temporaryRun(t), write = SnapshotStore.prototype.write; let interrupted = false;
  SnapshotStore.prototype.write = async function(value: any) {
    if (!interrupted && this.root === root) {
      interrupted = true;
      const origin = await json(root, 'intake-origin.json'); delete origin.planningAllocation;
      await writeFile(join(root, 'intake-origin.json'), JSON.stringify(origin), 'utf8');
      value.ledger.allocations = [{ taskId: 'intake', amountMicroCny: 250000 }, { taskId: 'planning', amountMicroCny: 250000 }];
      await write.call(this, value); throw new Error('legacy-snapshot-before-binding');
    }
    return write.call(this, value);
  };
  try { await assert.rejects(runCli(newArgs(root, source.root), io()), /legacy-snapshot-before-binding/); }
  finally { SnapshotStore.prototype.write = write; }
  const originBytes = await readFile(join(root, 'intake-origin.json'));
  await runCli(newArgs(root, source.root), io());
  const before = await snapshot(root);
  await runCli(['resume', root], { ...io(), host: { ...pausedHost(), async prepare() { return { environmentReady: true, executionReady: true }; }, async execute() { return {}; } } });
  const active = await snapshot(root); assert.deepEqual(active.ledger, before.ledger);
  assert.deepEqual(await readFile(join(root, 'intake-origin.json')), originBytes);
});

test('ordinary brief and zero-share reuse cannot self-select a planning allocation marker', async t => {
  const root = await temporaryRun(t);
  await runCli(['new', root, '--brief', 'Keep original interview grants', '--max-cny', '5'], io());
  const state = await snapshot(root), origin = await json(root, 'intake-origin.json');
  assert.deepEqual(state.ledger.allocations.map((row: any) => row.amountMicroCny), [250000, 250000]);
  assert.equal(origin.planningAllocation, undefined);
  assert.throws(() => requirePublicRunLimits(state, { ...origin, planningAllocation: 'reuse-intake-share' }, true));
  const source = await confirmedSource(t), tiny = await temporaryRun(t);
  await runCli(newArgs(tiny, source.root, 19), io());
  const tinyState = await snapshot(tiny), tinyOrigin = await json(tiny, 'intake-origin.json');
  assert.throws(() => requirePublicRunLimits(tinyState, { ...tinyOrigin, planningAllocation: 'reuse-intake-share' }, true));
});
