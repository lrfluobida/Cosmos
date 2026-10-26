import { randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';

/** Publish complete synced bytes without ever replacing an existing receipt. */
export async function publishReceipt(path: string, value: unknown, signal?: AbortSignal): Promise<void> {
  return publishReceiptBytes(path, Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'), signal);
}

/** Copy original receipt bytes into an independent write-once file. */
export async function publishReceiptBytes(path: string, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const temporary = `${path}.${randomUUID()}.tmp`, file = await open(temporary, 'wx');
  try {
    signal?.throwIfAborted();
    await file.writeFile(bytes);
    await file.sync(); await file.close();
    // Same-directory hard-link publication is atomic and fails if the final name exists.
    // The private temporary name is then removed, leaving one independent final file.
    signal?.throwIfAborted();
    await link(temporary, path);
  } finally { await file.close().catch(() => {}); await unlink(temporary); }
}
