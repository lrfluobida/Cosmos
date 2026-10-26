import assert from 'node:assert/strict';
import { test } from 'node:test';
import { designReviewFixture, findings } from './design-review-budget.fixture.mjs';

for (const verdict of ['changes_requested', 'approved']) test('COS127 SDK complete ' + verdict + ' uses native compact reads and the original grant', async t => {
  const f = await designReviewFixture(t, verdict), sent = f.dispatches.filter(row => row.role === 'reviewer');
  assert.equal(f.result.state, verdict === 'approved' ? 'passed' : 'needs_changes');
  assert.equal(f.result.review.verdict, verdict); assert.deepEqual(f.result.review.inputVersions, [...f.result.inputs, ...f.result.artifacts]);
  assert.deepEqual(f.result.review.evidenceIds, ['synthetic-host']); assert.deepEqual(f.result.handoff.remaining, verdict === 'approved' ? [] : findings);
  assert.equal(sent.length, 2); assert.equal(sent[0].cap, 8192);
  const second = sent[1], selected = Math.floor((229213 - second.inputBytes * 2) / 8);
  assert.ok(selected >= 4096 && selected < 8192, JSON.stringify({ inputBytes: second.inputBytes, selected })); assert.equal(second.cap, selected);
  assert.ok(second.inputBytes * 2 + 8192 * 8 > 229213); assert.ok(second.inputBytes * 2 + (selected + 1) * 8 > 229213);
  const nativeTools = f.nativeEntries.filter(entry => entry.type === 'message' && entry.message.role === 'toolResult').map(entry => entry.message);
  const sentTools = second.context.messages.filter(message => message.role === 'toolResult');
  assert.equal(nativeTools.length, 4); assert.equal(sentTools.length, 4);
  for (const [index, original] of [...f.originals.values()].entries()) {
    const displayed = nativeTools.find(message => message.toolCallId === 'read-' + index).content;
    assert.deepEqual(displayed, sentTools.find(message => message.toolCallId === 'read-' + index).content);
    assert.ok(displayed[0].text.length < original.length - 6000);
    assert.match(displayed[0].text, /"n":9007199254740993,"n":-0\.1200e\+02/);
    assert.deepEqual(JSON.parse(displayed[0].text), JSON.parse(original));
  }
  assert.equal(f.receipts.length, 2);
  for (const [index, receipt] of f.receipts.entries()) {
    const admission = f.admissions[index];
    assert.deepEqual(Object.keys(receipt.request).sort(), ['requestId', 'modelId', 'maxOutputTokens', 'inputBytes', 'hasImages', 'estimatedMaxCostMicroCny'].sort());
    assert.deepEqual(receipt.request, admission); assert.equal(admission.inputBytes, sent[index].inputBytes); assert.equal(admission.maxOutputTokens, sent[index].cap);
    assert.equal(admission.estimatedMaxCostMicroCny, admission.inputBytes * 2 + admission.maxOutputTokens * 8);
  }
  assert.equal(f.config.requestCompaction, undefined); assert.equal(f.config.requestCompactionAdmission, undefined);
  assert.equal(f.state.ledger.limitMicroCny, 675000); assert.equal(f.state.run.fees.settledMicroCny, 445797);
  t.diagnostic(JSON.stringify({ syntheticInputBytes: second.inputBytes, cap: selected, quote: second.inputBytes * 2 + selected * 8 }));
});

for (const mode of ['raw-floor', 'compact-cap', 'below-floor', 'race']) test('COS127 SDK ' + mode + ' rejects before the next transport', async t => {
  const f = await designReviewFixture(t, mode);
  assert.notEqual(f.result.state, 'passed'); assert.equal(f.result.review.verdict, 'pending'); assert.equal(f.reviewCalls, 1);
  assert.equal(f.state.ledger.entries.filter(row => row.requestId !== 'synthetic-history-2' && row.requestId !== 'synthetic-history-3').length, 2);
  if (mode === 'raw-floor' || mode === 'compact-cap') {
    const denied = f.admissions.at(-1);
    assert.equal(denied.maxOutputTokens, mode === 'raw-floor' ? 4096 : 8192);
    assert.ok(denied.estimatedMaxCostMicroCny > 229213);
    const text = f.nativeEntries.find(entry => entry.type === 'message' && entry.message.role === 'toolResult').message.content[0].text;
    assert.equal(text.includes(' '.repeat(6000)), mode === 'raw-floor');
    t.diagnostic(JSON.stringify({ mode, inputBytes: denied.inputBytes, cap: denied.maxOutputTokens, quote: denied.estimatedMaxCostMicroCny }));
  }
  if (mode === 'raw-floor') assert.equal(f.receipts[0].request, undefined);
});

test('COS127 SDK exact measured floor remains affordable', async t => {
  const f = await designReviewFixture(t, 'floor');
  assert.equal(f.result.state, 'needs_changes'); assert.equal(f.dispatches.at(-1).cap, 4096);
});

test('COS127 SDK length with complete-looking approved JSON settles and cannot approve or retry', async t => {
  const f = await designReviewFixture(t, 'length');
  assert.notEqual(f.result.state, 'passed'); assert.equal(f.result.review.verdict, 'pending'); assert.equal(f.reviewCalls, 2);
  assert.ok(f.state.ledger.entries.every(row => row.status === 'settled')); assert.equal(f.state.run.fees.settledMicroCny, 445797);
  const final = f.nativeEntries.filter(entry => entry.type === 'message' && entry.message.role === 'assistant').at(-1).message;
  assert.equal(final.stopReason, 'error'); assert.deepEqual(final.content, []); assert.match(final.errorMessage, /truncated.*incomplete/);
  assert.equal(f.receipts.at(-1).stopReason, 'length');
});

for (const mode of ['empty-findings', 'stale']) test('COS127 SDK existing review parser rejects ' + mode + ' after only its original correction', async t => {
  const f = await designReviewFixture(t, mode);
  assert.notEqual(f.result.state, 'passed'); assert.equal(f.result.review.verdict, 'pending'); assert.equal(f.reviewCalls, 3);
});

test('COS127 SDK compact display does not extend reviewer file permissions', async t => {
  const f = await designReviewFixture(t, 'outside');
  const denied = f.nativeEntries.find(entry => entry.type === 'message' && entry.message.role === 'toolResult' && entry.message.toolCallId === 'outside').message;
  assert.equal(denied.isError, true); assert.match(JSON.stringify(denied.content), /outside allowed task paths/);
  assert.ok(f.dispatches.every(row => !JSON.stringify(row.context).includes('unauthorized')));
});
