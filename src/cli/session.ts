import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { RequirementContract } from '../contracts/index.ts';
import { id, regularFile, safePath, snapshot as snapshotFiles } from '../artifacts/paths.ts';
import { IntakeController } from '../runtime/intake.ts';
import type { StoredDraft } from '../runtime/intake.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';
import { gameplayAcceptance, HOST_STAGE_ACCEPTANCE, MODULE_STAGE_ACCEPTANCE } from '../roles/requirements.ts';
import type { GameDraft } from '../roles/requirements.ts';
import { validateOrdinaryProfile } from '../roles/ordinary-profile.ts';
import type { OrdinaryProfile } from '../roles/ordinary-profile.ts';
import { modeFromSelection, resolveDraftMode } from '../roles/preparation-mode.ts';
import type { DraftMode } from '../roles/preparation-mode.ts';
import { sameValue } from '../contracts/validation.ts';
import { readRunSnapshot, recoverRunOwner, startBudgetWarnings, startControl } from './control.ts';
import { readCompletedGeneration } from '../runtime/experience.ts';
import { readFrameSelection, requireCurrentFrameSource, selectRenderFrames } from '../runtime/render-frame-selection.ts';
import type { RenderFrameSelection } from '../runtime/render-frame-selection.ts';
import { currentModularRepairPolicy, readModularRepairPolicy, requireCurrentModularRepairPolicy } from '../runtime/modular-repair-policy.ts';
import type { ModularRepairPolicy } from '../runtime/modular-repair-policy.ts';
import type { PublicValidationFundingBinding } from '../runtime/public-validation-funding-types.ts';
import { publishFundedOrigin, verifyFundedNew, verifyPublicValidationFunding } from '../runtime/public-validation-funding.ts';
import { DEFAULT_RUN_LIMITS, displayRunLimits, requirePreparationRunLimits, requirePublicRunLimits, validateRunLimits } from './run-limits.ts';
import type { RunLimits } from './run-limits.ts';
import { readConfirmedGeneration, readConfirmedRequirementsSource, readReferencedRequirements, requireSeparateRequirementsRoot } from '../runtime/confirmed-requirements-source.ts';
import { publicBaseAllocations } from '../runtime/public-base-allocations.ts';

export interface ProductHost {
  /** Source-owned new-run selection; resume always reads the original source. */
  ordinaryProfile?: OrdinaryProfile;
  prepare(root: string, signal?: AbortSignal): Promise<{ environmentReady: boolean; executionReady: boolean; reason?: string }>;
  questions(input: { controller: IntakeController; roundId: string; brief: string }): Promise<GameDraft['questions']>;
  draft(input: { controller: IntakeController; roundId: string; brief: string; questions: GameDraft['questions']; answers: GameDraft['answers'] }): Promise<GameDraft>;
  execute(input: { root: string; requirement: RequirementContract; draft: GameDraft; resume: boolean; windowId?: string; renderFrames?: boolean; notify?: (message: string) => void }): Promise<unknown>;
}
async function json(root: string, name: string): Promise<any> { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, name))); }
async function optionalJson(root: string, name: string): Promise<any | null> {
  try { return await json(root, name); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
const draftPayload = ({ revision: _revision, source: _source, ...draft }: StoredDraft): GameDraft => draft;
/** Read-only rejection before confirmation, owner recovery, environment preparation or window activation. */
export async function rejectPreparationContinuation(root: string): Promise<void> {
  const mode = await optionalJson(root, 'intake-mode.json');
  if (mode && modeFromSelection(mode.draftMode) !== 'browser') {
    const { readHumanContinuationLineage } = await import('../runtime/continuation-preparation.ts');
    const state = await readRunSnapshot(root);
    if (state.formatVersion === 'intake-1') throw new Error('准备模式续跑要求原正式运行。');
    await readHumanContinuationLineage(root, state);
  }
}
export { readConfirmedGeneration } from '../runtime/confirmed-requirements-source.ts';

function displayDraft(draft: StoredDraft, frames?: RenderFrameSelection, policy?: ModularRepairPolicy): string {
  const lines = [`草稿 v${draft.revision}`, `游戏需求：${draft.brief}`, '已回答的问题：', ...draft.questions.map(question => `- ${question.prompt} ${draft.answers[question.id] ?? '尚未回答'}`), '玩法要求：'];
  for (const item of gameplayAcceptance(draft)) lines.push(`- ${item.description}`, `  操作：${item.steps.join('；')}`, `  期望：${item.expected}`);
  for (const stage of [...HOST_STAGE_ACCEPTANCE, ...(draft.codeProfile ? MODULE_STAGE_ACCEPTANCE : [])]) if (draft.acceptance.some(item => item.acceptanceId === stage.acceptanceId)) lines.push(stage.description, `- ${stage.expected}`);
  if (draft.codeProfile) {
    lines.push('编码组织：两个独立模块与最终集成，共五项角色任务；模块只认局部编译、接口和源码审查，最终游戏仍须满足全部玩法。coding 原 40% 内按 10%/10%/20% 分配。');
    lines.push(policy ? '修复政策 module-repair/1：一个已结束的模块 v1 代码失败可用原唯一修复机会生成同模块 v2 和从未启动的集成后继；另一模块、设计、美术及接口保持已审版本。整组之后不给第二次修复；最终集成先失败时仍只修复一次。此模式暂不支持追加窗口。'
      : '仅最终集成可按原策略修复一次，模块失败保留差距。此模式暂不支持追加窗口。');
  }
  if (draft.acceptance.some(item => item.acceptanceId === 'COSMOS-MEDIA')) lines.push('最终游戏还会检查素材实际载入、动作和音频触发；未覆盖的项目会保留为差距。美术辨识度与听感留待最终试玩。');
  if (frames) lines.push('渲染帧采样：记录本次正常游玩窗口的实际帧与画布尺寸；设备与工作量未冻结，完整性能政策仍未执行。');
  if (!draft.preparation) {
    if (draft.benchmark) lines.push('经典 PC 政策：仅执行启动与离线存档重开；完整目录 230 项保留，其中 221 项参考依据待核对、另 7 项政策未执行，完整经典验收仍未通过。');
    if (draft.classicEntry) {
      const { measurement, entityLabel } = draft.classicEntry;
      lines.push(measurement ? `经典条目正常输入检查：${entityLabel}（${measurement.entityId}），${measurement.metric} = ${measurement.value} ${measurement.unit}。`
        : '经典条目正常输入检查：没有已核实的精确参考测量，本项未执行。');
      lines.push('本项仅比较正常输入后的可见数字；机制、数值实际使用及其他目录条目仍未执行，完整经典验收仍未通过。');
    }
  }
  if (draft.preparation) lines.push('准备模式：先确认需求；地图、解法与自动操作将在同一次生成运行的运行时设计后形成。');
  else if (draft.ordinaryProfile) {
    lines.push('体验要求：');
    for (const item of draft.experienceCriteria) lines.push(`- ${item.description}`, `  试玩：${item.steps.join('；')}`, `  期望：${item.expected}`);
    if (!draft.experienceCriteria.length) lines.push('- 没有额外体验条目；最终整体试玩确认仍保留。');
    lines.push('确认完整需求后，由运行时设计形成具体操作与自动验收计划；体验要求留待当前交付版本的真实试玩确认。');
  }
  else {
    lines.push('自动操作与检查：');
    const stages = [{ steps: draft.scenario.steps }, ...(draft.scenario.reopen ? [draft.scenario.reopen] : [])];
    for (const [index, stage] of stages.entries()) {
      if (index) lines.push(`关闭浏览器进程后，在同一存档位置重开并继续；存档应为：${draft.scenario.reopen!.checkpoint.expected}`);
      for (const step of stage.steps) {
        if (step.kind === 'locator-click') lines.push(`- 点击界面目标 ${step.selector}`);
        else if (step.kind === 'mouse-click' || step.kind === 'mouse-move') lines.push(`- ${step.kind === 'mouse-click' ? '点击' : '移动鼠标到'} ${step.selector ?? '画面'}（${step.x}, ${step.y}）`);
        else if (step.kind === 'assert' || step.kind === 'wait-for') lines.push(`- ${step.kind === 'wait-for' ? '等待并检查' : '检查'} ${step.observation.kind === 'debug' ? `辅助观测 ${step.observation.path.join('.')}` : `界面 ${step.observation.selector}`}：应为 ${String(step.expected)}`);
      }
    }
  }
  if (draft.unsupported.length) lines.push('尚不支持的要求：', ...draft.unsupported.map(item => `- ${item}`));
  return lines.join('\n');
}

/** The only confirmation author is actual stdin; model output never reaches this branch. */
export async function runProductSession(options: { command: 'new' | 'resume'; root: string; brief?: string; requirementsFrom?: { root: string; revision: number }; draftMode?: DraftMode; renderFrames?: boolean; limits?: RunLimits; funding?: PublicValidationFundingBinding; host: ProductHost; input: Readable; output: Writable }) {
  if (options.limits !== undefined) {
    if (options.command !== 'new') throw new Error('Run limits can only be selected for new.');
    validateRunLimits(options.limits);
  }
  const limits = structuredClone(options.limits ?? DEFAULT_RUN_LIMITS);
  const selectedMode = resolveDraftMode(options.draftMode);
  if (options.funding && (options.command !== 'new' || selectedMode)) throw new Error('Public funding supports only ordinary new.');
  if (selectedMode) requirePreparationRunLimits(options.limits);
  if (selectedMode && options.renderFrames) throw new Error('准备模式暂不支持渲染帧采样。');
  if (options.renderFrames !== undefined && typeof options.renderFrames !== 'boolean') throw new Error('Render-frame selection must be boolean.');
  const root = resolve(options.root), { host, output } = options;
  await safePath(root);
  if (options.requirementsFrom && (options.command !== 'new' || options.brief !== undefined || selectedMode)) throw new Error('Requirements source and ordinary brief are exclusive new modes.');
  const referenced = options.requirementsFrom ? await readConfirmedRequirementsSource({ ...options.requirementsFrom, specVersion: '1.0' }) : undefined;
  if (referenced) {
    requireSeparateRequirementsRoot(root, referenced.source);
    if (options.renderFrames !== undefined && options.renderFrames !== !!referenced.renderFrameSelection) throw new Error('Cannot replace the original render-frame selection.');
  }
  const say = (text: string) => { output.write(text + '\n'); };
  const lines = createInterface({ input: options.input, crlfDelay: Infinity, terminal: false }), iterator = lines[Symbol.asyncIterator]();
  const ask = async (prompt: string) => { say(prompt); const next = await iterator.next(); return next.done ? null : next.value.trim(); };
  let intake: IntakeController | undefined, control: Awaited<ReturnType<typeof startControl>> | undefined, warnings: Awaited<ReturnType<typeof startBudgetWarnings>> | undefined, active: Promise<unknown> | undefined;
  let frames: RenderFrameSelection | undefined;
  let policy: ModularRepairPolicy | undefined;
  let fundingLifecycle: string | undefined;
  const run = async <T>(action: () => Promise<T>): Promise<T> => {
    if (intake) { const state = await intake.read(); requirePublicRunLimits(state, await optionalJson(root, 'intake-origin.json'), true); await requireCurrentFrameSource(await readFrameSelection(root, state)); await requireCurrentModularRepairPolicy(await readModularRepairPolicy(root, state)); }
    if (intake) await verifyPublicValidationFunding({ root, snapshot: await intake.read(), dispatch: true });
    const work = action(); active = work; try { return await work; } finally { if (active === work) active = undefined; }
  };
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
      validateOrdinaryProfile(host.ordinaryProfile);
      const ordinaryProfile = referenced?.draft.ordinaryProfile ?? (selectedMode ? undefined : host.ordinaryProfile);
      const brief = referenced?.draft.brief ?? options.brief;
      if (!brief?.trim()) throw new Error('A one-sentence --brief or confirmed requirements source is required.');
      const entries: string[] = await readdir(root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
      const initialization = referenced && entries.length ? await optionalJson(root, 'intake-origin.json') : null;
      if (options.funding) await verifyFundedNew(root, options.funding, brief, limits, referenced ? !!referenced.renderFrameSelection : options.renderFrames === true, referenced?.source);
      else if (entries.length && !initialization) throw new Error('Choose an empty run directory; existing runs require resume.');
      const runId = options.funding?.runId ?? initialization?.runId ?? `game-${randomUUID()}`; id(runId);
      if (referenced && (runId === referenced.source.runId || options.funding?.ledgerId === referenced.ledgerId)) throw new Error('New attempt must have independent run and ledger identities.');
      frames = referenced ? referenced.renderFrameSelection : options.renderFrames ? await selectRenderFrames() : undefined;
      policy = referenced ? referenced.modularRepairPolicy : currentModularRepairPolicy();
      const allocationSelection = initialization ? (Object.hasOwn(initialization, 'planningAllocation') ? { planningAllocation: initialization.planningAllocation } : {})
        : referenced && limits.limitMicroCny >= 20 ? { planningAllocation: 'reuse-intake-share' } : {};
      const origin = { runId, brief, ...((options.limits && !selectedMode || referenced) ? { limits } : {}), ...(selectedMode ? { draftMode: selectedMode } : {}), ...(frames ? { renderFrames: frames } : {}), ...(policy ? { modularRepairPolicy: policy } : {}),
        ...allocationSelection,
        ...(referenced ? { requirementsSource: referenced.source } : {}),
        ...(ordinaryProfile ? { ordinaryProfile } : {}),
        ...(options.funding ? { validationFunding: options.funding } : {}) };
      const allocations = publicBaseAllocations(limits.limitMicroCny, origin);
      if (initialization && !sameValue(initialization, origin)) throw new Error('Only the same unfinished requirements initialization can retry new.');
      if (initialization && !options.funding) {
        if (entries.some(name => !['intake-origin.json', 'intake-ordinary-profile.json', 'snapshot.json', 'requirements', '.controller.lock'].includes(name)
          && !/^\.snapshot-[a-f0-9-]{36}\.tmp$/.test(name))) throw new Error('Only the same unfinished requirements initialization can retry new.');
        const saved = entries.includes('snapshot.json') ? await readRunSnapshot(root) : undefined;
        if (saved && (saved.formatVersion !== 'intake-1' || saved.draft !== null || saved.confirmation !== null || saved.stopReason || saved.validationFunding
          || saved.revision !== 1 || saved.events.length !== 1 || saved.requests.length || saved.ledger.entries.length
          || saved.interviewTaskId !== 'intake' || saved.maxRequests !== 8 || saved.ledger.ledgerId !== `${runId}-budget`
          || !sameValue(saved.run, { runId, kind: 'runtime_generation', specVersion: '1.0' })
          || !sameValue(saved.ledger.allocations, allocations))) {
          throw new Error('Requirements initialization already advanced; use resume.');
        }
        if (saved) await readReferencedRequirements(root, saved, false);
        if (entries.includes('requirements')) {
          if (!saved) throw new Error('Requirements initialization copies require their original snapshot.');
          for (const [name, bytes] of await snapshotFiles(join(root, 'requirements'))) {
            const index = referenced!.requirement.sources.findIndex(ref => ref.location === `requirements/${name}`);
            if (index < 0 || !bytes.equals([referenced!.draftBytes, referenced!.confirmationBytes][index])) throw new Error('Requirements initialization copy bytes changed.');
          }
        }
        await recoverRunOwner(root);
        if (saved) intake = await IntakeController.open({ root });
      }
      if (options.funding) await publishFundedOrigin(root, origin);
      else if (referenced && !initialization) { await mkdir(root, { recursive: true }); await publishReceipt(join(root, 'intake-origin.json'), origin); }
      intake ??= await IntakeController.create({ root, runId, ledgerId: options.funding?.ledgerId ?? `${runId}-budget`, specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 8,
        ...limits,
        ...(selectedMode ? { draftMode: options.draftMode } : {}),
        ...(ordinaryProfile ? { ordinaryProfile } : {}),
        ...(referenced ? { requirementsSource: referenced.source } : {}),
        ...(frames ? { renderFrames: frames } : {}),
        modularRepairPolicy: policy, ...(options.funding ? { validationFunding: options.funding } : {}),
        allocations });
      if (!options.funding && !referenced) await publishReceipt(join(root, 'intake-origin.json'), origin);
    } else {
      const snapshot = await readRunSnapshot(root);
      requirePublicRunLimits(snapshot, await optionalJson(root, 'intake-origin.json'), snapshot.formatVersion === 'intake-1');
      frames = await readFrameSelection(root, snapshot, options.renderFrames);
      policy = await readModularRepairPolicy(root, snapshot);
      if (snapshot.formatVersion === 2) throw new Error('This run has an authorized continuation window; select it explicitly with resume --window <id>.');
      if (snapshot.formatVersion === 1) {
        const { draft, requirement } = await readConfirmedGeneration(root, snapshot);
        if (options.draftMode !== undefined && !sameValue(draft.preparation, selectedMode)) throw new Error('Resume cannot replace the original draft mode.');
        const completed = await readCompletedGeneration(root, requirement);
        if (completed) { lines.close(); say(JSON.stringify(completed, null, 2)); return completed; }
        await verifyPublicValidationFunding({ root, snapshot, dispatch: true });
        await requireCurrentFrameSource(frames);
        await requireCurrentModularRepairPolicy(policy);
        if (snapshot.stopReason) throw new Error(`Run is durably stopped (${snapshot.stopReason.code}); resume cannot clear a hard stop.`);
        if (Date.now() >= Date.parse(snapshot.run.originalDeadlineAt)) throw new Error('Original deadline expired; resume cannot extend it.');
        say(`恢复原运行 ${snapshot.run.runId}；费用与截止时间保持连续。`);
        lines.close();
        const result = await host.execute({ root, requirement, draft, resume: true, notify: say, ...(frames ? { renderFrames: true } : {}) });
        say(JSON.stringify(result, null, 2)); return result;
      }
      if (snapshot.formatVersion !== 'intake-1') throw new Error('Expected the original intake snapshot.');
      if (snapshot.stopReason) throw new Error(`Run is durably stopped (${snapshot.stopReason.code}); resume cannot clear a hard stop.`);
      if (options.draftMode !== undefined && !sameValue(snapshot.draftMode, selectedMode)) throw new Error('Resume cannot replace the original draft mode.');
      await requireCurrentFrameSource(frames);
      await requireCurrentModularRepairPolicy(policy);
      await recoverRunOwner(root);
      intake = await IntakeController.open({ root });
    }
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    if ((await intake.read()).requirementsSource) await intake.bindConfirmedRequirements();
    const original = await json(root, 'intake-origin.json'), state = await intake.read();
    requirePublicRunLimits(state, original, true);
    if (original.runId !== state.run.runId || typeof original.brief !== 'string' || !sameValue(original.draftMode, state.draftMode)
      || original.ordinaryProfile !== state.ordinaryProfile) throw new Error('Intake origin does not match the original run mode/profile.');
    fundingLifecycle = await intake.beginFundingWork('session');
    say(`运行 ${state.run.runId}。${displayRunLimits({ limitMicroCny: state.ledger.limitMicroCny, durationMs: state.durationMs })}`);
    say('stop 为持久硬停止；resume 只恢复原窗口内未被硬停止的可核实中断。');
    let current = state.draft, requirement = state.requirementsSource ? (await readReferencedRequirements(root, state)).requirement : state.confirmation?.requirement;
    if (state.requirementsSource) {
      say(`新生成尝试 ${state.run.runId}；完整需求来源 ${state.requirementsSource.runId} / v${state.requirementsSource.revision}；原确认人 ${requirement!.confirmedBy}，原确认时间 ${requirement!.confirmedAt}。`);
      say(displayDraft(current!, frames, policy));
    }
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
    const questions = current?.questions ?? await run(() => host.questions({ controller: intake!, roundId: 'questions-1', brief: original.brief }));
    while (!requirement) {
      intake.signal.throwIfAborted();
      if (!current) {
        const version = ((await intake.read()).draft?.revision ?? 0) + 1, answerPath = `intake-answers/v${version}.json`;
        const saved = await optionalJson(root, answerPath);
        let answers: GameDraft['answers'];
        if (saved) {
          if (saved.brief !== original.brief || JSON.stringify(saved.questions) !== JSON.stringify(questions) || !sameValue(saved.draftMode, state.draftMode)
            || saved.ordinaryProfile !== state.ordinaryProfile) throw new Error('Recorded answers no longer match the original interview mode/profile.');
          answers = saved.answers;
        } else {
          answers = {};
          for (const question of questions) {
            let answer: string | null;
            do { answer = await ask(question.prompt); if (answer === null) { say('输入结束；需求未确认，未启动生成。'); return { outcome: 'unconfirmed' }; } } while (!answer);
            answers[question.id] = answer;
          }
          await mkdir(join(root, 'intake-answers'), { recursive: true });
          await publishReceipt(join(root, answerPath), { brief: original.brief, questions, answers, ...(state.draftMode ? { draftMode: state.draftMode } : {}),
            ...(state.ordinaryProfile ? { ordinaryProfile: state.ordinaryProfile } : {}) });
        }
        const proposal = await run(() => host.draft({ controller: intake!, roundId: `draft-${version}`, brief: original.brief, questions, answers }));
        current = await intake.saveDraft(proposal);
      }
      say(displayDraft(current, frames, policy));
      if (current.unsupported.length) {
        say('当前可信验收能力不支持上述范围；保留差距，未确认或启动生成。');
        const answer = await ask('修改回答输入 edit；退出输入 cancel。');
        if (answer === null || answer === 'cancel') return { outcome: 'unsupported', gaps: current.unsupported };
        if (answer === 'edit') { current = null; continue; }
        say('当前草稿含未支持要求，必须先修改；不能确认或启动生成。'); continue;
      }
      const answer = await ask(`确认当前版本请输入 confirm ${current.revision}；修改回答输入 edit；退出输入 cancel。`);
      if (answer === null || answer === 'cancel') { say('需求未确认，未启动生成。'); return { outcome: 'unconfirmed' }; }
      if (answer === 'edit') { current = null; continue; }
      if (answer !== `confirm ${current.revision}`) { say('请输入当前版本的明确确认；旧版本无效。'); continue; }
      requirement = await intake.confirm({ revision: current.revision, confirmed: true, actorId: 'local-user', at: new Date().toISOString() });
    }
    const actual = await run(() => host.prepare(root, intake!.signal));
    if (!actual.environmentReady || !actual.executionReady) { say('确认已保存；执行前置未就绪，未启动原生成时钟。'); return { outcome: 'waiting_prerequisites' }; }
    if (fundingLifecycle) {
      await warnings.close(); warnings = undefined; await control.close(); control = undefined;
      await intake.finishFundingWork(fundingLifecycle); fundingLifecycle = undefined;
    }
    await intake.activateGeneration(actual);
    await warnings?.close(); warnings = undefined; await control?.close(); control = undefined; await intake.close(); intake = undefined; lines.close();
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    const result = await host.execute({ root, requirement, draft: draftPayload(current!), resume: false, notify: say, ...(frames ? { renderFrames: true } : {}) });
    say(JSON.stringify(result, null, 2)); return result;
  } finally {
    lines.close(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    await warnings?.close(); await control?.close();
    if (intake) { await intake.finishFundingWork(fundingLifecycle); await intake.close(); }
  }
}
