import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { loadExperienceBinding, readBoundExperienceStatus, recordExperience } from '../runtime/experience.ts';

/** A final playtest decision comes from this stdin session, never from model or report text. */
export async function runExperienceSession(options: { root: string; input: Readable; output: Writable }) {
  const root = resolve(options.root), binding = await loadExperienceBinding(root), { output } = options;
  const status = await readBoundExperienceStatus(root, binding), experience = status.userExperience === 'approved' ? '已通过' : status.userExperience === 'rejected' ? '已拒绝' : '等待确认';
  output.write(`当前游戏：${binding.acceptedCandidate.candidateRef.artifactId} / ${binding.acceptedCandidate.candidateRef.version}\n试玩工程：${resolve(root, binding.acceptedCandidate.targetRoot)}\n自动验收报告：${resolve(root, binding.report.location)}\n自动验收：通过；最终体验：${experience}。\n已验收范围：\n`);
  for (const item of binding.acceptanceScope.acceptance) output.write(`- ${item.description}\n`);
  output.write('未覆盖范围：\n'); for (const item of binding.acceptanceScope.notCovered) output.write(`- ${item}\n`);
  const lines = createInterface({ input: options.input, crlfDelay: Infinity, terminal: false }), iterator = lines[Symbol.asyncIterator]();
  const cancellation = new AbortController();
  const interrupt = () => { cancellation.abort(); lines.close(); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    output.write('完成当前版本试玩后，认可请输入 approve，拒绝请输入 reject，退出请输入 cancel。\n');
    const answer = await iterator.next();
    if (cancellation.signal.aborted || answer.done || !['approve', 'reject'].includes(answer.value.trim())) {
      output.write('未记录体验决定。\n'); return { outcome: 'unconfirmed' };
    }
    let result;
    try { result = await recordExperience(root, binding, answer.value, cancellation.signal); }
    catch (error) {
      if (error !== cancellation.signal.reason) throw error;
      output.write('未记录体验决定。\n'); return { outcome: 'unconfirmed' };
    }
    output.write(result.userExperience === 'approved' ? '体验已通过；当前报告范围内交付完成。\n' : '体验已拒绝；当前交付仍待完成。\n');
    return result;
  } finally { lines.close(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}
