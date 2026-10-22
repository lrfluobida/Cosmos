import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { normalizeContext } from '@earendil-works/pi-ai';
import { convertToLlm } from '@earendil-works/pi-coding-agent';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { requestInputBytes } from '../providers/request-input.ts';
import type { PiSessionOptions } from '../providers/pi.ts';
import { validateIntakeSnapshot } from '../runtime/intake.ts';
import type { IntakeController } from '../runtime/intake.ts';
import { fundedIntakeWork, fundingFields, fundingTime } from '../runtime/public-validation-funding-validation.ts';
import { verifyPublicValidationFunding } from '../runtime/public-validation-funding.ts';
import { intakeSuccessorClaims } from '../runtime/intake-successor.ts';
import { reconcileRoleReceipt } from './provider-budget.ts';
import { nativeFiles } from './interview-denial.ts';
import { decodeModelJson } from './protocol.ts';
import { ordinaryDraftProposal, schemaCorrectionInput } from './interview-draft.ts';
import type { OrdinaryDraftInput } from './interview-draft.ts';

const denied = (): never => { throw new Error('Original schema correction source is incomplete, changed or ambiguous; no successor is allowed.'); };
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const startsInterview = (event: { type: string; reason: string }) => event.type === 'public_intake_work_started' && JSON.parse(event.reason).kind === 'interview';
type Prompt = { systemPrompt: string; context: string };
type Read = (path: string) => Promise<Buffer>;

/** Proves a complete normal-stop reply against native messages and its original admission. */
async function normalReply(controller: IntakeController, round: string, intent: Record<string, unknown>, prompt: Prompt, input: unknown, read: Read,
  estimate: PiSessionOptions['estimatedMaxCostMicroCny']) {
  const state = await controller.read(), directory = `intake-sessions/${round}`;
  const names = (await readdir(await safePath(controller.root, directory))).sort();
  const billing = names.filter(name => /^billing-[\w-]+\.json$/.test(name));
  if (billing.length !== 1 || !sameValue(names, [billing[0], 'intent.json', 'native', 'reply.json'].sort())) denied();
  if (!sameValue(decode(await read(`${directory}/intent.json`)), intent)) denied();
  const reply = decode(await read(`${directory}/reply.json`));
  if (!sameValue(reply.intent, intent) || !sameValue(Object.keys(reply).sort(), ['intent', 'proposal'])) denied();
  const receipt = decode(await read(`${directory}/${billing[0]}`)), requestId = billing[0].slice(8, -5);
  const entry = state.ledger.entries.find(entry => entry.requestId === requestId), record = state.requests.find(record => record.requestId === requestId);
  const config = intent.requestConfig as { modelId: string; thinkingLevel: string; maxOutputTokens: number; requestTimeoutMs: number };
  fundingFields(config, ['modelId', 'thinkingLevel', 'maxOutputTokens', 'requestTimeoutMs']);
  if (config.modelId !== 'deepseek-flash' || config.thinkingLevel !== 'off' || !Number.isSafeInteger(config.maxOutputTokens)
    || config.maxOutputTokens < 1 || config.maxOutputTokens > 16384 || !Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1
    || !entry || entry.taskId !== state.interviewTaskId || entry.status !== 'settled' || !record?.admittedAt
    || receipt.outcome !== 'settled' || receipt.stopReason !== 'stop' || receipt.responseModel !== config.modelId
    || (await reconcileRoleReceipt({ controller, requestId, evidenceDirectory: await safePath(controller.root, directory) })).status !== 'already_closed') denied();
  const events = state.events.filter(event => event.requestId === requestId);
  if (!sameValue(events.map(event => event.type), ['reserved', 'admitted', 'unknown', 'settled'])
    || Date.parse(record!.admittedAt!) < Date.parse(events[0].at) || Date.parse(record!.admittedAt!) > Date.parse(events[1].at)) denied();
  const nativeDirectory = `${directory}/native`, files = await readdir(await safePath(controller.root, nativeDirectory));
  if (files.length !== 1 || !files[0].endsWith('.jsonl')) denied();
  const nativePath = `${nativeDirectory}/${files[0]}`, bytes = await read(nativePath);
  const lines = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).split('\n');
  if (lines.pop() !== '' || lines.length !== 6) denied();
  const rows = lines.map(line => JSON.parse(line)), header = rows[0];
  fundingFields(header, ['type', 'version', 'id', 'timestamp', 'cwd']); fundingTime(header.timestamp);
  if (header.type !== 'session' || header.version !== 3 || !/^[a-f0-9-]{36}$/.test(header.id) || header.cwd !== resolve(controller.root)
    || files[0] !== `${header.timestamp.replace(/[:.]/g, '-')}_${header.id}.jsonl`) denied();
  const ids = new Set<string>(); let parentId = null, previousTime = Date.parse(header.timestamp);
  for (const row of rows.slice(1)) {
    fundingTime(row.timestamp);
    if (!/^[a-f0-9]{8}$/.test(row.id) || ids.has(row.id) || row.parentId !== parentId || Date.parse(row.timestamp) < previousTime) denied();
    ids.add(row.id); parentId = row.id; previousTime = Date.parse(row.timestamp);
  }
  const [model, thinking, system, user, assistant] = rows.slice(1);
  fundingFields(model, ['type', 'id', 'parentId', 'timestamp', 'provider', 'modelId']);
  fundingFields(thinking, ['type', 'id', 'parentId', 'timestamp', 'thinkingLevel']);
  if (model.type !== 'model_change' || model.provider !== 'deepseek' || model.modelId !== config.modelId
    || thinking.type !== 'thinking_level_change' || thinking.thinkingLevel !== 'off') denied();
  for (const row of [system, user, assistant]) {
    fundingFields(row, ['type', 'id', 'parentId', 'timestamp', 'message']);
    if (row.type !== 'message' || !Number.isSafeInteger(row.message.timestamp)
      || row.message.timestamp < Date.parse(header.timestamp) || row.message.timestamp > Date.parse(row.timestamp)) denied();
  }
  if (!sameValue(system.message, { role: 'system', content: '', sections: { preamble: `${prompt.systemPrompt}\n\n${prompt.context}`,
    cwd: `<cwd>\n${resolve(controller.root).split(sep).join('/')}\n</cwd>` }, timestamp: system.message.timestamp })
    || !sameValue(user.message, { role: 'user', content: [{ type: 'text', text: JSON.stringify(input) }], timestamp: user.message.timestamp })) denied();
  const message = assistant.message;
  if (message.role !== 'assistant' || message.api !== 'openai-completions' || message.provider !== 'deepseek' || message.model !== config.modelId
    || message.responseModel !== undefined && message.responseModel !== receipt.responseModel
    || message.thinkingLevel !== 'off' || message.stopReason !== 'stop' || message.errorMessage !== undefined
    || !Array.isArray(message.content) || !message.content.length || message.content.some((part: { type: string; text?: string }) => part.type !== 'text' || typeof part.text !== 'string')
    || !sameValue(message.usage, receipt.usage) || !sameValue(decodeModelJson(message.content.map((part: { text: string }) => part.text).join('')), reply.proposal)) denied();
  const request = receipt.request;
  fundingFields(request, ['requestId', 'modelId', 'maxOutputTokens', 'inputBytes', 'hasImages', 'estimatedMaxCostMicroCny']);
  if (request.requestId !== requestId || request.modelId !== config.modelId || request.hasImages !== false
    || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > config.maxOutputTokens
    || !Number.isSafeInteger(request.estimatedMaxCostMicroCny) || request.estimatedMaxCostMicroCny < entry!.settledMicroCny
    || request.estimatedMaxCostMicroCny !== (typeof estimate === 'function' ? estimate({ requestId, modelId: 'deepseek-flash',
      maxOutputTokens: request.maxOutputTokens, inputBytes: request.inputBytes, hasImages: false }) : estimate)
    || request.inputBytes !== requestInputBytes(normalizeContext({ messages: convertToLlm([system.message, user.message]) }))) denied();
  let finishSequence = events.at(-1)!.sequence;
  if (state.validationFunding) {
    const intervals = state.events.filter(startsInterview).map(start => ({ start,
      finish: state.events.find(event => event.type === 'public_intake_work_finished' && event.reason === JSON.parse(start.reason).workId) }))
      .filter(item => item.finish && Date.parse(item.start.at) <= Date.parse(header.timestamp) && Date.parse(item.finish.at) >= previousTime);
    if (intervals.length !== 1 || intervals[0].start.sequence >= events[0].sequence || intervals[0].finish!.sequence <= finishSequence) denied();
    const { start, finish } = intervals[0]; finishSequence = finish!.sequence;
    if (state.events.some(event => event.requestId !== null && event.requestId !== requestId && event.sequence > start.sequence && event.sequence < finish!.sequence)) denied();
    let sessions = 0;
    for (const path of await nativeFiles(controller.root)) {
      const at = Date.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(controller.root, path)).split('\n')[0]).timestamp);
      if (!Number.isFinite(at)) denied();
      if (at >= Date.parse(start.at) && at <= Date.parse(finish!.at)) { if (path !== nativePath) denied(); sessions++; }
    }
    if (sessions !== 1) denied();
  }
  return { proposal: reply.proposal as unknown, requestId, finishSequence };
}

export async function verifyClaimedSuccessor(controller: IntakeController, round: string, intent: Record<string, unknown>, prompt: Prompt, input: unknown,
  estimate: PiSessionOptions['estimatedMaxCostMicroCny']) {
  const state = await controller.read();
  if (state.stopReason || state.confirmation || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)) denied();
  return (await normalReply(controller, round, intent, prompt, input, path => regularFile(controller.root, path), estimate)).proposal;
}

/** Schema feedback is authorized only by an unchanged, already settled normal-stop source. */
export async function schemaDraftSuccessor(controller: IntakeController, roundId: string, intent: Record<string, unknown>, prompt: Prompt,
  estimate: PiSessionOptions['estimatedMaxCostMicroCny']) {
  const state = await controller.read(); validateIntakeSnapshot(state);
  if (state.stopReason || state.confirmation || state.draftMode || state.ordinaryProfile !== 'ordinary-design/1'
    || intent.ordinaryProfile !== state.ordinaryProfile || intent.runId !== state.run.runId || intent.ledgerId !== state.ledger.ledgerId
    || state.ledger.entries.some(entry => entry.status !== 'settled' || entry.unknown || entry.reservedMicroCny)
    || state.events.some((event, index) => index > 0 && Date.parse(event.at) < Date.parse(state.events[index - 1].at))) denied();
  await verifyPublicValidationFunding({ root: controller.root, snapshot: state, dispatch: true });
  const pending = fundedIntakeWork(state).pending;
  if (pending.some(work => work.kind !== 'session') || pending.length > 1) denied();
  const version = /^draft-([1-9]\d*)$/.exec(roundId)?.[1]; if (!version) denied();
  const sources = new Map<string, Buffer>();
  const read: Read = async path => { const bytes = await regularFile(controller.root, path); sources.set(path, bytes); return bytes; };
  const input = intent.input as OrdinaryDraftInput & { phase: string };
  const origin = decode(await read('intake-origin.json'));
  if (input.phase !== 'draft' || origin.runId !== state.run.runId || origin.brief !== input.brief || origin.ordinaryProfile !== state.ordinaryProfile
    || origin.draftMode !== undefined || !sameValue(origin.validationFunding, state.validationFunding)
    || !sameValue(decode(await read(`intake-answers/v${version}.json`)), { brief: input.brief, questions: input.questions, answers: input.answers, ordinaryProfile: state.ordinaryProfile })) denied();
  await read('intake-ordinary-profile.json');
  const original = await normalReply(controller, roundId, intent, prompt, input, read, estimate);
  const result = ordinaryDraftProposal(original.proposal, input); if (result.ok) denied();
  const diagnostic = (result as Extract<typeof result, { ok: false }>).diagnostic;
  // Earlier funded charges retain their original receipts; later successor charges never alter this binding.
  if (state.validationFunding) for (const entry of state.ledger.entries.slice(0, state.ledger.entries.findIndex(entry => entry.requestId === original.requestId))) {
    const billing = entry.evidence.filter(ref => ref.artifactId === `billing-${entry.requestId}` && ref.version === 'v1');
    if (billing.length !== 1) denied();
    await read(relative(controller.root, billing[0].location).split(sep).join('/'));
    if ((await reconcileRoleReceipt({ controller, requestId: entry.requestId, evidenceDirectory: dirname(billing[0].location) })).status !== 'already_closed') denied();
  }
  const predecessor = { kind: 'schema', roundId, requestId: original.requestId, diagnostic,
    sources: [...sources].map(([location, bytes]) => ({ location, sha256: hash(bytes) })) };
  const nativePaths = await nativeFiles(controller.root);
  const later = state.events.slice(original.finishSequence);
  const canStart = !intakeSuccessorClaims(state.events).some(claim => claim.roundId === roundId)
    && state.ledger.entries.at(-1)?.requestId === original.requestId && !later.some(event => startsInterview(event) || event.requestId !== null);
  return { root: await safePath(controller.root, `intake-sessions/${roundId}-successor-1`), intent: { ...intent, predecessor }, canStart,
    input: schemaCorrectionInput(input, original.proposal, diagnostic),
    async recheck(fundingWork: string | undefined) {
      for (const [path, bytes] of sources) if (!bytes.equals(await regularFile(controller.root, path))) denied();
      if (!sameValue(await nativeFiles(controller.root), nativePaths)) denied();
      await normalReply(controller, roundId, intent, prompt, input, path => regularFile(controller.root, path), estimate);
      const current = await controller.read(), added = current.events.slice(state.events.length);
      if (!sameValue(current.ledger, state.ledger) || !sameValue(current.requests, state.requests) || current.stopReason || current.confirmation
        || !sameValue(current.events.slice(0, state.events.length), state.events)
        || (fundingWork === undefined ? added.length !== 0 : added.length !== 1 || !startsInterview(added[0]) || JSON.parse(added[0].reason).workId !== fundingWork)) denied();
      await verifyPublicValidationFunding({ root: controller.root, snapshot: current, dispatch: true });
      return current.revision;
    },
  };
}
