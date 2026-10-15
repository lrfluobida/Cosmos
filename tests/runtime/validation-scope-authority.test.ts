import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { requireValidationScope } from '../../src/runtime/validation-scope.ts';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Real small controller and file authority; no SDK, browser or historical request replay. */
async function fixture(t: TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'cos95-scope-')), root = join(base, 'ledger'), repositoryRoot = join(base, 'platform');
  const controllers: RunController[] = [];
  t.after(async () => {
    for (const controller of controllers) await controller.close();
    assert.equal(dirname(resolve(base)), resolve(tmpdir())); assert.ok(basename(base).startsWith('cos95-scope-'));
    await rm(base, { recursive: true, force: true });
  });
  let clock = Date.now() - 2000;
  const now = () => clock;
  const old = await RunController.create({ root, runId: 'scope-run', ledgerId: 'scope-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0',
    durationMs: 1000, now, allocations: [{ taskId: 'legacy', amountMicroCny: 1_000_000 }] });
  controllers.push(old);
  await old.importSettled({ requestId: 'prior', taskId: 'legacy', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 100,
    evidence: [{ artifactId: 'prior', version: 'v1', location: 'prior.json' }] });
  const original = await old.read(); await old.close(); clock += 2000;
  await mkdir(join(repositoryRoot, 'template'), { recursive: true });
  const requirements = JSON.stringify({ specVersion: '1.0', requirementVersion: 'fixture-v1', acceptanceIds: ['game-1'], stageAcceptanceIds: ['design-1', 'media-1'], rule: '保留固定验收' });
  const template = '{"fixture":true}\n', sourcePath = join(repositoryRoot, 'requirements.json');
  await writeFile(sourcePath, requirements, 'utf8'); await writeFile(join(repositoryRoot, 'template/package.json'), template, 'utf8');
  const files = [{ path: 'template/package.json', sha256: hash(template) }], caseId = 'cos20-scope-authority';
  const declaration: ValidationDeclaration = {
    formatVersion: 'validation-declaration-1', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
    limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000, durationMs: 2_700_000, maxRequests: 40, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
    grants: {
      planning: { taskId: `${caseId}-planning`, amountMicroCny: 2_000_000 },
      design: { taskId: `${caseId}-design`, amountMicroCny: 1_900_000 },
      art: { taskId: `${caseId}-art`, amountMicroCny: 5_700_000 },
      coding: { taskId: `${caseId}-coding`, amountMicroCny: 7_600_000 },
      repair: { taskId: `${caseId}-repair`, amountMicroCny: 3_800_000 },
    },
    outputTokens: { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 },
    inputs: { requirements: { version: 'fixture-v1', path: 'requirements.json', sha256: hash(requirements) }, template: { sha256: hash(JSON.stringify(files)), files } },
  };
  const identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(declaration) };
  const context = { root, repositoryRoot, identityReader: async () => ({ ...identity }), now };
  const quote = await prepareValidationCase({ ...context, declaration });
  const decision = { kind: 'operator_validation' as const, decisionId: 'scope-decision', actorId: 'offline-operator', decidedAt: new Date(now()).toISOString(),
    source: { artifactId: 'operator', version: 'v1', location: 'operator.json' }, sourceRefs: [{ artifactId: 'source', version: 'fixture-v1', location: 'requirements.json' }] };
  const operatorPath = join(root, decision.source.location);
  await writeFile(operatorPath, JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId, windowId: window.windowId }); controllers.push(controller);
  const requirement = createValidationRequirement({ specVersion: '1.0', sources: decision.sourceRefs,
    acceptance: [{ acceptanceId: 'game-1', description: '固定验收', steps: ['读取固定输入'], expected: '原始字节保持', evidenceKinds: ['test_report'] }],
    validation: { runId: original.run.runId, ledgerId: original.ledger.ledgerId, caseId, windowId: window.windowId, ...identity, decision } });
  let reads = 0;
  const binding = { caseId, windowId: window.windowId, readScope: async (signal: AbortSignal) => {
    signal.throwIfAborted(); reads++;
    assert.equal(hash(await readFile(sourcePath)), declaration.inputs.requirements.sha256, 'Fixed source bytes changed');
    const operatorReceipt = await readFile(operatorPath); signal.throwIfAborted();
    return { requirement, operatorReceipt };
  } };
  return { controller, binding, requirement, window, original, declaration, context, sourcePath, operatorPath,
    now, advance: (ms: number) => { clock += ms; }, reads: () => reads };
}

test('scope clones one full snapshot and one isolated authority view', async t => {
  const f = await fixture(t), clone = globalThis.structuredClone, inputs: string[][] = [];
  let fullCopies = 0;
  const observer = t.mock.method(globalThis, 'structuredClone', <T>(value: T, options?: Parameters<typeof clone>[1]): T => {
    if (typeof value === 'object' && value !== null) {
      inputs.push(Object.keys(value));
      if ('formatVersion' in value && 'run' in value && 'ledger' in value && 'tasks' in value && 'requests' in value && 'events' in value) fullCopies++;
    }
    return clone(value, options);
  });
  try { await requireValidationScope(f.controller, f.requirement, f.binding); }
  finally { observer.mock.restore(); }
  t.diagnostic(JSON.stringify({ fullCopies, cloneInputs: inputs }));
  assert.equal(fullCopies, 1, 'A scope call must copy the full snapshot only after the trusted reader');
  assert.deepEqual(inputs, [['runId', 'specVersion', 'ledgerId', 'window'], Object.keys(await f.controller.read())]);
  assert.equal(f.reads(), 1);
});
