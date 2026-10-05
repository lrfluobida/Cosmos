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
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../dist/roles/requirements.js';
import { task as taskFixture } from '../contracts/fixtures.ts';
import { genericMediaFixture } from '../acceptance/generic-media.fixture.ts';

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
  const host = await createBrowserHost({ root, controller, work, requirement, draft, resume: false }), initial = await controller.read();
  const tasks: any[] = host.taskPolicies.map((policy, index) => {
    const task: any = taskFixture(), prior = host.taskPolicies.slice(0, index), ids = index === 0 ? [DESIGN_ACCEPTANCE_ID] : index === 1 ? [MEDIA_ACCEPTANCE_ID] : ['win'];
    const refs = (item: any) => item.outputs.map((output: any) => ({ artifactId: output.artifactId, version: output.version, location: output.destination }));
    Object.assign(task, { taskId: `fixture-${policy.role}`, kind: 'runtime_generation', runId: initial.run.runId, specVersion: requirement.specVersion, authorId: `author-${policy.role}`,
      objective: 'Free standalone fixture', acceptanceIds: ids, acceptance: requirement.acceptance.filter(item => ids.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId,
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
      if (input.role === 'art') await writeFile(join(root, 'authors/art/media.json'), JSON.stringify({ characters: [{ id: 'star', width: 32, height: 32, anchor: { x: 16, y: 16 },
        layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }],
        audio: [{ id: 'tone', sampleRate: 22050, duration: 0.2, loop: false, notes: [{ midi: 72, start: 0, duration: 0.2, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.02 }] }] }), 'utf8');
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
  assert.deepEqual(result.map(task => task.state), ['passed', 'passed', 'passed'], `Inspect fixture ${root}`);
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
