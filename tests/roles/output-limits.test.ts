import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { AuthorRole, Role } from '../../src/roles/factory.ts';
import type { PiRequest } from '../../src/providers/pi.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

const authorMaxOutputTokens = { art: 65536, coding: 65536, cosmos: 32768 };
for (const sample of [
  { role: 'art', cap: 65536 }, { role: 'coding', cap: 65536 }, { role: 'design', cap: 8192 },
  { role: 'cosmos', cap: 32768 }, { role: 'cosmos', purpose: 'planning', cap: 8192 }, { role: 'reviewer', cap: 8192 },
  { role: 'art', legacy: true, cap: 16384 },
  { role: 'art', denied: true, cap: 65536 },
] as { role: Role; purpose?: 'planning'; legacy?: boolean; denied?: boolean; cap: number }[]) {
  test(`native output cap and reservation: ${JSON.stringify(sample)}`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'cosmos-role-limit-'));
    const requirement = requirementFixture() as RequirementContract, task = taskFixture() as TaskContract;
    const allocation = sample.denied ? 1000 : 3_000_000;
    const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
      specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: allocation, allocations: [{ taskId: task.taskId, amountMicroCny: allocation }] });
    task.budget = { ...task.budget, allocationMicroCny: allocation, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
    let requests = 0, estimated: Omit<PiRequest, 'estimatedMaxCostMicroCny'> | undefined;
    const fetchMock = mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
      requests++;
      const request = input instanceof Request ? input : new Request(input, init);
      const body = JSON.parse(await request.text());
      assert.equal(body.max_tokens, sample.cap);
      assert.equal(estimated!.maxOutputTokens, sample.cap);
      const state = await controller.read();
      assert.equal(state.ledger.entries.length, 1);
      assert.equal(state.ledger.entries[0].reservedMicroCny, estimated!.inputBytes * 2 + sample.cap * 8);
      assert.equal(state.requests.length, 1, 'Admission must precede the provider side effect');
      const chunk = { id: 'offline-reply', model: 'deepseek-flash', choices: [{ index: 0, delta: { content: 'Complete' }, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    });
    let session: Awaited<ReturnType<ReturnType<typeof createRoleFactory>>> | undefined;
    t.after(async () => { await session?.close(); fetchMock.mock.restore(); await controller.close(); await rm(root, { recursive: true, force: true }); });
    const factory = createRoleFactory({ maxOutputTokens: sample.legacy ? 16384 : 8192,
      ...(sample.legacy ? {} : { authorMaxOutputTokens }), maxRequests: 1, requestTimeoutMs: 1000, env: { DEEPSEEK_API_KEY: 'offline-role-cap' },
      estimatedMaxCostMicroCny: request => { estimated = request; return request.inputBytes * 2 + request.maxOutputTokens * 8; } });
    session = await factory({ role: sample.role, purpose: sample.purpose, task, requirement, workspace: root, stateDirectory: join(root, 'session'), controller });
    if (sample.denied) {
      await assert.rejects(session.prompt('Work within the declared scope'), { code: 'admission_rejected' });
      assert.equal(requests, 0); assert.equal(estimated!.maxOutputTokens, sample.cap);
    } else {
      await session.prompt('Work within the declared scope');
      assert.equal(requests, 1); assert.equal((await controller.read()).ledger.entries[0].status, 'settled');
    }
  });
}

test('invalid author limits fail before a session or host tool can be created', () => {
  for (const value of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => createRoleFactory({ maxOutputTokens: 8192, authorMaxOutputTokens: { art: value }, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100 }), /authorMaxOutputTokens/);
  }
  assert.throws(() => createRoleFactory({ maxOutputTokens: 8192, authorMaxOutputTokens: { reviewer: 65536 } as Partial<Record<AuthorRole, number>>, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100 }), /authorMaxOutputTokens/);
});
