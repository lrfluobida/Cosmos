import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { readModularRepairPolicy } from '../../src/runtime/modular-repair-policy.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';

export async function policyFixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos72-policy-')); t.after(() => removeOwned(tmpdir(), root));
  let text = ''; const calls: any[] = [], output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  const host = { prepare: async () => ({ environmentReady: true, executionReady: true }), questions: async () => [{ id: 'goal', prompt: '目标？' }],
    draft: async (input: any) => withHostStages({ codeProfile: 'modular-code/1', brief: input.brief, questions: input.questions, answers: input.answers, unsupported: [],
      acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
      scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
        { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } } as any),
    execute: async (input: any) => { calls.push(input); return { outcome: 'incomplete', fixtureOnly: true }; } };
  const run = (command: 'new' | 'resume', input = '') => runCli([command, root, ...(command === 'new' ? ['--brief', '分模块点击'] : [])], { host, input: Readable.from([input]), output });
  return { root, run, calls, text: () => text };
}
test('COS72 new policy is displayed and bound by trusted original intake and confirmation', async t => {
  const f = await policyFixture(t); await f.run('new', '点击获胜\nconfirm 1\n');
  assert.match(f.text(), /模块 v1.*v2|模块.*修复/); assert.match(f.text(), /整组.*第二|不给.*第二/);
  const origin = JSON.parse(await readFile(join(f.root, 'intake-origin.json'), 'utf8'));
  assert.equal(origin.modularRepairPolicy.version, 'module-repair/1'); assert.match(origin.modularRepairPolicy.sha256, /^[a-f0-9]{64}$/);
  const ref = f.calls[0].requirement.sources[1]; assert.ok(ref.version.includes(`-module-repair-${origin.modularRepairPolicy.sha256}`));
  const confirmed = JSON.parse(await readFile(join(f.root, ref.location), 'utf8')); assert.deepEqual(confirmed.modularRepairPolicy, origin.modularRepairPolicy);
  assert.equal(f.calls[0].draft.modularRepairPolicy, undefined, 'The model game draft cannot authorize repair.');
});
test('COS72 deleting both bound policy sources cannot silently become new or legacy permission', async t => {
  const f = await policyFixture(t); await f.run('new', '点击获胜\nconfirm 1\n');
  const paths = ['intake-origin.json', f.calls[0].requirement.sources[1].location];
  for (const name of paths) { const path = join(f.root, name), value = JSON.parse(await readFile(path, 'utf8')); delete value.modularRepairPolicy; await writeFile(path, JSON.stringify(value), 'utf8'); }
  const before = await readFile(join(f.root, 'snapshot.json')), count = f.calls.length;
  await assert.rejects(f.run('resume'), /policy|政策|来源|original/i); assert.equal(f.calls.length, count); assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before));
});
test('COS72 exact original confirmation revision and source cannot drift before dispatch', async t => {
  for (const mutation of ['version', 'receipt-revision', 'draft-source']) await t.test(mutation, async t => {
    const f = await policyFixture(t); await f.run('new', '点击获胜\nconfirm 1\n');
    const path = join(f.root, 'snapshot.json'), state = JSON.parse(await readFile(path, 'utf8'));
    const source = state.run.humanDecisions[0].evidence[1], receiptPath = join(f.root, source.location);
    if (mutation === 'version') { source.version = source.version.replace(/^v1-/, 'v999-'); await writeFile(path, JSON.stringify(state), 'utf8'); }
    else {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (mutation === 'receipt-revision') receipt.revision = 999;
      else receipt.draft = { ...receipt.draft, version: 'v999', location: 'requirements/v999/draft.json' };
      await writeFile(receiptPath, JSON.stringify(receipt), 'utf8');
    }
    const before = await readFile(path), count = f.calls.length;
    await assert.rejects(f.run('resume'), /confirmation|policy|来源|original/i);
    assert.equal(f.calls.length, count); assert.ok((await readFile(path)).equals(before));
  });
});
test('COS72 old original confirmation remains integration-only when opened by new CLI', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos72-old-')); t.after(() => removeOwned(tmpdir(), root));
  const intake = await IntakeController.create({ root, runId: 'old-game', ledgerId: 'old-budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  const draft: any = withHostStages({ codeProfile: 'modular-code/1', brief: '旧分模块运行', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '获胜' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '获胜', steps: ['点击'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 800, height: 500 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } } as any);
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'old-fixture-user', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const before = await readFile(join(root, 'snapshot.json'));
  assert.equal(requirement.sources[1].version, 'v1'); assert.equal(await readModularRepairPolicy(root, await readRunSnapshot(root)), undefined);
  let executed = 0; const output = new PassThrough(); output.resume();
  const no = async () => { throw new Error('No new interview or preparation'); };
  await runCli(['resume', root], { input: Readable.from([]), output, host: { prepare: no, questions: no, draft: no, execute: async () => { executed++; return { outcome: 'legacy-fixture' }; } } });
  assert.equal(executed, 1); assert.ok((await readFile(join(root, 'snapshot.json'))).equals(before));
  assert.equal(await readModularRepairPolicy(root, await readRunSnapshot(root)), undefined);
});
