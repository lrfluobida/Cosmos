import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { runCli } from '../../src/cli/index.ts';
import { runPublicValidationCli } from '../../probes/public-cli/validation.ts';
import { confirmedSource, silentOutput, temporaryRun } from '../runtime/confirmed-requirements.fixture.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { selectApprovedDesign } from '../../src/runtime/approved-design-source.ts';
import { checkSuppliedDesignHandoff } from '../../src/runtime/supplied-design.ts';
import { ART_DRAFT_FILE, selectArtDraft, selectArtDraftSelection } from '../../src/runtime/art-draft-source.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';

const io = () => ({ input: Readable.from([]), output: silentOutput() });
const read = (root: string, file: string) => readFile(join(root, file));
const json = async (root: string, file: string) => JSON.parse((await read(root, file)).toString('utf8'));
async function checkReadPlan(config: PiSessionOptions, path: string, source: string) {
  const read = config.tools!.find(tool => tool.name === 'read')!;
  assert.match(read.description, /planOffset counts display lines/);
  const invoke = async (args: object) => {
    const result = await read.execute('plan', { path, ...args }, undefined, undefined, undefined as never);
    const first = result.content[0]; assert.ok(first.type === 'text'); return first.text;
  };
  const all = await invoke({});
  assert.deepEqual(JSON.parse(all), JSON.parse(source));
  const second = await invoke({ planOffset: 2, limit: 1 });
  assert.equal(second.split('\n')[0], all.split('\n')[1]);
  assert.match(second, /Use planOffset=3/);
  const raw = await invoke({ offset: 2, limit: 1 });
  assert.equal(raw.split('\n')[0], source.split('\n')[1]);
}
// Replay only recorded R46 metering, using the real role's price selection and ledger hooks.
async function replayArtRequests(config: PiSessionOptions) {
  const receipts = [
    // input bytes, metered input/cache-read/output tokens, affordable new cap
    [13633, 3411, 128, 228, 61235], [48966, 10297, 3712, 166, 51321],
    [53184, 901, 14080, 469, 47507], [57751, 1216, 15360, 145, 45601],
    [60465, 503, 16640, 6414, 44396], [79957, 181, 23424, 1219, 32900],
    [84017, 173, 24704, 353, 30504], [87291, 650, 25216, 3359, 29166],
    [97024, 222, 29056, 339, 23085],
  ];
  const estimate = config.estimatedMaxCostMicroCny;
  assert.ok(typeof estimate === 'function');
  for (const [inputBytes, input, cacheRead, output, expectedCap] of receipts) {
    const request = { requestId: 'offline-art-' + inputBytes, modelId: 'deepseek-flash' as const, inputBytes, maxOutputTokens: 65536, hasImages: false };
    request.maxOutputTokens = await config.requestOutputLimit!(request);
    assert.equal(request.maxOutputTokens, expectedCap);
    await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: estimate(request) });
    await config.budget.afterResponse({ requestId: request.requestId, outcome: 'settled', responseModel: 'deepseek-flash',
      elapsedMs: 1, usage: { input, cacheRead, output, cacheWrite: 0 } });
  }
  const next = { requestId: 'offline-art-never-sent', modelId: 'deepseek-flash' as const, inputBytes: 100322, maxOutputTokens: 65536, hasImages: false };
  assert.equal(await config.requestOutputLimit!(next), 21720);
}

for (const outcome of ['approved', 'changes_requested', 'altered', 'source-drift', 'handoff-gap', 'native-failure', 'seed-drift']) test(`public supplied design: ${outcome}`, async t => {
  const files = new Map<string, string>(), consumers = new Set<string>();
  let authorRounds = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), body = await request.json();
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    assert.equal(++authorRounds, 1);
    assert.deepEqual(body.tools ?? [], []);
    assert.match(body.messages[0].content, /suppliedDesignHandoff/);
    assert.doesNotMatch(body.messages[0].content, /outputActivations|omitted objective rules|点击后显示完成/);
    if (outcome === 'native-failure') return new Response('Offline transport failure', { status: 401 });
    const text = JSON.stringify({ summary: 'Offline transport handoff of the checked files', remaining: [],
      uncertainty: outcome === 'handoff-gap' ? ['Reported handoff identity concern'] : [] });
    const chunk = { id: 'offline-handoff', model: 'deepseek-flash', choices: [{ index: 0, delta: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const next = await ordinaryHostFixture(t, { productionDefault: true, fault: outcome === 'changes_requested' ? 'review' : undefined,
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      if (packet.role === 'design') {
        assert.match(packet.objective, /hand off/i);
        assert.match(config.systemPrompt, /independent reviewer/);
        assert.doesNotMatch(config.systemPrompt, /validate-game-design|Read the fixed|inputFiles inventory/);
        assert.deepEqual(packet.tools, []); assert.deepEqual(config.tools, []);
        assert.deepEqual(packet.inputFiles, []); assert.deepEqual(packet.ownership, { readPaths: [], writePaths: [] });
        const { suppliedDesignHandoff: facts } = packet;
        assert.deepEqual(facts.suppliedDesign, (await json(next.root, 'snapshot.json')).designDraftReview);
        assert.deepEqual(facts.confirmation, (await json(next.root, 'snapshot.json')).requirementsSource);
        assert.deepEqual(facts.requirement, requirement);
        assert.deepEqual(facts.files, [...files].map(([name, content]) => ({ path: 'authors/design/' + name,
          bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') })));
        assert.deepEqual(facts.structure, { gameplayMappings: 1, experienceMappings: 1, mainSteps: 2, reopenSteps: 0 });
        for (const [name, content] of files) assert.equal((await read(config.workspace, 'authors/design/' + name)).toString(), content);
        if (outcome === 'altered') await writeFile(join(config.workspace, 'authors/design/design.json'), files.get('design.json') + ' ');
        if (outcome === 'source-drift') await writeFile(join(directory, 'acceptance-plan.json'), files.get('acceptance-plan.json') + ' ');
        return createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-supplied-handoff' } });
      }
      if (packet.role === 'reviewer' && packet.taskId === 'design-task') {
        if (outcome === 'handoff-gap') assert.deepEqual(packet.designConcernReview.proposal.uncertainty, ['Reported handoff identity concern']);
        const rules = packet.rules.join('\n');
        assert.match(rules, /Capture file layout:/);
        assert.match(rules, /omitted objective rules/);
        assert.match(rules, /create the save before reopening it/);
        assert.match(rules, /required first post-reopen input/);
        assert.match(rules, /text substituted for actual audio/);
        assert.match(rules, /outputActivations/);
        assert.doesNotMatch(rules, /validate-game-design|authors\/design\//);
        assert.deepEqual(packet.tools, ['read']);
        assert.deepEqual(config.tools!.map(tool => tool.name), ['read']);
        assert.deepEqual(packet.ownership.writePaths, []);
        const captured = packet.inputFiles.find((ref: any) => ref.artifactId === 'design');
        assert.deepEqual(captured.files.sort(), ['_cosmos/acceptance-plan.json', '_cosmos/design.json']);
        if (outcome === 'approved') await checkReadPlan(config, captured.location + '/_cosmos/acceptance-plan.json', files.get('acceptance-plan.json')!);
        for (const [name, content] of files) assert.equal((await read(config.workspace, captured.location + '/_cosmos/' + name)).toString(), content);
        for (const sourceId of ['requirement-draft', 'user-confirmation']) {
          assert.ok(packet.inputFiles.some((ref: any) => ref.artifactId === sourceId && ref.kind === 'file'));
        }
        assert.ok(packet.evidence.length && packet.evidence.every((item: any) => packet.inputFiles.some((ref: any) => ref.location === item.source.location && ref.kind !== 'missing')));
      }
      if (['art', 'coding'].includes(packet.role)) {
        const schema = config.tools.find(tool => tool.name === 'read')!.parameters as { properties: object };
        assert.equal(Object.hasOwn(schema.properties, 'planOffset'), packet.role === 'art');
        assert.match(packet.rules.join('\n'), /operator-supplied design/);
        const ref = packet.inputs.find((item: any) => item.artifactId === 'design');
        if (packet.role === 'art') {
          assert.ok(packet.rules.some((rule: string) => rule.includes(ref.location + '/_cosmos/design.json') && rule.includes('Write completed asset batches')));
          assert.equal(config.requestTimeoutMs, 600000);
          assert.deepEqual(await config.requestWindow!(), { deadlineAt: Date.parse(packet.budget.originalDeadlineAt), cleanupMs: 5000 });
          await checkReadPlan(config, ref.location + '/_cosmos/acceptance-plan.json', files.get('acceptance-plan.json')!);
          const media = 'authors/art/media.json', source = '{\n  "batches": []\n}\n';
          const tool = (name: string) => config.tools!.find(item => item.name === name)!;
          await tool('write').execute('draft', { path: media, content: source }, undefined, undefined, undefined as never);
          const raw = await tool('read').execute('draft-read', { path: media, offset: 2, limit: 1 }, undefined, undefined, undefined as never);
          assert.ok(raw.content[0].type === 'text' && raw.content[0].text.startsWith('  "batches": []'));
          for (const other of [media, ref.location + '/_cosmos/design.json']) {
            await assert.rejects(tool('read').execute('other', { path: other, planOffset: 2 }, undefined, undefined, undefined as never), /only on the fixed acceptance plan/);
          }
          await assert.rejects(tool('write').execute('protected', { path: ref.location + '/_cosmos/acceptance-plan.json', content: '{}' }, undefined, undefined, undefined as never), /outside allowed task paths/);
        }
        for (const [name, content] of files) assert.equal((await read(config.workspace, ref.location + '/_cosmos/' + name)).toString(), content);
        consumers.add(packet.role);
      }
      return fallback;
    } });
  const source = await confirmedSource(t, { draft: next.draft }), directory = join(source.root, 'supplied');
  await mkdir(directory);
  files.set('design.json', JSON.stringify({ summary: '固定稿', implementationNotes: ['点击目标'], acceptanceMapping: { light: '点击后显示完成' },
    experienceMapping: { readable: '状态清楚' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [] }, null, 2) + '\n');
  const requirement = { artifactId: 'requirement-bundle', version: 'v2', location: 'registry/captures/requirement-bundle/v2/files' };
  files.set('acceptance-plan.json', JSON.stringify({ formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: next.scenario }, null, 2) + '\n');
  for (const [name, content] of files) await writeFile(join(directory, name), content);
  const args = ['new', next.root, '--requirements-from', source.root, '--requirements-revision', '2', '--design-input', directory, '--max-cny', '5', '--max-minutes', '30'];
  const normal = { ...io(), host: next.host };
  const paused = { ...io(), host: { ...next.host, async prepare() { return { environmentReady: false, executionReady: false }; } } };
  if (outcome === 'seed-drift') next.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...next.hostOptions });
    const prepare = host.preAuthor!;
    host.preAuthor = async (...args) => {
      await prepare(...args);
      await writeFile(join(next.root, 'authors/design/design.json'), files.get('design.json') + ' ');
    };
    return host;
  } });
  if (outcome === 'approved') {
    await assert.rejects(runCli([...args, '--design-draft-from', directory], normal));
    await writeFile(join(directory, 'acceptance-plan.json'), files.get('acceptance-plan.json')!.replace('"v2"', '"v1"'));
    await assert.rejects(runCli(args, paused), /requirement/i);
    await writeFile(join(directory, 'acceptance-plan.json'), files.get('acceptance-plan.json')!);
    let interrupted = false;
    next.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
      const host = await createBrowserHost({ ...hostInput, ...next.hostOptions });
      const save = hostInput.controller.saveTask.bind(hostInput.controller);
      hostInput.controller.saveTask = async (...args) => {
        await save(...args);
        if (!interrupted && args[0].taskId === 'design-task' && args[0].artifacts.length) {
          interrupted = true;
          throw new RecoveryBlocked('Interrupted after supplied file capture');
        }
      };
      return host;
    } });
    const partial: any = await runCli(args, normal);
    assert.equal(interrupted, true, JSON.stringify(partial.gaps));
    assert.equal(next.packets.some(packet => ['reviewer', 'art', 'coding'].includes(packet.role)), false);
    await writeFile(join(directory, 'design.json'), files.get('design.json') + ' ');
    await assert.rejects(runCli(['resume', next.root], normal), /supplied design/i);
    await writeFile(join(directory, 'design.json'), files.get('design.json')!);
  }
  const report: any = await runCli(outcome === 'approved' ? ['resume', next.root] : args, normal);
  const state = await json(next.root, 'snapshot.json');
  assert.equal(state.designDraftReview.artifactId, 'ordinary-supplied-design');
  assert.deepEqual(report.ordinaryDesignReview?.suppliedDesign, state.designDraftReview);
  const reachedReview = ['approved', 'changes_requested', 'handoff-gap'].includes(outcome);
  assert.equal(authorRounds, outcome === 'seed-drift' ? 0 : 1, JSON.stringify(report.gaps));
  assert.equal(next.packets.filter(packet => packet.role === 'design').length, authorRounds);
  assert.equal(next.packets.filter(packet => packet.role === 'reviewer' && packet.taskId === 'design-task').length, reachedReview ? 1 : 0, JSON.stringify(report.gaps));
  if (authorRounds && outcome !== 'native-failure') {
    const entries = state.ledger.entries.filter((row: any) => row.taskId === 'design-task');
    assert.equal(entries.length, 1); assert.equal(entries[0].status, 'settled');
    const receipt = JSON.parse(await readFile(entries[0].evidence.at(-1).location, 'utf8'));
    const { inputBytes, maxOutputTokens, estimatedMaxCostMicroCny } = receipt.request;
    assert.equal(estimatedMaxCostMicroCny, inputBytes * 2 + maxOutputTokens * 8);
    t.diagnostic(JSON.stringify({ offlineNativeAuthor: outcome, requests: authorRounds, tools: 0, inputBytes, maxOutputTokens, estimatedMaxCostMicroCny }));
  }
  if (reachedReview) {
    const design = state.tasks.find((task: any) => task.taskId === 'design-task');
    const captured = await json(next.root, 'registry/captures/design/v1/capture.json');
    assert.deepEqual(captured.metadata.provenance, { kind: 'original-procedural', generator: 'Operator-supplied design, native design role handoff',
      sourceRefs: [design.attempts[0].sessionRef, ...design.inputs.filter((ref: any) => ['requirement-draft', 'user-confirmation'].includes(ref.artifactId)).map((ref: any) => ref.location),
        state.designDraftReview.artifactId + '@' + state.designDraftReview.version, directory] });
  }
  if (outcome !== 'approved') {
    if (outcome === 'changes_requested' || outcome === 'native-failure') {
      await assert.rejects(selectApprovedDesign(next.root, state.requirementsSource, { root: join(source.root, 'unused') }), /ordinary-design-selection/);
    }
    assert.deepEqual(state.tasks.map((task: any) => task.taskId), ['design-task']);
    assert.equal(consumers.size, 0);
    if (outcome === 'changes_requested') assert.match(report.gaps.join(' '), /supplied_design_requires_revision/);
    if (outcome === 'handoff-gap') assert.ok(JSON.stringify(state.tasks[0]).includes('Reported handoff identity concern'));
    if (outcome === 'seed-drift' || outcome === 'source-drift') {
      await assert.rejects(checkSuppliedDesignHandoff(next.root, state.designDraftReview, state.requirementsSource),
        outcome === 'seed-drift' ? /Staged design files differ/ : /Pinned supplied design/);
    }
    return;
  }
  assert.deepEqual([...consumers].sort(), ['art', 'coding'], JSON.stringify(report.gaps));
  const reuse = await ordinaryHostFixture(t, { productionDefault: true, sessionFactory: async (config, fallback) => {
    const role = JSON.parse(config.context!).role;
    if (role === 'art' || role === 'coding') {
      assert.equal(config.maxOutputTokens, 65536);
      assert.ok(config.requestOutputLimit);
      if (role === 'art') {
        assert.equal(config.thinkingLevel, 'off');
        const request = { requestId: 'historical-art-quote', modelId: 'deepseek-flash' as const, hasImages: false, inputBytes: 103857, maxOutputTokens: 65536 };
        assert.equal(await config.requestOutputLimit(request), 38723);
        const cost = { ...request, requestId: 'offline-prior-art-usage', inputBytes: 36762, maxOutputTokens: 8192, estimatedMaxCostMicroCny: 139060 };
        await config.budget.beforeRequest(cost);
        await config.budget.afterResponse({ requestId: cost.requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
          usage: { input: 36762, cacheRead: 0, cacheWrite: 0, output: 0 } });
        assert.equal(await config.requestOutputLimit(request), 29532);
        await assert.rejects(config.requestOutputLimit({ ...request, inputBytes: 260000 }), /floor/);
      }
    }
    return fallback;
  } });
  const historicalFixture = await fundingFixture(t), grant = await historicalFixture.authorization('historical', 2300000);
  const selected = await selectApprovedDesign(next.root, state.requirementsSource, { root: reuse.root });
  const historicalAuthorization = join(grant.sharedRoot, grant.authorization.location);
  const historicalPayload = { ...grant.payload, formatVersion: 'public-validation-authorization/2', runRoot: reuse.root, brief: next.draft.brief,
    requirementsSource: state.requirementsSource, sourceRefs: [...grant.payload.sourceRefs, selected.reference] };
  const historicalArgs = ['new', reuse.root, '--shared-root', grant.sharedRoot, '--authorization', historicalAuthorization];
  const historicalIO = { ...io(), host: reuse.host };
  const sharedBefore = await read(grant.sharedRoot, 'snapshot.json');
  await writeFile(historicalAuthorization, JSON.stringify({ ...historicalPayload, sourceRefs: [...grant.payload.sourceRefs, { ...selected.reference, version: '0'.repeat(64) }] }));
  await assert.rejects(runPublicValidationCli(historicalArgs, historicalIO), /Pinned historical design/);
  assert.deepEqual(await read(grant.sharedRoot, 'snapshot.json'), sharedBefore);
  await writeFile(historicalAuthorization, JSON.stringify(historicalPayload));
  reuse.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    await createBrowserHost({ ...hostInput, ...reuse.hostOptions });
    await unlink(join(reuse.root, selected.proof.design.location, '_cosmos/acceptance-plan.json'));
    throw new Error('Simulated interrupted historical capture import');
  } });
  await assert.rejects(runPublicValidationCli(historicalArgs, historicalIO), /Simulated interrupted/);
  assert.equal(reuse.packets.length, 0);
  const marked = await json(reuse.root, 'intake-origin.json');
  assert.equal(marked.approvedDesignAllocation, 'downstream-share/1');
  assert.equal((await json(reuse.root, 'snapshot.json')).approvedDesignAllocation, marked.approvedDesignAllocation);
  // A pre-policy run interrupted before its plan existed retains its original grants on cold and normal resume.
  for (const name of ['intake-origin.json', 'snapshot.json']) {
    const legacy = await json(reuse.root, name);
    delete legacy.approvedDesignAllocation;
    await writeFile(join(reuse.root, name), JSON.stringify(legacy));
    if (name === 'intake-origin.json') await assert.rejects(runPublicValidationCli(['resume', reuse.root], historicalIO), /allocation changed/);
  }
  const templatePath = join(reuse.root, 'registry/captures/generic-template/v1/files/package.json'), templateBytes = await readFile(templatePath);
  await writeFile(templatePath, Buffer.concat([templateBytes, Buffer.from(' ')]));
  reuse.host.execute = input => executeGeneration({ ...input, createHost: hostInput => createBrowserHost({ ...hostInput, ...reuse.hostOptions }) });
  await assert.rejects(runPublicValidationCli(['resume', reuse.root], historicalIO), /dependency bytes changed/);
  await writeFile(templatePath, templateBytes);
  const resumeHost = reuse.host.execute;
  reuse.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...reuse.hostOptions });
    host.bindPreparedTasks = async () => { throw new Error('Interrupted after legacy plan publication'); };
    return host;
  } });
  assert.equal((await runPublicValidationCli(['resume', reuse.root], historicalIO) as any).outcome, 'incomplete');
  assert.equal(reuse.packets.length, 0);
  reuse.host.execute = resumeHost;
  const reused: any = await runPublicValidationCli(['resume', reuse.root], historicalIO);
  assert.deepEqual(reuse.packets.map(packet => packet.role), ['art', 'reviewer', 'coding', 'reviewer'], JSON.stringify(reused.gaps));
  assert.equal(reused.outcome, 'awaiting_user_experience', JSON.stringify(reused.gaps));
  assert.equal(reused.historicalDesign.sourceRunId, state.run.runId);
  assert.equal(reused.historicalDesign.source.location, next.root);
  assert.equal(reused.ordinaryDesignReview, undefined);
  const imported = await json(reuse.root, 'snapshot.json');
  assert.deepEqual(imported.tasks.map((task: any) => task.taskId), ['art-task', 'coding-task']);
  assert.ok(imported.tasks.every((task: any) => task.runId === imported.run.runId && task.budget.ledgerId === imported.ledger.ledgerId));
  assert.deepEqual(imported.designDraftReview, reused.historicalDesign.source);
  assert.deepEqual(imported.ledger.entries.map((row: any) => [row.taskId, row.settledMicroCny]), [['art-task', 73524]]);
  assert.deepEqual(imported.ledger.allocations.map((row: any) => [row.taskId, row.amountMicroCny]), [
    ['intake', 0], ['planning', 230000], ['art-task', 517500], ['coding-task', 828000],
  ]);
  assert.deepEqual(await runCli(['resume', reuse.root], { ...io(), host: reuse.host }).then((v: any) => v.outcome), reused.outcome);
  await assert.rejects(selectApprovedDesign(next.root, { ...state.requirementsSource, revision: 1 }, { root: reuse.root }), /same original confirmation/);
  const localDesign = join(reuse.root, selected.proof.design.location, '_cosmos/design.json'), localBytes = await readFile(localDesign);
  await writeFile(localDesign, Buffer.concat([localBytes, Buffer.from(' ')]));
  await assert.rejects(runCli(['resume', reuse.root], { ...io(), host: reuse.host }), /Imported design capture changed/);
  await writeFile(localDesign, localBytes);
  const selectionFile = join(next.root, 'ordinary-design-selection.json'), saved = await readFile(selectionFile);
  await writeFile(selectionFile, JSON.stringify({ ...JSON.parse(saved.toString()), approvedAttemptId: 'changed' }));
  await assert.rejects(runCli(['resume', reuse.root], { ...io(), host: reuse.host }), /selection_changed/);
  await writeFile(selectionFile, saved);
  assert.deepEqual(await json(next.root, 'snapshot.json'), state);
  const fixture = await fundingFixture(t), f = await fixture.authorization('supplied');
  const auth = join(f.sharedRoot, f.authorization.location), command = ['new', f.runRoot, '--shared-root', f.sharedRoot, '--authorization', auth];
  const payload = { ...f.payload, formatVersion: 'public-validation-authorization/2', brief: next.draft.brief,
    requirementsSource: state.requirementsSource, sourceRefs: [...f.payload.sourceRefs, state.designDraftReview] };
  await writeFile(auth, JSON.stringify(payload));
  const before = await read(f.sharedRoot, 'snapshot.json');
  await writeFile(join(directory, 'design.json'), files.get('design.json') + ' ');
  await assert.rejects(runPublicValidationCli(command, paused), /supplied design/i);
  assert.deepEqual(await read(f.sharedRoot, 'snapshot.json'), before);
  await writeFile(join(directory, 'design.json'), files.get('design.json')!);
  await runPublicValidationCli(command, paused);
  const funded = await json(f.runRoot, 'snapshot.json');
  assert.deepEqual(funded.designDraftReview, state.designDraftReview);
  assert.equal(funded.validationFunding.fundingId, 'supplied');
});

for (const [selection, label] of [[0, 'an editable art draft'], [1, 'selected items from two art drafts'], [2, 'selected items from three art drafts'], [3, 'a locally fitted art draft']] as const) test('public funding resumes ' + label + ' and requires a complete independently reviewed output', async t => {
  const options: NonNullable<Parameters<typeof ordinaryHostFixture>[1]> = { productionDefault: true, configure(_draft, scenario) {
    scenario.steps.push({ id: 'target-pixels', kind: 'assert', acceptanceId: 'light', expected: true, timeoutMs: 1000,
      observation: { kind: 'pixel-pattern', x: 40, y: 50, width: 32, height: 32, color: '#FFD700', tolerance: 0, rows: ['+'] } });
  } };
  const previous = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, fallback) => {
    const role = JSON.parse(config.context!).role;
    if (role === 'design') return { ...fallback, prompt: async () => ({ text: JSON.stringify({ summary: 'Fixed supplied files', remaining: [], uncertainty: [] }) }) };
    if (role === 'art') throw new Error('Stop the original after design approval.');
    return fallback;
  } });
  const original = await confirmedSource(t, { draft: previous.draft });
  const supplied = join(original.root, 'supplied'); await mkdir(supplied);
  await writeFile(join(supplied, 'design.json'), JSON.stringify({ summary: 'Target', implementationNotes: ['Click it'], acceptanceMapping: { light: 'Click the target' },
    experienceMapping: { readable: 'Visible status' }, characters: [{ id: 'target', purpose: 'Target', states: ['idle'] }], audio: [{ id: 'click', trigger: 'Click target', loop: false }] }));
  await writeFile(join(supplied, 'acceptance-plan.json'), JSON.stringify({ formatVersion: 'ordinary-acceptance-plan/1', requirement: {
    artifactId: 'requirement-bundle', version: 'v2', location: 'registry/captures/requirement-bundle/v2/files' }, scenario: previous.scenario }));
  const common = ['--requirements-from', original.root, '--requirements-revision', '2', '--max-cny', '2.30', '--max-minutes', '30'];
  const first: any = await runCli(['new', previous.root, ...common, '--design-input', supplied], { ...io(), host: previous.host });
  assert.equal(first.ordinaryDesignReview?.selectedVersion, 'v1', JSON.stringify(first.gaps));
  const fullPlan = await json(previous.root, 'execution.json');
  assert.deepEqual(fullPlan.tasks.map((item: any) => [item.role, item.task.budget.allocationMicroCny]),
    [['design', 517500], ['art', 517500], ['coding', 828000]]);
  const fresh = await ordinaryHostFixture(t, options); // Its art author supplies only the required visual asset.
  const result: any = await runCli(['new', fresh.root, ...common, '--approved-design-from', previous.root], { ...io(), host: fresh.host });
  assert.deepEqual(fresh.packets.map(packet => packet.role), ['art'], JSON.stringify(result.gaps));
  assert.equal(result.historicalDesign.sourceRunId, first.runId);
  assert.equal(result.outcome, 'incomplete');
  assert.deepEqual((await json(fresh.root, 'snapshot.json')).ledger.allocations.map((row: any) => row.amountMicroCny),
    [0, 230000, 716538, 1146461]);
  const partial = await read(fresh.root, ART_DRAFT_FILE);
  let seed = partial, edited = Buffer.concat([seed, Buffer.from('\n')]);
  const funded = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    assert.equal(config.maxRequests, packet.role === 'art' ? 32 : 16);
    assert.equal(config.ordinaryCodingReviewImageQuote, packet.role === 'reviewer' && packet.taskId === 'coding-task' ? true : undefined);
    if (packet.role !== 'art') {
      assert.equal('artFrames' in config.tools!.find(item => item.name === 'read')!.parameters.properties, false);
      return fallback;
    }
    if (!selection) await replayArtRequests(config);
    assert.match(packet.rules.join('\n'), /operator-selected unreviewed draft/);
    if (selection === 2) assert.match(packet.rules.join('\n'), /overlays supplied these character IDs \["target"\] and audio IDs \["click"\]/);
    if (selection === 1) assert.match(packet.rules.join('\n'), /overlay supplied these character IDs \["target"\]/);
    if (selection === 3) assert.match(packet.rules.join('\n'), /unreviewed local geometry offsets for target/);
    if (selection >= 2) assert.match(packet.rules.join('\n'), /"audio":\{"existing":\["click"\],"missing":\[\]\}/);
    else assert.match(packet.rules.join('\n'), /"characters":\{"existing":\["target"\],"missing":\[\]\},"audio":\{"existing":\[\],"missing":\["click"\]\}/);
    const tool = (name: string) => config.tools!.find(item => item.name === name)!;
    const readResult = await tool('read').execute('seed', { path: ART_DRAFT_FILE }, undefined, undefined, undefined as never);
    assert.equal(JSON.parse(readResult.content[0].text).characters[0].id, 'target');
    const path = packet.inputs.find((ref: any) => ref.artifactId === 'design').location + '/_cosmos/acceptance-plan.json';
    const inspect = (args: Record<string, unknown>) => tool('read').execute('frames', args, undefined, undefined, undefined as never);
    await assert.rejects(inspect({ path: ART_DRAFT_FILE, artFrames: [] }), /fixed art plan/);
    const index = JSON.parse((await inspect({ path, artFrames: [] })).content[0].text);
    assert.equal(index.patterns[0].stepId, 'target-pixels');
    const checked = JSON.parse((await inspect({ path, artFrames: [{ stepId: index.patterns[0].stepId, characterId: 'target', state: 'idle' },
      { stepId: index.patterns[0].stepId, background: { characterId: 'target', state: 'idle' } }] })).content[0].text);
    assert.equal(checked.results[0].passed, true);
    assert.equal(typeof checked.results[1].matched, 'boolean');
    assert.deepEqual(await read(config.workspace, ART_DRAFT_FILE), edited);
    return { ...fallback, prompt: async () => {
      const full = JSON.parse(edited.toString('utf8'));
      if (selection < 2) full.audio.push({ id: 'click', sampleRate: 22050, duration: 0.1, loop: false,
        notes: [{ midi: 72, start: 0, duration: 0.1, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.01 }] });
      const save = (value: unknown) => tool('write').execute('save', { path: ART_DRAFT_FILE, content: JSON.stringify(value) }, undefined, undefined, undefined as never);
      const edit = (oldText: string, newText: string) => tool('edit').execute('change', { path: ART_DRAFT_FILE, edits: [{ oldText, newText }] }, undefined, undefined, undefined as never);
      await assert.rejects(save({ ...full, characters: [] }), /preserved.*target/s);
      assert.deepEqual(await read(config.workspace, ART_DRAFT_FILE), edited);
      await save(full);
      const complete = await read(config.workspace, ART_DRAFT_FILE);
      await assert.rejects(save({ ...full, audio: [] }), /preserved.*click/s);
      await assert.rejects(edit('"gain":0.2', '"gain":0'), /silent/i);
      await assert.rejects(edit('"absent":true', 'null'), /find|match/i);
      assert.deepEqual(await read(config.workspace, ART_DRAFT_FILE), complete);
      await edit('"gain":0.2', '"gain":0.3');
      assert.equal((await json(config.workspace, ART_DRAFT_FILE)).audio[0].notes[0].gain, 0.3);
      return { text: JSON.stringify({ summary: 'Finished visual and audio roster', remaining: [], uncertainty: [] }) };
    } };
  } });
  const sourceState = await json(fresh.root, 'snapshot.json'), target = { root: funded.root };
  const approved = await selectApprovedDesign(previous.root, sourceState.requirementsSource, target, sourceState.designDraftReview);
  await assert.rejects(selectArtDraft(fresh.root, approved, sourceState.requirementsSource, { root: fresh.root }), /separate canonical/);
  const sourceDraft = await selectArtDraft(fresh.root, approved, sourceState.requirementsSource, target);
  assert.deepEqual(sourceDraft.bytes, partial);
  const sourceOrigin = await read(fresh.root, 'intake-origin.json'), savedState = await read(fresh.root, 'snapshot.json');
  await writeFile(join(fresh.root, 'snapshot.json'), JSON.stringify({ ...sourceState, artDraftSource: sourceDraft.reference }));
  await writeFile(join(fresh.root, 'intake-origin.json'), JSON.stringify({ ...JSON.parse(sourceOrigin.toString()), artDraftSource: sourceDraft.reference }));
  await assert.rejects(selectArtDraft(fresh.root, approved, sourceState.requirementsSource, target), /Cyclic art draft/);
  await writeFile(join(fresh.root, 'snapshot.json'), savedState);
  await writeFile(join(fresh.root, 'intake-origin.json'), sourceOrigin);
  let selected = sourceDraft.reference, resumeDriftRoot = fresh.root;
  const manifestPath = join(selection === 3 ? await temporaryRun(t) : original.root, 'art-selection.json');
  if (selection) {
    const overlay = await ordinaryHostFixture(t, options);
    await runCli(['new', overlay.root, ...common, '--approved-design-from', previous.root, '--art-draft-from', fresh.root], { ...io(), host: overlay.host });
    const other = JSON.parse(partial.toString());
    other.characters[0].anchor.x += 1;
    if (selection === 3) other.characters[0].layers[0].x = 20.8;
    other.audio.push({ id: 'click', sampleRate: 22050, duration: 0.1, loop: false,
      notes: [{ midi: 70, start: 0, duration: 0.1, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.01 }] });
    await writeFile(join(overlay.root, ART_DRAFT_FILE), JSON.stringify({ formatVersion: 'batched-media/1', batches: [other] }));
    const overlayDraft = await selectArtDraft(overlay.root, approved, sourceState.requirementsSource, target);
    let composition: Awaited<ReturnType<typeof selectArtDraftSelection>>;
    const rejectCompleteSeed = async () => {
      const rejected = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, fallback) => {
        const packet = JSON.parse(config.context!);
        if (packet.role === 'art') return { ...fallback, prompt: async () => ({ text: JSON.stringify({ summary: 'Submitted the complete seed for review', remaining: [], uncertainty: [] }) }) };
        if (packet.role === 'reviewer') return { ...fallback, prompt: async () => ({ text: JSON.stringify({ verdict: 'changes_requested', findings: ['Artwork needs revision'],
          inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: { evidenceId: string }) => item.evidenceId) }) }) };
        return fallback;
      } });
      const denied: any = await runCli(['new', rejected.root, ...common, '--approved-design-from', previous.root, '--art-draft-selection', manifestPath], { ...io(), host: rejected.host });
      assert.deepEqual(rejected.packets.map(packet => packet.role), ['art', 'reviewer']);
      assert.equal(denied.outcome, 'incomplete');
    };
    if (selection === 2) {
      const third = await ordinaryHostFixture(t, options);
      await runCli(['new', third.root, ...common, '--approved-design-from', previous.root], { ...io(), host: third.host });
      const clip = { ...other.audio[0], notes: [{ ...other.audio[0].notes[0], midi: 76 }] };
      await writeFile(join(third.root, ART_DRAFT_FILE), JSON.stringify({ characters: [], audio: [clip] }));
      resumeDriftRoot = third.root;
      const audioDraft = await selectArtDraft(third.root, approved, sourceState.requirementsSource, target);
      const visuals = { source: overlayDraft.reference, characterIds: ['target'], audioIds: [] };
      const tracks = { source: audioDraft.reference, characterIds: [], audioIds: ['click'] };
      const chooseMultiple = async (overlays: object[], fields = {}) => {
        await writeFile(manifestPath, JSON.stringify({ formatVersion: 'ordinary-art-draft-selection/2', base: sourceDraft.reference, overlays, ...fields }));
        return selectArtDraftSelection(manifestPath, approved, sourceState.requirementsSource, target);
      };
      await assert.rejects(chooseMultiple([]), /Invalid art draft selection/);
      await assert.rejects(chooseMultiple(Array(5).fill(visuals)), /Invalid art draft selection/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, characterIds: ['target'] }]), /Duplicate/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, source: overlayDraft.reference }]), /separate base and overlay/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, source: { ...audioDraft.reference, location: join(overlay.root, 'nested') } }]), /separate base and overlay/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, source: { ...overlayDraft.reference, artifactId: 'ordinary-art-draft-selection' } }]), /working files/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, source: { ...audioDraft.reference, version: '0'.repeat(64) } }]), /Pinned art draft/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, audioIds: ['missing'] }]), /missing from its overlay/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, audioIds: [] }]), /Invalid art draft selection/);
      await assert.rejects(chooseMultiple([visuals, { ...tracks, path: 'unbound.json' }]), /Invalid art draft selection/);
      await assert.rejects(chooseMultiple([visuals, tracks], { overlay: overlayDraft.reference }), /Invalid art draft selection/);
      composition = await chooseMultiple([visuals, tracks]);
      assert.deepEqual(JSON.parse(composition.bytes.toString()), { characters: other.characters, audio: [clip] });
      assert.deepEqual(composition.origins, [...sourceDraft.origins, ...overlayDraft.origins, ...audioDraft.origins]);
      await rejectCompleteSeed();
      await assert.rejects(selectArtDraftSelection(manifestPath, approved, sourceState.requirementsSource, { ...target, ledgerId: audioDraft.proof.ledgerId }), /independent source run/);
      await assert.rejects(selectArtDraftSelection(manifestPath, approved, sourceState.requirementsSource, { root: third.root }), /separate canonical roots/);
    } else if (selection === 3) {
      const overlays = [{ source: overlayDraft.reference, characterIds: ['target'], audioIds: ['click'] }];
      const input = manifestPath + '.input', mapping = manifestPath + '.frame';
      await writeFile(input, JSON.stringify({ formatVersion: 'ordinary-art-draft-selection/2', base: sourceDraft.reference, overlays }));
      await writeFile(mapping, JSON.stringify({ stepId: 'target-pixels', state: 'idle', characterId: 'target' }));
      const report: any = await runCli(['fit-art', input, mapping, manifestPath], io());
      assert.equal(report.outcome, 'unreviewed-fit');
      assert.deepEqual(report.changes, [{ layerId: 'body', x: -1 }]);
      composition = await selectArtDraftSelection(manifestPath, approved, sourceState.requirementsSource, target);
      const revised = structuredClone(other);
      revised.characters[0].layers[0].x -= 1;
      assert.deepEqual(JSON.parse(composition.bytes.toString()), revised);
      assert.deepEqual(composition.fit?.changes, report.changes);
      await rejectCompleteSeed();
    } else {
      const manifest = { formatVersion: 'ordinary-art-draft-selection/1', base: sourceDraft.reference, overlay: overlayDraft.reference, characterIds: ['target'], audioIds: [] };
      const choose = async (fields: object) => {
        await writeFile(manifestPath, JSON.stringify({ ...manifest, ...fields }));
        return selectArtDraftSelection(manifestPath, approved, sourceState.requirementsSource, target);
      };
      await assert.rejects(choose({ overlay: sourceDraft.reference }), /separate base and overlay/);
      await assert.rejects(choose({ characterIds: ['target', 'target'] }), /Duplicate/);
      await assert.rejects(choose({ characterIds: ['bogus'] }), /missing from its overlay/);
      await assert.rejects(choose({ characters: other.characters }), /Invalid art draft selection/);
      await assert.rejects(choose({ overlay: { ...overlayDraft.reference, version: 'a'.repeat(64) } }), /Pinned art draft/);
      const added = await choose({ characterIds: [], audioIds: ['click'] });
      assert.deepEqual(JSON.parse(added.bytes.toString()), { characters: JSON.parse(partial.toString()).characters, audio: other.audio });
      await rejectCompleteSeed();
      composition = await choose({});
      assert.deepEqual(JSON.parse(composition.bytes.toString()), { characters: other.characters, audio: [] });
    }
    selected = composition.reference;
    seed = composition.bytes;
    edited = Buffer.concat([seed, Buffer.from('\n')]);
    await assert.rejects(runCli(['new', funded.root, ...common, '--art-draft-selection', manifestPath], { ...io(), host: funded.host }), /Usage/);
    await assert.rejects(runCli(['new', funded.root, ...common, '--approved-design-from', previous.root, '--art-draft-from', fresh.root, '--art-draft-selection', manifestPath], { ...io(), host: funded.host }), /Usage/);
  }
  const f = await (await fundingFixture(t)).authorization('editable-art', 1660000);
  const auth = join(f.sharedRoot, f.authorization.location), command = ['new', funded.root, '--shared-root', f.sharedRoot, '--authorization', auth];
  const payload = { ...f.payload, formatVersion: 'public-validation-authorization/2', brief: funded.draft.brief, runRoot: funded.root, renderFrames: false,
    requirementsSource: sourceState.requirementsSource, sourceRefs: [...f.payload.sourceRefs, approved.reference, selected] };
  await writeFile(auth, JSON.stringify(payload));
  const fundedIO = { ...io(), host: funded.host }, sharedBefore = await read(f.sharedRoot, 'snapshot.json');
  if (selection) {
    await writeFile(auth, JSON.stringify({ ...payload, sourceRefs: [...payload.sourceRefs, sourceDraft.reference] }));
    await assert.rejects(runPublicValidationCli(command, fundedIO), /exactly one art draft/);
    await writeFile(auth, JSON.stringify(payload));
    const manifest = await readFile(manifestPath);
    await writeFile(manifestPath, Buffer.concat([manifest, Buffer.from('\n')]));
    await assert.rejects(runPublicValidationCli(command, fundedIO), /Pinned art draft selection/);
    await writeFile(manifestPath, manifest);
  }
  await writeFile(join(fresh.root, ART_DRAFT_FILE), edited);
  await assert.rejects(runPublicValidationCli(command, fundedIO), /Pinned art draft/);
  assert.deepEqual(await read(f.sharedRoot, 'snapshot.json'), sharedBefore);
  await writeFile(join(fresh.root, ART_DRAFT_FILE), partial);
  const execute = funded.host.execute;
  funded.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...funded.hostOptions });
    host.bindPreparedTasks = async () => { throw new Error('Interrupted after execution plan publication'); };
    return host;
  } });
  const interrupted: any = await runPublicValidationCli(command, fundedIO);
  assert.equal(interrupted.outcome, 'incomplete');
  assert.deepEqual(funded.packets, []);
  assert.deepEqual(await read(funded.root, ART_DRAFT_FILE), seed);
  assert.deepEqual((await json(funded.root, 'snapshot.json')).artDraftSource, selected);
  // An existing edit must survive restarting the host. The old working file is still pinned.
  await writeFile(join(funded.root, ART_DRAFT_FILE), edited);
  const driftPath = join(resumeDriftRoot, ART_DRAFT_FILE), pinnedBytes = await readFile(driftPath);
  await writeFile(driftPath, Buffer.concat([pinnedBytes, Buffer.from('\n')]));
  await assert.rejects(runPublicValidationCli(['resume', funded.root], fundedIO), /Pinned art draft/);
  await writeFile(driftPath, pinnedBytes);
  funded.host.execute = execute;
  const final: any = await runPublicValidationCli(['resume', funded.root], fundedIO);
  assert.deepEqual(funded.packets.map(packet => packet.role), ['art', 'reviewer', 'coding', 'reviewer'], JSON.stringify(final.gaps));
  const finalLedger = (await json(funded.root, 'snapshot.json')).ledger;
  if (!selection) assert.deepEqual(finalLedger.entries.map((entry: any) => entry.settledMicroCny), [8652, 22071, 6118, 4207, 52984, 11051, 4159, 29181, 4319]);
  assert.ok(finalLedger.entries.every((entry: any) => entry.status === 'settled' && !entry.reservedMicroCny && !entry.unknown));
  assert.deepEqual(finalLedger.allocations.map((row: any) => row.amountMicroCny), [0, 166000, 517153, 827446]);
  assert.equal(finalLedger.limitMicroCny - finalLedger.allocations.reduce((sum: number, row: any) => sum + row.amountMicroCny, 0), 149401);
  const capture = await json(funded.root, 'registry/captures/media/v1/capture.json');
  assert.ok(capture.metadata.provenance.sourceRefs.includes(selected.artifactId + '@' + selected.version));
  assert.match(capture.metadata.provenance.generator, /operator-selected unreviewed draft/);
  if (selection === 3) assert.match(capture.metadata.provenance.generator, /local geometry offsets/);
  assert.equal(capture.metadata.media.audio[0].manifest.id, 'click');
  assert.equal(final.outcome, 'awaiting_user_experience', JSON.stringify(final.gaps));
  assert.deepEqual(await read(fresh.root, ART_DRAFT_FILE), partial);
});

test('public approved design resumes interrupted classic and render-frame input setup', async t => {
  const options = { productionDefault: true, persistent: true, configure(draft: { benchmark?: string }) { draft.benchmark = 'classic-pc-runtime-policy/1'; } };
  const previous = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, fallback) => {
    const role = JSON.parse(config.context!).role;
    if (role === 'design') return { ...fallback, prompt: async () => ({ text: JSON.stringify({ summary: 'Fixed supplied files', remaining: [], uncertainty: [] }) }) };
    if (role === 'art') throw new Error('Stop the original after design approval.');
    return fallback;
  } });
  const original = await confirmedSource(t, { draft: previous.draft, frames: true });
  const supplied = join(original.root, 'supplied'); await mkdir(supplied);
  await writeFile(join(supplied, 'design.json'), JSON.stringify({ summary: 'Target', implementationNotes: ['Click it'], acceptanceMapping: { light: 'Click the target' },
    experienceMapping: { readable: 'Visible status' }, characters: [{ id: 'target', purpose: 'Target', states: ['idle'] }], audio: [] }));
  await writeFile(join(supplied, 'acceptance-plan.json'), JSON.stringify({ formatVersion: 'ordinary-acceptance-plan/1', requirement: {
    artifactId: 'requirement-bundle', version: 'v2', location: 'registry/captures/requirement-bundle/v2/files' }, scenario: previous.scenario }));
  const common = ['--requirements-from', original.root, '--requirements-revision', '2', '--max-cny', '2.30', '--max-minutes', '30'];
  const first: any = await runCli(['new', previous.root, ...common, '--design-input', supplied], { ...io(), host: previous.host });
  assert.equal(first.ordinaryDesignReview?.selectedVersion, 'v1', JSON.stringify(first.gaps));
  const artRequests: any[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    artRequests.push(await new Request(input, init).json());
    const chunk = { id: 'offline-art', model: 'deepseek-flash', choices: [{ index: 0, delta: { content:
      JSON.stringify({ summary: 'All media complete', remaining: [], uncertainty: [] }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const fresh = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, fallback) => {
    if (JSON.parse(config.context!).role === 'art') return createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-art' } });
    return fallback;
  } });
  const nativeExecute = fresh.host.execute;
  fresh.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    await createBrowserHost({ ...hostInput, ...fresh.hostOptions });
    throw new Error('Interrupted after optional captures.');
  } });
  const runIO = { ...io(), host: fresh.host };
  await assert.rejects(runCli(['new', fresh.root, ...common, '--approved-design-from', previous.root], runIO), /Interrupted after optional captures/);
  fresh.host.execute = nativeExecute;
  const observer = join(fresh.root, 'registry/captures/render-frame-observer/v1');
  await rename(observer, join(fresh.root, 'interrupted-observer-fixture'));
  const classicPath = join(fresh.root, 'host-classic-policy/reference/reference.json'), classic = await readFile(classicPath);
  await writeFile(classicPath, Buffer.concat([classic, Buffer.from(' ')]));
  await assert.rejects(runCli(['resume', fresh.root], runIO), /Fixed historical import record changed/);
  await writeFile(classicPath, classic);
  const result: any = await runCli(['resume', fresh.root], runIO);
  assert.equal(artRequests.length, 1);
  assert.deepEqual(artRequests[0].thinking, { type: 'disabled' });
  assert.equal(Object.hasOwn(artRequests[0], 'reasoning_effort'), false);
  assert.deepEqual(artRequests[0].tools.map((tool: any) => tool.function.name).sort(), ['edit', 'read', 'write']);
  assert.ok(artRequests[0].tools.find((tool: any) => tool.function.name === 'read').function.parameters.properties.artFrames);
  assert.match(JSON.stringify(artRequests[0].messages), /artFrames/);
  assert.equal(result.outcome, 'incomplete');
  const art = (await json(fresh.root, 'snapshot.json')).tasks.find((task: any) => task.taskId === 'art-task');
  assert.equal(art.budget.allocationMicroCny, 716538);
  assert.deepEqual(art.artifacts, []);
  const failure = await json(art.attempts[0].sessionRef, 'failure.json');
  assert.equal(failure.issues[0].checkId, 'role-output-missing_output');
  assert.deepEqual(fresh.packets.map(packet => packet.role), ['art'], JSON.stringify(result.gaps));
  assert.equal(result.historicalDesign.sourceRunId, first.runId);
});
