import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { regularFile, safePath } from '../artifacts/paths.ts';
import type { IntakeController } from '../runtime/intake.ts';
import { reconcileRoleReceipt } from './provider-budget.ts';
import type { PiResponse } from '../providers/pi.ts';

/** A closed length receipt permits one successor; it never repairs unknown accounting. */
export async function truncatedDraftSuccessor(controller: IntakeController, roundId: string, intent: Record<string, unknown>) {
  const relative = `intake-sessions/${roundId}`, original = await safePath(controller.root, relative);
  const files = (await readdir(original)).filter(name => name.startsWith('billing-'));
  const match = files.length === 1 && /^billing-([\w-]+)\.json$/.exec(files[0]);
  if (!match) throw new Error('Truncated draft recovery requires one original billing receipt.');
  const requestId = match[1], state = await controller.read();
  const entry = state.ledger.entries.find(row => row.requestId === requestId);
  if (state.stopReason || state.ledger.entries.some(row => row.unknown || row.reservedMicroCny)
    || !entry || entry.taskId !== state.interviewTaskId || entry.status !== 'settled') {
    throw new Error('Truncated draft recovery requires a settled original intake request.');
  }
  const bytes = await regularFile(controller.root, `${relative}/${files[0]}`);
  const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as PiResponse;
  if (receipt.outcome !== 'settled' || receipt.stopReason !== 'length') throw new Error('Only a settled length draft can have a successor.');
  const verified = await reconcileRoleReceipt({ controller, requestId, evidenceDirectory: original });
  if (verified.status !== 'already_closed' || !bytes.equals(await regularFile(controller.root, `${relative}/${files[0]}`))) {
    throw new Error('Original truncated draft receipt conflicts with its settled charge.');
  }
  const settled = state.events.find(event => event.type === 'settled' && event.requestId === requestId);
  const canStart = state.ledger.entries.at(-1)?.requestId === requestId && !!settled && !state.events.slice(settled.sequence).some(event =>
    event.type === 'public_intake_work_started' && JSON.parse(event.reason).kind === 'interview');
  return { root: await safePath(controller.root, `${relative}-successor-1`), canStart, intent: {
    ...intent, predecessor: { roundId, requestId, billing: { artifactId: `billing-${requestId}`, version: 'v1', location: join(original, files[0]) }, receipt },
  } };
}
