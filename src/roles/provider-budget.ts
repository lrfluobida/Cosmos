import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PiBudget, PiResponse } from '../providers/pi.ts';
import type { RunController } from '../runtime/run.ts';

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
      await controller.reserve({ requestId: request.requestId, taskId, provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION, estimatedMaxCostMicroCny: request.estimatedMaxCostMicroCny });
      requests.add(request.requestId);
      await controller.admit(request.requestId);
    },
    async afterResponse(response) {
      if (!requests.has(response.requestId) || !/^[\w-]+$/.test(response.requestId)) throw new Error('Response has no role admission.');
      const before = await controller.read();
      const entry = before.ledger.entries.find(e => e.requestId === response.requestId)!;
      if (entry.status === 'cancelled' && response.outcome === 'not_sent') return;
      // If receipt persistence fails, the admitted request already blocks new paid work.
      await controller.markUnknown(response.requestId, [{ artifactId: `admission-${response.requestId}`, version: `revision-${before.revision}`, location: `snapshot.json#requests/${before.requests.findIndex(r => r.requestId === response.requestId)}` }]);
      await mkdir(evidenceDirectory, { recursive: true });
      const location = join(evidenceDirectory, `billing-${response.requestId}.json`);
      // Only usage and provider metadata; no prompt, tool arguments or credentials.
      await writeFile(location, JSON.stringify({ pricingVersion: ROLE_PRICING_VERSION, ...response }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      const evidence = [{ artifactId: `billing-${response.requestId}`, version: 'v1', location }];
      if (response.outcome === 'not_sent') await controller.cancel(response.requestId, evidence, { provenNoCost: true });
      else if (response.outcome === 'settled' && response.responseModel === 'deepseek-flash' && response.usage) {
        let amount: number;
        try { amount = usageCostMicroCny(response.usage); }
        catch (error) { await controller.markUnknown(response.requestId, evidence); throw error; }
        await controller.settle(response.requestId, amount, evidence);
      } else await controller.markUnknown(response.requestId, evidence);
    },
  };
}
