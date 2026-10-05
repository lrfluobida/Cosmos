import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../src/roles/requirements.ts';
import { executePersistentSeries, runPersistentAcceptance } from '../../src/acceptance/persistent.ts';
import { genericArt, genericDesign, genericPersistentDraft, genericPersistentHtml } from '../acceptance/generic-persistent.fixture.ts';

export async function genericHostFixture(t: test.TestContext, fault = '') {
  const root = await mkdtemp(join(tmpdir(), 'cos66-host-')), intake = await IntakeController.create({ root, runId: 'game', ledgerId: 'budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }], durationMs: fault === 'real' ? 45_000 : undefined });
  const draft = withHostStages(genericPersistentDraft()), saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'user', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const controller = await RunController.open({ root }), work = new OwnedWork(controller.signal), calls: any[] = [];
  t.after(async () => { await controller.close(); if (fault === 'real') t.diagnostic(`COS66 free source/fixture only; SDK calls=0; evidence=${root}`); else await removeOwned(tmpdir(), root); });
  await mkdir(join(root, 'toolchain'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', file), file === 'vite.config.ts' ? 'export default {}' : '{}', 'utf8');
  const host = await createBrowserHost({ root, controller, requirement, draft, work, resume: false, io: {
    async build(project) { await mkdir(join(project, 'dist')); await cp(join(project, 'public/assets'), join(project, 'dist/assets'), { recursive: true });
      await writeFile(join(project, 'dist/index.html'), genericPersistentHtml(JSON.parse(await readFile(join(project, 'public/assets/manifest.json'), 'utf8'))), 'utf8');
      return { passed: true, diagnostics: 'Injected build and authored fixture data; no compiler/model evidence.' }; },
    async play() { throw new Error('A reopen draft must use the persistent transport.'); },
    async playPersistent(series, options, authority) {
      calls.push({ series: structuredClone(series), authority: structuredClone(authority), deadlineAt: options.deadlineAt });
      assert.equal(options.deadlineAt, Date.parse(authority.deadlineAt));
      if (fault === 'real') return runPersistentAcceptance(series, { ...options, channel: 'msedge', timeoutMs: 25_000,
        ownedChild: { prepare: async () => controller.prepareOwnedChild(), register: async (pid, ticket) => controller.registerOwnedChild(pid, ticket) } });
      let count = 0;
      const report = await executePersistentSeries(series, options, async (plan, lifecycle) => {
        const index = count++, folder = [plan.projectId, plan.artifact.artifactId, plan.artifact.version, plan.runId, plan.reportId].join('/');
        calls[0].segmentsRun = count;
        await mkdir(join(options.evidenceRoot, folder), { recursive: true });
        for (const name of ['final.png', 'browser.webm', 'browser.log']) await writeFile(join(options.evidenceRoot, folder, name), name.endsWith('.png')
          ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXcAAAAASUVORK5CYII=', 'base64') : 'Synthetic transport evidence');
        const request = structuredClone(options.segmentMediaObservations![index].request), startedAt = new Date().toISOString();
        const values = request.fields.map(field => typeof field.expected !== 'boolean' ? field.expected : field.path.includes('states')
          ? field.path[4] === String(index) : field.path[2] === String(index));
        if (fault === 'sample' && index) values[5] = false;
        if (fault === 'request' && index) request.planBindingSha256 = 'f'.repeat(64);
        const pid = fault === 'pid' ? 3000 : 3000 + index;
        const raw: any = { formatVersion: '1.0.0', kind: 'normal_browser_input', plan, startedAt, endedAt: new Date().toISOString(), outcome: 'passed',
          browser: { name: 'chromium', channel: 'msedge', version: 'synthetic-browser', headless: true, viewport: plan.viewport }, timeoutMs: 10000,
          cleanup: { browserPid: pid, forced: false, processExited: fault !== 'exit' },
          session: { browserPid: pid, profile: lifecycle.profile, commandLineProfile: lifecycle.profile, origin: new URL(plan.url).origin, closeEvent: true, exitConfirmed: true, exitCode: 0, signalCode: null },
          steps: plan.steps.map(step => ({ id: step.id, kind: step.kind, ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}), outcome: 'passed',
            expected: 'expected' in step ? step.expected : 'input delivered', actual: fault === 'save' && 'expected' in step ? 'wrong-save' : 'expected' in step ? step.expected : 'input delivered',
            error: null, screenshot: folder + '/final.png', ...('expected' in step ? { observation: { completed: 1 } } : {}) })),
          errors: [], files: ['final.png', 'browser.webm', 'browser.log', 'report.json'].map(name => folder + '/' + name), reportPath: folder + '/report.json', evidence: [],
          failureFacts: { formatVersion: 1, termination: null, errors: [] }, mediaObservations: { request, recordedAt: new Date().toISOString(), values } };
        raw.endedAt = raw.mediaObservations.recordedAt;
        if (fault === 'profile' && index) raw.session.profile += '-changed';
        if (fault === 'origin' && index) raw.session.origin = 'http://localhost:1';
        if (fault === 'stop') await controller.stop('manual', 'Generic fixture stop');
        if (fault === 'deadline') { options.deadlineAt = Date.now() - 1; }
        if (!index && fault === 'design-bytes') await writeFile(join(root, series.formatVersion === 'persistent-acceptance/generic-1' ? series.binding.design.location : '', '_cosmos/design.json'), '{}', 'utf8');
        if (!index && fault === 'candidate-bytes') await writeFile(join(root, plan.artifact.location, 'src/main.ts'), '// changed candidate\n', 'utf8');
        if (!index && fault === 'confirmed-source') await writeFile(join(root, requirement.sources[0].location), '{}', 'utf8');
        await writeFile(join(options.evidenceRoot, raw.reportPath), JSON.stringify(raw), 'utf8'); return raw;
      });
      if (fault === 'first-only') report.segments.pop();
      if (fault === 'raw') { await writeFile(join(options.evidenceRoot, report.reportPath), '{}', 'utf8'); }
      return report;
    },
  } });
  const make = (role: string, acceptanceIds: string[]) => { const output = host.taskPolicies.find(policy => policy.role === role)!.outputs[0];
    return { taskId: role, runId: 'game', specVersion: '1.0', authorId: `author-${role}`, context: { contextId: `context-${role}`, interfaces: [] }, inputs: [...host.availableArtifacts],
      outputs: [{ type: output.type, schema: output.schema, destination: output.destination }], artifacts: [], acceptanceIds, acceptance: requirement.acceptance.filter(item => acceptanceIds.includes(item.acceptanceId)),
      attempts: [{ attemptId: `attempt-${role}`, sessionRef: join(root, `sessions/attempt-${role}`) }], state: 'running', evidence: [],
      review: { reviewerId: 'independent-reviewer', contextId: 'independent-context', verdict: 'approved', evidenceIds: [] } } as any; };
  await writeFile(join(root, 'authors/design/design.json'), JSON.stringify(genericDesign), 'utf8'); await writeFile(join(root, 'authors/art/media.json'), JSON.stringify(genericArt), 'utf8');
  const design = make('design', [DESIGN_ACCEPTANCE_ID]), art = make('art', [MEDIA_ACCEPTANCE_ID]);
  design.artifacts = (await host.capture(design, {}, controller.signal)).artifacts; design.evidence = await host.verify(design, controller.signal); assert.equal(design.evidence[0].outcome, 'passed'); design.state = 'passed';
  art.inputs.push(...design.artifacts); art.artifacts = (await host.capture(art, {}, controller.signal)).artifacts; art.evidence = await host.verify(art, controller.signal); assert.equal(art.evidence[0].outcome, 'passed'); art.state = 'passed';
  await writeFile(join(root, 'authors/coding/src/main.ts'), '// Authored generic harness fixture; no native generation.\n', 'utf8'); await writeFile(join(root, 'authors/coding/index.html'), '<div id="app"></div>', 'utf8');
  const task = make('coding', ['save', 'resume']); task.inputs.push(...design.artifacts, ...art.artifacts); task.artifacts = (await host.capture(task, {}, controller.signal)).artifacts;
  return { root, host, task, controller, calls, draft, requirement, design, art };
}
