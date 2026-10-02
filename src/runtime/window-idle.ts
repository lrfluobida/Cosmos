import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { directory, id, regularFile, safePath } from '../artifacts/paths.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import type { RunSnapshot } from './run-types.ts';

interface IdleAnchor { windowId: string; nonceSha256: string; sequence: number }
interface IdleReceipt {
  formatVersion: 'window-idle-1'; runId: string; ledgerId: string; windowId: string;
  revision: number; anchorSequence: number; nonce: string; snapshotSha256: string;
}
export const idleHash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const receiptName = (state: RunSnapshot, windowId: string) => `idle-receipts/${id(windowId)}/revision-${state.revision}.json`;

/** Lifecycle history only; an anchor does not grant execution or prove final artifacts. */
export function idleAnchor(state: RunSnapshot): IdleAnchor | null {
  let anchor: IdleAnchor | null = null;
  for (const event of state.events) {
    if (event.type !== 'window_owner_drained' && event.type !== 'window_owner_resumed') continue;
    let value: { windowId?: string; nonceSha256?: string; anchorSequence?: number };
    try { value = JSON.parse(event.reason); } catch { throw new Error('Invalid window idle anchor history.'); }
    if (!value || event.requestId !== null || !state.continuation?.windows.some(window => window.windowId === value.windowId)) throw new Error('Invalid window idle anchor identity.');
    if (event.type === 'window_owner_drained') {
      if (!hash(value.nonceSha256)) throw new Error('Invalid window idle anchor hash.');
      anchor = { windowId: value.windowId!, nonceSha256: value.nonceSha256, sequence: event.sequence };
    } else {
      if (!anchor || anchor.windowId !== value.windowId || anchor.sequence !== value.anchorSequence) throw new Error('Invalid resumed window idle anchor.');
      anchor = null;
    }
  }
  return anchor;
}

export async function requireNoRegistryWriter(root: string): Promise<void> {
  const path = await safePath(root, 'registry/.commit.lock');
  const present = await lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (present) throw new Error('Registry writer ownership is unresolved; idle proof refused.');
}

/** Called only after owner close; no raw nonce is persisted before that boundary. */
export async function publishWindowIdle(root: string, state: RunSnapshot, nonce: string, snapshotBytes: Buffer): Promise<void> {
  const anchor = idleAnchor(state);
  if (!anchor || anchor.windowId !== state.continuation?.currentWindowId || idleHash(nonce) !== anchor.nonceSha256) throw new Error('Window idle anchor does not match its secret.');
  await requireNoRegistryWriter(root);
  const owned = await lstat(join(root, '.controller.lock')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (owned || !snapshotBytes.equals(await regularFile(root, 'snapshot.json'))) throw new Error('Window ownership or snapshot changed before idle publication.');
  const receipt: IdleReceipt = { formatVersion: 'window-idle-1', runId: state.run.runId, ledgerId: state.ledger.ledgerId, windowId: anchor.windowId,
    revision: state.revision, anchorSequence: anchor.sequence, nonce, snapshotSha256: idleHash(snapshotBytes) };
  await directory(root, `idle-receipts/${id(anchor.windowId)}`);
  await publishReceipt(await safePath(root, receiptName(state, anchor.windowId)), receipt);
}

/** The caller holds the controller owner. Validate before constructing an expiring controller. */
export async function requireWindowIdle(root: string, state: RunSnapshot, windowId: string): Promise<void> {
  const anchor = idleAnchor(state);
  if (state.formatVersion !== 2 || windowId !== state.continuation?.currentWindowId || anchor?.windowId !== windowId) throw new Error('No current window idle proof is available.');
  await requireNoRegistryWriter(root);
  let receipt: IdleReceipt;
  try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, receiptName(state, windowId)))); }
  catch { throw new Error('Window idle receipt is missing or invalid.'); }
  if (!receipt || receipt.formatVersion !== 'window-idle-1' || receipt.runId !== state.run.runId || receipt.ledgerId !== state.ledger.ledgerId
    || receipt.windowId !== windowId || receipt.revision !== state.revision || receipt.anchorSequence !== anchor.sequence
    || !hash(receipt.nonce) || idleHash(receipt.nonce) !== anchor.nonceSha256 || receipt.snapshotSha256 !== idleHash(await regularFile(root, 'snapshot.json'))) throw new Error('Window idle receipt does not match the anchored snapshot.');
}
