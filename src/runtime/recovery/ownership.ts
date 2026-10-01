import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

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

/** Exclusive local ownership. Registered children require a durable intent before spawn. */
export class OwnerLock {
  private path: string;
  private record: OwnerRecord;
  private constructor(path: string, record: OwnerRecord) { this.path = path; this.record = record; }
  private closed = false;
  private pending: Promise<unknown> = Promise.resolve();

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
  prepareOwnedChild(): Promise<string> {
    return this.serial(async () => {
      const ticket = randomUUID(), next = structuredClone(this.record);
      next.children.push({ ticket, pid: null }); await this.save(next); return ticket;
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
    if (this.closed) return;
    this.closed = true; await this.pending; await this.assertOwner();
    for (const child of this.record.children) {
      if (child.pid === null) throw new Error('Unresolved child spawn intent; retaining ownership.');
      requireExited(child.pid, 'Owned child');
    }
    await unlink(this.path);
  }
}
