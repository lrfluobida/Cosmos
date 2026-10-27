import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

const proposal = { summary: '候选保留原始作者报告。', remaining: ['需要独审核对最终计划顺序。'], uncertainty: ['作者不能确定最后修改后的自检状态。'] };
for (const revisionPolicy of ['independent-review/1', 'independent-review/2'] as const) test(`${revisionPolicy} frozen design candidate keeps concerns and applies its exact review gate`, async t => {
  const f = await ordinaryHostFixture(t, { revisionPolicy, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'design') return { ...fallback, prompt: async (...args) => { await fallback.prompt(...args); return { text: JSON.stringify(proposal) }; } };
    if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { ...fallback, prompt: async () => {
      assert.deepEqual(packet.designConcernReview.proposal, proposal);
      return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId),
        concernResolutions: packet.designConcernReview.concerns.map((concern: any) => ({ concernId: concern.concernId, concernText: proposal[concern.field as 'remaining' | 'uncertainty'][concern.index],
          status: 'resolved', basis: 'host_evidence', rationale: 'light/readable: 当前 host-report.json 核对最终 acceptance-plan 的结构和 light 条目；完整范围另行独审。',
          acceptanceIds: packet.acceptance.map((row: any) => row.acceptanceId), inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId), evidenceRefs: packet.evidence.map((row: any) => row.source) })) }) };
    } };
    return fallback;
  } });
  const result: any = await f.execute(), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  if (revisionPolicy === 'independent-review/1') {
    assert.equal(state.tasks[0].state, 'failed'); assert.equal(state.tasks[0].artifacts[0].version, 'v1');
    assert.equal(f.packets.some(packet => ['reviewer', 'art', 'coding'].includes(packet.role)), false);
  } else {
    assert.equal(f.packets.filter(packet => packet.role === 'reviewer' && packet.taskId === 'design-task').length, 1, JSON.stringify(result.gaps));
    assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
    const author = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/author.json'), 'utf8'));
    assert.deepEqual(author.value.proposal, proposal); assert.deepEqual(state.tasks[0].handoff.remaining, []); assert.deepEqual(state.tasks[0].handoff.uncertainty, []);
  }
});
