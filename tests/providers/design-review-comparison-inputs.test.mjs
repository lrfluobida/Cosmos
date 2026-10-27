import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { designCandidateBudget } from './design-candidate-review-budget.fixture.mjs';
import { reuse4Profile } from './design-review-comparison-inputs.fixture.mjs';

// External frozen files are read only; every controller, ledger and receipt belongs to a new TEMP run.
const sourceRoot = process.env.COS138_REVIEW_SOURCE, confirmedRoot = process.env.COS138_CONFIRMED_SOURCE;
const modes = process.env.COS138_REPLAY_MODES?.split(',') ?? ['normal', 'correction'];
for (const mode of modes) test(`COS138 original comparison review native replay ${mode}`, { skip: !sourceRoot || !confirmedRoot }, async t => {
  assert.ok(['normal', 'correction'].includes(mode));
  const replayProfile = await reuse4Profile({ sourceRoot, malformed: mode === 'correction' });
  replayProfile.evidence.fixtureSources = await Promise.all(['design-candidate-review-budget.fixture.mjs', 'design-review-comparison-inputs.fixture.mjs', 'design-review-comparison-inputs.test.mjs'].map(async name => {
    const path = fileURLToPath(new URL(name, import.meta.url));
    return { path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') };
  }));
  const report = await designCandidateBudget(mode, { sourceRoot, confirmedRoot, replayProfile });
  assert.equal(report.fatal, undefined, JSON.stringify(report.fatal)); assert.equal(report.expectedOutcomeVerified, true);
  assert.equal(report.initialSettledMicroCny, 609422); assert.equal(report.initialAvailableMicroCny, 515578);
  assert.equal(report.authorSource.transports.length, 3); assert.equal(report.admissions.length, 4); assert.equal(report.nativeTools.length, 5);
  assert.equal(report.originalStreamSimplePreserved, true); assert.equal(report.replay.nativeVerification.preservedUsageCacheReasoning, true);
  assert.equal(report.settlements.reduce((sum, row) => sum + row.chargedMicroCny, 0), 143737);
  assert.equal(report.settlements.at(-1).after.remaining, 371841);
  if (mode === 'normal') {
    assert.equal(report.finalTask.review.verdict, 'changes_requested'); assert.equal(report.replay.nativeVerification.exactNormalVerdict, true);
    assert.equal(report.reviewReceipt.value.verdict.findings.length, 8); assert.equal(report.reviewReceipt.value.verdict.concernResolutions.length, 2);
  } else assert.equal(report.firstRejected.rejected.code, 'review_output_budget');
  t.diagnostic(JSON.stringify({ report: report.reportDirectory + '/report.json', mode,
    requests: report.admissions.map((row, index) => ({ inputBytes: row.inputBytes, bodyBytes: report.transports[index].bodyBytes,
      cap: row.maxOutputTokens, quote: row.estimatedMaxCostMicroCny, settled: report.settlements[index].chargedMicroCny, remaining: report.settlements[index].after.remaining })),
    firstRejected: report.firstRejected }));
});
