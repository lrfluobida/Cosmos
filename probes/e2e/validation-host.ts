import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directory, regularFile } from '../../src/artifacts/paths.ts';
import { runOwnedNode } from '../../src/runtime/recovery/owned-command.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import type { ValidationHostInput, ValidationRunHost } from './validation-run.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import type { buildProject } from './host.ts';
import type { renderMedia } from './media.ts';
import { VALIDATION_CASE } from './validation-declaration.ts';
import { generateValidationCase } from './validation-driver.ts';
import { currentValidationCase, validationRole } from '../../src/runtime/validation-validation.ts';

export interface ValidationHostIO {
  bootstrap(): Promise<string>;
  build(project: string, name: string, signal: AbortSignal, taskId: string): ReturnType<typeof buildProject>;
  media(folder: string, value: unknown, signal: AbortSignal, taskId: string): ReturnType<typeof renderMedia>;
  play(plan: AcceptancePlan, signal: AbortSignal, taskId: string): Promise<AcceptanceReport>;
}

/** All fixed compiler/media/browser workers are gated by the original ledger owner. */
export function createValidationHostIO(input: ValidationHostInput): ValidationHostIO {
  let sequence = 0;
  const worker = new URL('./validation-worker.ts', import.meta.url);
  async function execute(operation: string, taskId: string, fields: Record<string, unknown>, signal: AbortSignal, timeoutMs: number): Promise<any> {
    signal.throwIfAborted(); input.controller.requireValidationCase(input.window.caseId, input.window.windowId);
    const state = await input.controller.read(), role = validationRole(currentValidationCase(state), taskId), purpose = role === 'planning' ? 'planning' : 'author';
    const authority = await input.controller.validationAuthority(taskId, purpose);
    if (!authority.executionAllowed || state.ledger.entries.some(entry => entry.unknown) || (operation === 'bootstrap' ? role !== 'planning' : operation === 'media' ? role !== 'art' : !['coding', 'repair'].includes(role ?? ''))) throw new Error('Fixed host operation has no matching validation task authority.');
    const folder = await directory(input.root, 'host-jobs'), name = `${++sequence}-${operation}`, request = join(folder, `${name}.json`), response = join(folder, `${name}-result.json`);
    await publishReceipt(request, { formatVersion: 'validation-worker-1', operation, root: input.root, repository: input.repository, ...fields, response });
    const result = await input.work.run(ownedSignal => runOwnedNode({ controller: input.controller,
      authority: { caseId: input.window.caseId, windowId: input.window.windowId, taskId, deadlineAt: input.window.deadlineAt },
      args: ['--experimental-strip-types', fileURLToPath(worker), request], cwd: input.root,
      signal: AbortSignal.any([signal, ownedSignal]), timeoutMs }));
    if (!result.passed) throw new Error('Fixed validation worker did not finish; preserve its safe result and owned process state.');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.root, `host-jobs/${name}-result.json`)));
    if (value?.formatVersion !== 'validation-worker-result-1' || value.operation !== operation || value.outcome !== 'completed') throw new Error('Fixed validation worker result is unavailable.');
    return value.result;
  }
  return {
    bootstrap: () => execute('bootstrap', VALIDATION_CASE.grants.planning.taskId, {}, input.signal, 190000),
    build: (project, name, signal, taskId) => execute('build', taskId, { project, name }, signal, 245000),
    media: (folder, value, signal, taskId) => execute('media', taskId, { folder, value }, signal, 60000),
    async play(plan, signal, taskId) {
      if (plan.taskId !== taskId) throw new Error('Browser plan task differs from its validation authority.');
      const timeoutMs = Math.min(180000, Date.parse(input.window.deadlineAt) - Date.now() - 6000);
      if (timeoutMs < 1000) throw new Error('Validation case cannot cover browser cleanup.');
      const report = await execute('acceptance', taskId, { plan, timeoutMs }, signal, timeoutMs + 1000) as AcceptanceReport;
      if (report.cleanup?.processExited !== true) throw new Error('Validation browser process exit was not established.');
      return report;
    },
  };
}

/** The CLI binds this single native host. No environment or CLI option selects a fixture. */
export function createNativeValidationHost(): ValidationRunHost {
  return {
    async prepare({ repository, signal }) {
      signal.throwIfAborted();
      if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('Native validation requires the host model credential in memory.');
      const lock = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(repository, 'package-lock.json')));
      for (const name of ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', '@playwright/test']) {
        const path = `node_modules/${name}`, installed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(repository, `${path}/package.json`)));
        if (typeof installed.version !== 'string' || installed.version !== lock.packages?.[path]?.version) throw new Error('Installed native validation dependencies differ from the reviewed lock.');
      }
      await access(join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'));
      if (process.platform !== 'win32') throw new Error('This fixed validation host requires the reviewed Windows environment.');
      const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
      if (!(await Promise.all(edge.map(path => access(path).then(() => true, () => false)))).some(Boolean)) throw new Error('The fixed validation browser is unavailable.');
      await regularFile(repository, 'templates/2d/package-lock.json');
    },
    execute: input => generateValidationCase(input, createValidationHostIO(input), undefined, { authorProtocolCorrections: 1 }),
  };
}
