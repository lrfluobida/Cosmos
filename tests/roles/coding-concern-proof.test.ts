import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCodingConcernReview } from '../../src/runtime/repair/coding-concerns.ts';
import type { CodingConcernReview, ReviewProposal } from '../../src/runtime/repair/coding-concerns.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { ExecutionRequirement } from '../../src/roles/execution-input.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { task as fixtureTask, requirement as fixtureRequirement } from '../contracts/fixtures.ts';

function setup() {
  const task = fixtureTask() as unknown as TaskContract, requirement = fixtureRequirement() as ExecutionRequirement;
  task.evidence[0].artifactVersions = [...task.inputs, ...task.artifacts];
  const proposal = { summary: 'Offline proposal only', remaining: [], uncertainty: ['当前证据必须逐项解决'] };
  const packet: CodingConcernReview = { taskId: task.taskId, attemptId: task.attempts[0].attemptId, authorId: task.authorId, contextId: task.context.contextId,
    originalProposal: proposal, originalProposalSha256: 'offline', proposal, proposalSha256: 'offline', signature: [], capturedAt: '2026-10-01T00:59:00.000Z',
    concerns: [{ concernId: 'coding-concern-1', text: proposal.uncertainty[0], source: 'original', index: 0 }] };
  const verdict: ReviewProposal = { verdict: 'approved', inputVersions: [...task.inputs, ...task.artifacts], evidenceIds: ['evidence-1'], findings: [],
    concernResolutions: [{ concernId: 'coding-concern-1', concernText: proposal.uncertainty[0], status: 'resolved', basis: 'host_evidence',
      rationale: 'Offline independent resolution references current proof.', acceptanceIds: ['AC-1'], inputVersions: [...task.inputs, ...task.artifacts],
      evidenceIds: ['evidence-1'], evidenceRefs: [task.evidence[0].source] }] };
  const parse = (value = verdict) => parseCodingConcernReview(JSON.stringify(value), task, requirement, packet, (text, fixed) => {
    const base = JSON.parse(text);
    if (!sameValue(base.inputVersions, [...fixed.inputs, ...fixed.artifacts]) || !base.evidenceIds.length) throw new Error('Invalid base review');
    return base;
  });
  return { task, requirement, packet, verdict, parse };
}

test('typed resolutions accept current passed host evidence and explicit current requirement sources', () => {
  const f = setup(); assert.equal(f.parse().verdict, 'approved');
  Object.assign(f.verdict.concernResolutions![0], { basis: 'fixed_input', inputVersions: f.requirement.sources, evidenceIds: [], evidenceRefs: [] });
  assert.equal(f.parse().verdict, 'approved');
});

for (const defect of ['missing', 'duplicate', 'wrong-id', 'wrong-text', 'empty-rationale', 'unknown-ac', 'duplicate-ac', 'wrong-version',
  'old-window-evidence', 'before-capture', 'future-proof', 'wrong-source', 'unknown-evidence', 'unselected-evidence', 'observed-proof', 'failed-host', 'unresolved', 'extra-field',
  'fixed-output', 'fixed-old-source', 'fixed-evidence', 'empty-proof', 'malformed'] as const) test(`concern resolution rejects ${defect}`, () => {
  const f = setup(), row = f.verdict.concernResolutions![0];
  if (defect === 'missing') f.verdict.concernResolutions = [];
  else if (defect === 'duplicate') f.verdict.concernResolutions!.push(structuredClone(row));
  else if (defect === 'wrong-id') row.concernId = 'other';
  else if (defect === 'wrong-text') row.concernText = '改写原始事实';
  else if (defect === 'empty-rationale') row.rationale = ' ';
  else if (defect === 'unknown-ac') row.acceptanceIds = ['new-ac'];
  else if (defect === 'duplicate-ac') row.acceptanceIds.push('AC-1');
  else if (defect === 'wrong-version') row.inputVersions = row.inputVersions.map(ref => ({ ...ref, version: 'v0' }));
  else if (defect === 'old-window-evidence') f.task.evidence[0].recordedAt = '2026-09-30T00:00:00.000Z';
  else if (defect === 'before-capture') f.task.evidence[0].recordedAt = '2026-10-01T00:30:00.000Z';
  else if (defect === 'future-proof') f.task.evidence[0].recordedAt = new Date(Date.now() + 60_000).toISOString();
  else if (defect === 'wrong-source') row.evidenceRefs = [{ ...row.evidenceRefs[0], location: 'old/report.json' }];
  else if (defect === 'unknown-evidence') row.evidenceIds = ['invented-author-assertion'];
  else if (defect === 'unselected-evidence') f.verdict.evidenceIds = ['other-proof'];
  else if (defect === 'observed-proof') f.task.evidence[0].outcome = 'observed';
  else if (defect === 'failed-host') f.task.evidence[0].outcome = 'failed';
  else if (defect === 'unresolved') row.status = 'unresolved';
  else if (defect === 'extra-field') Object.assign(row, { authorApproved: true });
  else if (defect.startsWith('fixed-')) {
    row.basis = 'fixed_input'; row.inputVersions = f.requirement.sources; row.evidenceIds = []; row.evidenceRefs = [];
    if (defect === 'fixed-output') row.inputVersions = f.task.artifacts;
    else if (defect === 'fixed-old-source') row.inputVersions = [{ ...f.requirement.sources[0], version: 'old' }];
    else row.evidenceIds = ['evidence-1'];
  } else if (defect === 'empty-proof') { row.evidenceIds = []; row.evidenceRefs = []; }
  else (f.verdict as any).concernResolutions = [null];
  assert.throws(() => f.parse());
});

test('genuine unresolved concern remains explicit in a changes-requested decision', () => {
  const f = setup(); f.verdict.verdict = 'changes_requested'; f.verdict.findings = ['原始 concern 仍未解决']; f.verdict.concernResolutions![0].status = 'unresolved';
  assert.equal(f.parse().concernResolutions![0].status, 'unresolved');
});
