import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { regularFile } from '../../src/artifacts/paths.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';

export interface TransferOriginBinding {
  caseId: string; windowId: string; sourceVersion: string; requirementSha256: string; runId: string; specVersion: string;
}
export interface TransferOriginInput {
  root: string; binding: TransferOriginBinding; resume: boolean; signal: AbortSignal; requireScope(): Promise<void>;
}
/** Reserve only an owned 404 listener. No game, browser, child, model or new execution window. */
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
  const server = createServer((_request, response) => { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end('Preparation only'); });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= new Promise<void>((done, reject) => {
    input.signal.removeEventListener('abort', aborted); server.closeAllConnections();
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
    return { url: receipt.url, verify, close };
  } catch (error) { await close(); throw error; }
}
