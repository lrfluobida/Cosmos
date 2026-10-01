import { appendFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createArtifactRegistry } from '../../../src/artifacts/index.ts';
import { RunController } from '../../../src/runtime/run.ts';
import { createRoleBudget } from '../../../src/roles/provider-budget.ts';
import { requirement as requirementFixture, task as taskFixture } from '../../contracts/fixtures.ts';
import type { RequirementContract, TaskContract, EvidenceContract } from '../../../src/contracts/types.ts';
import type { DagOptions } from '../../../src/runtime/orchestrator.ts';

export const time = Date.parse('2026-10-01T01:00:00.000Z');
export async function dagFixture(root: string, create = false, crash = '', clock = () => time) {
  const workspace = join(root, 'game'), reviewWorkspace = join(root, 'review');
  if (create) {
    await mkdir(join(workspace, 'requirements'), { recursive: true }); await mkdir(join(workspace, 'authors/code'), { recursive: true }); await mkdir(reviewWorkspace);
    await writeFile(join(workspace, 'requirements/v1.json'), '{"要求":"正常输入启动"}\n', 'utf8');
  }
  const controller = create ? await RunController.create({ root: join(root, 'state'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'code', amountMicroCny: 800 }], now: clock }) : await RunController.open({ root: join(root, 'state'), now: clock });
  const requirement = requirementFixture() as RequirementContract;
  const registry = await createArtifactRegistry({ workspaceRoot: workspace, registryRoot: '.registry', signal: controller.signal });
  const output = registry.artifactRef('game', 'v1');
  const task = taskFixture() as TaskContract;
  Object.assign(task, { taskId: 'code', state: 'not_started', dependsOn: [], attempts: [], evidence: [], artifacts: [], ownership: { writePaths: ['authors/code'], readOnlyPaths: ['requirements'] }, outputs: [{ type: 'game', schema: 'game/1', destination: output.location }], handoff: { completed: [], remaining: [], uncertainty: [], resumeFrom: null } });
  task.context.tools = ['read', 'write']; task.budget = { ledgerId: 'ledger-1', allocationMicroCny: 800, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
  const log = async (event: string) => appendFile(join(root, 'calls.jsonl'), JSON.stringify(event) + '\n', 'utf8');
  const die = (point: string) => { if (crash === point) process.exit(23); };
  const controlled = crash ? new Proxy(controller, { get(target, key) {
    if (key === 'registerTasks') return async (tasks: TaskContract[]) => { await target.registerTasks(tasks); die('registered'); };
    if (key === 'saveTask') return async (value: TaskContract, actor: any) => {
      const committing = value.state === 'awaiting_review' && value.attempts.at(-1)?.outcome === 'passed';
      if (committing) die('review-commit'); await target.saveTask(value, actor); if (committing) die('verdict-saved');
    };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } }) : controller;
  const options: DagOptions = {
    controller: controlled, requirement, tasks: [{ task, role: 'coding', workspace, expectedArtifacts: [output] }], sessionRoot: join(root, 'sessions'), availableArtifacts: task.inputs, now: clock, reviewProtocolCorrections: 1,
    recovery: { journalRoot: join(root, 'recovery'), artifactRoot: workspace, recoverCapture: async recovering => {
      const capture = await registry.getCapture(output).catch(() => null);
      if (!capture || capture.taskId !== recovering.taskId || capture.dependencies.length !== 0 || capture.metadata.provenance.sourceRefs[0] !== recovering.attempts[0].sessionRef) return null;
      return { artifacts: [output], reviewWorkspace };
    } },
    roleFactory: async input => {
      if (input.role === 'reviewer') die('before-review');
      const budget = createRoleBudget({ controller, taskId: task.taskId, evidenceDirectory: input.stateDirectory });
      let calls = 0;
      return { actorId: input.role === 'reviewer' ? 'reviewer-1' : task.authorId, contextId: input.role === 'reviewer' ? 'review-context' : task.context.contextId,
        async close() {}, async prompt() {
          calls++; const role = input.role === 'reviewer' ? 'review' : 'author'; await log(role);
          const requestId = `${role}-${calls}`;
          await budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: 10, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 100 });
          die('unknown-lost');
          await budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
          if (role === 'author') { await writeFile(join(workspace, 'authors/code/main.ts'), '// 原创结果\n', 'utf8'); die('author-lost'); return { text: JSON.stringify({ summary: '生成完成', remaining: [], uncertainty: [] }) }; }
          die('review-lost'); if (crash === 'correction-lost' && calls === 2) process.exit(23);
          return { text: JSON.stringify({ verdict: 'approved', inputVersions: [...input.task.inputs, ...input.task.artifacts], evidenceIds: input.task.evidence.map(e => e.evidenceId), findings: crash === 'correction-lost' && calls === 1 ? ['Positive review summary'] : [] }) };
        } };
    },
    capture: async current => {
      await log('capture'); die('before-capture');
      await registry.registerCapture({ taskId: current.taskId, artifactRef: output, sourceRoot: 'authors/code', files: [{ source: 'main.ts', destination: 'main.ts' }], ownership: { writePaths: ['main.ts'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'offline fixture', sourceRefs: [current.attempts[0].sessionRef] } } });
      die('after-capture'); return { artifacts: [output], reviewWorkspace };
    },
    verify: async current => {
      await log('verify'); await mkdir(join(workspace, 'evidence'), { recursive: true }); await writeFile(join(workspace, 'evidence/report.json'), '{"passed":true}\n', 'utf8');
      const evidence: EvidenceContract[] = [{ contractVersion: '1.0.0', evidenceId: 'host', taskId: current.taskId, acceptanceIds: current.acceptanceIds, kind: 'test_report', source: { artifactId: 'report', version: 'v1', location: 'evidence/report.json' }, artifactVersions: [...current.inputs, ...current.artifacts], outcome: 'passed', recordedAt: new Date(clock()).toISOString(), summary: '离线宿主证据' }];
      for (const reference of [...current.inputs, ...current.artifacts, ...evidence.map(e => e.source)]) { const target = join(reviewWorkspace, reference.location); await mkdir(dirname(target), { recursive: true }); await cp(join(workspace, reference.location), target, { recursive: true }); }
      die('after-verify');
      return evidence;
    },
  };
  return { root, workspace, controller, options, output, calls: async () => { const data = await readFile(join(root, 'calls.jsonl'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }); return data.trim() ? data.trim().split('\n').map(line => JSON.parse(line) as string) : []; } };
}
