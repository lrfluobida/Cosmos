import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { removeOwned, snapshot } from '../../src/artifacts/paths.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import { createGameDesignCheck } from '../../src/runtime/entrypoint-design-check.ts';
import { validateOrdinaryAcceptancePlan } from '../../src/runtime/entrypoint-acceptance-plan.ts';
import { selectClassicEntry } from '../../src/runtime/classic-entry-input.ts';
import { ordinaryDraft } from '../roles/ordinary.fixture.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { ordinaryClassicSource } from './ordinary-browser.fixture.ts';

const draft = withHostStages(ordinaryDraft());
const requirement = { artifactId: 'requirement-bundle', version: 'v1', location: 'registry/captures/requirement-bundle/v1/files' };
const design = () => ({ summary: '点亮目标', implementationNotes: ['正常鼠标操作'], acceptanceMapping: { light: '显示完成' },
  characters: [{ id: 'light', purpose: '目标', states: ['idle'] }], audio: [] });
function plan() {
  const checkpoint = { expected: '已保存', snapshot: { kind: 'text', selector: '#progress' }, savedSnapshot: { kind: 'text', selector: '#saved' } };
  const steps = [{ id: 'save', kind: 'locator-click', selector: '#save', timeoutMs: 1000 },
    ...[checkpoint.snapshot, checkpoint.savedSnapshot].map((observation, i) => ({ id: `check-${i}`, kind: 'assert', acceptanceId: 'light', observation, expected: checkpoint.expected, timeoutMs: 1000 }))];
  return { formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: { viewport: { width: 1280, height: 720 }, steps,
    reopen: { checkpoint, steps: structuredClone(steps) } } };
}
async function call(tool: ToolDefinition<any, any>) {
  const content = (await tool.execute('self-check', {}, undefined, undefined, undefined as any)).content[0];
  assert.equal(content.type, 'text'); assert.ok('text' in content); return JSON.parse(content.text);
}

test('ordinary host self-check rules and actual tool agree on both outputs within the original author session', async t => {
  const f = await ordinaryHostFixture(t), scripted = f.hostOptions.sessionFactory!;
  let checked = false, actionError: unknown;
  f.hostOptions.sessionFactory = async config => {
    const session = await scripted(config), packet = JSON.parse(config.context!);
    if (packet.role !== 'design') return session;
    return { ...session, prompt: async (...args) => { try {
      const tool = config.tools!.find(tool => tool.name === 'validate-game-design')!;
      const rule = packet.rules.find((rule: string) => rule.startsWith('Before finishing,'));
      assert.ok(tool); assert.ok(rule);
      const main = 'authors/design/design.json', acceptance = 'authors/design/acceptance-plan.json';
      await writeFile(join(config.workspace, main), JSON.stringify({ ...design(), experienceMapping: { readable: '清晰显示' } }), 'utf8');
      const state = await readFile(join(f.root, 'snapshot.json')), files = await snapshot(config.workspace), missing = await call(tool);
      assert.equal(missing.passed, false); assert.equal(missing.errors[0].path, acceptance);
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), state);
      assert.deepEqual(await snapshot(config.workspace), files);
      t.diagnostic(JSON.stringify({ rule, description: tool.description, missing }));
      for (const message of [rule, tool.description]) for (const file of [main, acceptance]) assert.ok(message.includes(file), message);
      assert.doesNotMatch(rule, /generic design bytes only/);
      const rules = packet.rules.join('\n');
      assert.match(rules, /locator-click.*selector.*timeoutMs/);
      assert.match(rules, /mouse-click\/mouse-move.*require.*x.*y.*even.*selector/i);
      assert.match(rules, /after both files are complete.*within this author session/);
      const result = await session.prompt(...args);
      assert.deepEqual(await call(tool), { passed: true, errors: [] }); checked = true; return result;
    } catch (error) { actionError = error; throw error; } } };
  };
  const result: any = await f.execute(); if (actionError) throw actionError;
  assert.equal(checked, true); assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, 1);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 3);
});

test('configured self-check description matches its existing ordinary, modular and classic checks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos114-check-')); t.after(() => removeOwned(tmpdir(), root));
  await mkdir(join(root, 'authors/design'), { recursive: true });
  const selection = await selectClassicEntry(await ordinaryClassicSource(t));
  const check = createGameDesignCheck({ workspace: root, gameplayIds: ['light'], ordinary: { draft, requirement }, modular: true,
    classicEntry: { selection }, guard: async () => {} });
  const put = (file: string, value: unknown) => writeFile(join(root, file), typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  await put('authors/design/design.json', { ...design(), experienceMapping: { readable: '清晰显示' }, modulePurposes: { a: '规则', b: '显示' } });
  const outputs: [string, unknown][] = [
    ['authors/design/acceptance-plan.json', plan()],
    ['authors/design/module-contracts.d.ts', 'export interface ModuleA { advance(value: number): number; }\nexport interface ModuleB { label(value: number): string; }\n'],
    ['authors/design/classic-entry-plan.json', { formatVersion: 'classic-entry-plan/1', measurementId: selection.measurement!.id, acceptanceId: 'light',
      inputs: [{ id: 'show-cost', kind: 'locator-click', selector: '#show-cost', timeoutMs: 1000 }], observation: { kind: 'text', selector: '#cost' }, timeoutMs: 1000 }],
  ];
  for (const [file, value] of outputs) {
    const before = await snapshot(root), missing = await call(check.tool);
    assert.equal(missing.passed, false); assert.equal(missing.errors[0].path, file); assert.deepEqual(await snapshot(root), before);
    assert.ok(check.tool.description.includes(file), check.tool.description); await put(file, value);
  }
  assert.equal(check.readOnly, true); assert.deepEqual(await call(check.tool), { passed: true, errors: [] });
  const legacy = createGameDesignCheck({ workspace: root, gameplayIds: ['light'], guard: async () => {} });
  await put('authors/design/design.json', design());
  assert.deepEqual(await call(legacy.tool), { passed: true, errors: [] });
  for (const [file] of outputs) assert.ok(!legacy.tool.description.includes(file));
});

for (const reopen of [false, true]) for (const axis of ['x', 'y']) test(`coordinate feedback names ${reopen ? 'reopen' : 'initial'} step and ${axis} without changing bounds`, () => {
  for (const kind of ['mouse-click', 'mouse-move']) {
    const value: any = plan(), steps = reopen ? value.scenario.reopen.steps : value.scenario.steps;
    steps.unshift({ id: 'pointer', kind, x: 0.5, y: 0.5, selector: '#save' });
    assert.doesNotThrow(() => validateOrdinaryAcceptancePlan(value, draft));
    for (const coordinate of [undefined, -1, 1, Infinity]) {
      steps[0][axis] = coordinate;
      assert.throws(() => validateOrdinaryAcceptancePlan(value, draft), (error: Error) => {
        assert.ok(error.message.includes(`scenario.${reopen ? 'reopen.' : ''}steps[0].${axis}:`), error.message); return true;
      });
    }
    delete steps[0].selector; steps[0].x = 1279; steps[0].y = 719;
    assert.doesNotThrow(() => validateOrdinaryAcceptancePlan(value, draft));
    steps[0][axis] = axis === 'x' ? 1280 : 720;
    assert.throws(() => validateOrdinaryAcceptancePlan(value, draft));
  }
});

for (const reopen of [false, true]) for (const field of ['snapshot', 'savedSnapshot'] as const) test(`checkpoint feedback identifies ${reopen ? 'reopen' : 'initial'} ${field} and preserves normal input proof`, () => {
  for (const fault of ['missing', 'expected', 'input']) {
    const value: any = plan(), steps = reopen ? value.scenario.reopen.steps : value.scenario.steps;
    assert.doesNotThrow(() => validateOrdinaryAcceptancePlan(value, draft));
    const checkpoint = value.scenario.reopen.checkpoint, index = steps.findIndex((step: any) => step.observation?.selector === checkpoint[field].selector);
    if (fault === 'missing') steps.splice(index, 1);
    if (fault === 'expected') steps[index].expected = '未保存';
    if (fault === 'input') { const [click] = steps.splice(0, 1); steps.push(click); }
    const missingField = fault === 'input' ? 'snapshot' : field;
    assert.throws(() => validateOrdinaryAcceptancePlan(value, draft), (error: Error) => {
      for (const detail of [`scenario.${reopen ? 'reopen.' : ''}steps`, missingField, checkpoint[missingField].selector, checkpoint.expected]) assert.ok(error.message.includes(detail), error.message);
      return true;
    });
  }
});

test('shared viewport diagnostics retain scenario ownership and first failing stage', () => {
  const value: any = plan(); value.scenario.viewport.width = 99;
  assert.throws(() => validateOrdinaryAcceptancePlan(value, draft), /scenario\.viewport\.width:/);
  value.scenario.viewport.width = 1280; value.scenario.steps.pop(); value.scenario.reopen.steps.pop();
  assert.throws(() => validateOrdinaryAcceptancePlan(value, draft), (error: Error) => {
    assert.match(error.message, /scenario\.steps/); assert.doesNotMatch(error.message, /scenario\.reopen\.steps/); return true;
  });
});


for (const [label, change, path] of [
  ['same selectors', (c: any) => { c.savedSnapshot.selector = c.snapshot.selector; }, 'scenario.reopen.checkpoint.savedSnapshot.selector'],
  ['extra field', (c: any) => { c.checkpointAssertionIds = ['save']; }, 'scenario.reopen.checkpoint.checkpointAssertionIds'],
  ['bad kind', (c: any) => { c.snapshot.kind = 'value'; }, 'scenario.reopen.checkpoint.snapshot.kind'],
  ['bad expected', (c: any) => { c.expected = ''; }, 'scenario.reopen.checkpoint.expected'],
] as const) test('COS136 F8 visible checkpoint reports the exact field for ' + label, () => {
  const value: any = plan(); change(value.scenario.reopen.checkpoint);
  assert.throws(() => validateOrdinaryAcceptancePlan(value, draft), error => error instanceof Error && error.message.includes(path));
});
