import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticTransferSessions } from './validation-case-six-stages.fixture.ts';

test('C6 fake reviewer supplies the current explicit coding concern schema after host evidence', async () => {
  const factory = syntheticTransferSessions([]), inputs = [{ artifactId: 'SOURCE-current', version: 'v2', location: 'SOURCE-current/v2' }];
  const session = await factory({ context: JSON.stringify({ role: 'reviewer', taskId: 'SOURCE-current-repair', inputs, evidence: [], codingConcernReview: { concerns: [] } }),
    maxOutputTokens: 2000, tools: [], budget: { beforeRequest: async () => {}, afterResponse: async () => {} } });
  const verdict = JSON.parse((await session.prompt()).text);
  assert.deepEqual(verdict.concernResolutions, [], 'The current explicit concern review schema is missing.');
  assert.deepEqual(verdict.inputVersions, inputs); assert.equal(verdict.verdict, 'approved'); await session.close();
});
