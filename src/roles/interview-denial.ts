import { readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateIntakeSnapshot } from '../runtime/intake.ts';
import type { IntakeController } from '../runtime/intake.ts';
import { fundedIntakeWork, fundingFields, fundingTime } from '../runtime/public-validation-funding-validation.ts';
import { verifyPublicValidationFunding } from '../runtime/public-validation-funding.ts';
import { reconcileRoleReceipt } from './provider-budget.ts';

const denied = (): never => { throw new Error('Original pre-admission denial evidence is incomplete, changed or ambiguous; no successor is allowed.'); };
const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const local = (root: string, path: string) => relative(root, path).split(sep).join('/');
const startsInterview = (event: { type: string; reason: string }) => event.type === 'public_intake_work_started' && JSON.parse(event.reason).kind === 'interview';
export async function nativeFiles(root: string): Promise<string[]> {
  const absent = (error: NodeJS.ErrnoException): string[] => { if (error.code === 'ENOENT') return []; throw error; };
  const files: string[] = [];
  for (const round of await readdir(await safePath(root, 'intake-sessions')).catch(absent)) {
    const folder = `intake-sessions/${round}/native`;
    for (const name of await readdir(await safePath(root, folder)).catch(absent)) files.push(`${folder}/${name}`);
  }
  return files.sort();
}

/** Missing round directories cannot erase a funded interview's durable work history. */
export async function requireInterviewHistorySources(controller: IntakeController) {
  const state = await controller.read();
  if (!state.validationFunding) return;
  const starts = state.events.filter(startsInterview);
  if (!starts.length) return;
  const sessions: { at: number; round: string }[] = [];
  for (const path of await nativeFiles(controller.root)) {
    const bytes = await regularFile(controller.root, path), folder = path.split('/').slice(0, 2).join('/');
    const header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\n')[0]);
    fundingTime(header.timestamp);
    await regularFile(controller.root, `${folder}/intent.json`);
    sessions.push({ at: Date.parse(header.timestamp), round: folder });
  }
  for (const start of starts) {
    const finish = state.events.find(event => event.type === 'public_intake_work_finished' && event.reason === JSON.parse(start.reason).workId);
    if (!finish || sessions.filter(session => session.at >= Date.parse(start.at) && session.at <= Date.parse(finish.at)).length !== 1) {
      throw new Error('Original interview source is missing from its durable work history.');
    }
  }
}

/** Historical host evidence only. No synthetic request, receipt or accounting transition is created. */
export async function deniedDraftSuccessor(controller: IntakeController, roundId: string, intent: Record<string, unknown>,
  prompt: { systemPrompt: string; context: string }) {
  const state = await controller.read(); validateIntakeSnapshot(state);
  if (state.events.some((event, index) => index > 0 && Date.parse(event.at) < Date.parse(state.events[index - 1].at))) denied();
  if (!state.validationFunding || state.stopReason || state.confirmation || state.draftMode || state.ordinaryProfile !== 'ordinary-design/1'
    || intent.ordinaryProfile !== state.ordinaryProfile || intent.runId !== state.run.runId || intent.ledgerId !== state.ledger.ledgerId
    || state.ledger.entries.some(entry => entry.status !== 'settled' || entry.unknown || entry.reservedMicroCny)) denied();
  await verifyPublicValidationFunding({ root: controller.root, snapshot: state, dispatch: true });
  const pending = fundedIntakeWork(state).pending;
  // A current CLI session may surround this request; no unfinished interview or foreign owner may.
  if (pending.some(work => work.kind !== 'session') || pending.length > 1) denied();
  const version = /^draft-([1-9]\d*)$/.exec(roundId)?.[1]; if (!version) denied();
  const original = `intake-sessions/${roundId}`, sources = new Map<string, Buffer>();
  const read = async (path: string) => { const bytes = await regularFile(controller.root, path); sources.set(path, bytes); return bytes; };
  if (!sameValue(decode(await read(`${original}/intent.json`)), intent)) denied();
  const input = intent.input as { phase: string; brief: string; questions: unknown; answers: unknown };
  const config = intent.requestConfig as { modelId: string; thinkingLevel: string; maxOutputTokens: number; requestTimeoutMs: number };
  fundingFields(config, ['modelId', 'thinkingLevel', 'maxOutputTokens', 'requestTimeoutMs']);
  if (input.phase !== 'draft' || config.modelId !== 'deepseek-flash' || config.thinkingLevel !== 'off'
    || !Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > 16384
    || !Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1) denied();
  const origin = decode(await read('intake-origin.json'));
  if (origin.runId !== state.run.runId || origin.brief !== input.brief || origin.ordinaryProfile !== state.ordinaryProfile
    || origin.draftMode !== undefined || !sameValue(origin.validationFunding, state.validationFunding)) denied();
  if (!sameValue(decode(await read(`intake-answers/v${version}.json`)), {
    brief: input.brief, questions: input.questions, answers: input.answers, ordinaryProfile: state.ordinaryProfile,
  })) denied();
  await read('intake-ordinary-profile.json');
  const names = (await readdir(await safePath(controller.root, original))).sort();
  if (!sameValue(names, ['intent.json', 'native'])) denied();
  const nativeDirectory = await safePath(controller.root, `${original}/native`), files = await readdir(nativeDirectory);
  if (files.length !== 1 || !files[0].endsWith('.jsonl')) denied();
  const nativePath = `${original}/native/${files[0]}`, bytes = await read(nativePath);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const lines = text.split('\n'); if (lines.pop() !== '' || lines.length !== 6) denied();
  const rows = lines.map(line => JSON.parse(line));
  const header = rows[0]; fundingFields(header, ['type', 'version', 'id', 'timestamp', 'cwd']); fundingTime(header.timestamp);
  if (header.type !== 'session' || header.version !== 3 || !/^[a-f0-9-]{36}$/.test(header.id)
    || header.cwd !== resolve(controller.root) || files[0] !== `${header.timestamp.replace(/[:.]/g, '-')}_${header.id}.jsonl`) denied();
  const ids = new Set<string>(); let parentId = null, previousTime = Date.parse(header.timestamp);
  for (const row of rows.slice(1)) {
    fundingTime(row.timestamp);
    if (!/^[a-f0-9]{8}$/.test(row.id) || ids.has(row.id) || row.parentId !== parentId || Date.parse(row.timestamp) < previousTime) denied();
    ids.add(row.id); parentId = row.id; previousTime = Date.parse(row.timestamp);
  }
  const [model, thinking, system, user, assistant] = rows.slice(1);
  fundingFields(model, ['type', 'id', 'parentId', 'timestamp', 'provider', 'modelId']);
  if (model.type !== 'model_change' || model.provider !== 'deepseek' || model.modelId !== config.modelId) denied();
  fundingFields(thinking, ['type', 'id', 'parentId', 'timestamp', 'thinkingLevel']);
  if (thinking.type !== 'thinking_level_change' || thinking.thinkingLevel !== 'off') denied();
  for (const row of [system, user, assistant]) {
    fundingFields(row, ['type', 'id', 'parentId', 'timestamp', 'message']);
    if (row.type !== 'message' || !Number.isSafeInteger(row.message.timestamp)
      || row.message.timestamp < Date.parse(header.timestamp) || row.message.timestamp > Date.parse(row.timestamp)) denied();
  }
  if (!sameValue(system.message, { role: 'system', content: '', sections: { preamble: `${prompt.systemPrompt}\n\n${prompt.context}`,
    cwd: `<cwd>\n${resolve(controller.root).split(sep).join('/')}\n</cwd>` }, timestamp: system.message.timestamp })
    || !sameValue(user.message, { role: 'user', content: [{ type: 'text', text: JSON.stringify(input) }], timestamp: user.message.timestamp })
    || !sameValue(assistant.message, { role: 'assistant', content: [], api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'error', errorMessage: 'Budget admission rejected; no provider request sent', timestamp: assistant.message.timestamp, thinkingLevel: 'off' })) denied();
  const intervals = state.events.filter(startsInterview).map(start => {
    const work = JSON.parse(start.reason), finish = state.events.find(event => event.type === 'public_intake_work_finished' && event.reason === work.workId);
    return { start, finish, work };
  }).filter(item => item.finish && Date.parse(item.start.at) <= Date.parse(header.timestamp) && Date.parse(item.finish.at) >= previousTime);
  if (intervals.length !== 1) denied();
  const { start, finish, work } = intervals[0];
  if (finish!.sequence !== start.sequence + 1 || start.requestId !== null || finish!.requestId !== null) denied();
  // Every recorded charge must retain its original ordered admission/accounting history and receipt.
  for (const entry of state.ledger.entries) {
    const events = state.events.filter(event => event.requestId === entry.requestId), record = state.requests.find(row => row.requestId === entry.requestId)!;
    if (!sameValue(events.map(event => event.type), ['reserved', 'admitted', 'unknown', 'settled'])
      || Date.parse(record.admittedAt!) < Date.parse(events[0].at) || Date.parse(record.admittedAt!) > Date.parse(events[1].at)
      || events.some(event => event.sequence > start.sequence && event.sequence < finish!.sequence)) denied();
    const billing = entry.evidence.filter(ref => ref.artifactId === `billing-${entry.requestId}` && ref.version === 'v1');
    if (billing.length !== 1) denied();
    const path = local(controller.root, billing[0].location);
    if (!path.startsWith('intake-sessions/') || path.startsWith(`${original}/`)) denied();
    await read(path);
    if ((await reconcileRoleReceipt({ controller, requestId: entry.requestId, evidenceDirectory: dirname(billing[0].location) })).status !== 'already_closed') denied();
  }
  // A second native session in the same work interval makes the claimed source ambiguous.
  let sessions = 0;
  const nativePaths = await nativeFiles(controller.root), nativeBytes = new Map<string, Buffer>();
  for (const path of nativePaths) {
    const data = await regularFile(controller.root, path); nativeBytes.set(path, data);
    const session = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data).split('\n')[0]);
    fundingTime(session.timestamp);
    if (Date.parse(session.timestamp) >= Date.parse(start.at) && Date.parse(session.timestamp) <= Date.parse(finish!.at)) {
      if (path !== nativePath) denied(); sessions++;
    }
  }
  if (sessions !== 1) denied();
  const predecessor = { kind: 'pre_admission_denied', roundId, native: { location: nativePath, sha256: hash(bytes) },
    work: { ...work, start, finish }, sources: [...sources].filter(([path]) => !path.includes('billing-')).map(([location, data]) => ({ location, sha256: hash(data) })) };
  const later = state.events.slice(finish!.sequence);
  const canStart = !later.some(event => startsInterview(event) || event.requestId !== null);
  return { root: await safePath(controller.root, `${original}-successor-1`), intent: { ...intent, predecessor }, canStart,
    async recheck(fundingWork: string | undefined) {
      for (const [path, expected] of sources) if (!expected.equals(await regularFile(controller.root, path))) denied();
      if (!sameValue(await nativeFiles(controller.root), nativePaths)) denied();
      for (const [path, expected] of nativeBytes) if (!expected.equals(await regularFile(controller.root, path))) denied();
      if (!sameValue((await readdir(await safePath(controller.root, original))).sort(), names)
        || !sameValue(await readdir(nativeDirectory), files)) denied();
      const current = await controller.read(), added = current.events.slice(state.events.length);
      if (!sameValue(current.ledger, state.ledger) || !sameValue(current.requests, state.requests) || current.stopReason || current.confirmation
        || !sameValue(current.events.slice(0, state.events.length), state.events) || added.length !== 1
        || !startsInterview(added[0]) || JSON.parse(added[0].reason).workId !== fundingWork) denied();
      await verifyPublicValidationFunding({ root: controller.root, snapshot: current, dispatch: true });
      return current.revision;
    },
  };
}
