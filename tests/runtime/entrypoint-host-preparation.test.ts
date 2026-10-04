import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as hosts from '../../src/runtime/entrypoint-host.ts';
import { snapshot } from '../../src/artifacts/paths.ts';
import { transferFixture } from '../transfer/runtime-host.fixture.ts';

async function origins() {
  const module: any = await import('../../probes/transfer/loopback-origin.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof module.reserveTransferOrigin, 'function', 'COS38 owned origin preparation is missing');
  return module;
}
test('prepared proposal is explicit and never falls back to a human draft or dummy scenario', async t => {
  assert.equal(typeof (hosts as any).createValidationPreparedBrowserHost, 'function', 'Explicit preparation factory is missing');
  const f = await transferFixture(t), api: any = await import('../../probes/transfer/runtime-host.ts');
  await assert.rejects(api.createTransferRuntimeHost({ ...f.input, proposal: { ...f.input.proposal, scenario: {} } }), /proposal|preparation|field/i);
  await assert.rejects(hosts.createValidationBrowserHost(f.input as any), /proposal|scenario|field/i);
  await assert.rejects(api.createTransferRuntimeHost({ ...f.input, proposal: { ...f.input.proposal, brief: 'changed' } }), /proposal|frozen|input/i);
});

test('owned loopback origin uses original port on resume, refuses conflicts and drains cancellation', async t => {
  const a = await origins(), root = await mkdtemp(join(tmpdir(), 'cosmos-origin-')); t.after(() => rm(root, { recursive: true, force: true }));
  const signal = new AbortController(); let active = true;
  const binding = { caseId: 'synthetic', windowId: 'window', sourceVersion: 'a'.repeat(40), requirementSha256: 'b'.repeat(64), runId: 'synthetic-run', specVersion: '1.0' };
  const input = { root, binding, resume: false, signal: signal.signal, requireScope: async () => { if (!active) throw new Error('Scope changed'); } };
  const origin = await a.reserveTransferOrigin(input); t.after(() => origin.close());
  assert.equal((await fetch(origin.url)).status, 404);
  const bytes = await readFile(join(root, 'host-transfer-origin.json'));
  const port = Number(new URL(origin.url).port); await origin.close();
  const other = createServer((_req, res) => res.end()); other.listen(port, '127.0.0.1'); await once(other, 'listening');
  await assert.rejects(a.reserveTransferOrigin({ ...input, resume: true }), /EADDRINUSE|port|origin/i);
  await new Promise<void>(done => other.close(() => done()));
  const reopened = await a.reserveTransferOrigin({ ...input, resume: true }); t.after(() => reopened.close()); assert.equal(reopened.url, origin.url);
  assert.deepEqual(await readFile(join(root, 'host-transfer-origin.json')), bytes);
  await assert.rejects(a.reserveTransferOrigin({ ...input, resume: true, binding: { ...binding, sourceVersion: 'c'.repeat(40) } }), /binding|source|origin/i);
  active = false; await assert.rejects(reopened.verify(), /Scope changed/); await assert.rejects(fetch(reopened.url)); active = true;
  signal.abort(); await reopened.close(); await assert.rejects(fetch(reopened.url));
  assert.deepEqual(await readFile(join(root, 'host-transfer-origin.json')), bytes);
});

test('the owned preparation envelope drains early callback failures without relying on finish', async t => {
  const f = await transferFixture(t), api: any = await import('../../probes/transfer/runtime-host.ts');
  const host = await api.createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const receipt = await readFile(join(f.root, 'host-transfer-origin.json')), url = JSON.parse(receipt.toString('utf8')).url;
  assert.equal(typeof host.withPreparation, 'function', 'An early DAG failure needs the owned preparation envelope');
  await assert.rejects(host.withPreparation(async () => { throw new Error('Synthetic early provider failure'); }), /early provider/);
  await assert.rejects(fetch(url)); assert.deepEqual(await readFile(join(f.root, 'host-transfer-origin.json')), receipt);
  let dispatched = false; await assert.rejects(host.withPreparation(async () => { dispatched = true; })); assert.equal(dispatched, false);
});

test('factory failure after origin reservation closes its listener and preserves the write-once receipt', async t => {
  const f = await transferFixture(t), api: any = await import('../../probes/transfer/runtime-host.ts');
  const blocked = join(f.root, 'validation', f.window.caseId, f.window.quote.declaration.grants.design.taskId);
  await mkdir(blocked, { recursive: true }); await writeFile(join(blocked, 'workspace'), 'Synthetic path conflict', 'utf8');
  await assert.rejects(api.createTransferRuntimeHost(f.input));
  const receipt = await readFile(join(f.root, 'host-transfer-origin.json')); await assert.rejects(fetch(JSON.parse(receipt.toString('utf8')).url));
  assert.deepEqual(await readFile(join(f.root, 'host-transfer-origin.json')), receipt); assert.equal(f.calls.length, 0);
});

test('preparation rejects changed complete requirement, incomplete task outputs and expired scope before dispatch', async t => {
  const f = await transferFixture(t), api: any = await import('../../probes/transfer/runtime-host.ts');
  const host = await api.createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const tasks = f.prepare(host), changed = structuredClone(tasks); changed[0].expectedArtifacts!.pop();
  assert.throws(() => host.validateTasks(changed), /fixed|output|binding/i); await host.closePreparation();
  const reopened = await api.createTransferRuntimeHost({ ...f.input, resume: true }); t.after(() => reopened.closePreparation()); reopened.validateTasks(tasks);
  await f.controller.registerTasks(tasks.map(item => item.task));
  const path = join(f.root, 'registry/captures', `${f.window.caseId}-requirement-bundle`, 'fixture-v1/files/_cosmos/execution-requirement.json');
  const value = JSON.parse(await readFile(path, 'utf8')); value.validation.decision.actorId = 'fake-operator'; await writeFile(path, JSON.stringify(value), 'utf8');
  const before = await snapshot(f.root); await assert.rejects(reopened.preAuthor(tasks[0].task, f.controller.signal), /requirement binding changed/i);
  assert.deepEqual(await snapshot(f.root), before); assert.equal(f.calls.length, 0);
  const expired = await transferFixture(t), expiredHost = await api.createTransferRuntimeHost(expired.input); t.after(() => expiredHost.closePreparation());
  const expiredTasks = expired.prepare(expiredHost); expiredHost.validateTasks(expiredTasks); await expired.controller.registerTasks(expiredTasks.map((item: any) => item.task));
  const receipt = await readFile(join(expired.root, 'host-transfer-origin.json')); expired.advance(2_700_000);
  await assert.rejects(expiredHost.preAuthor(expiredTasks[0].task, expired.controller.signal), /deadline|stop|abort|active/i);
  await assert.rejects(fetch(JSON.parse(receipt.toString('utf8')).url)); assert.equal(expired.calls.length, 0);
  await assert.rejects(api.createTransferRuntimeHost({ ...expired.input, resume: true }), /deadline|stop|abort|active/i);
  assert.deepEqual(await readFile(join(expired.root, 'host-transfer-origin.json')), receipt);
});

test('preparation cancellation drains owned work and rejects a callback result after scope drift', async t => {
  const f = await transferFixture(t), api: any = await import('../../probes/transfer/runtime-host.ts');
  const host = await api.createTransferRuntimeHost(f.input); t.after(() => host.closePreparation());
  const url = JSON.parse((await readFile(join(f.root, 'host-transfer-origin.json'))).toString('utf8')).url;
  let started!: () => void; const ready = new Promise<void>(done => { started = done; });
  const executing = host.withPreparation(async () => { started(); await new Promise<void>(done => f.input.work.signal.addEventListener('abort', () => done(), { once: true })); return 'Cancelled fixture'; });
  const rejected = assert.rejects(executing, /cancel|abort/i); await ready;
  await f.input.work.cancelAndDrain('Synthetic cancellation'); await rejected; await assert.rejects(fetch(url));
  const changed = await transferFixture(t), changedHost = await api.createTransferRuntimeHost(changed.input); t.after(() => changedHost.closePreparation());
  const changedUrl = JSON.parse((await readFile(join(changed.root, 'host-transfer-origin.json'))).toString('utf8')).url;
  await assert.rejects(changedHost.withPreparation(async () => { changed.changeIdentity(); return 'Stale scope'; }), /identity|source|platform/i);
  await assert.rejects(fetch(changedUrl)); assert.equal(f.calls.length + changed.calls.length, 0);
});
