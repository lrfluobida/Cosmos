import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { deriveTransferValidationCaseSevenDeclaration } from '../../probes/transfer/validation-case-seven-declaration.ts';
import { caseSevenFeeData } from './validation-case-seven.fixture.ts';
const D = deriveTransferValidationCaseSevenDeclaration(caseSevenFeeData());
const { readTransferValidationInput: readTransferValidationCaseSevenInput } = fixedTransferValidationInput(D);
import { TRANSFER_VALIDATION_CASE_FIVE as OLD } from '../../probes/transfer/validation-case-five-declaration.ts';
import { run, ledger, passedTask } from '../contracts/fixtures.ts';

async function sourceData() {
  const input = await readTransferValidationCaseSevenInput(fileURLToPath(new URL('../../', import.meta.url)));
  const ref = (artifactId: string, version = 'v1') => ({ artifactId, version, location: `registry/captures/${artifactId}/${version}/files` });
  const sources = [ref(D.caseId + '-input')], identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: 'f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c' };
  const decision = { kind: 'operator_validation' as const, decisionId: 'SOURCE-only-decision', actorId: 'SOURCE-only', decidedAt: '2026-10-05T00:00:00.000Z',
    source: { artifactId: 'SOURCE-only-operator', version: 'v1', location: 'operator.json' }, sourceRefs: [ref('SOURCE-only-lineage')] };
  const requirement = createValidationRequirement({ specVersion: '1.0', sources, acceptance: input.requirements.preparation.acceptance,
    validation: { runId: 'SOURCE-only-run', ledgerId: 'SOURCE-only-ledger', caseId: D.caseId, windowId: 'SOURCE-only-C7-window', ...identity, decision } });
  const window = { caseId: D.caseId, windowId: requirement.validation.windowId, quote: { declaration: D, identity,
    requirements: { acceptanceIds: input.requirements.acceptanceIds, stageAcceptanceIds: input.requirements.stageAcceptanceIds } } };
  const state = { run: { ...run(), runId: requirement.validation.runId, kind: 'evaluation', specVersion: '1.0' },
    ledger: { ...caseSevenFeeData().ledger, ledgerId: requirement.validation.ledgerId }, requests: caseSevenFeeData().requests, tasks: [], validation: { currentCaseId: D.caseId, cases: [...caseSevenFeeData().validation!.cases, window] } };
  const availableArtifacts = [...sources, ref('SOURCE-only-template'), ref('SOURCE-only-old-requirement'), ref('SOURCE-only-current-plans', 'v1'), ref('SOURCE-only-current-plans-v2', 'v2')];
  const host = { availableArtifacts, taskPolicies: [{ policyId: 'game-code', role: 'coding', workspace: '/SOURCE-only-authors/coding',
    allocationMicroCny: D.grants.coding.amountMicroCny, writePaths: ['authors/coding/'], readOnlyPaths: ['registry/captures/'], tools: ['read', 'write', 'check-game-build'],
    rules: ['SOURCE-only current policy'], interfaces: [], outputs: [{ artifactId: D.caseId + '-game', version: 'v1', destination: `registry/captures/${D.caseId}-game/v1/files`, type: 'game', schema: 'game/1' }] }] };
  const historical = { stages: (['design', 'art'] as const).map(role => ({ role, task: { ...passedTask(), taskId: OLD.grants[role].taskId } })),
    designArtifacts: ['design', 'map', 'browser-plan', 'persistent-plan'].map(id => ref('SOURCE-only-old-' + id)), mediaArtifact: ref('SOURCE-only-old-media') };
  return { state, window, requirement, host, historical } as any;
}

test('derived case7 coding contract seals current role policy and exact inherited references without a planner', async () => {
  const a: any = await import('../../probes/transfer/validation-case-seven-task.ts').catch(() => null);
  assert.equal(typeof a?.deriveTransferValidationCaseSevenCodingTask, 'function', 'Current C7 coding task derivation is missing.');
  const input = await sourceData(), item = a.deriveTransferValidationCaseSevenCodingTask(input);
  assert.equal(item.role, 'coding'); assert.equal(item.task.taskId, D.grants.coding.taskId);
  assert.deepEqual(item.task.dependsOn, ['design', 'art'].map(role => ({ taskId: OLD.grants[role as 'design' | 'art'].taskId, requiredState: 'passed', state: 'passed' })));
  assert.deepEqual(item.task.inputs, [...input.host.availableArtifacts, ...input.historical.designArtifacts, input.historical.mediaArtifact]);
  assert.deepEqual(item.task.context.tools, ['read', 'write', 'check-game-build']);
  assert.equal(item.task.budget.allocationMicroCny, D.grants.coding.amountMicroCny); assert.equal(item.task.state, 'not_started'); assert.deepEqual(item.task.attempts, []);
  assert.deepEqual(item.task.acceptanceIds, input.window.quote.requirements.acceptanceIds);
  assert.deepEqual(a.deriveTransferValidationCaseSevenCodingTask(input), item);
  const wrong = structuredClone(input); wrong.window.caseId = OLD.caseId;
  assert.throws(() => a.deriveTransferValidationCaseSevenCodingTask(wrong), /current|fixed|declaration/);
  const planner = structuredClone(input); planner.host.taskPolicies.push({ ...planner.host.taskPolicies[0], role: 'cosmos' });
  assert.throws(() => a.deriveTransferValidationCaseSevenCodingTask(planner), /coding|policy/);
});

test('case7 execution receipt resumes exact current policy and bytes without rewriting or accepting drift', async t => {
  const a: any = await import('../../probes/transfer/validation-case-seven-task.ts');
  assert.equal(typeof a?.prepareTransferValidationCaseSevenExecution, 'function', 'Current C7 execution receipt sealing is missing.');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-C7-execution-'));
  t.after(async () => { assert.ok(resolve(root).startsWith(resolve(tmpdir()) + '\\')); await rm(root, { recursive: true, force: true }); });
  const input = { ...await sourceData(), root, capability: 'SOURCE-only consumer', signal: new AbortController().signal,
    manifestRef: { artifactId: D.caseId + '-historical-stages', version: 'b'.repeat(64), location: 'cos20-transfer-validation-7-reuse.json' } };
  const initial = await a.prepareTransferValidationCaseSevenExecution(input, false), path = join(root, 'execution-reused.json');
  const bytes = await readFile(path), info = await stat(path), receipt = JSON.parse(bytes.toString('utf8'));
  assert.equal(receipt.formatVersion, 'transfer-reused-execution/1'); assert.equal(receipt.caseId, D.caseId);
  assert.deepEqual(receipt.inheritedTaskIds, [OLD.grants.design.taskId, OLD.grants.art.taskId]);
  assert.deepEqual(receipt.tasks.map((item: any) => item.role), ['coding']);
  assert.deepEqual(await a.prepareTransferValidationCaseSevenExecution(input, true), initial);
  assert.deepEqual(await readFile(path), bytes); assert.equal((await stat(path)).mtimeMs, info.mtimeMs);
  const drift = structuredClone(input); drift.signal = input.signal; drift.host.taskPolicies[0].tools.pop();
  await assert.rejects(a.prepareTransferValidationCaseSevenExecution(drift, true), /execution|policy|changed/);
  assert.deepEqual(await readFile(path), bytes); assert.equal((await stat(path)).mtimeMs, info.mtimeMs);
  await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')]));
  await assert.rejects(a.prepareTransferValidationCaseSevenExecution(input, true), /execution|bytes|changed/);
});
