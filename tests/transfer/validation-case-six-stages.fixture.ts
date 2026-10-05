import assert from 'node:assert/strict';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stageTransferValidationCaseFiveInput } from '../../probes/transfer/validation-driver.ts';
import { createTransferConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import { syntheticMap, ids } from './runtime-host.fixture.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';

/** Fake SDK transport through real factories; every file is SOURCE/TEMP and no target game is claimed. */
export function syntheticTransferSessions(calls: { role: string; taskId: string; context: any; tools: string[] }[],
  oldFees?: { input: ValidationHostInput; design: number; art: number }) {
  let sequence = 0;
  return async (config: any) => {
    const packet = JSON.parse(config.context); calls.push({ role: packet.role, taskId: packet.taskId, context: packet, tools: config.tools.map((tool: any) => tool.name) });
    return { close: async () => {}, prompt: async () => {
      const requestId = `SOURCE-${packet.taskId}-${packet.role}-${++sequence}`;
      if (oldFees) {
        const role = packet.taskId.endsWith('-design') ? 'design' : 'art', review = packet.role === 'reviewer', count = review ? 1 : role === 'design' ? 19 : 14;
        let remaining = review ? 1 : oldFees[role] - 1;
        for (let index = 0; index < count; index++) {
          const amount = Math.floor(remaining / (count - index)); remaining -= amount; const id = `${requestId}-${index}`;
          await oldFees.input.controller.reserve({ requestId: id, taskId: packet.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01',
            estimatedMaxCostMicroCny: Math.max(amount, 200 + config.maxOutputTokens * 8), validation: { caseId: oldFees.input.window.caseId,
              windowId: oldFees.input.window.windowId, purpose: review ? 'reviewer' : 'author', modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false } });
          await oldFees.input.controller.admit(id); await oldFees.input.controller.settle(id, amount, [{ artifactId: id, version: 'v1', location: 'SOURCE synthetic SDK transport' }]);
        }
      } else {
      await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false,
        estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      }
      if (packet.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId),
        ...(packet.codingConcernReview ? { concernResolutions: packet.codingConcernReview.concerns.map((concern: any) => ({ concernId: concern.concernId, concernText: concern.text,
          status: 'resolved', basis: 'host_evidence', rationale: 'SOURCE transport cites the actual current host records; no target game claim.',
          acceptanceIds: packet.acceptance.map((item: any) => item.acceptanceId), inputVersions: packet.inputs,
          evidenceIds: packet.evidence.map((item: any) => item.evidenceId), evidenceRefs: packet.evidence.map((item: any) => item.source) })) } : {}) }) };
      if (packet.role === 'design') {
        const design = { summary: '合成接口设计', implementationNotes: ['固定需求与地图'], acceptanceMapping: Object.fromEntries(ids.map((id: string) => [id, '保持固定玩法'])),
          characters: [{ id: 'marker', purpose: '合成接口媒体', states: ['idle'] }], audio: [] };
        await writeFile(join(config.workspace, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
        const ref = packet.inputs.find((item: any) => item.artifactId.endsWith('-requirement-bundle'));
        await writeFile(join(config.workspace, 'authors/design/transfer-design.json'), JSON.stringify(syntheticMap(ref)), 'utf8');
        await config.tools.find((tool: any) => tool.name === 'validate-transfer-design').execute('SOURCE-design-check', {}, undefined, undefined, undefined);
      } else if (packet.role === 'art') await writeFile(join(config.workspace, 'authors/art/media.json'), JSON.stringify({ characters: [{ id: 'marker', width: 32, height: 32,
        anchor: { x: 16, y: 16 }, layers: [{ id: 'body', shape: 'rect', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }],
        states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] }), 'utf8');
      else if (packet.role === 'coding') {
        await mkdir(join(config.workspace, 'authors/coding/src'), { recursive: true });
        await writeFile(join(config.workspace, 'authors/coding/index.html'), '<p>合成接口</p>', 'utf8');
        await writeFile(join(config.workspace, 'authors/coding/src/main.ts'), '// 合成接口，无目标游戏\n', 'utf8');
      } else throw new Error('SOURCE fixture forbids a planner session.');
      return { text: JSON.stringify({ summary: 'SOURCE synthetic transport', remaining: [], uncertainty: [] }) };
    } };
  };
}
/** Genuine original identities/receipts under the actual synthetic C5 window, before its stop/closure. */
export async function genuineCaseFiveStages(input: ValidationHostInput, fees: { design: number; art: number }) {
  await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
  const { requirement, binding: validation, proposal } = await stageTransferValidationCaseFiveInput(input), calls: Parameters<typeof syntheticTransferSessions>[0] = [];
  const host = await createTransferConsumerHost({ root: input.root, controller: input.controller, requirement, validation, proposal, work: input.work, resume: false,
    sessionFactory: syntheticTransferSessions(calls, { input, ...fees }), io: { build: async () => { throw new Error('Old C5 code is never built.'); }, play: async () => { throw new Error('Old C5 code is never played.'); } } });
  const state = await input.controller.read(), policies = host.taskPolicies;
  const refs = (policy: typeof policies[number]) => policy.outputs.map(output => ({ artifactId: output.artifactId, version: output.version, location: output.destination }));
  const tasks: PreparedTask[] = policies.map((policy, index) => {
    const task = taskFixture() as TaskContract, acceptanceIds = index < 2 ? [requirement.acceptance[6 + index].acceptanceId] : input.window.quote.requirements.acceptanceIds;
    Object.assign(task, { taskId: input.window.quote.declaration.grants[policy.role as 'design' | 'art' | 'coding'].taskId, runId: state.run.runId, kind: 'evaluation', specVersion: '1.0',
      authorId: `SOURCE-C5-${policy.role}`, objective: 'SOURCE genuine staged transport', acceptanceIds,
      dependsOn: policies.slice(0, index).map(prior => ({ taskId: input.window.quote.declaration.grants[prior.role as 'design' | 'art' | 'coding'].taskId, requiredState: 'passed', state: 'not_started' })),
      inputs: [...host.availableArtifacts, ...policies.slice(0, index).flatMap(refs)],
      context: { contextId: `SOURCE-C5-${policy.role}-context`, rules: policy.rules ?? [], interfaces: policy.interfaces ?? [], knownFailures: [], tools: policy.tools },
      ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths }, outputs: policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination })),
      acceptance: requirement.acceptance.filter(item => acceptanceIds.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: [`evidence/${policy.role}.json`] })),
      budget: { ledgerId: state.ledger.ledgerId, allocationMicroCny: policy.allocationMicroCny, originalDeadlineAt: state.run.originalDeadlineAt },
      state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: ['SOURCE stage'], uncertainty: [], resumeFrom: null },
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    return { task, role: policy.role, workspace: policy.workspace, expectedArtifacts: refs(policy) };
  });
  await host.bindPreparedTasks(tasks);
  const recovery = { artifactRoot: input.root, journalRoot: join(input.root, 'journal'), recoverCapture: host.recoverCapture };
  const result = await host.withPreparation(() => executeTaskDag({ controller: input.controller, requirement, validation, tasks: tasks.slice(0, 2),
    sessionRoot: join(input.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory, preAuthor: host.preAuthor,
    capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, recovery, reviewProtocolCorrections: 1, authorProtocolCorrections: 1 }));
  assert.deepEqual(result.map(task => task.state), ['passed', 'passed']);
  return { root: input.root, requirement, window: input.window, availableArtifacts: host.availableArtifacts, result, recovery,
    registry: await createArtifactRegistry({ workspaceRoot: input.root, registryRoot: 'registry' }), coding: tasks[2], calls };
}
