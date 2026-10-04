import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { regularFile, safePath } from '../../../artifacts/paths.ts';
import type { ArtifactReference } from '../../../contracts/types.ts';
import { publishReceipt } from '../../recovery/receipt-file.ts';

export interface TransferOriginBinding {
  caseId: string; windowId: string; sourceVersion: string; requirementSha256: string; runId: string; specVersion: string;
}
export interface TransferOriginInput {
  root: string; binding: TransferOriginBinding; resume: boolean; signal: AbortSignal; requireScope(): Promise<void>;
}
/** Reserve an owned 404 listener. Only a trusted consumer can mount its registry candidate dist. */
export async function reserveTransferOrigin(input: TransferOriginInput) {
  const file = 'host-transfer-origin.json', binding = structuredClone(input.binding);
  const read = async () => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.root, file)));
  input.signal.throwIfAborted(); await input.requireScope(); input.signal.throwIfAborted();
  if (!/^[a-f0-9]{40}$/.test(binding.sourceVersion) || !/^[a-f0-9]{64}$/.test(binding.requirementSha256)
    || Object.values(binding).some(value => typeof value !== 'string' || !value)) throw new Error('Invalid fixed transfer origin binding.');
  let previous: any, port = 0;
  if (input.resume) {
    previous = await read();
    if (previous.formatVersion !== 'transfer-origin/1' || !isDeepStrictEqual(previous.binding, binding)
      || Object.keys(previous).sort().join() !== ['binding', 'formatVersion', 'url'].sort().join()) throw new Error('Transfer origin receipt binding changed.');
    const url = new URL(previous.url); port = Number(url.port);
    if (previous.url !== `http://127.0.0.1:${port}` || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid original transfer origin port.');
  } else {
    try { await read(); throw new Error('Original transfer origin receipt already exists; explicit resume is required.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  let mounted: { project: string; verifyScope(): Promise<void> } | undefined;
  const server = createServer(async (request, response) => {
    const current = mounted;
    if (!current) { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end('Preparation only'); return; }
    try {
      await current.verifyScope();
      if (mounted !== current) throw new Error('Candidate mount changed during request.');
      const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1) || 'index.html';
      const bytes = await regularFile(join(current.project, 'dist'), name);
      if (mounted !== current) throw new Error('Candidate mount changed during read.');
      const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.wav') ? 'audio/wav'
          : name.endsWith('.png') ? 'image/png' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(bytes);
    } catch { if (!response.destroyed) { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end('Not found'); } }
  });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= new Promise<void>((done, reject) => {
    mounted = undefined; input.signal.removeEventListener('abort', aborted); server.closeAllConnections();
    server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : done());
  });
  const aborted = () => { void close().catch(() => {}); };
  try {
    await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); done(); }); });
    input.signal.addEventListener('abort', aborted, { once: true });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned transfer origin has no loopback port.');
    const receipt = { formatVersion: 'transfer-origin/1', binding, url: `http://127.0.0.1:${address.port}` };
    input.signal.throwIfAborted(); await input.requireScope(); input.signal.throwIfAborted();
    if (input.resume) { if (!isDeepStrictEqual(await read(), receipt)) throw new Error('Original transfer origin changed during resume.'); }
    else await publishReceipt(join(input.root, file), receipt, input.signal);
    const verify = async () => {
      try {
        input.signal.throwIfAborted(); await input.requireScope(); input.signal.throwIfAborted();
        if (!server.listening || !isDeepStrictEqual(await read(), receipt)) throw new Error('Owned transfer origin listener or fixed receipt changed.');
      } catch (error) { await close(); throw error; }
    };
    const mountCandidate = async (value: { candidate: ArtifactReference; project: string; verifyBinding(): Promise<void> }) => {
      await verify();
      if (mounted || typeof value.verifyBinding !== 'function') throw new Error('Candidate mount is already active or has no current binding guard.');
      const ref = value.candidate;
      if (!ref || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(ref.artifactId) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(ref.version)
        || ref.location !== `registry/candidates/${ref.artifactId}/${ref.version}/project`) throw new Error('Candidate mount requires an exact registry project.');
      const project = await safePath(input.root, ref.location);
      if (project !== resolve(value.project)) throw new Error('Mounted project differs from the registry candidate.');
      await regularFile(join(project, 'dist'), 'index.html'); await value.verifyBinding(); await verify();
      const current = { project, verifyScope: verify }; mounted = current;
      return async () => { if (mounted === current) mounted = undefined; };
    };
    return { url: receipt.url, verify, mountCandidate, close };
  } catch (error) { await close(); throw error; }
}
