import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { InMemoryCredentialStore, lazyStream, normalizeContext, type AssistantMessage, type AssistantMessageEvent, type ImageContent, type Usage } from '@earendil-works/pi-ai';
import {
  compact, createAgentSession, createExtensionRuntime, convertToLlm, ModelRuntime, SessionManager, SettingsManager,
  type AgentSessionEvent, type ResourceLoader, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { regularFile } from '../artifacts/paths.ts';
import { requestInputBytes, withRecentReadResults } from './request-input.ts';
import { reviewImageInputTokens } from './review-image-quote.ts';
import { PreservedDesignDraftError } from './workspace-tools.ts';
import { successfulWriteExtension, successfulWriteNote, summaryWithoutThinking, type SuccessfulWriteCompaction } from './successful-write-compaction.ts';

export { createWorkspaceTools } from './workspace-tools.ts';
export const PI_VERSION = '0.99.2';
export const DEEPSEEK_MODEL = 'deepseek-flash';

export interface PiRequest {
  requestId: string;
  modelId: typeof DEEPSEEK_MODEL;
  maxOutputTokens: number;
  inputBytes: number;
  hasImages: boolean;
  estimatedMaxCostMicroCny: number;
}
export type PiCompactionBounds = Readonly<Pick<PiRequest, 'maxOutputTokens' | 'inputBytes' | 'hasImages'>>;
export interface PiResponse {
  requestId: string;
  outcome: 'settled' | 'unknown' | 'not_sent';
  usage?: Usage;
  responseModel?: string;
  stopReason?: string;
  elapsedMs: number;
  firstResponseMs?: number;
}
export interface PiBudget {
  beforeRequest(request: PiRequest): Promise<void>;
  afterResponse(response: PiResponse): Promise<void>;
}
export interface PiBudgetFinalizationSource {
  code: 'author_output_budget' | 'author_review_reserve'; stage: 'ordinary_output_limit'; requestId: string;
  inputBytes: number; floor: 8192; requests: number; maxRequests: 32 | 64;
  native: { file: string; entryId: string; sha256: string };
}
const unsentMessage = (source: Omit<PiBudgetFinalizationSource, 'native'>) => `Unsent ordinary output limit: ${JSON.stringify(source)}`;
const nativeDigest = (entry: unknown) => createHash('sha256').update(JSON.stringify(entry)).digest('hex');
/** Audit a native unsent error only. This does not reconstruct a live session permission. */
export async function requireBudgetFinalizationSource(source: PiBudgetFinalizationSource, stateDirectory: string): Promise<void> {
  const { native, ...reason } = source ?? {};
  if (!native || !['author_output_budget', 'author_review_reserve'].includes(reason.code) || reason.stage !== 'ordinary_output_limit'
    || !/^[a-f\d-]{36}$/.test(reason.requestId) || !Number.isSafeInteger(reason.inputBytes) || reason.inputBytes <= 0
    || reason.floor !== 8192 || ![32, 64].includes(reason.maxRequests) || !Number.isSafeInteger(reason.requests) || reason.requests < 1 || reason.requests >= reason.maxRequests
    || typeof native.file !== 'string' || !/^[\w-]{1,80}$/.test(native.entryId) || !/^[a-f\d]{64}$/.test(native.sha256)) throw new Error('Invalid native unsent source.');
  const path = relative(resolve(stateDirectory), resolve(native.file));
  if (!path || isAbsolute(path) || path.startsWith('..') || path.includes(sep) || !path.endsWith('.jsonl')) throw new Error('Unsent source is outside the original native session directory.');
  const entries = new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(stateDirectory, path)).trim().split('\n').map(line => JSON.parse(line));
  const matches = entries.filter(entry => entry.id === native.entryId), entry = matches[0];
  if (matches.length !== 1 || nativeDigest(entry) !== native.sha256 || entry.type !== 'message' || entry.message?.role !== 'assistant'
    || entry.message.stopReason !== 'error' || entry.message.errorMessage !== unsentMessage(reason)
    || ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'].some(key => entry.message.usage?.[key] !== 0)) throw new Error('Native unsent source differs from the original rejection.');
}
export interface PiSessionOptions {
  workspace: string;
  stateDirectory: string;
  systemPrompt: string;
  /** Frozen acceptance IDs, interfaces, input versions, budget references and known failures. */
  context: string;
  tools: ToolDefinition[];
  modelId?: string;
  thinkingLevel?: 'off' | 'low' | 'high' | 'max';
  /** Trusted host selection of the fixed JSON object response format. */
  jsonOutput?: boolean;
  env?: Pick<NodeJS.ProcessEnv, 'DEEPSEEK_API_KEY'>;
  resumeFile?: string;
  maxOutputTokens: number;
  maxRequests: number;
  /** Maximum for the existing tool-free follow-up shared by correction and finalization. */
  readonlyMaxOutputTokens?: 4096;
  /** Selected only for the ordinary independent design reviewer. */
  ordinaryDesignReview?: true;
  /** Ordinary coding reviewer only. Price its screenshot requests at the serialized HTTP boundary. */
  ordinaryCodingReviewImageQuote?: true;
  /** Only for the ordinary coding author with bound draft feedback. */
  feedbackReadWritePaths?: readonly string[];
  ordinaryDesignFinalizationPolicy?: 'budget-followup/1';
  requestTimeoutMs: number;
  /** Trusted host authority, refreshed before admission and immediately before dispatch. */
  requestWindow?: () => Promise<{ deadlineAt: number; cleanupMs: number }>;
  /** Trusted host policy using actual input bounds; may only reduce the configured output cap. */
  requestOutputLimit?: (request: Readonly<Omit<PiRequest, 'estimatedMaxCostMicroCny'> & { finalizationOutputFloor?: 1024 }>, signal?: AbortSignal) => Promise<number>;
  /** Trusted host decision at an eligible completed tool boundary; summaries still need admission. */
  requestCompaction?: (request: PiCompactionBounds) => Promise<boolean | 'budget_pressure'>;
  /** Host-only ordinary design selection; serialized tool output never grants eligibility. */
  compactRejectedDesignWrites?: true;
  successfulWriteCompaction?: SuccessfulWriteCompaction;
  /** Read-only optional summary preflight; only budget insufficiency may preserve the ordinary turn. */
  requestCompactionAdmission?: (input: Readonly<{ summary: Readonly<Omit<PiRequest, 'estimatedMaxCostMicroCny'>>;
    ordinary: PiCompactionBounds }>, signal?: AbortSignal) => Promise<'admit' | 'skip'>;
  /** Host must cover the input size and image cost of each request, including compaction. */
  estimatedMaxCostMicroCny: number | ((request: Omit<PiRequest, 'estimatedMaxCostMicroCny'>) => number);
  budget: PiBudget;
  compactionKeepRecentTokens?: number;
}
export class PiSessionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PiSessionError';
    this.code = code;
  }
}
class OptionalSummarySkipped extends Error {}

export type PiVerdictCorrection = (text: string, signal: AbortSignal) => Promise<{ text: string }>;

function positive(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`);
}

/** A pinned native Pi session. The host owns authorization and durable CNY accounting. */
export async function createPiSession(config: PiSessionOptions) {
  if (config.modelId !== undefined && config.modelId !== DEEPSEEK_MODEL) throw new Error('Only deepseek-flash is permitted');
  if (!config.budget?.beforeRequest || !config.budget?.afterResponse) throw new Error('Request-level budget hooks are required');
  positive(config.maxOutputTokens, 'maxOutputTokens');
  positive(config.maxRequests, 'maxRequests');
  positive(config.requestTimeoutMs, 'requestTimeoutMs');
  if (config.requestCompactionAdmission && !config.requestCompaction) throw new Error('Compaction admission requires a compaction policy');
  if (config.compactRejectedDesignWrites !== undefined && (config.compactRejectedDesignWrites !== true || !config.requestCompactionAdmission
    || !config.requestCompaction || !config.requestOutputLimit || config.maxOutputTokens !== 32768)) throw new Error('Invalid rejected design write compaction configuration.');
  if (config.successfulWriteCompaction && (!config.requestCompactionAdmission || !config.requestCompaction || !config.requestOutputLimit
    || config.maxOutputTokens !== 32768 || typeof config.successfulWriteCompaction.takeWrites !== 'function'
    || typeof config.successfulWriteCompaction.requireAuthority !== 'function')) throw new Error('Invalid successful write compaction configuration.');
  if (config.readonlyMaxOutputTokens !== undefined && (config.readonlyMaxOutputTokens !== 4096 || config.maxOutputTokens < 4096)) throw new Error('Invalid readonly output cap');
  if (config.ordinaryDesignFinalizationPolicy !== undefined && (config.ordinaryDesignFinalizationPolicy !== 'budget-followup/1' || config.maxOutputTokens !== 32768
    || ![32, 64].includes(config.maxRequests) || config.readonlyMaxOutputTokens !== 4096 || !config.requestOutputLimit)) throw new Error('Invalid ordinary design finalization configuration.');
  const key = (config.env ?? process.env).DEEPSEEK_API_KEY;
  if (!key?.trim()) throw new Error('DEEPSEEK_API_KEY is required');
  const workspace = await realpath(config.workspace);
  if (!(await stat(workspace)).isDirectory()) throw new Error('workspace must be a directory');
  await mkdir(config.stateDirectory, { recursive: true });
  const stateDirectory = await realpath(config.stateDirectory);
  let manager: SessionManager;
  if (config.resumeFile) {
    const file = await realpath(config.resumeFile);
    const rel = relative(stateDirectory, file);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Resume file is outside stateDirectory');
    manager = SessionManager.open(file, stateDirectory);
    if (resolve(manager.getCwd()) !== workspace) throw new Error('Resume workspace does not match');
    const restored = manager.buildSessionContext().model;
    if (restored && (restored.provider !== 'deepseek' || restored.modelId !== DEEPSEEK_MODEL)) throw new Error('Resume model must be deepseek/deepseek-flash');
  } else {
    manager = SessionManager.create(workspace, stateDirectory);
  }
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false,
  });
  await modelRuntime.setRuntimeApiKey('deepseek', key);
  const model = modelRuntime.getModel('deepseek', DEEPSEEK_MODEL);
  if (!model) throw new Error('Pinned SDK has no native deepseek-flash model');
  if (config.maxOutputTokens > model.maxTokens) throw new Error('maxOutputTokens exceeds model limit');
  const originalStream = modelRuntime.streamSimple.bind(modelRuntime);
  let requests = 0;
  let failure: PiSessionError | undefined;
  let callerSignal: AbortSignal | undefined;
  let readonlyRequests: number | undefined;
  let pendingReview: { error: PiSessionError; signal?: AbortSignal } | undefined;
  let closed = false;
  let pendingFinalization: { error: PiSessionError; source: Omit<PiBudgetFinalizationSource, 'native'>; beforeLeaf: string | null; native?: PiBudgetFinalizationSource['native'] } | undefined;
  let finalizationActive = false, finalizationUsed = false;
  let optionalCompaction: { ordinary: PiCompactionBounds; skippedRequestId?: string; truncatedRequestId?: string; rejected: boolean;
    checkpointId?: string; batch?: string[]; controlledCancellation?: AbortSignal } | undefined;
  const records: PiResponse[] = [];
  const fail = (code: string, message: string) => (failure ??= new PiSessionError(code, message));
  const admissionFailure = (error: unknown, message: string) => error instanceof PiSessionError && ['author_output_budget', 'author_review_reserve', 'review_output_budget'].includes(error.code)
    ? fail(error.code, 'Original request resource capacity is insufficient; no provider request sent.') : fail('admission_rejected', message);
  const throwIfFailed = () => { if (failure) throw failure; if (pendingReview) throw pendingReview.error; if (pendingFinalization && !finalizationActive) throw pendingFinalization.error; };
  function estimateRequest(request: Omit<PiRequest, 'estimatedMaxCostMicroCny'>) {
    try {
      const estimate = typeof config.estimatedMaxCostMicroCny === 'function' ? config.estimatedMaxCostMicroCny(request) : config.estimatedMaxCostMicroCny;
      positive(estimate, 'estimatedMaxCostMicroCny');
      return estimate;
    } catch { throw fail('invalid_request', 'Request cost estimate must be a positive safe integer'); }
  }
  async function effectiveRequestTimeout() {
    if (!config.requestWindow) return config.requestTimeoutMs;
    try {
      const window = await config.requestWindow();
      positive(window.deadlineAt, 'deadlineAt');
      positive(window.cleanupMs, 'cleanupMs');
      const remaining = window.deadlineAt - Date.now() - window.cleanupMs;
      positive(remaining, 'remaining request time');
      return Math.min(config.requestTimeoutMs, remaining);
    } catch { throw fail('admission_rejected', 'Request window authority or cleanup time is unavailable; no provider request sent'); }
  }
  modelRuntime.streamSimple = (requestModel, context, options) => lazyStream(requestModel, async () => {
    throwIfFailed();
    if (requestModel.provider !== 'deepseek' || requestModel.id !== DEEPSEEK_MODEL) throw fail('model_mismatch', 'Unexpected model route');
    if (closed || options?.signal?.aborted || callerSignal?.aborted) throw fail('cancelled', 'Session was cancelled');
    const compaction = session.isCompacting ? optionalCompaction : undefined;
    const countRequest = () => {
      if (readonlyRequests !== undefined && ++readonlyRequests > 1) throw fail('request_limit', 'Format correction permits one provider request');
      if (++requests > config.maxRequests) throw fail('request_limit', 'Session request limit reached');
    };
    if (!compaction || !config.requestCompactionAdmission) countRequest();
    let maxOutputTokens = readonlyRequests !== undefined ? config.readonlyMaxOutputTokens ?? config.maxOutputTokens : config.maxOutputTokens;
    if (config.requestCompaction && session.isCompacting) {
      try { positive(options?.maxTokens!, 'native compaction maxTokens'); }
      catch { throw fail('invalid_request', 'Native compaction output limit must be a positive safe integer'); }
      maxOutputTokens = Math.min(maxOutputTokens, 8192, options!.maxTokens!);
    }
    const hasImages = context.messages.some(message => 'content' in message && Array.isArray(message.content) && message.content.some(block => block.type === 'image'));
    const quoteWireImages = config.ordinaryCodingReviewImageQuote === true && !session.isCompacting && hasImages;
    const feedbackPaths = session.isCompacting ? undefined : config.feedbackReadWritePaths;
    const checkInput = config.requestOutputLimit || config.requestCompactionAdmission || quoteWireImages || feedbackPaths;
    const inputJson = checkInput ? JSON.stringify(context) : undefined;
    const snapshot = checkInput ? structuredClone(context) : context;
    const requestContext = feedbackPaths ? withRecentReadResults(snapshot, workspace, feedbackPaths) : snapshot;
    const requireUnchangedInput = () => {
      if (checkInput && JSON.stringify(context) !== inputJson) throw fail('invalid_request', 'Request input changed during output limit admission; no provider request sent');
    };
    const request: Omit<PiRequest, 'estimatedMaxCostMicroCny'> = {
      requestId: randomUUID(), modelId: DEEPSEEK_MODEL, maxOutputTokens,
      inputBytes: requestInputBytes(requestContext),
      hasImages,
    };
    if (compaction && config.requestCompactionAdmission) {
      let decision: 'admit' | 'skip';
      try { decision = await config.requestCompactionAdmission(Object.freeze({ summary: Object.freeze({ ...request }), ordinary: compaction.ordinary }), options?.signal); }
      catch (error) { throw admissionFailure(error, 'Native summary preflight rejected; no provider request sent'); }
      throwIfFailed();
      if (closed || options?.signal?.aborted || callerSignal?.aborted) throw fail('cancelled', 'Session was cancelled before summary admission');
      requireUnchangedInput();
      if (decision === 'skip') {
        compaction.skippedRequestId = request.requestId;
        throw new OptionalSummarySkipped('Optional native summary cannot fit the original budget');
      }
      if (decision !== 'admit') throw fail('invalid_request', 'Native summary preflight must admit or skip');
      countRequest();
    }
    if (config.requestOutputLimit) {
      const finalizationFloor = finalizationActive && readonlyRequests !== undefined && !session.isCompacting ? 1024 : undefined;
      let limit: number;
      try { limit = await config.requestOutputLimit(Object.freeze({ ...request,
        ...(finalizationFloor ? { finalizationOutputFloor: finalizationFloor } : {}) }), options?.signal); }
      catch (error) {
        if (config.ordinaryDesignFinalizationPolicy && !session.isCompacting && readonlyRequests === undefined && !pendingFinalization
          && !failure && !closed && !options?.signal?.aborted && !callerSignal?.aborted && requests < config.maxRequests
          && error instanceof PiSessionError && ['author_output_budget', 'author_review_reserve'].includes(error.code)) {
          const source: Omit<PiBudgetFinalizationSource, 'native'> = { code: error.code as PiBudgetFinalizationSource['code'], stage: 'ordinary_output_limit',
            requestId: request.requestId, inputBytes: request.inputBytes, floor: 8192, requests, maxRequests: config.maxRequests as 32 | 64 };
          const rejected = new PiSessionError(source.code, unsentMessage(source));
          pendingFinalization = { error: rejected, source, beforeLeaf: manager.getLeafId() }; throw rejected;
        }
        throw admissionFailure(error, 'Request output limit authority rejected; no provider request sent');
      }
      throwIfFailed();
      if (closed || options?.signal?.aborted) throw fail('cancelled', 'Session was cancelled before output limit admission');
      if (!Number.isSafeInteger(limit) || limit < (finalizationFloor ?? 1) || limit > request.maxOutputTokens) throw fail('invalid_request', 'Request output limit must be a positive safe integer within the configured cap');
      requireUnchangedInput();
      request.maxOutputTokens = limit;
    }
    let admitted = false;
    async function admit(estimate: number) {
      await effectiveRequestTimeout();
      throwIfFailed();
      if (closed || options?.signal?.aborted || callerSignal?.aborted) throw fail('cancelled', 'Session was cancelled before admission');
      try {
        await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: estimate });
        admitted = true;
      } catch (error) {
        throw admissionFailure(error, 'Budget admission rejected; no provider request sent');
      }
    }
    if (!quoteWireImages) await admit(estimateRequest(request));
    const started = performance.now();
    let firstResponseMs: number | undefined;
    let responseModel: string | undefined;
    let receivedUsage = false;
    let sent = false;
    let reported = false;
    async function report(message?: AssistantMessage) {
      if (!admitted || reported) return;
      reported = true;
      const knownUsage = message && receivedUsage;
      const knownCharge = knownUsage && responseModel === DEEPSEEK_MODEL;
      const record: PiResponse = {
        requestId: request.requestId,
        outcome: !sent ? 'not_sent' : knownCharge ? 'settled' : 'unknown',
        ...(knownUsage ? { usage: message.usage } : {}),
        responseModel,
        stopReason: message?.stopReason,
        elapsedMs: performance.now() - started,
        firstResponseMs,
      };
      records.push(record);
      try { await config.budget.afterResponse(record); }
      catch { throw fail('accounting_error', 'Request accounting failed; session cannot continue'); }
    }
    async function* guardedStream(): AsyncGenerator<AssistantMessageEvent> {
      const deadline = new AbortController();
      const signal = AbortSignal.any([deadline.signal, ...(options?.signal ? [options.signal] : []), ...(callerSignal ? [callerSignal] : [])]);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        throwIfFailed();
        if (closed || signal.aborted) throw fail('cancelled', 'Session was cancelled before dispatch');
        const requestTimeoutMs = await effectiveRequestTimeout();
        throwIfFailed();
        if (closed || signal.aborted) throw fail('cancelled', 'Session was cancelled before dispatch');
        requireUnchangedInput();
        // The SDK's HTTP timeout ends at response headers; retain a deadline through the body stream.
        timeout = setTimeout(() => {
          fail('timeout', 'Provider stream exceeded requestTimeoutMs');
          deadline.abort();
        }, requestTimeoutMs);
        sent = !quoteWireImages;
        let wireAttempted = false;
        const stream = originalStream(requestModel, requestContext, {
          ...options, signal, maxTokens: request.maxOutputTokens, maxRetries: 0, timeoutMs: requestTimeoutMs,
          ...(quoteWireImages ? { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            // Pi 0.99.2 passes the final OpenAI request here, after onPayload and JSON serialization.
            if (wireAttempted || typeof init?.body !== 'string') throw fail('invalid_request', 'Unexpected screenshot review transport.');
            wireAttempted = true;
            const wire = init.body, body = JSON.parse(wire);
            if (body?.model !== request.modelId || body.max_tokens !== request.maxOutputTokens || 'max_completion_tokens' in body)
              throw fail('invalid_request', 'Screenshot review model or output limit changed before dispatch.');
            const url = input instanceof Request ? input.url : String(input);
            const tokens = !options?.fetch && url === 'https://api.deepseek.com/chat/completions'
              ? reviewImageInputTokens(body, Buffer.byteLength(wire)) : 1_000_000;
            requireUnchangedInput();
            await admit(tokens * 2 + request.maxOutputTokens * 8);
            await effectiveRequestTimeout();
            throwIfFailed();
            if (closed || signal.aborted || init.signal?.aborted) throw fail('cancelled', 'Session was cancelled before dispatch');
            requireUnchangedInput();
            sent = true;
            return (options?.fetch ?? globalThis.fetch)(input, { ...init, body: wire });
          } } : {}),
          onPayload: config.jsonOutput ? async (payload, model) => {
            const replacement = await options?.onPayload?.(payload, model);
            const body = (replacement === undefined ? payload : replacement) as Record<string, unknown>;
            return { ...body, response_format: { type: 'json_object' } };
          } : options?.onPayload,
          onProviderStreamEvent: async (data, model) => {
            firstResponseMs ??= performance.now() - started;
            if (data && typeof data === 'object') {
              type RawUsage = { prompt_tokens?: unknown; completion_tokens?: unknown };
              const chunk = data as { model?: unknown; usage?: RawUsage; choices?: { usage?: RawUsage }[] };
              if (typeof chunk.model === 'string') responseModel = chunk.model;
              // The native parser replaces its usage on each report, preferring chunk.usage to choice.usage.
              const usage = chunk.usage || (config.ordinaryDesignReview && Array.isArray(chunk.choices) ? chunk.choices[0]?.usage : undefined);
              if (usage) {
                const complete = Number.isSafeInteger(usage.prompt_tokens) && Number.isSafeInteger(usage.completion_tokens)
                  && Number(usage.prompt_tokens) >= 0 && Number(usage.completion_tokens) >= 0;
                receivedUsage = config.ordinaryDesignReview ? complete : receivedUsage || complete;
              }
            }
            await options?.onProviderStreamEvent?.(data, model);
          },
        });
        for await (const event of stream) {
          if (event.type === 'done' || event.type === 'error') {
            clearTimeout(timeout);
            const message = event.type === 'done' ? event.message : event.error;
            // The SDK retains the first conflicting model ID even if later chunks return to the configured one.
            if (config.ordinaryDesignReview && message.responseModel) responseModel = message.responseModel;
            await report(message);
            if (responseModel && responseModel !== DEEPSEEK_MODEL) fail('model_mismatch', 'Provider returned an unexpected model');
            if (message.stopReason === 'length') {
              if (config.ordinaryDesignReview && event.type === 'done' && receivedUsage && responseModel === DEEPSEEK_MODEL
                && !failure && !closed && !signal.aborted && requests < config.maxRequests && readonlyRequests === undefined
                && message.usage.output > 0 && message.usage.reasoning === message.usage.output
                && message.content.every(block => block.type === 'thinking' || block.type === 'text' && block.text === '')) {
                pendingReview = { error: new PiSessionError('incomplete', 'Independent review exhausted its output on reasoning without a visible verdict.'), signal: callerSignal };
                // Keep the terminal usage and all prior evidence, without replaying truncated private reasoning.
                yield { type: 'done', reason: 'length', message: { ...message, content: [] } };
                return;
              }
              if (event.type === 'done' && compaction && compaction === optionalCompaction && !failure && !closed && !signal.aborted
                && receivedUsage && responseModel === DEEPSEEK_MODEL) {
                // Accounting succeeded. Let native summary validation reject the partial result without poisoning the author turn.
                compaction.truncatedRequestId = request.requestId;
                yield { type: 'done', reason: 'length', message: { ...message, content: [] } };
                return;
              }
              fail('incomplete', 'Provider output was truncated; task is incomplete');
            }
            if (message.stopReason === 'aborted') fail('cancelled', 'Provider request was cancelled');
            if (message.stopReason === 'error') fail('provider_error', 'Provider request failed');
            if (!receivedUsage) fail('usage_unknown', 'Provider usage is unknown; reconciliation is required');
            if (!responseModel) fail('model_mismatch', 'Provider did not identify its response model');
            if (failure) {
              const error = { ...message, content: [], stopReason: 'error' as const, errorMessage: failure.message };
              yield { type: 'error', reason: 'error', error };
              return;
            }
          }
          yield event;
        }
        if (!reported) throw fail('provider_error', 'Provider stream ended without a final result');
      } catch (error) {
        await report();
        throw failure ?? fail(signal.aborted ? 'cancelled' : 'provider_error', 'Provider request failed');
      } finally {
        clearTimeout(timeout);
      }
    }
    return guardedStream();
  });
  const extensionRuntime = createExtensionRuntime();
  const successHandlers: Parameters<typeof successfulWriteExtension>[0] = {
    turnEnd: async () => undefined, beforeCompact: async () => undefined,
  };
  const extensions = config.successfulWriteCompaction ? [successfulWriteExtension(successHandlers)] : [];
  const loader: ResourceLoader = {
    getExtensions: () => ({ extensions, errors: [], runtime: extensionRuntime }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => `${config.systemPrompt}\n\n${config.context}`,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
    extendResources: () => {}, reload: async () => {},
  };
  const rejectedWrites = new Map<string, { name: string; message: string }>();
  const customTools = config.compactRejectedDesignWrites ? config.tools.map(tool => ({ ...tool, async execute(id, args, signal, onUpdate, ctx) {
    rejectedWrites.delete(id);
    try { return await tool.execute(id, args, signal, onUpdate, ctx); }
    catch (error) {
      if (error instanceof PreservedDesignDraftError && ['write', 'edit', 'write-game-plan', 'write-game-design'].includes(tool.name)) {
        rejectedWrites.set(id, { name: tool.name, message: error.message });
      }
      throw error;
    }
  } } as ToolDefinition)) : config.tools;
  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: workspace, agentDir: stateDirectory, modelRuntime, model, thinkingLevel: config.thinkingLevel ?? 'low',
    resourceLoader: loader, tools: config.tools.map(tool => tool.name), customTools,
    sessionManager: manager,
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false, keepRecentTokens: config.compactionKeepRecentTokens ?? 16000 },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
      cacheWarming: 'off', enableAnalytics: false, enableInstallTelemetry: false,
    }),
  });
  if (modelFallbackMessage || session.model?.id !== DEEPSEEK_MODEL) {
    session.dispose();
    throw new Error('SDK model fallback is forbidden');
  }
  if (config.requestCompaction) {
    let lastProjection: string | undefined, lastCompactedBytes: number | undefined, autoCompactionDisabled = false, compactions = 0, pressureExceptionUsed = false;
    session.subscribe(event => {
      if (event.type !== 'compaction_end') return;
      if ((optionalCompaction?.truncatedRequestId || optionalCompaction?.skippedRequestId) && !optionalCompaction.rejected && !failure
        && event.reason === 'threshold' && !event.result && (!event.aborted && event.errorMessage
          || optionalCompaction?.controlledCancellation && !optionalCompaction.controlledCancellation.aborted && !callerSignal?.aborted && !closed)) {
        optionalCompaction.rejected = true;
        return;
      }
      if (event.aborted || event.errorMessage) fail(event.aborted ? 'cancelled' : 'compaction_failed', event.errorMessage ?? 'Native compaction was cancelled');
      else if (event.result) compactions++;
    });
    const projection = () => {
      const context = normalizeContext({ messages: convertToLlm(manager.buildSessionProjection().messages) }), serialized = JSON.stringify(context);
      return { serialized, maxOutputTokens: config.maxOutputTokens, inputBytes: requestInputBytes(context),
        hasImages: context.messages.some(message => 'content' in message && Array.isArray(message.content) && message.content.some(block => block.type === 'image')) };
    };
    const projectedCost = ({ serialized: _serialized, ...bounds }: ReturnType<typeof projection>) =>
      estimateRequest({ ...bounds, requestId: randomUUID(), modelId: DEEPSEEK_MODEL });
    const requireCompactionActive = () => {
      throwIfFailed();
      if (closed || callerSignal?.aborted) throw fail('cancelled', 'Session was cancelled at the compaction boundary');
    };
    const selectCompaction = async (before: ReturnType<typeof projection>) => {
      if (readonlyRequests !== undefined || autoCompactionDisabled || before.serialized === lastProjection
        || config.requestCompactionAdmission && config.maxRequests - requests < 3) return false;
      const cooling = lastCompactedBytes !== undefined && before.inputBytes < lastCompactedBytes + 32768;
      const { serialized: _serialized, ...bounds } = before;
      let selected: boolean | 'budget_pressure';
      try { selected = await config.requestCompaction!(Object.freeze(bounds)); }
      catch (error) { throw admissionFailure(error, 'Native compaction authority rejected; no summary request sent'); }
      requireCompactionActive();
      if (typeof selected !== 'boolean' && selected !== 'budget_pressure') throw fail('invalid_request', 'Native compaction decision must be a boolean or budget_pressure');
      if (!selected || cooling && (selected !== 'budget_pressure' || pressureExceptionUsed)) return false;
      if (cooling) pressureExceptionUsed = true;
      lastProjection = before.serialized;
      return true;
    };
    let pendingCheckpoint: { token: string; parentId: string; batch: string[]; content: string } | undefined;
    successHandlers.turnEnd = async event => {
      pendingCheckpoint = undefined;
      try {
        const writes = config.successfulWriteCompaction!.takeWrites();
        if (readonlyRequests !== undefined || autoCompactionDisabled || records.at(-1)?.outcome !== 'settled'
          || records.at(-1)?.stopReason !== 'toolUse') return;
        const content = successfulWriteNote(event, writes);
        if (!content) return;
        requireCompactionActive();
        if (!await config.successfulWriteCompaction!.requireAuthority()) return;
        requireCompactionActive();
        if (!await selectCompaction(projection())) return;
        const token = randomUUID();
        pendingCheckpoint = { token, parentId: event.toolResultEntryIds.at(-1)!, content,
          batch: [event.message, ...event.toolResults].map(message => JSON.stringify(message)) };
        return { entries: [{ type: 'custom_message', customType: 'cosmos-successful-write-checkpoint', content, display: false, details: { token } }] };
      } catch (error) {
        pendingCheckpoint = undefined;
        admissionFailure(error, 'Successful write checkpoint authority failed; no summary request sent.');
        return;
      }
    };
    successHandlers.beforeCompact = async event => {
      const operation = optionalCompaction;
      if (!operation?.checkpointId) return;
      try {
        requireCompactionActive(); event.signal.throwIfAborted();
        const preparation = event.preparation;
        if (event.reason !== 'threshold' || preparation.firstKeptEntryId !== operation.checkpointId || preparation.isSplitTurn
          || operation.batch!.some(message => !preparation.messagesToSummarize.some(item => JSON.stringify(item) === message))) {
          throw fail('compaction_failed', 'Native compaction did not select its complete successful write checkpoint.');
        }
        const result = await compact(summaryWithoutThinking(preparation), model, undefined, undefined, event.customInstructions,
          event.signal, config.thinkingLevel ?? 'low', session.agent.streamFunction, undefined, session.settingsManager.getRetrySettings());
        requireCompactionActive(); event.signal.throwIfAborted();
        return { compaction: result };
      } catch (error) {
        if ((operation.skippedRequestId || operation.truncatedRequestId) && !failure && !closed && !callerSignal?.aborted && !event.signal.aborted) {
          operation.controlledCancellation = event.signal;
        } else if (!failure) fail(event.signal.aborted || callerSignal?.aborted ? 'cancelled' : 'compaction_failed',
          error instanceof Error ? error.message : 'Successful write compaction failed.');
        // The SDK swallows thrown extension errors and otherwise starts its default summary.
        return { cancel: true };
      }
    };
    const previous = session.agent.prepareNextTurnWithContext!;
    session.agent.prepareNextTurnWithContext = async (turn, signal) => {
      const requireActive = () => {
        throwIfFailed();
        if (closed || signal?.aborted || callerSignal?.aborted) throw fail('cancelled', 'Session was cancelled at the compaction boundary');
      };
      const checkpoint = pendingCheckpoint; pendingCheckpoint = undefined;
      requireActive();
      const rejected = new Map(rejectedWrites); rejectedWrites.clear();
      const errors = turn.toolResults.filter(result => result.isError);
      const calls = turn.message.content.filter(block => block.type === 'toolCall');
      const recoverable = config.compactRejectedDesignWrites && errors.length > 0
        && calls.length === turn.toolResults.length && new Set(calls.map(call => call.id)).size === calls.length
        && calls.every(call => turn.toolResults.some(result => result.toolCallId === call.id && result.toolName === call.name))
        && errors.every(result => {
          const source = rejected.get(result.toolCallId);
          return source?.name === result.toolName && result.content.length === 1
            && result.content[0].type === 'text' && result.content[0].text === source.message;
        });
      if (readonlyRequests !== undefined || autoCompactionDisabled || turn.message.stopReason !== 'toolUse'
        || !turn.toolResults.length || errors.length > 0 && !recoverable) return previous(turn, signal);
      const before = projection();
      const { serialized: _serialized, ...bounds } = before;
      const entry = checkpoint && manager.getLeafEntry();
      if (checkpoint && (!entry || entry.type !== 'custom_message' || entry.parentId !== checkpoint.parentId
        || entry.customType !== 'cosmos-successful-write-checkpoint' || entry.content !== checkpoint.content
        || JSON.stringify(entry.details) !== JSON.stringify({ token: checkpoint.token })
        || JSON.stringify([turn.message, ...turn.toolResults].map(message => JSON.stringify(message))) !== JSON.stringify(checkpoint.batch))) {
        throw fail('compaction_failed', 'Successful write checkpoint differs from its native completed batch.');
      }
      if (!checkpoint && !await selectCompaction(before)) return previous(turn, signal);
      requireActive();
      lastProjection = before.serialized;
      const beforeCost = projectedCost(before), completed = compactions, settings = session.settingsManager.getCompactionSettings(model);
      const leaf = manager.getLeafId(), operation = { ordinary: Object.freeze(bounds), rejected: false,
        ...(checkpoint ? { checkpointId: entry!.id, batch: checkpoint.batch } : {}) } as NonNullable<typeof optionalCompaction>;
      optionalCompaction = operation;
      session.settingsManager.applyOverrides({ compaction: { enabled: true, reserveTokens: model.contextWindow, keepRecentTokens: checkpoint ? 0 : settings.keepRecentTokens } });
      try {
        const result = await previous(turn, signal);
        requireActive();
        if (operation.truncatedRequestId || operation.skippedRequestId) {
          if (!operation.rejected || compactions !== completed || manager.getLeafId() !== leaf || projection().serialized !== before.serialized) {
            throw fail('compaction_failed', 'Discarded summary changed the original context; session cannot continue');
          }
          autoCompactionDisabled = true;
        }
        // Native preparation may be a no-op: only a saved successful checkpoint updates the baseline.
        if (compactions > completed) {
          if (recoverable) {
            const retained = new Set(manager.buildSessionProjection().messages.map(message => JSON.stringify(message)));
            if ([turn.message, ...turn.toolResults].some(message => !retained.has(JSON.stringify(message)))) {
              throw fail('compaction_failed', 'Native compaction did not retain the rejected tool batch; session cannot continue');
            }
          }
          const after = projection(); lastCompactedBytes = after.inputBytes;
          autoCompactionDisabled = projectedCost(after) >= beforeCost;
        }
        return result;
      } catch { throw failure ?? fail(signal?.aborted ? 'cancelled' : 'compaction_failed', 'Native compaction did not complete; session cannot continue'); }
      finally { optionalCompaction = undefined; session.settingsManager.applyOverrides({ compaction: settings }); }
    };
  }
  let busy = false;
  let operationDone: Promise<void> | undefined;
  async function run<T>(action: () => Promise<T>, signal?: AbortSignal) {
    if (closed) throw new PiSessionError('closed', 'Session is closed');
    throwIfFailed();
    if (busy) throw new PiSessionError('busy', 'Session already has an active operation');
    if (signal?.aborted) throw new PiSessionError('cancelled', 'Operation was cancelled');
    busy = true;
    let finish!: () => void;
    operationDone = new Promise<void>(resolve => { finish = resolve; });
    callerSignal = signal;
    const abort = () => { fail('cancelled', 'Operation was cancelled'); void session.abort(); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const result = await action();
      throwIfFailed();
      return result;
    } finally {
      signal?.removeEventListener('abort', abort);
      callerSignal = undefined;
      busy = false;
      finish(); operationDone = undefined;
    }
  }
  async function budgetFinalization(error: unknown): Promise<PiBudgetFinalizationSource | null> {
    if (!config.ordinaryDesignFinalizationPolicy || !pendingFinalization || error !== pendingFinalization.error || failure || closed || busy || finalizationUsed
      || !session.isIdle || requests >= config.maxRequests || callerSignal?.aborted) return null;
    const leaf = manager.getLeafEntry();
    if (!leaf || leaf.id === pendingFinalization.beforeLeaf || leaf.type !== 'message' || leaf.message.role !== 'assistant'
      || leaf.message.stopReason !== 'error' || leaf.message.errorMessage !== unsentMessage(pendingFinalization.source)) return null;
    const native = { file: manager.getSessionFile()!, entryId: leaf.id, sha256: nativeDigest(leaf) };
    if (pendingFinalization.native && JSON.stringify(native) !== JSON.stringify(pendingFinalization.native)) return null;
    const source = { ...pendingFinalization.source, native }; await requireBudgetFinalizationSource(source, stateDirectory);
    if (failure || closed || busy || finalizationUsed) return null;
    pendingFinalization.native = native; return source;
  }
  async function readonly(text: string, signal?: AbortSignal, verdict = false) {
    return run(async () => {
      if (!session.isIdle || session.getAllTools().some(tool => tool.exposure === 'codemode' || tool.exposure === 'deferred')) {
        throw new PiSessionError('readonly_unavailable', 'Native tool registry cannot isolate a read-only format turn');
      }
      const active = session.getActiveToolNames();
      const thinking = session.thinkingLevel;
      try {
        session.setActiveToolsByName([]);
        if (session.getActiveToolNames().length || session.getCallableToolNames().length) throw new PiSessionError('readonly_unavailable', 'Native tools remain callable');
        if (verdict) session.setThinkingLevel('off');
        const beforeLeaf = manager.getLeafId();
        readonlyRequests = 0;
        await session.prompt(text, { expandPromptTemplates: false });
        if (verdict) {
          throwIfFailed();
          const leaf = manager.getLeafEntry();
          if (!leaf || leaf.id === beforeLeaf || leaf.type !== 'message' || leaf.message.role !== 'assistant'
            || leaf.message.stopReason !== 'stop' || readonlyRequests !== 1) throw new PiSessionError('incomplete', 'No completed native verdict turn.');
          return { text: leaf.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n'), requests: records.slice() };
        }
        return { text: session.getLastAssistantText() ?? '', requests: records.slice() };
      } finally {
        readonlyRequests = undefined;
        if (!session.isIdle) await session.abort();
        if (!closed) {
          if (verdict) session.setThinkingLevel(thinking);
          session.setActiveToolsByName(active);
        }
      }
    }, signal);
  }
  return {
    ...(config.ordinaryDesignReview ? { reviewVerdictCorrection(error: unknown): PiVerdictCorrection | undefined {
      const source = pendingReview;
      if (!source || error !== source.error || busy || closed || failure) return;
      return (text, signal) => {
        if (pendingReview !== source || busy || closed || failure) throw failure ?? source.error;
        const combined = source.signal ? AbortSignal.any([source.signal, signal]) : signal;
        combined.throwIfAborted();
        pendingReview = undefined;
        return readonly(text, combined, true);
      };
    } } : {}),
    ...(config.ordinaryDesignFinalizationPolicy ? { budgetFinalization,
      async finalizeBudget(error: unknown, text: string, options: { signal?: AbortSignal } = {}) {
        options.signal?.throwIfAborted();
        if (!await budgetFinalization(error) || finalizationUsed || failure || closed || busy) throw failure ?? error;
        finalizationUsed = true; finalizationActive = true;
        try { return await readonly(text, options.signal); } finally { finalizationActive = false; }
      } } : {}),
    get sessionFile() { return manager.getSessionFile(); },
    get requestRecords(): readonly PiResponse[] { return records.slice(); },
    subscribe(listener: (event: AgentSessionEvent) => void) { return session.subscribe(listener); },
    prompt(text: string, options: { images?: ImageContent[]; signal?: AbortSignal } = {}) {
      return run(async () => {
        await session.prompt(text, { images: options.images, expandPromptTemplates: false });
        return { text: session.getLastAssistantText() ?? '', requests: records.slice() };
      }, options.signal);
    },
    /** Host-only format turn. The existing native session, request guards and history remain authoritative. */
    readonlyPrompt(text: string, options: { signal?: AbortSignal } = {}) {
      if (config.ordinaryDesignFinalizationPolicy) finalizationUsed = true;
      return readonly(text, options.signal);
    },
    compact(signal?: AbortSignal) {
      return run(() => session.compact(`Preserve all acceptance IDs, interface contracts, input versions, budget references, known failures and remaining work.\n${config.context}`), signal);
    },
    async cancel() {
      fail('cancelled', 'Session was cancelled');
      await session.abort();
    },
    async close() {
      if (closed) return;
      closed = true;
      await session.abort();
      await operationDone;
      session.dispose();
    },
  };
}
