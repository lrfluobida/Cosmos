import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { regularFile } from '../artifacts/paths.ts';
import { DEFAULT_BUDGETS } from '../contracts/budget.ts';
import type { TaskState } from '../contracts/types.ts';
import { validateSnapshot } from './run-validation.ts';
import type { RunSnapshot, StopReason } from './run-types.ts';

export interface ContinuationQuote {
  formatVersion: 'continuation-quote-1'; kind: 'proposal'; activationAllowed: false; quoteId: string;
  notice: string;
  basis: { runId: string; ledgerId: string; specVersion: string; revision: number; snapshotSha256: string;
    originalStartedAt: string; originalDeadlineAt: string; originalLimitMicroCny: number; stopReason: StopReason | null };
  effectiveStop: 'durable_stop' | 'deadline_expired_unrecorded';
  auxiliarySources: { path: string; sha256: string }[];
  original: { settledMicroCny: number; reservedMicroCny: number; unallocatedMicroCny: number; durationMs: number };
  requested: { additionalMicroCny: number; additionalDurationMs: number };
  proposed: {
    totalLimitMicroCny: number; combinedAuthorizedDurationMs: number; deadlineAt: null;
    allocationClosures: { taskId: string; originalGrantMicroCny: number; settledMicroCny: number; proposedReleaseMicroCny: number; verification: 'required' }[];
    targets: { sourceTaskId: string; state: TaskState; historyTaskIds: string[]; attemptsUsed: number; acceptanceIds: string[]; remaining: string[]; uncertainty: string[] }[];
    grants: { sourceTaskId: string; taskId: string; amountMicroCny: number }[];
    attemptPolicy: { newAttemptsPerTarget: 1; automaticRepairs: 0 };
  };
  blockers: { code: string; taskId?: string; message: string }[];
}
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Uint8Array): any => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const cny = (micro: number) => (micro / 1_000_000).toFixed(6).replace(/\.?0+$/, '');

/** These are bounds on a single proposal input, not permission to spend or extend a run. */
function checkRequest(money: number, duration: number) {
  if (!Number.isSafeInteger(money) || money < 0 || money > DEFAULT_BUDGETS.generationMicroCny) throw new Error('追加金额必须为 0 至 200 元的安全整数 micro-CNY；0 元只表示仅申请加时。');
  if (!Number.isSafeInteger(duration) || duration < 60_000 || duration > DEFAULT_BUDGETS.hardDurationMs || duration % 60_000) throw new Error('追加时长必须为 1 至 720 的整数分钟。');
}

export function parseContinuationQuoteOptions(options: string[]): { additionalMicroCny: number; additionalDurationMs: number } {
  const values = new Map<string, string>(); let quote = false;
  const invalid = () => new Error('Usage: cosmos continue <run-dir> --quote --add-cny <0..200> --add-minutes <1..720>；本入口只生成提案，不支持确认或激活参数。');
  for (let index = 0; index < options.length; index++) {
    const name = options[index];
    if (name === '--quote') { if (quote) throw invalid(); quote = true; continue; }
    if (!['--add-cny', '--add-minutes'].includes(name) || values.has(name) || index + 1 >= options.length) throw invalid();
    values.set(name, options[++index]);
  }
  const money = values.get('--add-cny'), minutes = values.get('--add-minutes');
  if (!quote || values.size !== 2 || !money || money.length > 24 || !/^(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(money)
    || !minutes || minutes.length > 16 || !/^[1-9]\d*$/.test(minutes)) throw invalid();
  const [whole, fractional = ''] = money.split('.');
  const micro = BigInt(whole) * 1_000_000n + BigInt(fractional.padEnd(6, '0'));
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  const additionalMicroCny = Number(micro), additionalDurationMs = Number(minutes) * 60_000;
  checkRequest(additionalMicroCny, additionalDurationMs); return { additionalMicroCny, additionalDurationMs };
}

async function readReplacements(root: string, state: RunSnapshot) {
  let bytes: Buffer;
  try { bytes = await regularFile(root, 'repair-plan.json'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { replacements: [] as { sourceTaskId: string; replacementTaskId: string }[], sources: [] as { path: string; sha256: string }[] }; throw error; }
  const plan = decode(bytes);
  const replacements: { sourceTaskId: string; replacementTaskId: string }[] = plan.formatVersion === 2 ? plan.replacements : [{ sourceTaskId: plan.sourceTaskId, replacementTaskId: plan.replacementTaskId }];
  if (plan.formatVersion !== undefined && plan.formatVersion !== 2 || !Array.isArray(replacements) || !replacements.length || replacements.length > 3
    || !Array.isArray(plan.tasks) || plan.formatVersion === 2 && (plan.runId !== state.run.runId || plan.ledgerId !== state.ledger.ledgerId
      || plan.originalStartedAt !== state.run.originalStartedAt || plan.originalDeadlineAt !== state.run.originalDeadlineAt || plan.limitMicroCny !== state.ledger.limitMicroCny)
    || new Set(replacements.map(item => item.sourceTaskId)).size !== replacements.length || new Set(replacements.map(item => item.replacementTaskId)).size !== replacements.length
    || replacements.some(item => item.sourceTaskId === item.replacementTaskId || !state.tasks.some(task => task.taskId === item.sourceTaskId)
      || !state.tasks.some(task => task.taskId === item.replacementTaskId) || !plan.tasks.some((itemTask: any) => itemTask.task?.taskId === item.replacementTaskId))) {
    throw new Error('原继任计划尚未完整登记或身份不符，无法只读确定续跑目标；请保留并检查原记录。');
  }
  return { replacements, sources: [{ path: 'repair-plan.json', sha256: hash(bytes) }] };
}

/** Read-only, including when a caller already holds the owner lock. No host/dispatch proof is inferred. */
export async function buildContinuationQuote(options: { root: string; additionalMicroCny: number; additionalDurationMs: number; now?: number }): Promise<ContinuationQuote> {
  const { additionalMicroCny, additionalDurationMs } = options; checkRequest(additionalMicroCny, additionalDurationMs);
  const root = resolve(options.root), bytes = await regularFile(root, 'snapshot.json'), state = decode(bytes);
  if (state?.formatVersion !== 1) throw new Error('续跑提案只支持正式 generation v1 快照；intake、validation 或未知格式不能通过本入口续跑。');
  validateSnapshot(state);
  if (state.ledger.scope !== 'generation' || state.run.kind !== 'runtime_generation') throw new Error('续跑提案仅支持正式 generation；validation 不获得新窗口或额度。');
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('Invalid quote observation time.');
  if (!state.stopReason && now < Date.parse(state.run.originalDeadlineAt)) throw new Error('原运行尚未硬停止或到期；只读 quote 不会停止它。');
  if (state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) throw new Error('原运行仍有未知或预留费用；必须先对账，quote 不会释放这些费用。');
  const { replacements, sources } = await readReplacements(root, state);
  const blockers: ContinuationQuote['blockers'] = [
    { code: 'explicit_confirmation_required', message: '这里只显示提案；尚无本报价的真实用户确认，不能激活。' },
    { code: 'owner_quiescence_unverified', message: '尚未核验原 writer 与子进程收敛；没有 lock 文件也不是收敛证明。' },
    { code: 'fixed_evidence_unverified', message: '尚未核验准确产物、诊断、阶段回执及最终交付证据；列出引用不代表检查通过。' },
    { code: 'allocation_closures_unverified', message: '旧 grant 的关闭与未用额释放均待 host 核验和明确确认；当前没有重新分配额度。' },
  ];
  const effectiveStop = state.stopReason ? 'durable_stop' as const : 'deadline_expired_unrecorded' as const;
  if (!state.stopReason) blockers.push({ code: 'original_stop_not_recorded', message: '原 deadline 已过，但停止事实尚未落盘；后续 D2 必须持锁记录原停止，不得重置原时间。' });
  const targets = state.tasks.filter(task => task.state !== 'passed' && !replacements.some(item => item.sourceTaskId === task.taskId)).map(task => {
    const history = [task]; let predecessor = replacements.find(item => item.replacementTaskId === task.taskId);
    while (predecessor) {
      if (history.some(item => item.taskId === predecessor!.sourceTaskId)) throw new Error('原继任关系存在循环，无法确定历史尝试。');
      const prior = state.tasks.find(item => item.taskId === predecessor!.sourceTaskId)!; history.unshift(prior);
      predecessor = replacements.find(item => item.replacementTaskId === prior.taskId);
    }
    if (task.attempts.length && !task.artifacts.length && !task.evidence.length && !task.attempts.at(-1)?.failure?.evidenceRefs.length) {
      blockers.push({ code: 'source_evidence_missing', taskId: task.taskId, message: '已有执行尝试缺少产物、证据或诊断引用，不能据此授权重发。' });
    }
    return { sourceTaskId: task.taskId, state: task.state, historyTaskIds: history.map(item => item.taskId), attemptsUsed: history.reduce((sum, item) => sum + item.attempts.length, 0),
      acceptanceIds: [...task.acceptanceIds], remaining: task.handoff.remaining.length ? [...task.handoff.remaining] : [task.objective], uncertainty: [...task.handoff.uncertainty] };
  });
  if (!targets.length) blockers.push({ code: 'no_unfinished_targets', message: '当前快照没有可列出的未完成任务；不能虚构新的工作或体验认可。' });
  const allocationClosures = state.ledger.allocations.map(grant => {
    const settled = state.ledger.entries.filter(entry => entry.taskId === grant.taskId).reduce((sum, entry) => sum + entry.settledMicroCny, 0);
    if (settled > grant.amountMicroCny) blockers.push({ code: 'allocation_overrun', taskId: grant.taskId, message: '已发生费用超过该旧 grant；不能释放或掩盖超额事实。' });
    return { taskId: grant.taskId, originalGrantMicroCny: grant.amountMicroCny, settledMicroCny: settled, proposedReleaseMicroCny: Math.max(0, grant.amountMicroCny - settled), verification: 'required' as const };
  });
  const unallocated = state.ledger.limitMicroCny - state.ledger.allocations.reduce((sum, grant) => sum + grant.amountMicroCny, 0);
  const available = unallocated + additionalMicroCny + allocationClosures.reduce((sum, item) => sum + item.proposedReleaseMicroCny, 0);
  const grants: ContinuationQuote['proposed']['grants'] = [];
  const weights = targets.map(target => state.ledger.allocations.find(grant => grant.taskId === target.sourceTaskId)!.amountMicroCny);
  if (targets.length && !blockers.some(item => item.code === 'allocation_overrun')) {
    if (!Number.isSafeInteger(available) || available < targets.length || weights.some(weight => weight <= 0)) blockers.push({ code: 'grant_proposal_unavailable', message: '拟用额度或原权重不足，无法为每项任务提出正数 grant。' });
    else {
      const total = weights.reduce((sum, weight) => sum + BigInt(weight), 0n); let used = 0;
      targets.forEach((target, index) => {
        const amountMicroCny = index === targets.length - 1 ? available - used : Number(BigInt(available) * BigInt(weights[index]) / total);
        const taskId = `cont-${state.revision}-${hash(target.sourceTaskId).slice(0, 20)}`;
        if (amountMicroCny <= 0 || state.run.taskIds.includes(taskId)) blockers.push({ code: 'grant_proposal_unavailable', taskId: target.sourceTaskId, message: '拟用 grant 为零或新任务 ID 与旧记录冲突；不能覆盖历史。' });
        grants.push({ sourceTaskId: target.sourceTaskId, taskId, amountMicroCny }); used += amountMicroCny;
      });
      if (blockers.some(item => item.code === 'grant_proposal_unavailable')) grants.length = 0;
    }
  }
  const durationMs = Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt);
  const quote: Omit<ContinuationQuote, 'quoteId'> = {
    formatVersion: 'continuation-quote-1', kind: 'proposal', activationAllowed: false,
    notice: `仅为只读续跑提案，不构成确认或激活。原金额上限 ¥${cny(state.ledger.limitMicroCny)}，已结算 ¥${cny(state.run.fees.settledMicroCny)}；拟追加 ¥${cny(additionalMicroCny)} 和 ${additionalDurationMs / 60_000} 分钟，拟累计金额上限 ¥${cny(state.ledger.limitMicroCny + additionalMicroCny)}。原成绩仍按原额度与原截止时间报告；下列释放额、新 grant 与额外尝试均未生效。`,
    basis: { runId: state.run.runId, ledgerId: state.ledger.ledgerId, specVersion: state.run.specVersion, revision: state.revision, snapshotSha256: hash(bytes),
      originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt, originalLimitMicroCny: state.ledger.limitMicroCny, stopReason: structuredClone(state.stopReason) },
    effectiveStop, auxiliarySources: sources,
    original: { settledMicroCny: state.run.fees.settledMicroCny, reservedMicroCny: state.run.fees.reservedMicroCny, unallocatedMicroCny: unallocated, durationMs },
    requested: { additionalMicroCny, additionalDurationMs },
    proposed: { totalLimitMicroCny: state.ledger.limitMicroCny + additionalMicroCny, combinedAuthorizedDurationMs: durationMs + additionalDurationMs, deadlineAt: null,
      allocationClosures, targets, grants, attemptPolicy: { newAttemptsPerTarget: 1, automaticRepairs: 0 } }, blockers,
  };
  return { ...quote, quoteId: `cq1-${hash(JSON.stringify(quote))}` };
}
