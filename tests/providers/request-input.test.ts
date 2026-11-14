import assert from 'node:assert/strict';
import test from 'node:test';
import type { Context, ToolResultMessage } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { requestInputBytes, withRecentReadResults } from '../../src/providers/request-input.ts';
import type { PiRequest } from '../../src/providers/pi.ts';
import { outputLimitFixture } from './request-output-limit.fixture.mjs';

const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function readHistory(rows: { args: Record<string, string | number | null>; text?: string; name?: string; error?: boolean; content?: ToolResultMessage['content'] }[]): Context {
  return { messages: rows.flatMap((row, index): Context['messages'] => [
    { role: 'assistant', content: [{ type: 'toolCall', id: String(index), name: row.name ?? 'read', arguments: row.args }],
      api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', usage, stopReason: 'toolUse', timestamp: 0 },
    { role: 'toolResult', toolCallId: String(index), toolName: row.name ?? 'read',
      content: row.content ?? [{ type: 'text', text: row.text ?? '独立正文。'.repeat(600) }], isError: row.error ?? false, timestamp: 0 },
  ]) };
}

test('feedback reads retain independent dependencies and adjacent source pages', () => {
  const context = readHistory([
    { args: { path: 'phaser/WebAudioSound.js', offset: 1, limit: 400 } },
    { args: { path: 'phaser/BaseSoundManager.js' } },
    { args: { path: 'phaser/WebAudioSound.js', offset: 401, limit: 400 } },
    { args: { path: 'src/audioObserve.ts' } },
  ]);
  assert.deepEqual(withRecentReadResults(context), context);
});

test('feedback reads omit only earlier identical successful reads with equal parsed arguments', () => {
  const context = readHistory([
    { args: { path: 'phaser/source.js', offset: 1, limit: 400 } },
    { args: { limit: 400, path: 'phaser/source.js', offset: 1 } },
    { args: { path: 'phaser/source.js', offset: 1, limit: 400 } },
  ]), original = structuredClone(context), projected = withRecentReadResults(context);
  for (const index of [1, 3]) {
    const [block] = (projected.messages[index] as ToolResultMessage).content;
    assert.equal(block.type, 'text');
    if (block.type === 'text') assert.match(block.text, /identical.*later/i);
  }
  assert.deepEqual(projected.messages[5], context.messages[5]);
  assert.deepEqual(context, original);
});

test('feedback reads preserve changed bytes, different modes, errors and non-text content', () => {
  for (const middle of [
    { args: { path: 'source.js' }, name: 'write' },
    { args: { path: 'source.js' }, name: 'edit', error: true },
    { args: { path: 'source.js' }, error: true },
  ]) {
    const context = readHistory([{ args: { path: 'source.js' } }, middle, { args: { path: 'source.js' } }]);
    assert.deepEqual(withRecentReadResults(context), context);
  }
  for (const content of [
    [{ type: 'image' as const, data: 'AA==', mimeType: 'image/png' }],
    [{ type: 'text' as const, text: '正文'.repeat(1000) }, { type: 'image' as const, data: 'AA==', mimeType: 'image/png' }],
    [{ type: 'unknown', value: '未知结果保留' }] as unknown as ToolResultMessage['content'],
  ]) {
    const context = readHistory([{ args: { path: 'source.js' }, content }, { args: { path: 'source.js' }, content }]);
    assert.deepEqual(withRecentReadResults(context), context);
  }
  const context = readHistory([
    { args: { path: 'source.js', offset: 1 }, text: '旧正文'.repeat(1000) },
    { args: { path: 'source.js', offset: 1 }, text: '新正文'.repeat(1000) },
    { args: { path: 'source.js', planOffset: 1 } },
    { args: { path: 'source.js', offset: null } },
    { args: { path: 'source.js' } },
  ]);
  assert.deepEqual(withRecentReadResults(context), context);
});
function richContext(): Context {
  const tool = { name: 'inspect', description: '保留工具说明 details', parameters: Type.Object({ details: Type.String({ description: '保留参数' }) }) };
  return { systemPrompt: '保留系统提示', tools: [tool], messages: [
    { role: 'system', content: '保留系统消息', sections: { details: '保留 section' }, toolsAdded: [tool], timestamp: 0 },
    Object.assign({ role: 'user' as const, content: '用户文本 {"details":"保留"}', timestamp: 0 }, { details: '其他 role 元数据保留' }),
    Object.assign({ role: 'assistant' as const, content: [{ type: 'toolCall' as const, id: 'tool-1', name: 'inspect', arguments: { details: '调用参数保留' } }],
      api: 'openai-completions' as const, provider: 'deepseek', model: 'deepseek-flash', usage, stopReason: 'toolUse' as const, timestamp: 0 }, { details: '助手元数据保留' }),
    { role: 'toolResult', toolCallId: 'tool-1', toolName: 'inspect', content: [
      { type: 'text', text: '{"details":{"中文":"内容必须保留"}}' }, { type: 'image', data: 'AA==', mimeType: 'image/png' },
    ], isError: false, usage, nestedCalls: { calls: [{ id: 'inner', name: 'inspect', arguments: { details: '嵌套调用保留' }, status: 'ok' }], complete: true }, timestamp: 0 },
  ] };
}

test('input quote without toolResult details preserves all original UTF-8 bytes', () => {
  const context = richContext();
  assert.equal(requestInputBytes(context), Buffer.byteLength(JSON.stringify(context)));
});

test('input quote excludes only top-level toolResult details without mutating the context', () => {
  const context = richContext(), baseline = requestInputBytes(context);
  const result = context.messages.at(-1) as ToolResultMessage;
  result.details = { note: '宿主元数据'.repeat(20000), details: '仅此顶层字段随之排除' };
  const original = JSON.stringify(context);
  Object.freeze(result); Object.freeze(context.messages); Object.freeze(context);
  assert.equal(requestInputBytes(context), baseline);
  assert.equal(Buffer.byteLength(original) - baseline, Buffer.byteLength(`,"details":${JSON.stringify(result.details)}`));
  assert.equal(JSON.stringify(context), original);
});

test('image, tool schema and arguments remain in the live quote and original dispatch context', async t => {
  const f = await outputLimitFixture(t), context = richContext();
  (context.messages.at(-1) as ToolResultMessage).details = { note: '宿主保留' };
  const original = JSON.stringify(context);
  await f.create({ requestOutputLimit: async () => 4096 });
  await f.dispatch(context);
  assert.equal(f.admissions[0].inputBytes, requestInputBytes(context));
  assert.equal(f.admissions[0].hasImages, true);
  assert.equal(f.admissions[0].estimatedMaxCostMicroCny, 2_032_768);
  assert.equal(JSON.stringify(f.dispatches[0].context), original);
  assert.equal(JSON.stringify(context), original);
});

for (const stage of ['policy', 'admission', 'final-window']) test(`toolResult details drift during ${stage} still rejects the full input identity`, async t => {
  const f = await outputLimitFixture(t), context = richContext();
  const result = context.messages.at(-1) as ToolResultMessage;
  result.details = { note: '原元数据' };
  const originalBytes = requestInputBytes(context);
  let windows = 0;
  const mutate = () => { result.details = { note: '变更元数据' }; };
  await f.create({ requestOutputLimit: async () => { if (stage === 'policy') { await Promise.resolve(); mutate(); } return 4096; },
    requestWindow: async () => { if (++windows === 2 && stage === 'final-window') mutate(); return { deadlineAt: Date.now() + 10000, cleanupMs: 100 }; },
    budget: { ...f.config.budget, beforeRequest: async (request: PiRequest) => { f.admissions.push(request); if (stage === 'admission') { await Promise.resolve(); mutate(); } } },
  });
  await assert.rejects(f.dispatch(context), /input.*changed/i);
  assert.equal(requestInputBytes(context), originalBytes, 'unchanged quote must not weaken the full identity check');
  assert.equal(f.dispatches.length, 0);
  if (stage === 'policy') assert.equal(f.admissions.length, 0);
  else assert.equal(f.settlements[0].outcome, 'not_sent');
});
