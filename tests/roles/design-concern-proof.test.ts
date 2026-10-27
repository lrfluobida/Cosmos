import assert from 'node:assert/strict';
import { test } from 'node:test';
import { designConcernPacket, indexDesignConcerns, parseDesignConcernReview } from '../../src/runtime/repair/design-concerns.ts';
import { task as taskFixture, requirement as requirementFixture } from '../contracts/fixtures.ts';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';

test('design concern record authenticates origin, proposal, capture and fixed source bytes on reuse', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos137-proof-')); t.after(() => rm(root, { recursive: true, force: true }));
  const task: any = taskFixture(), requirement: any = requirementFixture(), prepared = { task: structuredClone(task), role: 'design' as const, workspace: root };
  const now = new Date().toISOString(), proposal = { summary: '作者原文不改。', remaining: ['待核'], uncertainty: ['', '待核'] };
  task.attempts = [{ attemptId: 'candidate-attempt', sessionRef: join(root, 'sessions/candidate-attempt'), startedAt: now, endedAt: null, outcome: 'running', failure: null }];
  task.artifacts = [{ artifactId: 'design', version: 'v1', location: 'registry/captures/design/v1/files/design.json' }];
  for (const ref of [...requirement.sources, ...task.inputs, ...task.context.interfaces, ...task.artifacts]) { const path = join(root, ref.location); await mkdir(dirname(path), { recursive: true }); await writeFile(path, '{"完整":"固定输入"}', 'utf8'); }
  const journal = await TaskJournal.open({ journalRoot: join(root, 'journal'), artifactRoot: root }, { formatVersion: 1, runId: task.runId, ledgerId: task.budget.ledgerId,
    originalStartedAt: now, originalDeadlineAt: task.budget.originalDeadlineAt, limitMicroCny: task.budget.allocationMicroCny, requirement, prepared,
    reviewProtocolCorrections: 1, authorProtocolCorrections: 1, ordinaryDesignRevisionPolicy: 'independent-review/2', artifactRoot: root, sessionRoot: join(root, 'sessions') }, false);
  await journal.write('author', task.attempts[0].attemptId, { proposal, signature: await journal.signature(task.inputs) });
  await journal.write('capture', task.attempts[0].attemptId, { captured: { artifacts: task.artifacts, reviewWorkspace: join(root, 'reviews') }, capturedAt: now, signature: await journal.signature(task.artifacts) });
  const input = { artifactRoot: root, task, requirement, journal, workspace: root, proposal, parseProposal: JSON.parse };
  const packet = await designConcernPacket(input); assert.deepEqual(packet.proposal, proposal); assert.equal(packet.concerns.length, 3);
  assert.deepEqual(await designConcernPacket({ ...input, reuse: true }), packet);
  for (const key of ['authorId', 'context']) {
    const changed = structuredClone(task); if (key === 'authorId') changed.authorId = 'another-author'; else changed.context.contextId = 'another-context';
    await assert.rejects(designConcernPacket({ ...input, task: changed }));
  }
  for (const path of [`journal/task-${task.taskId}/author.json`, `journal/task-${task.taskId}/capture.json`, `journal/task-${task.taskId}/design-concerns.json`, task.artifacts[0].location]) {
    const full = join(root, path), original = await readFile(full); await writeFile(full, '{}', 'utf8');
    try { await assert.rejects(designConcernPacket({ ...input, reuse: true })); } finally { await writeFile(full, original); }
  }
  await journal.write('author-correction-response', task.attempts[0].attemptId, { reply: '{}' });
  await assert.rejects(designConcernPacket(input), /correction source is incomplete/);
});

test('design concern indices preserve remaining, uncertainty, duplicates and empty text', () => {
  const proposal = { summary: '完整中文原文', remaining: ['同一文字', ''], uncertainty: ['同一文字', '未知'] };
  const before = structuredClone(proposal);
  assert.deepEqual(indexDesignConcerns(proposal), [
    { concernId: 'design-concern-1', field: 'remaining', index: 0 }, { concernId: 'design-concern-2', field: 'remaining', index: 1 },
    { concernId: 'design-concern-3', field: 'uncertainty', index: 0 }, { concernId: 'design-concern-4', field: 'uncertainty', index: 1 },
  ]); assert.deepEqual(proposal, before);
});

test('design resolution parser binds current text, captures and host evidence', () => {
  const task: any = taskFixture(), requirement: any = requirementFixture(), now = new Date().toISOString();
  task.artifacts = [{ artifactId: 'design', version: 'v2', location: 'registry/captures/design/v2/files' }];
  task.context.interfaces = [{ artifactId: 'design', version: 'v1', location: 'registry/captures/design/v1/files' }];
  task.evidence = [{ evidenceId: 'host', taskId: task.taskId, outcome: 'passed', recordedAt: now, acceptanceIds: task.acceptanceIds,
    artifactVersions: [...task.inputs, ...task.artifacts], source: { artifactId: 'report', version: 'v2', location: 'evidence/report.json' } }];
  const proposal = { summary: '原始报告', remaining: ['检查顺序'], uncertainty: ['检查结构'] }, packet: any = { proposal, concerns: indexDesignConcerns(proposal), capturedAt: now, capture: task.artifacts[0] };
  const make = (basis: string): any => ({ verdict: 'approved', findings: [], inputVersions: [...task.inputs, ...task.artifacts], evidenceIds: ['host'],
    concernResolutions: packet.concerns.map((concern: any) => ({ concernId: concern.concernId, concernText: proposal[concern.field as 'remaining' | 'uncertainty'][concern.index], status: 'resolved', basis,
      rationale: 'AC-1: final design.json and actual host report establish this specific order/structure; complete requirements remain the scope.', acceptanceIds: task.acceptanceIds,
      inputVersions: basis === 'fixed_input' ? task.inputs : basis === 'captured_output' ? task.artifacts : [...task.inputs, ...task.artifacts],
      evidenceIds: basis === 'host_evidence' ? ['host'] : [], evidenceRefs: basis === 'host_evidence' ? task.evidence.map((e: any) => e.source) : [] })) });
  const base = (text: string) => { const value = JSON.parse(text); assert.deepEqual(value.inputVersions, [...task.inputs, ...task.artifacts]);
    assert.deepEqual(value.evidenceIds, ['host']); if (value.verdict === 'approved') assert.deepEqual(value.findings, []); return value; };
  for (const basis of ['fixed_input', 'captured_output', 'host_evidence']) assert.equal(parseDesignConcernReview(JSON.stringify(make(basis)), task, requirement, packet, base).verdict, 'approved');
  for (const mutate of [
    (v: any) => v.concernResolutions.pop(), (v: any) => v.concernResolutions.push(v.concernResolutions[0]),
    (v: any) => v.concernResolutions[0].concernText = 'changed', (v: any) => v.concernResolutions[0].concernId = 'unknown',
    (v: any) => v.concernResolutions[0].status = 'unresolved', (v: any) => v.concernResolutions[0].extra = true,
    (v: any) => v.concernResolutions[0].rationale = '', (v: any) => v.concernResolutions[0].evidenceIds = ['future-check'],
    (v: any) => v.concernResolutions[0].inputVersions = task.context.interfaces, (v: any) => v.concernResolutions[0].evidenceRefs = [],
  ]) { const value = make('host_evidence'); mutate(value); assert.throws(() => parseDesignConcernReview(JSON.stringify(value), task, requirement, packet, base)); }
  const stale = make('captured_output'); stale.concernResolutions[0].inputVersions = task.context.interfaces;
  assert.throws(() => parseDesignConcernReview(JSON.stringify(stale), task, requirement, packet, base));
  for (const refs of [[...task.artifacts, ...task.inputs], [...task.inputs, ...task.artifacts]]) {
    const compared = make('captured_output'); compared.concernResolutions[0].inputVersions = refs;
    assert.deepEqual(parseDesignConcernReview(JSON.stringify(compared), task, requirement, packet, base), compared);
  }
  for (const refs of [[], task.inputs, [...task.artifacts, ...task.context.interfaces],
    [...task.artifacts, { ...task.inputs[0], artifactId: 'foreign' }], [...task.artifacts, { ...task.inputs[0], version: 'stale' }],
    [...task.artifacts, { ...task.inputs[0], location: 'foreign/file.json' }], [...task.artifacts, ...task.artifacts],
    [{ ...task.artifacts[0], version: 'stale' }, ...task.inputs]]) {
    const invalid = make('captured_output'); invalid.concernResolutions[0].inputVersions = refs;
    assert.throws(() => parseDesignConcernReview(JSON.stringify(invalid), task, requirement, packet, base), JSON.stringify(refs));
  }
  for (const field of ['evidenceIds', 'evidenceRefs']) {
    const invalid = make('captured_output'); invalid.concernResolutions[0][field] = field === 'evidenceIds' ? ['host'] : [task.evidence[0].source];
    assert.throws(() => parseDesignConcernReview(JSON.stringify(invalid), task, requirement, packet, base));
  }
  const otherGap = make('captured_output'); otherGap.verdict = 'changes_requested'; otherGap.findings = ['Another original requirement is missing.'];
  assert.equal(parseDesignConcernReview(JSON.stringify(otherGap), task, requirement, packet, base).verdict, 'changes_requested');
  const passed = task.evidence[0]; task.evidence[0] = { ...passed, outcome: 'failed' };
  assert.throws(() => parseDesignConcernReview(JSON.stringify(make('host_evidence')), task, requirement, packet, base));
  task.evidence[0] = { ...passed, recordedAt: '2000-01-01T00:00:00.000Z' };
  assert.throws(() => parseDesignConcernReview(JSON.stringify(make('host_evidence')), task, requirement, packet, base));
});
