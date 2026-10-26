import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { IntakeController } from '../../dist/runtime/intake.js';
import { RunController } from '../../dist/runtime/run.js';
import { OwnedWork } from '../../dist/runtime/recovery/owned-work.js';
import { createBrowserHost } from '../../dist/runtime/entrypoint-host.js';
import { executeTaskDag } from '../../dist/runtime/orchestrator.js';
import { executeGeneration } from '../../dist/runtime/entrypoint.js';
import { readAutomaticReport } from '../../dist/runtime/experience.js';
import type { GenerationHost, HostInput } from '../../src/runtime/entrypoint.ts';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../dist/roles/requirements.js';
import { task as taskFixture } from '../contracts/fixtures.ts';
import { genericMediaFixture } from '../acceptance/generic-media.fixture.ts';

const ordinaryScenario = { viewport: { width: 1280, height: 720 }, steps: [
  { id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 },
  { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 },
] };

async function writeFixtureMedia(root: string) {
  await writeFile(join(root, 'authors/art/media.json'), JSON.stringify({ characters: [{ id: 'star', width: 32, height: 32, anchor: { x: 16, y: 16 },
    layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }],
    audio: [{ id: 'tone', sampleRate: 22050, duration: 0.2, loop: false, notes: [{ midi: 72, start: 0, duration: 0.2, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.02 }] }] }), 'utf8');
}

async function prepareOrdinaryDelivery(t: test.TestContext) {
  const template = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? fileURLToPath(new URL('../../templates/2d', import.meta.url)));
  const root = await mkdtemp(join(tmpdir(), 'Cosmos COS130 中文交付 '));
  t.diagnostic(JSON.stringify({ kind: 'COS130-source-only-root', caseName: t.name, root }));
  t.after(async () => { if (!process.env.COSMOS_KEEP_EVIDENCE) await rm(root, { recursive: true, force: true }); });
  await cp(template, join(root, 'toolchain'), { recursive: true, filter: path => !['dist', 'public'].includes(relative(template, path).split(sep)[0]) });
  const draft = withHostStages({ ordinaryProfile: 'ordinary-design/1', brief: '通用媒体正常输入交付夹具',
    questions: [{ id: 'scope', prompt: '范围？' }], answers: { scope: '仅免费源码 fixture' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击后显示结果', steps: ['点击 Play'], expected: '胜利', evidenceKinds: ['test_report'] }],
    experienceCriteria: [{ criterionId: 'readable', description: '状态清楚', steps: ['试玩查看目标状态'], expected: '容易辨认' }] });
  assert.equal('scenario' in draft, false);
  const runId = 'ordinary-offline-fixture', limits = { limitMicroCny: 200000000, durationMs: 180000 };
  await writeFile(join(root, 'intake-origin.json'), JSON.stringify({ runId, brief: draft.brief, ordinaryProfile: draft.ordinaryProfile, limits }), 'utf8');
  const intake = await IntakeController.create({ root, runId, ledgerId: 'offline-fixture', specVersion: '1.0', ...limits,
    ordinaryProfile: draft.ordinaryProfile, interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  try {
    await mkdir(join(root, 'intake-answers'));
    await writeFile(join(root, 'intake-answers/v1.json'), JSON.stringify({ brief: draft.brief, questions: draft.questions, answers: draft.answers, ordinaryProfile: draft.ordinaryProfile }), 'utf8');
    const saved = await intake.saveDraft(draft);
    const requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture-owner', at: new Date().toISOString() });
    await intake.activateGeneration({ environmentReady: true, executionReady: true });
    return { root, draft, requirement };
  } finally { await intake.close(); }
}

/** Only role responses are synthetic. The production entrypoint owns planning, checks, publication and cleanup. */
async function ordinaryDelivery(input: { root: string; draft: any; requirement: any }, fault: '' | 'capture-drift' = '') {
  const { root, draft, requirement } = input, calls: string[] = [], consumed: any[] = [];
  let changedAfterApproval = false, rejectedBeforeDispatch = false;
  const result: any = await executeGeneration({ ...input, resume: false, createHost: async (hostInput: HostInput) => {
    const host: GenerationHost = await createBrowserHost(hostInput) as any, preAuthor = host.preAuthor!;
    host.preAuthor = async (task, signal) => {
      if (task.taskId === 'fixture-art') {
        const state = await hostInput.controller.read(), design = state.tasks.find(item => item.taskId === 'fixture-design')!;
        assert.equal(design.state, 'passed'); assert.equal(design.review.verdict, 'approved');
        const receipt = JSON.parse(await readFile(join(root, 'journal/task-fixture-design/review.json'), 'utf8'));
        assert.equal(receipt.value.verdict.verdict, 'approved');
        await writeFile(join(root, 'authors/design/acceptance-plan.json'), 'POISON_MUTABLE_AUTHOR_PLAN', 'utf8');
        if (fault === 'capture-drift') await writeFile(join(root, design.artifacts[0].location, '_cosmos/acceptance-plan.json'), '{}', 'utf8');
        changedAfterApproval = true;
      }
      try { await preAuthor(task, signal); }
      catch (error) { if (task.taskId === 'fixture-art') rejectedBeforeDispatch = true; throw error; }
    };
    host.roleFactory = async roleInput => {
      const { role, task } = roleInput;
      assert.ok(['cosmos', 'design', 'art', 'coding', 'reviewer'].includes(role), 'No live role fallback.');
      return { actorId: role === 'reviewer' ? `independent-${task.taskId}` : task.authorId,
        contextId: role === 'reviewer' ? `independent-context-${task.taskId}` : task.context.contextId, close: async () => {},
        prompt: async () => {
          calls.push(`${role}:${task.taskId}`);
          if (role === 'cosmos') return { text: JSON.stringify({ tasks: host.taskPolicies.map((policy, index) => ({
            taskId: `fixture-${policy.role}`, policyId: policy.policyId, role: policy.role, objective: 'Free ordinary delivery fixture',
            acceptanceIds: policy.acceptanceIds, dependsOn: host.taskPolicies.slice(0, index).map(prior => `fixture-${prior.role}`),
          })) }) };
          const refs = [...task.inputs, ...task.artifacts];
          if (role === 'reviewer') {
            assert.notEqual(roleInput.workspace, root);
            assert.ok(task.evidence.length > 0);
            const design = refs.find(ref => ref.artifactId === 'design');
            assert.ok(design);
            const captured = JSON.parse(await readFile(join(roleInput.workspace, design.location, '_cosmos/acceptance-plan.json'), 'utf8'));
            assert.deepEqual(captured.scenario, ordinaryScenario);
            if (task.taskId === 'fixture-coding') {
              const candidate = task.artifacts[0];
              assert.match(await readFile(join(roleInput.workspace, candidate.location, 'README.zh-CN.md'), 'utf8'), /node standalone-launcher\.mjs/);
              const check = JSON.parse(await readFile(join(roleInput.workspace, 'evidence/fixture-coding/delivery-check.json'), 'utf8'));
              assert.deepEqual(check.candidate, candidate); assert.equal(check.outcome, 'passed'); assert.equal(check.helperExited, true);
              assert.equal((await readFile(join(roleInput.workspace, candidate.location, 'dist/index.html'))).equals(await readFile(join(root, candidate.location, 'dist/index.html'))), true);
            }
            return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: refs, evidenceIds: task.evidence.map(item => item.evidenceId) }) };
          }
          if (role === 'design') {
            const requirement = task.inputs.find(ref => ref.artifactId === 'requirement-bundle'); assert.ok(requirement);
            await writeFile(join(root, 'authors/design/acceptance-plan.json'), JSON.stringify({ formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: ordinaryScenario }), 'utf8');
            await writeFile(join(root, 'authors/design/design.json'), JSON.stringify({ summary: '通用交付 fixture', implementationNotes: ['正常输入与素材'],
              acceptanceMapping: { win: '点击 Play 显示结果' }, experienceMapping: { readable: '状态清楚呈现' },
              characters: [{ id: 'star', purpose: '夹具图形', states: ['idle'] }], audio: [{ id: 'tone', trigger: '点击', loop: false }] }), 'utf8');
          } else {
            const design = task.inputs.find(ref => ref.artifactId === 'design'); assert.ok(design);
            const captured = JSON.parse(await readFile(join(root, design.location, '_cosmos/acceptance-plan.json'), 'utf8'));
            const designValue = JSON.parse(await readFile(join(root, design.location, '_cosmos/design.json'), 'utf8'));
            assert.deepEqual(captured.scenario, ordinaryScenario); assert.equal(designValue.experienceMapping.readable, '状态清楚呈现');
            consumed.push({ role, design, plan: captured });
            if (role === 'art') await writeFixtureMedia(root);
            if (role === 'coding') {
              const media = task.inputs.find(ref => ref.artifactId === 'media'); assert.ok(media);
              const manifest = JSON.parse(await readFile(join(root, media.location, 'public/assets/manifest.json'), 'utf8'));
              await writeFile(join(root, 'authors/coding/src/main.ts'), '// Generic offline normal-input fixture; no target game\n', 'utf8');
              await writeFile(join(root, 'authors/coding/index.html'), genericMediaFixture(manifest, true), 'utf8');
            }
          }
          return { text: JSON.stringify({ summary: 'Explicit offline role fixture', remaining: [], uncertainty: [] }) };
        } };
    };
    return host;
  } });
  const { marker, report }: any = await readAutomaticReport(root);
  assert.equal(marker.report.location, result.report);
  assert.equal(result.userExperience, 'not_confirmed'); assert.equal(report.userExperience, 'not_confirmed');
  assert.equal(result.completionTiming.eligible, true); assert.ok(result.completionTiming.cleanup.every((item: any) => item.outcome === 'closed'));
  const state = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(state.ledger.entries, []);
  assert.ok(changedAfterApproval, JSON.stringify({ calls, gaps: result.gaps, tasks: state.tasks.map((task: any) => ({ id: task.taskId, state: task.state, handoff: task.handoff })) }));
  if (fault === 'capture-drift') {
    assert.ok(rejectedBeforeDispatch); assert.deepEqual(calls, ['cosmos:planning', 'design:fixture-design', 'reviewer:fixture-design']);
    assert.equal(result.outcome, 'incomplete'); assert.equal(result.acceptedCandidate, undefined); assert.equal(result.delivery, undefined);
    assert.equal(report.automaticAcceptance, 'not_passed'); assert.equal(report.acceptedCandidate, undefined);
    return;
  }
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  assert.equal(report.outcome, result.outcome); assert.equal(report.automaticAcceptance, 'passed'); assert.deepEqual(result.gaps, []);
  assert.deepEqual(report.acceptedCandidate, result.acceptedCandidate); assert.deepEqual(report.ordinaryExecution, result.ordinaryExecution);
  assert.deepEqual(report.ordinaryExecution.scenario, ordinaryScenario); assert.deepEqual(report.ordinaryExecution.candidate, result.acceptedCandidate.candidateRef);
  assert.equal(result.acceptedCandidate.candidateRef.version, 'v1');
  assert.deepEqual(report.acceptanceScope.experienceCriteria, draft.experienceCriteria);
  assert.deepEqual(report.acceptanceScope.acceptance, requirement.acceptance);
  assert.deepEqual(state.tasks.map((task: any) => task.state), ['passed', 'passed', 'passed']);
  for (const task of state.tasks) {
    assert.notEqual(task.review.reviewerId, task.authorId); assert.notEqual(task.review.contextId, task.context.contextId);
    assert.deepEqual(task.review.inputVersions, [...task.inputs, ...task.artifacts]);
    assert.deepEqual(task.review.evidenceIds, task.evidence.map((item: any) => item.evidenceId));
  }
  assert.deepEqual(consumed.map(item => item.role), ['art', 'coding']); assert.deepEqual(consumed[0].design, consumed[1].design);
  assert.deepEqual(consumed[0].design, result.ordinaryExecution.design);
  const project = join(root, result.delivery), sources = JSON.parse(await readFile(join(project, '_cosmos/sources.json'), 'utf8'));
  assert.deepEqual(sources.dependencies.map((item: any) => [item.name, item.version, item.license]), [['phaser', '3.90.0', 'MIT'], ['eventemitter3', '5.0.4', 'MIT']]);
  for (const dep of sources.dependencies) for (const file of dep.licenseFiles) assert.ok((await readFile(join(project, file))).length > 0);
  const browser = JSON.parse(await readFile(join(root, 'evidence/fixture-coding/browser.json'), 'utf8'));
  assert.equal(browser.outcome, 'passed'); assert.deepEqual(browser.errors, []); assert.ok(browser.steps.every((step: any) => step.outcome === 'passed')); assert.equal(browser.cleanup.processExited, true);
  assert.deepEqual(browser.plan.steps.filter((step: any) => !step.id.startsWith('host-media-')), ordinaryScenario.steps);
  assert.deepEqual(browser.plan.artifact, result.acceptedCandidate.candidateRef);
  const check = JSON.parse(await readFile(join(root, 'evidence/fixture-coding/delivery-check.json'), 'utf8'));
  assert.equal(browser.plan.url, check.url); assert.match(check.project, /中文|干净交付/); assert.notEqual(check.project, project);
  assert.ok(!check.packageFiles.some((file: string) => file.includes('node_modules'))); assert.equal(check.helperExited, true);
  const journal = JSON.parse(await readFile(join(root, 'journal/task-fixture-coding/verified.json'), 'utf8'));
  assert.ok(journal.value.signature.some((item: any) => item.location === result.delivery && item.files.some((file: any) => file.path === 'standalone-launcher.mjs')));
  assert.deepEqual(calls, ['cosmos:planning', 'design:fixture-design', 'reviewer:fixture-design', 'art:fixture-art', 'reviewer:fixture-art', 'coding:fixture-coding', 'reviewer:fixture-coding']);
  console.log(JSON.stringify({ kind: 'COS130-source-only-fixture', root, report: result.report, browser: browser.browser, paid: 0, userExperience: report.userExperience }));
}

test('public offline ordinary captured design reaches real clean delivery', async t => {
  await ordinaryDelivery(await prepareOrdinaryDelivery(t));
});
test('public offline ordinary changed capture blocks downstream dispatch', async t => {
  await ordinaryDelivery(await prepareOrdinaryDelivery(t), 'capture-drift');
});

/** Explicit free fixture: fake authors/reviewer; actual locked compiler, renderer, Node server and Edge normal inputs. */
test('compiled production DAG verifies an independent clean package before review and exact promotion', async t => {
  const template = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? fileURLToPath(new URL('../../templates/2d', import.meta.url)));
  const root = await mkdtemp(join(tmpdir(), 'Cosmos COS65 中文交付 '));
  await cp(template, join(root, 'toolchain'), { recursive: true, filter: path => !['dist', 'public'].includes(relative(template, path).split(sep)[0]) });
  const intake = await IntakeController.create({ root, runId: 'standalone-fixture', ledgerId: 'offline-fixture', specVersion: '1.0', durationMs: 180000,
    interviewTaskId: 'intake', maxRequests: 2, allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  const draft = withHostStages({ brief: '通用媒体正常输入交付夹具', questions: [{ id: 'scope', prompt: '范围？' }], answers: { scope: '仅免费源码 fixture' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击后显示结果', steps: ['点击 Play'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [
      { id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 },
    ] } });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture-owner', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const controller = await RunController.open({ root }), work = new OwnedWork(controller.signal);
  t.after(async () => { await work.cancelAndDrain('fixture cleanup'); await controller.close(); if (!process.env.COSMOS_KEEP_EVIDENCE) await rm(root, { recursive: true, force: true }); });
  const host: GenerationHost = await createBrowserHost({ root, controller, work, requirement, draft, resume: false }) as any, initial = await controller.read();
  const tasks: any[] = host.taskPolicies.map((policy, index) => {
    const task: any = taskFixture(), prior = host.taskPolicies.slice(0, index), ids = index === 0 ? [DESIGN_ACCEPTANCE_ID] : index === 1 ? [MEDIA_ACCEPTANCE_ID] : ['win'];
    const refs = (item: any) => item.outputs.map((output: any) => ({ artifactId: output.artifactId, version: output.version, location: output.destination }));
    Object.assign(task, { taskId: `fixture-${policy.role}`, kind: 'runtime_generation', runId: initial.run.runId, specVersion: requirement.specVersion, authorId: `author-${policy.role}`,
      objective: 'Free standalone fixture', acceptanceIds: ids, acceptance: requirement.acceptance.filter((item: any) => ids.includes(item.acceptanceId)).map((item: any) => ({ acceptanceId: item.acceptanceId,
        steps: item.steps, expected: item.expected, evidenceDestinations: [`evidence/fixture-${policy.role}/host-report.json`] })),
      inputs: [...host.availableArtifacts, ...prior.flatMap(refs)], dependsOn: prior.map(item => ({ taskId: `fixture-${item.role}`, requiredState: 'passed', state: 'not_started' })),
      context: { contextId: `author-context-${policy.role}`, rules: policy.rules, interfaces: [], knownFailures: [], tools: [] }, ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths },
      outputs: policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination })), budget: { ledgerId: initial.ledger.ledgerId, allocationMicroCny: policy.allocationMicroCny, originalDeadlineAt: initial.run.originalDeadlineAt },
      state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: [], uncertainty: [], resumeFrom: null },
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    return { task, role: policy.role, workspace: root, expectedArtifacts: refs(policy) };
  });
  host.validateTasks!(tasks); const calls: string[] = [];
  const roleFactory: any = async (input: any) => ({ actorId: input.role === 'reviewer' ? `independent-${input.task.taskId}` : input.task.authorId,
    contextId: input.role === 'reviewer' ? `independent-context-${input.task.taskId}` : input.task.context.contextId, close: async () => {},
    prompt: async () => {
      calls.push(`${input.role}:${input.task.taskId}`);
      if (input.role === 'reviewer') {
        if (input.task.taskId === 'fixture-coding') {
          assert.notEqual(input.workspace, root);
          const candidate = input.task.artifacts[0];
          assert.match(await readFile(join(input.workspace, candidate.location, 'README.zh-CN.md'), 'utf8'), /node standalone-launcher\.mjs/);
          const check = JSON.parse(await readFile(join(input.workspace, 'evidence/fixture-coding/delivery-check.json'), 'utf8'));
          assert.deepEqual(check.candidate, candidate); assert.equal(check.outcome, 'passed'); assert.equal(check.helperExited, true);
          assert.equal((await readFile(join(input.workspace, candidate.location, 'dist/index.html'))).equals(await readFile(join(root, candidate.location, 'dist/index.html'))), true);
        }
        return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: [...input.task.inputs, ...input.task.artifacts], evidenceIds: input.task.evidence.map((item: any) => item.evidenceId) }) };
      }
      if (input.role === 'design') await writeFile(join(root, 'authors/design/design.json'), JSON.stringify({ summary: '通用交付 fixture', implementationNotes: ['正常输入与素材'], acceptanceMapping: { win: '点击 Play 显示结果' },
        characters: [{ id: 'star', purpose: '夹具图形', states: ['idle'] }], audio: [{ id: 'tone', trigger: '点击', loop: false }] }), 'utf8');
      if (input.role === 'art') await writeFixtureMedia(root);
      if (input.role === 'coding') {
        const media = input.task.inputs.find((ref: any) => ref.artifactId === 'media');
        const manifest = JSON.parse(await readFile(join(root, media.location, 'public/assets/manifest.json'), 'utf8'));
        await writeFile(join(root, 'authors/coding/src/main.ts'), '// Generic offline normal-input fixture; no target game\n', 'utf8');
        await writeFile(join(root, 'authors/coding/index.html'), genericMediaFixture(manifest, true), 'utf8');
      }
      return { text: JSON.stringify({ summary: 'Explicit offline role fixture', remaining: [], uncertainty: [] }) };
    } });
  const result = await executeTaskDag({ controller, requirement, tasks, roleFactory, sessionRoot: join(root, 'fixture-sessions'), availableArtifacts: host.availableArtifacts,
    capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
    recovery: { artifactRoot: root, journalRoot: join(root, 'journal'), recoverCapture: host.recoverCapture } });
  assert.deepEqual(result.map((task: any) => task.state), ['passed', 'passed', 'passed'], `Inspect fixture ${root}`);
  const delivery = await host.finish(result); assert.ok(delivery.acceptedCandidate); assert.deepEqual(delivery.gaps, []);
  const project = join(root, delivery.delivery!), sources = JSON.parse(await readFile(join(project, '_cosmos/sources.json'), 'utf8'));
  assert.deepEqual(sources.dependencies.map((item: any) => [item.name, item.version, item.license]), [['phaser', '3.90.0', 'MIT'], ['eventemitter3', '5.0.4', 'MIT']]);
  for (const dep of sources.dependencies) for (const file of dep.licenseFiles) assert.ok((await readFile(join(project, file))).length > 0);
  const browser = JSON.parse(await readFile(join(root, 'evidence/fixture-coding/browser.json'), 'utf8'));
  assert.equal(browser.outcome, 'passed'); assert.deepEqual(browser.errors, []); assert.ok(browser.steps.every((step: any) => step.outcome === 'passed')); assert.equal(browser.cleanup.processExited, true);
  const check = JSON.parse(await readFile(join(root, 'evidence/fixture-coding/delivery-check.json'), 'utf8'));
  assert.equal(browser.plan.url, check.url); assert.match(check.project, /中文|干净交付/); assert.notEqual(check.project, project); assert.ok(!check.packageFiles.some((file: string) => file.includes('node_modules')));
  const journal = JSON.parse(await readFile(join(root, 'journal/task-fixture-coding/verified.json'), 'utf8'));
  assert.ok(journal.value.signature.some((item: any) => item.location === delivery.delivery && item.files.some((file: any) => file.path === 'standalone-launcher.mjs')));
  assert.deepEqual(calls, ['design:fixture-design', 'reviewer:fixture-design', 'art:fixture-art', 'reviewer:fixture-art', 'coding:fixture-coding', 'reviewer:fixture-coding']);
  assert.equal((await controller.read()).ledger.entries.length, 0);
  console.log(JSON.stringify({ kind: 'COS65-source-only-fixture', root, delivery, build: 'actual locked tsc/Vite', media: 'actual renderer from fixture specs', launcher: 'actual clean Node', browser: browser.browser,
    normalSteps: browser.steps.length, model: 'injected offline author/reviewer', paid: 0, human: 'NONE', check: 'evidence/fixture-coding/delivery-check.json' }));
});
