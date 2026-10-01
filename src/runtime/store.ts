import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { OwnerLock } from './recovery/ownership.ts';

/** One exclusive controller per explicit run root. Stale ownership fails closed. */
export class SnapshotStore {
  readonly root: string;
  private lock: OwnerLock;
  private closed = false;
  private failed = false;

  private constructor(root: string, lock: OwnerLock) { this.root = root; this.lock = lock; }

  static async acquire(root: string): Promise<SnapshotStore> {
    if (!isAbsolute(root)) throw new Error('Run root must be an explicit absolute path.');
    await mkdir(root, { recursive: true });
    if ((await lstat(root)).isSymbolicLink()) throw new Error('Run root cannot be a symbolic link.');
    const canonical = await realpath(root);
    return new SnapshotStore(canonical, await OwnerLock.acquire(canonical, '.controller.lock'));
  }

  static async recover(root: string) {
    if (!isAbsolute(root) || (await lstat(root)).isSymbolicLink()) throw new Error('Recovery requires an explicit regular run root.');
    return OwnerLock.recover(await realpath(root), '.controller.lock');
  }

  prepareOwnedChild(): Promise<string> { this.assertWritable(); return this.lock.prepareOwnedChild(); }
  registerOwnedChild(pid: number, ticket: string): Promise<void> { this.assertWritable(); return this.lock.registerOwnedChild(pid, ticket); }

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
    try {
      await this.checkTarget();
      file = await open(temporary, 'wx');
      await file.writeFile(JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
      await file.sync();
      await file.close();
      file = undefined;
      await rename(temporary, join(this.root, 'snapshot.json'));
    } catch (error) {
      this.failed = true;
      await file?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw new Error('Snapshot persistence failed; controller is closed to further work.', { cause: error });
    }
  }

  private assertWritable(): void {
    if (this.closed || this.failed) throw new Error('Snapshot controller is closed or persistence failed.');
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.lock.close();
  }
}
