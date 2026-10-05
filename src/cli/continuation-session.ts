import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { directory, regularFile, safePath } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { buildContinuationQuote } from '../runtime/continuation-quote.ts';
import { RunController } from '../runtime/run.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';
import { readRunSnapshot, recoverRunOwner } from './control.ts';
import { readConfirmedGeneration, rejectPreparationContinuation } from './session.ts';
import type { ProductHost } from './session.ts';

interface IO { root: string; host: ProductHost; input: Readable; output: Writable }
async function ready(io: IO) {
  const value = await io.host.prepare(io.root);
  if (value.environmentReady && value.executionReady) return true;
  io.output.write(`生成前置未就绪：${value.reason ?? '环境或执行条件未通过'}。未激活或收费。\n`); return false;
}
async function quiescent(root: string) {
  await recoverRunOwner(root);
  const lock = await lstat(join(root, 'registry/.commit.lock')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (lock) throw new Error('旧产物仍有未核实的写入，不能激活新窗口。请保留原记录并检查状态。');
}

/** Only actual stdin supplies this new decision; quote files and model text cannot confirm themselves. */
export async function runContinuationSession(options: IO & { additionalMicroCny: number; additionalDurationMs: number }) {
  const root = resolve(options.root), io = { ...options, root }; await safePath(root);
  await rejectPreparationContinuation(root);
  const original = await readRunSnapshot(root);
  if (original.formatVersion !== 1 || original.ledger.scope !== 'generation' || original.run.kind !== 'runtime_generation') throw new Error('交互续跑只支持正式运行的首个追加窗口；已有窗口请使用 resume --window。');
  const originalInputs = await readConfirmedGeneration(root, original);
  const fixedSources = await Promise.all(originalInputs.requirement.sources.map(async ref => ({ ref, bytes: await regularFile(root, ref.location) })));
  await quiescent(root);
  if (!await ready(io)) return { outcome: 'waiting_prerequisites' };
  const requested = { additionalMicroCny: options.additionalMicroCny, additionalDurationMs: options.additionalDurationMs };
  const quote = await buildContinuationQuote({ root, ...requested });
  io.output.write(JSON.stringify(quote, null, 2) + '\n');
  const lines = createInterface({ input: io.input, crlfDelay: Infinity, terminal: false }), iterator = lines[Symbol.asyncIterator]();
  try {
    io.output.write(`继续此准确提案请输入 confirm ${quote.quoteId}；退出输入 cancel。\n`);
    const answer = await iterator.next();
    if (answer.done || answer.value.trim() === 'cancel') { io.output.write('未确认续跑，没有激活或新增费用。\n'); return { outcome: 'unconfirmed' }; }
    if (answer.value.trim() !== `confirm ${quote.quoteId}`) { io.output.write('确认与当前报价不一致，没有激活。\n'); return { outcome: 'unconfirmed' }; }
    if (!await ready(io)) return { outcome: 'waiting_prerequisites' };
    await quiescent(root);
    const current = await buildContinuationQuote({ root, ...requested });
    const unchangedSources = (await Promise.all(fixedSources.map(async source => source.bytes.equals(await regularFile(root, source.ref.location))))).every(Boolean);
    if (!sameValue(current, quote) || !unchangedSources) { io.output.write('原运行记录或确认资料已改变，报价已失效；请重新查看并确认。没有激活。\n'); return { outcome: 'stale_quote' }; }
    const decisionId = `continue-${randomUUID()}`, actorId = 'local-user', decidedAt = new Date().toISOString();
    const location = `continuations/${decisionId}/confirmation.json`;
    await directory(root, `continuations/${decisionId}`);
    await publishReceipt(join(root, location), { formatVersion: 'continuation-confirmation-1', decisionId, actorId, decidedAt, confirmed: true, quote });
    const window = await RunController.activateContinuation({ root, quote, confirmation: { decisionId, actorId, decidedAt,
      source: { artifactId: 'continuation-confirmation', version: decisionId, location } } });
    lines.close();
    io.output.write(`已授权窗口 ${window.windowId}；截止 ${window.deadlineAt}。原运行停止和未达标记录保持不变。\n`);
    const result = await io.host.execute({ root, ...originalInputs, resume: true, windowId: window.windowId, notify: message => io.output.write(message + '\n') });
    io.output.write(JSON.stringify(result, null, 2) + '\n'); return result;
  } finally { lines.close(); }
}

export async function resumeContinuation(options: IO & { windowId: string }) {
  const root = resolve(options.root), state = await readRunSnapshot(root);
  await rejectPreparationContinuation(root);
  if (state.formatVersion !== 2 || state.continuation?.currentWindowId !== options.windowId) throw new Error('续跑窗口与原运行不匹配。');
  const window = state.continuation.windows.find(item => item.windowId === options.windowId)!;
  if (window.stopReason) throw new Error(`该窗口已持久停止 (${window.stopReason.code})，不能由 resume 清除。`);
  const inputs = await readConfirmedGeneration(root, state);
  if (!await ready({ ...options, root })) return { outcome: 'waiting_prerequisites' };
  const result = await options.host.execute({ root, ...inputs, resume: true, windowId: window.windowId, notify: message => options.output.write(message + '\n') });
  options.output.write(JSON.stringify(result, null, 2) + '\n'); return result;
}
