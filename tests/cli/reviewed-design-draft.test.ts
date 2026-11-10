import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { runPublicValidationCli } from '../../probes/public-cli/validation.ts';
import { readConfirmedRequirementsSource } from '../../src/runtime/confirmed-requirements-source.ts';
import { readReviewedDesignDraft, selectDesignDraftReview } from '../../src/runtime/reviewed-design-draft.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';
import { confirmedSource, silentOutput } from '../runtime/confirmed-requirements.fixture.ts';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { ORDINARY_PLAN_AUTHORING_RULE, readPlanAuthoringPolicy, REVIEWED_DRAFT_POLICY } from '../../src/runtime/entrypoint-plan-authoring.ts';
import { seedDesignFiles } from '../../src/runtime/entrypoint-design-revision.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';

const io = () => ({ input: Readable.from([]), output: silentOutput() });
const read = (root: string, path: string) => readFile(join(root, path));
const json = async (root: string, path: string) => JSON.parse((await read(root, path)).toString('utf8'));

test('an explicit rejected capture seeds a new design, recovers after capture and requires its own review', async t => {
  const limits = { limitMicroCny: 5_000_000, durationMs: 1_800_000 };
  const old = await ordinaryHostFixture(t, { productionDefault: true, limits, fault: 'review',
    configure: (_, scenario) => {
      const step = scenario.steps[1]; assert.equal(step.kind, 'assert');
      step.expected = '等待';
    },
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      if (packet.role === 'reviewer' && packet.taskId.startsWith('design-task')) return { ...fallback, prompt: async (...args) => {
        const result = await fallback.prompt(...args), verdict = JSON.parse(result.text);
        verdict.findings = ['The complete assertion expects 等待 after the click. The confirmed result is 完成.'];
        return { text: JSON.stringify(verdict) };
      } };
      if (packet.role !== 'design' || packet.taskId === 'design-task') return fallback;
      return { ...fallback, prompt: async () => {
        const result = await fallback.prompt('Synthetic revision');
        const path = join(config.workspace, 'authors/design/design.json');
        const design = JSON.parse(await readFile(path, 'utf8')); design.summary = '旧版本二';
        await writeFile(path, JSON.stringify(design), 'utf8'); return result;
      } };
    } });
  const source = await confirmedSource(t, { draft: old.draft });
  const original = await readConfirmedRequirementsSource({ root: source.root, revision: 2, specVersion: '1.0' });
  const requirements = ['--requirements-from', source.root, '--requirements-revision', '2'];
  const first: any = await runCli(['new', old.root, ...requirements, '--max-cny', '5', '--max-minutes', '30'], { ...io(), host: old.host });
  assert.match(first.gaps.join(' '), /design_revision_limit/);
  const oldPath = join(old.root, 'journal/task-design-task-revision/review.json');
  const reviewRef = await selectDesignDraftReview(oldPath, original.source);
  const captured = 'registry/captures/design/v2/files/_cosmos/';
  const oldDesign = await read(old.root, captured + 'design.json'), oldPlan = await read(old.root, captured + 'acceptance-plan.json');
  const savedReview = await readFile(oldPath), before = await read(old.root, 'snapshot.json');
  const correctedPlan = Buffer.from(oldPlan.toString('utf8').replace('"expected":"等待"', '"expected":"完成"'));
  assert.notDeepEqual(correctedPlan, oldPlan);
  let authorFailure: unknown;
  const next = await ordinaryHostFixture(t, { productionDefault: true, limits, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { ...fallback, prompt: async (...args) => {
      const result = await fallback.prompt(...args), verdict = JSON.parse(result.text);
      return { text: JSON.stringify({ ...verdict, verdict: 'changes_requested', findings: ['The inherited summary only names its version. Describe the confirmed click interaction.'] }) };
    } };
    if (packet.role !== 'design') return fallback;
    if (packet.taskId !== 'design-task') return { ...fallback, prompt: async () => {
      assert.ok(packet.rules.includes(ORDINARY_PLAN_AUTHORING_RULE));
      assert.match(config.systemPrompt, /finish each file or section before starting the next/);
      const writer = config.tools!.find(tool => tool.name === 'write-game-design')!;
      await writer.execute('correct-summary', { operation: 'set', section: 'summary', value: '点击目标后显示完成' }, undefined, undefined, undefined as any);
      return { text: JSON.stringify({ summary: 'Corrected design summary', remaining: [], uncertainty: [] }) };
    } };
    return { ...fallback, prompt: async () => {
      assert.deepEqual(await read(config.workspace, 'authors/design/design.json'), oldDesign);
      assert.deepEqual(await read(config.workspace, 'authors/design/acceptance-plan.json'), oldPlan);
      const ref = packet.interfaces.find((item: any) => item.artifactId === 'ordinary-design-draft-feedback');
      const advice = await json(config.workspace, ref.location);
      assert.deepEqual(advice.findings, JSON.parse(savedReview.toString('utf8')).value.verdict.findings);
      assert.deepEqual(advice.source, reviewRef);
      try {
        const rules = packet.rules.join('\n');
        assert.doesNotMatch(rules, /First write authors\/design\/design.json|to establish the (structured design|acceptance plan) draft|write all outputs then/);
        assert.match(rules, /plan first/i);
        assert.doesNotMatch(config.systemPrompt, /finish each file or section before starting the next/);
        const tool = (name: string) => config.tools!.find(item => item.name === name)!;
        assert.doesNotMatch(tool('read').description, /first request the complete file/);
        assert.match(tool('write-game-plan').description, /seeded/);
        assert.match(tool('write-game-design').description, /seeded/);
        const path = 'authors/design/acceptance-plan.json';
        await tool('read').execute('locate-assertion', { path, offset: 1, limit: 1 }, undefined, undefined, undefined as any);
        await tool('edit').execute('correct-visible-outcome', { path, edits: [{ oldText: '"expected":"等待"', newText: '"expected":"完成"' }] }, undefined, undefined, undefined as any);
        await tool('validate-game-design').execute('check-pair', {}, undefined, undefined, undefined as any);
        return { text: JSON.stringify({ summary: 'Corrected expected visible outcome', remaining: [], uncertainty: [] }) };
      } catch (error) { authorFailure = error; throw error; }
    } };
  } });
  let halfSeed = false, cut = false;
  next.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...next.hostOptions });
    const prepare = host.preAuthor!;
    host.preAuthor = async (task, signal) => {
      if (!halfSeed && task.taskId === 'design-task') {
        halfSeed = true;
        await seedDesignFiles(next.root, task, new Map([['design.json', oldDesign]]));
        throw new RecoveryBlocked('Synthetic interruption halfway through seed preparation');
      }
      return prepare(task, signal);
    };
    const save = hostInput.controller.saveTask.bind(hostInput.controller);
    hostInput.controller.saveTask = async (...args) => {
      await save(...args);
      if (!cut && args[0].taskId === 'design-task' && args[0].artifacts.length) {
        cut = true; throw new RecoveryBlocked('Synthetic interruption after new author capture');
      }
    };
    return host;
  } });
  const command = ['new', next.root, ...requirements, '--design-draft-from', oldPath, '--max-cny', '5', '--max-minutes', '30'];
  const newIo = () => ({ ...io(), host: next.host });
  const initial: any = await runCli(command, newIo());
  assert.equal(halfSeed, true, JSON.stringify(initial.gaps));
  assert.equal((await json(next.root, 'snapshot.json')).tasks[0].attempts.length, 0);
  assert.deepEqual(await read(next.root, 'authors/design/design.json'), oldDesign);
  await assert.rejects(read(next.root, 'authors/design/acceptance-plan.json'), { code: 'ENOENT' });
  const partial: any = await runCli(['resume', next.root], newIo());
  if (authorFailure) throw authorFailure;
  assert.equal(cut, true, JSON.stringify(partial.gaps)); assert.equal(partial.outcome, 'incomplete');
  const targetState = await json(next.root, 'snapshot.json');
  assert.deepEqual(targetState.designDraftReview, reviewRef); assert.deepEqual(targetState.run.humanDecisions, []);
  assert.notEqual(targetState.run.runId, JSON.parse(before.toString()).run.runId);
  assert.deepEqual(targetState.tasks.map((task: any) => task.taskId), ['design-task']);
  assert.equal(targetState.tasks[0].attempts.length, 1); assert.equal(targetState.tasks[0].review.verdict, 'pending');
  assert.equal(next.packets.some(p => ['art', 'coding', 'reviewer'].includes(p.role)), false);
  const execution = await json(next.root, 'execution.json');
  const planning = await json(next.root, 'planning-started.json');
  assert.equal(readPlanAuthoringPolicy(execution, planning, true), REVIEWED_DRAFT_POLICY);
  const initialRules = execution.tasks.find((item: any) => item.role === 'design').task.context.rules;
  assert.deepEqual(initialRules, next.packets.find(p => p.role === 'design').rules);
  const mixed = structuredClone(execution);
  mixed.tasks.find((item: any) => item.role === 'design').task.context.rules.push(ORDINARY_PLAN_AUTHORING_RULE);
  assert.throws(() => readPlanAuthoringPolicy(mixed, planning, true), /policy/);
  const oldExecution = await json(old.root, 'execution.json');
  assert.equal(readPlanAuthoringPolicy(oldExecution, await json(old.root, 'planning-started.json'), true), 'structured-design-plan/3');
  assert.deepEqual(await read(next.root, 'registry/captures/design/v1/files/_cosmos/design.json'), oldDesign);
  assert.deepEqual(await read(next.root, 'registry/captures/design/v1/files/_cosmos/acceptance-plan.json'), correctedPlan);
  await writeFile(oldPath, Buffer.concat([savedReview, Buffer.from(' ')]));
  try { await assert.rejects(runCli(['resume', next.root], newIo()), /review|draft/i); }
  finally { await writeFile(oldPath, savedReview); }
  const completed: any = await runCli(['resume', next.root], newIo());
  assert.equal(completed.ordinaryDesignReview?.selectedVersion, 'v2', JSON.stringify(completed.gaps));
  assert.equal(next.packets.filter(p => p.role === 'design').length, 2);
  assert.equal(next.packets.filter(p => p.role === 'reviewer' && p.taskId === 'design-task-revision').length, 1);
  assert.equal(next.packets.filter(p => p.role === 'reviewer' && p.taskId === 'design-task').length, 1);
  assert.ok(next.packets.some(p => p.role === 'art'));
  assert.deepEqual(await read(next.root, 'authors/design/design.json'), oldDesign);
  assert.deepEqual(await read(old.root, 'snapshot.json'), before);
  assert.deepEqual(await read(old.root, captured + 'design.json'), oldDesign);
  assert.deepEqual(await read(old.root, captured + 'acceptance-plan.json'), oldPlan);
  const wrong = await confirmedSource(t, { draft: old.draft });
  const wrongSource = await readConfirmedRequirementsSource({ root: wrong.root, revision: 2, specVersion: '1.0' });
  const target = { root: next.root, runId: targetState.run.runId, ledgerId: targetState.ledger.ledgerId };
  await assert.rejects(readReviewedDesignDraft(reviewRef, wrongSource.source, target), /different confirmed/);
  await assert.rejects(selectDesignDraftReview(join(old.root, 'journal/task-no-capture/review.json'), original.source), { code: 'ENOENT' });
  await assert.rejects(readReviewedDesignDraft(await selectDesignDraftReview(join(next.root, 'journal/task-design-task-revision/review.json'), original.source), original.source, { ...target, root: old.root, runId: 'other', ledgerId: 'other' }), /changes_requested/);
  const funding = await fundingFixture(t), args = await funding.authorization('reviewed-draft');
  const auth = join(args.sharedRoot, args.authorization.location);
  const payload = { ...args.payload, formatVersion: 'public-validation-authorization/2', requirementsSource: original.source, brief: original.draft.brief,
    sourceRefs: [...args.payload.sourceRefs, reviewRef] };
  const fundedCommand = ['new', args.runRoot, '--shared-root', args.sharedRoot, '--authorization', auth];
  const sharedBefore = await read(args.sharedRoot, 'snapshot.json');
  await writeFile(auth, JSON.stringify({ ...payload, sourceRefs: [{ ...reviewRef, version: '0'.repeat(64) }] }), 'utf8');
  await assert.rejects(runPublicValidationCli(fundedCommand, newIo()), /review/);
  assert.deepEqual(await read(args.sharedRoot, 'snapshot.json'), sharedBefore);
  await writeFile(auth, JSON.stringify(payload), 'utf8');
  const waiting = { ...next.host, async prepare() { return { environmentReady: false, executionReady: false }; } };
  await runPublicValidationCli(fundedCommand, { ...io(), host: waiting });
  const funded = await json(args.runRoot, 'snapshot.json');
  assert.deepEqual(funded.designDraftReview, reviewRef); assert.deepEqual(funded.requirementsSource, original.source);
  assert.equal(funded.validationFunding.fundingId, 'reviewed-draft'); assert.deepEqual(funded.ledger.entries, []);
  assert.equal((await funding.snapshot()).publicValidationFundings.length, 1);
});
