import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { createGameDesignCheck } from '../../src/runtime/entrypoint-design-check.ts';
import { validateOrdinaryAcceptancePlan } from '../../src/runtime/entrypoint-acceptance-plan.ts';
import { withHostStages } from '../../src/roles/requirements.ts';

const file = 'authors/design/acceptance-plan.json';
async function fixture(t: test.TestContext) {
  const workspace = await mkdtemp(join(tmpdir(), 'cos145-diagnostics-'));
  t.after(() => removeOwned(tmpdir(), workspace));
  await mkdir(join(workspace, 'authors/design'), { recursive: true });
  const draft = withHostStages({ ordinaryProfile: 'ordinary-design/1', brief: '鼠标点亮目标', questions: [{ id: 'goal', prompt: '操作目标？' }], answers: { goal: '点击后完成' }, unsupported: [],
    acceptance: [{ acceptanceId: 'light', description: '点击完成', steps: ['点击目标'], expected: '完成', evidenceKinds: ['test_report'] }],
    experienceCriteria: [{ criterionId: 'readable', description: '状态清楚', steps: ['查看目标'], expected: '容易辨认' }] });
  const requirement = { artifactId: 'requirement-bundle', version: 'v1', location: 'requirements/v1' };
  const checkpoint = { expected: '已保存', snapshot: { kind: 'text', selector: '#progress' }, savedSnapshot: { kind: 'text', selector: '#saved' } };
  const steps = [{ id: 'click', kind: 'locator-click', selector: '#light', timeoutMs: 1000 },
    ...[checkpoint.snapshot, checkpoint.savedSnapshot].map((observation, index) => ({ id: `save-${index}`, kind: 'assert', acceptanceId: 'light', observation, expected: '已保存', timeoutMs: 1000 }))];
  const plan: any = { formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: { viewport: { width: 1280, height: 720 }, steps, reopen: { checkpoint, steps: structuredClone(steps) } } };
  await writeFile(join(workspace, 'authors/design/design.json'), JSON.stringify({ summary: '原创鼠标游戏', implementationNotes: ['点击后显示结果'], acceptanceMapping: { light: '完成' },
    experienceMapping: { readable: '状态清楚' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [] }), 'utf8');
  const check = createGameDesignCheck({ workspace, gameplayIds: ['light'], ordinary: { draft, requirement }, guard: async () => {} });
  const put = async (value: unknown) => { await writeFile(join(workspace, file), JSON.stringify(value), 'utf8'); };
  const automatic = () => check.afterFileWrite(new AbortController().signal);
  const explicit = async () => {
    const result = await check.tool.execute('diagnostics', {}, undefined, undefined, undefined as any);
    const block = result.content[0]; assert.equal(block.type, 'text');
    if (block.type !== 'text') throw new Error('Expected text');
    return JSON.parse(block.text) as { passed: boolean; errors: { path: string; message: string }[] };
  };
  return { workspace, draft, plan, put, automatic, explicit };
}

test('COS145 checkpoint failure preserves strict error and collects both stage diagnostics without changing files', async t => {
  const f = await fixture(t), bad = structuredClone(f.plan);
  bad.scenario.reopen.checkpoint.expected = '';
  bad.scenario.steps[1].observation.kind = 'appears';
  bad.scenario.steps[0] = { id: 'click', kind: 'mouse-click', selector: '#light', x: 240, y: 160 };
  bad.scenario.reopen.steps[1].observation.kind = 'disabled';
  await f.put(bad);
  const before = await readFile(join(f.workspace, file)), result = await f.explicit(), text = await f.automatic();
  assert.equal(result.passed, false);
  assert.match(result.errors[0].message, /checkpoint.expected/);
  assert.match(text, /checkpoint.expected/);
  assert.match(text, /scenario.steps\[1\].*Unknown observation kind/);
  assert.match(text, /scenario.reopen.steps\[1\].*Unknown observation kind/);
  for (const path of ['scenario.steps[0].x', 'scenario.steps[0].y', 'scenario.steps[1]', 'scenario.reopen.steps[1]']) {
    assert.ok(result.errors.some(error => error.message.startsWith(`${path}:`)), path);
  }
  assert.deepEqual(await readFile(join(f.workspace, file)), before);
  assert.throws(() => validateOrdinaryAcceptancePlan(bad, f.draft), /checkpoint.expected/);
});

test('COS145 repeated diagnostics merge exact locations and keep both stages in bounded automatic feedback', async t => {
  const f = await fixture(t), bad = structuredClone(f.plan);
  bad.scenario.reopen.checkpoint.expected = '';
  bad.scenario.steps.push(...Array.from({ length: 120 }, (_, index) => ({ ...bad.scenario.steps[1], id: `bad-${index}`, observation: { kind: 'appears' } })));
  bad.scenario.reopen.steps[1].observation.kind = 'disabled';
  await f.put(bad);
  const result = await f.explicit(), text = await f.automatic();
  assert.equal(result.errors.length, 122);
  assert.equal(result.errors.filter(error => error.message.includes('Unknown observation kind')).length, 121);
  assert.equal(text.split('\n').filter(line => line.startsWith('- ')).length, 2);
  assert.equal(text.match(/Unknown observation kind/g)?.length, 1);
  assert.match(text, /scenario.steps\[3\]/); assert.match(text, /scenario.reopen.steps\[1\]/);
  assert.match(text, /\d+ locations? omitted/); assert.match(text, /validate-game-design/);
  assert.ok(text.length <= 4096);
});

test('COS145 automatic group and character limits retain strict and reopen errors with explicit omission counts', async t => {
  const f = await fixture(t);
  for (const long of [false, true]) {
    const bad = structuredClone(f.plan);
    bad.scenario.reopen.checkpoint.expected = '';
    bad.scenario.steps.push(...Array.from({ length: 15 }, (_, index) => ({ id: `click-${index}`, kind: 'locator-click', selector: '#light', timeoutMs: 1000,
      [(long ? '错误字段'.repeat(2000) : 'extra') + index]: true })));
    bad.scenario.reopen.steps[1].observation.kind = 'disabled';
    await f.put(bad);
    const result = await f.explicit(), text = await f.automatic();
    assert.equal(result.errors.length, 17);
    assert.equal(text.split('\n').filter(line => line.startsWith('- ')).length, 8);
    assert.match(text, /checkpoint.expected/); assert.match(text, /scenario.reopen.steps\[1\].*Unknown observation kind/);
    assert.match(text, /9 diagnostic groups omitted/); assert.match(text, /validate-game-design/);
    assert.ok(text.length <= 4096);
    if (long) { assert.match(text, /\d+ detail characters omitted/); assert.match(result.errors[1].message, new RegExp('错误字段'.repeat(2000))); }
  }
});

test('COS145 partial repairs remove only repaired local errors and cannot bypass strict or source checks', async t => {
  const f = await fixture(t), bad = structuredClone(f.plan);
  bad.scenario.reopen.checkpoint.expected = '';
  bad.scenario.steps[1].observation.kind = 'appears'; bad.scenario.reopen.steps[1].observation.kind = 'disabled';
  await f.put(bad); assert.equal((await f.explicit()).errors.length, 3);
  bad.scenario.steps[1] = structuredClone(f.plan.scenario.steps[1]);
  await f.put(bad);
  let result = await f.explicit();
  assert.equal(result.passed, false); assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every(error => !error.message.includes('scenario.steps[1]')));
  bad.scenario.reopen.steps[1] = structuredClone(f.plan.scenario.reopen.steps[1]);
  await f.put(bad); result = await f.explicit();
  assert.equal(result.passed, false); assert.equal(result.errors.length, 1); assert.match(result.errors[0].message, /checkpoint.expected/);
  await f.put(f.plan); assert.deepEqual(await f.explicit(), { passed: true, errors: [] });
  const changed = structuredClone(f.plan); changed.requirement.version = 'changed';
  await f.put(changed); result = await f.explicit();
  assert.equal(result.passed, false); assert.match(result.errors[0].message, /original complete requirement capture/);
});

test('COS145 malformed JSON, encoding, envelopes and stage structures remain read-only strict failures', async t => {
  const f = await fixture(t);
  for (const value of [null, [], 4, { ...f.plan, scenario: null }, { ...f.plan, scenario: [] }]) {
    await f.put(value);
    const before = await readFile(join(f.workspace, file)), result = await f.explicit();
    assert.equal(result.passed, false); assert.equal(result.errors.length, 1);
    assert.deepEqual(await readFile(join(f.workspace, file)), before);
  }
  for (const stage of [null, [], {}, [null, false, 3, [], { id: 'bad', kind: 'other' }]]) {
    const bad = structuredClone(f.plan); bad.scenario.steps = stage; bad.scenario.reopen.steps = stage;
    await f.put(bad);
    const result = await f.explicit(), text = await f.automatic();
    assert.equal(result.passed, false); assert.match(text, /scenario.steps/); assert.match(text, /scenario.reopen.steps/);
    assert.ok(result.errors.some(error => /Expected 1..200 steps|Expected a step/.test(error.message)));
    assert.deepEqual(JSON.parse(await readFile(join(f.workspace, file), 'utf8')), bad);
  }
  for (const reopen of [null, 2, [], 'wrong']) {
    await f.put({ ...f.plan, scenario: { ...f.plan.scenario, reopen } });
    assert.equal((await f.explicit()).passed, false);
  }
  for (const bytes of [Buffer.from('{'), Buffer.from([0xff])]) {
    await writeFile(join(f.workspace, file), bytes);
    const result = await f.explicit(); assert.equal(result.passed, false); assert.equal(result.errors.length, 1);
    assert.deepEqual(await readFile(join(f.workspace, file)), bytes);
  }
  await unlink(join(f.workspace, file));
  const missing = await f.explicit(); assert.equal(missing.passed, false); assert.match(missing.errors[0].message, /ENOENT/);
});

test('COS145 local checks use the actual viewport and confirmed gameplay IDs for each stage, with strict errors deduplicated', async t => {
  const f = await fixture(t), bad = structuredClone(f.plan);
  bad.scenario.steps[0] = { id: 'click', kind: 'mouse-click', x: 1279, y: 719 };
  bad.scenario.steps[1].acceptanceId = 'invented';
  bad.scenario.reopen.steps[1].acceptanceId = 'COSMOS-DESIGN';
  await f.put(bad);
  const result = await f.explicit(), text = await f.automatic();
  assert.equal(result.passed, false); assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /scenario.steps\[1\]: Unknown acceptanceId/);
  assert.match(result.errors[1].message, /scenario.reopen.steps\[1\]: Unknown acceptanceId/);
  assert.doesNotMatch(text, /Coordinates|Missing assertion/);
  assert.equal(text.match(/Unknown acceptanceId/g)?.length, 1);
  const envelope = structuredClone(bad); envelope.unexpected = true;
  await f.put(envelope);
  const errors = (await f.explicit()).errors;
  assert.match(errors[0].message, /envelope/); assert.equal(errors.length, 3);
});
