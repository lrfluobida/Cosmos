import { randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';

/** Publish complete synced bytes without ever replacing an existing receipt. */
export async function publishReceipt(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`, file = await open(temporary, 'wx');
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await file.sync(); await file.close();
    // Same-directory hard-link publication is atomic and fails if the final name exists.
    // The private temporary name is then removed, leaving one independent final file.
    await link(temporary, path);
  } finally { await file.close().catch(() => {}); await unlink(temporary); }
}
