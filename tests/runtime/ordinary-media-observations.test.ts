import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { validateOrdinaryAcceptancePlan } from '../../src/runtime/entrypoint-acceptance-plan.ts';
import { readConfirmedGeneration } from '../../src/cli/session.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';

const read = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
const rules = (packet: any) => packet.rules ?? packet.context?.rules;

test('ordinary media debug supplements visible acceptance without expanding the schema', async t => {
  const f = await ordinaryHostFixture(t), ref = { artifactId: 'requirement', version: 'v1', location: 'requirements/v1/draft.json' };
  const scenario = structuredClone(f.scenario);
  for (const [field, expected] of [['id', 'bgm-soft'], ['playing', true], ['looping', true], ['outputActive', true], ['outputActivations', 1]] as const) {
    scenario.steps.push({ id: `media-${field}`, kind: 'assert', acceptanceId: 'light', observation: { kind: 'debug', path: ['media', 'audioById', 'clip_bgm_soft', field] }, expected, timeoutMs: 1000 });
  }
  const plan = { formatVersion: 'ordinary-acceptance-plan/1', requirement: ref, scenario };
  assert.doesNotThrow(() => validateOrdinaryAcceptancePlan(plan, f.draft));
  for (const mutate of [
    (p: any) => { p.scenario.steps = p.scenario.steps.filter((s: any) => s.observation?.kind !== 'text'); },
    (p: any) => { p.scenario.steps.at(-1).observation.path[2] = 'bgm-soft'; },
    (p: any) => { p.scenario.steps.at(-1).expected = {}; },
  ]) { const bad = structuredClone(plan); mutate(bad); assert.throws(() => validateOrdinaryAcceptancePlan(bad, f.draft)); }
});

test('new ordinary author and independent reviewer packets share the fixed media contract', async t => {
  const f = await ordinaryHostFixture(t); await f.execute();
  const execution = await read(f.root, 'execution.json');
  assert.equal(execution.ordinaryMediaObservationPolicy, 'audio-state/1');
  const design = execution.tasks.find((x: any) => x.task.taskId === 'design-task').task.context.rules.join('\n');
  const coding = execution.tasks.find((x: any) => x.task.taskId === 'coding-task').task.context.rules.join('\n');
  for (const text of ['audioById', 'outputActivations', 'kind:"debug"', 'first input', "replaceAll('-', '_')"]) assert.ok(design.includes(text), text);
  for (const text of ['GLOBAL_MUTE', 'GLOBAL_VOLUME', 'outputActive', 'outputActivations', 'play/resume', 'volume:0', 'same frozen record']) assert.ok(coding.includes(text), text);
  for (const taskId of ['design-task', 'coding-task']) {
    const author = f.packets.find(p => p.taskId === taskId && p.role !== 'reviewer');
    const reviewer = f.packets.find(p => p.taskId === taskId && p.role === 'reviewer');
    assert.deepEqual(rules(reviewer), rules(author)); assert.ok(reviewer);
    assert.equal(reviewer.ownership.writePaths.length, 0); assert.notEqual(reviewer.contextId, author.contextId);
  }
  assert.ok(!execution.tasks.find((x: any) => x.task.taskId === 'art-task').task.context.rules.join('\n').includes('audioById'));
  assert.equal((await read(f.root, 'snapshot.json')).ledger.entries.length, 0);
  const snapshot = await readRunSnapshot(f.root); if (snapshot.formatVersion !== 1) throw new Error('Expected active fixture');
  const confirmed = await readConfirmedGeneration(f.root, snapshot), controller = await RunController.open({ root: f.root });
  try {
    for (const media of [undefined, 'audio-state/1'] as const) for (const budget of [undefined, 'review-reserve/1']) {
      const host = await createBrowserHost({ root: f.root, ...confirmed, controller, work: new OwnedWork(controller.signal), resume: true, ...f.hostOptions,
        ordinaryMediaObservationPolicy: media, ...(budget ? { ordinaryDesignBudgetPolicy: budget } : {}) } as any);
      assert.equal(host.taskPolicies.find(p => p.role === 'design')!.rules!.join('\n').includes('audioById'), !!media);
    }
  } finally { await controller.close(); }
  await writeFile(join(f.root, 'execution.json'), JSON.stringify({ ...execution, ordinaryMediaObservationPolicy: 'unknown' }), 'utf8');
  const calls = f.packets.length;
  await assert.rejects(f.host.execute({ root: f.root, ...confirmed, resume: true }), /media observation policy/i);
  assert.equal(f.packets.length, calls);
  await writeFile(join(f.root, 'execution.json'), JSON.stringify(execution), 'utf8');
});

test('SFX-only button game packets apply media checks only to confirmed declared sounds and triggers', async t => {
  const f = await ordinaryHostFixture(t, { pause: true, mediaPolicy: 'audio-state/1', configure(draft) {
    draft.brief = '鼠标点击按钮显示完成并播放一次短提示音；没有背景音乐、收集、开门或声音开关。';
    draft.acceptance[0].description = '按钮完成提示'; draft.acceptance[0].steps = ['点击按钮，显示完成并播放一次短提示音'];
    draft.acceptance[0].expected = '完成文字与一次短提示音';
  }, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (!['design', 'art'].includes(packet.role)) return fallback;
    return { close: fallback.close, prompt: async (...args) => {
      const result = await fallback.prompt(...args), path = packet.role === 'design' ? 'authors/design/design.json' : 'authors/art/media.json';
      const output = await read(config.workspace, path);
      output.audio = packet.role === 'design' ? [{ id: 'click-tone', trigger: '点击按钮时播放一次', loop: false }]
        : [{ id: 'click-tone', sampleRate: 22050, duration: 0.05, loop: false, notes: [{ midi: 65, start: 0, duration: 0.05, gain: 0.1, wave: 'sine', attack: 0.002, release: 0.003 }] }];
      await writeFile(join(config.workspace, path), JSON.stringify(output), 'utf8'); return result;
    } };
  } }); await f.execute();
  const author = f.packets.find(p => p.role === 'design'), reviewer = f.packets.find(p => p.role === 'reviewer' && p.taskId === 'design-task');
  assert.ok(author && reviewer); assert.deepEqual(reviewer.rules, author.rules);
  const mediaRule = author.rules.find((rule: string) => rule.startsWith('Preserve every normal visible AC assertion;'));
  assert.ok(mediaRule);
  for (const condition of ['only to confirmed requirements and declared media/triggers', 'Do not add BGM, SFX, controls or gameplay', 'If BGM is declared', 'If short SFX are declared', 'Only when the confirmed requirements include sound controls', 'Collection/opening and uncollected items are conditional examples']) {
    assert.ok(mediaRule.includes(condition), condition);
  }
  const capture = reviewer.inputs.find((ref: any) => ref.artifactId === 'design');
  assert.deepEqual((await read(f.root, capture.location + '/_cosmos/design.json')).audio, [{ id: 'click-tone', trigger: '点击按钮时播放一次', loop: false }]);
  const state = await read(f.root, 'snapshot.json'), art = state.tasks.find((task: any) => task.taskId === 'art-task');
  assert.equal(art.state, 'passed');
  const manifest = await read(f.root, art.artifacts[0].location + '/public/assets/manifest.json');
  assert.deepEqual(manifest.audio.map((clip: any) => [clip.manifest.id, clip.manifest.loop]), [['click-tone', false]]);
  assert.equal(f.packets.some(p => p.role === 'coding'), false); assert.deepEqual(state.ledger.entries, []);
});

test('old ordinary modular execution resumes with exact baseline rules and no media upgrade', async t => {
  const f = await ordinaryHostFixture(t, { modular: true, pause: true }); await f.execute();
  const original = await read(f.root, 'execution.json');
  const oracle = JSON.parse(await readFile(new URL('./ordinary-media-legacy-rules.json', import.meta.url), 'utf8'));
  assert.equal(original.ordinaryMediaObservationPolicy, undefined);
  assert.deepEqual(Object.fromEntries(original.tasks.map((x: any) => [x.task.taskId, x.task.context.rules])), oracle.rules);
  const snapshot = await readRunSnapshot(f.root); assert.equal(snapshot.formatVersion, 1);
  if (snapshot.formatVersion !== 1) throw new Error('Expected active fixture');
  const confirmed = await readConfirmedGeneration(f.root, snapshot);
  const result = await f.host.execute({ root: f.root, ...confirmed, resume: true });
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.deepEqual(await read(f.root, 'execution.json'), original);
});

test('known media selection resumes new modular rules; unknown and incompatible selections cannot dispatch', async t => {
  const f = await ordinaryHostFixture(t, { modular: true, pause: true, mediaPolicy: 'audio-state/1' }); await f.execute();
  const original = await read(f.root, 'execution.json'), snapshot = await readRunSnapshot(f.root);
  if (snapshot.formatVersion !== 1) throw new Error('Expected active fixture');
  const confirmed = await readConfirmedGeneration(f.root, snapshot);
  assert.ok(original.tasks[0].task.context.rules.join('\n').includes('audioById'));
  for (const invalid of ['audio-state/2', null, 1]) {
    await writeFile(join(f.root, 'execution.json'), JSON.stringify({ ...original, ordinaryMediaObservationPolicy: invalid }), 'utf8');
    const calls = f.packets.length;
    await assert.rejects(f.host.execute({ root: f.root, ...confirmed, resume: true }), /media observation policy/i);
    assert.equal(f.packets.length, calls);
  }
  await writeFile(join(f.root, 'execution.json'), JSON.stringify({ ...original, capability: 'browser-input-media2d-v1' }), 'utf8');
  const calls = f.packets.length;
  await assert.rejects(f.host.execute({ root: f.root, ...confirmed, resume: true }), /media observation policy/i);
  assert.equal(f.packets.length, calls);
  await writeFile(join(f.root, 'execution.json'), JSON.stringify(original), 'utf8');
  const controller = await RunController.open({ root: f.root });
  try {
    await assert.rejects(createBrowserHost({ root: f.root, controller, ...confirmed, work: new OwnedWork(controller.signal), resume: true,
      ordinaryMediaObservationPolicy: 'unknown' as any, ...f.hostOptions }), /media observation policy/i);
  } finally { await controller.close(); }
  const result = await f.host.execute({ root: f.root, ...confirmed, resume: true });
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
});

test('coding review receives actual captured forged getter and raw report and saves a source rejection', async t => {
  const finding = 'The audio getter hard-codes outputActivations; it is not derived from actual Phaser playback.';
  let checked = false;
  const f = await ordinaryHostFixture(t, { sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'coding') return { close: fallback.close, prompt: async (...args) => {
      const result = await fallback.prompt(...args);
      await writeFile(join(config.workspace, 'authors/coding/src/main.ts'), "document.querySelector('#status')!.textContent='完成';\nObject.defineProperty(window,'cosmosDebug',{get:()=>Object.freeze({media:Object.freeze({audioById:Object.freeze({clip_bgm:Object.freeze({outputActivations:99})})})})});\n", 'utf8');
      return result;
    } };
    if (packet.role !== 'reviewer' || packet.taskId !== 'coding-task') return fallback;
    return { close: fallback.close, prompt: async () => {
      const game = packet.inputs.find((x: any) => x.artifactId === 'game'), media = packet.inputs.find((x: any) => x.artifactId === 'media');
      assert.ok(media); assert.equal(packet.ownership.writePaths.length, 0);
      assert.ok((await readFile(join(config.workspace, game.location, 'src/main.ts'), 'utf8')).includes('outputActivations:99'));
      const evidence = packet.evidence.find((x: any) => x.source.location === 'evidence/coding-task/browser.json'); assert.ok(evidence);
      assert.equal((await read(config.workspace, evidence.source.location)).outcome, 'passed');
      assert.ok(packet.rules.some((rule: string) => rule.includes('reject constants'))); checked = true;
      return { text: JSON.stringify({ verdict: 'changes_requested', findings: [finding], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }) };
    } };
  } }); await f.execute();
  assert.equal(checked, true);
  const receipt = await read(f.root, 'journal/task-coding-task/review.json');
  assert.equal(receipt.value.verdict.verdict, 'changes_requested'); assert.deepEqual(receipt.value.verdict.findings, [finding]);
});

test('bounded ordinary coding repair inherits fixed media rules without a new policy field', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'code-repair' }); await f.execute();
  const state = await read(f.root, 'snapshot.json');
  const original = state.tasks.find((task: any) => task.taskId === 'coding-task'), repaired = state.tasks.find((task: any) => task.taskId === 'coding-task-repair');
  assert.ok(repaired); assert.equal(repaired.state, 'passed'); assert.deepEqual(repaired.context.rules.slice(0, original.context.rules.length), original.context.rules);
  assert.equal(repaired.context.rules.length, original.context.rules.length + 1); assert.match(repaired.context.rules.at(-1), /^Read the fixed repair feedback /);
  const repair = await read(f.root, 'repair-plan.json'); assert.equal(repair.ordinaryMediaObservationPolicy, undefined);
  assert.equal((await read(f.root, 'execution.json')).ordinaryMediaObservationPolicy, 'audio-state/1');
});

for (const mediaPolicy of [undefined, 'audio-state/1'] as const) test(`explicit continuation passes its original ${mediaPolicy ?? 'legacy'} selection before dispatch`, async t => {
  const f = await ordinaryHostFixture(t, { pause: true, mediaPolicy }); await f.execute();
  const snapshot = await readRunSnapshot(f.root); if (snapshot.formatVersion !== 1) throw new Error('Expected active fixture');
  const confirmed = await readConfirmedGeneration(f.root, snapshot), controller = await RunController.open({ root: f.root });
  await controller.stop('Source-only explicit continuation fixture'); await controller.close();
  const quote = await buildContinuationQuote({ root: f.root, additionalMicroCny: 100_000, additionalDurationMs: 60_000 });
  const confirmation = { decisionId: 'media-source-continuation', actorId: 'source-user', decidedAt: new Date().toISOString(), source: { artifactId: 'continuation-confirmation', version: 'v1', location: 'media-continuation.json' } };
  await writeFile(join(f.root, confirmation.source.location), JSON.stringify({ formatVersion: 'continuation-confirmation-1', ...confirmation, source: undefined, confirmed: true, quote }), 'utf8');
  const window = await RunController.activateContinuation({ root: f.root, quote, confirmation });
  const calls = f.packets.length; let checked = false;
  await executeGeneration({ root: f.root, ...confirmed, resume: false, windowId: window.windowId, createHost: async input => {
    assert.equal(input.ordinaryMediaObservationPolicy, mediaPolicy);
    const host = await createBrowserHost({ ...input, ...f.hostOptions });
    assert.equal(host.taskPolicies.find(p => p.role === 'design')!.rules!.join('\n').includes('audioById'), !!mediaPolicy);
    host.validateTasks?.(input.binding!.tasks); checked = true;
    throw new Error('Source fixture stops after actual continuation host validation, before any model dispatch.');
  } });
  assert.equal(checked, true); assert.equal(f.packets.length, calls);
});

test('ordinary independent design review receives original semantics and persists rejection before downstream work', async t => {
  let reviewed = false;
  const finding = 'The first input after reopen must close sound; the captured plan clicks Continue first. Structure alone does not prove the original sequence.';
  const f = await ordinaryHostFixture(t, { persistent: true, configure(draft, scenario) {
    draft.acceptance[0].steps.push('重开后的首次点击关闭声音，再恢复存档。');
    scenario.reopen!.steps.unshift({ id: 'premature-continue', kind: 'locator-click', selector: '#continue', timeoutMs: 1000 });
  }, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role !== 'reviewer') return fallback;
    return { close: fallback.close, prompt: async () => {
      assert.equal(packet.ownership.writePaths.length, 0);
      const requirement = packet.inputs.find((x: any) => x.artifactId === 'requirement-bundle');
      const capturedDraft = await read(config.workspace, requirement.location + '/_cosmos/requirement-draft.json');
      assert.ok(JSON.stringify(capturedDraft).includes('重开后的首次点击关闭声音'));
      const capture = packet.inputs.find((x: any) => x.artifactId === 'design');
      assert.equal((await read(config.workspace, capture.location + '/_cosmos/acceptance-plan.json')).scenario.reopen.steps[0].id, 'premature-continue');
      reviewed = true;
      return { text: JSON.stringify({ verdict: 'changes_requested', findings: [finding], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }) };
    } };
  } }); await f.execute();
  assert.equal(reviewed, true);
  assert.equal(f.packets.some(p => p.role === 'art' || p.role === 'coding'), false);
  const state = await read(f.root, 'snapshot.json');
  assert.ok(state.tasks.some((x: any) => x.review?.findings?.includes(finding) || JSON.stringify(x.handoff).includes(finding)));
});
