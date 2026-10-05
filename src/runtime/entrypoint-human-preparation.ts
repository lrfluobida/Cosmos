import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateGameDraft, confirmRequirements } from '../roles/requirements.ts';
import type { PreparationGameDraft } from '../roles/requirements.ts';
import { modeFromSelection } from '../roles/preparation-mode.ts';
import type { HostInput } from './entrypoint.ts';
import type { PreparedTask } from './orchestrator.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { requireOriginalTask } from './recovery/task-journal.ts';

export interface HumanPreparationInput extends Omit<HostInput, 'draft' | 'binding'> { draft: PreparationGameDraft }
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');

/** Fixed runtime import closure; type imports and unrelated repository files are excluded. */
async function packageSource(entry: string, name: string) {
  let folder = dirname(entry);
  for (;;) {
    try { const path = join(folder, 'package.json'), bytes = await readFile(path), value = decode(bytes);
      if (value.name === name) return { path, sha256: hash(bytes), version: value.version as string }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(folder); if (parent === folder) throw new Error('Resolved runtime dependency manifest is missing.'); folder = parent;
  }
}
/** Follow executable literal imports/requires, never enumerate a package or repository tree. */
async function directClosure(entry: string) {
  const files = new Map<string, string>();
  const codePositions = (text: string) => {
    const code = new Uint8Array(text.length); let quote = '', comment = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (comment === 'line') { if (char === '\n') comment = ''; continue; }
      if (comment === 'block') { if (char === '*' && next === '/') { comment = ''; i++; } continue; }
      if (quote) { if (char === '\\') i++; else if (char === quote) quote = ''; continue; }
      if (char === '/' && (next === '/' || next === '*')) { comment = next === '/' ? 'line' : 'block'; i++; continue; }
      code[i] = 1; if (char === '"' || char === "'" || char === '`') quote = char;
    }
    return code;
  };
  async function visit(file: string) {
    const path = await realpath(file); if (files.has(path)) return;
    const bytes = await readFile(path); files.set(path, hash(bytes));
    if (!/\.(?:[cm]?js|json)$/.test(path) && path !== entry) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), require = createRequire(path), code = codePositions(text);
    const comments = [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map(match => [match.index!, match.index! + match[0].length]);
    const refs = [...text.matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g)];
    for (const match of refs) {
      if (!code[match.index!] || comments.some(([start, end]) => start <= match.index! && match.index! < end)) continue;
      const ref = match[1] ?? match[2] ?? match[3];
      if (ref.startsWith('.')) await visit(require.resolve(ref));
      else if (['playwright', 'playwright/test', 'playwright-core'].includes(ref)) await visit(match[3] ? require.resolve(ref) : fileURLToPath(import.meta.resolve(ref)));
    }
  }
  await visit(entry); return [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 }));
}
/** Runner/persistent already loaded Playwright; bind the actual CommonJS children and its ESM wrappers. */
async function browserClosure(entry: string) {
  const require = createRequire(import.meta.url), paths = new Set([entry, await realpath(fileURLToPath(import.meta.resolve('playwright/test')))]);
  const seed = require.cache[require.resolve('playwright/test')];
  if (!seed) throw new Error('Actual Playwright runner implementation is not loaded.');
  const seen = new Set<string>();
  function visit(module: NodeJS.Module) { if (seen.has(module.filename)) return; seen.add(module.filename); paths.add(module.filename); for (const child of module.children) visit(child); }
  visit(seed);
  for (const name of ['playwright', 'playwright-core']) {
    const selected = await realpath(require.resolve(name)), manifest = await packageSource(selected, name); paths.add(selected); paths.add(manifest.path);
  }
  return Promise.all([...paths].sort().map(async path => ({ path: await realpath(path), sha256: hash(await readFile(path)) })));
}
export async function executionSource(root: string) {
  const extension = import.meta.url.endsWith('.js') ? '.js' : '.ts', base = new URL('../', import.meta.url), files = new Map<string, string>();
  async function visit(url: URL, imports = true) {
    const path = await realpath(fileURLToPath(url)); if (files.has(path)) return;
    const bytes = await readFile(path); files.set(path, hash(bytes));
    if (!imports) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    for (const match of text.matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"](\.[^'"]+)['"]/g)) await visit(new URL(match[1], url));
  }
  // Dynamic modules/owned worker entrypoints selected by this production path.
  await visit(new URL(`cli/index${extension}`, base), false);
  for (const path of ['cli/session', 'cli/continuation-session', 'runtime/entrypoint-host', 'runtime/adapters/transfer/runtime-host',
    'runtime/coding-check-worker', 'acceptance/process', 'acceptance/runner']) {
    const url = new URL(path + extension, base);
    await visit(url);
  }
  const dependencies = [];
  for (const name of ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', 'typebox', '@playwright/test']) {
    const entry = await realpath(fileURLToPath(import.meta.resolve(name))), manifest = await packageSource(entry, name);
    dependencies.push({ name, entry, entrySha256: hash(await readFile(entry)), ...manifest, files: name === '@playwright/test' ? await browserClosure(entry) : [] });
  }
  const toolLockPath = await realpath(join(root, 'toolchain/package-lock.json')), toolLockBytes = await readFile(toolLockPath), toolLock = decode(toolLockBytes), tools = [];
  for (const [name, file] of [['typescript', 'typescript/bin/tsc'], ['vite', 'vite/bin/vite.js']]) {
    const invocation = join(root, 'toolchain/node_modules', file), entry = await realpath(invocation), manifest = await packageSource(entry, name);
    if (toolLock.packages?.[`node_modules/${name}`]?.version !== manifest.version) throw new Error('Actual installed tool version differs from the fixed toolchain lock.');
    tools.push({ name, invocation, entry, ...manifest, files: await directClosure(entry) });
  }
  const lockPath = await realpath(fileURLToPath(new URL('../../package-lock.json', import.meta.url)));
  const source = { variant: extension === '.js' ? 'compiled' : 'source', files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })),
    platformLock: { path: lockPath, sha256: hash(await readFile(lockPath)) }, dependencies, toolchain: { lock: { path: toolLockPath, sha256: hash(toolLockBytes) }, tools } };
  return { ...source, sha256: hash(JSON.stringify(source)), sourceVersion: createHash('sha1').update(JSON.stringify(source)).digest('hex') };
}
export async function requireExecutionSource(source: Awaited<ReturnType<typeof executionSource>>) {
  const files = [...source.files, source.platformLock, source.toolchain.lock,
    ...source.dependencies.flatMap(item => [{ path: item.entry, sha256: item.entrySha256 }, { path: item.path, sha256: item.sha256 }, ...item.files]),
    ...source.toolchain.tools.flatMap(item => [{ path: item.path, sha256: item.sha256 }, ...item.files])];
  if (!(await Promise.all(files.map(async file => hash(await readFile(file.path)) === file.sha256))).every(Boolean)) throw new Error('Actual executed preparation source or dependency bytes changed.');
  for (const item of source.dependencies) if (await realpath(fileURLToPath(import.meta.resolve(item.name))) !== item.entry) throw new Error('Actual resolved preparation dependency source changed.');
  for (const item of source.toolchain.tools) if (await realpath(item.invocation) !== item.entry) throw new Error('Actual installed preparation tool entry resolution changed.');
}

/** Real human confirmation stays in its original run, ledger and execution authority. */
export async function createHumanPreparationScope(input: HumanPreparationInput) {
  const { root, controller, requirement, draft, work } = input;
  validateGameDraft(draft, modeFromSelection(draft.preparation));
  if (!draft.preparation || draft.unsupported.length || 'validation' in requirement) throw new Error('Human preparation requires its confirmed supported draft.');
  const initial = await controller.read();
  if (initial.ledger.entries.some(item => item.unknown || item.reservedMicroCny > 0)) throw new Error('Original human requests require reconciliation before preparation.');
  const decision = initial.run.humanDecisions.find(item => sameValue(item.evidence, requirement.sources));
  if (!decision || requirement.sources.length !== 2 || decision.decisionId !== `requirements-${requirement.sources[0].version}`
    || decision.actorId !== requirement.confirmedBy || decision.decidedAt !== requirement.confirmedAt) throw new Error('Original human confirmation identity changed.');
  const revision = Number(requirement.sources[0].version.slice(1));
  const confirmation = { revision, confirmed: true, actorId: requirement.confirmedBy, at: requirement.confirmedAt, runId: initial.run.runId, draft: requirement.sources[0] };
  const mode = { runId: initial.run.runId, createdAt: initial.events[0].at, draftMode: draft.preparation };
  const expectedRequirement = confirmRequirements({ ...draft, specVersion: initial.run.specVersion, sources: requirement.sources }, confirmation);
  if (!sameValue(expectedRequirement, requirement)) throw new Error('Complete human preparation requirement changed.');
  const sources = [{ location: requirement.sources[0].location, bytes: canonical(draft) }, { location: requirement.sources[1].location, bytes: canonical(confirmation) }, { location: 'intake-mode.json', bytes: canonical(mode) }];
  const fixed = { runId: initial.run.runId, ledgerId: initial.ledger.ledgerId, specVersion: initial.run.specVersion, startedAt: initial.run.originalStartedAt,
    deadlineAt: initial.run.originalDeadlineAt, requirement, sources: sources.map(item => ({ location: item.location, sha256: hash(item.bytes) })), execution: await executionSource(root) };
  const sourcePath = 'host-human-preparation-source.json', sourceReceipt = { formatVersion: 'human-preparation-source/1', ...fixed };
  let sourcePublished = false, tasks: PreparedTask[] | undefined;
  const requireCurrent = async () => {
    work.signal.throwIfAborted(); controller.requireExecutionWindow(); const state = await controller.read();
    if (state.formatVersion !== 1 || state.run.kind !== 'runtime_generation' || state.ledger.scope !== 'generation' || state.ledger.limitMicroCny !== 200_000_000
      || state.run.runId !== fixed.runId || state.ledger.ledgerId !== fixed.ledgerId || state.run.originalStartedAt !== fixed.startedAt || state.run.originalDeadlineAt !== fixed.deadlineAt
      || state.stopReason || Date.now() >= Date.parse(fixed.deadlineAt) || state.ledger.entries.some(item => item.unknown)
      || !state.run.humanDecisions.some(item => sameValue(item, decision))) throw new Error('Original human preparation scope, stop, cost or window changed.');
    for (const source of sources) if (!(await regularFile(root, source.location)).equals(source.bytes)) throw new Error('Original human confirmation source bytes changed.');
    await requireExecutionSource(fixed.execution);
    if (sourcePublished && !(await regularFile(root, sourcePath)).equals(canonical(sourceReceipt))) throw new Error('Original human preparation source binding bytes changed.');
    if (tasks) {
      const coding = tasks.find(item => item.role === 'coding')!;
      if (!(await regularFile(root, 'host-human-preparation-tasks.json')).equals(canonical({ formatVersion: 'human-preparation-tasks/1', runId: fixed.runId,
        ledgerId: fixed.ledgerId, sourceSha256: fixed.execution.sha256, tasks, repairTaskId: `${coding.task.taskId.slice(0, 57)}-repair` }))) throw new Error('Original human prepared task binding bytes changed.');
    }
    work.signal.throwIfAborted(); return state;
  };
  await requireCurrent();
  if (input.resume) { if (!sameValue(decode(await regularFile(root, sourcePath)), sourceReceipt)) throw new Error('Original human preparation source binding changed.'); }
  else await publishReceipt(join(root, sourcePath), sourceReceipt, work.signal);
  sourcePublished = true;
  const readBinding = async () => decode(await regularFile(root, 'host-human-preparation-tasks.json')) as { tasks: PreparedTask[]; repairTaskId: string };
  return { ...fixed, requireCurrent, bound: () => tasks !== undefined, tasks: () => { if (!tasks) throw new Error('Human preparation task binding is not sealed.'); return tasks; },
    async bind(originals: PreparedTask[]) {
      await requireCurrent(); const execution = decode(await regularFile(root, 'execution.json'));
      if (!sameValue(execution.requirement, requirement) || !sameValue(execution.tasks, originals)) throw new Error('Human tasks differ from the original sealed execution plan.');
      const coding = originals.find(item => item.role === 'coding'); if (!coding) throw new Error('Human coding task is missing.');
      const receipt = { formatVersion: 'human-preparation-tasks/1', runId: fixed.runId, ledgerId: fixed.ledgerId, sourceSha256: fixed.execution.sha256,
        tasks: originals, repairTaskId: `${coding.task.taskId.slice(0, 57)}-repair` };
      const state = await requireCurrent();
      if (input.resume || tasks) {
        try { if (!sameValue(await readBinding(), receipt)) throw new Error('Original human prepared task binding changed.'); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || tasks || state.tasks.length || originals.some(item => state.ledger.allocations.some(grant => grant.taskId === item.task.taskId))) throw error;
          await publishReceipt(join(root, 'host-human-preparation-tasks.json'), receipt, work.signal);
        }
      }
      else await publishReceipt(join(root, 'host-human-preparation-tasks.json'), receipt, work.signal);
      for (const item of originals) { const current = state.tasks.find(task => task.taskId === item.task.taskId);
        if (current) requireOriginalTask(item.task, current);
        else if ((input.resume || tasks) && (state.tasks.length || originals.some(original => state.ledger.allocations.some(grant => grant.taskId === original.task.taskId)))) throw new Error('Original human prepared task registration is incomplete.'); }
      tasks = structuredClone(originals);
    },
  };
}
export type HumanPreparationScope = Awaited<ReturnType<typeof createHumanPreparationScope>>;
