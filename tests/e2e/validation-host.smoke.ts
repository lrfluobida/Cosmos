import assert from 'node:assert/strict';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { validationRunFixture } from './validation-run.fixture.ts';
import { runValidationWithHost } from '../../probes/e2e/validation-run.ts';
import { createValidationHostIO } from '../../probes/e2e/validation-host.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/index.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import { serveBuild, writeJson } from '../../probes/e2e/host.ts';

// Explicit opt-in test file, excluded from npm test's *.test.ts pattern. No model requests or target-game logic.
test('real validation workers bootstrap/build/render and return generic normal-input proof with no model request', { timeout: 90000 }, async t => {
  const f = await validationRunFixture(t), saved = fileURLToPath(new URL(`../../.cosmos/validation-host-smoke-${randomUUID()}/`, import.meta.url));
  await mkdir(saved, { recursive: true }); await writeJson(saved, 'smoke-start.json', { generatedByCosmos: false, modelRequests: 0, saved });
  const phase = (name: string) => process.stdout.write(`Validation generic smoke: ${name}\n`);
  let browserPid: number | null = null;
  const result = await runValidationWithHost({ repository: f.repository, args: f.args, signal: t.signal, host: { prepare: async () => {}, execute: async input => {
    const io = createValidationHostIO(input); phase('bootstrap'); const toolchain = await io.bootstrap();
    const tasks = ['art', 'coding'].map(role => {
      const task = taskFixture() as TaskContract, grant = input.window.quote.declaration.grants[role as 'art' | 'coding'];
      Object.assign(task, { taskId: grant.taskId, kind: 'evaluation', runId: input.window.quote.basis.runId, specVersion: '1.0', dependsOn: [], state: 'not_started', attempts: [], artifacts: [], evidence: [],
        acceptanceIds: role === 'art' ? ['PILOT-MEDIA'] : input.window.quote.requirements.acceptanceIds,
        review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] }, budget: { ledgerId: input.window.quote.basis.ledgerId, originalDeadlineAt: input.window.quote.basis.originalDeadlineAt, allocationMicroCny: grant.amountMicroCny } });
      task.acceptance = task.acceptanceIds.map(acceptanceId => ({ acceptanceId, steps: ['Offline generic worker smoke only'], expected: 'Worker bridge completes; no game proof', evidenceDestinations: ['smoke.json'] })); return task;
    });
    await input.controller.registerTasks(tasks);
    const registry = await createArtifactRegistry({ workspaceRoot: input.root, registryRoot: 'registry', work: input.work, signal: input.signal }), captured = registry.artifactRef('generic-template-fixture', 'v1'), candidate = registry.candidateRef('generic-template-fixture', 'v1');
    const names = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'src/main.ts'];
    await registry.registerCapture({ taskId: tasks[1].taskId, artifactRef: captured, sourceRoot: 'toolchain', files: names.map(source => ({ source, destination: source })),
      ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'Existing generic template; generatedByCosmos:false', sourceRefs: ['templates/2d'] } } });
    await registry.stageCandidate({ taskId: tasks[1].taskId, authorId: 'fixture-author', contextId: 'fixture-context', candidateRef: candidate, targetRoot: candidate.location, inputs: [captured], expectedDeps: [captured], ownership: { writePaths: ['.'], readOnlyPaths: [] } });
    const proof = await registry.verifyCandidate(candidate, {
      build: async (_candidate, project) => { phase('build'); const result = await io.build(project, 'generic-build', input.signal, tasks[1].taskId); return { passed: result.passed, evidenceIds: ['generic-build-worker'] }; },
      acceptance: async (_candidate, project) => {
        const server = await serveBuild(project);
        try {
          const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'generic-validation-smoke', taskId: tasks[1].taskId, runId: input.window.caseId, reportId: 'normal-click', specVersion: '1.0', artifact: candidate,
            url: server.url, viewport: { width: 1280, height: 720 }, acceptanceIds: ['GENERIC-SMOKE'], steps: [
              { id: 'ready', kind: 'wait-for', acceptanceId: 'GENERIC-SMOKE', observation: { kind: 'debug', path: ['scene'] }, expected: 'playground', timeoutMs: 10000 },
              { id: 'click', kind: 'mouse-click', selector: 'canvas', x: 240 / 800, y: 250 / 520 },
              { id: 'clicked', kind: 'wait-for', acceptanceId: 'GENERIC-SMOKE', observation: { kind: 'debug', path: ['clicks'] }, expected: 1, timeoutMs: 5000 },
            ] };
          await assert.rejects(io.play({ ...plan, taskId: 'COS-10' }, input.signal, tasks[1].taskId), /task.*authority/i);
          phase('play'); const report = await io.play(plan, input.signal, tasks[1].taskId); browserPid = report.cleanup.browserPid;
          assert.equal(report.cleanup.processExited, true); assert.equal(report.outcome, 'passed');
          return { passed: report.outcome === 'passed', evidenceIds: report.evidence.map(item => item.evidenceId) };
        } finally { await server.close(); }
      },
    });
    // Original bounded renderer, using unmistakably generic fixtures; no game imports or listenability claim.
    const media = { characters: ['producer', 'shooter', 'defender', 'normal', 'armored'].map(id => ({ id, width: 32, height: 32, anchor: { x: 16, y: 32 },
      layers: [{ id: 'shape', shape: 'rect', x: 4, y: 4, width: 24, height: 24, fill: '#22aacc', stroke: '#112233', strokeWidth: 1 }],
      states: ['idle', 'attack', 'death'].map(name => ({ name, fps: 2, loop: name !== 'death', frames: [{ shape: { opacity: 1 } }, { shape: { opacity: 0.5 } }] })) })),
      audio: ['bgm', 'place', 'shoot', 'hit', 'victory', 'defeat'].map(id => ({ id, sampleRate: 22050, duration: 0.1, loop: id === 'bgm', notes: [{ midi: 60, start: 0, duration: 0.08, gain: 0.1, wave: 'sine', attack: 0.01, release: 0.01 }] })) };
    phase('media'); const rendered = await io.media('generic-media', media, input.signal, tasks[0].taskId); assert.equal(rendered.media.characters.length, 5);
    await mkdir(saved, { recursive: true }); await cp(join(input.root, 'browser-evidence'), join(saved, 'browser-evidence'), { recursive: true }); await cp(join(input.root, rendered.screenshot), join(saved, 'contact-sheet.png'));
    await writeJson(saved, 'smoke-report.json', { generatedByCosmos: false, modelRequests: 0, taskId: tasks[1].taskId, windowId: input.window.windowId, proof, browserPid, browserExited: true,
      limits: input.window.quote.declaration.limits, note: 'Existing generic template and fixture media worker bridge only; no fixed COS10 gameplay or media import acceptance.' });
    assert.equal((await input.controller.read()).requests.length, input.window.quote.basis.requestIds.length);
    assert.ok(toolchain.endsWith('toolchain'));
    return { outcome: 'failed', gaps: ['Explicit generic smoke only; generatedByCosmos:false, not a target-game acceptance run.'] };
  } } }).finally(async () => {
    await cp(f.caseRoot, join(saved, 'case-record'), { recursive: true }).catch(() => {});
    await cp(join(f.ledgerRoot, 'snapshot.json'), join(saved, 'offline-snapshot.json')).catch(() => {});
    process.stdout.write(`Validation generic smoke evidence: ${saved}\n`);
  });
  assert.ok(await readFile(join(saved, 'smoke-report.json')), JSON.stringify(result));
  assert.equal(result.outcome, 'failed'); await assert.rejects(readFile(join(f.ledgerRoot, '.controller.lock')), { code: 'ENOENT' });
  if (browserPid) assert.throws(() => process.kill(browserPid!, 0), { code: 'ESRCH' });
  await writeJson(saved, 'owner-closed.json', { ownerClosed: true, modelRequests: 0, generatedByCosmos: false });
});
