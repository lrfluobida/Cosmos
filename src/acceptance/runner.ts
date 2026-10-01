import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, BrowserServer, Page, Video } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { EvidenceContract } from '../contracts/types.ts';
import { input, observe } from './browser.ts';
import { validatePlan } from './plan.ts';
import type { AcceptancePlan, Scalar, Step } from './plan.ts';
import { bounded, DeadlineError } from './deadline.ts';
import { stopBrowserProcess } from './process.ts';

export interface StepResult {
  id: string; kind: Step['kind']; acceptanceId?: string; outcome: 'passed' | 'failed' | 'skipped';
  expected: Scalar; actual: Scalar; error: string | null; screenshot: string | null;
}
export interface AcceptanceReport {
  formatVersion: '1.0.0'; kind: 'normal_browser_input'; plan: AcceptancePlan;
  startedAt: string; endedAt: string; outcome: 'passed' | 'failed';
  browser: { name: 'chromium'; channel: string; version: string | null; headless: boolean; viewport: AcceptancePlan['viewport'] };
  timeoutMs: number; cleanup: { browserPid: number | null; forced: boolean; processExited: boolean | null };
  steps: StepResult[]; errors: string[]; files: string[]; reportPath: string; evidence: EvidenceContract[];
}
export interface AcceptanceOptions {
  evidenceRoot: string; headless?: boolean; channel?: 'chrome' | 'msedge'; timeoutMs?: number;
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const isCheck = (step: Step): step is Extract<Step, { kind: 'assert' | 'wait-for' }> => step.kind === 'assert' || step.kind === 'wait-for';

/** The trusted coordinator binds artifact to URL and owns its server. Each report ID is write-once. */
export async function runAcceptance(value: unknown, options: AcceptanceOptions): Promise<AcceptanceReport> {
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
  const report: AcceptanceReport = {
    formatVersion: '1.0.0', kind: 'normal_browser_input', plan, startedAt: new Date().toISOString(), endedAt: '', outcome: 'failed',
    browser: { name: 'chromium', channel: options.channel ?? 'bundled-chromium', version: null, headless: options.headless ?? true, viewport: plan.viewport },
    timeoutMs, cleanup: { browserPid: null, forced: false, processExited: null },
    steps: plan.steps.map(step => ({ id: step.id, kind: step.kind, ...(isCheck(step) ? { acceptanceId: step.acceptanceId } : {}),
      outcome: 'skipped', expected: isCheck(step) ? step.expected : 'input delivered', actual: null, error: null, screenshot: null })),
    errors: [], files: [path('plan.json'), path('browser.log'), path('report.json')], reportPath: path('report.json'), evidence: [],
  };
  const logs: { at: string; kind: string; message: string }[] = [];
  const log = (kind: string, text: string) => logs.push({ at: new Date().toISOString(), kind, message: text });
  let server: BrowserServer | undefined, browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined, video: Video | null = null;
  let forceClose = false;
  const lifecycleDeadline = Date.now() + timeoutMs;
  const cleanupReserveMs = Math.min(3000, Math.floor(timeoutMs / 3));
  const deadline = lifecycleDeadline - cleanupReserveMs;
  const remaining = (limit: number) => Math.min(limit, deadline - Date.now());
  const run = <T>(operation: () => Promise<T>, limit: number, label: string) => bounded(operation, remaining(limit), label);
  const screenshot = async (name: string) => {
    if (!page || page.isClosed() || forceClose) return null;
    try {
      await run(() => page!.screenshot({ path: join(directory, name), timeout: Math.max(1, remaining(5000)) }), 5000, 'Screenshot');
      report.files.push(path(name)); return path(name);
    } catch (error) {
      report.errors.push(`Screenshot: ${message(error)}`);
      if (error instanceof DeadlineError) { forceClose = true; throw error; }
      return null;
    }
  };
  await writeFile(join(directory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', 'utf8');
  try {
    // launchServer owns this process tree. Its launch timeout also cancels a partial launch.
    server = await chromium.launchServer({ headless: report.browser.headless, channel: options.channel, host: '127.0.0.1', timeout: Math.max(1, remaining(15_000)) });
    report.cleanup.browserPid = server.process().pid ?? null;
    report.cleanup.processExited = false;
    browser = await run(() => chromium.connect(server!.wsEndpoint(), { timeout: Math.max(1, remaining(5000)) }), 5000, 'Browser connection');
    report.browser.version = browser.version();
    context = await run(() => browser!.newContext({ viewport: plan.viewport, recordVideo: { dir: directory, size: plan.viewport }, serviceWorkers: 'block' }), 5000, 'Context creation');
    const origin = new URL(plan.url).origin;
    await run(() => context!.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (['data:', 'blob:'].includes(target.protocol) || target.origin === origin) await route.continue();
      else { report.errors.push(`Blocked non-project request: ${target.origin}`); await route.abort(); }
    }), 2000, 'Route setup');
    page = await run(() => context!.newPage(), 5000, 'Page creation'); video = page.video();
    page.setDefaultTimeout(2000);
    page.on('console', event => {
      log(`console.${event.type()}`, event.text());
      if (event.type() === 'error') report.errors.push(`Console: ${event.text()}`);
    });
    page.on('pageerror', error => { log('pageerror', error.message); report.errors.push(`Page: ${error.message}`); });
    page.on('crash', () => report.errors.push('Page crashed'));
    page.on('requestfailed', request => log('requestfailed', `${request.url()}: ${request.failure()?.errorText}`));
    const response = await run(() => page!.goto(plan.url, { waitUntil: 'load', timeout: Math.max(1, remaining(15_000)) }), 15_000, 'Navigation');
    if (!response || !response.ok()) throw new Error(`Startup HTTP ${response?.status() ?? 'no response'}`);
    if (new URL(page.url()).origin !== origin) throw new Error('Startup left the project origin');
    for (const [index, step] of plan.steps.entries()) {
      const result = report.steps[index];
      try {
        if (isCheck(step)) {
          const checkDeadline = Math.min(deadline, Date.now() + step.timeoutMs);
          let lastError: string | null = null;
          do {
            try { result.actual = await run(() => observe(page!, step.observation, Math.max(1, checkDeadline - Date.now())), checkDeadline - Date.now(), `Observation ${step.id}`); lastError = null; }
            catch (error) { if (error instanceof DeadlineError) throw error; lastError = message(error); }
            if (!lastError && result.actual === step.expected) break;
            if (step.kind === 'assert' || Date.now() >= checkDeadline) break;
            await new Promise(resolveWait => setTimeout(resolveWait, Math.min(25, Math.max(0, checkDeadline - Date.now()))));
          } while (Date.now() < checkDeadline);
          if (lastError || result.actual !== step.expected) throw new Error(lastError ?? `Expected ${JSON.stringify(step.expected)}; observed ${JSON.stringify(result.actual)}`);
        } else {
          await run(() => input(page!, step), step.kind === 'locator-click' ? step.timeoutMs + 100 : 2000, `Input ${step.id}`); result.actual = 'input delivered';
        }
        result.outcome = 'passed';
      } catch (error) {
        result.outcome = 'failed'; result.error = message(error);
        if (error instanceof DeadlineError) { forceClose = true; throw error; }
      }
      log('step', JSON.stringify(result));
      if (isCheck(step) || result.outcome === 'failed') result.screenshot = await screenshot(`${String(index + 1).padStart(3, '0')}-${step.id}.png`);
    }
  } catch (error) {
    if (error instanceof DeadlineError) forceClose = true;
    report.errors.push(`Browser startup/execution: ${message(error)}`);
  }
  finally {
    try { await screenshot('final.png'); } catch { /* Deadline is already recorded; proceed to forced cleanup. */ }
    const gracefulDeadline = lifecycleDeadline - Math.min(1000, cleanupReserveMs);
    const cleanup = <T>(operation: () => Promise<T>, label: string) => bounded(operation, Math.min(1000, gracefulDeadline - Date.now()), label);
    if (!forceClose) try {
      if (context) await cleanup(() => context!.close(), 'Context cleanup');
      if (video) {
        await cleanup(() => video!.saveAs(join(directory, 'browser.webm')), 'Video collection');
        report.files.push(path('browser.webm'));
      }
      if (browser) await cleanup(() => browser!.close(), 'Client cleanup');
      if (server) await cleanup(() => server!.close(), 'Server cleanup');
    } catch (error) { forceClose = true; report.errors.push(`Cleanup: ${message(error)}`); }
    if (server && (server.process().exitCode === null && server.process().signalCode === null)) {
      report.cleanup.forced = true;
      try { await stopBrowserProcess(server.process(), Math.max(1, Math.min(2000, lifecycleDeadline - Date.now()))); }
      catch (error) { report.errors.push(`Forced cleanup: ${message(error)}`); }
    }
    if (server) {
      report.cleanup.processExited = server.process().exitCode !== null || server.process().signalCode !== null;
      if (!report.cleanup.processExited) report.errors.push('Owned browser process did not exit');
    }
    if (forceClose && video) report.errors.push('Video unavailable after forced browser termination; earlier screenshots retained');
  }
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
  return report;
}
