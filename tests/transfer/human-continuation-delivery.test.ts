import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { readRunStatus } from '../../src/cli/control.ts';
import { loadExperienceBinding } from '../../src/runtime/experience.ts';
import { humanContinuationFixture, continuationStreams } from './human-continuation.fixture.ts';

/** Real production host/core and CLI; only stdin/model/build/browser transport is SYNTHETIC. */
async function experience(root: string, answer?: string, beforeAnswer?: () => Promise<void>) {
  const input = new PassThrough(), output = new PassThrough(); let text = '', answered = false;
  output.on('data', bytes => {
    text += bytes;
    if (!answered && text.includes('approve')) {
      answered = true;
      void (async () => { await beforeAnswer?.(); input.end(answer === undefined ? '' : answer + '\n'); })();
    }
  });
  const result = await runCli(['experience', root], { input, output }); return { result: result as any, text };
}

test('production human coding continuation delivers all approved task proofs to final experience', async t => {
  const f = await humanContinuationFixture(t), originalCalls = [...f.calls]; f.continue();
  const result: any = await runCli(['continue', f.root, '--add-cny', '1', '--add-minutes', '10'],
    { host: f.host, ...continuationStreams(id => `confirm ${id}\n`) });
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  const snapshot = await readFile(join(f.root, 'snapshot.json')), state = JSON.parse(snapshot.toString('utf8'));
  const window = state.continuation.windows[0], currentId = window.grants[0].taskId;
  const plan = JSON.parse(await readFile(join(f.root, `continuations/${window.decisionId}/plan.json`), 'utf8'));
  assert.equal(window.grants.length, 1);
  assert.deepEqual(plan.tasks.map((item: any) => item.task.taskId), ['actual-design-58', 'actual-art-58', currentId]);
  assert.deepEqual(result.effectiveTasks.map((proof: any) => proof.taskId), ['actual-design-58', 'actual-art-58', currentId]);
  assert.ok(!Object.hasOwn(result, 'deliveryTasks'), 'Internal task contracts must not leak into the public report');
  assert.deepEqual(result.acceptanceScope.acceptance, f.requirement.acceptance);
  assert.deepEqual(f.calls.slice(originalCalls.length).map(call => call.split(':')[0]), ['coding', 'reviewer']);
  for (const id of ['actual-design-58', 'actual-art-58']) {
    assert.deepEqual(state.tasks.find((task: any) => task.taskId === id), f.original.tasks.find((task: any) => task.taskId === id));
  }
  assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.deepEqual(state.stopReason, f.original.stopReason);
  const binding = await loadExperienceBinding(f.root);
  assert.deepEqual(binding.effectiveTasks, result.effectiveTasks);
  assert.equal(binding.windowId, window.windowId);
  const calls = [...f.calls];
  for (const answer of ['cancel', undefined]) {
    assert.equal((await experience(f.root, answer)).result.outcome, 'unconfirmed');
    await assert.rejects(readdir(join(f.root, 'delivery/experience')), { code: 'ENOENT' });
  }
  await assert.rejects(experience(f.root, 'approve', async () => {
    const changed = structuredClone(state);
    changed.tasks.find((task: any) => task.taskId === 'actual-art-58').review.contextId += '-changed';
    await writeFile(join(f.root, 'snapshot.json'), JSON.stringify(changed) + '\n', 'utf8');
  }), /task|proof|review|changed|stale|批准|变化/i);
  await writeFile(join(f.root, 'snapshot.json'), snapshot);
  await assert.rejects(readdir(join(f.root, 'delivery/experience')), { code: 'ENOENT' });
  const approved = await experience(f.root, 'approve');
  assert.equal(approved.result.userExperience, 'approved');
  assert.equal((await readRunStatus(f.root)).delivery?.userExperience, 'approved');
  assert.match(approved.text, /完整经典/);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), snapshot);
  assert.deepEqual(f.calls, calls); await f.requirePreserved();
});
