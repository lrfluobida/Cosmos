import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, Page, Video } from '@playwright/test';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { EvidenceContract } from '../contracts/types.ts';
import { input, observe } from './browser.ts';
import { validatePlan } from './plan.ts';
import type { AcceptancePlan, Scalar, Step } from './plan.ts';

export interface StepResult {
  id: string; kind: Step['kind']; acceptanceId?: string; outcome: 'passed' | 'failed' | 'skipped';
  expected: Scalar; actual: Scalar; error: string | null; screenshot: string | null;
}
export interface AcceptanceReport {
  formatVersion: '1.0.0'; kind: 'normal_browser_input'; plan: AcceptancePlan;
  startedAt: string; endedAt: string; outcome: 'passed' | 'failed';
  browser: { name: 'chromium'; channel: string; version: string | null; headless: boolean; viewport: AcceptancePlan['viewport'] };
  steps: StepResult[]; errors: string[]; files: string[]; reportPath: string; evidence: EvidenceContract[];
}
export interface AcceptanceOptions {
  evidenceRoot: string; headless?: boolean; channel?: 'chrome' | 'msedge';
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const isCheck = (step: Step): step is Extract<Step, { kind: 'assert' | 'wait-for' }> => step.kind === 'assert' || step.kind === 'wait-for';

/** The trusted coordinator binds artifact to URL and owns its server. Each report ID is write-once. */
export async function runAcceptance(value: unknown, options: AcceptanceOptions): Promise<AcceptanceReport> {
  const issues = validatePlan(value);
  if (issues.length) throw new Error(`Invalid acceptance plan:\n${issues.join('\n')}`);
  const plan = structuredClone(value) as AcceptancePlan;
  const relativeDirectory = [plan.projectId, plan.artifact.artifactId, plan.artifact.version, plan.runId, plan.reportId].join('/');
  const directory = resolve(options.evidenceRoot, relativeDirectory);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // Refuse duplicate evidence identities instead of overwriting passed evidence.
  const path = (name: string) => `${relativeDirectory}/${name}`;
  const report: AcceptanceReport = {
    formatVersion: '1.0.0', kind: 'normal_browser_input', plan, startedAt: new Date().toISOString(), endedAt: '', outcome: 'failed',
    browser: { name: 'chromium', channel: options.channel ?? 'bundled-chromium', version: null, headless: options.headless ?? true, viewport: plan.viewport },
    steps: plan.steps.map(step => ({ id: step.id, kind: step.kind, ...(isCheck(step) ? { acceptanceId: step.acceptanceId } : {}),
      outcome: 'skipped', expected: isCheck(step) ? step.expected : 'input delivered', actual: null, error: null, screenshot: null })),
    errors: [], files: [path('plan.json'), path('browser.log'), path('report.json')], reportPath: path('report.json'), evidence: [],
  };
  const logs: { at: string; kind: string; message: string }[] = [];
  const log = (kind: string, text: string) => logs.push({ at: new Date().toISOString(), kind, message: text });
  let browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined, video: Video | null = null;
  const screenshot = async (name: string) => {
    if (!page || page.isClosed()) return null;
    try {
      await page.screenshot({ path: join(directory, name), timeout: 5000 });
      report.files.push(path(name)); return path(name);
    } catch (error) { report.errors.push(`Screenshot: ${message(error)}`); return null; }
  };
  await writeFile(join(directory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', 'utf8');
  try {
    browser = await chromium.launch({ headless: report.browser.headless, channel: options.channel, timeout: 15_000 });
    report.browser.version = browser.version();
    context = await browser.newContext({ viewport: plan.viewport, recordVideo: { dir: directory, size: plan.viewport }, serviceWorkers: 'block' });
    const origin = new URL(plan.url).origin;
    await context.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (['data:', 'blob:'].includes(target.protocol) || target.origin === origin) await route.continue();
      else { report.errors.push(`Blocked non-project request: ${target.origin}`); await route.abort(); }
    });
    page = await context.newPage(); video = page.video();
    page.setDefaultTimeout(2000);
    page.on('console', event => {
      log(`console.${event.type()}`, event.text());
      if (event.type() === 'error') report.errors.push(`Console: ${event.text()}`);
    });
    page.on('pageerror', error => { log('pageerror', error.message); report.errors.push(`Page: ${error.message}`); });
    page.on('crash', () => report.errors.push('Page crashed'));
    page.on('requestfailed', request => log('requestfailed', `${request.url()}: ${request.failure()?.errorText}`));
    const response = await page.goto(plan.url, { waitUntil: 'load', timeout: 15_000 });
    if (!response || !response.ok()) throw new Error(`Startup HTTP ${response?.status() ?? 'no response'}`);
    if (new URL(page.url()).origin !== origin) throw new Error('Startup left the project origin');
    for (const [index, step] of plan.steps.entries()) {
      const result = report.steps[index];
      try {
        if (isCheck(step)) {
          const deadline = Date.now() + step.timeoutMs;
          let lastError: string | null = null;
          do {
            try { result.actual = await observe(page, step.observation, Math.max(1, deadline - Date.now())); lastError = null; }
            catch (error) { lastError = message(error); }
            if (!lastError && result.actual === step.expected) break;
            if (step.kind === 'assert' || Date.now() >= deadline) break;
            await new Promise(resolveWait => setTimeout(resolveWait, Math.min(25, Math.max(0, deadline - Date.now()))));
          } while (Date.now() < deadline);
          if (lastError || result.actual !== step.expected) throw new Error(lastError ?? `Expected ${JSON.stringify(step.expected)}; observed ${JSON.stringify(result.actual)}`);
        } else {
          await input(page, step); result.actual = 'input delivered';
        }
        result.outcome = 'passed';
      } catch (error) { result.outcome = 'failed'; result.error = message(error); }
      log('step', JSON.stringify(result));
      if (isCheck(step) || result.outcome === 'failed') result.screenshot = await screenshot(`${String(index + 1).padStart(3, '0')}-${step.id}.png`);
    }
  } catch (error) { report.errors.push(`Browser startup/execution: ${message(error)}`); }
  finally {
    await screenshot('final.png');
    try { await context?.close(); } catch (error) { report.errors.push(`Context cleanup: ${message(error)}`); }
    try { await browser?.close(); } catch (error) { report.errors.push(`Browser cleanup: ${message(error)}`); }
    if (video) try {
      await rename(await video.path(), join(directory, 'browser.webm'));
      report.files.push(path('browser.webm'));
    } catch (error) { report.errors.push(`Video: ${message(error)}`); }
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
