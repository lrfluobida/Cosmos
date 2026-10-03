import type { AcceptanceReport, BrowserFailureFacts } from './runner.ts';
import type { AcceptancePlan } from './plan.ts';

export interface RuntimeException {
  exceptionId: number; url?: string; lineNumber: number; columnNumber: number;
  exception?: { description?: string };
  stackTrace?: { callFrames: { url: string; lineNumber: number; columnNumber: number }[] };
}
export interface PageError { errorIndex: number; name: string; message: string }
type Source = NonNullable<BrowserFailureFacts['errors'][number]['exception']>;

export function isProjectException(source: Source | undefined, projectURL: string): source is Source {
  if (!source || !Number.isSafeInteger(source.exceptionId) || source.exceptionId < 0 || !Number.isSafeInteger(source.line) || source.line < 0
    || !Number.isSafeInteger(source.column) || source.column < 0) return false;
  try {
    const url = new URL(source.sourceURL), project = new URL(projectURL);
    return url.origin === project.origin && !url.username && !url.password && !/(?:^|\/)(?:node_modules|@[^/]*)(?:\/|$)/.test(url.pathname)
      && (url.pathname === project.pathname || /\.(?:[cm]?js|tsx?|html)$/.test(url.pathname));
  } catch { return false; }
}

/** Pair independent browser events uniquely; Error.stack never establishes source ownership. */
export function attributePageErrors(facts: BrowserFailureFacts, pageErrors: PageError[], exceptions: RuntimeException[]): void {
  for (const pageError of pageErrors) {
    const fact = facts.errors[pageError.errorIndex];
    fact.kind = 'unknown'; delete fact.exception;
    const matches = (detail: RuntimeException, item = pageError) => detail.exception?.description === `${item.name}: ${item.message}`
      || detail.exception?.description?.startsWith(`${item.name}: ${item.message}\n`);
    const candidates = exceptions.filter(detail => matches(detail));
    if (candidates.length !== 1 || pageErrors.filter(item => matches(candidates[0], item)).length !== 1) continue;
    const detail = candidates[0], frame = detail.stackTrace?.callFrames[0], sourceURL = detail.url || frame?.url;
    if (!sourceURL) continue;
    Object.assign(fact, { kind: 'page_exception', exception: { exceptionId: detail.exceptionId, sourceURL,
      line: detail.url ? detail.lineNumber : frame!.lineNumber, column: detail.url ? detail.columnNumber : frame!.columnNumber } });
  }
}

export const completedObservation = (row: AcceptanceReport['steps'][number]) => Number.isSafeInteger(row.observation?.completed) && (row.observation?.completed ?? 0) > 0;

export function deliveredInputs(report: AcceptanceReport, plan: AcceptancePlan, index: number): boolean {
  const inputs = plan.steps.slice(0, index).map((step, at) => ({ step, row: report.steps[at] })).filter(({ step }) => !['assert', 'wait-for'].includes(step.kind));
  return inputs.some(({ step }) => ['mouse-click', 'locator-click'].includes(step.kind))
    && inputs.every(({ row }) => row.outcome === 'passed' && row.actual === 'input delivered');
}

/** A settled mismatch can stop safely before later probes consume the run deadline. */
export function projectMismatchCanStop(report: AcceptanceReport, index: number): boolean {
  const row = report.steps[index], facts = report.failureFacts;
  if (!row || !['assert', 'wait-for'].includes(row.kind) || row.outcome !== 'failed' || row.failure !== 'mismatch' || row.actual === null
    || row.actual === row.expected || !completedObservation(row) || !deliveredInputs(report, report.plan, index)
    || report.steps.slice(0, index).some(prior => prior.outcome === 'skipped') || !facts || facts.formatVersion !== 1 || facts.termination !== null
    || !Array.isArray(facts.errors) || !facts.errors.length || facts.errors.length !== report.errors.length) return false;
  const ids = new Set<number>();
  return facts.errors.every((fact, at) => {
    if (fact.errorIndex !== at || fact.error !== report.errors[at] || fact.kind !== 'page_exception'
      || !isProjectException(fact.exception, report.plan.url) || ids.has(fact.exception.exceptionId)) return false;
    ids.add(fact.exception.exceptionId); return true;
  });
}
