import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createPiSession } from '../../src/providers/pi.ts';
import { parseReview } from '../../src/runtime/orchestrator.ts';
import { requestReview } from '../../src/runtime/repair/protocol.ts';
import { authorBudgetFixture } from './author-output-budget.fixture.ts';

for (const mode of ['approved', 'changes_requested', 'malformed', 'no-budget', 'partial-tool', 'visible-text',
  'mixed-usage', 'unknown', 'unselected', 'no-slot', 'request-limit', 'empty-verdict',
  'foreign-session', 'source-model-conflict', 'verdict-model-conflict', 'source-usage-conflict', 'verdict-usage-conflict'] as const) {
  test(`native design review after synthetic reasoning exhaustion: ${mode}`, async t => {
    const f = await authorBudgetFixture(t, mode === 'no-budget' ? 150000 : 675000);
    const { task } = f.input, record = join(f.root, 'review-correction.json');
    await mkdir(join(f.root, 'requirements'));
    await writeFile(join(f.root, 'requirements/v1.json'), '{"proof":"frozen-read"}', 'utf8');
    const verdict = { verdict: mode === 'approved' ? 'approved' : 'changes_requested', inputVersions: [...task.inputs, ...task.artifacts],
      evidenceIds: task.evidence.map(item => item.evidenceId), findings: mode === 'approved' ? [] : ['A recorded defect remains.'] };
    const correction = 'Return the fixed independent review JSON including every genuine defect.';
    let calls = 0, payloadFailure: unknown;
    const cap = 16384;
    t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      try {
        const body = JSON.parse(await (url instanceof Request ? url : new Request(url, init)).text());
        const n = ++calls;
        assert.ok(n <= 3);
        const tool = { index: 0, id: 'native-read', type: 'function', function: { name: 'read', arguments: '{"path":"requirements/v1.json","offset":null,"limit":null}' } };
        const reasoning = 'Synthetic incomplete reasoning.';
        let delta: object, finish: string;
        if (n === 1) {
          delta = { tool_calls: [tool] }; finish = 'tool_calls';
        } else if (n === 2) {
          assert.equal(body.thinking.type, 'enabled');
          assert.ok(body.messages.some((m: { content?: string }) => m.content === '{"proof":"frozen-read"}'));
          delta = { reasoning_content: reasoning, ...(mode === 'partial-tool' ? { tool_calls: [{ ...tool, id: 'partial', function: { name: 'read', arguments: '{"path":' } }] } : {}),
            ...(mode === 'visible-text' ? { content: '{"verdict":' } : {}) };
          finish = 'length';
        } else {
          const saved = JSON.parse(await readFile(record, 'utf8'));
          assert.equal(saved.used, 1);
          assert.equal(saved.reviewerId, reviewer.actorId);
          assert.equal(saved.contextId, reviewer.contextId);
          assert.equal(body.thinking.type, 'disabled');
          assert.equal(body.tools?.length ?? 0, 0);
          assert.ok(!JSON.stringify(body.messages).includes(reasoning));
          assert.ok(body.messages.some((m: { content?: string }) => m.content === '{"proof":"frozen-read"}'));
          assert.ok(JSON.stringify(body.messages).includes('Independently review the fixed inputs.'));
          assert.ok(JSON.stringify(body.messages.at(-1).content).includes(correction));
          delta = { content: mode === 'empty-verdict' ? '' : mode === 'malformed' ? '{}' : JSON.stringify(verdict) };
          finish = 'stop';
        }
        const output = n === 2 ? body.max_tokens : 10;
        const usage = { prompt_tokens: 30, completion_tokens: output, total_tokens: output + 30,
          completion_tokens_details: { reasoning_tokens: n === 2 ? output - (mode === 'mixed-usage' ? 1 : 0) : 0 } };
        const chunk = { id: 'offline-review', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: finish }],
          ...(n === 2 && mode === 'unknown' ? {} : { usage }) };
        const conflict = mode === 'source-model-conflict' && n === 2 || mode === 'verdict-model-conflict' && n === 3;
        const badUsage = mode === 'source-usage-conflict' && n === 2 || mode === 'verdict-usage-conflict' && n === 3;
        let firstChunk = conflict ? `data: ${JSON.stringify({ ...chunk, model: 'different-model', choices: [], usage: undefined })}\n\n` : '';
        if (badUsage) {
          firstChunk = `data: ${JSON.stringify({ ...chunk, choices: [], usage: { prompt_tokens: 30, completion_tokens: 0 } })}\n\n`;
          Object.assign(chunk.choices[0], { usage: { ...usage, prompt_tokens: undefined } });
          delete chunk.usage;
        }
        return new Response(`${firstChunk}data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
      } catch (error) { payloadFailure = error; throw error; }
    });
    const reviewer = await f.create({ ordinaryDesignReviewBudget: () => mode !== 'unselected', ordinaryDesignReviewMaxOutputTokens: cap,
      maxRequests: mode === 'request-limit' ? 2 : 3, sessionFactory: createPiSession }, { ...f.input, role: 'reviewer' });
    const other = mode === 'foreign-session' ? await f.create({ ordinaryDesignReviewBudget: () => true, sessionFactory: createPiSession },
      { ...f.input, role: 'reviewer', stateDirectory: join(f.root, 'other-reviewer') }) : undefined;
    const result = requestReview({ reviewer: other ? { ...other, prompt: reviewer.prompt } : reviewer,
      controller: f.controller, taskId: task.taskId, attemptId: 'attempt-1',
      correctionRecordPath: record, maxCorrections: mode === 'no-slot' ? 0 : 1, signal: new AbortController().signal,
      parse: text => parseReview(text, task), prompt: 'Independently review the fixed inputs.', correctionPrompt: correction });
    if (mode === 'approved' || mode === 'changes_requested') assert.deepEqual(await result.catch(error => { throw payloadFailure ?? error; }), verdict);
    else await assert.rejects(result);
    assert.ifError(payloadFailure);
    const corrected = ['approved', 'changes_requested', 'malformed', 'empty-verdict', 'verdict-model-conflict', 'verdict-usage-conflict'].includes(mode);
    assert.equal(calls, corrected ? 3 : 2);
    if (corrected || mode === 'no-budget') assert.equal(JSON.parse(await readFile(record, 'utf8')).used, 1);
    else await assert.rejects(readFile(record), { code: 'ENOENT' });
    const state = await f.controller.read();
    assert.equal(state.ledger.entries.length, calls);
    assert.equal(state.ledger.entries.at(-1)?.status, mode === 'unknown' || mode.endsWith('-conflict') ? 'unknown' : 'settled');
    if (corrected) {
      const files = (await readdir(f.input.stateDirectory)).filter(file => file.endsWith('.jsonl'));
      assert.equal(files.length, 1);
      const entries = (await readFile(join(f.input.stateDirectory, files[0]), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.ok(entries.some(entry => entry.message?.stopReason === 'length' && entry.message.usage.reasoning === cap && entry.message.content.length === 0));
    }
  });
}
