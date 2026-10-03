import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validationRunFixture } from './validation-run.fixture.ts';
import { offlineNativeFixture } from './validation-native.fixture.ts';
import { generateValidationCase } from '../../probes/e2e/validation-driver.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { createValidationIdentityReader } from '../../probes/e2e/validation-identity.ts';
import { requestReservation } from '../../probes/e2e/admission.ts';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';

// A fresh synthetic core claim avoids historical request-count loops. No API, real case, browser or compiler.
for (const optIn of [false, true]) test(`native driver preserves explicit author policy through coding repair: optIn=${optIn}`, async t => {
  const f = await validationRunFixture(t, { caseOne: 'absent', caseTwo: 'absent' });
  const identityReader = createValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader };
  const quote = await prepareValidationCase({ ...context, declaration: VALIDATION_CASE });
  const decision = { kind: 'operator_validation' as const, decisionId: 'offline-author-format', actorId: 'offline-operator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'offline-operator', version: 'v1', location: 'offline-author-format.json' }, sourceRefs: [{ artifactId: 'offline-only', version: 'v1', location: 'generatedByCosmos:false' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId: window.caseId, windowId: window.windowId });
  const work = new OwnedWork(controller.signal);
  try {
  await mkdir(f.caseRoot, { recursive: true });
  const input = { repository: f.repository, ledgerRoot: f.ledgerRoot, root: f.caseRoot, controller, window, work, signal: work.signal };
  const native = JSON.parse(await readFile(new URL('../roles/fixtures/native-author-handoff.json', import.meta.url), 'utf8'));
  const fixture = offlineNativeFixture(input); let formats = 0;
  const sessionFactory = async (config: PiSessionOptions) => {
    const role = await fixture.sessionFactory(config), packet = JSON.parse(config.context);
    if (packet.role !== 'design' || !optIn) return role;
    return { ...role, async prompt(text: string, supplied = {}) { await role.prompt(text, supplied); return { text: native.reply }; },
      async readonlyPrompt(_text: string, supplied: { signal?: AbortSignal } = {}) {
        supplied.signal?.throwIfAborted(); formats++;
        const request = { requestId: 'offline-format', modelId: 'deepseek-flash' as const, maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false };
        await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: requestReservation(request) });
        await config.budget.afterResponse({ requestId: request.requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        return { text: native.reply.slice(native.reply.indexOf('\n\n') + 2) };
      } };
  };
  const result = optIn ? await generateValidationCase(input, fixture.io, sessionFactory, { authorProtocolCorrections: 1 }) : await generateValidationCase(input, fixture.io, sessionFactory);
  assert.equal(result.outcome, 'passed'); assert.equal(formats, optIn ? 1 : 0);
  const state = await controller.read();
  assert.equal(state.requests.filter(request => request.validation).length, optIn ? 10 : 9);
  assert.equal(state.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0), 1_116_402 + (optIn ? 100 : 90));
  const repair = state.tasks.find(task => task.taskId.endsWith('-repair'))!;
  assert.equal(repair.state, 'passed'); assert.equal(repair.attempts.length, 1);
  for (const role of ['design', 'coding', 'repair']) {
    const origin = JSON.parse(await readFile(join(f.caseRoot, `journal/task-${window.caseId}-${role}/origin.json`), 'utf8'));
    assert.equal(Object.hasOwn(origin, 'authorProtocolCorrections'), optIn);
    if (optIn) assert.equal(origin.authorProtocolCorrections, 1);
  }
  if (optIn) {
    const charge = state.requests.find(request => request.requestId === 'offline-format')!;
    assert.equal(charge.validation?.purpose, 'author'); assert.equal(charge.validation?.caseId, window.caseId); assert.equal(charge.validation?.windowId, window.windowId);
  }
  } finally { await work.cancelAndDrain('offline test cleanup'); await controller.close(); }
});
