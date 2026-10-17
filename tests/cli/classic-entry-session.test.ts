import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { genericPersistentDraft } from '../acceptance/generic-persistent.fixture.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { syntheticClassicSource } from '../runtime/generic-persistent-host.fixture.ts';

async function productDraft(t: test.TestContext, inject = false, classicSourceRoot?: string) {
  classicSourceRoot ??= (await syntheticClassicSource(t, true)).sourceRoot;
  const root = await mkdtemp(join(tmpdir(), 'cos104-draft-')), controller = await IntakeController.create({ root, runId: 'fixture', ledgerId: 'fixture', specVersion: '1.0',
    interviewTaskId: 'intake', maxRequests: 1, allocations: [{ taskId: 'intake', amountMicroCny: 100 }] });
  t.after(async () => { await controller.close(); await removeOwned(tmpdir(), root); });
  const draft = genericPersistentDraft(), host = createProductHost(root, { classicSourceRoot, sessionFactory: async () => ({ async prompt() {
    return { text: JSON.stringify({ acceptance: draft.acceptance, scenario: draft.scenario, unsupported: [], benchmark: 'classic-pc-runtime-policy/1', ...(inject ? { classicEntry: { measurement: null } } : {}) }) };
  }, async close() {} } as any) });
  return host.draft({ controller, roundId: 'fixture-draft', brief: draft.brief, questions: draft.questions, answers: draft.answers });
}

test('real product draft adds host-owned selection only after the strict model proposal', async t => {
  const draft: any = await productDraft(t);
  assert.equal(draft.classicEntry?.formatVersion, 'classic-entry-selection/1');
  assert.equal(draft.classicEntry.measurement, null); assert.equal(draft.classicEntry.reason, 'no_reference_measurements');
  await assert.rejects(productDraft(t, true), /proposal fields/);
});

test('public confirmation displays the exact selected object, metric, value and unit before accepting it', async t => {
  const { sourceRoot } = await syntheticClassicSource(t), draft: any = await productDraft(t, false, sourceRoot);
  const root = await mkdtemp(join(tmpdir(), 'cos104-value-cli-')); t.after(() => removeOwned(tmpdir(), root));
  let stdout = '', executed: any; const output = new PassThrough(); output.on('data', chunk => { stdout += chunk; });
  await runCli(['new', root, '--brief', draft.brief], { input: Readable.from([draft.answers.save + '\nconfirm 1\n']), output, host: {
    async prepare() { return { environmentReady: true, executionReady: true }; }, async questions() { return draft.questions; }, async draft() { return draft; },
    async execute(input) { executed = input; return { outcome: 'incomplete', gaps: ['Synthetic reference fixture only'] }; },
  } });
  for (const text of [draft.classicEntry.entityLabel, draft.classicEntry.measurement.entityId, 'synthetic cost = 7 fixture coins', '完整经典验收仍未通过']) {
    assert.ok(stdout.includes(text)); assert.ok(stdout.indexOf(text) < stdout.indexOf('确认当前版本请输入'));
  }
  assert.deepEqual(executed.draft.classicEntry, draft.classicEntry);
});

for (const response of ['confirm 1\n', 'cancel\n', '']) test(`selection is displayed before explicit confirmation: ${response.trim() || 'EOF'}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos104-cli-')); t.after(() => removeOwned(tmpdir(), root));
  const draft: any = await productDraft(t); let executed: any, stdout = '';
  const output = new PassThrough(); output.on('data', chunk => { stdout += chunk; });
  await runCli(['new', root, '--brief', draft.brief], { input: Readable.from([draft.answers.save + '\n' + response]), output, host: {
    async prepare() { return { environmentReady: true, executionReady: true }; }, async questions() { return draft.questions; }, async draft() { return draft; },
    async execute(input) { executed = input; return { outcome: 'incomplete', gaps: ['SOURCE fixture'] }; },
  } });
  assert.match(stdout, /无.*参考.*测量|没有.*参考.*测量/); assert.match(stdout, /未执行/);
  assert.match(stdout, /完整经典验收仍未通过/);
  if (response.startsWith('confirm')) {
    assert.ok(executed); assert.deepEqual(executed.draft.classicEntry, draft.classicEntry);
    assert.deepEqual(JSON.parse(await readFile(join(root, executed.requirement.sources[0].location), 'utf8')).classicEntry, draft.classicEntry);
  } else assert.equal(executed, undefined);
});
