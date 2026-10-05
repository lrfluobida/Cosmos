import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import type { HostInput } from '../../src/runtime/entrypoint.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';

/** Actual planner/DAG/entrypoint; role output and host evidence are free fixtures. */
export async function completionFixture(t: test.TestContext, configure?: (input: HostInput) => Promise<(() => Promise<void>) | undefined>) {
  const root = await mkdtemp(join(tmpdir(), 'cos68-timing-'));
  let active: HostInput | undefined;
  t.after(async () => { await active?.work.cancelAndDrain('fixture cleanup').catch(() => {}); await active?.controller.close().catch(() => {}); await removeOwned(tmpdir(), root); });
  const intake = await IntakeController.create({ root, runId: 'timing-fixture', ledgerId: 'fixture-budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  const draft: any = { brief: '计时组件夹具', questions: [{ id: 'goal', prompt: '范围？' }], answers: { goal: '仅验证清理与收据' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '夹具点击', steps: ['点击'], expected: '完成', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 800, height: 600 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#fixture', timeoutMs: 1000 },
      { id: 'result', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '完成', timeoutMs: 1000 }] } };
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'fixture-user', at: new Date().toISOString() });
  const original = await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const calls: string[] = [];
  const createHost = async (input: HostInput): Promise<any> => {
    active = input; const closePreparation = await configure?.(input);
    for (const name of ['author', 'review', 'artifacts', 'evidence']) await mkdir(join(root, name), { recursive: true });
    const artifact = { artifactId: 'fixture-output', version: 'v1', location: 'artifacts/fixture.txt' };
    return { capability: 'completion-fixture', availableArtifacts: requirement.sources, closePreparation,
      taskPolicies: [{ policyId: 'code', role: 'coding', workspace: root, writePaths: ['author'], readOnlyPaths: [], tools: [], allocationMicroCny: 100,
        outputs: [{ ...artifact, destination: artifact.location, type: 'game', schema: 'game/1' }] }],
      roleFactory: async (role: any) => ({ actorId: `${role.role}-actor`, contextId: `${role.role}-context`, close: async () => {}, prompt: async () => {
        calls.push(role.role);
        return { text: JSON.stringify(role.role === 'cosmos' ? { tasks: [{ taskId: 'fixture-code', policyId: 'code', role: 'coding', objective: draft.brief, acceptanceIds: ['win'], dependsOn: [] }] }
          : role.role === 'reviewer' ? { verdict: 'approved', inputVersions: [...role.task.inputs, ...role.task.artifacts], evidenceIds: role.task.evidence.map((item: any) => item.evidenceId), findings: [] }
          : { summary: 'Free timing fixture', remaining: [], uncertainty: [] }) };
      } }),
      capture: async () => { await writeFile(join(root, artifact.location), 'Fixture output only\n', 'utf8'); return { artifacts: [artifact], reviewWorkspace: join(root, 'review') }; },
      verify: async (task: any) => {
        const source = { artifactId: 'fixture-evidence', version: 'v1', location: 'evidence/fixture.json' }; await writeFile(join(root, source.location), '{}', 'utf8');
        return [{ contractVersion: '1.0.0', evidenceId: 'fixture-check', taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report', source,
          artifactVersions: [...task.inputs, ...task.artifacts], outcome: 'passed', recordedAt: new Date().toISOString(), summary: 'Injected evidence, no game generation' }];
      }, recoverCapture: async () => ({ artifacts: [artifact], reviewWorkspace: join(root, 'review') }), finish: async () => ({ delivery: artifact.location, gaps: [] }), repair: async () => null };
  };
  return { root, draft, requirement, original, calls, createHost, active: () => active! };
}
