import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactReference, TaskContract } from '../contracts/types.ts';
import type { ArtifactRegistry } from '../artifacts/index.ts';
import { directory, regularFile } from '../artifacts/paths.ts';
import { validationHash } from './validation-validation.ts';
import { RENDER_OBSERVER_MODULE, assessRenderFrames } from '../acceptance/render-frames.ts';
import type { RenderFrameRequest } from '../acceptance/render-frames.ts';
import type { AcceptancePlan } from '../acceptance/plan.ts';
import type { AcceptanceReport } from '../acceptance/runner.ts';

export const OBSERVER_SOURCE = '_cosmos/render-frame-observer.ts';
/** Both original build callers use the same optional Vite entry; the four configs remain fixed. */
export function renderFrameBuildArguments(toolchain: string, enabled: boolean): string[] {
  if (!enabled) return [join(toolchain, 'node_modules/vite/bin/vite.js'), 'build'];
  const vite = pathToFileURL(join(toolchain, 'node_modules/vite/dist/node/index.js')).href;
  const code = `import {build} from ${JSON.stringify(vite)};await build({configFile:'vite.config.ts',build:{rollupOptions:{preserveEntrySignatures:'strict',input:{main:'index.html',cosmosObserver:'${OBSERVER_SOURCE}'},output:{entryFileNames:chunk=>chunk.name==='cosmosObserver'?'assets/cosmos-render-observer.js':'assets/[name]-[hash].js'}}}});`;
  return ['--input-type=module', '-e', code];
}

/** Selected source module is copied once to a host capture, never to author writable paths. */
export async function createRenderFrameScope(input: { root: string; registry: ArtifactRegistry; template: ArtifactReference; resume: boolean }) {
  const { root, registry } = input, ref = registry.artifactRef('render-frame-observer', 'v1');
  const source = fileURLToPath(new URL('../../templates/2d/render-frame-observer.ts', import.meta.url)), bytes = await regularFile(fileURLToPath(new URL('../../templates/2d/', import.meta.url)), 'render-frame-observer.ts');
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!input.resume) {
    const folder = await directory(root, 'host-render-frame-observer'); await writeFile(join(folder, 'render-frame-observer.ts'), bytes, { flag: 'wx' });
    await registry.registerCapture({ taskId: 'host-render-frame-observer', artifactRef: ref, sourceRoot: 'host-render-frame-observer',
      files: [{ source: 'render-frame-observer.ts', destination: OBSERVER_SOURCE }], dependencies: [input.template], ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] },
      metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'Cosmos native Phaser rendered-frame observer', sourceRefs: [source, `${input.template.artifactId}@${input.template.version}`] } } });
  }
  const capture = await registry.getCapture(ref);
  const requireCurrent = async (project?: string) => {
    if (!isDeepStrictEqual(await registry.getCapture(ref), capture) || !(await regularFile(root, `${ref.location}/${OBSERVER_SOURCE}`)).equals(bytes)
      || project && !(await regularFile(project, OBSERVER_SOURCE)).equals(bytes)) throw new Error('Trusted render observer capture or current project bytes changed.');
  };
  await requireCurrent();
  return {
    ref, sourcePath: join(root, ref.location), signature: validationHash(bytes), requireCurrent,
    request(input: { task: TaskContract; plan: AcceptancePlan; requirement: ArtifactReference; design: ArtifactReference; media: ArtifactReference;
      manifestSha256: string; windowId: string | null; deadlineAt: number; collection: RenderFrameRequest['collection'] }): RenderFrameRequest {
      return { formatVersion: 'render-frame-request/1', candidate: structuredClone(input.plan.artifact), observer: ref, observerSha256: validationHash(bytes),
        requirement: input.requirement, design: input.design, media: input.media, manifestSha256: input.manifestSha256, planBindingSha256: validationHash(JSON.stringify(input.plan)),
        runId: input.task.runId, taskId: input.task.taskId, attemptId: input.task.attempts.at(-1)!.attemptId, specVersion: input.task.specVersion,
        windowId: input.windowId, deadlineAt: input.deadlineAt, durationMs: 2000, modulePath: RENDER_OBSERVER_MODULE,
        machine: { frozen: false, platform: platform(), osRelease: release(), cpu: cpus()[0]?.model ?? null, gpu: null, memoryBytes: totalmem() }, collection: input.collection };
    },
    async assess(request: RenderFrameRequest, report: AcceptanceReport) {
      let assessment = assessRenderFrames(request, report.renderFrames);
      const sample = report.renderFrames;
      if (validationHash(JSON.stringify(report.plan)) !== request.planBindingSha256 || !isDeepStrictEqual(report.plan.artifact, request.candidate)
        || report.plan.runId !== request.runId || report.plan.taskId !== request.taskId || report.plan.specVersion !== request.specVersion
        || sample && (!isDeepStrictEqual(sample.viewport, report.plan.viewport) || sample.browser.version !== report.browser.version
          || sample.browser.channel !== report.browser.channel || sample.browser.headless !== report.browser.headless
          || Date.parse(sample.startedAt) < Date.parse(report.startedAt) || Date.parse(sample.endedAt) > Date.parse(report.endedAt))) {
        assessment = { ...assessment, status: 'insufficient_evidence', averageRenderFps: null, renderedFrames: null, elapsedMs: null, reason: 'Render sample belongs to another plan/browser/window.' };
      }
      if (report.renderFrames) {
        try {
          const folder = dirname(report.reportPath).replaceAll('\\', '/'), decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          if (!isDeepStrictEqual(decode(await regularFile(join(root, 'browser-evidence'), `${folder}/render-frame-request.json`)), request)
            || !isDeepStrictEqual(decode(await regularFile(join(root, 'browser-evidence'), `${folder}/render-frames.json`)), report.renderFrames)
            || !isDeepStrictEqual(decode(await regularFile(join(root, 'browser-evidence'), report.reportPath)), report)) throw new Error('Current raw render sample/report differs.');
        } catch { assessment = { ...assessment, status: 'insufficient_evidence', averageRenderFps: null, renderedFrames: null, elapsedMs: null,
          reason: 'The exact raw render request/sample/report files are missing or changed.' }; }
      }
      return { reportPath: report.reportPath, raw: report.renderFrames ?? null, assessment };
    },
  };
}
