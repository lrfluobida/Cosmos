import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { assertPilotNotStarted, claimPilotOrigin, createPilotGuard } from '../../probes/e2e/budget.ts';
import { validateRolePlan, stageAcceptance } from '../../probes/e2e/policy.ts';
import { validateMediaSpec } from '../../probes/e2e/media.ts';
import { copyReviewInputs, runChild } from '../../probes/e2e/host.ts';
import { generatePilot } from '../../probes/e2e/driver.ts';

test('a saved origin blocks a new timed run even before the first paid reservation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-origin-')); t.after(() => rm(root, { recursive: true, force: true }));
  await assertPilotNotStarted(root);
  const origin = { root: join(root, 'pilot-first'), startedAt: '2026-10-01T00:00:00.000Z', deadlineAt: '2026-10-01T01:30:00.000Z', platformHead: 'a'.repeat(40) };
  await claimPilotOrigin(root, origin);
  await assert.rejects(assertPilotNotStarted(root), /prior COS-10 pilot origin/);
  await assert.rejects(claimPilotOrigin(root, { ...origin, root: join(root, 'pilot-second') }), /EEXIST/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'cos10-pilot.json'), 'utf8')), origin);
});

test('pilot request guard persists the original deadline/count and rejects a fresh restart', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-guard-'));
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'r1', ledgerId: 'l1', kind: 'evaluation', scope: 'validation', specVersion: '1.0', allocations: [{ taskId: 'COS-10', amountMicroCny: 10_000_000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const deadlineAt = new Date(Date.now() + 60_000).toISOString();
  const guard = await createPilotGuard({ root, controller, deadlineAt, maxRequests: 1 });
  t.after(() => guard.close());
  let admissions = 0;
  const budget = guard.wrap({ beforeRequest: async () => { admissions++; }, afterResponse: async () => {} });
  const request = { requestId: 'request-1', modelId: 'deepseek-flash' as const, inputBytes: 10, maxOutputTokens: 100, hasImages: false, estimatedMaxCostMicroCny: 820 };
  await budget.beforeRequest(request);
  await assert.rejects(budget.beforeRequest({ ...request, requestId: 'request-2' }), /request limit/);
  assert.equal(admissions, 1);
  const journal = JSON.parse(await readFile(join(root, 'pilot-budget.json'), 'utf8'));
  assert.equal(journal.deadlineAt, deadlineAt); assert.deepEqual(journal.requestIds, ['request-1']);
  await assert.rejects(createPilotGuard({ root, controller, deadlineAt, maxRequests: 40 }), /EEXIST/);
});

test('pilot guard rejects a reservation that would cross the cumulative phase cap', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-cap-'));
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'r1', ledgerId: 'l1', kind: 'evaluation', scope: 'validation', specVersion: '1.0', allocations: [{ taskId: 'COS-10', amountMicroCny: 35_000_000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  await controller.importSettled({ requestId: 'history', taskId: 'COS-10', provider: 'fixture', pricingVersion: 'fixture', actualCostMicroCny: 29_999_990, evidence: [{ artifactId: 'receipt', version: 'v1', location: 'fixture.json' }] });
  const guard = await createPilotGuard({ root, controller, deadlineAt: new Date(Date.now() + 60_000).toISOString(), maxRequests: 40 }); t.after(() => guard.close());
  const budget = guard.wrap({ beforeRequest: async () => { throw new Error('must not dispatch'); }, afterResponse: async () => {} });
  await assert.rejects(budget.beforeRequest({ requestId: 'over', modelId: 'deepseek-flash', inputBytes: 1, maxOutputTokens: 1, hasImages: false, estimatedMaxCostMicroCny: 11 }), /cumulative/);
  assert.equal((await controller.read()).ledger.entries.length, 1);
});

test('expired pilot guard rejects calls without touching the original controller deadline', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-expired-'));
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'r1', ledgerId: 'l1', kind: 'evaluation', scope: 'validation', specVersion: '1.0', allocations: [{ taskId: 'COS-10', amountMicroCny: 1 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const original = (await controller.read()).run.originalDeadlineAt;
  await assert.rejects(createPilotGuard({ root, controller, deadlineAt: new Date(Date.now() - 1).toISOString(), maxRequests: 40 }), /deadline/);
  assert.equal((await controller.read()).run.originalDeadlineAt, original);
});

test('stage acceptance cannot replace frozen gameplay assertions and missing role plans fail', () => {
  const acceptance = stageAcceptance(['PILOT-VICTORY']);
  assert.deepEqual(acceptance.map(a => a.acceptanceId), ['PILOT-DESIGN', 'PILOT-MEDIA', 'PILOT-VICTORY']);
  assert.throws(() => validateRolePlan([], 'pilot-one', ['PILOT-VICTORY']), /three roles/);
});

test('media host refuses executable data and omissions before rendering any files', () => {
  assert.throws(() => validateMediaSpec({ characters: [], audio: [], script: 'eval' }), /media specification/);
  assert.throws(() => validateMediaSpec({ characters: [], audio: [] }), /five characters/);
});

test('review copying rejects refs outside the fixed workspace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-review-')); t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(copyReviewInputs(root, join(root, 'review'), [{ artifactId: 'escape', version: 'v1', location: '../secret' }]), /relative path/);
});

test('owned host child receives no key and abort completes with a bounded cleanup', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-child-')); t.after(() => rm(root, { recursive: true, force: true }));
  const clean = await runChild(process.execPath, ['-e', 'process.stdout.write(String(Boolean(process.env.DEEPSEEK_API_KEY || process.env.NODE_OPTIONS)))'], { cwd: root, signal: new AbortController().signal, timeoutMs: 10_000 });
  assert.equal(clean.stdout, 'false');
  const abort = new AbortController();
  const child = runChild(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: root, signal: abort.signal, timeoutMs: 10_000 });
  setTimeout(() => abort.abort(), 100);
  await assert.rejects(child, /aborted/);
});

test('real planning facade rejects a partial role plan before any author task or game output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-planning-'));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const toolchain = join(root, 'toolchain'); await mkdir(toolchain);
  await cp(join(repository, 'templates/2d'), toolchain, { recursive: true, filter: path => !path.includes('node_modules') });
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'r1', ledgerId: 'l1', kind: 'evaluation', scope: 'validation', specVersion: '1.0', allocations: [{ taskId: 'COS-10', amountMicroCny: 10_000_000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const guard = await createPilotGuard({ root, controller, deadlineAt: new Date(Date.now() + 60_000).toISOString(), maxRequests: 40 }); t.after(() => guard.close());
  let sessions = 0;
  await assert.rejects(generatePilot({ repository, root, prefix: 'pilot-test', controller, guard, toolchain, childAllocationCapMicroCny: 19_000_000, confirmedAt: new Date().toISOString(),
    sessionFactory: async config => {
      sessions++; const packet = JSON.parse(config.context);
      assert.equal(packet.role, 'cosmos'); assert.deepEqual(config.tools.map(tool => tool.name), ['read']);
      const source = await config.tools[0].execute('read-source', { path: `${packet.inputs[0].location}/_cosmos/requirements.json` }, undefined, undefined, undefined as never);
      assert.match(JSON.stringify(source), /星庭守望/);
      return { async prompt() { return { text: JSON.stringify({ tasks: [{ taskId: 'pilot-test-code', role: 'coding', objective: 'Incomplete deliberate planning fixture', acceptanceIds: packet.acceptance.map((a: any) => a.acceptanceId), dependsOn: [] }] }) }; }, async close() {} };
    },
  }), /three roles/);
  assert.equal(sessions, 1); assert.equal((await controller.read()).tasks.length, 0);
  assert.equal((await controller.read()).ledger.entries.length, 0);
});
