import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { RunController } from '../../src/runtime/run.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';

for (const outcome of ['settled', 'unknown'] as const) test(`native role compaction preserves fixed authority and shared billing: ${outcome}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-compact-'));
  const workspace = join(root, 'workspace'); await mkdir(workspace);
  const task = taskFixture() as TaskContract; Object.assign(task, { state: 'not_started', attempts: [], evidence: [], artifacts: [], dependsOn: [] });
  task.context.tools = []; task.context.knownFailures = [{ classification: 'code_defect', summary: '保留原失败', reproduction: ['启动'], actual: '未启动', expected: '正常启动', evidenceRefs: [] }];
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'validation', limitMicroCny: 5000, allocations: [{ taskId: task.taskId, amountMicroCny: 5000 }] });
  task.budget = { ledgerId: 'ledger-1', allocationMicroCny: 5000, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
  const requests: any[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init); requests.push(JSON.parse(await request.text()));
    const body = { id: 'offline', model: 'deepseek-flash', choices: [{ index: 0, delta: { content: requests.length === 1 ? '记录 '.repeat(200) : '保留固定要求与失败' }, finish_reason: 'stop' }],
      ...(outcome === 'unknown' && requests.length === 2 ? {} : { usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40, prompt_cache_hit_tokens: 5 } }) };
    return new Response(`data: ${JSON.stringify(body)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const factory = createRoleFactory({ env: { DEEPSEEK_API_KEY: 'offline-key' }, maxRequests: 3, maxOutputTokens: 1000, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 1000, compactionKeepRecentTokens: 0 });
  const role = await factory({ role: 'coding', task, requirement: requirementFixture() as RequirementContract, workspace, stateDirectory: join(root, 'session'), controller });
  t.after(async () => { await role.close(); fetchMock.mock.restore(); await controller.close(); await rm(root, { recursive: true, force: true }); });
  await role.prompt('记录长上下文');
  assert.equal(typeof role.compact, 'function', 'host role must expose the existing native compaction boundary');
  if (outcome === 'unknown') await assert.rejects(role.compact!()); else { await role.compact!(); await role.prompt('根据压缩上下文继续'); }
  // A split-turn SDK summary need not repeat the host system packet. The packet
  // is independently reattached to ordinary requests, so summary text cannot
  // drop or grant authority on the resumed task.
  for (const token of ['AC-1', 'requirements/v1.json', '保留原失败', 'writePaths', 'ledger-1', task.budget.originalDeadlineAt]) {
    assert.ok(JSON.stringify(requests[0].messages).includes(token), `original authority contains ${token}`);
    if (outcome === 'settled') assert.ok(JSON.stringify(requests[2].messages).includes(token), `post-compaction authority preserves ${token}`);
  }
  const snapshot = await controller.read();
  assert.equal(snapshot.ledger.entries.length, outcome === 'settled' ? 3 : 2);
  assert.ok(snapshot.ledger.entries.every(entry => entry.taskId === task.taskId));
  assert.equal(snapshot.run.fees.settledMicroCny, outcome === 'settled' ? 393 : 131);
  assert.equal(snapshot.run.fees.reservedMicroCny, outcome === 'settled' ? 0 : 1000);
  if (outcome === 'settled') assert.ok(JSON.stringify(requests[2].messages).includes('保留原失败'));
  else await assert.rejects(role.prompt('不能盲目继续'));
  await controller.stop('test'); await assert.rejects(role.compact!());
});
