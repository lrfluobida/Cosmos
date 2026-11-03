import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { loadExperienceBinding, playtestCriterion, readBoundExperienceStatus, recordExperience, validPlaytestObservation } from '../runtime/experience.ts';

/** A final playtest decision comes from this stdin session, never from model or report text. */
export async function runExperienceSession(options: { root: string; input: Readable; output: Writable }) {
  const root = resolve(options.root), binding = await loadExperienceBinding(root), { output } = options;
  const status = await readBoundExperienceStatus(root, binding), experience = status.userExperience === 'approved' ? '已通过' : status.userExperience === 'rejected' ? '已拒绝' : '等待确认';
  const canApprove = !status.completionTiming.required || status.completionTiming.eligible === true;
  output.write(`当前游戏：${binding.acceptedCandidate.candidateRef.artifactId} / ${binding.acceptedCandidate.candidateRef.version}\n试玩工程：${resolve(root, binding.acceptedCandidate.targetRoot)}\n自动验收报告：${resolve(root, binding.report.location)}\n自动验收：通过；最终体验：${experience}。\n已验收范围：\n`);
  for (const item of binding.acceptanceScope.acceptance) output.write(`- ${item.description}\n`);
  if (binding.acceptanceScope.experienceCriteria) {
    output.write('当前确认版本的体验要求（整体 approve/reject 覆盖以下完整清单）：\n');
    for (const [index, item] of binding.acceptanceScope.experienceCriteria.entries()) output.write(`${index + 1}. ${item.description}\n  试玩：${item.steps.join('；')}\n  期望：${item.expected}\n`);
    if (!binding.acceptanceScope.experienceCriteria.length) output.write('- 没有额外体验条目；请确认整体试玩体验。\n');
  }
  output.write('未覆盖范围：\n'); for (const item of binding.acceptanceScope.notCovered) output.write(`- ${item}\n`);
  output.write(`交付完成计时：${status.completionTiming.current.status}；结束时间：${status.completionTiming.current.endedAt ?? '未核实'}。\n`);
  const recorded = status.decision?.source.playtestFeedback;
  const target = (selection: string) => selection === '0' ? '整体体验' : `第 ${selection} 项（${playtestCriterion(binding, selection)?.description}）`;
  if (recorded) output.write(`已记录的玩家观察（${target(recorded.selection)}）：${recorded.observation}\n`);
  const lines = createInterface({ input: options.input, crlfDelay: Infinity, terminal: false }), iterator = lines[Symbol.asyncIterator]();
  const cancellation = new AbortController();
  const interrupt = () => { cancellation.abort(); lines.close(); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  const readLine = async () => {
    const line = await iterator.next();
    return cancellation.signal.aborted || line.done ? undefined : line.value;
  };
  const unconfirmed = () => { output.write('未记录体验决定。\n'); return { outcome: 'unconfirmed' }; };
  try {
    output.write('若要在拒绝时记录玩家观察，请输入 changes。\n');
    output.write(canApprove ? '完成当前版本试玩后，认可请输入 approve，拒绝请输入 reject，退出请输入 cancel。\n' : '完整交付计时或费用尚未核实；当前不能确认最终完成。拒绝请输入 reject，退出请输入 cancel。\n');
    let answer = await readLine(), feedback;
    if (answer === 'changes') {
      output.write('输入体验要求编号，或输入 0 选择整体体验。输入 cancel 退出。\n');
      const selection = await readLine();
      if (selection === undefined) return unconfirmed();
      const criterion = playtestCriterion(binding, selection);
      if (criterion === undefined) return unconfirmed();
      output.write('请用一行描述试玩时观察到的情况（最多 500 字），或输入 cancel 退出。\n');
      const observation = await readLine();
      if (!validPlaytestObservation(observation)) return unconfirmed();
      feedback = { selection, criterionId: criterion?.criterionId ?? null, observation };
      output.write(`将记录的玩家观察（${target(selection)}）：${observation}\n确认拒绝当前交付并保存此观察，请输入 reject。输入 cancel 退出。\n`);
      answer = await readLine();
      if (answer !== 'reject') return unconfirmed();
    } else if (answer === undefined || !['approve', 'reject'].includes(answer.trim())) return unconfirmed();
    let result;
    try { result = await recordExperience(root, binding, answer, cancellation.signal, feedback); }
    catch (error) {
      if (error !== cancellation.signal.reason) throw error;
      return unconfirmed();
    }
    output.write(result.userExperience === 'approved' ? '体验已通过；当前报告范围内交付完成。\n' : '体验已拒绝；当前交付仍待完成。\n');
    return result;
  } finally { lines.close(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}
