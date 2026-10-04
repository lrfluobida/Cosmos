import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { RequirementContract } from '../contracts/index.ts';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { IntakeController } from '../runtime/intake.ts';
import type { StoredDraft } from '../runtime/intake.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';
import { confirmRequirements, gameplayAcceptance, HOST_STAGE_ACCEPTANCE, validateGameDraft } from '../roles/requirements.ts';
import type { GameDraft } from '../roles/requirements.ts';
import { modeFromSelection, resolveDraftMode } from '../roles/preparation-mode.ts';
import type { DraftMode } from '../roles/preparation-mode.ts';
import { sameValue } from '../contracts/validation.ts';
import { readRunSnapshot, recoverRunOwner, startBudgetWarnings, startControl } from './control.ts';
import type { RunSnapshot } from '../runtime/run-types.ts';

export interface ProductHost {
  prepare(root: string, signal?: AbortSignal): Promise<{ environmentReady: boolean; executionReady: boolean; reason?: string }>;
  questions(input: { controller: IntakeController; roundId: string; brief: string }): Promise<GameDraft['questions']>;
  draft(input: { controller: IntakeController; roundId: string; brief: string; questions: GameDraft['questions']; answers: GameDraft['answers'] }): Promise<GameDraft>;
  execute(input: { root: string; requirement: RequirementContract; draft: GameDraft; resume: boolean; windowId?: string; notify?: (message: string) => void }): Promise<unknown>;
}
async function json(root: string, name: string): Promise<any> { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, name))); }
async function optionalJson(root: string, name: string): Promise<any | null> {
  try { return await json(root, name); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
const draftPayload = ({ revision: _revision, source: _source, ...draft }: StoredDraft): GameDraft => draft;
export async function readConfirmedGeneration(root: string, snapshot: RunSnapshot) {
  const source = snapshot.run.humanDecisions.find(decision => decision.decisionId.startsWith('requirements-v'));
  if (!source || source.evidence.length !== 2 || source.evidence[0].artifactId !== 'requirement-draft' || source.evidence[1].artifactId !== 'user-confirmation') throw new Error('No original CLI requirement confirmation to resume.');
  const draft = await json(root, source.evidence[0].location), confirmed = await json(root, source.evidence[1].location);
  const origin = await optionalJson(root, 'intake-mode.json');
  if (origin && (origin.runId !== snapshot.run.runId || origin.createdAt !== snapshot.events[0].at
    || !sameValue(origin, { runId: origin.runId, createdAt: origin.createdAt, draftMode: origin.draftMode }))) throw new Error('Original intake mode origin changed.');
  validateGameDraft(draft, modeFromSelection(origin?.draftMode));
  if (confirmed.runId !== snapshot.run.runId || confirmed.actorId !== source.actorId || confirmed.at !== source.decidedAt) throw new Error('Original confirmation identity changed.');
  return { draft, requirement: confirmRequirements({ ...draft, specVersion: snapshot.run.specVersion, sources: source.evidence }, confirmed) };
}
function displayDraft(draft: StoredDraft): string {
  const lines = [`草稿 v${draft.revision}`, `游戏需求：${draft.brief}`, '已回答的问题：', ...draft.questions.map(question => `- ${question.prompt} ${draft.answers[question.id] ?? '尚未回答'}`), '玩法要求：'];
  for (const item of gameplayAcceptance(draft)) lines.push(`- ${item.description}`, `  操作：${item.steps.join('；')}`, `  期望：${item.expected}`);
  for (const stage of HOST_STAGE_ACCEPTANCE) if (draft.acceptance.some(item => item.acceptanceId === stage.acceptanceId)) lines.push(stage.description, `- ${stage.expected}`);
  if (draft.acceptance.some(item => item.acceptanceId === 'COSMOS-MEDIA')) lines.push('最终游戏还会检查素材实际载入、动作和音频触发；未覆盖的项目会保留为差距。美术辨识度与听感留待最终试玩。');
  if (draft.preparation) lines.push('准备模式：先确认需求；地图、解法与自动操作将在同一次生成运行的运行时设计后形成。');
  else {
    lines.push('自动操作与检查：');
    for (const step of draft.scenario.steps) {
      if (step.kind === 'locator-click') lines.push(`- 点击界面目标 ${step.selector}`);
      else if (step.kind === 'mouse-click' || step.kind === 'mouse-move') lines.push(`- ${step.kind === 'mouse-click' ? '点击' : '移动鼠标到'} ${step.selector ?? '画面'}（${step.x}, ${step.y}）`);
      else if (step.kind === 'assert' || step.kind === 'wait-for') lines.push(`- ${step.kind === 'wait-for' ? '等待并检查' : '检查'} ${step.observation.kind === 'debug' ? `辅助观测 ${step.observation.path.join('.')}` : `界面 ${step.observation.selector}`}：应为 ${String(step.expected)}`);
    }
  }
  if (draft.unsupported.length) lines.push('尚不支持的要求：', ...draft.unsupported.map(item => `- ${item}`));
  return lines.join('\n');
}

/** The only confirmation author is actual stdin; model output never reaches this branch. */
export async function runProductSession(options: { command: 'new' | 'resume'; root: string; brief?: string; draftMode?: DraftMode; host: ProductHost; input: Readable; output: Writable }) {
  const selectedMode = resolveDraftMode(options.draftMode);
  const root = resolve(options.root), { host, output } = options;
  await safePath(root);
  const say = (text: string) => { output.write(text + '\n'); };
  const lines = createInterface({ input: options.input, crlfDelay: Infinity, terminal: false }), iterator = lines[Symbol.asyncIterator]();
  const ask = async (prompt: string) => { say(prompt); const next = await iterator.next(); return next.done ? null : next.value.trim(); };
  let intake: IntakeController | undefined, control: Awaited<ReturnType<typeof startControl>> | undefined, warnings: Awaited<ReturnType<typeof startBudgetWarnings>> | undefined, active: Promise<unknown> | undefined;
  const run = async <T>(action: () => Promise<T>): Promise<T> => { const work = action(); active = work; try { return await work; } finally { if (active === work) active = undefined; } };
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    if (!intake) throw new Error('Intake owner is unavailable.');
    await intake.stop('CLI user requested a durable hard stop.'); lines.close();
    if (active) {
      let timer: NodeJS.Timeout | undefined;
      try { await Promise.race([active.catch(() => {}), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Intake drain is unconfirmed.')), 5000); })]); }
      finally { clearTimeout(timer); }
    }
  })();
  const interrupt = () => { void stop().catch(() => say('停止收敛未确认，请查看原运行状态。')); };
  try {
    if (options.command === 'new') {
      if (!options.brief?.trim()) throw new Error('A one-sentence --brief is required.');
      const entries = await readdir(root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
      if (entries.length) throw new Error('Choose an empty run directory; existing runs require resume.');
      const runId = `game-${randomUUID()}`;
      intake = await IntakeController.create({ root, runId, ledgerId: `${runId}-budget`, specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 8,
        ...(selectedMode ? { draftMode: options.draftMode } : {}),
        allocations: [{ taskId: 'intake', amountMicroCny: 10_000_000 }, { taskId: 'planning', amountMicroCny: 10_000_000 }] });
      await publishReceipt(join(root, 'intake-origin.json'), { runId, brief: options.brief, ...(selectedMode ? { draftMode: selectedMode } : {}) });
    } else {
      const snapshot = await readRunSnapshot(root);
      if (snapshot.formatVersion === 2) throw new Error('This run has an authorized continuation window; select it explicitly with resume --window <id>.');
      if (snapshot.stopReason) throw new Error(`Run is durably stopped (${snapshot.stopReason.code}); resume cannot clear a hard stop.`);
      if (snapshot.formatVersion === 1) {
        if (Date.now() >= Date.parse(snapshot.run.originalDeadlineAt)) throw new Error('Original deadline expired; resume cannot extend it.');
        const { draft, requirement } = await readConfirmedGeneration(root, snapshot);
        if (options.draftMode !== undefined && !sameValue(draft.preparation, selectedMode)) throw new Error('Resume cannot replace the original draft mode.');
        say(`恢复原运行 ${snapshot.run.runId}；费用与截止时间保持连续。`);
        lines.close();
        const result = await host.execute({ root, requirement, draft, resume: true, notify: say });
        say(JSON.stringify(result, null, 2)); return result;
      }
      if (snapshot.formatVersion !== 'intake-1') throw new Error('Expected the original intake snapshot.');
      if (options.draftMode !== undefined && !sameValue(snapshot.draftMode, selectedMode)) throw new Error('Resume cannot replace the original draft mode.');
      await recoverRunOwner(root);
      intake = await IntakeController.open({ root });
    }
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    const original = await json(root, 'intake-origin.json'), state = await intake.read();
    if (original.runId !== state.run.runId || typeof original.brief !== 'string' || !sameValue(original.draftMode, state.draftMode)) throw new Error('Intake origin does not match the original run mode.');
    say(`运行 ${state.run.runId}。访谈和生成共享 ¥200 总额；生成确认就绪后开始原 12h 计时。`);
    say('stop 为持久硬停止；resume 只恢复原窗口内未被硬停止的可核实中断。');
    control = await startControl(root, state.run.runId, stop);
    warnings = await startBudgetWarnings(root, say);
    if (options.command === 'resume') {
      const { reconcileEntryReceipts } = await import('../runtime/entrypoint.ts');
      await run(() => reconcileEntryReceipts(root, intake!));
    }
    const readiness = await run(() => host.prepare(root, intake!.signal));
    if (!readiness.environmentReady || !readiness.executionReady) {
      say(`生成前置未就绪：${readiness.reason ?? '环境或执行门禁未通过'}。保留原 intake，不调用访谈或启动计时。`); return { outcome: 'waiting_prerequisites' };
    }
    let current = state.draft, requirement = state.confirmation?.requirement;
    const questions = current?.questions ?? await run(() => host.questions({ controller: intake!, roundId: 'questions-1', brief: original.brief }));
    while (!requirement) {
      intake.signal.throwIfAborted();
      if (!current) {
        const version = ((await intake.read()).draft?.revision ?? 0) + 1, answerPath = `intake-answers/v${version}.json`;
        const saved = await optionalJson(root, answerPath);
        let answers: GameDraft['answers'];
        if (saved) {
          if (saved.brief !== original.brief || JSON.stringify(saved.questions) !== JSON.stringify(questions) || !sameValue(saved.draftMode, state.draftMode)) throw new Error('Recorded answers no longer match the original interview mode.');
          answers = saved.answers;
        } else {
          answers = {};
          for (const question of questions) {
            let answer: string | null;
            do { answer = await ask(question.prompt); if (answer === null) { say('输入结束；需求未确认，未启动生成。'); return { outcome: 'unconfirmed' }; } } while (!answer);
            answers[question.id] = answer;
          }
          await mkdir(join(root, 'intake-answers'), { recursive: true });
          await publishReceipt(join(root, answerPath), { brief: original.brief, questions, answers, ...(state.draftMode ? { draftMode: state.draftMode } : {}) });
        }
        const proposal = await run(() => host.draft({ controller: intake!, roundId: `draft-${version}`, brief: original.brief, questions, answers }));
        current = await intake.saveDraft(proposal);
      }
      say(displayDraft(current));
      if (current.unsupported.length) { say('当前可信验收能力不支持上述范围；保留差距，未确认或启动生成。'); return { outcome: 'unsupported', gaps: current.unsupported }; }
      const answer = await ask(`确认当前版本请输入 confirm ${current.revision}；修改回答输入 edit；退出输入 cancel。`);
      if (answer === null || answer === 'cancel') { say('需求未确认，未启动生成。'); return { outcome: 'unconfirmed' }; }
      if (answer === 'edit') { current = null; continue; }
      if (answer !== `confirm ${current.revision}`) { say('请输入当前版本的明确确认；旧版本无效。'); continue; }
      requirement = await intake.confirm({ revision: current.revision, confirmed: true, actorId: 'local-user', at: new Date().toISOString() });
    }
    const actual = await run(() => host.prepare(root, intake!.signal));
    if (!actual.environmentReady || !actual.executionReady) { say('确认已保存；执行前置未就绪，未启动原生成时钟。'); return { outcome: 'waiting_prerequisites' }; }
    await intake.activateGeneration(actual);
    await warnings.close(); warnings = undefined; await control.close(); control = undefined; await intake.close(); intake = undefined; lines.close();
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    const result = await host.execute({ root, requirement, draft: draftPayload(current!), resume: false, notify: say });
    say(JSON.stringify(result, null, 2)); return result;
  } finally {
    lines.close(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    await warnings?.close(); await control?.close(); await intake?.close();
  }
}
