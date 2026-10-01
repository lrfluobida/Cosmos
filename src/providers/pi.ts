import { randomUUID } from 'node:crypto';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { InMemoryCredentialStore, lazyStream, type AssistantMessage, type AssistantMessageEvent, type ImageContent, type Usage } from '@earendil-works/pi-ai';
import {
  createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager,
  type AgentSessionEvent, type ResourceLoader, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';

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
  env?: Pick<NodeJS.ProcessEnv, 'DEEPSEEK_API_KEY'>;
  resumeFile?: string;
  maxOutputTokens: number;
  maxRequests: number;
  requestTimeoutMs: number;
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
  let closed = false;
  const records: PiResponse[] = [];
  const fail = (code: string, message: string) => (failure ??= new PiSessionError(code, message));
  const throwIfFailed = () => { if (failure) throw failure; };
  modelRuntime.streamSimple = (requestModel, context, options) => lazyStream(requestModel, async () => {
    throwIfFailed();
    if (requestModel.provider !== 'deepseek' || requestModel.id !== DEEPSEEK_MODEL) throw fail('model_mismatch', 'Unexpected model route');
    if (closed || options?.signal?.aborted) throw fail('cancelled', 'Session was cancelled');
    if (++requests > config.maxRequests) throw fail('request_limit', 'Session request limit reached');
    const request: Omit<PiRequest, 'estimatedMaxCostMicroCny'> = {
      requestId: randomUUID(), modelId: DEEPSEEK_MODEL, maxOutputTokens: config.maxOutputTokens,
      inputBytes: Buffer.byteLength(JSON.stringify(context)),
      hasImages: context.messages.some(message => 'content' in message && Array.isArray(message.content) && message.content.some(block => block.type === 'image')),
    };
    let estimate: number;
    try {
      estimate = typeof config.estimatedMaxCostMicroCny === 'function' ? config.estimatedMaxCostMicroCny(request) : config.estimatedMaxCostMicroCny;
      positive(estimate, 'estimatedMaxCostMicroCny');
    } catch { throw fail('invalid_request', 'Request cost estimate must be a positive safe integer'); }
    try {
      await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: estimate });
    } catch {
      throw fail('admission_rejected', 'Budget admission rejected; no provider request sent');
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
        // The SDK's HTTP timeout ends at response headers; retain a deadline through the body stream.
        timeout = setTimeout(() => {
          fail('timeout', 'Provider stream exceeded requestTimeoutMs');
          deadline.abort();
        }, config.requestTimeoutMs);
        sent = true;
        const stream = originalStream(requestModel, context, {
          ...options, signal, maxTokens: config.maxOutputTokens, maxRetries: 0, timeoutMs: config.requestTimeoutMs,
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
            if (message.stopReason === 'length') fail('incomplete', 'Provider output was truncated; task is incomplete');
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
  let busy = false;
  async function run<T>(action: () => Promise<T>, signal?: AbortSignal) {
    if (closed) throw new PiSessionError('closed', 'Session is closed');
    if (failure) throw failure;
    if (busy) throw new PiSessionError('busy', 'Session already has an active operation');
    if (signal?.aborted) throw new PiSessionError('cancelled', 'Operation was cancelled');
    busy = true;
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
      session.dispose();
    },
  };
}
