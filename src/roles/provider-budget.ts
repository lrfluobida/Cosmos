import { lstat, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PiBudget, PiResponse } from '../providers/pi.ts';
import type { RunController } from '../runtime/run.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';

export const ROLE_PRICING_VERSION = 'deepseek-flash-peak-cny-2026-10-01';
/** Pinned CNY peak rates per million tokens: uncached 2, cached 0.04, output 8. */
export function usageCostMicroCny(usage: NonNullable<PiResponse['usage']>): number {
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
    if (!Number.isSafeInteger(usage[key]) || usage[key] < 0) throw new Error('Invalid provider usage; reconciliation required.');
  }
  const amount = Math.ceil((usage.input + usage.cacheWrite) * 2 + usage.output * 8 + usage.cacheRead * 0.04);
  if (!Number.isSafeInteger(amount)) throw new Error('Unsafe provider cost.');
  return amount;
}

/** Uses the existing run only. Every SDK request, including compaction, gets durable admission. */
export function createRoleBudget(input: { controller: RunController; taskId: string; evidenceDirectory: string }): PiBudget {
  const { controller, taskId, evidenceDirectory } = input;
  const requests = new Set<string>();
  return {
    async beforeRequest(request) {
      return controller.coordinateAccounting(async () => {
      await controller.reserve({ requestId: request.requestId, taskId, provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION, estimatedMaxCostMicroCny: request.estimatedMaxCostMicroCny });
      requests.add(request.requestId);
      await controller.admit(request.requestId);
      });
    },
    async afterResponse(response) {
      return controller.coordinateAccounting(async () => {
      if (!requests.has(response.requestId) || !/^[\w-]+$/.test(response.requestId)) throw new Error('Response has no role admission.');
      const before = await controller.read();
      const entry = before.ledger.entries.find(e => e.requestId === response.requestId)!;
      if (entry.status === 'cancelled' && response.outcome === 'not_sent') return;
      // If receipt persistence fails, the admitted request already blocks new paid work.
      if (entry.status !== 'unknown') await controller.markUnknown(response.requestId, [{ artifactId: `admission-${response.requestId}`, version: `revision-${before.revision}`, location: `snapshot.json#requests/${before.requests.findIndex(r => r.requestId === response.requestId)}` }]);
      await mkdir(evidenceDirectory, { recursive: true });
      const location = join(evidenceDirectory, `billing-${response.requestId}.json`);
      // Only usage and provider metadata; no prompt, tool arguments or credentials.
      await publishReceipt(location, { ...response, formatVersion: 1, runId: before.run.runId, ledgerId: before.ledger.ledgerId, taskId,
        provider: entry.provider, pricingVersion: entry.pricingVersion, admittedAt: before.requests.find(r => r.requestId === response.requestId)!.admittedAt });
      const evidence = [{ artifactId: `billing-${response.requestId}`, version: 'v1', location }];
      if (response.outcome === 'not_sent') await controller.cancel(response.requestId, evidence, { provenNoCost: true });
      else if (response.outcome === 'settled' && response.responseModel === 'deepseek-flash' && response.usage) {
        let amount: number;
        try { amount = usageCostMicroCny(response.usage); }
        catch (error) { await controller.markUnknown(response.requestId, evidence); throw error; }
        await controller.settle(response.requestId, amount, evidence);
      } else await controller.markUnknown(response.requestId, evidence);
      });
    },
  };
}

export interface ReceiptRecovery { status: 'settled' | 'cancelled' | 'already_closed' | 'pending'; reason?: string }
/** Reconcile a host-owned receipt for an existing admission; never sends a request. */
export async function reconcileRoleReceipt(input: { controller: RunController; requestId: string; evidenceDirectory: string }): Promise<ReceiptRecovery> {
  const { controller, requestId, evidenceDirectory } = input;
  const pending = (reason: string): ReceiptRecovery => ({ status: 'pending', reason });
  if (!/^[\w-]+$/.test(requestId)) return pending('Invalid request identity.');
  const before = await controller.read(), entry = before.ledger.entries.find(e => e.requestId === requestId);
  const admission = before.requests.find(r => r.requestId === requestId);
  if (!entry || !admission?.admittedAt) return pending('No matching durable admission.');
  if (entry.status === 'reserved') await controller.markUnknown(requestId, [{ artifactId: `admission-${requestId}`, version: `revision-${before.revision}`, location: `snapshot.json#requests/${before.requests.indexOf(admission)}` }]);
  const location = join(evidenceDirectory, `billing-${requestId}.json`);
  let receipt: PiResponse & { formatVersion: number; runId: string; ledgerId: string; taskId: string; provider: string; pricingVersion: string; admittedAt: string };
  try {
    const info = await lstat(location);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) return pending('Receipt is not an independent committed file.');
    receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(location)));
  } catch { return pending('Receipt is missing or incomplete; retain reservation.'); }
  if (receipt?.formatVersion !== 1 || receipt.runId !== before.run.runId || receipt.ledgerId !== before.ledger.ledgerId
    || receipt.taskId !== entry.taskId || receipt.provider !== entry.provider || entry.provider !== 'deepseek'
    || receipt.requestId !== requestId || receipt.pricingVersion !== entry.pricingVersion || entry.pricingVersion !== ROLE_PRICING_VERSION
    || receipt.admittedAt !== admission.admittedAt || !Number.isFinite(receipt.elapsedMs) || receipt.elapsedMs < 0) return pending('Receipt identity or pricing conflicts with the original admission.');
  let amount: number;
  if (receipt.outcome === 'not_sent' && receipt.usage === undefined && receipt.responseModel === undefined) amount = 0;
  else if (receipt.outcome === 'settled' && receipt.responseModel === 'deepseek-flash' && receipt.usage) {
    try { amount = usageCostMicroCny(receipt.usage); }
    catch { return pending('Invalid provider usage; retain reservation.'); }
  } else return pending('Provider charge remains unknown; retain reservation.');
  const evidence = [{ artifactId: `billing-${requestId}`, version: 'v1', location }];
  if (entry.status === 'settled' || entry.status === 'cancelled') {
    const status = receipt.outcome === 'not_sent' ? 'cancelled' : 'settled';
    return entry.status === status && entry.settledMicroCny === amount && entry.evidence.some(ref => ref.artifactId === evidence[0].artifactId && ref.version === 'v1' && ref.location === location)
      ? { status: 'already_closed' } : pending('Receipt conflicts with the immutable closed request.');
  }
  if (receipt.outcome === 'not_sent') { await controller.cancel(requestId, evidence, { provenNoCost: true }); return { status: 'cancelled' }; }
  await controller.settle(requestId, amount, evidence); return { status: 'settled' };
}
