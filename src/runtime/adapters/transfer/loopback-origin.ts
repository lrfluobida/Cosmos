import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { regularFile, safePath } from '../../../artifacts/paths.ts';
import type { ArtifactReference } from '../../../contracts/types.ts';
import { publishReceipt } from '../../recovery/receipt-file.ts';
import type { CleanDelivery } from '../../entrypoint-delivery.ts';

interface ValidationTransferOriginBinding {
  caseId: string; windowId: string; sourceVersion: string; requirementSha256: string; runId: string; specVersion: string;
}
export type TransferOriginBinding = ValidationTransferOriginBinding | {
  profile: 'human'; runId: string; ledgerId: string; windowId: null | string; sourceVersion: string; sourceSha256: string; requirementSha256: string; specVersion: string;
  decisionId?: string; taskId?: string;
};
export interface TransferOriginInput {
  root: string; binding: TransferOriginBinding; resume: boolean; signal: AbortSignal; requireScope(): Promise<void>;
  /** Selected only by the trusted first-window factory. */
  receiptPath?: string;
}
/** Reserve an owned 404 listener. Only a trusted consumer can mount its registry candidate dist. */
export async function reserveTransferOrigin(input: TransferOriginInput) {
  const file = input.receiptPath ?? 'host-transfer-origin.json', binding = structuredClone(input.binding);
  if ('profile' in binding && (typeof binding.windowId === 'string') !== !!input.receiptPath) throw new Error('Human transfer origin window requires its explicit current receipt path.');
  if (input.receiptPath && (!('profile' in binding) || typeof binding.windowId !== 'string' || !binding.decisionId || !binding.taskId
    || file !== `continuations/${binding.decisionId}/transfer-origin.json`)) throw new Error('Current transfer origin must retain its exact human window path.');
  const read = async () => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.root, file)));
  input.signal.throwIfAborted(); await input.requireScope(); input.signal.throwIfAborted();
  if (!/^[a-f0-9]{40}$/.test(binding.sourceVersion) || !/^[a-f0-9]{64}$/.test(binding.requirementSha256)
    || Object.entries(binding).some(([key, value]) => ('profile' in binding && key === 'windowId' && binding.windowId === null) ? value !== null : typeof value !== 'string' || !value)
    || 'profile' in binding && (binding.profile !== 'human' || !/^[a-f0-9]{64}$/.test(binding.sourceSha256))) throw new Error('Invalid fixed transfer origin binding.');
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
  let mounted: { project: string; cleanDelivery?: CleanDelivery; verifyScope(): Promise<void> } | undefined;
  const server = createServer(async (request, response) => {
    const current = mounted;
    if (!current) { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end('Preparation only'); return; }
    try {
      await current.verifyScope();
      if (mounted !== current) throw new Error('Candidate mount changed during request.');
      const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1) || 'index.html';
      if (current.cleanDelivery) {
        const path = new URL(request.url ?? '/', 'http://127.0.0.1'), target = new URL(current.cleanDelivery.url);
        target.pathname = path.pathname; target.search = path.search;
        const upstream = await fetch(target, { signal: input.signal, redirect: 'error' }), bytes = Buffer.from(await upstream.arrayBuffer());
        await current.verifyScope(); if (mounted !== current) throw new Error('Candidate mount changed during clean request.');
        response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes); return;
      }
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
    const mountCandidate = async (value: { candidate: ArtifactReference; project: string; cleanDelivery?: CleanDelivery; verifyBinding(): Promise<void> }) => {
      await verify();
      if (mounted || typeof value.verifyBinding !== 'function') throw new Error('Candidate mount is already active or has no current binding guard.');
      const ref = value.candidate;
      if (!ref || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(ref.artifactId) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(ref.version)
        || ref.location !== `registry/candidates/${ref.artifactId}/${ref.version}/project`) throw new Error('Candidate mount requires an exact registry project.');
      const project = await safePath(input.root, ref.location);
      if (project !== resolve(value.project)) throw new Error('Mounted project differs from the registry candidate.');
      await regularFile(join(project, 'dist'), 'index.html'); await value.verifyBinding(); await verify();
      if (value.cleanDelivery) {
        const url = new URL(value.cleanDelivery.url);
        if (url.origin !== value.cleanDelivery.url || url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || !url.port || !value.cleanDelivery.requireCurrent) throw new Error('Clean mount requires its trusted loopback service.');
        await value.cleanDelivery.requireCurrent();
      }
      const current = { project, cleanDelivery: value.cleanDelivery, verifyScope: async () => { await verify(); await value.verifyBinding(); await value.cleanDelivery?.requireCurrent(); } }; mounted = current;
      return async () => { if (mounted === current) mounted = undefined; };
    };
    return { url: receipt.url, verify, mountCandidate, close };
  } catch (error) { await close(); throw error; }
}
