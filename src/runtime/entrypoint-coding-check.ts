import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFile, safePath, snapshot } from '../artifacts/paths.ts';
import type { RunController } from './run.ts';
import type { OwnedWork } from './recovery/owned-work.ts';
import { runOwnedNode } from './recovery/owned-command.ts';
import type { HostExecutionAuthority, BrowserBuildReport } from './entrypoint-host.ts';
import { CODING_CHECK_RESULT, CODING_TEMPLATE_FILES, codingSignature } from './coding-check-worker.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { moduleSource } from './modular-code.ts';
import type { ModularCompilerInputs } from './modular-code.ts';

export const GAME_BUILD_CHECK = 'check-game-build';

/** Current author feedback only. It grants no capture, acceptance, independent approval or linked repair. */
export function createCodingBuildCheck(input: { controller: RunController; work: OwnedWork; workspace: string; toolchain: string;
  template: string; media: string; taskId: string; attemptId: string; observer?: { directory: string; ref: ArtifactReference; sha256: string }; modular?: ModularCompilerInputs; guard(signal: AbortSignal): Promise<HostExecutionAuthority> }) {
  return { readOnly: false, tool: defineTool({ name: GAME_BUILD_CHECK, label: 'Check current game build',
    description: 'Compile the current author index.html and src with the selected fixed template and media in an isolated temporary project. Advisory TypeScript/Vite feedback in this original coding session only. No arguments.',
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_id, args, signal) {
      if (!args || typeof args !== 'object' || Array.isArray(args) || Reflect.ownKeys(args).length
        || ![Object.prototype, null].includes(Object.getPrototypeOf(args))) throw new Error('Coding build check accepts no arguments; supply an empty object.');
      return input.work.run(async ownedSignal => {
        const active = AbortSignal.any([ownedSignal, input.controller.signal, ...(signal ? [signal] : [])]);
        active.throwIfAborted(); await input.guard(active);
        const sourceRoot = input.modular && input.modular.slot !== 'integration' ? moduleSource(input.modular.slot) : 'authors/coding';
        const source = await snapshot(await safePath(input.workspace, sourceRoot));
        const template = new Map<string, Buffer>();
        for (const name of CODING_TEMPLATE_FILES) template.set(name, await regularFile(input.template, name));
        const media = await snapshot(await safePath(input.media, 'public/assets'));
        const worker = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './coding-check-worker.ts' : './coding-check-worker.js', import.meta.url));
        let report: BrowserBuildReport & { workerPid?: number; workerPids: number[] } = { passed: false, diagnostics: '', results: [], workerPids: [] };
        const phases: ('typecheck' | 'build')[] = input.modular && input.modular.slot !== 'integration' ? ['typecheck'] : ['typecheck', 'build'];
        for (const phase of phases) {
          const authority = await input.guard(active);
          const result = await runOwnedNode({ controller: input.controller, authority, cwd: input.workspace, signal: active, timeoutMs: 120000,
            args: ['--experimental-strip-types', worker, JSON.stringify({ phase, ...(report.work ? { work: report.work } : {}),
              taskId: input.taskId, attemptId: input.attemptId, workspace: input.workspace, toolchain: input.toolchain,
              template: input.template, media: input.media, deadlineAt: authority.deadlineAt,
              ...(input.observer ? { observer: input.observer } : {}),
              ...(input.modular ? { modular: input.modular } : {}),
              sourceSignature: codingSignature(source), templateSignature: codingSignature(template), mediaSignature: codingSignature(media) })] });
          await input.guard(active); active.throwIfAborted();
          if (codingSignature(await snapshot(join(input.workspace, sourceRoot))) !== codingSignature(source)) throw new Error('Coding check current author source changed during compilation.');
          if (!result.passed) throw new Error(result.diagnostics || 'Owned coding check did not complete.');
          const lines = result.stdout.split('\n').filter(line => line.startsWith(CODING_CHECK_RESULT));
          if (lines.length !== 1) throw new Error('Owned coding check returned no unique current result.');
          const current = JSON.parse(lines[0].slice(CODING_CHECK_RESULT.length)) as BrowserBuildReport & { workerPid: number };
          report = { ...current, diagnostics: (report.diagnostics + current.diagnostics).slice(0, 24000),
            results: [...report.results!, ...current.results!], workerPids: [...report.workerPids, current.workerPid] };
          if (!current.passed) break;
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(report) }], details: {} };
      });
    },
  }) };
}
