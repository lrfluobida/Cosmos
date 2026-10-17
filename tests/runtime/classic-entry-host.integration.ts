import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { IntakeController } from '../../dist/runtime/intake.js';
import { executeGeneration } from '../../dist/runtime/entrypoint.js';
import { createBrowserHost, createNativeBrowserHostIO } from '../../dist/runtime/entrypoint-host.js';
import { selectClassicEntry } from '../../dist/runtime/classic-entry-input.js';
import { withHostStages } from '../../dist/roles/requirements.js';
import { runAcceptance } from '../../dist/acceptance/runner.js';
import { diagnoseBrowser } from '../../dist/runtime/repair/browser-diagnostics.js';
import { regularFile, snapshot } from '../../dist/artifacts/paths.js';
import { genericArt, genericDesign, genericPersistentDraft, genericPersistentHtml } from '../acceptance/generic-persistent.fixture.ts';
import { classicEntrySidecar, syntheticClassicSource } from './generic-persistent-host.fixture.ts';

const read = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));

/** One native SOURCE representative: synthetic reference/roles, actual compiler/server/browser/journal. */
test('compiled production pipeline records independent classic input, signed review, partial promotion and sealed recovery', { timeout: 360_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'Cosmos COS104 中文 SOURCE ')), { sourceRoot, catalog } = await syntheticClassicSource(t);
  t.after(() => { t.diagnostic(`COS104 SOURCE retained: ${root}; synthetic reference/author/reviewer; model=0; paid=0; human=NONE`); });
  const template = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? fileURLToPath(new URL('../../templates/2d', import.meta.url)));
  await mkdir(join(root, 'toolchain'));
  for (const path of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(template, path), join(root, 'toolchain', path));
  await cp(await realpath(join(template, 'node_modules')), join(root, 'toolchain/node_modules'), { recursive: true, dereference: true });
  const draft = withHostStages({ ...genericPersistentDraft(), benchmark: 'classic-pc-runtime-policy/1', classicEntry: await selectClassicEntry(sourceRoot) });
  const intake = await IntakeController.create({ root, runId: 'classic-source', ledgerId: 'synthetic-source', specVersion: '1.0', durationMs: 300_000,
    interviewTaskId: 'intake', maxRequests: 2, allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'synthetic-source-user', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const calls: any[] = [], packets: any[] = []; let reviewed = false, guarded = false, codingTask: any;
  const sessionFactory = async (config: any) => {
    const packet = JSON.parse(config.context); packets.push(packet);
    return { close: async () => {}, prompt: async (_prompt: string, options: any) => {
      if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: [
        { taskId: 'design', policyId: 'game-design', role: 'design', objective: 'Synthetic fixed reference UI design', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
        { taskId: 'art', policyId: 'game-art', role: 'art', objective: 'Synthetic original media', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design'] },
        { taskId: 'coding', policyId: 'game-code', role: 'coding', objective: 'Small SOURCE UI fixture', acceptanceIds: ['save', 'resume'], dependsOn: ['design', 'art'] },
      ] }) };
      if (packet.role === 'reviewer') {
        assert.notEqual(config.workspace, root);
        if (packet.taskId === 'coding') {
          const report = await read(config.workspace, 'evidence/coding/classic-entries.json');
          const raw = await read(config.workspace, `browser-evidence/${report.raw}`);
          assert.equal(raw.steps.at(-1).actual, '7'); assert.ok(options.images.length > 0 && options.images.length <= 8);
          const image = packet.evidence.find((row: any) => row.source.artifactId === 'coding-classic-entry-screenshot'); assert.ok(image);
          assert.ok(options.images.some((value: any) => value.data === (awaitableImages.get(image.source.location))));
          for (const row of packet.evidence.filter((row: any) => row.source.artifactId.includes('classic-entry') || row.source.artifactId.includes('classic-entries'))) {
            const original = await snapshot(join(root, row.source.location)).catch(async () => new Map([['', await readFile(join(root, row.source.location))]]));
            const copied = await snapshot(join(config.workspace, row.source.location)).catch(async () => new Map([['', await readFile(join(config.workspace, row.source.location))]]));
            assert.deepEqual(copied, original);
          }
          const design = packet.inputs.find((ref: any) => ref.artifactId === 'design');
          assert.match((await read(config.workspace, `${design.location}/_cosmos/design.json`)).implementationNotes.at(-1), /synthetic cost/);
          const candidate = packet.inputs.find((ref: any) => ref.artifactId === 'game');
          assert.match(await readFile(join(config.workspace, candidate.location, 'dist/index.html'), 'utf8'), /show-cost/);
          reviewed = true;
        }
        return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId) }) };
      }
      if (packet.role === 'design') {
        await writeFile(join(root, 'authors/design/design.json'), JSON.stringify({ ...genericDesign,
          implementationNotes: [...genericDesign.implementationNotes, `${draft.classicEntry!.entityLabel}: synthetic cost uses the #show-cost control and visible #cost value; fixture observation only.`] }), 'utf8');
        await writeFile(join(root, 'authors/design/classic-entry-plan.json'), JSON.stringify(classicEntrySidecar), 'utf8');
      } else if (packet.role === 'art') await writeFile(join(root, 'authors/art/media.json'), JSON.stringify(genericArt), 'utf8');
      else {
        const media = packet.inputs.find((ref: any) => ref.artifactId === 'media'), manifest = await read(root, `${media.location}/public/assets/manifest.json`);
        const html = genericPersistentHtml(manifest) + `<button id="show-cost">显示夹具费用</button><p id="cost">0</p><script>document.querySelector('#show-cost').onclick=()=>{document.querySelector('#cost').textContent='7';};</script>`;
        await writeFile(join(root, 'authors/coding/index.html'), html, 'utf8');
        await writeFile(join(root, 'authors/coding/src/main.ts'), '// Synthetic small UI author; not Cosmos game generation.\n', 'utf8');
      }
      return { text: JSON.stringify({ summary: 'Explicit synthetic SOURCE author/reviewer', remaining: [], uncertainty: [] }) };
    } };
  };
  const awaitableImages = new Map<string, string>();
  const createHost = async (input: any) => {
    const native = createNativeBrowserHostIO(input), host = await createBrowserHost({ ...input, classicSourceRoot: sourceRoot, sessionFactory, io: {
      ...native,
      play: async (...args: Parameters<typeof native.play>) => { calls.push({ kind: 'normal', plan: structuredClone(args[0]), authority: structuredClone(args[2]) }); return native.play(...args); },
      playPersistent: async (...args: Parameters<NonNullable<typeof native.playPersistent>>) => { calls.push({ kind: 'persistent', authority: structuredClone(args[2]) }); return native.playPersistent!(...args); },
    } } as any);
    const images = host.reviewImages!, finish = host.finish.bind(host);
    host.reviewImages = async (task, signal) => { const result = await images(task, signal); for (const row of result) awaitableImages.set(row.source.location, row.image.data); return result; };
    host.finish = async tasks => {
      codingTask = tasks.find(task => task.taskId === 'coding');
      if (!guarded && codingTask?.state === 'passed') {
        assert.equal(reviewed, true);
        const verified = (await read(root, 'journal/task-coding/verified.json')).value, review = (await read(root, 'journal/task-coding/review.json')).value;
        assert.notEqual(review.reviewerId, codingTask.authorId); assert.notEqual(review.contextId, codingTask.context.contextId);
        for (const signature of [verified.signature, review.signature]) {
          assert.ok(signature.some((row: any) => row.location === 'evidence/coding/classic-entries.json'));
          assert.ok(signature.some((row: any) => row.location.includes('classic-entry-mapping')));
          assert.ok(signature.some((row: any) => row.location.includes('coding-classic-entry') && row.files.some((file: any) => file.path === 'plan.json')));
        }
        const report = await read(root, 'evidence/coding/classic-entries.json'), design = codingTask.inputs.find((ref: any) => ref.artifactId === 'design');
        for (const path of [`${design.location}/_cosmos/classic-entry-plan.json`, `browser-evidence/${report.raw}`, 'evidence/coding/classic-entries.json']) {
          const bytes = await readFile(join(root, path)); await writeFile(join(root, path), Buffer.concat([bytes, Buffer.from(' ')]));
          assert.equal((await finish(tasks)).acceptedCandidate, undefined, `Post-review mutation must block ${path}`); await writeFile(join(root, path), bytes);
        }
        guarded = true;
      }
      return finish(tasks);
    };
    return host;
  };
  const result: any = await executeGeneration({ root, requirement, draft, resume: false, createHost });
  assert.ok(result.acceptedCandidate, JSON.stringify(result)); assert.equal(result.outcome, 'incomplete'); assert.equal(result.userExperience, 'not_confirmed'); assert.ok(guarded);
  assert.deepEqual(calls.map(row => row.kind), ['persistent', 'normal']); assert.deepEqual(calls[0].authority, calls[1].authority);
  const partial = await read(root, 'evidence/coding/classic-entries.json'), raw = await read(root, `browser-evidence/${partial.raw}`), policy = await read(root, 'evidence/coding/classic-policy.json');
  assert.equal(partial.acceptance, 'partial'); assert.deepEqual(partial.entries.map((row: any) => row.entryId), catalog.entries.map((row: any) => row.id));
  assert.equal(partial.entries.filter((row: any) => row.normalInput.outcome === 'passed').length, 1);
  assert.deepEqual(policy.entries.filter((row: any) => row.outcome === 'passed').map((row: any) => row.entryId), ['STARTUP', 'OFFLINE']);
  assert.equal(raw.outcome, 'passed'); assert.equal(raw.cleanup.processExited, true); assert.equal(raw.session, undefined); assert.ok(raw.browser.version);
  const frozenRaw = await snapshot(join(root, 'browser-evidence')), frozenCandidate = await snapshot(join(root, result.delivery));
  const beforeResumeCalls = packets.length, resumed: any = await executeGeneration({ root, requirement, draft, resume: true, createHost });
  assert.ok(resumed.acceptedCandidate); assert.equal(resumed.outcome, 'incomplete'); assert.equal(packets.length, beforeResumeCalls); assert.equal(calls.length, 2);
  assert.deepEqual(await snapshot(join(root, 'browser-evidence')), frozenRaw);
  const state = await read(root, 'snapshot.json'); assert.equal(state.ledger.entries.length, 0); assert.equal(state.requests.length, 0);

  // The negative uses a separate copy, candidate and report; the accepted package remains untouched.
  const negative = join(root, 'disabled-input'); await cp(join(root, result.delivery, 'dist'), negative, { recursive: true });
  const healthyHtml = await readFile(join(negative, 'index.html'), 'utf8'), disabledHtml = healthyHtml.replace("document.querySelector('#show-cost').onclick=", "document.querySelector('#show-cost').unused=");
  assert.notEqual(disabledHtml, healthyHtml); await writeFile(join(negative, 'index.html'), disabledHtml, 'utf8');
  const server = createServer(async (request, response) => { try {
    const path = decodeURIComponent(new URL(request.url!, 'http://127.0.0.1').pathname).slice(1) || 'index.html';
    response.setHeader('Content-Type', path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream');
    response.end(await regularFile(negative, path));
  } catch { response.statusCode = 404; response.end(); } });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  let negativeReport: any;
  try {
    const plan = { ...structuredClone(raw.plan), reportId: 'disabled-classic-entry', runId: 'disabled-source', artifact: { artifactId: 'fixture-disabled', version: 'v1', location: 'disabled-input' },
      url: `http://127.0.0.1:${(server.address() as any).port}` };
    negativeReport = await runAcceptance(plan, { evidenceRoot: join(root, 'negative-evidence'), channel: 'msedge', timeoutMs: 20_000 });
    assert.equal(negativeReport.outcome, 'failed'); assert.equal(negativeReport.steps.at(-1).actual, '0');
    const diagnostics = diagnoseBrowser(codingTask, negativeReport, plan, negativeReport.reportPath);
    assert.equal(diagnostics.reportValid, true); assert.ok(diagnostics.issues.every(row => row.classification === 'code_defect'));
  } finally { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
  assert.deepEqual(await snapshot(join(root, result.delivery)), frozenCandidate); assert.deepEqual(await snapshot(join(root, 'browser-evidence')), frozenRaw);
  console.log(JSON.stringify({ kind: 'COS104-native-SOURCE', root, acceptedCandidate: result.acceptedCandidate, outcome: result.outcome, calls: calls.map(row => row.kind),
    browserVersion: raw.browser.version, normalRaw: partial.raw, negativeRaw: negativeReport.reportPath, nativeBuild: true, nativeBrowser: true,
    reference: 'synthetic', author: 'fixture', reviewer: 'fixture', sdkCalls: 0, paidMicroCny: 0, human: 'NONE', originalDeadlineAt: state.run.originalDeadlineAt }));
});
