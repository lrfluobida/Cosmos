import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { ArtifactRegistry, CaptureRequest } from '../artifacts/index.ts';
import { directory, regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { publishReceiptBytes } from './recovery/receipt-file.ts';

export async function publishMatchingBytes(root: string, name: string, bytes: Buffer) {
  const prior = await regularFile(root, name).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (prior && !prior.equals(bytes)) throw new Error('Fixed historical import record changed: ' + name);
  if (!prior) await publishReceiptBytes(join(root, name), bytes);
}

/** A recovering historical plan may finish publishing its host inputs before dispatch. */
export async function captureFixedHostFile(root: string, registry: ArtifactRegistry, request: CaptureRequest, bytes: Buffer, recovering?: boolean) {
  if (request.files.length !== 1) throw new Error('A fixed host file requires one capture file.');
  const folder = await directory(root, request.sourceRoot), { source, destination } = request.files[0];
  if (recovering) {
    await publishMatchingBytes(folder, source, bytes);
    const prior = await registry.getCapture(request.artifactRef).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (prior) {
      const { capturedAt, ...fixed } = prior;
      if (!capturedAt || !sameValue(fixed, request) || !(await regularFile(root, request.artifactRef.location + '/' + destination)).equals(bytes)) throw new Error('Fixed host input capture changed.');
      return;
    }
  } else await writeFile(join(folder, source), bytes, { flag: 'wx' });
  await registry.registerCapture(request);
}
