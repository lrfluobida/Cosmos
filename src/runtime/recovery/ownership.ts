import { createHash, randomUUID } from 'node:crypto';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safePath, within } from '../../artifacts/paths.ts';
import { publishReceipt } from './receipt-file.ts';
import { collectWindowsBoot } from './windows-boot.ts';
import type { WindowsBootObservation } from './windows-boot.ts';

/** A failed rollback must remain visible even when its launch already timed out. */
export class UnspawnedChildCleanupError extends AggregateError {
  constructor(operation: unknown, cleanup: unknown) {
    super([operation, cleanup], `Unspawned child cleanup failed; retaining ownership: ${String(operation)}; ${String(cleanup)}`);
  }
}

export interface OwnerRecord {
  formatVersion: 1;
  token: string;
  pid: number;
  acquiredAt: string;
  untrackedWriters: boolean;
  children: { ticket: string; pid: number | null }[];
}
const pid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
async function readOwner(path: string): Promise<{ record: OwnerRecord; bytes: Buffer }> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('Ownership record must be an independent regular file.');
  const bytes = await readFile(path);
  let record: OwnerRecord;
  try { record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Invalid ownership record; manual investigation required.'); }
  if (record?.formatVersion !== 1 || !pid(record.pid) || typeof record.token !== 'string' || !record.token
    || typeof record.acquiredAt !== 'string' || !Number.isFinite(Date.parse(record.acquiredAt)) || typeof record.untrackedWriters !== 'boolean' || !Array.isArray(record.children)
    || record.children.some(child => !child || typeof child.ticket !== 'string' || !child.ticket || (child.pid !== null && !pid(child.pid)))
    || new Set(record.children.map(child => child.ticket)).size !== record.children.length) throw new Error('Invalid or legacy ownership record; manual investigation required.');
  return { record, bytes };
}
function requireExited(value: number, label: string): void {
  try { process.kill(value, 0); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw new Error(`${label} process ownership is unknown; recovery refused.`);
  }
  // A reused PID is deliberately treated as live, never as permission to kill it.
  throw new Error(`${label} PID is alive; recovery refused.`);
}

export interface RecoverySource { path: string; sha256: string }
export interface RecoveryCodeSource { repository: string; commitSha: string }
interface FileIdentity { dev: string; ino: string; size: string; birthtimeNs: string; mtimeNs: string; ctimeNs: string }
interface BoundFile extends RecoverySource { identity: FileIdentity }
export interface PreviousBootProvenance {
  formatVersion: 'previous-boot-provenance-1';
  caseId: string;
  windowId: string;
  originalRoot: string;
  generationSource: RecoveryCodeSource;
  ownerSha256: string;
  machineHash: string;
  writerScope: 'local-processes-ended-by-full-boot';
  explanation: string;
  actorId: string;
  reviewerId: string;
  reviewedAt: string;
  references: (RecoverySource & { role: 'launch' | 'claim' | 'root-intent' | 'independent-review' })[];
}
export interface PreviousBootRecoveryQuote {
  formatVersion: 'previous-boot-quote-1';
  operationId: string;
  preparedAt: string;
  root: string;
  name: '.controller.lock' | '.commit.lock';
  evidenceRoot: string;
  owner: BoundFile & { record: OwnerRecord };
  boot: WindowsBootObservation;
  provenance: BoundFile & { value: PreviousBootProvenance; references: BoundFile[] };
  maintenanceSource: RecoveryCodeSource & { entryPath: string; files: BoundFile[] };
  generationSource: RecoveryCodeSource;
  archivePath: string;
  intentPath: string;
  outcomePath: string;
}
export interface PreviousBootRecoveryDecision {
  formatVersion: 'previous-boot-decision-1';
  kind: 'operator_previous_boot_recovery';
  decisionId: string;
  actorId: string;
  decidedAt: string;
  provenanceSource: RecoverySource;
  quote: PreviousBootRecoveryQuote;
}
interface PreparePreviousBootRecovery {
  root: string;
  name: '.controller.lock' | '.commit.lock';
  evidenceRoot: string;
  provenanceSource: RecoverySource;
  maintenanceSource: RecoveryCodeSource;
}
interface ApplyPreviousBootRecovery {
  root: string;
  name: '.controller.lock' | '.commit.lock';
  evidenceRoot: string;
  quote: PreviousBootRecoveryQuote;
  decisionSource: RecoverySource;
}
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function keys(value: unknown, expected: string[], label: string): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) throw new Error(`Invalid ${label} schema.`);
}
function nonempty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error(`Invalid ${label}.`);
}
function timestamp(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Exact UTC timestamp required.');
}
function digest(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Exact SHA-256 required.');
}
async function canonical(path: string, directory = false): Promise<string> {
  if (typeof path !== 'string' || !isAbsolute(path) || !/^[a-z]:[\\/]/i.test(path)) throw new Error('Canonical local Windows path required.');
  const normalized = resolve(path);
  await safePath(dirname(normalized), basename(normalized));
  if (await fs.realpath(normalized) !== normalized) throw new Error('Path alias is not allowed.');
  if (directory && !(await fs.lstat(normalized)).isDirectory()) throw new Error('Expected a directory.');
  return normalized;
}
function identity(info: BigIntStats): FileIdentity {
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n || info.ino <= 0n || info.dev <= 0n
    || info.birthtimeNs <= 0n || info.mtimeNs <= 0n || info.ctimeNs <= 0n) throw new Error('Stable independent regular file identity required.');
  return { dev: String(info.dev), ino: String(info.ino), size: String(info.size), birthtimeNs: String(info.birthtimeNs), mtimeNs: String(info.mtimeNs), ctimeNs: String(info.ctimeNs) };
}
async function exactFile(path: string): Promise<BoundFile & { bytes: Buffer }> {
  path = await canonical(path);
  const before = identity(await fs.lstat(path, { bigint: true })), bytes = await fs.readFile(path);
  if (!equal(before, identity(await fs.lstat(path, { bigint: true }))) || before.size !== String(bytes.length)) throw new Error('File identity changed during read.');
  return { path, sha256: sha256(bytes), identity: before, bytes };
}
function bound(file: BoundFile & { bytes: Buffer }): BoundFile { return { path: file.path, sha256: file.sha256, identity: file.identity }; }
function json<T>(bytes: Buffer): T {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Authority requires complete UTF-8 JSON.'); }
}
async function authority(source: RecoverySource, evidenceRoot: string) {
  keys(source, ['path', 'sha256'], 'authority source'); digest(source.sha256);
  if (!within(evidenceRoot, source.path) || resolve(source.path) === evidenceRoot) throw new Error('Authority must be in the independent operator evidence directory.');
  const file = await exactFile(source.path);
  if (file.sha256 !== source.sha256) throw new Error('Authority source changed.');
  return file;
}
function git(root: string, ...args: string[]): Buffer {
  try { return childProcess.execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', root, ...args],
    { windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Recovery source Git inspection failed.'); }
}
async function codeSource(source: RecoveryCodeSource, generation = false): Promise<RecoveryCodeSource> {
  keys(source, ['repository', 'commitSha'], 'code source');
  if (!/^[a-f0-9]{40}$/.test(source.commitSha)) throw new Error('Exact source commit required.');
  const repository = await canonical(source.repository, true), text = (...args: string[]) => git(repository, ...args).toString('utf8').trim();
  if (resolve(text('rev-parse', '--show-toplevel')) !== repository || text('rev-parse', 'HEAD') !== source.commitSha
    || text('status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none')
    || git(repository, 'ls-files', '-v', '-z').toString('utf8').split('\0').some(entry => /^[a-zS] /.test(entry))
    || (generation && text('symbolic-ref', '--quiet', '--short', 'HEAD') !== 'main')) throw new Error('Recovery source requires exact clean reviewed identity; generation must remain on main.');
  return { repository, commitSha: source.commitSha };
}
async function maintenance(source: RecoveryCodeSource): Promise<PreviousBootRecoveryQuote['maintenanceSource']> {
  const current = await codeSource(source), entryPath = await canonical(fileURLToPath(import.meta.url));
  if (!within(current.repository, entryPath)) throw new Error('Maintenance source must contain the actual executing entry module.');
  const files = new Map<string, BoundFile>();
  async function visit(path: string): Promise<void> {
    path = resolve(path); if (files.has(path)) return;
    if (!within(current.repository, path)) throw new Error('Maintenance import escaped its reviewed repository.');
    const file = await exactFile(path), name = relative(current.repository, path).split(sep).join('/');
    if (!git(current.repository, 'show', `${current.commitSha}:${name}`).equals(file.bytes)) throw new Error('Executing maintenance source differs from its reviewed commit.');
    files.set(path, bound(file));
    const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    // These maintenance modules only use static imports. Unknown dynamic loaders stay blocked.
    if (/\b(?:import\s*\(|require\s*\(|eval\s*\()/.test(sourceText)) throw new Error('Dynamic maintenance imports are unsupported.');
    for (const match of sourceText.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"];?/gm)) {
      if (match[1].startsWith('node:')) continue;
      if (!match[1].startsWith('.')) throw new Error('External maintenance dependencies are unsupported.');
      await visit(resolve(dirname(path), match[1]));
    }
  }
  await visit(entryPath); await codeSource(current);
  return { ...current, entryPath, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
async function previousBootFacts(options: PreparePreviousBootRecovery) {
  const root = await canonical(options.root, true), evidenceRoot = await canonical(options.evidenceRoot, true);
  if (!['.controller.lock', '.commit.lock'].includes(options.name) || within(root, evidenceRoot) || within(evidenceRoot, root)) throw new Error('Recovery requires an allowed lock and separate operator evidence directory.');
  const original = await exactFile(join(root, options.name)), parsed = await readOwner(original.path);
  if (!original.bytes.equals(parsed.bytes)) throw new Error('Ownership changed during inspection.');
  keys(parsed.record, ['formatVersion', 'token', 'pid', 'acquiredAt', 'untrackedWriters', 'children'], 'v1 owner'); timestamp(parsed.record.acquiredAt);
  for (const child of parsed.record.children) keys(child, ['ticket', 'pid'], 'v1 child');
  const source = await authority(options.provenanceSource, evidenceRoot), provenance = json<PreviousBootProvenance>(source.bytes);
  keys(provenance, ['formatVersion', 'caseId', 'windowId', 'originalRoot', 'generationSource', 'ownerSha256', 'machineHash', 'writerScope', 'explanation', 'actorId', 'reviewerId', 'reviewedAt', 'references'], 'previous boot provenance');
  for (const key of ['caseId', 'windowId', 'explanation', 'actorId', 'reviewerId'] as const) nonempty(provenance[key], key);
  timestamp(provenance.reviewedAt); digest(provenance.machineHash);
  if (provenance.formatVersion !== 'previous-boot-provenance-1' || provenance.originalRoot !== root || provenance.ownerSha256 !== original.sha256
    || provenance.writerScope !== 'local-processes-ended-by-full-boot' || provenance.actorId === provenance.reviewerId || Date.parse(provenance.reviewedAt) > Date.now()
    || !Array.isArray(provenance.references) || provenance.references.length !== 4
    || provenance.references.map(ref => ref.role).sort().join(',') !== 'claim,independent-review,launch,root-intent') throw new Error('Insufficient original local previous-boot provenance.');
  const references: BoundFile[] = [];
  for (const ref of provenance.references) {
    keys(ref, ['role', 'path', 'sha256'], 'provenance reference');
    references.push(bound(await authority({ path: ref.path, sha256: ref.sha256 }, evidenceRoot)));
  }
  if (new Set([source.path, ...references.map(ref => ref.path)]).size !== 5) throw new Error('Independent original provenance references required.');
  const generationSource = await codeSource(provenance.generationSource, true), maintenanceSource = await maintenance(options.maintenanceSource);
  if (generationSource.repository === maintenanceSource.repository) throw new Error('Original generation and maintenance sources must be separate.');
  const paths = [...new Set([root, evidenceRoot, original.path, source.path, ...references.map(ref => ref.path), generationSource.repository,
    maintenanceSource.repository, ...maintenanceSource.files.map(file => file.path)])].sort();
  const boot = await collectWindowsBoot(paths);
  const [seconds, fraction] = boot.bootAt.slice(0, -1).split('.'), bootNs = BigInt(Date.parse(`${seconds}Z`)) * 1_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (provenance.machineHash !== boot.machineHash || Date.parse(parsed.record.acquiredAt) >= Date.parse(boot.bootAt)
    || BigInt(original.identity.birthtimeNs) >= bootNs || BigInt(original.identity.mtimeNs) >= bootNs || BigInt(original.identity.ctimeNs) >= bootNs
    || BigInt(original.identity.mtimeNs) < BigInt(Date.parse(parsed.record.acquiredAt)) * 1_000_000n) throw new Error('Owner is not an unchanged original from this machine before the current full boot.');
  return { root, name: options.name, evidenceRoot, owner: { ...bound(original), record: parsed.record }, boot,
    provenance: { ...bound(source), value: provenance, references }, maintenanceSource, generationSource, originalBytes: original.bytes };
}
function stableFacts(value: ReturnType<typeof factsFromQuote>) {
  const { observedAt: _observedAt, ...boot } = value.boot;
  return { ...value, boot };
}
function factsFromQuote(quote: Pick<PreviousBootRecoveryQuote, 'root' | 'name' | 'evidenceRoot' | 'owner' | 'boot' | 'provenance' | 'maintenanceSource' | 'generationSource'>) {
  return { root: quote.root, name: quote.name, evidenceRoot: quote.evidenceRoot, owner: quote.owner, boot: quote.boot, provenance: quote.provenance,
    maintenanceSource: quote.maintenanceSource, generationSource: quote.generationSource };
}
async function decision(source: RecoverySource, quote: PreviousBootRecoveryQuote) {
  const file = await authority(source, quote.evidenceRoot), value = json<PreviousBootRecoveryDecision>(file.bytes);
  keys(value, ['formatVersion', 'kind', 'decisionId', 'actorId', 'decidedAt', 'provenanceSource', 'quote'], 'operator decision');
  nonempty(value.decisionId, 'decision ID'); nonempty(value.actorId, 'actor ID'); timestamp(value.decidedAt);
  if (value.formatVersion !== 'previous-boot-decision-1' || value.kind !== 'operator_previous_boot_recovery' || !equal(value.quote, quote)
    || !equal(value.provenanceSource, { path: quote.provenance.path, sha256: quote.provenance.sha256 })
    || Date.parse(value.decidedAt) < Date.parse(quote.preparedAt) || Date.parse(value.decidedAt) > Date.now()
    || [quote.provenance.path, ...quote.provenance.references.map(ref => ref.path)].includes(file.path)) throw new Error('Exact independent operator decision required.');
  return { ...bound(file), value };
}

async function writeOriginal(path: string, bytes: Buffer): Promise<void> {
  await safePath(dirname(path), basename(path));
  const handle = await fs.open(path, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  if (!(await exactFile(path)).bytes.equals(bytes)) throw new Error('Original archive readback failed.');
}
async function publishAudit(path: string, value: unknown): Promise<void> {
  await safePath(dirname(path), basename(path)); await publishReceipt(path, value);
  if (!equal(json((await exactFile(path)).bytes), value)) throw new Error('Recovery audit readback failed.');
}

/** Exclusive local ownership. Registered children require a durable intent before spawn. */
export class OwnerLock {
  private path: string;
  private record: OwnerRecord;
  private constructor(path: string, record: OwnerRecord) { this.path = path; this.record = record; }
  private closed = false;
  private released = false;
  private closePromise?: Promise<void>;
  private pending: Promise<unknown> = Promise.resolve();

  /** Read-only maintenance quote; v1 historical attribution remains the independent operator's judgment. */
  static async preparePreviousBootRecovery(options: PreparePreviousBootRecovery): Promise<PreviousBootRecoveryQuote> {
    keys(options, ['root', 'name', 'evidenceRoot', 'provenanceSource', 'maintenanceSource'], 'previous boot prepare options');
    const { originalBytes: _bytes, ...facts } = await previousBootFacts(options), operationId = randomUUID();
    return { formatVersion: 'previous-boot-quote-1', operationId, preparedAt: new Date().toISOString(), ...facts,
      archivePath: join(facts.evidenceRoot, `${operationId}.owner.bin`), intentPath: join(facts.evidenceRoot, `${operationId}.intent.json`),
      outcomePath: join(facts.evidenceRoot, `${operationId}.outcome.json`) };
  }

  /** Exact owner-only recovery. No PID signal, runtime opening, task dispatch or ledger write occurs here. */
  static async recoverPreviousBoot(options: ApplyPreviousBootRecovery) {
    keys(options, ['root', 'name', 'evidenceRoot', 'quote', 'decisionSource'], 'previous boot apply options');
    const quote = structuredClone(options.quote);
    keys(quote, ['formatVersion', 'operationId', 'preparedAt', 'root', 'name', 'evidenceRoot', 'owner', 'boot', 'provenance', 'maintenanceSource', 'generationSource', 'archivePath', 'intentPath', 'outcomePath'], 'previous boot quote');
    if (quote.formatVersion !== 'previous-boot-quote-1' || !/^[a-f0-9-]{36}$/.test(quote.operationId)
      || resolve(options.root) !== quote.root || options.name !== quote.name || resolve(options.evidenceRoot) !== quote.evidenceRoot
      || !['.controller.lock', '.commit.lock'].includes(quote.name)) throw new Error('Recovery quote does not match its exact target.');
    timestamp(quote.preparedAt);
    for (const [key, suffix] of [['archivePath', 'owner.bin'], ['intentPath', 'intent.json'], ['outcomePath', 'outcome.json']] as const)
      if (quote[key] !== join(quote.evidenceRoot, `${quote.operationId}.${suffix}`)) throw new Error('Recovery quote archive path changed.');
    const root = await canonical(quote.root, true), path = await safePath(root, quote.name), guard = `${path}.recovery`;
    const handle = await fs.open(guard, 'wx').catch(() => { throw new Error('Ownership recovery is busy or unresolved.'); });
    let ownGuard: BoundFile | undefined, deletionAttempted = false, complete = false;
    try {
      const guardBytes = Buffer.from(JSON.stringify({ operationId: quote.operationId, quoteSha256: sha256(JSON.stringify(quote)) }) + '\n');
      await handle.writeFile(guardBytes); await handle.sync();
      const guardFile = await exactFile(guard);
      if (!guardFile.bytes.equals(guardBytes) || !equal(guardFile.identity, identity(await handle.stat({ bigint: true })))) throw new Error('Recovery guard changed before ownership binding; retained for investigation.');
      ownGuard = bound(guardFile);
      const input: PreparePreviousBootRecovery = { root: quote.root, name: quote.name, evidenceRoot: quote.evidenceRoot,
        provenanceSource: { path: quote.provenance.path, sha256: quote.provenance.sha256 },
        maintenanceSource: { repository: quote.maintenanceSource.repository, commitSha: quote.maintenanceSource.commitSha } };
      const before = await previousBootFacts(input);
      if (!equal(stableFacts(factsFromQuote(before)), stableFacts(factsFromQuote(quote)))) throw new Error('Recovery quote is stale: owner, provenance, source or boot changed.');
      const approved = await decision(options.decisionSource, quote);
      const approvalBoot = await collectWindowsBoot([approved.path]);
      if (approvalBoot.machineHash !== quote.boot.machineHash || approvalBoot.bootAt !== quote.boot.bootAt) throw new Error('Approval machine or boot changed.');
      const outcomeExists = await fs.lstat(quote.outcomePath).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
      if (outcomeExists) throw new Error('Recovery outcome path is already occupied.');
      await writeOriginal(quote.archivePath, before.originalBytes);
      const intent = { formatVersion: 'previous-boot-intent-1', quote, decision: approved, archiveSha256: before.owner.sha256, observedAt: new Date().toISOString() };
      await publishAudit(quote.intentPath, intent);
      const after = await previousBootFacts(input), approvedAfter = await decision(options.decisionSource, quote);
      const approvalBootAfter = await collectWindowsBoot([approved.path]);
      const { observedAt: _firstObserved, ...firstApprovalBoot } = approvalBoot;
      const { observedAt: _lastObserved, ...lastApprovalBoot } = approvalBootAfter;
      if (!equal(stableFacts(factsFromQuote(after)), stableFacts(factsFromQuote(quote))) || !equal(approved, approvedAfter)
        || !equal(firstApprovalBoot, lastApprovalBoot)
        || !equal(ownGuard, bound(await exactFile(guard))) || !(await exactFile(quote.archivePath)).bytes.equals(before.originalBytes)
        || !equal(json((await exactFile(quote.intentPath)).bytes), intent)) throw new Error('Recovery authority changed before deletion.');
      await codeSource(quote.generationSource, true);
      await codeSource({ repository: quote.maintenanceSource.repository, commitSha: quote.maintenanceSource.commitSha });
      for (const file of [quote.provenance, ...quote.provenance.references, approved, ...quote.maintenanceSource.files]) {
        const current = bound(await exactFile(file.path));
        if (!equal(current, { path: file.path, sha256: file.sha256, identity: file.identity })) throw new Error('Recovery source changed after final OS observation.');
      }
      const finalOwner = await exactFile(path);
      if (!equal(bound(finalOwner), { path: quote.owner.path, sha256: quote.owner.sha256, identity: quote.owner.identity })
        || !finalOwner.bytes.equals(before.originalBytes)) throw new Error('Owner changed immediately before deletion.');
      // Once unlink is submitted, any failure is unresolved, even if the syscall reports an error.
      deletionAttempted = true; await fs.unlink(path);
      const outcome = { formatVersion: 'previous-boot-outcome-1', operationId: quote.operationId, status: 'recovered' as const, deleted: true,
        quoteSha256: sha256(JSON.stringify(quote)), decisionSha256: approved.sha256, maintenanceSource: quote.maintenanceSource,
        generationSource: quote.generationSource, archivePath: quote.archivePath, archiveSha256: before.owner.sha256,
        beforeBoot: before.boot, afterBoot: after.boot, observedAt: new Date().toISOString() };
      await publishAudit(quote.outcomePath, outcome); complete = true;
      return outcome;
    } catch (error) {
      if (deletionAttempted) throw new Error(`Ownership recovery unresolved after deletion attempt; retain intent and guard: ${String(error)}`);
      throw error;
    } finally {
      await handle.close();
      if (ownGuard && (!deletionAttempted || complete)) {
        if (!equal(ownGuard, bound(await exactFile(guard)))) throw new Error('Recovery guard identity changed; retained for investigation.');
        await fs.unlink(guard);
      }
    }
  }

  static async acquire(root: string, name: string, untrackedWriters = false): Promise<OwnerLock> {
    const path = join(root, name);
    const handle = await open(path, 'wx').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new Error('Lock already has an owner; inspect stale ownership before recovery.');
      throw error;
    });
    const record: OwnerRecord = { formatVersion: 1, token: randomUUID(), pid: process.pid, acquiredAt: new Date().toISOString(), untrackedWriters, children: [] };
    try { await handle.writeFile(JSON.stringify(record) + '\n', 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    return new OwnerLock(path, record);
  }

  static async recover(root: string, name: string): Promise<OwnerRecord> {
    const path = join(root, name), guard = `${path}.recovery`;
    const handle = await open(guard, 'wx').catch(() => { throw new Error('Ownership recovery is busy or unresolved.'); });
    try {
      const original = await readOwner(path);
      requireExited(original.record.pid, 'Owner');
      if (original.record.untrackedWriters) throw new Error('External callback may have untracked writers; automatic recovery refused.');
      for (const child of original.record.children) {
        if (child.pid === null) throw new Error('Unresolved child spawn intent; recovery requires investigation.');
        requireExited(child.pid, 'Owned child');
      }
      const current = await readOwner(path);
      if (!original.bytes.equals(current.bytes)) throw new Error('Ownership changed during recovery.');
      await unlink(path);
      return original.record;
    } finally { await handle.close(); await unlink(guard); }
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Ownership is closed.'));
    const result = this.pending.then(action); this.pending = result.catch(() => {}); return result;
  }
  private async assertOwner(): Promise<void> {
    if ((await readOwner(this.path)).record.token !== this.record.token) throw new Error('Lock ownership changed; refusing mutation.');
  }
  private async save(next: OwnerRecord): Promise<void> {
    await this.assertOwner();
    const temporary = `${this.path}.${randomUUID()}.tmp`, file = await open(temporary, 'wx');
    try {
      await file.writeFile(JSON.stringify(next) + '\n', 'utf8'); await file.sync(); await file.close();
      await this.assertOwner(); await rename(temporary, this.path); this.record = next;
    } finally { await file.close().catch(() => {}); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  prepareOwnedChild(checkLaunch?: () => void): Promise<string> {
    return this.serial(async () => {
      checkLaunch?.();
      const ticket = randomUUID(), next = structuredClone(this.record);
      next.children.push({ ticket, pid: null }); await this.save(next);
      try { checkLaunch?.(); }
      catch (error) {
        const cancelled = structuredClone(this.record); cancelled.children = cancelled.children.filter(child => child.ticket !== ticket);
        try { await this.save(cancelled); }
        catch (cleanup) { throw new UnspawnedChildCleanupError(error, cleanup); }
        throw error;
      }
      return ticket;
    });
  }
  /** Only the current launcher can prove it never invoked spawn for this exact intent. */
  releaseUnspawnedChild(ticket: string): Promise<void> {
    return this.serial(async () => {
      const next = structuredClone(this.record), child = next.children.find(child => child.ticket === ticket);
      if (!child || child.pid !== null) throw new Error('Release requires an exact unresolved child spawn intent.');
      next.children = next.children.filter(child => child.ticket !== ticket); await this.save(next);
    });
  }
  registerOwnedChild(childPid: number, ticket: string): Promise<void> {
    return this.serial(async () => {
      if (!pid(childPid) || childPid === this.record.pid) throw new Error('Invalid owned child PID.');
      const next = structuredClone(this.record), child = next.children.find(child => child.ticket === ticket);
      if (!child || child.pid !== null) throw new Error('Owned child requires an unresolved durable spawn intent.');
      child.pid = childPid; await this.save(next);
    });
  }
  async close(): Promise<void> {
    if (this.released) return;
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = this.pending.then(async () => {
      await this.assertOwner();
      for (const child of this.record.children) {
        if (child.pid === null) throw new Error('Unresolved child spawn intent; retaining ownership.');
        requireExited(child.pid, 'Owned child');
      }
      await unlink(this.path);
      this.released = true;
    }).catch(error => { this.closePromise = undefined; throw error; });
    return this.closePromise;
  }
}
