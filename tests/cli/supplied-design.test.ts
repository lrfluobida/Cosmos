import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { runPublicValidationCli } from '../../probes/public-cli/validation.ts';
import { confirmedSource, silentOutput } from '../runtime/confirmed-requirements.fixture.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';

const io = () => ({ input: Readable.from([]), output: silentOutput() });
const read = (root: string, file: string) => readFile(join(root, file));
const json = async (root: string, file: string) => JSON.parse((await read(root, file)).toString('utf8'));
for (const outcome of ['approved', 'changes_requested', 'altered']) test(`public supplied design: ${outcome}`, async t => {
  const files = new Map<string, string>(), consumers = new Set<string>();
  const next = await ordinaryHostFixture(t, { productionDefault: true, fault: outcome === 'changes_requested' ? 'review' : undefined,
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      if (packet.role === 'design') return { ...fallback, prompt: async () => {
        assert.match(config.systemPrompt, /Use validate-game-design/);
        assert.match(config.systemPrompt, /Hand off the existing files unchanged/);
        assert.deepEqual(config.tools!.map(tool => tool.name).sort(), ['read', 'validate-game-design']);
        for (const [name, content] of files) assert.equal((await read(config.workspace, 'authors/design/' + name)).toString(), content);
        if (outcome === 'altered') await writeFile(join(config.workspace, 'authors/design/design.json'), files.get('design.json') + ' ');
        return { text: JSON.stringify({ summary: 'Checked the supplied files', remaining: [], uncertainty: [] }) };
      } };
      if (packet.role === 'reviewer' && packet.taskId === 'design-task') {
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
        for (const [name, content] of files) assert.equal((await read(config.workspace, captured.location + '/_cosmos/' + name)).toString(), content);
        for (const sourceId of ['requirement-draft', 'user-confirmation']) {
          assert.ok(packet.inputFiles.some((ref: any) => ref.artifactId === sourceId && ref.kind === 'file'));
        }
        assert.ok(packet.evidence.length && packet.evidence.every((item: any) => packet.inputFiles.some((ref: any) => ref.location === item.source.location && ref.kind !== 'missing')));
      }
      if (['art', 'coding'].includes(packet.role)) {
        assert.match(packet.rules.join('\n'), /operator-supplied design/);
        const ref = packet.inputs.find((item: any) => item.artifactId === 'design');
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
  assert.equal(next.packets.filter(packet => packet.role === 'design').length, 1);
  assert.equal(next.packets.filter(packet => packet.role === 'reviewer' && packet.taskId === 'design-task').length, outcome === 'altered' ? 0 : 1, JSON.stringify(report.gaps));
  if (outcome !== 'altered') {
    const design = state.tasks.find((task: any) => task.taskId === 'design-task');
    const captured = await json(next.root, 'registry/captures/design/v1/capture.json');
    assert.deepEqual(captured.metadata.provenance, { kind: 'original-procedural', generator: 'Operator-supplied design, native design role handoff',
      sourceRefs: [design.attempts[0].sessionRef, ...design.inputs.filter((ref: any) => ['requirement-draft', 'user-confirmation'].includes(ref.artifactId)).map((ref: any) => ref.location),
        state.designDraftReview.artifactId + '@' + state.designDraftReview.version, directory] });
  }
  if (outcome !== 'approved') {
    assert.deepEqual(state.tasks.map((task: any) => task.taskId), ['design-task']);
    assert.equal(consumers.size, 0);
    if (outcome === 'changes_requested') assert.match(report.gaps.join(' '), /supplied_design_requires_revision/);
    return;
  }
  assert.deepEqual([...consumers].sort(), ['art', 'coding'], JSON.stringify(report.gaps));
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
