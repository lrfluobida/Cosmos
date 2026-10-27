import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
export async function reuse4Profile({ sourceRoot, malformed = false }) {
  const nativePath = join(sourceRoot, 'sessions/4560c67b-5cb2-4b93-b4c3-0293f073c6f5/review/2026-10-27T07-56-25-418Z_01a17c5c-49ca-708d-b827-062557852e28.jsonl');
  const bytes = await readFile(nativePath), lines = decode(bytes).trim().split('\n');
  const lineNumbers = [6, 9, 12, 14], originals = lineNumbers.map(line => JSON.parse(lines[line - 1]).message);
  const rawVerdict = originals[3].content.find(block => block.type === 'text').text;
  assert.equal(Buffer.byteLength(rawVerdict), 10077);
  assert.equal(hash(rawVerdict), '739be822b7636f08e462e25bbf56467393bcbdc40936183c627a2f7939dec20b');
  const verdict = JSON.parse(rawVerdict);
  assert.equal(verdict.verdict, 'changes_requested'); assert.equal(verdict.findings.length, 8); assert.equal(verdict.concernResolutions.length, 2);
  const sourceReviewRoot = sourceRoot.replaceAll('\\', '/') + '/reviews/design-room-game';
  const originalCalls = originals.flatMap(message => message.content.filter(block => block.type === 'toolCall'));
  const readCalls = originalCalls.map(call => {
    assert.equal(call.name, 'read'); assert.ok(call.arguments.path.startsWith(sourceReviewRoot + '/'));
    assert.equal(call.arguments.offset, 1); assert.equal(call.arguments.limit, 2000);
    return { id: call.id, path: call.arguments.path.slice(sourceReviewRoot.length + 1), originalArguments: structuredClone(call.arguments) };
  });
  assert.equal(readCalls.length, 5);
  assert.deepEqual(originals.map(message => message.content.filter(block => block.type === 'toolCall').length), [2, 2, 1, 0]);
  const usage = originals.map(message => ({ prompt_tokens: message.usage.input + message.usage.cacheRead,
    completion_tokens: message.usage.output, prompt_cache_hit_tokens: message.usage.cacheRead,
    completion_tokens_details: { reasoning_tokens: message.usage.reasoning }, total_tokens: message.usage.totalTokens }));
  const cost = row => Math.ceil((row.prompt_tokens - row.prompt_cache_hit_tokens) * 2 + row.completion_tokens * 8 + row.prompt_cache_hit_tokens * 0.04);
  assert.deepEqual(usage.map(cost), [14582, 18160, 77591, 33404]);
  const malformedVerdict = rawVerdict.slice(0, rawVerdict.lastIndexOf('}')) + ',"cos138SyntheticMalformed":true' + rawVerdict.slice(rawVerdict.lastIndexOf('}'));
  const { cos138SyntheticMalformed, ...retained } = JSON.parse(malformedVerdict);
  assert.equal(cos138SyntheticMalformed, true); assert.deepEqual(retained, verdict);
  const evidence = {
    kind: 'reuse4-comparison-inputs-native-replay/1', sourceNative: nativePath, sourceNativeSha256: hash(bytes), sourceLineNumbers: lineNumbers,
    originalRawVerdict: { bytes: 10077, sha256: hash(rawVerdict), findings: 8, concerns: 2, transformedForNormal: false },
    malformed: malformed ? { scope: 'Synthetic negative only: append one unknown top-level field; retain every original field and conclusion.',
      addedField: 'cos138SyntheticMalformed', bytes: Buffer.byteLength(malformedVerdict), sha256: hash(malformedVerdict) } : null,
    originalUsage: originals.map(message => message.usage), replayedSseUsage: usage, expectedReviewCostMicroCny: 143737,
    originalAssistantContent: originals.map((message, index) => ({ line: lineNumbers[index], bytes: Buffer.byteLength(JSON.stringify(message.content)),
      sha256: hash(JSON.stringify(message.content)), thinkingBytes: Buffer.byteLength(message.content.filter(block => block.type === 'thinking').map(block => block.thinking).join('')) })),
    pathMappings: [], nativeVerification: null,
    identityPolicy: 'Reuse only the task-local name design-room-game and fixed relative artifact references. Run, ledger, author, reviewer, attempt and native entry identities are new. Only read tool argument absolute prefixes map from the historical frozen mirror to the new TEMP frozen mirror; raw normal verdict and all other content remain unchanged.',
  };
  const contentFor = (index, workspace, recordMappings = false) => originals[index].content.map(block => {
    const value = structuredClone(block);
    if (value.type === 'toolCall') {
      const read = readCalls.find(call => call.id === value.id), mapped = workspace.replaceAll('\\', '/') + '/' + read.path;
      if (recordMappings) evidence.pathMappings.push({ toolCallId: read.id, sourcePath: value.arguments.path, tempPath: mapped, retainedArguments: { offset: value.arguments.offset, limit: value.arguments.limit } });
      value.arguments.path = mapped;
    }
    if (value.type === 'text' && index === 3 && malformed) value.text = malformedVerdict;
    return value;
  });
  return {
    taskId: 'design-room-game', sourceBytes: 170445,
    outputSha256: ['ff8eb94a0944fa353e31e0ead807e2742ede7168ee6af4c39dd59874a023415b', 'dde82944f9d60b55738b9fc65fac685e86560f97717da1bcba2d891a9a4309af'],
    remainingCount: 0, uncertaintyCount: 2, authorSettled: 609422,
    authorFinalizationUsage: { prompt_tokens: 62019, prompt_cache_hit_tokens: 25, completion_tokens: 765 },
    authorUsageAssumption: 'New TEMP synthetic author only: ordinary240000 + ordinary239313 + readonly130109 =609422 microCNY. Readonly uncached input61994, cacheRead25, output765: ceil(61994*2 +25*0.04 +765*8)=130109. No imported charge and no claim this is R4 actual author usage.',
    usageAssumption: 'Replay all four historical reviewer response usage/cache/reasoning values unchanged through fake SSE in a new TEMP run. Their existing pricing yields14582+18160+77591+33404=143737 microCNY. New request sizes, reservations, identities, host evidence and ledger admissions are measured independently.',
    findings: verdict.findings, readCalls, cumulativeReads: [0, 2, 4, 5], sentRequests: 4, evidence,
    async response(index, { packet, workspace }) {
      assert.ok(index < 4, 'A correction request must be denied before a fifth fetch.');
      assert.deepEqual(packet.inputs, verdict.inputVersions);
      assert.deepEqual(packet.evidence.map(row => row.evidenceId), verdict.evidenceIds);
      assert.deepEqual(packet.designConcernReview.concerns.map(item => packet.designConcernReview.proposal[item.field][item.index]), verdict.concernResolutions.map(row => row.concernText));
      const content = contentFor(index, workspace, true), delta = {}, deltas = [], calls = [];
      for (const block of content) {
        if (block.type === 'text') { delta.content = (delta.content ?? '') + block.text; deltas.push({ content: block.text }); }
        else if (block.type === 'thinking') { assert.equal(block.thinkingSignature, 'reasoning_content'); delta.reasoning_content = (delta.reasoning_content ?? '') + block.thinking; deltas.push({ reasoning_content: block.thinking }); }
        else if (block.type === 'toolCall') {
          const call = { index: calls.length, id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.arguments) } };
          calls.push(call); deltas.push({ tool_calls: [call] });
        }
        else throw new Error('Unexpected original assistant content block.');
      }
      if (calls.length) delta.tool_calls = calls;
      if (index === 3 && !malformed) { assert.equal(delta.content, rawVerdict); assert.equal(hash(delta.content), evidence.originalRawVerdict.sha256); }
      return { delta, deltas, finish_reason: originals[index].stopReason === 'toolUse' ? 'tool_calls' : 'stop', usage: structuredClone(usage[index]) };
    },
    async verifyNative({ sessionFile, transports, settlements, nativeTools, packet, workspace }) {
      const nativeBytes = await readFile(sessionFile), entries = decode(nativeBytes).trim().split('\n').map(line => JSON.parse(line));
      const assistants = entries.filter(row => row.message?.role === 'assistant' && row.message.stopReason !== 'error').map(row => row.message);
      assert.equal(assistants.length, 4); assert.equal(transports.length, 4); assert.equal(settlements.length, 4);
      for (const [index, actual] of assistants.entries()) {
        assert.deepEqual(actual.content, contentFor(index, workspace));
        for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens']) assert.equal(actual.usage[key], originals[index].usage[key]);
        assert.equal(settlements[index].chargedMicroCny, cost(usage[index]));
        const body = JSON.parse(decode(await readFile(transports[index].bodyFile)));
        assert.ok(body.messages.find(message => message.role === 'system').content.includes(JSON.stringify(packet)));
        const sentAssistants = body.messages.filter(message => message.role === 'assistant'); assert.equal(sentAssistants.length, index);
        for (let prior = 0; prior < index; prior++) {
          const expected = contentFor(prior, workspace), sent = sentAssistants[prior];
          assert.equal(sent.content ?? '', expected.filter(block => block.type === 'text').map(block => block.text).join(''));
          assert.equal(sent.reasoning_content ?? '', expected.filter(block => block.type === 'thinking').map(block => block.thinking).join(''));
          assert.deepEqual((sent.tool_calls ?? []).map(call => ({ id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) })),
            expected.filter(block => block.type === 'toolCall').map(call => ({ id: call.id, name: call.name, arguments: call.arguments })));
        }
      }
      assert.equal(settlements.reduce((sum, row) => sum + row.chargedMicroCny, 0), 143737);
      assert.equal(evidence.pathMappings.length, 5);
      assert.deepEqual(nativeTools.map(row => row.path), readCalls.map(row => row.path));
      assert.deepEqual(nativeTools.slice(0, 4).map(row => row.readBytes), [34585, 680, 18111, 44201]);
      assert.ok(nativeTools.every(row => !row.isError && !row.truncated));
      const actualRaw = assistants[3].content.find(block => block.type === 'text').text;
      assert.equal(actualRaw, malformed ? malformedVerdict : rawVerdict);
      evidence.nativeVerification = { nativeFileBytes: nativeBytes.length, nativeFileSha256: hash(nativeBytes), assistants: assistants.map(message => ({
        contentBytes: Buffer.byteLength(JSON.stringify(message.content)), contentSha256: hash(JSON.stringify(message.content)), usage: message.usage })),
        preservedThinking: true, preservedText: !malformed, preservedUsageCacheReasoning: true, exactNormalVerdict: !malformed,
        readCount: 5, readSourceBytes: nativeTools.reduce((sum, row) => sum + row.sourceBytes, 0), readDisplayBytes: nativeTools.reduce((sum, row) => sum + row.readBytes, 0) };
    },
  };
}
