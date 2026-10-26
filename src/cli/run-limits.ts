import { DEFAULT_BUDGETS } from '../contracts/budget.ts';
import type { IntakeSnapshot } from '../runtime/intake.ts';
import type { RunSnapshot } from '../runtime/run-types.ts';

export interface RunLimits { limitMicroCny: number; durationMs: number }
export const DEFAULT_RUN_LIMITS: Readonly<RunLimits> = Object.freeze({
  limitMicroCny: DEFAULT_BUDGETS.generationMicroCny, durationMs: DEFAULT_BUDGETS.hardDurationMs,
});
export function validateRunLimits(value: unknown): asserts value is RunLimits {
  const limits = value as RunLimits;
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)
    || Object.keys(limits).length !== 2 || Object.keys(limits).some(key => !['limitMicroCny', 'durationMs'].includes(key))
    || !Number.isSafeInteger(limits.limitMicroCny) || limits.limitMicroCny <= 0 || limits.limitMicroCny > DEFAULT_RUN_LIMITS.limitMicroCny
    || !Number.isSafeInteger(limits.durationMs) || limits.durationMs < 60_000 || limits.durationMs > DEFAULT_RUN_LIMITS.durationMs || limits.durationMs % 60_000) {
    throw new Error('新建限额必须为大于 0 且不超过 200 元（最多 6 位小数），时长为 1 至 720 的整数分钟。');
  }
}
export function parseRunLimits(money?: string, minutes?: string): RunLimits | undefined {
  if (money === undefined && minutes === undefined) return undefined;
  if (money !== undefined && (money.length > 24 || !/^(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(money))
    || minutes !== undefined && (minutes.length > 16 || !/^[1-9]\d*$/.test(minutes))) throw new Error('Invalid new --max-cny or --max-minutes value.');
  const [whole, fractional = ''] = (money ?? '200').split('.');
  const limits = { limitMicroCny: Number(BigInt(whole) * 1_000_000n + BigInt(fractional.padEnd(6, '0'))),
    durationMs: minutes === undefined ? DEFAULT_RUN_LIMITS.durationMs : Number(minutes) * 60_000 };
  validateRunLimits(limits); return limits;
}
export function displayRunLimits(limits: RunLimits): string {
  const money = (limits.limitMicroCny / 1_000_000).toFixed(6).replace(/\.?0+$/, '');
  return `访谈和生成共享 ¥${money} 总额；生成确认就绪后开始原 ${limits.durationMs / 60_000} 分钟计时。`;
}
export function requirePreparationRunLimits(limits?: RunLimits): void {
  if (limits && (limits.limitMicroCny !== DEFAULT_RUN_LIMITS.limitMicroCny || limits.durationMs !== DEFAULT_RUN_LIMITS.durationMs)) {
    throw new Error('准备模式的原限额固定为 ¥200 / 720 分钟；较小限额仅支持普通生成。');
  }
}

/** The public source binds original limits; internal API runs retain their own contracts. */
export function requirePublicRunLimits(state: IntakeSnapshot | RunSnapshot, value: unknown, requireOrigin = false): RunLimits | undefined {
  if (state.run.kind !== 'runtime_generation' || state.ledger.scope !== 'generation') return undefined;
  const cliConfirmed = state.formatVersion !== 'intake-1'
    && state.run.humanDecisions.some(row => row.decisionId.startsWith('requirements-v') && row.actorId === 'local-user');
  if (value === null && !requireOrigin && !cliConfirmed && !state.requirementsSource) return undefined;
  const origin = value as { runId?: unknown; brief?: unknown; limits?: unknown } | null;
  if (!origin || typeof origin !== 'object' || Array.isArray(origin) || origin.runId !== state.run.runId
    || typeof origin.brief !== 'string' || !origin.brief.trim()) throw new Error('Original public run limits origin is missing or changed.');
  const limits = origin.limits === undefined ? DEFAULT_RUN_LIMITS : origin.limits;
  validateRunLimits(limits);
  const duration = state.formatVersion === 'intake-1' ? state.durationMs : Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt);
  if (state.ledger.limitMicroCny !== limits.limitMicroCny || duration !== limits.durationMs) throw new Error('Original public run limits differ from their saved source.');
  return { ...limits };
}
