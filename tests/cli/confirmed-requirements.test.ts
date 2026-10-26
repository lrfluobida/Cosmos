import assert from 'node:assert/strict';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { confirmedSource, snapshot, temporaryRun } from '../runtime/confirmed-requirements.fixture.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';
import { silentOutput } from '../runtime/confirmed-requirements.fixture.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { readConfirmedGeneration } from '../../src/cli/session.ts';
import { loadExperienceBinding } from '../../src/runtime/experience.ts';
import { createHash } from 'node:crypto';
import { SnapshotStore } from '../../src/runtime/store.ts';

const noInterviewHost = () => ({ ordinaryProfile: 'ordinary-design/1' as const,
  async prepare() { return { environmentReady: true, executionReady: true }; },
  async questions() { throw new Error('No interview'); }, async draft() { throw new Error('No draft'); }, async execute(input: any) { return input; } });
const newArgs = (root: string, source: string) => ['new', root, '--requirements-from', source, '--requirements-revision', '2'];

for (const phase of ['before-snapshot', 'after-snapshot', 'during-binding']) test(`unfunded source initialization preserves identity across ${phase}`, async t => {
  const source = await confirmedSource(t), root = await temporaryRun(t), write = SnapshotStore.prototype.write;
  let interrupted = false, initial: any, prepares = 0;
  const host = { ...noInterviewHost(), async prepare() { prepares++; return { environmentReady: false, executionReady: false }; } };
  SnapshotStore.prototype.write = async function(value: any) {
    if (!interrupted && this.root === root && value.formatVersion === 'intake-1' && (phase === 'during-binding' ? value.draft !== null : value.draft === null)) {
      interrupted = true; initial = structuredClone(value); if (phase === 'after-snapshot') await write.call(this, value); throw new Error('Injected unfunded initialization interruption');
    }
    return write.call(this, value);
  };
  try { await assert.rejects(runCli(newArgs(root, source.root), { host, input: Readable.from([]), output: silentOutput() }), /Injected/); }
  finally { SnapshotStore.prototype.write = write; }
  assert.equal(prepares, 0);
  const originBytes = await readFile(join(root, 'intake-origin.json'));
  const wrong = await confirmedSource(t);
  await assert.rejects(runCli(newArgs(root, wrong.root), { host, input: Readable.from([]), output: silentOutput() }), /initialization/i);
  await assert.rejects(runCli([...newArgs(root, source.root), '--max-cny', '1'], { host, input: Readable.from([]), output: silentOutput() }), /initialization/i);
  await writeFile(join(root, 'unrelated.txt'), '不能覆盖这个目录', 'utf8');
  await assert.rejects(runCli(newArgs(root, source.root), { host, input: Readable.from([]), output: silentOutput() }), /initialization/i);
  await unlink(join(root, 'unrelated.txt'));
  if (phase === 'during-binding') {
    const copy = join(root, 'requirements/v2/draft.json'), bytes = await readFile(copy); await writeFile(copy, '{}', 'utf8');
    await assert.rejects(runCli(newArgs(root, source.root), { host, input: Readable.from([]), output: silentOutput() }), /copy bytes changed/i);
    await writeFile(copy, bytes);
  }
  assert.equal(prepares, 0); assert.deepEqual(await readFile(join(root, 'intake-origin.json')), originBytes);
  const result: any = await runCli(newArgs(root, source.root), { host, input: Readable.from([]), output: silentOutput() });
  assert.equal(result.outcome, 'waiting_prerequisites'); assert.equal(prepares, 1);
  const current = await snapshot(root); assert.deepEqual(current.run, initial.run); assert.deepEqual(current.ledger, initial.ledger);
  assert.equal(current.createdAt, initial.createdAt); assert.deepEqual(current.requirementsSource, initial.requirementsSource);
  assert.equal(current.confirmation, null); assert.equal(current.draft.revision, 2);
  await assert.rejects(runCli(newArgs(root, source.root), { host, input: Readable.from([]), output: silentOutput() }), /initialization|resume/i);
});

test('public new reuses complete confirmed intake revision 2 without interviewing or a new human decision', async t => {
  const source = await confirmedSource(t, { intake: true, charged: true }), root = await temporaryRun(t), before = await readFile(join(source.root, 'snapshot.json'));
  let interviews = 0, text = '';
  const result: any = await runCli(['new', root, '--requirements-from', source.root, '--requirements-revision', '2', '--max-cny', '3', '--max-minutes', '5'], {
    host: { ordinaryProfile: 'ordinary-design/1', async prepare() { return { environmentReady: true, executionReady: true }; },
      async questions() { interviews++; throw new Error('No new interview'); }, async draft() { interviews++; throw new Error('No new draft'); },
      async execute(input) { return input; } }, input: Readable.from([]), output: new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } }),
  });
  const state = await snapshot(root);
  assert.equal(interviews, 0); assert.deepEqual(result.draft, source.draft);
  assert.equal(state.requirementsSource.runId, source.state.run.runId); assert.equal(state.requirementsSource.revision, 2);
  assert.notEqual(state.run.runId, source.state.run.runId); assert.notEqual(state.ledger.ledgerId, source.state.ledger.ledgerId);
  assert.deepEqual(state.run.humanDecisions, []); assert.deepEqual(state.requests, []);
  assert.equal(source.state.ledger.entries.length, 2); assert.deepEqual(state.ledger.entries, []);
  assert.equal(state.ledger.limitMicroCny, 3_000_000); assert.equal(Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt), 300_000);
  assert.deepEqual(await readFile(join(source.root, 'snapshot.json')), before);
  for (const name of ['draft', 'confirmation']) assert.deepEqual(await readFile(join(root, `requirements/v2/${name}.json`)), await readFile(join(source.root, `requirements/v2/${name}.json`)));
  assert.match(text, /新生成尝试/); assert.match(text, /local-user/); assert.doesNotMatch(text, /请输入 confirm/);
});

test('stopped source is read-only and a paused new intake resumes with the same binding', async t => {
  const source = await confirmedSource(t, { frames: true }), controller = await RunController.open({ root: source.root });
  await controller.stop('Source ended'); await controller.close();
  const before = await readFile(join(source.root, 'snapshot.json')), root = await temporaryRun(t);
  const result: any = await runCli(newArgs(root, source.root), { host: { ...noInterviewHost(), async prepare() { return { environmentReady: false, executionReady: false }; } }, input: Readable.from([]), output: silentOutput() });
  assert.equal(result.outcome, 'waiting_prerequisites'); const intake = await snapshot(root);
  assert.equal(intake.confirmation, null); assert.equal(intake.run.originalStartedAt, undefined); assert.equal(intake.requests.length, 0);
  const owner = await IntakeController.open({ root });
  await assert.rejects(owner.saveDraft(source.draft), /cannot interview/); await assert.rejects(owner.confirm({ revision: 2, confirmed: true, actorId: 'local-user', at: new Date().toISOString() }), /cannot interview/);
  await assert.rejects(owner.reserve({ requestId: 'forbidden', taskId: 'intake', provider: 'fixture', pricingVersion: 'v1', estimatedMaxCostMicroCny: 1 }), /cannot interview/);
  await owner.close();
  await runCli(['resume', root], { host: { ...noInterviewHost(), ordinaryProfile: undefined }, input: Readable.from([]), output: silentOutput() });
  const state = await snapshot(root); assert.deepEqual(state.requirementsSource, intake.requirementsSource); assert.deepEqual(state.ledger, intake.ledger);
  assert.deepEqual(await readFile(join(source.root, 'snapshot.json')), before);
  await assert.rejects(runCli(['continue', root, '--quote', '--add-cny', '1', '--add-minutes', '1'], { output: silentOutput() }), /仅支持 new\/resume/);
});

for (const mode of ['unconfirmed', 'revision', 'nested', 'same', 'frames', 'mixed']) test(`invalid public requirements ${mode} rejects before preparing a host`, async t => {
  const source = await confirmedSource(t, { unconfirmed: mode === 'unconfirmed' }), root = await temporaryRun(t);
  const args = newArgs(mode === 'same' ? source.root : mode === 'nested' ? join(source.root, 'child') : root, source.root);
  if (mode === 'revision') args[5] = '1';
  if (mode === 'frames') args.push('--render-frames', 'true');
  if (mode === 'mixed') args.push('--brief', '不同要求');
  let prepare = 0;
  await assert.rejects(runCli(args, { host: { ...noInterviewHost(), async prepare() { prepare++; return { environmentReady: true, executionReady: true }; } }, input: Readable.from([]), output: silentOutput() }));
  assert.equal(prepare, 0); assert.deepEqual(await readdir(root), []);
});

test('source drift during preparation cannot activate a new clock', async t => {
  const source = await confirmedSource(t), root = await temporaryRun(t), raw = await readFile(join(source.root, 'requirements/v2/draft.json'));
  let prepares = 0;
  await assert.rejects(runCli(newArgs(root, source.root), { host: { ...noInterviewHost(), async prepare() {
    prepares++; const path = join(source.root, 'intake-answers/v2.json'), value = JSON.parse(await readFile(path, 'utf8'));
    value.answers.goal = '准备期间漂移'; await writeFile(path, JSON.stringify(value), 'utf8'); return { environmentReady: true, executionReady: true };
  } }, input: Readable.from([]), output: silentOutput() }), /source|answer/i);
  const state = await snapshot(root); assert.equal(prepares, 1); assert.equal(state.formatVersion, 'intake-1'); assert.equal(state.confirmation, null);
  assert.equal(state.run.originalStartedAt, undefined); assert.deepEqual(await readFile(join(source.root, 'requirements/v2/draft.json')), raw);
});

test('bound copies are never rebuilt and referenced attempts cannot become recursive sources', async t => {
  const source = await confirmedSource(t), root = await temporaryRun(t);
  await runCli(newArgs(root, source.root), { host: noInterviewHost(), input: Readable.from([]), output: silentOutput() });
  const another = await temporaryRun(t);
  await assert.rejects(runCli(newArgs(another, root), { host: noInterviewHost(), input: Readable.from([]), output: silentOutput() }), /reference chains/i);
  await unlink(join(root, 'requirements/v2/draft.json'));
  const before = await readFile(join(root, 'snapshot.json'));
  await assert.rejects(runCli(['resume', root], { host: noInterviewHost(), input: Readable.from([]), output: silentOutput() }), /ENOENT/);
  assert.deepEqual(await readFile(join(root, 'snapshot.json')), before);
});

for (const persistent of [false, true]) test(`public source reaches production execution and the ${persistent ? 'persistent' : 'ordinary'} consumer`, async t => {
  const f = await ordinaryHostFixture(t, { persistent });
  if (persistent) { f.draft.brief = '鼠标点亮并保存目标'; f.draft.acceptance.find(item => item.acceptanceId === 'light')!.description = '点亮目标并保存后恢复'; }
  const source = await confirmedSource(t, { draft: f.draft });
  const result: any = await runCli(['new', f.root, '--requirements-from', source.root, '--requirements-revision', '2'], {
    host: { ...f.host, async questions() { throw new Error('Source must not interview'); }, async draft() { throw new Error('Source must not redraft'); } },
    input: Readable.from([]), output: silentOutput(),
  });
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps)); assert.ok(f.plays.length); assert.ok(f.packets.some(packet => packet.role === 'reviewer'));
  const state = await snapshot(f.root); assert.deepEqual(state.run.humanDecisions, []);
  assert.ok(state.tasks.every((task: any) => task.runId === state.run.runId));
  const report = JSON.parse(await readFile(join(f.root, result.report), 'utf8'));
  assert.equal(report.ordinaryExecution.runId, state.run.runId);
  const confirmed = await readConfirmedGeneration(f.root, state);
  assert.deepEqual(confirmed.draft, source.draft); assert.equal(confirmed.requirement.confirmedBy, 'local-user');
  assert.deepEqual(result.acceptanceScope.ordinaryConfirmation.requirementsSource, state.requirementsSource);
  assert.deepEqual(result.acceptanceScope.experienceCriteria, source.draft.experienceCriteria);
  for (const name of ['draft', 'confirmation']) assert.deepEqual(await readFile(join(f.root, `registry/captures/requirement-bundle/v2/files/_cosmos/${name === 'draft' ? 'requirement-draft' : 'user-confirmation'}.json`)), await readFile(join(source.root, `requirements/v2/${name}.json`)));
  const experience: any = await runCli(['experience', f.root], { input: Readable.from(['approve\n']), output: silentOutput() });
  assert.equal(experience.userExperience, 'approved'); assert.equal(experience.decision.binding.runId, state.run.runId);
  const before = await readFile(join(f.root, 'snapshot.json'));
  const complete: any = await runCli(['resume', f.root], { host: { ...noInterviewHost(), async execute() { throw new Error('Completed resume is read-only'); } }, input: Readable.from([]), output: silentOutput() });
  assert.equal(complete.userExperience, 'approved'); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  if (!persistent) {
    const path = join(f.root, result.report), reportBytes = await readFile(path), markerPath = join(f.root, 'delivery/current-report.json'), markerBytes = await readFile(markerPath);
    const report = JSON.parse(reportBytes.toString('utf8')); report.acceptedCandidate.candidateRef.version = 'v99';
    const bytes = Buffer.from(JSON.stringify(report)), marker = JSON.parse(markerBytes.toString('utf8')); marker.sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path, bytes); await writeFile(markerPath, JSON.stringify(marker), 'utf8');
    await assert.rejects(loadExperienceBinding(f.root), /candidate/i);
    await writeFile(path, reportBytes); await writeFile(markerPath, markerBytes);
    const old = structuredClone(experience.decision); old.binding.runId = source.state.run.runId;
    const receipt = join(f.root, `delivery/experience/${experience.decision.bindingId}.json`), receiptBytes = await readFile(receipt);
    await writeFile(receipt, JSON.stringify(old), 'utf8');
    await assert.rejects(runCli(['experience', f.root], { input: Readable.from([]), output: silentOutput() }), /binding/i);
    await writeFile(receipt, receiptBytes);
  }
  const sourcePath = join(source.root, 'requirements/v2/draft.json'), changed = JSON.parse(await readFile(sourcePath, 'utf8'));
  changed.experienceCriteria[0].expected = '改变原体验'; await writeFile(sourcePath, JSON.stringify(changed), 'utf8');
  await assert.rejects(runCli(['resume', f.root], { host: noInterviewHost(), input: Readable.from([]), output: silentOutput() }), /source|draft|confirmation/i);
});
