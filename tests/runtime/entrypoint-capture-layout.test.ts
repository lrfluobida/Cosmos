import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTransferRuntimeHost } from '../../probes/transfer/runtime-host.ts';
import { createWorkspaceTools } from '../../src/providers/workspace-tools.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import { validationJournalBinding } from '../../src/runtime/validation-scope.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { ArtifactReference } from '../../src/contracts/index.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { validationBrowserFixture } from './entrypoint-host-validation.fixture.ts';
import { transferFixture, syntheticMap, ids } from '../transfer/runtime-host.fixture.ts';

const design = (acceptanceIds: string[]) => ({ summary: '捕获读取合成数据', implementationNotes: ['保留固定范围'],
  acceptanceMapping: Object.fromEntries(acceptanceIds.map(id => [id, '合成接口'])), characters: [{ id: 'marker', purpose: '接口数据', states: ['idle'] }], audio: [] });
const media = { characters: [{ id: 'marker', width: 32, height: 32, anchor: { x: 16, y: 16 },
  layers: [{ id: 'body', shape: 'rect', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }],
  states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] };

type FileLayout = { artifactId: string; paths: string[] };
function layouts(rules: string[]): FileLayout[] {
  return rules.filter(rule => rule.startsWith('Capture file layout: ')).flatMap(rule => JSON.parse(rule.slice('Capture file layout: '.length).split('. Select ')[0]));
}
async function read(config: PiSessionOptions, path: string) {
  const tool = config.tools.find(tool => tool.name === 'read'); assert.ok(tool);
  const value = await (tool.execute as any)('capture-layout-read', { path, limit: 8 }, undefined, undefined, undefined);
  assert.notEqual(value.isError, true); assert.ok(value.content.some((item: any) => item.type === 'text' && item.text.length));
  return value.content.filter((item: any) => item.type === 'text').map((item: any) => item.text).join('\n');
}
async function checkReads(config: PiSessionOptions, expected: { ref: ArtifactReference; paths: string[]; author?: string }[]) {
  const packet = JSON.parse(config.context), before = await readFile(join(config.workspace, expected[0].ref.location, expected[0].paths[0]));
  // Prove the existing tools and immutable bytes are already correct before checking the missing contract.
  for (const { ref, paths, author } of expected) {
    assert.ok(packet.inputs.some((input: ArtifactReference) => input.artifactId === ref.artifactId && input.version === ref.version && input.location === ref.location));
    for (const path of paths) await read(config, ref.location + '/' + path);
    if (author) await assert.rejects(read(config, ref.location + '/' + author), /ENOENT/);
    const write = config.tools.find(tool => tool.name === 'write');
    if (write) await assert.rejects((write.execute as any)('capture-write-rejected', { path: ref.location + '/' + paths[0], content: '{}' }, undefined, undefined, undefined), /outside allowed/);
  }
  const declared = layouts(packet.rules);
  for (const { ref, paths } of expected) {
    const row = declared.find(item => item.artifactId === ref.artifactId);
    assert.ok(row, `Missing source-owned capture layout for ${ref.artifactId}`); assert.deepEqual(row.paths, paths);
    const selected = packet.inputs.find((input: ArtifactReference) => input.artifactId === row.artifactId && input.version === ref.version)!;
    for (const path of row.paths) await read(config, selected.location + '/' + path);
  }
  assert.deepEqual(await readFile(join(config.workspace, expected[0].ref.location, expected[0].paths[0])), before);
}

/** Actual host/factory roles and captures, with no prompt, provider call or real browser. */
async function fixture(t: test.TestContext, transfer: boolean) {
  const f = transfer ? await transferFixture(t) : await validationBrowserFixture(t), configs: PiSessionOptions[] = [];
  const sessionFactory = async (config: PiSessionOptions) => {
    configs.push(config); return { close: async () => {}, prompt: async () => { throw new Error('No model prompt in capture-layout regression'); } };
  };
  const host = transfer ? await createTransferRuntimeHost({ ...f.input, sessionFactory }) : await (f as Awaited<ReturnType<typeof validationBrowserFixture>>).create({ sessionFactory });
  if (transfer) t.after(() => host.closePreparation());
  const tasks = f.prepare(host); host.validateTasks!(tasks); await f.controller.registerTasks(tasks.map(item => item.task));
  const original = await f.controller.read(), recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal') };
  async function start(item: PreparedTask) {
    const task = structuredClone(item.task), current = await f.controller.read();
    task.dependsOn = task.dependsOn.map(dep => ({ ...dep, state: current.tasks.find(task => task.taskId === dep.taskId)!.state }));
    task.state = 'ready'; await f.controller.saveTask(task, { role: 'system', actorId: 'offline-runtime' });
    await host.preAuthor!(task, f.controller.signal);
    task.state = 'running'; task.attempts.push({ attemptId: `layout-${item.role}`, sessionRef: join(f.root, `sessions/layout-${item.role}`),
      startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null });
    await f.controller.saveTask(task, { role: 'system', actorId: 'offline-runtime' });
    const journal = await TaskJournal.open(recovery, { formatVersion: 3, validationCase: validationJournalBinding(f.window),
      runId: original.run.runId, ledgerId: original.ledger.ledgerId, originalStartedAt: original.run.originalStartedAt,
      originalDeadlineAt: original.run.originalDeadlineAt, limitMicroCny: original.ledger.limitMicroCny, requirement: f.requirement,
      prepared: item, reviewProtocolCorrections: 1, artifactRoot: f.root, sessionRoot: join(f.root, 'sessions') }, false);
    const author = await host.roleFactory({ role: item.role, task, controller: f.controller, requirement: f.requirement,
      workspace: item.workspace, stateDirectory: join(f.root, `sessions/layout-${item.role}/author`) }); await author.close();
    return { task, journal, config: configs.at(-1)! };
  }
  async function capture(item: PreparedTask, running: Awaited<ReturnType<typeof start>>) {
    const { task, journal } = running, captured = await host.capture(task, { summary: 'Synthetic capture only', remaining: [], uncertainty: [] }, f.controller.signal);
    await journal.write('capture', task.attempts[0].attemptId, { captured, signature: await journal.signature(captured.artifacts) });
    task.artifacts = captured.artifacts; await f.controller.saveTask(task, { role: 'system', actorId: 'offline-runtime' });
    task.evidence = await host.verify(task, f.controller.signal); assert.ok(task.evidence.some(e => e.outcome === 'passed'));
    task.state = 'awaiting_review'; await f.controller.saveTask(task, { role: 'system', actorId: 'offline-runtime' });
    const reviewer = await host.roleFactory({ role: 'reviewer', task, controller: f.controller, requirement: f.requirement,
      workspace: captured.reviewWorkspace, stateDirectory: join(f.root, `sessions/layout-${item.role}/review`) });
    const config = configs.at(-1)!; assert.notEqual(reviewer.contextId, task.context.contextId); assert.notEqual(reviewer.actorId, task.authorId);
    assert.deepEqual(config.tools.map(tool => tool.name), ['read']); assert.deepEqual(JSON.parse(config.context).ownership.writePaths, []);
    await reviewer.close();
    async function approve() {
      task.attempts[0].outcome = 'passed'; task.attempts[0].endedAt = new Date().toISOString();
      await f.controller.saveTask(task, { role: 'system', actorId: 'offline-runtime' });
      task.review = { reviewerId: reviewer.actorId, contextId: reviewer.contextId, verdict: 'approved', inputVersions: [...task.inputs, ...task.artifacts], evidenceIds: task.evidence.map(e => e.evidenceId) };
      task.state = 'passed';
      await f.controller.saveTask(task, { role: 'reviewer', actorId: reviewer.actorId });
    }
    return { task, config, approve };
  }
  const designRun = await start(tasks[0]);
  await writeFile(join(tasks[0].workspace, 'authors/design/design.json'), JSON.stringify(design(transfer ? ids : ['observe'])), 'utf8');
  if (transfer) {
    const requirement = host.availableArtifacts.find((ref: ArtifactReference) => ref.artifactId.endsWith('requirement-bundle'))!;
    await writeFile(join(tasks[0].workspace, 'authors/design/transfer-design.json'), JSON.stringify(syntheticMap(requirement)), 'utf8');
    const validator = designRun.config.tools.find(tool => tool.name === 'validate-transfer-design')!;
    assert.equal(JSON.parse((await (validator.execute as any)('seal-layout-map', {}, undefined, undefined, undefined)).content[0].text).passed, true);
  }
  const capturedDesign = await capture(tasks[0], designRun);
  return { ...f, host, tasks, configs, original, capturedDesign, start, capture };
}

test('COS50 generic captures give actual reviewers and downstream roles scoped design media and game read paths', async t => {
  const f = await fixture(t, false), [designRef] = f.capturedDesign.task.artifacts;
  const designLayout = { ref: designRef, paths: ['_cosmos/design.json'], author: 'authors/design/design.json' };
  const beforeReview = await f.controller.read(); await checkReads(f.capturedDesign.config, [designLayout]);
  await assert.rejects(read(f.capturedDesign.config, 'authors/design/design.json'), /outside allowed/);
  assert.deepEqual(await f.controller.read(), beforeReview); await f.capturedDesign.approve();
  const art = await f.start(f.tasks[1]), beforeArt = await f.controller.read(); await checkReads(art.config, [designLayout]);
  assert.deepEqual(await f.controller.read(), beforeArt);
  await writeFile(join(f.tasks[1].workspace, 'authors/art/media.json'), JSON.stringify(media), 'utf8');
  const capturedArt = await f.capture(f.tasks[1], art), [mediaRef] = capturedArt.task.artifacts;
  const mediaLayout = { ref: mediaRef, paths: ['_cosmos/mediaSpec.json', 'public/assets/manifest.json'], author: 'authors/art/media.json' };
  const beforeMediaReview = await f.controller.read(); await checkReads(capturedArt.config, [designLayout, mediaLayout]);
  assert.deepEqual(await f.controller.read(), beforeMediaReview); await capturedArt.approve();
  const coding = await f.start(f.tasks[2]), beforeCoding = await f.controller.read(); await checkReads(coding.config, [designLayout, mediaLayout]);
  assert.deepEqual(await f.controller.read(), beforeCoding);
  await writeFile(join(f.tasks[2].workspace, 'authors/coding/src/main.ts'), '// 合成接口，没有目标游戏\n', 'utf8');
  await writeFile(join(f.tasks[2].workspace, 'authors/coding/index.html'), '<p>合成接口</p>', 'utf8');
  const game = await f.capture(f.tasks[2], coding), [gameRef] = game.task.artifacts, beforeGameReview = await f.controller.read();
  await checkReads(game.config, [designLayout, mediaLayout, { ref: gameRef, paths: ['index.html', 'src/main.ts'], author: 'authors/coding/src/main.ts' }]);
  await assert.rejects(read(game.config, 'registry/captures/unselected/v1/files/_cosmos/design.json'), /outside allowed/);
  assert.deepEqual(await f.controller.read(), beforeGameReview);
  assert.deepEqual(beforeGameReview.ledger, f.original.ledger); assert.deepEqual(beforeGameReview.requests, f.original.requests);
  assert.deepEqual(beforeGameReview.validation, f.original.validation); assert.equal(f.calls.some(call => ['design', 'art', 'coding', 'reviewer'].includes(call.kind)), false);
});

test('COS50 transfer reviewers and downstream packets read all four exact design references and both distinct plan roots', async t => {
  const f = await fixture(t, true), refs = f.capturedDesign.task.artifacts;
  assert.equal(refs.length, 4);
  const expected = refs.map(ref => ({ ref, paths: ref.artifactId.endsWith('transfer-design') ? ['_cosmos/transfer-design.json', '_cosmos/transfer-binding.json']
    : ref.artifactId.includes('plan-') ? ['_cosmos/transfer-plan.json'] : ['_cosmos/design.json'], author: 'authors/design/' + (ref.artifactId.endsWith('transfer-design') ? 'transfer-design.json' : 'design.json') }));
  assert.notEqual(refs[2].location, refs[3].location);
  const beforeReview = await f.controller.read(); await checkReads(f.capturedDesign.config, expected);
  await assert.rejects(read(f.capturedDesign.config, 'authors/design/transfer-design.json'), /outside allowed/);
  assert.deepEqual(await f.controller.read(), beforeReview); await f.capturedDesign.approve();
  const art = await f.start(f.tasks[1]), beforeArt = await f.controller.read(); await checkReads(art.config, expected);
  assert.deepEqual(await f.controller.read(), beforeArt);
  await writeFile(join(f.tasks[1].workspace, 'authors/art/media.json'), JSON.stringify(media), 'utf8');
  const capturedArt = await f.capture(f.tasks[1], art); await capturedArt.approve();
  const coding = await f.start(f.tasks[2]), beforeCoding = await f.controller.read(); await checkReads(coding.config, expected);
  assert.deepEqual(await f.controller.read(), beforeCoding);
  assert.deepEqual(beforeCoding.ledger, f.original.ledger); assert.deepEqual(beforeCoding.requests, f.original.requests); assert.deepEqual(beforeCoding.validation, f.original.validation);
  assert.equal(f.calls.length, 0);
});

test('COS50 retained layout rules read a newly selected capture version and refuse the old unselected root', async t => {
  const f = await fixture(t, false), registry = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: 'registry' });
  const first = f.capturedDesign.task.artifacts[0], next = registry.artifactRef(first.artifactId, 'selected-v2');
  const folder = 'changed-version-source'; await mkdir(join(f.root, folder));
  await writeFile(join(f.root, folder, 'design.json'), JSON.stringify({ ...design(['observe']), summary: '当前版本 v2' }), 'utf8');
  await registry.registerCapture({ taskId: 'offline-new-version', artifactRef: next, sourceRoot: folder, files: [{ source: 'design.json', destination: '_cosmos/design.json' }],
    dependencies: [], ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, metadata: { kind: 'data', provenance: { kind: 'original-procedural', generator: 'OFFLINE changed-version fixture', sourceRefs: ['OFFLINE synthetic'] } } });
  const config: PiSessionOptions = { ...f.capturedDesign.config, workspace: f.root,
    tools: await createWorkspaceTools({ workspace: f.root, readPaths: [next.location], writePaths: [] }),
    context: JSON.stringify({ ...JSON.parse(f.capturedDesign.config.context), inputs: [next], ownership: { readPaths: [next.location], writePaths: [] } }) };
  const before = await f.controller.read(); await checkReads(config, [{ ref: next, paths: ['_cosmos/design.json'], author: 'authors/design/design.json' }]);
  assert.match(await read(config, next.location + '/_cosmos/design.json'), /当前版本 v2/);
  await assert.rejects(read(config, first.location + '/_cosmos/design.json'), /outside allowed/);
  assert.deepEqual(await f.controller.read(), before); assert.equal(f.calls.length, 0);
});
