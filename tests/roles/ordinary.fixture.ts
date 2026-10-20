import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import type { OrdinaryGameDraft } from '../../src/roles/requirements.ts';

export const profile = 'ordinary-design/1' as const;
export const brief = '用鼠标点亮目标，中文画面要容易辨识。';
export const questions = [{ id: 'goal', prompt: '怎样结束？' }];
export const answers = { goal: '点亮三个目标后显示完成。' };
export const proposal = {
  acceptance: [{ acceptanceId: 'light', description: '点亮三个目标', steps: ['依次点击三个目标'], expected: '显示完成', evidenceKinds: ['test_report'] }],
  experienceCriteria: [{ criterionId: 'readable', description: '目标和状态容易辨识', steps: ['试玩并辨认目标状态'], expected: '操作状态清楚' }],
  unsupported: [],
} satisfies Pick<OrdinaryGameDraft, 'acceptance' | 'experienceCriteria' | 'unsupported'>;
export const ordinaryDraft = (): OrdinaryGameDraft => ({ ...structuredClone(proposal), brief, questions: structuredClone(questions), answers: { ...answers }, ordinaryProfile: profile });
export async function ordinaryIntake(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos111-'));
  const controller = await IntakeController.create({ root, runId: 'ordinary-run', ledgerId: 'ordinary-ledger', specVersion: '1.0',
    ordinaryProfile: profile, interviewTaskId: 'intake', maxRequests: 8,
    allocations: [{ taskId: 'intake', amountMicroCny: 1_000_000 }, { taskId: 'planning', amountMicroCny: 1_000_000 }] });
  await writeFile(join(root, 'intake-origin.json'), JSON.stringify({ runId: 'ordinary-run', brief, ordinaryProfile: profile }) + '\n', 'utf8');
  await mkdir(join(root, 'intake-answers'));
  await writeFile(join(root, 'intake-answers/v1.json'), JSON.stringify({ brief, questions, answers, ordinaryProfile: profile }) + '\n', 'utf8');
  t.after(async () => { await controller.close(); await removeOwned(tmpdir(), root); });
  return { root, controller };
}
