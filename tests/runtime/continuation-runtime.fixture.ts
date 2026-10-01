import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type test from 'node:test';
import { task as taskFixture, requirement as requirementFixture } from '../contracts/fixtures.ts';
import type { EvidenceContract, RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { RunController } from '../../src/runtime/run.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { DagOptions, PreparedTask } from '../../src/runtime/orchestrator.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';

/** Offline contract fixture only: no API, compiler, browser or generated game. */
export async function runtimeFixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-window-runtime-'));
  let time = Date.now() - 13 * 60 * 60 * 1000; const now = () => time;
  const requirement = requirementFixture() as RequirementContract;
  requirement.acceptance = ['design', 'code'].map(role => ({ acceptanceId: `AC-${role}`, description: `Offline ${role} fixture`, steps: ['Read the fixed fixture'], expected: 'Fixture check passes', evidenceKinds: ['test_report'] }));
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry' });
  let controller = await RunController.create({ root, runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: requirement.specVersion,
    scope: 'generation', limitMicroCny: 10_000, allocations: [{ taskId: 'design-task', amountMicroCny: 1_000 }, { taskId: 'code-task', amountMicroCny: 1_000 }], now });
  t.after(async () => { await controller.close().catch(() => {}); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'requirements')); await writeFile(join(root, 'requirements/v1.json'), JSON.stringify(requirement), 'utf8');
  const started = await controller.read(), calls: string[] = [], packets: any[] = [];
  const originals: PreparedTask[] = ['design', 'code'].map(role => {
    const task = taskFixture() as TaskContract, output = registry.artifactRef(role, 'v1');
    Object.assign(task, { taskId: `${role}-task`, authorId: `author-${role}`, objective: `Offline ${role} fixture`,
      context: { contextId: `context-${role}`, rules: ['保留原验收'], interfaces: [], knownFailures: [], tools: [] },
      acceptanceIds: [`AC-${role}`], acceptance: requirement.acceptance.filter(item => item.acceptanceId === `AC-${role}`).map(item => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: [`evidence/${role}.json`] })),
      inputs: [...requirement.sources, ...(role === 'code' ? [registry.artifactRef('design', 'v1')] : [])],
      dependsOn: role === 'code' ? [{ taskId: 'design-task', requiredState: 'passed', state: 'not_started' }] : [],
      ownership: { writePaths: [`authors/${role}`], readOnlyPaths: ['requirements', 'registry'] },
      outputs: [{ type: 'fixture', schema: 'offline/1', destination: output.location }],
      budget: { ledgerId: started.ledger.ledgerId, allocationMicroCny: 1_000, originalDeadlineAt: started.run.originalDeadlineAt },
      state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] },
      handoff: { completed: [], remaining: ['Offline fixture'], uncertainty: [], resumeFrom: null } });
    return { task, role: role === 'design' ? 'design' : 'coding', workspace: root, expectedArtifacts: [output] };
  });
  let sequence = 0;
  const roleFactory = createRoleFactory({ maxOutputTokens: 8192, maxRequests: 4, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 20,
    sessionFactory: async config => {
      const packet = JSON.parse(config.context); packets.push(packet); let answers = 0;
      return { close: async () => {}, prompt: async () => {
        calls.push(`${packet.role}:${packet.taskId}`); const requestId = `fixture-${++sequence}`;
        await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 10, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 20 });
        await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        const value = packet.role !== 'reviewer' ? { summary: 'Offline scoped fixture', remaining: [], uncertainty: [] }
          : { verdict: 'approved', inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId), findings: packet.taskId.startsWith('cont-') && ++answers === 1 ? ['Positive statement in the wrong field'] : [] };
        return { text: JSON.stringify(value) };
      } };
    },
  });
  const reference = (task: TaskContract) => ({ artifactId: task.acceptanceIds[0] === 'AC-design' ? 'design' : 'code',
    version: task.taskId.startsWith('cont-') ? 'continued-v1' : 'v1', location: task.outputs[0].destination });
  const recovery = { journalRoot: join(root, 'journal'), artifactRoot: root, recoverCapture: async (task: TaskContract) => {
    try {
      const capture = await registry.getCapture(reference(task));
      if (capture.taskId !== task.taskId || !capture.metadata.provenance.sourceRefs.includes(task.attempts.at(-1)!.sessionRef)) return null;
      return { artifacts: [reference(task)], reviewWorkspace: join(root, `reviews/${task.taskId}`) };
    } catch { return null; }
  } };
  const callbacks: Pick<DagOptions, 'roleFactory' | 'capture' | 'verify'> = { roleFactory,
    capture: async task => {
      calls.push(`capture:${task.taskId}`); const sourceRoot = `authored/${task.taskId}`; await mkdir(join(root, sourceRoot), { recursive: true });
      await writeFile(join(root, sourceRoot, 'fixture.txt'), `Offline fixed output ${task.taskId}`, 'utf8');
      await registry.registerCapture({ taskId: task.taskId, artifactRef: reference(task), sourceRoot, files: [{ source: 'fixture.txt', destination: 'fixture.txt' }],
        ownership: { writePaths: ['fixture.txt'], readOnlyPaths: [] }, dependencies: task.inputs.filter(ref => ref.artifactId === 'design'),
        metadata: { kind: 'data', provenance: { kind: 'original-procedural', generator: 'Offline host fixture', sourceRefs: [task.attempts.at(-1)!.sessionRef] } } });
      const reviewWorkspace = join(root, `reviews/${task.taskId}`); await mkdir(reviewWorkspace, { recursive: true }); return { artifacts: [reference(task)], reviewWorkspace };
    },
    verify: async task => {
      calls.push(`build:${task.taskId}`); calls.push(`browser:${task.taskId}`);
      const source = { artifactId: `${task.taskId}-report`, version: 'v1', location: `evidence/${task.taskId}.json` };
      await mkdir(join(root, 'evidence'), { recursive: true }); await writeFile(join(root, source.location), JSON.stringify({ fakeBuild: true, fakeBrowser: true, taskId: task.taskId }), 'utf8');
      return [{ contractVersion: '1.0.0', evidenceId: `${task.taskId}-check`, taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report', source,
        artifactVersions: [...task.inputs, ...task.artifacts], outcome: task.taskId === 'code-task' ? 'failed' : 'passed', recordedAt: new Date(now()).toISOString(), summary: 'Offline host fixture only' }] as EvidenceContract[];
    },
  };
  const common = { requirement, sessionRoot: join(root, 'sessions'), availableArtifacts: requirement.sources, reviewProtocolCorrections: 1 as const, recovery, now, ...callbacks };
  const result = await executeTaskDag({ ...common, controller, tasks: originals });
  assert.deepEqual(result.map(task => task.state), ['passed', 'failed']); await controller.stop('Original fixture stopped before explicit authorization');
  const original = await controller.read(); await controller.close(); time += 13 * 60 * 60 * 1000;
  const quote = await buildContinuationQuote({ root, additionalMicroCny: 1_000, additionalDurationMs: 60_000, now: now() });
  const confirmation = { decisionId: 'runtime-decision', actorId: 'offline-user', decidedAt: new Date(now()).toISOString(), source: { artifactId: 'continuation-confirmation', version: 'v1', location: 'confirmation.json' } };
  await writeFile(join(root, confirmation.source.location), JSON.stringify({ formatVersion: 'continuation-confirmation-1', ...confirmation, source: undefined, confirmed: true, quote }), 'utf8');
  const window = await RunController.activateContinuation({ root, quote, confirmation, now });
  controller = await RunController.open({ root, windowId: window.windowId, now });
  const grant = window.grants[0], task = structuredClone(originals[1].task), workspace = join(root, 'continued-workspace'); await mkdir(workspace);
  task.taskId = grant.taskId; task.authorId = 'new-author'; task.context.contextId = 'new-context'; task.budget.allocationMicroCny = grant.amountMicroCny;
  const ref = registry.artifactRef('code', 'continued-v1'); task.outputs[0].destination = ref.location;
  const next: PreparedTask = { ...originals[1], task, workspace, expectedArtifacts: [ref] };
  const binding = { windowId: window.windowId, decisionId: window.decisionId, quoteId: quote.quoteId, startedAt: window.startedAt, deadlineAt: window.deadlineAt,
    effectiveLimitMicroCny: quote.proposed.totalLimitMicroCny };
  await TaskJournal.open(recovery, { formatVersion: 2, runId: original.run.runId, ledgerId: original.ledger.ledgerId, originalStartedAt: original.run.originalStartedAt,
    originalDeadlineAt: original.run.originalDeadlineAt, limitMicroCny: original.ledger.limitMicroCny, requirement, prepared: next, reviewProtocolCorrections: 1,
    artifactRoot: root, sessionRoot: common.sessionRoot, executionWindow: binding } as any, false);
  await controller.registerTasks([next.task]);
  const options = () => ({ ...common, controller, tasks: [originals[0], next], scheduling: { maxParallel: 2 as const }, windowId: window.windowId });
  return { root, original, window, next, originals, packets, calls, options, controller, roleFactory, requirement, common,
    reopen: async () => { await controller.close(); controller = await RunController.open({ root, windowId: window.windowId, now }); },
    state: () => controller.read(), advance: (ms: number) => { time += ms; },
    originalTaskBytes: () => readFile(join(root, 'journal/task-design-task/origin.json'), 'utf8') };
}
