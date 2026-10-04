import { createHash } from 'node:crypto';
import { realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { BrowserPreparationContext, BrowserInputPreparation } from '../../src/runtime/entrypoint-preparation.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { RunController } from '../../src/runtime/run.ts';
import { isValidationRequirement } from '../../src/roles/execution-input.ts';
import { directory, regularFile } from '../../src/artifacts/paths.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { TaskJournal, requireOriginalTask } from '../../src/runtime/recovery/task-journal.ts';
import type { ContentSignature, RecoveryOrigin } from '../../src/runtime/recovery/task-journal.ts';
import { requireThat } from './design.ts';
import { validateTransferDesign } from './oracle.ts';

const MAP = 'authors/design/transfer-design.json';
const TOOL = 'validate-transfer-design';
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
interface Binding {
  taskId: string; attemptId: string; authorId: string; contextId: string; sessionRef: string; workspace: string;
  requirement: BrowserPreparationContext['requirement']; requirementCapture: BrowserPreparationContext['requirementCapture'];
  inputs: TaskContract['inputs']; inputSignature: ContentSignature;
}
interface Result {
  passed: boolean; rewritesRemaining: 0 | 1; mapVersion?: string;
  diagnosis?: { kind: 'invalid_transfer_design'; message: string };
}
interface Started {
  formatVersion: 'transfer-design-check-started/1'; binding: Binding; check: 1 | 2;
  raw: { location: string; present: boolean; sha256: string | null };
}
interface Audit { started: Started; result: Result; bytes: Buffer | null; resultPath: string }

/** A bounded host oracle inside the existing author session, not another task or repair grant. */
export function createTransferDesignValidation(input: { context: BrowserPreparationContext; controller: RunController; guard(): Promise<void> }) {
  const { context: ctx, controller, guard } = input;
  let pending: Promise<unknown> = Promise.resolve();
  const path = (binding: Binding, check: 1 | 2, suffix: string) => `host-transfer-design-validation/${binding.taskId}/${binding.attemptId}/check-${check}-${suffix}`;
  async function optional(root: string, name: string): Promise<Buffer | null> {
    try { return await regularFile(root, name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async function binding(task: TaskContract, workspace?: string): Promise<Binding> {
    await guard();
    requireThat(isValidationRequirement(ctx.requirement) && task.taskId === ctx.designTaskId && task.attempts.length === 1, 'design validation requires its original author attempt');
    const attempt = task.attempts[0];
    const fixedWorkspace = await realpath(join(ctx.root, `validation/${ctx.requirement.validation.caseId}/${ctx.designTaskId}/workspace`));
    requireThat(!workspace || resolve(workspace) === fixedWorkspace, 'design validation workspace changed');
    const origin = decode(await regularFile(ctx.root, `journal/task-${task.taskId}/origin.json`)) as RecoveryOrigin;
    requireThat(isDeepStrictEqual(origin.requirement, ctx.requirement), 'design validation source or complete requirement changed');
    requireOriginalTask(origin.prepared.task, task);
    const journal = await TaskJournal.open({ artifactRoot: ctx.root, journalRoot: join(ctx.root, 'journal') }, origin, true);
    const result = { taskId: task.taskId, attemptId: attempt.attemptId, authorId: task.authorId, contextId: task.context.contextId,
      sessionRef: attempt.sessionRef, workspace: fixedWorkspace, requirement: structuredClone(ctx.requirement), requirementCapture: structuredClone(ctx.requirementCapture),
      inputs: structuredClone(task.inputs), inputSignature: await journal.signature([...task.inputs, ...task.context.interfaces]) };
    await guard(); return result;
  }
  function evaluate(bytes: Buffer | null, check: 1 | 2): Result {
    let message: string;
    if (!bytes) message = 'Required runtime transfer design output is missing';
    else {
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { return { passed: false, rewritesRemaining: check === 1 ? 1 : 0, diagnosis: { kind: 'invalid_transfer_design', message: 'Runtime transfer design must use valid UTF-8.' } }; }
      let value: unknown;
      try { value = JSON.parse(text); }
      catch { return { passed: false, rewritesRemaining: check === 1 ? 1 : 0, diagnosis: { kind: 'invalid_transfer_design', message: 'Runtime transfer design requires one complete JSON object.' } }; }
      try { return { passed: true, rewritesRemaining: 0, mapVersion: validateTransferDesign(value, ctx.requirementCapture).design.mapVersion }; }
      catch (error) { message = error instanceof Error && error.message.startsWith('Transfer design:') ? error.message : 'Runtime transfer design violates its fixed schema or oracle.'; }
    }
    return { passed: false, rewritesRemaining: check === 1 ? 1 : 0, diagnosis: { kind: 'invalid_transfer_design', message } };
  }
  async function audit(fixed: Binding, check: 1 | 2): Promise<Audit | null> {
    const startPath = path(fixed, check, 'started.json'), resultPath = path(fixed, check, 'result.json'), rawPath = path(fixed, check, 'raw.json');
    const startBytes = await optional(ctx.root, startPath), resultBytes = await optional(ctx.root, resultPath), bytes = await optional(ctx.root, rawPath);
    if (!startBytes && !resultBytes && !bytes) return null;
    requireThat(startBytes && resultBytes, 'design validation started without a complete result; outcome is unknown');
    const started = decode(startBytes) as Started, saved = decode(resultBytes);
    const expected: Started = { formatVersion: 'transfer-design-check-started/1', binding: fixed, check,
      raw: { location: rawPath, present: !!bytes, sha256: bytes ? sha(bytes) : null } };
    requireThat(isDeepStrictEqual(started, expected), 'design validation raw bytes, inputs or attempt binding changed');
    const result = evaluate(bytes, check);
    requireThat(isDeepStrictEqual(saved, { formatVersion: 'transfer-design-check-result/1', startedSha256: sha(JSON.stringify(started)), result }), 'design validation result changed');
    return { started, result, bytes, resultPath };
  }
  async function records(fixed: Binding) {
    const first = await audit(fixed, 1), second = await audit(fixed, 2);
    requireThat(!second || first && !first.result.passed && first.result.rewritesRemaining === 1, 'design validation rewrite was not authorized');
    return { first, second, last: second ?? first };
  }
  async function active(signal?: AbortSignal) {
    signal?.throwIfAborted(); await guard();
    const snapshot = await controller.read(), task = snapshot.tasks.find(task => task.taskId === ctx.designTaskId);
    const authority = await controller.validationAuthority(ctx.designTaskId, 'author');
    requireThat(task?.state === 'running' && task.attempts.at(-1)?.outcome === 'running' && authority.admissionAllowed
      && !snapshot.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0), 'design validation has no reconciled original author authority');
    signal?.throwIfAborted(); return task;
  }
  const sameBytes = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
  async function validate(workspace: string, signal?: AbortSignal): Promise<Result> {
    const task = await active(signal), fixed = await binding(task, workspace), { first, second, last } = await records(fixed);
    const bytes = await optional(fixed.workspace, MAP);
    if (last && sameBytes(bytes, last.bytes)) return last.result;
    requireThat(!last?.result.passed, 'sealed transfer design bytes changed');
    requireThat(!second, 'design semantic rewrite is exhausted');
    const check = first ? 2 : 1;
    const folder = path(fixed, check, 'started.json').split('/').slice(0, -1).join('/'); await directory(ctx.root, folder);
    const started: Started = { formatVersion: 'transfer-design-check-started/1', binding: fixed, check,
      raw: { location: path(fixed, check, 'raw.json'), present: !!bytes, sha256: bytes ? sha(bytes) : null } };
    await publishReceipt(join(ctx.root, path(fixed, check, 'started.json')), started, signal);
    if (bytes) await writeFile(join(ctx.root, started.raw.location), bytes, { flag: 'wx', signal });
    const result = evaluate(bytes, check);
    await active(signal); requireThat(isDeepStrictEqual(await binding(task, workspace), fixed), 'design validation inputs changed during the check');
    await publishReceipt(join(ctx.root, path(fixed, check, 'result.json')), { formatVersion: 'transfer-design-check-result/1', startedSha256: sha(JSON.stringify(started)), result }, signal);
    signal?.throwIfAborted(); return result;
  }
  const hostTools: NonNullable<BrowserInputPreparation['designHostTools']> = { names: [TOOL], create: async supplied => {
    if (supplied.role !== 'design' || supplied.taskId !== ctx.designTaskId) return [];
    return [{ readOnly: false, tool: defineTool({ name: TOOL, label: 'Validate runtime transfer design',
      description: 'Validate the complete fixed transfer-design.json. First failure permits one rewrite process; a second failure exhausts it. A pass seals exact bytes. No arguments.',
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute(_id, args, signal) {
        requireThat(args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0, 'design validation accepts no arguments');
        const operation = pending.then(() => validate(supplied.workspace, signal)); pending = operation.catch(() => {});
        return { content: [{ type: 'text' as const, text: JSON.stringify(await operation) }], details: {} };
      },
    }) }];
  } };
  return { hostTools, async seal(task: TaskContract, workspace?: string) {
    const fixed = await binding(task, workspace), { second, last } = await records(fixed);
    requireThat(last, 'required runtime transfer design validation tool was not called');
    requireThat(last.result.passed, (second ? 'Design semantic rewrite exhausted: ' : '') + last.result.diagnosis?.message);
    requireThat(last.bytes && sameBytes(await optional(fixed.workspace, MAP), last.bytes), 'sealed transfer design bytes changed before capture or recovery');
    await guard(); return { bytes: last.bytes, sha256: sha(last.bytes), source: last.started.raw.location, receipt: last.resultPath };
  } };
}
