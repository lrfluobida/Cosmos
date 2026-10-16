import assert from 'node:assert/strict';
import test from 'node:test';
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crc32, deflateSync } from 'node:zlib';
import { withTransferCaseFifteenFixture } from './validation-case-fifteen.fixture.ts';
import { stageTransferValidationCaseFifteenInput, bootstrapTransferValidationCaseFifteenToolchain } from '../../probes/transfer/validation-case-fifteen-driver.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { executeTransferValidationCaseFifteenDag } from '../../probes/transfer/validation-case-fifteen-driver.ts';
import { createNativeBrowserHostIO } from '../../src/runtime/entrypoint-host.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { syntheticReports } from './passed-stage-reuse-reports.fixture.ts';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import { validationBudgetGroup } from '../../src/contracts/budget.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import type { TestContext } from 'node:test';
import { completeTransferValidationCaseFifteen } from '../../probes/transfer/validation-case-fifteen-entry.ts';
import { prepareTransferValidationCaseFifteenExecution } from '../../probes/transfer/validation-case-fifteen-task.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { PersistentAcceptanceOptions, PersistentAcceptanceSeries } from '../../src/acceptance/persistent.ts';
import { validationReservation } from '../../src/runtime/validation-validation.ts';

const fixturePng = (() => {
  const chunk = (name: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(name), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(payload)); return Buffer.concat([size, payload, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 255, 255]))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
})();

test('C15 real coding-only driver reaches the reused consumer host with a different C5 input hash', async t => {
  await withTransferCaseFifteenFixture(t, async f => {
    const scoped = await stageTransferValidationCaseFifteenInput(f.input, f.historical), inherited = await f.historical.verify(f.input.signal);
    assert.notEqual(scoped.requirement.validation.frozenCaseInputHash, inherited.sourceRequirement.validation.frozenCaseInputHash);
    assert.deepEqual(scoped.requirement.acceptance, inherited.sourceRequirement.acceptance);
    let sessions = 0, imports = 0;
    const construct = (historicalStages = f.historical, requirement = scoped.requirement, proposal = scoped.proposal, resume = false) => createTransferReusedConsumerHost({
      root: f.root, controller: f.input.controller, requirement, proposal, validation: scoped.binding, work: f.input.work, resume, historicalStages,
      sessionFactory: async () => { sessions++; throw new Error('SOURCE construction creates no role session'); },
      io: { build: async () => { throw new Error('SOURCE construction creates no build'); }, play: async () => { throw new Error('SOURCE construction creates no browser'); } } });
    for (const [label, mutate] of [
      ['wrong C5 window', (value: any) => { value.sourceRequirement.validation.windowId = 'wrong-window'; }],
      ['wrong C5 source', (value: any) => { value.manifest.reviewedPlatformSha = '0'.repeat(40); }],
      ['wrong requirement capture', (value: any) => { value.requirementCapture = value.mediaArtifact; }],
      ['wrong captured source path', (value: any) => { value.sourceRequirement.sources[0].location = 'requirements/other.json'; }],
      ['changed complete acceptance', (value: any) => { value.sourceRequirement.acceptance[0].expected += 'changed'; }],
      ['wrong historical operator', (value: any) => { value.sourceRequirement.validation.decision.actorId = 'other'; }],
      ['wrong historical root', (value: any) => { value.manifest.originalRoot = f.root; }],
    ] as const) {
      const historical = { ...f.historical, verify: async (signal: AbortSignal) => { const value = structuredClone(await f.historical.verify(signal)); mutate(value); return value; },
        import: async (signal: AbortSignal) => { imports++; return f.historical.import(signal); } };
      await assert.rejects(construct(historical), /historical|requirement|C15|capture|source/i, label);
      assert.equal(imports, 0, label); assert.equal(sessions, 0, label);
    }
    const wrongCase = structuredClone(scoped.requirement); wrongCase.validation.caseId = 'cos20-transfer-validation-6';
    await assert.rejects(construct(f.historical, wrongCase), /scope|authority|input/i);
    const wrongPath = structuredClone(scoped.requirement); wrongPath.sources[0].location = 'requirements/other.json';
    await assert.rejects(construct(f.historical, wrongPath), /scope|authority|input/i);
    const currentPath = join(f.root, 'requirements/fixed.json'), currentBytes = await readFile(currentPath);
    for (const mutate of [(value: any) => { value.scope += 'changed'; }, (value: any) => { value.preparation.brief += 'changed'; },
      (value: any) => { value.budgetGroup = { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 }; }]) {
      const value = JSON.parse(currentBytes.toString('utf8')); mutate(value); await writeFile(currentPath, JSON.stringify(value), 'utf8');
      try { await assert.rejects(construct(), /input|source|fixed/i); } finally { await writeFile(currentPath, currentBytes); }
      assert.equal(sessions, 0);
    }
    await assert.rejects(lstat(join(f.root, 'host-historical-stage-import.json')), (error: any) => error.code === 'ENOENT');
    const host = await createTransferReusedConsumerHost({ root: f.root, controller: f.input.controller, requirement: scoped.requirement, proposal: scoped.proposal,
      validation: scoped.binding, work: f.input.work, resume: false, historicalStages: f.historical,
      sessionFactory: async () => { sessions++; throw new Error('SOURCE construction creates no role session'); },
      io: { build: async () => { throw new Error('SOURCE construction creates no build'); }, play: async () => { throw new Error('SOURCE construction creates no browser'); } } });
    try { assert.equal(sessions, 0); assert.equal(host.taskPolicies.length, 1); assert.equal(host.taskPolicies[0].role, 'coding'); }
    finally { await host.closePreparation(); }
    const restored = await construct(f.historical, scoped.requirement, scoped.proposal, true);
    await restored.closePreparation(); assert.equal(sessions, 0);
    await assert.rejects(lstat(join(f.root, 'sessions')), (error: any) => error.code === 'ENOENT');
  });
});

/** Genuine Pi session/admission; only the provider transport and browser observations are synthetic. */
async function fakePi(t: TestContext) {
  const { ModelRuntime } = await import('@earendil-works/pi-coding-agent'), { lazyStream } = await import('@earendil-works/pi-ai');
  const nativeCreate = ModelRuntime.create, calls: any[] = [], admissions: any[] = []; let active: any, network = 0, toolProbe: ((config: any) => Promise<void>) | undefined;
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('SOURCE network is disabled'); });
  t.mock.method(ModelRuntime, 'create', async function(this: typeof ModelRuntime, ...args: any[]) {
    const config = active, packet = JSON.parse(config.context), runtime = await (nativeCreate as any).apply(this, args);
    runtime.streamSimple = (model: any, context: any, options: any) => lazyStream(model, async () => (async function* () {
      const images = context.messages.flatMap((message: any) => Array.isArray(message.content) ? message.content.filter((part: any) => part.type === 'image') : []);
      calls.push({ role: packet.role, taskId: packet.taskId, images: images.length, contextId: packet.contextId, inputs: packet.inputs });
      let response: any;
      if (packet.role === 'coding') {
        const folder = join(config.workspace, 'authors/coding');
        const initial = await readdir(folder, { recursive: true }); assert.ok(initial.every((name: string) => name === 'src'), 'Fresh author received no C14 coding files.');
        await mkdir(join(folder, 'src'), { recursive: true });
        await writeFile(join(folder, 'index.html'), '<!doctype html><html><body><p>合成运行链夹具</p><script type="module" src="/src/main.ts"></script></body></html>\n', 'utf8');
        await writeFile(join(folder, 'src/main.ts'), '// 仅用于 SOURCE 构建和角色交接的夹具，不是生成游戏验收。\nexport {};\n', 'utf8');
        response = { summary: 'SOURCE newly authored fixture files; no actual game claim.', remaining: [], uncertainty: [] };
      } else {
        assert.equal(packet.role, 'reviewer'); assert.ok(images.length > 0 && images.length <= 8);
        response = { verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId),
          ...(packet.codingConcernReview ? { concernResolutions: packet.codingConcernReview.concerns.map((concern: any) => ({ concernId: concern.concernId, concernText: concern.text,
            status: 'resolved', basis: 'host_evidence', rationale: 'SOURCE fixture cites the exact current host checks and output versions; no actual game claim.',
            acceptanceIds: packet.acceptance.map((item: any) => item.acceptanceId), inputVersions: packet.inputs,
            evidenceIds: packet.evidence.map((item: any) => item.evidenceId), evidenceRefs: packet.evidence.map((item: any) => item.source) })) } : {}) };
      }
      await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: 1, completion_tokens: 1 } }, model);
      const message: any = { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(response) }], api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', stopReason: 'stop', timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      yield { type: 'done' as const, reason: message.stopReason, message };
    })());
    return runtime;
  });
  t.after(() => assert.equal(network, 0));
  return { calls, admissions, setToolProbe: (probe: (config: any) => Promise<void>) => { toolProbe = probe; }, sessionFactory: async (config: any) => {
    active = config;
    if (JSON.parse(config.context).role === 'coding' && toolProbe) { const probe = toolProbe; toolProbe = undefined; await probe(config); }
    return createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'SOURCE-inert-transport-only' }, budget: {
      beforeRequest: async (request: any) => { admissions.push(request); await config.budget.beforeRequest(request); }, afterResponse: config.budget.afterResponse } });
  } };
}

test('C15 reviewer fixture PNG reaches real Pi image admission', async t => {
  const pi = await fakePi(t), root = await mkdtemp(join(tmpdir(), 'cos101-pi-image-'));
  const session = await pi.sessionFactory({ workspace: root, stateDirectory: join(root, 'session'), systemPrompt: 'SOURCE fixture',
    context: JSON.stringify({ role: 'reviewer', taskId: 'SOURCE-image', inputs: [], evidence: [] }), tools: [], maxOutputTokens: 16384, maxRequests: 1, requestTimeoutMs: 2000,
    estimatedMaxCostMicroCny: validationReservation, budget: { beforeRequest: async () => {}, afterResponse: async () => {} } });
  try { await session.prompt('Review SOURCE fixture image', { images: [{ type: 'image', data: fixturePng, mimeType: 'image/png' }] }); }
  catch (error) { t.diagnostic(JSON.stringify({ root, calls: pi.calls, admissions: pi.admissions })); throw error; }
  finally { await session.close(); }
  assert.equal(pi.calls[0].images, 1); assert.equal(pi.admissions[0].hasImages, true); assert.equal(pi.admissions[0].estimatedMaxCostMicroCny, 2_131_072);
});

/** Synthetic browser facts using the real caller-owned wait recorder and exact durable raw packets. */
async function nativeSyntheticReports(series: PersistentAcceptanceSeries, options: PersistentAcceptanceOptions) {
  const report = await syntheticReports(series, options), waits = options.nativeValidationWaits!;
  assert.ok(waits); const seriesStartedAt = Date.now(), clock = performance.now(); report.startedAt = new Date(seriesStartedAt).toISOString();
  for (const row of report.segments) {
    const startedAt = Date.now(); row.report.startedAt = new Date(startedAt).toISOString();
    const segment = waits.beginSegment(row.report.plan.reportId);
    await segment.runStage('prepare_authority', async () => {}); await segment.runStage('register_authority', async () => {});
    await segment.runStage('browser_transport', async () => {}); segment.beginNavigation(); await segment.runStage('navigation', async () => {});
    segment.finishNavigation(); segment.revoke(); await segment.settle(options.deadlineAt);
    const at = Date.now(), deadlineAt = Math.min(options.deadlineAt - 5000, at + 30000);
    row.report.nativeWaits = { contractVersion: waits.contractVersion, deadlineAt: options.deadlineAt, workDeadlineAt: waits.workDeadlineAt, segment: segment.snapshot(),
      cleanup: { startedAt: at, endedAt: at, deadlineAt, gracefulDeadlineAt: deadlineAt - 5000, rawPending: 0,
        steps: (['final_screenshot', 'video_stop', 'lifecycle_close', 'video_save', 'client_close', 'force', 'raw_settle'] as const).map(step => {
          const skipped = step === 'video_save' || step === 'force';
          return { step, startedAt: skipped ? null : at, endedAt: skipped ? null : at, outcome: skipped ? 'skipped' : 'passed', rawPending: false };
        }) } };
    row.report.endedAt = new Date(at).toISOString(); row.report.mediaObservations!.recordedAt = row.report.endedAt;
    for (const file of row.report.files.filter(path => path.endsWith('.png'))) await writeFile(join(options.evidenceRoot, file), Buffer.from(fixturePng, 'base64'));
    await writeFile(join(options.evidenceRoot, row.report.reportPath), JSON.stringify(row.report), 'utf8');
  }
  const seriesEndedAt = Date.now(); report.endedAt = new Date(seriesEndedAt).toISOString();
  report.nativeWaits = { ...waits.snapshot(), caseId: waits.caseId, windowId: waits.windowId, taskId: waits.taskId, seriesStartedAt, seriesEndedAt, seriesElapsedMs: performance.now() - clock };
  await writeFile(join(options.evidenceRoot, report.reportPath), JSON.stringify(report), 'utf8'); return report;
}

test('C15 SOURCE real factory Pi build media image review promotes the exact new candidate and stops normally', async t => {
  const pi = await fakePi(t);
  await withTransferCaseFifteenFixture(t, async f => {
    const scoped = await stageTransferValidationCaseFifteenInput(f.input, f.historical), io = createNativeBrowserHostIO(f.input), group = validationBudgetGroup(f.baseline.ledger);
    const admission = f.input.window.operatorDecision.sourceRefs.find(ref => ref.artifactId.endsWith('-admission'))!;
    const admissionPath = join(f.ledgerRoot, admission.location), admissionBytes = await readFile(admissionPath);
    let rejectedChildren = 0;
    await writeFile(admissionPath, Buffer.concat([admissionBytes, Buffer.from(' ')]));
    try { await assert.rejects(bootstrapTransferValidationCaseFifteenToolchain(f.input, async () => { rejectedChildren++; throw new Error('Unexpected child'); }), /admission|changed/i); }
    finally { await writeFile(admissionPath, admissionBytes); }
    assert.equal(rejectedChildren, 0);
    pi.setToolProbe(async config => {
      await writeFile(admissionPath, Buffer.concat([admissionBytes, Buffer.from(' ')]));
      try { await assert.rejects(config.tools.find((tool: any) => tool.name === 'read').execute('SOURCE-read-before-source-recheck', { path: 'requirements/fixed.json' }), /admission|changed/i); }
      finally { await writeFile(admissionPath, admissionBytes); }
      assert.equal(pi.calls.length, 0);
    });
    let builds = 0, seriesCount = 0;
    const transport = { ...io, build: async (...args: Parameters<typeof io.build>) => { builds++; return io.build(...args); }, playPersistent: async (series: Parameters<NonNullable<typeof io.playPersistent>>[0], options: Parameters<NonNullable<typeof io.playPersistent>>[1]) => {
        seriesCount++; assert.equal(series.segments.length, 8); assert.ok(options.mediaObservations);
        return nativeSyntheticReports(series, options);
      } };
    const preparedHost = await createTransferReusedConsumerHost({ root: f.root, controller: f.input.controller, requirement: scoped.requirement, proposal: scoped.proposal,
      validation: scoped.binding, work: f.input.work, resume: false, historicalStages: f.historical, sessionFactory: pi.sessionFactory, io: transport });
    await prepareTransferValidationCaseFifteenExecution({ state: await f.input.controller.read(), window: f.input.window, requirement: scoped.requirement,
      host: preparedHost, historical: await f.historical.verify(f.input.signal), root: f.root, manifestRef: f.historical.manifestRef, capability: preparedHost.capability, signal: f.input.signal }, false);
    const deadline = f.input.window.deadlineAt; await preparedHost.closePreparation(); await f.input.work.cancelAndDrain('SOURCE release owner before cold recovery'); await f.input.controller.close();
    const restored = await RunController.openValidationCase({ ...f.context, caseId: f.input.window.caseId, windowId: f.input.window.windowId }), work = new OwnedWork(restored.signal);
    Object.assign(f.input, { controller: restored, work, signal: work.signal });
    assert.equal((await restored.read()).validation!.cases.at(-1)!.deadlineAt, deadline);
    const resumed = await stageTransferValidationCaseFifteenInput(f.input, f.historical, true), restoredIO = createNativeBrowserHostIO(f.input);
    const host = await createTransferReusedConsumerHost({ root: f.root, controller: restored, requirement: resumed.requirement, proposal: resumed.proposal,
      validation: resumed.binding, work, resume: true, historicalStages: f.historical, sessionFactory: pi.sessionFactory,
      io: { ...restoredIO, build: async (...args) => { builds++; return restoredIO.build(...args); }, playPersistent: transport.playPersistent } });
    const roleFactory = host.roleFactory; let checkedProvider = false;
    host.roleFactory = async options => {
      if (!checkedProvider) {
        checkedProvider = true;
        const path = join(f.ledgerRoot, f.historical.manifestRef.location), bytes = await readFile(path);
        await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')]));
        try { await assert.rejects(roleFactory(options), /historical|manifest|digest|changed/i); }
        finally { await writeFile(path, bytes); }
        assert.equal(pi.calls.length, 0);
      }
      return roleFactory(options);
    };
    const result = await executeTransferValidationCaseFifteenDag(f.input, resumed.requirement, resumed.binding, host, f.historical, true);
    assert.equal(result.outcome, 'passed', JSON.stringify({ gaps: result.gaps, task: result.tasks?.at(-1)?.attempts })); assert.equal(builds, 1); assert.equal(seriesCount, 1);
    assert.deepEqual(pi.calls.map(call => call.role), ['coding', 'reviewer']);
    assert.notEqual(pi.calls[0].contextId, pi.calls[1].contextId);
    assert.ok(pi.calls[0].inputs.every((ref: any) => !ref.artifactId.startsWith('cos20-transfer-validation-14')));
    assert.equal(pi.admissions.length, 2); assert.equal(pi.admissions[1].hasImages, true); assert.equal(pi.admissions[1].estimatedMaxCostMicroCny, 2_131_072);
    const current = await new ArtifactRegistry(f.root, 'registry').current(); assert.deepEqual(current!.candidateRef, result.accepted);
    assert.equal(result.tasks!.at(-1)!.state, 'passed'); assert.equal(result.tasks!.at(-1)!.review.verdict, 'approved');
    const before = await f.input.controller.read(); assert.deepEqual(validationBudgetGroup(before.ledger), group);
    assert.deepEqual(before.validation!.cases.slice(0, 22), f.baseline.validation.cases); assert.equal(before.ledger.allocationDelegations!.length, 14);
    const report = await completeTransferValidationCaseFifteen(f.input, f.historical, [], result);
    assert.equal(report.outcome, 'passed'); assert.ok(report.cleanupEndedAt); assert.equal(report.allocationSource, 'shared-unallocated');
    await assert.rejects(lstat(join(f.ledgerRoot, '.controller.lock')), (error: any) => error.code === 'ENOENT');
    const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8')); assert.equal(after.validation!.cases.at(-1)!.stopReason!.code, 'manual');
    assert.ok(after.ledger.entries.every((row: any) => !row.unknown && row.reservedMicroCny === 0));
    assert.deepEqual((await new ArtifactRegistry(f.root, 'registry').current())!.candidateRef, result.accepted);
    await writeFile(join(f.archive, 'SOURCE-C15-pipeline-result.json'), JSON.stringify({ source: 'SOURCE364 fake provider/browser observations; real factory/Pi/build/promotion', result, admissions: pi.admissions,
      calls: pi.calls, cleanupEndedAt: new Date().toISOString(), afterRevision: after.revision, generatedGameAccepted: false }, null, 2) + '\n', 'utf8');
  }, { materializeToolchain: true });
});

test('C15 SOURCE preserved genuine build failure has no promotion and retains output stop and gaps', async t => {
  const archive = join(tmpdir(), 'cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C14-proof-ce4c214a-c5fc-49ab-b794-cb81c6b31f04'), root = join(archive, 'case15');
  const result = JSON.parse(await readFile(join(root, 'host-result.json'), 'utf8')), state = JSON.parse(await readFile(join(archive, 'result-snapshot.json'), 'utf8'));
  assert.equal(result.outcome, 'failed'); assert.equal(result.accepted, undefined); assert.ok(result.gaps.length > 0);
  assert.equal(await new ArtifactRegistry(root, 'registry').current(), null);
  const task = result.tasks.at(-1); assert.equal(task.state, 'failed'); assert.equal(task.review.verdict, 'pending');
  assert.match(task.attempts[0].failure.actual, /EPERM.*symlink/);
  assert.equal(state.validation.cases.at(-1).caseId, 'cos20-transfer-validation-15'); assert.equal(state.validation.cases.at(-1).stopReason.code, 'manual');
  assert.equal(state.validation.cases.at(-1).repair, null); assert.ok(state.ledger.entries.every((row: any) => !row.unknown && row.reservedMicroCny === 0));
  assert.ok(await lstat(join(root, task.artifacts[0].location, 'src/main.ts')));
  t.diagnostic(`Reused exact SOURCE Pi/capture/build infrastructure failure ${archive}; fixture junction copy failed, no game completion claim.`);
});
