import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { packageStandalone, withCleanDelivery } from '../../src/runtime/entrypoint-delivery.ts';
import { roleToolEnvironment } from '../../src/roles/factory.ts';
import { stopBrowserProcess } from '../../src/acceptance/process.ts';
import { runOwnedNode } from '../../src/runtime/recovery/owned-command.ts';
import { reserveTransferOrigin } from '../../src/runtime/adapters/transfer/loopback-origin.ts';
import { renderDeclaredMedia } from '../../src/runtime/entrypoint-media.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';

const html = '<button id="fixture">点击</button><p id="result">0</p><script>document.querySelector("button").onclick=()=>document.querySelector("p").textContent="1";</script>';
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
const exited = (pid: number) => { try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; } };
async function fixture(t: test.TestContext, durationMs = 60000) {
  const root = await mkdtemp(join(tmpdir(), 'cos65-unit-'));
  const controller = await RunController.create({ root, runId: 'offline', ledgerId: 'synthetic-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1', durationMs,
    allocations: [{ taskId: 'host', amountMicroCny: 1 }] }), work = new OwnedWork(controller.signal);
  t.after(async () => { await work.cancelAndDrain('fixture cleanup'); await controller.close(); await rm(root, { recursive: true, force: true }); });
  const source = join(root, 'fixture'); await mkdir(join(source, 'src'), { recursive: true });
  for (const [file, value] of [['src/main.ts', '// Generic offline input fixture\n'], ['index.html', html], ['package.json', '{}'], ['package-lock.json', '{}']]) await writeFile(join(source, file), value, 'utf8');
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry', work }), captured = registry.artifactRef('source', 'v1');
  await registry.registerCapture({ taskId: 'host', artifactRef: captured, sourceRoot: 'fixture', files: ['src/main.ts', 'index.html', 'package.json', 'package-lock.json'].map(file => ({ source: file, destination: file })),
    ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'Offline test fixture', sourceRefs: ['test:generic-input'] } } });
  const candidate = registry.candidateRef('game', 'v1');
  await registry.stageCandidate({ taskId: 'host', authorId: 'fixture-author', contextId: 'fixture-context', candidateRef: candidate, targetRoot: candidate.location,
    inputs: [captured], expectedDeps: [captured], ownership: { writePaths: ['.'], readOnlyPaths: [] } });
  const project = join(root, candidate.location); await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), html, 'utf8'); await mkdir(join(root, 'evidence/host'), { recursive: true });
  const task = { runId: 'offline', taskId: 'host' } as any, authority = { taskId: 'host', windowId: null, deadlineAt: (await controller.read()).run.originalDeadlineAt };
  const input = { root, project, candidate, controller, work, authority, signal: controller.signal, requireCurrent: async () => { controller.signal.throwIfAborted(); await controller.read(); } };
  const pack = () => packageStandalone({ root, project, candidate, task, registry, signal: controller.signal });
  return { ...input, registry, task, input, pack };
}

test('standalone package records exact capture provenance and rejects altered promotion bytes', async t => {
  const f = await fixture(t); await f.pack();
  await assert.rejects(withCleanDelivery({ ...f.input, project: join(f.root, 'fixture') }, async () => assert.fail('Wrong path launched')), /fixed candidate path/i);
  const sources = JSON.parse(await readFile(join(f.project, '_cosmos/sources.json'), 'utf8'));
  assert.deepEqual(sources.captures[0].provenance.sourceRefs, ['test:generic-input']); assert.deepEqual(sources.dependencies, []);
  const proof = await f.registry.verifyCandidate(f.candidate, { build: async () => ({ passed: true, evidenceIds: ['fixture'] }),
    acceptance: async () => withCleanDelivery(f.input, async clean => { assert.equal(await (await fetch(clean.url)).text(), html); return { passed: true, evidenceIds: ['fixture'] }; }) });
  await writeFile(join(f.project, 'README.zh-CN.md'), '已变动\n', 'utf8');
  await assert.rejects(f.registry.promoteCandidate(f.candidate, { evidence: proof, review: { candidateRef: f.candidate, attemptId: proof.attemptId,
    reviewerId: 'independent-fixture', contextId: 'independent-context', verdict: 'approved', evidenceIds: ['fixture'] } }), /snapshot changed/i);
});

test('clean package version and copy bytes must match before a normal-input result can pass', async t => {
  const f = await fixture(t); await f.pack();
  await assert.rejects(withCleanDelivery({ ...f.input, candidate: { ...f.candidate, version: 'v2' } }, async () => assert.fail('Wrong version launched')), /wrong candidate/i);
  await assert.rejects(withCleanDelivery(f.input, async clean => { await writeFile(join(clean.project, 'dist/index.html'), 'changed', 'utf8'); }), /changed|did not complete/i);
  const report = JSON.parse(await readFile(join(f.root, 'evidence/host/delivery-check.json'), 'utf8')); assert.equal(report.outcome, 'failed'); assert.equal(report.helperExited, true);
});

test('missing dist and dependency lock disagreement fail packaging before launcher admission', async t => {
  const f = await fixture(t); await unlink(join(f.project, 'dist/index.html')); await assert.rejects(f.pack(), { code: 'ENOENT' });
  await writeFile(join(f.project, 'dist/index.html'), html, 'utf8'); await writeFile(join(f.project, 'package.json'), '{"dependencies":{"fixture":"1.0.0"}}', 'utf8');
  await assert.rejects(f.pack(), /dependencies differ/i);
  const state = await f.controller.read(); assert.equal(state.ledger.entries.length, 0);
});

test('missing source entry, captured built asset and sealed package cannot be delivered', async t => {
  const f = await fixture(t); await unlink(join(f.project, 'index.html')); await assert.rejects(f.pack(), { code: 'ENOENT' });
  await writeFile(join(f.project, 'index.html'), html, 'utf8');
  const spec = { characters: [{ id: 'marker', width: 32, height: 32, anchor: { x: 16, y: 16 }, layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] };
  const rendered = await renderDeclaredMedia(f.root, 'rendered', spec, { summary: 'fixture', implementationNotes: [], acceptanceMapping: {}, characters: [{ id: 'marker', purpose: 'fixture', states: ['idle'] }], audio: [] }, f.signal);
  const media = f.registry.artifactRef('media', 'v1');
  await f.registry.registerCapture({ taskId: 'fixture-art', artifactRef: media, sourceRoot: 'rendered', files: rendered.files.map(file => ({ source: file, destination: file })),
    ownership: { writePaths: ['public/assets', '_cosmos'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'media', provenance: { kind: 'original-procedural', generator: 'Fixture renderer', sourceRefs: ['test:fixture-media'] }, media: rendered.media } });
  const candidate = f.registry.candidateRef('asset-game', 'v1'), source = f.registry.artifactRef('source', 'v1');
  await f.registry.stageCandidate({ taskId: 'host', authorId: 'fixture-author', contextId: 'fixture-context', candidateRef: candidate, targetRoot: candidate.location,
    inputs: [source, media], expectedDeps: [source, media], ownership: { writePaths: ['.'], readOnlyPaths: [] }, mediaRequirements: [{ artifactRef: media, media: rendered.media }] });
  const project = join(f.root, candidate.location); await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), html, 'utf8');
  await assert.rejects(packageStandalone({ root: f.root, project, candidate, task: f.task, registry: f.registry, signal: f.signal }), { code: 'ENOENT' });
  await writeFile(join(f.project, '../sealed.json'), '{}', 'utf8'); await assert.rejects(f.pack(), /sealed/i);
  assert.equal((await f.controller.read()).ledger.entries.length, 0);
});

test('dependency installed version drift and a failed launcher cannot create accepted delivery', async t => {
  const f = await fixture(t);
  await writeFile(join(f.project, 'package.json'), '{"dependencies":{"phaser":"3.90.0"}}', 'utf8');
  await writeFile(join(f.project, 'package-lock.json'), '{"packages":{"":{"dependencies":{"phaser":"3.90.0"}},"node_modules/phaser":{"version":"3.90.0","license":"MIT"}}}', 'utf8');
  await mkdir(join(f.root, 'toolchain/node_modules/phaser'), { recursive: true });
  await writeFile(join(f.root, 'toolchain/node_modules/phaser/package.json'), '{"name":"phaser","version":"0.0.0","license":"MIT"}', 'utf8');
  await assert.rejects(f.pack(), /version differs/i);
  await writeFile(join(f.project, 'package.json'), '{}', 'utf8'); await writeFile(join(f.project, 'package-lock.json'), '{}', 'utf8');
  await f.pack(); await writeFile(join(f.project, 'standalone-launcher.mjs'), 'throw new Error("fixture startup failure");\n', 'utf8');
  await assert.rejects(withCleanDelivery(f.input, async () => assert.fail('Broken launcher became ready')), /exited before readiness/i);
  const report = JSON.parse(await readFile(join(f.root, 'evidence/host/delivery-check.json'), 'utf8')); assert.equal(report.outcome, 'failed');
  const owner = JSON.parse(await readFile(join(f.root, '.controller.lock'), 'utf8')); assert.ok(owner.children.every((child: any) => exited(child.pid)));
  assert.equal(await f.registry.current(), null);
});

test('required browser resource failure is failed acceptance even when startup HTTP is 200', async t => {
  const f = await fixture(t); await f.pack();
  await writeFile(join(f.project, 'dist/index.html'), '<link rel="icon" href="data:,"><button id="fixture">点击</button><p id="result">0</p><script src="/missing-required.js"></script>', 'utf8');
  const result = await withCleanDelivery(f.input, async clean => {
    assert.equal((await fetch(clean.url)).status, 200);
    const report = await runAcceptance({ formatVersion: '1.0.0', projectId: 'fixture', taskId: 'host', runId: 'offline', reportId: 'missing-resource', specVersion: '1',
      artifact: f.candidate, url: clean.url, viewport: { width: 800, height: 600 }, acceptanceIds: ['input'], steps: [
        { id: 'click', kind: 'locator-click', selector: '#fixture', timeoutMs: 1000 }, { id: 'result', kind: 'assert', acceptanceId: 'input', observation: { kind: 'text', selector: '#result' }, expected: '1', timeoutMs: 1000 },
      ] }, { evidenceRoot: join(f.root, 'browser-evidence'), channel: 'msedge', timeoutMs: 10000 });
    assert.equal(report.outcome, 'failed'); assert.equal(report.cleanup.processExited, true); assert.ok(report.errors.length > 0); return { passed: false };
  });
  assert.equal(result.passed, false); const check = JSON.parse(await readFile(join(f.root, 'evidence/host/delivery-check.json'), 'utf8'));
  assert.equal(check.outcome, 'failed'); assert.equal(check.bytesMatched, true); assert.equal(check.acceptancePassed, false); assert.equal(check.helperExited, true);
  assert.equal(await f.registry.current(), null);
});

test('Node-only launcher starts outside package cwd and rejects unsafe paths and occupied ports', async t => {
  const f = await fixture(t); await f.pack(); const launcher = join(f.project, 'standalone-launcher.mjs');
  const child = spawn(process.execPath, [launcher], { cwd: tmpdir(), env: roleToolEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close'); t.after(async () => { if (child.exitCode === null) await stopBrowserProcess(child, 3000); await closed; });
  let stdout = ''; child.stdout.on('data', value => { stdout += value; }); const deadline = Date.now() + 5000;
  while (!stdout.includes('\n')) { if (Date.now() >= deadline) assert.fail('Standalone CLI did not announce URL'); await sleep(25); }
  const url = stdout.trim(); assert.equal(await (await fetch(url)).text(), html); assert.equal((await fetch(url + '/%2e%2e%2fpackage.json')).status, 404);
  assert.equal((await fetch(url + '/absent.js')).status, 404);
  for (const args of [['--port', '-1'], ['--port', '99999'], ['--port', new URL(url).port]]) {
    const other = spawn(process.execPath, [launcher, ...args], { env: roleToolEnvironment(), windowsHide: true, stdio: 'ignore' }); assert.notEqual((await once(other, 'close'))[0], 0);
  }
  await stopBrowserProcess(child, 3000); await closed; assert.ok(exited(child.pid!));
});

test('explicit stop drains the actual clean server and preserves failure evidence', async t => {
  const f = await fixture(t); await f.pack(); let url = '';
  await assert.rejects(withCleanDelivery(f.input, async clean => { url = clean.url; assert.equal((await fetch(url)).status, 200); await f.controller.stop('offline fixture stop'); await clean.requireCurrent(); }), (error: any) => error.code === 'manual');
  await assert.rejects(fetch(url)); const report = JSON.parse(await readFile(join(f.root, 'evidence/host/delivery-check.json'), 'utf8'));
  assert.equal(report.helperExited, true); assert.equal(report.outcome, 'failed'); assert.ok(exited(report.helperPid));
});

test('original deadline cleanup reserve drains the actual server without a new window', async t => {
  const f = await fixture(t, 7500); await f.pack(); let url = '';
  await assert.rejects(withCleanDelivery(f.input, async clean => { url = clean.url; await sleep(2600); await clean.requireCurrent(); }), /deadline|cleanup|cancel/i);
  await assert.rejects(fetch(url)); const report = JSON.parse(await readFile(join(f.root, 'evidence/host/delivery-check.json'), 'utf8'));
  assert.equal(report.helperExited, true); assert.equal(report.deadlineAt, f.authority.deadlineAt); assert.equal(report.outcome, 'failed'); assert.ok(exited(report.helperPid));
});

test('transfer frozen origin proxies the actual clean package and guards every request', async t => {
  const f = await fixture(t); await f.pack(); let current = true, calls = 0;
  const origin = await reserveTransferOrigin({ root: f.root, signal: f.signal, resume: false, requireScope: f.input.requireCurrent,
    binding: { profile: 'human', runId: 'offline', ledgerId: 'synthetic-ledger', windowId: null, sourceVersion: 'a'.repeat(40), sourceSha256: 'b'.repeat(64), requirementSha256: 'c'.repeat(64), specVersion: '1' } });
  t.after(origin.close); const receipt = await readFile(join(f.root, 'host-transfer-origin.json'));
  await withCleanDelivery(f.input, async clean => {
    const unmount = await origin.mountCandidate({ candidate: f.candidate, project: f.project, cleanDelivery: clean,
      verifyBinding: async () => { calls++; if (!current) throw new Error('Fixture binding changed'); } });
    try {
      const prior = calls; assert.equal(await (await fetch(origin.url)).text(), html); assert.ok(calls >= prior + 2);
      assert.notEqual(origin.url, clean.url); assert.notEqual(clean.project, f.project);
      current = false; assert.equal((await fetch(origin.url)).status, 404); current = true;
      assert.equal((await fetch(origin.url + '/absent.js')).status, 404);
    } finally { await unmount(); }
  });
  assert.deepEqual(await readFile(join(f.root, 'host-transfer-origin.json')), receipt); assert.equal((await fetch(origin.url)).status, 404);
});

for (const kind of ['stop', 'deadline']) test(`original ${kind} drains clean server, actual Edge and owned helper trees`, async t => {
  const f = await fixture(t, kind === 'deadline' ? 11000 : 60000); await f.pack(); const marker = join(f.root, 'browser-ready.json'); let browserPid = 0, url = '';
  const runner = new URL('../../src/acceptance/runner.ts', import.meta.url).href;
  const worker = `import{chromium}from'playwright';import{readFile,writeFile}from'node:fs/promises';import{runAcceptanceInOwnedSession}from ${JSON.stringify(runner)};
const input=JSON.parse(process.argv[1]);let server;
const lifecycle={deadlineAt:input.deadlineAt,open:async(directory,timeout)=>{server=await chromium.launchServer({channel:'msedge',headless:true,env:process.env,host:'127.0.0.1',timeout});const browser=await chromium.connect(server.wsEndpoint());const context=await browser.newContext({viewport:input.plan.viewport,serviceWorkers:'block'});await writeFile(input.marker,JSON.stringify({pid:server.process().pid}));return{browser,context};},process:()=>server?.process(),close:async()=>{await server?.close();},identity:()=>undefined};
const report=await runAcceptanceInOwnedSession(input.plan,{evidenceRoot:input.evidence,timeoutMs:15000,channel:'msedge'},lifecycle);console.log(JSON.stringify({outcome:report.outcome,failureFacts:report.failureFacts,errors:report.errors,browserPid:report.cleanup.browserPid}));`;
  await assert.rejects(withCleanDelivery(f.input, async clean => {
    url = clean.url;
    const plan = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'host', runId: 'offline', reportId: `browser-${kind}`, specVersion: '1', artifact: f.candidate, url,
      viewport: { width: 800, height: 600 }, acceptanceIds: ['input'], steps: [{ id: 'click', kind: 'locator-click', selector: '#fixture', timeoutMs: 1000 },
        { id: 'wait', kind: 'wait-for', acceptanceId: 'input', observation: { kind: 'text', selector: '#result' }, expected: 'never', timeoutMs: 10000 }] };
    const running = runOwnedNode({ controller: f.controller, authority: f.authority, cwd: fileURLToPath(new URL('../../', import.meta.url)), signal: f.signal,
      timeoutMs: 15000, args: ['--experimental-strip-types', '--input-type=module', '-e', worker, JSON.stringify({ plan, marker, evidence: join(f.root, 'browser-evidence'), deadlineAt: Date.parse(f.authority.deadlineAt) - 5000 })] });
    const ended = running.then(value => ({ value }), error => ({ error })); const readyDeadline = Date.now() + 5000;
    while (!browserPid) {
      const bytes = await readFile(marker, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      if (bytes) browserPid = JSON.parse(bytes).pid;
      else { const closed = await Promise.race([ended, sleep(25).then(() => null)]); if (closed) throw (closed as any).error ?? new Error('Browser exited before readiness'); if (Date.now() >= readyDeadline) throw new Error('Browser fixture readiness timed out'); }
    }
    if (kind === 'stop') await f.controller.stop('actual browser fixture stop');
    const result = await ended; if ('error' in result) throw result.error;
    if (kind === 'deadline') {
      const report = JSON.parse(result.value.stdout.trim());
      assert.equal(report.outcome, 'failed'); assert.equal(report.failureFacts.termination.kind, 'lifecycle');
      assert.ok(report.errors.some((error: string) => /deadline|timed out/i.test(error)), JSON.stringify(report));
      throw new Error('Original browser cleanup deadline failed.');
    }
    await clean.requireCurrent();
  }));
  assert.ok(browserPid > 0); assert.ok(exited(browserPid)); await assert.rejects(fetch(url));
  const report = JSON.parse(await readFile(join(f.root, 'evidence/host/delivery-check.json'), 'utf8'));
  assert.equal(report.helperExited, true); assert.equal(report.outcome, 'failed'); assert.ok(exited(report.helperPid));
  const owner = JSON.parse(await readFile(join(f.root, '.controller.lock'), 'utf8')); assert.ok(owner.children.every((child: any) => exited(child.pid)));
});
