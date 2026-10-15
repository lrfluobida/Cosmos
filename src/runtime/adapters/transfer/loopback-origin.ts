import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { regularFile, safePath } from '../../../artifacts/paths.ts';
import type { ArtifactReference } from '../../../contracts/types.ts';
import { publishReceipt } from '../../recovery/receipt-file.ts';
import type { CleanDelivery } from '../../entrypoint-delivery.ts';
import { isValidationScopeTimeout } from '../../validation-scope.ts';
import { associateNativeReadSignal, isNativeValidationWaits, nativeCallerDisposition, NativeWaitDeadlineError, runNativeValidationRead, type NativeValidationWaits, type NativeWaitStage } from '../../../acceptance/native-validation-waits.ts';

interface ValidationTransferOriginBinding {
  caseId: string; windowId: string; sourceVersion: string; requirementSha256: string; runId: string; specVersion: string;
}
export type TransferOriginBinding = ValidationTransferOriginBinding | {
  profile: 'human'; runId: string; ledgerId: string; windowId: null | string; sourceVersion: string; sourceSha256: string; requirementSha256: string; specVersion: string;
  decisionId?: string; taskId?: string;
};
export interface TransferOriginInput {
  root: string; binding: TransferOriginBinding; resume: boolean; signal: AbortSignal; requireScope(callerSignal?: AbortSignal): Promise<void>;
  retainCleanupFailure?(error: unknown): void;
  /** Selected only by the trusted first-window factory. */
  receiptPath?: string;
}
/** Reserve an owned 404 listener. Only a trusted consumer can mount its registry candidate dist. */
export async function reserveTransferOrigin(input: TransferOriginInput) {
  const file = input.receiptPath ?? 'host-transfer-origin.json', binding = structuredClone(input.binding);
  if ('profile' in binding && (typeof binding.windowId === 'string') !== !!input.receiptPath) throw new Error('Human transfer origin window requires its explicit current receipt path.');
  if (input.receiptPath && (!('profile' in binding) || typeof binding.windowId !== 'string' || !binding.decisionId || !binding.taskId
    || file !== `continuations/${binding.decisionId}/transfer-origin.json`)) throw new Error('Current transfer origin must retain its exact human window path.');
  const checkSignals = (callerSignal?: AbortSignal) => { input.signal.throwIfAborted(); callerSignal?.throwIfAborted(); };
  const read = async (callerSignal?: AbortSignal) => {
    checkSignals(callerSignal);
    const active = callerSignal && associateNativeReadSignal(callerSignal, AbortSignal.any([input.signal, callerSignal]));
    try {
      const bytes = active ? await regularFile(input.root, file, active) : await regularFile(input.root, file);
      checkSignals(callerSignal); return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) { checkSignals(callerSignal); throw error; }
  };
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
  type Mount = { project: string; cleanDelivery?: CleanDelivery; nativeValidationWaits?: NativeValidationWaits; retainCleanupFailure?(error: unknown): void; verifyScope(callerSignal?: AbortSignal): Promise<void> };
  type FailureContext = Pick<Mount, 'nativeValidationWaits' | 'retainCleanupFailure'>;
  let mounted: Mount | undefined;
  const notFound = (response: import('node:http').ServerResponse) => {
    if (!response.destroyed && !response.headersSent) { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end('Not found'); }
  };
  const server = createServer(async (request, response) => {
    const current = mounted;
    if (!current) { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end('Preparation only'); return; }
    try {
      if (current.nativeValidationWaits) {
        await current.nativeValidationWaits.runRequest(async lease => {
          let caller: AbortSignal | undefined, deadlineAt = 0, stage: NativeWaitStage = 'http_pre_authority', boundaryError: NativeWaitDeadlineError | undefined;
          const check = () => {
            checkSignals(caller); lease.check();
            if (Date.now() >= deadlineAt) throw boundaryError ??= new NativeWaitDeadlineError(stage);
            if (mounted !== current) throw new Error('Candidate mount changed during native request.');
          };
          try {
            await lease.runStage('http_pre_authority', async life => {
              caller = life.signal; deadlineAt = life.deadlineAt;
              return runNativeValidationRead(life.signal, async () => {
                try { check(); await current.verifyScope(caller); check(); }
                catch (error) { if (error !== boundaryError) await fail(error, caller, current); checkSignals(caller); throw error; }
              });
            });
            const path = new URL(request.url ?? '/', 'http://127.0.0.1'), name = decodeURIComponent(path.pathname).slice(1) || 'index.html';
            const target = new URL(current.cleanDelivery!.url); target.pathname = path.pathname; target.search = path.search;
            const { upstream, bytes } = await lease.runStage('http_body', async life => {
              caller = life.signal; deadlineAt = life.deadlineAt; stage = 'http_body';
              return runNativeValidationRead(life.signal, async active => {
                try {
                  check();
                  const signal = associateNativeReadSignal(life.signal, AbortSignal.any([input.signal, active]));
                  const upstream = await fetch(target, { signal, redirect: 'error' }); check();
                  const bytes = Buffer.from(await upstream.arrayBuffer()); check(); return { upstream, bytes };
                } catch (error) { if (error !== boundaryError) await fail(error, caller, current); checkSignals(caller); throw error; }
              });
            });
            await lease.runStage('http_post_authority', async life => {
              caller = life.signal; deadlineAt = life.deadlineAt; stage = 'http_post_authority';
              return runNativeValidationRead(life.signal, async () => {
                try {
                  check(); await current.verifyScope(caller); check();
                  const result = await current.cleanDelivery!.verifyPayload!(name, { status: upstream.status, bytes }, caller); check();
                  if (result === 'not_found') { notFound(response); return; }
                  response.writeHead(200, { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes);
                } catch (error) { if (error !== boundaryError) await fail(error, caller, current); checkSignals(caller); throw error; }
              });
            });
          } catch (error) { await fail(error, caller, current); notFound(response); checkSignals(caller); throw error; }
        });
        return;
      }
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
    } catch { notFound(response); }
  });
  let closing: Promise<void> | undefined, cleanupRetained = false;
  let sharedFailure: { error: unknown; callerSignal: AbortSignal | undefined; mount: Mount | undefined; context: FailureContext | undefined } | undefined;
  const close = () => closing ??= new Promise<void>((done, reject) => {
    mounted = undefined; input.signal.removeEventListener('abort', aborted); server.closeAllConnections();
    server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : done());
  });
  const aborted = () => { void close().catch(() => {}); };
  const finishClose = async (context: FailureContext | undefined) => {
    try { await close(); } catch (cleanup) {
      if (!context?.retainCleanupFailure) throw cleanup;
      if (!cleanupRetained) { context.retainCleanupFailure(cleanup); cleanupRetained = true; }
    }
  };
  const fail = async (error: unknown, callerSignal: AbortSignal | undefined, current: Mount | undefined, context: FailureContext | undefined = current): Promise<'retained' | 'closed'> => {
    if (closing && sharedFailure && sharedFailure.error === error && sharedFailure.callerSignal === callerSignal) { await finishClose(sharedFailure.context); return 'closed'; }
    if (!input.signal.aborted) {
      const disposition = nativeCallerDisposition(callerSignal, context?.nativeValidationWaits, error);
      if (mounted !== current || disposition === 'stale' || disposition === 'local_abort' || isValidationScopeTimeout(error)) return 'retained';
    }
    sharedFailure ??= { error, callerSignal, mount: current, context }; await finishClose(context); return 'closed';
  };
  const failCurrent = (error: unknown, callerSignal?: AbortSignal) => fail(error, callerSignal, mounted);
  try {
    await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); done(); }); });
    input.signal.addEventListener('abort', aborted, { once: true });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned transfer origin has no loopback port.');
    const receipt = { formatVersion: 'transfer-origin/1', binding, url: `http://127.0.0.1:${address.port}` };
    input.signal.throwIfAborted(); await input.requireScope(); input.signal.throwIfAborted();
    if (input.resume) { if (!isDeepStrictEqual(await read(), receipt)) throw new Error('Original transfer origin changed during resume.'); }
    else await publishReceipt(join(input.root, file), receipt, input.signal);
    const verifyCurrent = async (callerSignal?: AbortSignal, context: FailureContext | undefined = mounted) => {
      const current = mounted;
      try {
        checkSignals(callerSignal);
        if (callerSignal) await input.requireScope(callerSignal); else await input.requireScope();
        checkSignals(callerSignal);
        if (closing || !server.listening || !isDeepStrictEqual(await read(callerSignal), receipt)) throw new Error('Owned transfer origin listener or fixed receipt changed.');
        checkSignals(callerSignal);
        if (mounted !== current) throw new Error('Candidate mount changed during verification.');
      } catch (error) { await fail(error, callerSignal, current, context); checkSignals(callerSignal); throw error; }
    };
    const verify = (callerSignal?: AbortSignal) => verifyCurrent(callerSignal);
    const mountCandidate = async (value: { candidate: ArtifactReference; project: string; cleanDelivery?: CleanDelivery; nativeValidationWaits?: NativeValidationWaits; retainCleanupFailure?(error: unknown): void; verifyBinding(callerSignal?: AbortSignal): Promise<void> }) => {
      if (value.nativeValidationWaits !== undefined && (!isNativeValidationWaits(value.nativeValidationWaits) || !value.cleanDelivery?.verifyPayload)) throw new Error('Native mount requires trusted native waits and clean payload verification.');
      if (value.nativeValidationWaits && typeof value.retainCleanupFailure !== 'function') throw new Error('Native mount requires its trusted cleanup failure owner.');
      const caller = value.nativeValidationWaits?.readSignal;
      await verifyCurrent(caller, value);
      if (mounted || typeof value.verifyBinding !== 'function') throw new Error('Candidate mount is already active or has no current binding guard.');
      const ref = value.candidate;
      if (!ref || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(ref.artifactId) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(ref.version)
        || ref.location !== `registry/candidates/${ref.artifactId}/${ref.version}/project`) throw new Error('Candidate mount requires an exact registry project.');
      const project = await safePath(input.root, ref.location, caller);
      if (project !== resolve(value.project)) throw new Error('Mounted project differs from the registry candidate.');
      await regularFile(join(project, 'dist'), 'index.html', caller);
      if (caller) await value.verifyBinding(caller); else await value.verifyBinding();
      await verifyCurrent(caller, value);
      if (value.cleanDelivery) {
        const url = new URL(value.cleanDelivery.url);
        if (url.origin !== value.cleanDelivery.url || url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || !url.port || !value.cleanDelivery.requireCurrent) throw new Error('Clean mount requires its trusted loopback service.');
        if (caller) await value.cleanDelivery.requireCurrent(caller); else await value.cleanDelivery.requireCurrent();
      }
      checkSignals(caller);
      const current: Mount = { project, cleanDelivery: value.cleanDelivery, nativeValidationWaits: value.nativeValidationWaits, retainCleanupFailure: value.retainCleanupFailure,
        verifyScope: async callerSignal => {
          if (!callerSignal) { await verify(); await value.verifyBinding(); await value.cleanDelivery?.requireCurrent(); return; }
          try {
            checkSignals(callerSignal); await verify(callerSignal); checkSignals(callerSignal);
            await value.verifyBinding(callerSignal); checkSignals(callerSignal);
            await value.cleanDelivery?.requireCurrent(callerSignal); checkSignals(callerSignal);
          } catch (error) { if (current.nativeValidationWaits) await fail(error, callerSignal, current); checkSignals(callerSignal); throw error; }
        } }; mounted = current;
      return async () => { if (mounted === current) mounted = undefined; };
    };
    return { url: receipt.url, verify, mountCandidate, failCurrent, close };
  } catch (error) { await close(); throw error; }
}
