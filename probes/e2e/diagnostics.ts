import { isDeepStrictEqual } from 'node:util';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import type { HostIssue, HostPassedCheck } from '../../src/runtime/repair/feedback.ts';
import type { buildProject } from './host.ts';
import { completedObservation, deliveredInputs, isProjectException } from '../../src/acceptance/failure-facts.ts';

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

function validBrowserFailureFacts(report: AcceptanceReport, plan: AcceptancePlan): boolean {
  const facts = report.failureFacts;
  if (!facts || facts.formatVersion !== 1 || !Array.isArray(facts.errors) || facts.errors.length !== report.errors.length
    || report.cleanup.processExited !== true || report.steps.some(row => !['assert', 'wait-for'].includes(row.kind) && row.outcome === 'failed')) return false;
  const stopped = facts.termination?.kind === 'observation_budget' || facts.termination?.kind === 'project_mismatch' ? facts.termination : null;
  const local = stopped?.kind === 'observation_budget' ? stopped : null;
  if (facts.termination !== null && !stopped || report.cleanup.forced !== !!local) return false;
  const stopIndex = stopped && 'stepId' in stopped ? plan.steps.findIndex(step => step.id === stopped.stepId && ['assert', 'wait-for'].includes(step.kind)) : -1;
  if (stopped && (stopIndex < 0 || report.steps[stopIndex].outcome !== 'failed' || report.steps[stopIndex].failure !== (local ? 'observation_budget' : 'mismatch')
    || report.steps[stopIndex].actual === null || report.steps[stopIndex].actual === report.steps[stopIndex].expected || !completedObservation(report.steps[stopIndex])
    || !deliveredInputs(report, plan, stopIndex) || report.steps.slice(0, stopIndex).some(row => row.outcome === 'skipped')
    || report.steps.slice(stopIndex + 1).some(row => row.outcome !== 'skipped'))) return false;
  if (!stopped && report.steps.some(row => row.outcome === 'skipped')) return false;
  let projectExceptions = 0, localBudgets = 0, terminationEvidence = 0;
  const exceptionIds = new Set<number>();
  for (const [index, fact] of facts.errors.entries()) {
    if (!fact || fact.errorIndex !== index || fact.error !== report.errors[index]) return false;
    if (fact.kind === 'page_exception') {
      const source = fact.exception;
      if (!isProjectException(source, plan.url) || exceptionIds.has(source.exceptionId)) return false;
      exceptionIds.add(source.exceptionId);
      projectExceptions++;
    } else if (fact.kind === 'observation_budget' && local && fact.stepId === local.stepId) localBudgets++;
    else if (fact.kind === 'termination_evidence' && local && fact.stepId === local.stepId) terminationEvidence++;
    else return false;
  }
  return (projectExceptions > 0 || !stopped && facts.errors.length === 0) && localBudgets === (local ? 1 : 0) && terminationEvidence <= (local ? 1 : 0);
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
  const environmentFailed = !report.browser.version || report.cleanup.processExited === false
    || (report.failureFacts !== undefined ? !validBrowserFailureFacts(report, expectedPlan) : report.cleanup.forced || report.errors.length > 0);
  if (environmentFailed) issues.push(issue(task, path, 'browser/lifecycle', 'insufficient_evidence', 'Browser startup, runtime, deadline or cleanup reported an error.', 'Establish a healthy browser execution before classifying game defects.'));
  for (const [index, row] of report.steps.entries()) {
    const step = expectedPlan.steps[index];
    if (step.kind === 'assert' || step.kind === 'wait-for') {
      if (row.outcome === 'passed' && row.actual === step.expected) passedChecks.push({ acceptanceId: step.acceptanceId, checkId: `browser/${step.id}` });
      else if (row.outcome === 'failed') {
        const observedMismatch = !environmentFailed && row.actual !== step.expected && row.actual !== null
          && (!report.failureFacts || (row.failure === 'mismatch' || row.failure === 'observation_budget') && completedObservation(row))
          && (!report.errors.length || deliveredInputs(report, expectedPlan, index));
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
