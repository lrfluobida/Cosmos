import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, CDPSession } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { regularFile, removeOwned, safePath } from '../artifacts/paths.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { bounded, DeadlineError, AcceptanceCancelledError } from './deadline.ts';
import { validatePlan } from './plan.ts';
import type { AcceptancePlan, Observation } from './plan.ts';
import { runAcceptanceInOwnedSession } from './runner.ts';
import type { AcceptanceOptions, AcceptanceReport, OwnedAcceptanceLifecycle, PersistentBrowserIdentity } from './runner.ts';

export const PERSISTENT_PROFILE_CAPABILITY = 'persistent-profile-real-process-reopen-with-evidence';
export interface PersistentAcceptanceSeries {
  formatVersion: 'persistent-acceptance/1'; reportId: string; sourceVersion: string; bindingSha256: string;
  scope?: { requirement: ArtifactReference; design: ArtifactReference; plan: ArtifactReference;
    designSha256: string; mapVersion: string; acceptanceIds: string[] };
  segments: { id: string; prerequisite: 'fresh-profile' | 'same-profile-reopened'; plan: AcceptancePlan }[];
  checkpoint: { kind: 'close-process-reopen'; afterSegment: string; beforeSegment: string; sameProfile: true; sameOrigin: true;
    origin: string; expected: string; snapshot: Observation; savedSnapshot: Observation };
}
export interface PersistentAcceptanceOptions extends AcceptanceOptions {
  deadlineAt: number; signal?: AbortSignal; verifyBinding: () => Promise<void>;
}
export interface PersistentAcceptanceReport {
  formatVersion: '1.0.0'; kind: 'persistent_profile_process_reopen'; capability: typeof PERSISTENT_PROFILE_CAPABILITY;
  series: PersistentAcceptanceSeries; deadlineAt: number; startedAt: string; endedAt: string; outcome: 'passed' | 'failed';
  profileRoot: string; segments: { id: string; report: AcceptanceReport }[];
  checkpoint: { outcome: 'passed' | 'failed' | 'skipped'; expected: string; actual: string | null; savedActual: string | null;
    before: PersistentBrowserIdentity | null; after: PersistentBrowserIdentity | null };
  errors: string[]; reportPath: string;
}
function requireThat(valid: unknown, message: string): asserts valid { if (!valid) throw new Error('Persistent acceptance: ' + message); }
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value)
  && !value.includes('..') && !value.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value: Record<string, any>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const checksFor = (plan: AcceptancePlan, observation: Observation, expected: string) => plan.steps.filter(step =>
  ['assert', 'wait-for'].includes(step.kind) && 'observation' in step && isDeepStrictEqual(step.observation, observation) && step.expected === expected);

/** The series is host data, with no profile path, script, storage payload or executable selector. */
export function validatePersistentSeries(value: unknown): string[] {
  const issues: string[] = [];
  const check = (valid: unknown, text: string) => { if (!valid) issues.push(text); };
  if (!object(value)) return ['Expected a persistent series'];
  check(hasOnly(value, ['formatVersion', 'reportId', 'sourceVersion', 'bindingSha256', 'scope', 'segments', 'checkpoint']), 'Unknown series field');
  check(value.formatVersion === 'persistent-acceptance/1' && identifier(value.reportId), 'Invalid series identity');
  check(typeof value.sourceVersion === 'string' && /^[a-f0-9]{40}$/.test(value.sourceVersion), 'A fixed source SHA is required');
  check(typeof value.bindingSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.bindingSha256), 'A fixed binding hash is required');
  if (value.scope !== undefined) {
    const scope = value.scope;
    check(object(scope) && hasOnly(scope, ['requirement', 'design', 'plan', 'designSha256', 'mapVersion', 'acceptanceIds']), 'Invalid scope metadata');
    if (object(scope)) {
      check(typeof scope.designSha256 === 'string' && /^[a-f0-9]{64}$/.test(scope.designSha256) && identifier(scope.mapVersion), 'Invalid design/map version');
      for (const key of ['requirement', 'design', 'plan']) check(object(scope[key]) && hasOnly(scope[key], ['artifactId', 'version', 'location'])
        && identifier(scope[key].artifactId) && identifier(scope[key].version) && !/^(main|master|head|latest|current|dev|develop)$/i.test(scope[key].version)
        && typeof scope[key].location === 'string' && !!scope[key].location, 'Invalid fixed scope reference');
      check(Array.isArray(scope.acceptanceIds) && scope.acceptanceIds.length > 0 && scope.acceptanceIds.every(identifier)
        && new Set(scope.acceptanceIds).size === scope.acceptanceIds.length, 'Invalid scope acceptance IDs');
    }
  }
  if (!Array.isArray(value.segments) || value.segments.length < 2 || value.segments.length > 16) return [...issues, 'Expected 2..16 segments'];
  const ids = new Set(), reports = new Set(); let first: AcceptancePlan | undefined;
  for (const item of value.segments) {
    if (!object(item)) { issues.push('Invalid segment'); continue; }
    check(hasOnly(item, ['id', 'prerequisite', 'plan']) && identifier(item.id) && !ids.has(item.id), 'Invalid or duplicate segment'); ids.add(item.id);
    const planIssues = validatePlan(item.plan); issues.push(...planIssues);
    if (planIssues.length) continue;
    const plan = item.plan as AcceptancePlan;
    check(!reports.has(plan.reportId) && plan.reportId !== value.reportId, 'Duplicate report identity'); reports.add(plan.reportId);
    first ??= plan;
    for (const key of ['projectId', 'taskId', 'runId', 'specVersion', 'artifact', 'url', 'viewport'] as const)
      check(isDeepStrictEqual(plan[key], first[key]), 'Segment origin/candidate/scope binding changed');
  }
  if (object(value.scope) && Array.isArray(value.scope.acceptanceIds)) check(isDeepStrictEqual([...value.scope.acceptanceIds].sort(),
    [...new Set(value.segments.flatMap(item => item?.plan?.acceptanceIds ?? []))].sort()), 'Scope acceptance coverage changed');
  const c = value.checkpoint;
  if (!object(c)) return [...issues, 'Missing process reopen checkpoint'];
  check(hasOnly(c, ['kind', 'afterSegment', 'beforeSegment', 'sameProfile', 'sameOrigin', 'origin', 'expected', 'snapshot', 'savedSnapshot']), 'Unknown checkpoint field');
  check(c.kind === 'close-process-reopen' && c.sameProfile === true && c.sameOrigin === true, 'Invalid process reopen capability');
  const after = value.segments.findIndex(item => item?.id === c.afterSegment), before = value.segments.findIndex(item => item?.id === c.beforeSegment);
  check(after === value.segments.length - 2 && before === after + 1, 'Checkpoint must precede the final reopened segment');
  check(typeof c.expected === 'string' && !!c.expected && object(c.snapshot) && object(c.savedSnapshot)
    && !isDeepStrictEqual(c.snapshot, c.savedSnapshot), 'Invalid checkpoint observations');
  for (const [index, segment] of value.segments.entries()) {
    check(segment?.prerequisite === (index === before ? 'same-profile-reopened' : 'fresh-profile'), 'Invalid profile prerequisite');
  }
  if (first) check(c.origin === new URL(first.url).origin, 'Checkpoint origin binding changed');
  if (!issues.length) {
    for (const index of [after, before]) {
      const plan: AcceptancePlan = value.segments[index].plan;
      check(checksFor(plan, c.snapshot, c.expected).length > 0 && checksFor(plan, c.savedSnapshot, c.expected).length > 0,
        'Missing fixed snapshot/save checks at the checkpoint');
    }
  }
  return issues;
}

/** Browser-target CDP results must independently match the child we spawned and the private profile. */
export function assertPersistentIdentity(processes: unknown, args: unknown, pid: number, profile: string) {
  requireThat(isAbsolute(profile) && profile === resolve(profile), 'profile must be an absolute canonical path');
  requireThat(Array.isArray(processes) && Array.isArray(args) && args.every(item => typeof item === 'string'), 'missing public browser identity');
  const browsers = processes.filter(item => object(item) && item.type === 'browser');
  requireThat(Number.isSafeInteger(pid) && pid > 0 && browsers.length === 1 && browsers[0].id === pid, 'browser PID identity differs from owned child');
  const profiles = args.filter((arg: string) => arg.startsWith('--user-data-dir='));
  requireThat(profiles.length === 1 && profiles[0] === '--user-data-dir=' + profile, 'browser profile identity differs from owned profile');
  return { browserPid: pid, commandLineProfile: profile };
}
function passedReport(report: AcceptanceReport, plan: AcceptancePlan, profile: string) {
  const identity = report.session;
  requireThat(isDeepStrictEqual(report.plan, plan) && report.outcome === 'passed' && !report.errors.length
    && report.steps.length === plan.steps.length && report.steps.every((row, index) => row.id === plan.steps[index].id && row.outcome === 'passed'
      && row.error === null && row.actual === row.expected), 'segment did not pass its exact fixed plan');
  requireThat(report.failureFacts?.termination === null && !report.failureFacts.errors.length, 'unknown or lifecycle errors stop the series');
  requireThat(identity && identity.browserPid === report.cleanup.browserPid && identity.profile === profile && identity.commandLineProfile === profile
    && identity.origin === new URL(plan.url).origin && report.cleanup.processExited === true && identity.closeEvent && identity.exitConfirmed
    && (identity.exitCode !== null || identity.signalCode !== null), 'complete owned process exit/profile identity is unproven');
}
async function evidenceFiles(report: AcceptanceReport, root: string) {
  for (const extension of ['.png', '.webm', '.log', 'report.json'])
    requireThat(report.files.some(file => file.endsWith(extension)), 'required screenshot/video/log/raw report is missing');
  for (const file of report.files) requireThat((await regularFile(root, file)).length > 0, 'evidence file is missing or empty');
  const raw = JSON.parse((await regularFile(root, report.reportPath)).toString('utf8'));
  requireThat(isDeepStrictEqual(raw, report), 'raw segment report changed');
}
export async function verifyReopenCheckpoint(series: PersistentAcceptanceSeries, report: AcceptanceReport, evidenceRoot: string, profile: string) {
  const segment = series.segments.find(item => item.id === series.checkpoint.afterSegment)!;
  passedReport(report, segment.plan, profile);
  for (const observation of [series.checkpoint.snapshot, series.checkpoint.savedSnapshot]) {
    const steps = checksFor(segment.plan, observation, series.checkpoint.expected);
    const row = report.steps.find(item => item.id === steps.at(-1)?.id);
    requireThat(row?.actual === series.checkpoint.expected && (row.observation?.completed ?? 0) > 0 && row.screenshot, 'saved checkpoint state/evidence mismatch');
  }
  requireThat(segment.plan.steps.some((step, index) => ['mouse-click', 'locator-click'].includes(step.kind)
    && report.steps[index].actual === 'input delivered'), 'checkpoint has no normal mouse input');
  await evidenceFiles(report, evidenceRoot);
}

interface SegmentLifecycle { profile: string; deadlineAt: number; signal?: AbortSignal }
type SegmentExecutor = (plan: AcceptancePlan, lifecycle: SegmentLifecycle) => Promise<AcceptanceReport>;
/** Transport seam for trusted host tests. Profile ownership and all execution gates remain here. */
export async function executePersistentSeries(value: unknown, options: PersistentAcceptanceOptions, execute: SegmentExecutor): Promise<PersistentAcceptanceReport> {
  const issues = validatePersistentSeries(value);
  requireThat(!issues.length, 'invalid series: ' + issues.join('; '));
  const start = Date.now();
  requireThat(Number.isSafeInteger(options.deadlineAt) && options.deadlineAt > start && options.deadlineAt - start <= 43_200_000,
    'invalid original absolute deadline');
  requireThat(typeof options.verifyBinding === 'function', 'host binding guard is required');
  const series = structuredClone(value) as PersistentAcceptanceSeries, first = series.segments[0].plan;
  const cleanupReserveMs = Math.min(3000, Math.floor((options.timeoutMs ?? options.deadlineAt - start) / 3));
  const reportPath = [first.projectId, first.artifact.artifactId, first.artifact.version, first.runId, series.reportId, 'report.json'].join('/');
  const folder = await safePath(options.evidenceRoot, reportPath.slice(0, -'/report.json'.length));
  await mkdir(join(folder, '..'), { recursive: true }); await mkdir(folder);
  // Neither the caller nor model can choose a profile or reuse an existing browser directory.
  const profileRoot = await mkdtemp(join(tmpdir(), 'cosmos-browser-'));
  await safePath(profileRoot);
  const owner = randomUUID(); await writeFile(join(profileRoot, '.owner'), owner, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const report: PersistentAcceptanceReport = { formatVersion: '1.0.0', kind: 'persistent_profile_process_reopen', capability: PERSISTENT_PROFILE_CAPABILITY,
    series, deadlineAt: options.deadlineAt, startedAt: new Date(start).toISOString(), endedAt: '', outcome: 'failed', profileRoot, segments: [],
    checkpoint: { outcome: 'skipped', expected: series.checkpoint.expected, actual: null, savedActual: null, before: null, after: null }, errors: [], reportPath };
  let profile = '';
  const guard = async (launch = false) => {
    if (options.signal?.aborted) throw new AcceptanceCancelledError('acceptance cancelled');
    if (options.deadlineAt - Date.now() <= (launch ? cleanupReserveMs + 1000 : 0)) throw new DeadlineError('original deadline leaves no safe browser launch/cleanup time');
    await safePath(profileRoot);
    requireThat((await regularFile(profileRoot, '.owner')).toString('utf8') === owner, 'private profile root ownership changed');
    await bounded(options.verifyBinding, options.deadlineAt - Date.now(), 'Host binding guard', options.signal);
    if (options.signal?.aborted || options.deadlineAt - Date.now() <= (launch ? cleanupReserveMs + 1000 : 0)) throw new DeadlineError('cancelled or original deadline reached');
  };
  try {
    await guard();
    for (const segment of series.segments) {
      await guard(true); // Per-segment and immediately before every launch, with the same original deadline.
      if (segment.prerequisite === 'fresh-profile') {
        profile = await safePath(profileRoot, 'profile-' + randomUUID()); await mkdir(profile, { mode: 0o700 });
      } else {
        requireThat(report.checkpoint.outcome === 'passed' && !!profile, 'reopen checkpoint has not passed');
        await safePath(profileRoot, profile.slice(profileRoot.length + 1));
      }
      const result = await execute(structuredClone(segment.plan), { profile, deadlineAt: options.deadlineAt, signal: options.signal });
      report.segments.push({ id: segment.id, report: result });
      await guard(); // Close has completed; recheck source/candidate/cancellation before considering a reopen.
      passedReport(result, segment.plan, profile); await evidenceFiles(result, options.evidenceRoot);
      if (segment.id === series.checkpoint.afterSegment) {
        await verifyReopenCheckpoint(series, result, options.evidenceRoot, profile);
        Object.assign(report.checkpoint, { outcome: 'passed', actual: series.checkpoint.expected, savedActual: series.checkpoint.expected, before: result.session });
      } else if (segment.id === series.checkpoint.beforeSegment) {
        requireThat(result.session!.browserPid !== report.checkpoint.before!.browserPid, 'reopen reused the prior browser PID');
        report.checkpoint.after = result.session!;
      }
    }
    await guard(); requireThat(report.checkpoint.after, 'missing reopened process evidence'); report.outcome = 'passed';
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    if (report.checkpoint.outcome !== 'skipped') report.checkpoint.outcome = 'failed';
  }
  report.endedAt = new Date().toISOString();
  await writeFile(join(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (report.outcome === 'passed') try {
    await guard(); // Drain cancellation/source changes that arrived while publishing the report.
  } catch (error) {
    report.outcome = 'failed'; report.checkpoint.outcome = 'failed'; report.endedAt = new Date().toISOString();
    report.errors.push(error instanceof Error ? error.message : String(error));
    await writeFile(join(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  // Retain only these private test profiles for diagnosis; process cleanup is required independently.
  return report;
}

async function executable(channel?: 'chrome' | 'msedge') {
  if (!channel) return chromium.executablePath();
  requireThat(process.platform === 'win32', 'branded browsers require the reviewed Windows host');
  const paths = channel === 'msedge'
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    : ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (const path of paths) { try { await access(path); return path; } catch { /* Try the next fixed installation. */ } }
  throw new Error('Persistent acceptance: fixed browser installation is unavailable');
}
export function filterBrowserEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set(['path', 'systemroot', 'windir', 'temp', 'tmp', 'pathext', 'comspec', 'localappdata']);
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => allowed.has(key.toLowerCase()) && value !== undefined));
}
function ownedLifecycle(plan: AcceptancePlan, options: PersistentAcceptanceOptions, session: SegmentLifecycle): OwnedAcceptanceLifecycle {
  let child: ChildProcess | undefined, browser: Browser | undefined, cdp: CDPSession | undefined;
  let identity: PersistentBrowserIdentity | undefined, closed: Promise<void> = Promise.resolve(), closeEvent = false;
  const origin = new URL(plan.url).origin;
  return { deadlineAt: session.deadlineAt, signal: session.signal, process: () => child,
    identity: () => { if (identity) identity.closeEvent = closeEvent; return identity; },
    async open(directory, timeoutMs) {
      const started = Date.now(), end = Math.min(session.deadlineAt - 1000, started + timeoutMs);
      const run = <T>(op: () => Promise<T>, label: string) => bounded(op, end - Date.now(), label, session.signal);
      const path = await executable(options.channel); await safePath(session.profile);
      requireThat((await lstat(session.profile)).isDirectory(), 'private profile is not a directory');
      // Remove only our previous endpoint file; never accept a stale endpoint during the second launch.
      const portFile = join(session.profile, 'DevToolsActivePort');
      try { await removeOwned(session.profile, portFile); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (session.signal?.aborted || Date.now() >= end) throw new DeadlineError('Persistent launch cancelled or expired');
      child = spawn(path, ['--user-data-dir=' + session.profile, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
        '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
        '--disable-extensions', '--disable-default-apps', '--disable-sync', ...(options.headless === false ? [] : ['--headless=new']), 'about:blank'],
      { shell: false, windowsHide: true, env: filterBrowserEnvironment(options.env ?? process.env), stdio: 'ignore', detached: process.platform !== 'win32' });
      let launchError: Error | undefined;
      child.on('error', error => { launchError = error; });
      closed = new Promise(resolveClose => child!.once('close', () => { closeEvent = true; resolveClose(); }));
      let port = '';
      while (!port) {
        if (launchError) throw launchError;
        requireThat(!closeEvent, 'owned browser exited before CDP connection');
        try { port = (await run(() => regularFile(session.profile, 'DevToolsActivePort'), 'Owned CDP endpoint')).toString('utf8'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (!port) await run(() => new Promise(resolveWait => setTimeout(resolveWait, 25)), 'Owned CDP startup');
      }
      const [portNumber, endpoint] = port.trim().split(/\r?\n/);
      requireThat(/^\d{1,5}$/.test(portNumber) && +portNumber > 0 && +portNumber <= 65535 && /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(endpoint), 'invalid owned loopback CDP endpoint');
      browser = await run(() => chromium.connectOverCDP('ws://127.0.0.1:' + portNumber + endpoint,
        { timeout: Math.max(1, end - Date.now()), artifactsDir: directory }), 'Owned CDP connection');
      cdp = await run(() => browser!.newBrowserCDPSession(), 'Browser identity connection');
      const processes = await run(() => cdp!.send('SystemInfo.getProcessInfo'), 'Browser process identity');
      const command = await run(() => cdp!.send('Browser.getBrowserCommandLine'), 'Browser profile identity');
      identity = { ...assertPersistentIdentity(processes.processInfo, command.arguments, child.pid!, session.profile), profile: session.profile,
        origin, closeEvent, exitConfirmed: false, exitCode: null, signalCode: null,
        cdp: { browserProcessIds: processes.processInfo.filter(item => item.type === 'browser').map(item => item.id),
          profileArguments: command.arguments.filter(arg => arg.startsWith('--user-data-dir=')) },
        environmentKeys: Object.keys(filterBrowserEnvironment(options.env ?? process.env)).sort() };
      const contexts = browser.contexts(); requireThat(contexts.length === 1, 'expected the real persistent default context');
      const context: BrowserContext = contexts[0];
      for (const page of context.pages()) await run(() => page.close(), 'Initial blank page cleanup');
      // The default CDP context persists on disk; no newContext or storage seed is used.
      return { browser, context };
    },
    async close(timeoutMs) {
      requireThat(cdp && identity && child?.pid === identity.browserPid, 'cannot close an unverified browser identity');
      await bounded(() => cdp!.send('Browser.close'), timeoutMs, 'Owned browser close request');
      await bounded(() => closed, timeoutMs, 'Owned browser close event');
    } };
}
export async function runPersistentAcceptance(value: unknown, options: PersistentAcceptanceOptions): Promise<PersistentAcceptanceReport> {
  const timeoutMs = options.timeoutMs ?? Math.max(1000, Math.min(43_200_000, options.deadlineAt - Date.now()));
  return executePersistentSeries(value, options, (plan, session) => runAcceptanceInOwnedSession(plan,
    { ...options, timeoutMs }, ownedLifecycle(plan, options, session)));
}
