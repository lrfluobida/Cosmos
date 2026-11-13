import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { OwnerLock } from './recovery/ownership.ts';
import type { OwnerRecord } from './recovery/ownership.ts';
import { SnapshotPersistenceError } from './snapshot-error.ts';

const renameRetryDelays = [25, 50, 100, 200, 400];

/** One exclusive controller per explicit run root. Stale ownership fails closed. */
export class SnapshotStore {
  readonly root: string;
  private lock: OwnerLock;
  private closed = false;
  private failure?: SnapshotPersistenceError;

  private constructor(root: string, lock: OwnerLock) { this.root = root; this.lock = lock; }

  static async acquire(root: string): Promise<SnapshotStore> {
    if (!isAbsolute(root)) throw new Error('Run root must be an explicit absolute path.');
    await mkdir(root, { recursive: true });
    if ((await lstat(root)).isSymbolicLink()) throw new Error('Run root cannot be a symbolic link.');
    const canonical = await realpath(root);
    return new SnapshotStore(canonical, await OwnerLock.acquire(canonical, '.controller.lock'));
  }

  static async recover(root: string, persistVerifiedOwner?: (owner: OwnerRecord) => Promise<void>) {
    if (!isAbsolute(root) || (await lstat(root)).isSymbolicLink()) throw new Error('Recovery requires an explicit regular run root.');
    return OwnerLock.recover(await realpath(root), '.controller.lock', persistVerifiedOwner);
  }

  prepareOwnedChild(checkLaunch?: () => void): Promise<string> { this.assertWritable(); return this.lock.prepareOwnedChild(checkLaunch); }
  releaseUnspawnedChild(ticket: string): Promise<void> { this.assertWritable(); return this.lock.releaseUnspawnedChild(ticket); }
  registerOwnedChild(pid: number, ticket: string): Promise<void> { this.assertWritable(); return this.lock.registerOwnedChild(pid, ticket); }
  ownerIdentity(): Readonly<Pick<OwnerRecord, 'token' | 'pid' | 'acquiredAt'>> { return this.lock.originalIdentity(); }

  private async checkTarget(): Promise<boolean> {
    try {
      const stat = await lstat(join(this.root, 'snapshot.json'));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Snapshot must be a regular file inside the run root.');
      return true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }

  async read(): Promise<unknown> {
    this.assertWritable();
    if (!await this.checkTarget()) throw new Error('Run snapshot does not exist.');
    const bytes = await readFile(join(this.root, 'snapshot.json'));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }

  async exists(): Promise<boolean> { return this.checkTarget(); }

  /** fsync the full UTF-8 payload before atomic replacement; ignore orphan .tmp files. */
  async write(snapshot: unknown): Promise<void> {
    this.assertWritable();
    const temporary = join(this.root, `.snapshot-${randomUUID()}.tmp`);
    let file: FileHandle | undefined;
    let operation = 'check snapshot target';
    try {
      await this.checkTarget();
      operation = 'open';
      file = await open(temporary, 'wx');
      operation = 'write';
      await file.writeFile(JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
      operation = 'fsync';
      await file.sync();
      operation = 'close';
      await file.close();
      for (let attempt = 0; ; attempt++) {
        operation = 'rename';
        try { await rename(temporary, join(this.root, 'snapshot.json')); return; }
        catch (error) {
          const wait = renameRetryDelays[attempt];
          if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM' || wait === undefined) throw error;
          await delay(wait);
        }
        this.assertWritable();
        operation = 'verify owner';
        await this.lock.assertOwner();
        operation = 'check snapshot target';
        await this.checkTarget();
      }
    } catch (error) {
      this.failure ??= new SnapshotPersistenceError(operation, error);
      await file?.close().catch(() => {});
      if (file) await unlink(temporary).catch(() => {});
      throw this.failure;
    }
  }

  private assertWritable(): void {
    if (this.failure) throw this.failure;
    if (this.closed) throw new Error('Snapshot controller is closed.');
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.lock.close();
  }
}
