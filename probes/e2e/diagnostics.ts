import { isDeepStrictEqual } from 'node:util';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import type { HostIssue, HostPassedCheck } from '../../src/runtime/repair/feedback.ts';
import type { buildProject } from './host.ts';

export interface Diagnostics {
  reportValid: boolean;
  issues: HostIssue[];
  passedChecks: Omit<HostPassedCheck, 'evidenceId'>[];
}
const startId = (task: TaskContract) => task.acceptanceIds.find(id => id === 'PILOT-START') ?? task.acceptanceIds[0];
function issue(task: TaskContract, path: string, checkId: string, classification: HostIssue['classification'], actual: string, expected: string, acceptanceId = startId(task), reproduction = ['Run the frozen host check on this exact captured version.']): HostIssue {
  return { acceptanceId, checkId, classification, summary: `${checkId}: ${actual}`, reproduction, actual, expected, evidenceRefs: [path] };
}

/** Only known compiler diagnostics naming generated src/index.html establish a code defect. */
export function diagnoseBuild(task: TaskContract, result: Awaited<ReturnType<typeof buildProject>>, path: string): Diagnostics {
  const passedChecks: Diagnostics['passedChecks'] = [];
  for (const [index, command] of result.results.entries()) {
    const checkId = index === 0 ? 'build/typecheck' : 'build/vite';
    if (command.code === 0) { passedChecks.push({ acceptanceId: startId(task), checkId }); continue; }
    const text = (command.stdout + '\n' + command.stderr).replaceAll('\\', '/').replaceAll(result.work.replaceAll('\\', '/') + '/', '');
    const ts = index === 0 ? text.match(/(?:^|\n)(src\/[a-zA-Z0-9_./-]+|index\.html)\((\d+),(\d+)\): error (TS\d+):/) : null;
    const vite = index === 1 && /\[vite:|\[PARSE_ERROR\]|ERROR:|Parse failure|Unexpected token/.test(text)
      ? text.match(/(?:^|\n|\s)(src\/[a-zA-Z0-9_./-]+\.[cm]?[jt]sx?|index\.html):([0-9]+):([0-9]+)/) : null;
    const diagnostic = ts ?? vite;
    if (diagnostic && !diagnostic[1].split('/').includes('..')) return { reportValid: true, passedChecks,
      issues: [issue(task, path, checkId, 'code_defect', `${ts ? ts[4] : 'Vite parse failure'} at ${diagnostic[1]}:${diagnostic[2]}:${diagnostic[3]}`, 'The unchanged project typechecks and builds successfully.', startId(task), [index === 0 ? 'Run the pinned TypeScript --noEmit check.' : 'Run the pinned Vite build.', 'Inspect the referenced complete build report.'])] };
    return { reportValid: true, passedChecks, issues: [issue(task, path, checkId, 'insufficient_evidence', 'The host command failed without an attributable generated-source compiler diagnostic.', 'Establish whether the failure is a code or environment problem before repair.')] };
  }
  if (!result.passed || result.results.length !== 2) return { reportValid: false, passedChecks: [], issues: [issue(task, path, 'build/report', 'insufficient_evidence', 'Build result is incomplete or inconsistent.', 'Both pinned build commands must finish successfully.')] };
  return { reportValid: true, passedChecks, issues: [] };
}

/** The host matches every row to its frozen plan. A failed whole report stays failed. */
export function diagnoseBrowser(task: TaskContract, report: AcceptanceReport, expectedPlan: AcceptancePlan, path: string): Diagnostics {
  const invalid = (actual: string): Diagnostics => ({ reportValid: false, passedChecks: [], issues: [issue(task, path, 'browser/report', 'insufficient_evidence', actual, 'A complete report for the exact frozen plan and candidate is required.')] });
  if (!isDeepStrictEqual(report.plan, expectedPlan) || report.steps.length !== expectedPlan.steps.length) return invalid('Browser report refers to another plan, version or step set.');
  for (const [index, step] of expectedPlan.steps.entries()) {
    const row = report.steps[index];
    if (row.id !== step.id || row.kind !== step.kind || ['assert', 'wait-for'].includes(step.kind)
      && (row.acceptanceId !== (step as any).acceptanceId || row.expected !== (step as any).expected)) return invalid('Browser report check identity changed.');
    if ((step.kind === 'assert' || step.kind === 'wait-for') && row.outcome === 'passed' && row.actual !== step.expected) return invalid('A passed check contradicts its observed value.');
  }
  const issues: HostIssue[] = [], passedChecks: Diagnostics['passedChecks'] = [];
  const environmentFailed = !report.browser.version || report.cleanup.forced || report.errors.length > 0;
  if (environmentFailed) issues.push(issue(task, path, 'browser/lifecycle', 'insufficient_evidence', 'Browser startup, runtime, deadline or cleanup reported an error.', 'Establish a healthy browser execution before classifying game defects.'));
  for (const [index, row] of report.steps.entries()) {
    const step = expectedPlan.steps[index];
    if (step.kind === 'assert' || step.kind === 'wait-for') {
      if (row.outcome === 'passed' && row.actual === step.expected) passedChecks.push({ acceptanceId: step.acceptanceId, checkId: `browser/${step.id}` });
      else if (row.outcome === 'failed') {
        const observedMismatch = !environmentFailed && row.actual !== step.expected && row.actual !== null;
        const reproduction = expectedPlan.steps.slice(0, index + 1).filter(s => ['mouse-click', 'locator-click'].includes(s.kind)).map(s => JSON.stringify(s));
        issues.push(issue(task, path, `browser/${step.id}`, observedMismatch ? 'code_defect' : 'insufficient_evidence',
          observedMismatch ? `Observed ${JSON.stringify(row.actual)}.` : 'The frozen observation did not produce a reliable matching value.', `Expected ${JSON.stringify(step.expected)}.`, step.acceptanceId,
          [`Open the exact candidate at ${expectedPlan.viewport.width}x${expectedPlan.viewport.height}.`, ...reproduction, `Observe the fixed check ${step.id}.`]));
      }
    } else if (row.outcome === 'failed') issues.push(issue(task, path, `browser/input/${step.id}`, 'insufficient_evidence', 'A normal input step could not be delivered.', 'Diagnose the input or browser failure before code repair.'));
  }
  if (report.outcome === 'passed' && (issues.length || report.steps.some(row => row.outcome !== 'passed'))) return invalid('A passing browser outcome contradicts its check rows.');
  if (report.outcome === 'failed' && !issues.length) issues.push(issue(task, path, 'browser/incomplete', 'insufficient_evidence', 'The browser report failed without a completed failing check.', 'Collect a reproducible host check.'));
  return { reportValid: true, issues, passedChecks };
}

export function diagnosedFailure(task: TaskContract, diagnostic: Diagnostics | undefined): HostFailure | undefined {
  if (!diagnostic?.issues.length) return undefined;
  const report = task.evidence.find(evidence => evidence.evidenceId === `${task.taskId}-host` && evidence.kind === 'test_report' && evidence.outcome === 'failed');
  return new HostFailure(diagnostic.issues, report ? diagnostic.passedChecks.map(check => ({ ...check, evidenceId: report.evidenceId })) : []);
}
