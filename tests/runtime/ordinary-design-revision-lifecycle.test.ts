import assert from 'node:assert/strict';
import test from 'node:test';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { conservedFixture } from './ordinary-design-revision-budget.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';
import { recoverRunOwner } from '../../src/cli/control.ts';
import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('owned operation identity expires after callback returns despite a live signal', async () => {
  const work = new OwnedWork(); let token: object | undefined;
  await work.run(async (_signal, operation) => {
    token = operation;
    assert.ok(token, 'a real running callback must receive an opaque operation identity');
    assert.equal(work.operationState(token!), 'active');
    assert.equal(work.operationState({}), 'unknown');
    assert.equal(new OwnedWork().operationState(token!), 'unknown');
  });
  assert.equal(work.signal.aborted, false);
  assert.equal(work.operationState(token!), 'settled');
});

test('cold lifecycle requires exact owner close or a proved exited owner, never lock absence', async t => {
  const f = await conservedFixture(t); await f.execute();
  const state = await f.state(), start = JSON.parse(state.events.find((row: any) => row.type === 'ordinary_design_budget_owner_started').reason);
  const closed = join(f.root, `ordinary-design-budget-lifecycle/owner-${start.owner.token}-closed.json`);
  await rename(closed, `${closed}.preserved`);
  const before = await readFile(join(f.root, 'snapshot.json')); let unexpectedOwner: RunController | undefined;
  try {
    await assert.rejects(async () => { unexpectedOwner = await RunController.open({ root: f.root, now: () => Date.parse(state.run.originalDeadlineAt) + 1 }); }, /no proved close or exit/);
    assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before), 'Rejected open must not expire or mutate accounting');
    await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
    await assert.rejects(readFile(closed), { code: 'ENOENT' });
  } finally { await unexpectedOwner?.close(); await rename(`${closed}.preserved`, closed); }
  const module = new URL('../../src/runtime/run.ts', import.meta.url).href;
  const child = `import {RunController} from ${JSON.stringify(module)};
const controller=await RunController.open({root:${JSON.stringify(f.root)}});
const scope=await controller.bindOrdinaryDesignBudgetLifecycle();
// Leave a real owner and started anchor, then exit without claiming cleanup.
process.exit(0);`;
  execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', child], { windowsHide: true, timeout: 30000 });
  assert.equal(await recoverRunOwner(f.root), true);
  const resumed = await RunController.open({ root: f.root });
  try { await resumed.bindOrdinaryDesignBudgetLifecycle(); }
  finally { await resumed.close(); }
});

for (const failure of ['create', 'close']) test(`uncertain ${failure} retains owner across new hosts and same-process reopen`, async t => {
  const f = await conservedFixture(t); await f.execute();
  const controller = await RunController.open({ root: f.root }), work = new OwnedWork(controller.signal);
  const scope = await controller.bindOrdinaryDesignBudgetLifecycle(); let nativeCloses = 0;
  const factory = scope.wrapFactory(async () => {
    if (failure === 'create') throw new Error('Uncertain native creation');
    return { actorId: 'fake', contextId: 'fake', prompt: async () => ({ text: '' }), close: async () => {
      if (++nativeCloses === 1) throw new Error('Uncertain native close');
    } };
  });
  await work.run(async (_signal, operation) => {
    scope.bindOperation(work, operation);
    if (failure === 'create') await assert.rejects(factory({ controller } as any), /creation/);
    else {
      const session = await factory({ controller } as any);
      await assert.rejects(session.close(), /close/); await assert.rejects(session.close(), /close/);
      assert.equal(nativeCloses, 1, 'second close must retain the first rejected promise');
    }
  });
  await assert.rejects(controller.bindOrdinaryDesignBudgetLifecycle(), /already bound/);
  await assert.rejects(controller.close(), /retaining owner/);
  await readFile(join(f.root, '.controller.lock'));
  await assert.rejects(RunController.open({ root: f.root }), /owner/);
  await assert.rejects(recoverRunOwner(f.root), /alive|running|exists/i);
  assert.equal((await f.state()).events.filter((row: any) => row.type === 'ordinary_design_revision_budget_activated').length, 1);
});
