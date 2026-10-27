import assert from 'node:assert/strict';
import { test } from 'node:test';
import { designCandidateBudget } from './design-candidate-review-budget.fixture.mjs';

// The original frozen data stays external and read-only. Ordinary CI does not manufacture substitutes.
const sourceRoot = process.env.COS137_R3_SOURCE, confirmedRoot = process.env.COS137_CONFIRMED_SOURCE;
const modes = process.env.COS137_BUDGET_MODES?.split(',') ?? ['normal', 'correction', 'density6-correction', 'full-quote', 'full-quote-correction'];
for (const mode of modes) test(`COS137 complete R3 native fetch budget ${mode}`, { skip: !sourceRoot || !confirmedRoot }, async t => {
  const report = await designCandidateBudget(mode, { sourceRoot, confirmedRoot });
  assert.equal(report.fatal, undefined, JSON.stringify(report.fatal));
  assert.equal(report.expectedOutcomeVerified, true);
  assert.equal(report.originalStreamSimplePreserved, true);
  assert.equal(report.sourceBytes, 170142); assert.equal(report.nativeTools.length, 11);
  assert.equal(report.sourcePathVersion, 'actual-author-budget-finalization/1');
  assert.equal(report.authorSource.transports.length, 3);
  assert.equal(report.authorSource.settlements.reduce((sum, row) => sum + row.chargedMicroCny, 0), 544313);
  assert.equal(report.reviewerPolicy.maxRequests, 16);
  t.diagnostic(JSON.stringify({ report: report.reportDirectory + '/report.json', mode, verdict: report.finalTask.review.verdict,
    requests: report.admissions.map((row, index) => ({ inputBytes: row.inputBytes, bodyBytes: report.transports[index].bodyBytes,
      cap: row.maxOutputTokens, quote: row.estimatedMaxCostMicroCny, settled: report.settlements[index].chargedMicroCny, remaining: report.settlements[index].after.remaining })),
    firstRejected: report.firstRejected }));
});
