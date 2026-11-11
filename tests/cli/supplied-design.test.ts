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
import { confirmedSource, silentOutput } from '../runtime/confirmed-requirements.fixture.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { selectApprovedDesign } from '../../src/runtime/approved-design-source.ts';
import { checkSuppliedDesignHandoff } from '../../src/runtime/supplied-design.ts';
import { ART_DRAFT_FILE, selectArtDraft } from '../../src/runtime/art-draft-source.ts';
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
  const templatePath = join(reuse.root, 'registry/captures/generic-template/v1/files/package.json'), templateBytes = await readFile(templatePath);
  await writeFile(templatePath, Buffer.concat([templateBytes, Buffer.from(' ')]));
  reuse.host.execute = input => executeGeneration({ ...input, createHost: hostInput => createBrowserHost({ ...hostInput, ...reuse.hostOptions }) });
  await assert.rejects(runPublicValidationCli(['resume', reuse.root], historicalIO), /dependency bytes changed/);
  await writeFile(templatePath, templateBytes);
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

test('public funding resumes an editable art draft and requires a complete independently reviewed output', async t => {
  const options = { productionDefault: true };
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
  const fresh = await ordinaryHostFixture(t, options); // Its art author supplies only the required visual asset.
  const result: any = await runCli(['new', fresh.root, ...common, '--approved-design-from', previous.root], { ...io(), host: fresh.host });
  assert.deepEqual(fresh.packets.map(packet => packet.role), ['art'], JSON.stringify(result.gaps));
  assert.equal(result.historicalDesign.sourceRunId, first.runId);
  assert.equal(result.outcome, 'incomplete');
  const partial = await read(fresh.root, ART_DRAFT_FILE), edited = Buffer.concat([partial, Buffer.from('\n')]);
  const funded = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role !== 'art') return fallback;
    assert.match(packet.rules.join('\n'), /operator-selected unreviewed draft/);
    assert.match(packet.rules.join('\n'), /"characters":\{"existing":\["target"\],"missing":\[\]\},"audio":\{"existing":\[\],"missing":\["click"\]\}/);
    const tool = (name: string) => config.tools!.find(item => item.name === name)!;
    const readResult = await tool('read').execute('seed', { path: ART_DRAFT_FILE }, undefined, undefined, undefined as never);
    assert.equal(JSON.parse(readResult.content[0].text).characters[0].id, 'target');
    assert.deepEqual(await read(config.workspace, ART_DRAFT_FILE), edited);
    return { ...fallback, prompt: async () => {
      const full = JSON.parse(edited.toString('utf8'));
      full.audio.push({ id: 'click', sampleRate: 22050, duration: 0.1, loop: false,
        notes: [{ midi: 72, start: 0, duration: 0.1, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.01 }] });
      await tool('write').execute('complete', { path: ART_DRAFT_FILE, content: JSON.stringify(full) }, undefined, undefined, undefined as never);
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
  const f = await (await fundingFixture(t)).authorization('editable-art', 2300000);
  const auth = join(f.sharedRoot, f.authorization.location), command = ['new', funded.root, '--shared-root', f.sharedRoot, '--authorization', auth];
  const payload = { ...f.payload, formatVersion: 'public-validation-authorization/2', brief: funded.draft.brief, runRoot: funded.root, renderFrames: false,
    requirementsSource: sourceState.requirementsSource, sourceRefs: [...f.payload.sourceRefs, approved.reference, sourceDraft.reference] };
  await writeFile(auth, JSON.stringify(payload));
  const fundedIO = { ...io(), host: funded.host }, sharedBefore = await read(f.sharedRoot, 'snapshot.json');
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
  assert.deepEqual(await read(funded.root, ART_DRAFT_FILE), partial);
  assert.deepEqual((await json(funded.root, 'snapshot.json')).artDraftSource, sourceDraft.reference);
  // An existing edit must survive restarting the host. The old working file is still pinned.
  await writeFile(join(funded.root, ART_DRAFT_FILE), edited);
  await writeFile(join(fresh.root, ART_DRAFT_FILE), edited);
  await assert.rejects(runPublicValidationCli(['resume', funded.root], fundedIO), /Pinned art draft/);
  await writeFile(join(fresh.root, ART_DRAFT_FILE), partial);
  funded.host.execute = execute;
  const final: any = await runPublicValidationCli(['resume', funded.root], fundedIO);
  assert.deepEqual(funded.packets.map(packet => packet.role), ['art', 'reviewer', 'coding', 'reviewer'], JSON.stringify(final.gaps));
  const capture = await json(funded.root, 'registry/captures/media/v1/capture.json');
  assert.ok(capture.metadata.provenance.sourceRefs.includes('ordinary-art-draft@' + sourceDraft.reference.version));
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
  const fresh = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, fallback) => {
    if (JSON.parse(config.context!).role === 'art') throw new Error('End test after fresh art dispatch.');
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
  assert.deepEqual(fresh.packets.map(packet => packet.role), ['art'], JSON.stringify(result.gaps));
  assert.equal(result.historicalDesign.sourceRunId, first.runId);
});
