import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { directory, regularFile, safePath, snapshot, within } from '../../artifacts/paths.ts';
import { sameValue } from '../../contracts/validation.ts';
import type { ArtifactReference, TaskContract } from '../../contracts/types.ts';
import { isValidationRequirement } from '../../roles/execution-input.ts';
import type { ExecutionRequirement } from '../../roles/execution-input.ts';
import type { ValidationJournalBinding } from '../validation-scope.ts';
import type { AuthorProposal, PreparedTask } from '../orchestrator.ts';
import type { ExecutionWindowBinding } from '../execution-window.ts';
import { publishReceipt } from './receipt-file.ts';

export interface CapturedTask { artifacts: ArtifactReference[]; reviewWorkspace: string }
export interface RecoveryOptions {
  journalRoot: string;
  /** Exact fixed references are relative to this host-owned artifact root. */
  artifactRoot: string;
  /** Read-only host check of fixed manifest/attempt and promotion status, also on reuse.
   * Return null when completion is unknown or a required registry proof was lost. */
  recoverCapture?: (task: TaskContract, proposal: AuthorProposal, signal: AbortSignal) => Promise<CapturedTask | null>;
}
export interface RecoveryReport { tasks: TaskContract[]; reusedTaskIds: string[]; blocked: { taskId: string; reason: string }[] }
export class RecoveryBlocked extends Error {}
type Stage = 'author' | 'author-correction-started' | 'author-correction-response' | 'capture-started' | 'capture' | 'verify-started' | 'verified' | 'review-started' | 'review' | 'failure-snapshot';
export interface RecoveryOrigin {
  formatVersion: 1 | 2 | 3; runId: string; ledgerId: string; originalStartedAt: string; originalDeadlineAt: string;
  limitMicroCny: number; requirement: ExecutionRequirement; prepared: PreparedTask; reviewProtocolCorrections: 0 | 1;
  artifactRoot: string; sessionRoot: string;
  /** Omission preserves historical origin bytes and disables author corrections. */
  authorProtocolCorrections?: 0 | 1;
  executionWindow?: ExecutionWindowBinding;
  validationCase?: ValidationJournalBinding;
}
export type ContentSignature = { location: string; files: { path: string; sha256: string }[] }[];

/** Write-once receipts for the existing task pipeline, not arbitrary resumable programs. */
export class TaskJournal {
  private root: string;
  private artifactRoot: string;
  private taskId: string;
  private constructor(root: string, artifactRoot: string, taskId: string) { this.root = root; this.artifactRoot = artifactRoot; this.taskId = taskId; }
  static async open(options: RecoveryOptions, origin: RecoveryOrigin, resume: boolean): Promise<TaskJournal> {
    if (origin.formatVersion === 3) {
      if (!origin.validationCase || origin.executionWindow || !isValidationRequirement(origin.requirement)
        || origin.validationCase.caseId !== origin.requirement.validation.caseId || origin.validationCase.windowId !== origin.requirement.validation.windowId) throw new RecoveryBlocked('Recovery origin must bind its explicit validation case.');
    } else if (origin.validationCase || isValidationRequirement(origin.requirement) || (origin.formatVersion === 1 ? origin.executionWindow !== undefined : origin.formatVersion !== 2 || !origin.executionWindow)) throw new RecoveryBlocked('Recovery origin must bind its explicit execution window or retain v1.');
    if (!isAbsolute(options.journalRoot) || !isAbsolute(options.artifactRoot)) throw new RecoveryBlocked('Recovery requires explicit absolute host roots.');
    await safePath(options.artifactRoot);
    const artifactRoot = await realpath(options.artifactRoot);
    const root = await safePath(options.journalRoot, `task-${encodeURIComponent(origin.prepared.task.taskId)}`);
    const expected = { ...origin, artifactRoot };
    if (resume) {
      let previous: unknown;
      try { previous = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, 'origin.json'))); }
      catch { throw new RecoveryBlocked('Missing or incomplete recovery origin; prior execution cannot be inferred.'); }
      if (!sameValue(previous, expected)) throw new RecoveryBlocked('Recovery origin, task, requirements or execution policy changed.');
    } else {
      await directory(root, '.'); await publishReceipt(join(root, 'origin.json'), expected);
    }
    return new TaskJournal(root, artifactRoot, origin.prepared.task.taskId);
  }
  async read<T>(stage: Stage, attemptId: string): Promise<T | null> {
    let value: any;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(this.root, `${stage}.json`))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new RecoveryBlocked(`Incomplete ${stage} receipt; completion is unknown.`);
    }
    if (value?.formatVersion !== 1 || value.taskId !== this.taskId || value.attemptId !== attemptId || !Object.hasOwn(value, 'value')) throw new RecoveryBlocked(`Conflicting ${stage} receipt identity.`);
    return value.value as T;
  }
  async write(stage: Stage, attemptId: string, value: unknown): Promise<void> {
    await publishReceipt(join(this.root, `${stage}.json`), { formatVersion: 1, taskId: this.taskId, attemptId, value });
  }
  async signature(references: ArtifactReference[]): Promise<ContentSignature> {
    const result: ContentSignature = [];
    for (const location of [...new Set(references.map(ref => ref.location))].sort()) {
      const absolute = resolve(this.artifactRoot, location);
      if (absolute === this.artifactRoot || !within(this.artifactRoot, absolute)) throw new RecoveryBlocked('Recovery references must name fixed files or snapshots inside the artifact root.');
      const name = relative(this.artifactRoot, absolute).split(sep).join('/');
      const path = await safePath(this.artifactRoot, name), info = await lstat(path);
      const files = info.isDirectory() ? await snapshot(path) : new Map([['', await regularFile(this.artifactRoot, name)]]);
      result.push({ location, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, sha256: createHash('sha256').update(bytes).digest('hex') })) });
    }
    return result;
  }
  async requireSignature(value: ContentSignature, references: ArtifactReference[]): Promise<void> {
    try { if (sameValue(value, await this.signature(references))) return; }
    catch { /* A missing file is also an unprovable fixed version. */ }
    throw new RecoveryBlocked('Fixed recovery input, artifact or evidence content changed or is missing.');
  }
  async workspaceSignature(workspace: string, writePaths: string[]): Promise<ContentSignature> {
    const result: ContentSignature = [];
    for (const path of [...new Set(writePaths)].sort()) {
      const location = await safePath(workspace, path);
      const info = await lstat(location).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      const files = !info ? new Map<string, Buffer>() : info.isDirectory() ? await snapshot(location) : new Map([['', await regularFile(workspace, path)]]);
      result.push({ location, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, sha256: createHash('sha256').update(bytes).digest('hex') })) });
    }
    return result;
  }
  async requireWorkspaceSignature(value: ContentSignature, workspace: string, writePaths: string[]): Promise<void> {
    if (!sameValue(value, await this.workspaceSignature(workspace, writePaths))) throw new RecoveryBlocked('Author workspace changed during or after its read-only correction.');
  }
}

/** Only runtime fields may have changed since the original registered task. */
export function requireOriginalTask(original: TaskContract, current: TaskContract): void {
  const mutable = new Set(['state', 'stateReason', 'attempts', 'artifacts', 'evidence', 'handoff', 'review', 'dependsOn']);
  for (const key of Object.keys(original) as (keyof TaskContract)[]) if (!mutable.has(key) && !sameValue(original[key], current[key])) throw new RecoveryBlocked('Recorded task differs from its original execution contract.');
  if (!sameValue(original.dependsOn.map(({ taskId, requiredState }) => ({ taskId, requiredState })), current.dependsOn.map(({ taskId, requiredState }) => ({ taskId, requiredState })))) throw new RecoveryBlocked('Recorded dependency identities changed.');
}

export async function hasHostRecord(directory: string, name: 'failure.json' | 'review-correction.json'): Promise<boolean> {
  try { await lstat(await safePath(directory, name)); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw new RecoveryBlocked('Host failure or correction record cannot be inspected.'); }
}

export async function requireCorrectionIdentity(directory: string, identity: { taskId: string; attemptId: string; reviewerId: string; contextId: string }): Promise<void> {
  if (!await hasHostRecord(directory, 'review-correction.json')) return;
  try {
    const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(directory, 'review-correction.json')));
    if (record.formatVersion === 1 && record.used === 1 && Object.entries(identity).every(([key, value]) => record[key] === value)) return;
  } catch { /* Partial correction records still consume the slot. */ }
  throw new RecoveryBlocked('COS-11 correction record does not establish the original reviewer identity.');
}
