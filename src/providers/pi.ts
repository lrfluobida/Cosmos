import { randomUUID } from 'node:crypto';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { InMemoryCredentialStore, lazyStream, normalizeContext, type AssistantMessage, type AssistantMessageEvent, type ImageContent, type Usage } from '@earendil-works/pi-ai';
import {
  createAgentSession, createExtensionRuntime, convertToLlm, ModelRuntime, SessionManager, SettingsManager,
  type AgentSessionEvent, type ResourceLoader, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { requestInputBytes } from './request-input.ts';

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
  /** Only the existing tool-free format correction may use this smaller cap. */
  readonlyMaxOutputTokens?: 4096;
  requestTimeoutMs: number;
  /** Trusted host authority, refreshed before admission and immediately before dispatch. */
  requestWindow?: () => Promise<{ deadlineAt: number; cleanupMs: number }>;
  /** Trusted host policy using actual input bounds; may only reduce the configured output cap. */
  requestOutputLimit?: (request: Readonly<Omit<PiRequest, 'estimatedMaxCostMicroCny'>>, signal?: AbortSignal) => Promise<number>;
  /** Trusted host decision at a successful tool boundary; actual summary requests still need admission. */
  requestCompaction?: (request: PiCompactionBounds) => Promise<boolean | 'budget_pressure'>;
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
  if (config.readonlyMaxOutputTokens !== undefined && (config.readonlyMaxOutputTokens !== 4096 || config.maxOutputTokens < 4096)) throw new Error('Invalid readonly output cap');
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
  let closed = false;
  let optionalCompaction: { ordinary: PiCompactionBounds; skippedRequestId?: string; truncatedRequestId?: string; rejected: boolean } | undefined;
  const records: PiResponse[] = [];
  const fail = (code: string, message: string) => (failure ??= new PiSessionError(code, message));
  const admissionFailure = (error: unknown, message: string) => error instanceof PiSessionError && ['author_output_budget', 'author_review_reserve', 'review_output_budget'].includes(error.code)
    ? fail(error.code, 'Original request resource capacity is insufficient; no provider request sent.') : fail('admission_rejected', message);
  const throwIfFailed = () => { if (failure) throw failure; };
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
    const checkInput = config.requestOutputLimit || config.requestCompactionAdmission;
    const requestContext = checkInput ? structuredClone(context) : context;
    const inputJson = JSON.stringify(requestContext);
    const requireUnchangedInput = () => {
      if (checkInput && JSON.stringify(context) !== inputJson) throw fail('invalid_request', 'Request input changed during output limit admission; no provider request sent');
    };
    const request: Omit<PiRequest, 'estimatedMaxCostMicroCny'> = {
      requestId: randomUUID(), modelId: DEEPSEEK_MODEL, maxOutputTokens,
      inputBytes: requestInputBytes(requestContext),
      hasImages: requestContext.messages.some(message => 'content' in message && Array.isArray(message.content) && message.content.some(block => block.type === 'image')),
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
      let limit: number;
      try { limit = await config.requestOutputLimit(Object.freeze({ ...request }), options?.signal); }
      catch (error) { throw admissionFailure(error, 'Request output limit authority rejected; no provider request sent'); }
      throwIfFailed();
      if (closed || options?.signal?.aborted) throw fail('cancelled', 'Session was cancelled before output limit admission');
      if (!Number.isSafeInteger(limit) || limit <= 0 || limit > request.maxOutputTokens) throw fail('invalid_request', 'Request output limit must be a positive safe integer within the configured cap');
      requireUnchangedInput();
      request.maxOutputTokens = limit;
    }
    const estimate = estimateRequest(request);
    await effectiveRequestTimeout();
    throwIfFailed();
    if (closed || options?.signal?.aborted) throw fail('cancelled', 'Session was cancelled before admission');
    try {
      await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: estimate });
    } catch (error) {
      throw admissionFailure(error, 'Budget admission rejected; no provider request sent');
    }
    const started = performance.now();
    let firstResponseMs: number | undefined;
    let responseModel: string | undefined;
    let receivedUsage = false;
    let sent = false;
    let reported = false;
    async function report(message?: AssistantMessage) {
      if (reported) return;
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
        sent = true;
        const stream = originalStream(requestModel, requestContext, {
          ...options, signal, maxTokens: request.maxOutputTokens, maxRetries: 0, timeoutMs: requestTimeoutMs,
          onPayload: config.jsonOutput ? async (payload, model) => {
            const replacement = await options?.onPayload?.(payload, model);
            const body = (replacement === undefined ? payload : replacement) as Record<string, unknown>;
            return { ...body, response_format: { type: 'json_object' } };
          } : options?.onPayload,
          onProviderStreamEvent: async (data, model) => {
            firstResponseMs ??= performance.now() - started;
            if (data && typeof data === 'object') {
              const chunk = data as { model?: unknown; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
              if (typeof chunk.model === 'string') responseModel = chunk.model;
              receivedUsage ||= Number.isSafeInteger(chunk.usage?.prompt_tokens) && Number.isSafeInteger(chunk.usage?.completion_tokens)
                && Number(chunk.usage?.prompt_tokens) >= 0 && Number(chunk.usage?.completion_tokens) >= 0;
            }
            await options?.onProviderStreamEvent?.(data, model);
          },
        });
        for await (const event of stream) {
          if (event.type === 'done' || event.type === 'error') {
            clearTimeout(timeout);
            const message = event.type === 'done' ? event.message : event.error;
            await report(message);
            if (responseModel && responseModel !== DEEPSEEK_MODEL) fail('model_mismatch', 'Provider returned an unexpected model');
            if (message.stopReason === 'length') {
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
  const loader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: extensionRuntime }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => `${config.systemPrompt}\n\n${config.context}`,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
    extendResources: () => {}, reload: async () => {},
  };
  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: workspace, agentDir: stateDirectory, modelRuntime, model, thinkingLevel: config.thinkingLevel ?? 'low',
    resourceLoader: loader, tools: config.tools.map(tool => tool.name), customTools: config.tools,
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
        && event.reason === 'threshold' && !event.aborted && !event.result && event.errorMessage) {
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
    const previous = session.agent.prepareNextTurnWithContext!;
    session.agent.prepareNextTurnWithContext = async (turn, signal) => {
      const requireActive = () => {
        throwIfFailed();
        if (closed || signal?.aborted || callerSignal?.aborted) throw fail('cancelled', 'Session was cancelled at the compaction boundary');
      };
      requireActive();
      if (readonlyRequests !== undefined || autoCompactionDisabled || turn.message.stopReason !== 'toolUse'
        || !turn.toolResults.length || turn.toolResults.some(result => result.isError)) return previous(turn, signal);
      if (config.requestCompactionAdmission && config.maxRequests - requests < 3) return previous(turn, signal);
      const before = projection();
      if (before.serialized === lastProjection) return previous(turn, signal);
      const cooling = lastCompactedBytes !== undefined && before.inputBytes < lastCompactedBytes + 32768;
      let selected: boolean | 'budget_pressure';
      const { serialized: _serialized, ...bounds } = before;
      try { selected = await config.requestCompaction!(Object.freeze(bounds)); }
      catch (error) { throw admissionFailure(error, 'Native compaction authority rejected; no summary request sent'); }
      requireActive();
      if (typeof selected !== 'boolean' && selected !== 'budget_pressure') throw fail('invalid_request', 'Native compaction decision must be a boolean or budget_pressure');
      if (!selected || cooling && (selected !== 'budget_pressure' || pressureExceptionUsed)) return previous(turn, signal);
      if (cooling) pressureExceptionUsed = true;
      lastProjection = before.serialized;
      const beforeCost = projectedCost(before), completed = compactions, settings = session.settingsManager.getCompactionSettings(model);
      const leaf = manager.getLeafId(), operation = { ordinary: Object.freeze(bounds), rejected: false } as NonNullable<typeof optionalCompaction>;
      optionalCompaction = operation;
      session.settingsManager.applyOverrides({ compaction: { enabled: true, reserveTokens: model.contextWindow, keepRecentTokens: settings.keepRecentTokens } });
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
    if (failure) throw failure;
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
      if (failure) throw failure;
      return result;
    } finally {
      signal?.removeEventListener('abort', abort);
      callerSignal = undefined;
      busy = false;
      finish(); operationDone = undefined;
    }
  }
  return {
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
      return run(async () => {
        if (!session.isIdle || session.getAllTools().some(tool => tool.exposure === 'codemode' || tool.exposure === 'deferred')) {
          throw new PiSessionError('readonly_unavailable', 'Native tool registry cannot isolate a read-only format turn');
        }
        const active = session.getActiveToolNames();
        try {
          // Formatting needs only facts already in this session, so grant no callable tools.
          session.setActiveToolsByName([]);
          if (session.getActiveToolNames().length || session.getCallableToolNames().length) throw new PiSessionError('readonly_unavailable', 'Native tools remain callable');
          readonlyRequests = 0;
          await session.prompt(text, { expandPromptTemplates: false });
          return { text: session.getLastAssistantText() ?? '', requests: records.slice() };
        } finally {
          readonlyRequests = undefined;
          if (!session.isIdle) await session.abort();
          if (!closed) session.setActiveToolsByName(active);
        }
      }, options.signal);
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
