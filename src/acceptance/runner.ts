import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, BrowserServer, Page, Video } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { EvidenceContract } from '../contracts/types.ts';
import { input, observe, observeDebugScalars } from './browser.ts';
import type { MediaObservationRequest, MediaObservationSample } from './browser.ts';
import { validatePlan } from './plan.ts';
import type { AcceptancePlan, Scalar, Step } from './plan.ts';
import { bounded, DeadlineError, AcceptanceCancelledError } from './deadline.ts';
import { stopBrowserProcess, browserProcessAbsent } from './process.ts';
import { attributePageErrors, projectMismatchCanStop } from './failure-facts.ts';
import type { PageError, RuntimeException } from './failure-facts.ts';

export interface StepResult {
  id: string; kind: Step['kind']; acceptanceId?: string; outcome: 'passed' | 'failed' | 'skipped';
  expected: Scalar; actual: Scalar; error: string | null; screenshot: string | null;
  failure?: 'mismatch' | 'observation_error' | 'observation_budget' | 'input' | 'deadline';
  observation?: { completed: number };
}
export interface BrowserFailureFacts {
  formatVersion: 1;
  termination: { kind: 'observation_budget'; stepId: string } | { kind: 'project_mismatch'; stepId: string } | { kind: 'lifecycle' } | null;
  errors: {
    errorIndex: number; error: string; kind: 'page_exception' | 'observation_budget' | 'termination_evidence' | 'lifecycle' | 'unknown'; stepId?: string;
    exception?: { exceptionId: number; sourceURL: string; line: number; column: number };
  }[];
}
export interface AcceptanceReport {
  formatVersion: '1.0.0'; kind: 'normal_browser_input'; plan: AcceptancePlan;
  startedAt: string; endedAt: string; outcome: 'passed' | 'failed';
  browser: { name: 'chromium'; channel: string; version: string | null; headless: boolean; viewport: AcceptancePlan['viewport'] };
  timeoutMs: number; cleanup: { browserPid: number | null; forced: boolean; processExited: boolean | null };
  steps: StepResult[]; errors: string[]; files: string[]; reportPath: string; evidence: EvidenceContract[];
  failureFacts?: BrowserFailureFacts;
  session?: PersistentBrowserIdentity;
  mediaObservations?: MediaObservationSample;
}
export interface PersistentBrowserIdentity {
  browserPid: number; profile: string; commandLineProfile: string; origin: string;
  closeEvent: boolean; exitConfirmed: boolean; exitCode: number | null; signalCode: NodeJS.Signals | null;
  cdp?: { browserProcessIds: number[]; profileArguments: string[] }; environmentKeys?: string[];
}
/** Trusted host transport only; never accepted as game/model plan data. */
export interface OwnedAcceptanceLifecycle {
  deadlineAt: number; signal?: AbortSignal;
  open(directory: string, timeoutMs: number): Promise<{ browser: Browser; context: BrowserContext }>;
  process(): ChildProcess | undefined;
  close(timeoutMs: number): Promise<void>;
  identity(): PersistentBrowserIdentity | undefined;
}
export interface AcceptanceOptions {
  evidenceRoot: string; headless?: boolean; channel?: 'chrome' | 'msedge'; timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Only trusted source assembly supplies this collection; it is never a plan field. */
  mediaObservations?: MediaObservationRequest;
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const isCheck = (step: Step): step is Extract<Step, { kind: 'assert' | 'wait-for' }> => step.kind === 'assert' || step.kind === 'wait-for';

/** The trusted coordinator binds artifact to URL and owns its server. Each report ID is write-once. */
export async function runAcceptance(value: unknown, options: AcceptanceOptions): Promise<AcceptanceReport> {
  return runAcceptanceInternal(value, options);
}
export async function runAcceptanceInOwnedSession(value: unknown, options: AcceptanceOptions, lifecycle: OwnedAcceptanceLifecycle): Promise<AcceptanceReport> {
  if (!Number.isSafeInteger(lifecycle.deadlineAt)) throw new Error('An absolute lifecycle deadline is required');
  return runAcceptanceInternal(value, options, lifecycle);
}
async function runAcceptanceInternal(value: unknown, options: AcceptanceOptions, lifecycle?: OwnedAcceptanceLifecycle): Promise<AcceptanceReport> {
  const issues = validatePlan(value);
  if (issues.length) throw new Error(`Invalid acceptance plan:\n${issues.join('\n')}`);
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 43_200_000) throw new Error('timeoutMs must be 1000..43200000');
  const plan = structuredClone(value) as AcceptancePlan;
  const relativeDirectory = [plan.projectId, plan.artifact.artifactId, plan.artifact.version, plan.runId, plan.reportId].join('/');
  const directory = resolve(options.evidenceRoot, relativeDirectory);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // Refuse duplicate evidence identities instead of overwriting passed evidence.
  const path = (name: string) => `${relativeDirectory}/${name}`;
  const failureFacts: BrowserFailureFacts = { formatVersion: 1, termination: null, errors: [] };
  const report: AcceptanceReport = {
    formatVersion: '1.0.0', kind: 'normal_browser_input', plan, startedAt: new Date().toISOString(), endedAt: '', outcome: 'failed',
    browser: { name: 'chromium', channel: options.channel ?? 'bundled-chromium', version: null, headless: options.headless ?? true, viewport: plan.viewport },
    timeoutMs, cleanup: { browserPid: null, forced: false, processExited: null },
    steps: plan.steps.map(step => ({ id: step.id, kind: step.kind, ...(isCheck(step) ? { acceptanceId: step.acceptanceId } : {}),
      outcome: 'skipped', expected: isCheck(step) ? step.expected : 'input delivered', actual: null, error: null, screenshot: null })),
    errors: [], files: [path('plan.json'), path('browser.log'), path('report.json')], reportPath: path('report.json'), evidence: [], failureFacts,
  };
  const recordError = (error: string, kind: BrowserFailureFacts['errors'][number]['kind'] = 'lifecycle', stepId?: string) => {
    failureFacts.errors.push({ errorIndex: report.errors.length, error, kind, ...(stepId ? { stepId } : {}) });
    report.errors.push(error);
  };
  const pageErrors: PageError[] = [], exceptions: RuntimeException[] = [];
  const logs: { at: string; kind: string; message: string }[] = [];
  const log = (kind: string, text: string) => logs.push({ at: new Date().toISOString(), kind, message: text });
  let server: BrowserServer | undefined, browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined, video: Video | null = null;
  let forceClose = false;
  const lifecycleDeadline = lifecycle?.deadlineAt ?? Date.now() + timeoutMs;
  const cleanupReserveMs = Math.min(3000, Math.floor(timeoutMs / 3));
  const deadline = lifecycleDeadline - cleanupReserveMs;
  const remaining = (limit: number) => Math.min(limit, deadline - Date.now());
  const run = <T>(operation: () => Promise<T>, limit: number, label: string) => bounded(operation, remaining(limit), label, lifecycle?.signal);
  const screenshot = async (name: string) => {
    if (!page || page.isClosed() || forceClose) return null;
    try {
      await run(() => page!.screenshot({ path: join(directory, name), timeout: Math.max(1, remaining(5000)) }), 5000, 'Screenshot');
      report.files.push(path(name)); return path(name);
    } catch (error) {
      recordError(`Screenshot: ${message(error)}`);
      if (error instanceof DeadlineError) { forceClose = true; failureFacts.termination = { kind: 'lifecycle' }; throw error; }
      return null;
    }
  };
  await writeFile(join(directory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', 'utf8');
  try {
    if (lifecycle) {
      ({ browser, context } = await run(() => lifecycle.open(directory, Math.max(1, remaining(15_000))), 15_000, 'Persistent browser launch'));
      report.cleanup.browserPid = lifecycle.process()?.pid ?? null;
      report.cleanup.processExited = false;
    } else {
      // launchServer owns this process tree. Its launch timeout also cancels a partial launch.
      server = await chromium.launchServer({ headless: report.browser.headless, channel: options.channel, env: options.env, host: '127.0.0.1', timeout: Math.max(1, remaining(15_000)) });
      report.cleanup.browserPid = server.process().pid ?? null;
      report.cleanup.processExited = false;
      browser = await run(() => chromium.connect(server!.wsEndpoint(), { timeout: Math.max(1, remaining(5000)) }), 5000, 'Browser connection');
      report.browser.version = browser.version();
      context = await run(() => browser!.newContext({ viewport: plan.viewport, recordVideo: { dir: directory, size: plan.viewport }, serviceWorkers: 'block' }), 5000, 'Context creation');
    }
    if (lifecycle) report.browser.version = browser!.version();
    const origin = new URL(plan.url).origin;
    await run(() => context!.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (['data:', 'blob:'].includes(target.protocol) || target.origin === origin) await route.continue();
      else { recordError(`Blocked non-project request: ${target.origin}`); await route.abort(); }
    }), 2000, 'Route setup');
    page = await run(() => context!.newPage(), 5000, 'Page creation'); video = page.video();
    if (lifecycle) {
      await run(() => page!.setViewportSize(plan.viewport), 2000, 'Persistent viewport');
      await run(() => page!.screencast.start({ path: join(directory, 'browser.webm'), size: plan.viewport }), 5000, 'Persistent video start');
    }
    page.setDefaultTimeout(2000);
    page.on('console', event => {
      log(`console.${event.type()}`, event.text());
      if (event.type() === 'error') recordError(`Console: ${event.text()}`, 'unknown');
    });
    page.on('pageerror', error => {
      log('pageerror', error.message); pageErrors.push({ errorIndex: report.errors.length, name: error.name, message: error.message });
      recordError(`Page: ${error.message}`, 'unknown');
    });
    page.on('crash', () => recordError('Page crashed'));
    page.on('requestfailed', request => log('requestfailed', `${request.url()}: ${request.failure()?.errorText}`));
    const sourceSession = await run(() => context!.newCDPSession(page!), 5000, 'Exception source connection');
    sourceSession.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails));
    await run(() => sourceSession.send('Runtime.enable'), 2000, 'Exception source setup');
    const response = await run(() => page!.goto(plan.url, { waitUntil: 'load', timeout: Math.max(1, remaining(15_000)) }), 15_000, 'Navigation');
    if (!response || !response.ok()) throw new Error(`Startup HTTP ${response?.status() ?? 'no response'}`);
    if (new URL(page.url()).origin !== origin) throw new Error('Startup left the project origin');
    for (const [index, step] of plan.steps.entries()) {
      const result = report.steps[index];
      try {
        if (isCheck(step)) {
          const localDeadline = Date.now() + step.timeoutMs, checkDeadline = Math.min(deadline, localDeadline);
          result.observation = { completed: 0 };
          let lastError: string | null = null;
          do {
            try {
              result.actual = await run(() => observe(page!, step.observation, Math.max(1, checkDeadline - Date.now())), checkDeadline - Date.now(), `Observation ${step.id}`);
              result.observation.completed++; lastError = null;
            } catch (error) {
              if (error instanceof DeadlineError) {
                result.failure = localDeadline < deadline && Date.now() < deadline ? 'observation_budget' : 'deadline';
                failureFacts.termination = result.failure === 'observation_budget' ? { kind: 'observation_budget', stepId: step.id } : { kind: 'lifecycle' };
                throw error;
              }
              lastError = message(error);
            }
            if (!lastError && result.actual === step.expected) break;
            if (step.kind === 'assert' || Date.now() >= checkDeadline) break;
            // A completed mismatch needs no final race against a few remaining milliseconds.
            if (!lastError && result.actual !== null && checkDeadline - Date.now() <= 25) {
              await new Promise(resolveWait => setTimeout(resolveWait, Math.max(0, checkDeadline - Date.now()))); break;
            }
            await new Promise(resolveWait => setTimeout(resolveWait, Math.min(25, Math.max(0, checkDeadline - Date.now()))));
          } while (Date.now() < checkDeadline);
          if (lastError || result.actual !== step.expected) {
            if (Date.now() >= deadline) { result.failure = 'deadline'; throw new DeadlineError(`Observation ${step.id}: run deadline reached`); }
            result.failure = lastError ? 'observation_error' : 'mismatch';
            throw new Error(lastError ?? `Expected ${JSON.stringify(step.expected)}; observed ${JSON.stringify(result.actual)}`);
          }
        } else {
          await run(() => input(page!, step), step.kind === 'locator-click' ? step.timeoutMs + 100 : 2000, `Input ${step.id}`); result.actual = 'input delivered';
        }
        result.outcome = 'passed';
      } catch (error) {
        result.outcome = 'failed'; result.error = message(error);
        result.failure ??= isCheck(step) ? 'observation_error' : error instanceof DeadlineError ? 'deadline' : 'input';
        if (error instanceof DeadlineError || error instanceof AcceptanceCancelledError) { forceClose = true; throw error; }
        if (result.failure === 'mismatch') {
          attributePageErrors(failureFacts, pageErrors, exceptions);
          if (Date.now() < deadline && projectMismatchCanStop(report, index)) failureFacts.termination = { kind: 'project_mismatch', stepId: step.id };
        }
      }
      log('step', JSON.stringify(result));
      if (isCheck(step) || result.outcome === 'failed') result.screenshot = await screenshot(`${String(index + 1).padStart(3, '0')}-${step.id}.png`);
      if (failureFacts.termination?.kind === 'project_mismatch') break;
    }
    if (options.mediaObservations && report.steps.every(row => row.outcome === 'passed') && !report.errors.length) {
      const request = structuredClone(options.mediaObservations);
      if (request.formatVersion !== 'readonly-media/1' || JSON.stringify(request.candidate) !== JSON.stringify(plan.artifact)
        || !/^[a-f0-9]{64}$/.test(request.manifestSha256) || !/^[a-f0-9]{40}$/.test(request.sourceVersion)
        || !/^[a-f0-9]{64}$/.test(request.planBindingSha256) || !Array.isArray(request.fields)) throw new Error('Invalid fixed media collection binding');
      const values = await run(() => observeDebugScalars(page!, request.fields.map(field => field.path)), 1500, 'Read-only media collection');
      report.mediaObservations = { request, recordedAt: new Date().toISOString(), values };
    }
  } catch (error) {
    if (error instanceof DeadlineError || error instanceof AcceptanceCancelledError) { forceClose = true; failureFacts.termination ??= { kind: 'lifecycle' }; }
    if (Date.now() >= deadline) failureFacts.termination = { kind: 'lifecycle' };
    const local = failureFacts.termination?.kind === 'observation_budget' ? failureFacts.termination : null;
    recordError(`Browser startup/execution: ${message(error)}`, local ? 'observation_budget' : 'lifecycle', local?.stepId);
  }
  finally {
    try { await screenshot('final.png'); } catch { /* Deadline is already recorded; proceed to forced cleanup. */ }
    const gracefulDeadline = lifecycleDeadline - Math.min(1000, cleanupReserveMs);
    const cleanup = <T>(operation: () => Promise<T>, label: string) => bounded(operation, Math.min(1000, gracefulDeadline - Date.now()), label);
    if (!forceClose) try {
      if (lifecycle) {
        if (page && !page.isClosed()) {
          await cleanup(() => page!.screencast.stop(), 'Persistent video collection');
          report.files.push(path('browser.webm'));
        }
        await cleanup(() => lifecycle.close(Math.max(1, gracefulDeadline - Date.now())), 'Persistent browser close');
      } else if (context) await cleanup(() => context!.close(), 'Context cleanup');
      if (video) {
        await cleanup(() => video!.saveAs(join(directory, 'browser.webm')), 'Video collection');
        report.files.push(path('browser.webm'));
      }
      if (browser) await cleanup(() => browser!.close(), 'Client cleanup');
      if (server) await cleanup(() => server!.close(), 'Server cleanup');
    } catch (error) { forceClose = true; failureFacts.termination = { kind: 'lifecycle' }; recordError(`Cleanup: ${message(error)}`); }
    const owned = lifecycle?.process() ?? server?.process();
    if (owned && (owned.exitCode === null && owned.signalCode === null)) {
      report.cleanup.forced = true;
      try { await stopBrowserProcess(owned, Math.max(1, Math.min(2000, lifecycleDeadline - Date.now()))); }
      catch (error) { recordError(`Forced cleanup: ${message(error)}`); }
    }
    if (owned) {
      report.cleanup.browserPid = owned.pid ?? null;
      report.cleanup.processExited = owned.exitCode !== null || owned.signalCode !== null;
      if (lifecycle) {
        const identity = lifecycle.identity();
        if (identity) {
          identity.exitCode = owned.exitCode; identity.signalCode = owned.signalCode;
          identity.exitConfirmed = report.cleanup.processExited && identity.closeEvent && browserProcessAbsent(identity.browserPid);
          report.session = structuredClone(identity);
          report.cleanup.processExited = identity.exitConfirmed;
        } else report.cleanup.processExited = false;
      }
      if (!report.cleanup.processExited) recordError('Owned browser process did not exit');
    }
    if (forceClose && (video || lifecycle)) {
      const local = failureFacts.termination?.kind === 'observation_budget' ? failureFacts.termination : null;
      recordError('Video unavailable after forced browser termination; earlier screenshots retained', local ? 'termination_evidence' : 'lifecycle', local?.stepId);
    }
  }
  attributePageErrors(failureFacts, pageErrors, exceptions);
  if (lifecycle?.signal?.aborted) recordError('Acceptance cancelled', 'lifecycle');
  report.endedAt = new Date().toISOString();
  report.outcome = !report.errors.length && report.steps.every(step => step.outcome === 'passed') ? 'passed' : 'failed';
  log('errors', JSON.stringify(report.errors));
  await writeFile(join(directory, 'browser.log'), logs.map(entry => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
  report.evidence = report.files.filter(file => !file.endsWith('plan.json')).map((file, index) => ({
    contractVersion: '1.0.0', evidenceId: `${plan.reportId}-${index + 1}`, taskId: plan.taskId, acceptanceIds: plan.acceptanceIds,
    kind: file.endsWith('.png') ? 'screenshot' : file.endsWith('.webm') ? 'video' : file.endsWith('.log') ? 'log' : 'test_report',
    source: { artifactId: `${plan.reportId}-evidence-${index + 1}`, version: plan.reportId, location: file },
    artifactVersions: [plan.artifact], outcome: file.endsWith('report.json') ? report.outcome : 'observed',
    recordedAt: report.endedAt, summary: file.endsWith('report.json') ? `Normal browser input: ${report.outcome}` : 'Recorded browser evidence; see report assertions for verdicts',
  }));
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (lifecycle && report.outcome === 'passed' && (lifecycle.signal?.aborted || Date.now() >= lifecycleDeadline)) {
    recordError(lifecycle.signal?.aborted ? 'Acceptance cancelled during report publication' : 'Original deadline reached during report publication', 'lifecycle');
    failureFacts.termination = { kind: 'lifecycle' }; report.outcome = 'failed'; report.endedAt = new Date().toISOString();
    for (const item of report.evidence) if (item.source.location.endsWith('report.json')) item.outcome = 'failed';
    log('errors', JSON.stringify(report.errors));
    await writeFile(join(directory, 'browser.log'), logs.map(entry => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
    await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  return report;
}
