import { isDeepStrictEqual } from 'node:util';
import { DEFAULT_MAX_BYTES, truncateHead } from '@earendil-works/pi-coding-agent';

type ObjectValue = Record<string, any>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const has = (value: ObjectValue, key: string) => Object.hasOwn(value, key);
const present = (value: ObjectValue, key: string) => has(value, key) ? { present: true, value: value[key] } : { present: false };
const checks = (value: ObjectValue) => ['assert', 'wait-for'].includes(value.kind);

export const evidenceReadDescription = ' On selected host evidence, path alone returns a navigation index, not complete observations. Follow every evidenceOffset continuation. Use evidenceDetails with 1..8 advertised keys from this file for exact plan and result values; evidenceOffset pages that ordered selection. Read every failed, skipped, missing, unknown or anomalous row in detail. Numeric offset/limit without evidence fields reads raw source. Evidence fields cannot combine with raw offset, planOffset or artFrames.';

export interface ReviewEvidenceDisplay { lines: string[]; details: Map<string, unknown> }

/** A navigation projection of selected host JSON, never an acceptance or authority check. */
export function reviewEvidenceDisplay(bytes: Buffer, source: string): ReviewEvidenceDisplay | undefined {
  let raw: ObjectValue;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); } catch { return; }
  if (!object(raw)) return;
  const browser = raw.formatVersion === '1.0.0' && raw.kind === 'normal_browser_input';
  const persistent = raw.formatVersion === '1.0.0' && raw.kind === 'persistent_profile_process_reopen';
  const media = object(raw.candidate) && object(raw.media) && typeof raw.scope === 'string'
    && (Array.isArray(raw.checks) || object(raw.coverage) && (object(raw.request) || Array.isArray(raw.requests)));
  if (!browser && !persistent && !media) return;
  if (browser && (!object(raw.plan) || !Array.isArray(raw.plan.steps))
    || persistent && (!object(raw.series) || !Array.isArray(raw.series.segments))) return;
  const lines: string[] = [], details = new Map<string, unknown>();
  const boundedFact = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? 'null') <= 1024 ? value : { omitted: true, detailRequired: true };
  const add = (value: unknown, detailKey?: string, identity?: ObjectValue) => {
    const line = JSON.stringify(value);
    if (Buffer.byteLength(line) <= DEFAULT_MAX_BYTES - 2048) lines.push(line);
    else {
      const key = detailKey ?? (object(value) && typeof value.detailKey === 'string' ? value.detailKey : `section:oversized:${details.size + 1}`);
      if (!details.has(key)) details.set(key, value);
      lines.push(JSON.stringify({ complete: false, reason: 'Index record exceeds the display bound; read exact detail or raw source.', detailKey: key,
        ...(identity ? { identity: Object.fromEntries(Object.entries(identity).map(([name, fact]) => [name, boundedFact(fact)])) } : {}),
        ...(object(value) ? { outcome: boundedFact(present(value, 'outcome')), ...(has(value, 'anomaly') ? { anomaly: boundedFact(value.anomaly), detailRequired: true } : {}),
          ...(has(value, 'detailRequired') ? { detailRequired: value.detailRequired } : {}) } : {}),
        omittedFields: object(value) ? Object.keys(value).filter(name => !['anomaly', 'detailRequired', 'detailKey'].includes(name)) : ['id or other oversized row fields'], rawSource: source }));
    }
  };
  const section = (name: string, value: unknown) => {
    const key = `section:${name}`; details.set(key, value);
    if (Array.isArray(value)) value.forEach((item, i) => details.set(`${key}:${i + 1}`, item));
    return { present: true, count: Array.isArray(value) ? value.length : object(value) ? Object.keys(value).length : null, detailKey: key };
  };
  const sections = (value: ObjectValue, prefix: string, keys: string[]) => Object.fromEntries(keys.map(key => [key,
    has(value, key) ? section(prefix + key, value[key]) : { present: false }]));
  const unknown = (value: ObjectValue, allowed: string[], detailKey: string) => {
    const fields = Object.keys(value).filter(key => !allowed.includes(key));
    if (fields.length) add({ complete: false, unknownFields: fields, detailKey, rawSource: source });
  };
  const anomaly = (detailKey: string, fact: string, value?: unknown) => add({ anomaly: fact, detailKey, ...(value === undefined ? {} : { value }), detailRequired: true });
  add({ source, observationDetailsIncluded: false, omitted: ['plan observations', 'expected', 'actual', 'screenshots', 'full result details'],
    notice: 'Complete navigation is not complete observation review. Read every non-pass, missing, extra, unknown or anomalous row in detail. Other details remain unread until requested.' });

  function nestedFacts(report: ObjectValue, prefix: string) {
    const waits = report.nativeWaits, render = report.renderFrames;
    if (object(waits) && object(waits.cleanup)) {
      const key = `section:${prefix}nativeWaits`;
      if (typeof waits.cleanup.rawPending === 'number' && waits.cleanup.rawPending > 0) anomaly(key, 'cleanup rawPending', waits.cleanup.rawPending);
      if (Array.isArray(waits.cleanup.steps)) for (const [i, step] of waits.cleanup.steps.entries()) {
        if (object(step) && (step.outcome !== 'passed' || step.rawPending === true)) anomaly(key, `cleanup step ${i + 1}`, step);
      }
    }
    if (object(render)) {
      const key = `section:${prefix}renderFrames`;
      if (render.error != null) anomaly(key, 'renderFrames error', render.error);
      for (const side of ['before', 'after']) {
        if (!object(render[side])) anomaly(key, `renderFrames ${side} missing`, present(render, side));
        else if (!Array.isArray(render[side].issues)) anomaly(key, `renderFrames ${side}.issues missing`, present(render[side], 'issues'));
        else for (const issue of render[side].issues) anomaly(key, `renderFrames ${side}.issues`, issue);
      }
    }
  }

  function browserRows(plan: ObjectValue, report: ObjectValue | undefined, ordinal: number, id: unknown) {
    const prefix = `segment${ordinal}-`, planned = Array.isArray(plan.steps) ? plan.steps : [], observed = Array.isArray(report?.steps) ? report.steps : [];
    const used = new Set<number>(), counts = { planned: planned.length, observed: observed.length, passed: 0, failed: 0, skipped: 0, missing: 0, extra: 0, unknown: 0 };
    const acceptanceIds = [...new Set(planned.filter(object).map(step => step.acceptanceId).filter(value => typeof value === 'string'))];
    const metadata = report ? Object.fromEntries(['outcome', 'reportPath', 'startedAt', 'endedAt', 'browser', 'cleanup', 'session', 'savedAtClose', 'errors', 'failureFacts'].map(key => [key, present(report, key)])) : { missing: true };
    const reportKey = `section:${prefix}report`; details.set(reportKey, report ?? null);
    add({ segment: ordinal, id, planIdentity: Object.fromEntries(['projectId', 'taskId', 'runId', 'specVersion', 'reportId', 'artifact', 'viewport'].map(key => [key, present(plan, key)])),
      metadata, acceptanceIds, columns: ['segment', 'ordinal', 'id', 'kind', 'acceptanceIndex', 'outcome', 'detailKey'],
      plan: section(prefix + 'plan', plan), sections: report ? sections(report, prefix, ['files', 'evidence', 'mediaObservations', 'renderFrames', 'nativeWaits']) : {} }, reportKey);
    if (!report) anomaly(reportKey, 'Declared segment has no observed report');
    else {
      if (!Array.isArray(report.steps)) anomaly(reportKey, 'Missing result steps', present(report, 'steps'));
      if (!isDeepStrictEqual(report.plan, plan)) anomaly(reportKey, 'Declared and observed plans differ');
      unknown(report, ['formatVersion', 'kind', 'plan', 'startedAt', 'endedAt', 'outcome', 'browser', 'timeoutMs', 'cleanup', 'steps', 'errors', 'files', 'reportPath', 'evidence', 'failureFacts', 'mediaObservations', 'session', 'savedAtClose', 'nativeWaits', 'renderFrames'], reportKey);
      nestedFacts(report, prefix);
    }
    for (const [i, step] of planned.entries()) {
      const key = `step:${ordinal}:${i + 1}`, actual = observed[i];
      const matched = object(step) && object(actual) && step.id === actual.id && step.kind === actual.kind;
      details.set(key, { planStep: step, results: matched ? [actual] : [], positionalResult: matched ? undefined : present(observed, String(i)) });
      if (matched) used.add(i);
      const outcome = matched ? has(actual, 'outcome') ? actual.outcome : 'unknown' : 'missing';
      if (outcome === 'passed' || outcome === 'failed' || outcome === 'skipped' || outcome === 'missing') counts[outcome as 'passed' | 'failed' | 'skipped' | 'missing']++; else counts.unknown++;
      add([ordinal, i + 1, object(step) ? step.id ?? null : null, object(step) ? step.kind ?? null : null,
        object(step) && typeof step.acceptanceId === 'string' ? acceptanceIds.indexOf(step.acceptanceId) : null, outcome, key], key,
      { segment: ordinal, ordinal: i + 1, id: object(step) ? step.id : null, kind: object(step) ? step.kind : null, outcome });
      if (!matched) anomaly(key, 'Missing or mismatched result');
      if (object(step) && planned.filter((other: unknown) => object(other) && other.id === step.id).length > 1) anomaly(key, 'Duplicate planned step ID', step.id);
      if (matched) {
        if (observed.filter((other: unknown) => object(other) && other.id === actual.id).length > 1) anomaly(key, 'Duplicate observed step ID', actual.id);
        if (!['passed', 'failed', 'skipped'].includes(outcome)) anomaly(key, 'Unknown result outcome', present(actual, 'outcome'));
        if (actual.error != null || actual.failure != null) anomaly(key, 'Result has error/failure', { error: present(actual, 'error'), failure: present(actual, 'failure') });
        const absent = ['expected', 'actual', 'error', 'screenshot'].filter(field => !has(actual, field));
        if (absent.length) anomaly(key, 'Missing result fields', absent);
        if (checks(step) && (!isDeepStrictEqual(step.expected, actual.expected) || step.acceptanceId !== actual.acceptanceId)) anomaly(key, 'Plan/result expected or acceptance identity differs');
        if (checks(step) && (has(actual, 'observation') && (!object(actual.observation) || !Number.isSafeInteger(actual.observation.completed) || actual.observation.completed < 0)
          || outcome === 'passed' && !(actual.observation?.completed > 0))) anomaly(key, 'Missing or invalid observation count', present(actual, 'observation'));
      }
    }
    observed.forEach((result: unknown, i: number) => {
      if (used.has(i)) return; counts.extra++;
      const key = `section:${prefix}extra:${i + 1}`; details.set(key, result);
      add({ extraResult: i + 1, segment: ordinal, id: object(result) ? present(result, 'id') : null,
        outcome: object(result) ? present(result, 'outcome') : null, detailKey: key, detailRequired: true }, key);
    });
    add({ segment: ordinal, counts });
  }

  if (browser) browserRows(raw.plan, raw, 1, raw.plan.reportId);
  else if (persistent) {
    const key = 'section:report'; details.set(key, raw);
    add({ kind: raw.kind, metadata: Object.fromEntries(['reportPath', 'outcome', 'capability', 'deadlineAt', 'startedAt', 'endedAt', 'checkpoint', 'errors', 'failureFacts'].map(k => [k, present(raw, k)])),
      series: section('series', raw.series), binding: present(raw.series, 'binding'), nativeWaits: sections(raw, '', ['nativeWaits']) }, key);
    unknown(raw, ['formatVersion', 'kind', 'capability', 'series', 'deadlineAt', 'startedAt', 'endedAt', 'outcome', 'profileRoot', 'segments', 'checkpoint', 'errors', 'reportPath', 'failureFacts', 'nativeWaits'], key);
    nestedFacts(raw, '');
    const observed = Array.isArray(raw.segments) ? raw.segments : [], used = new Set<number>();
    raw.series.segments.forEach((segment: unknown, i: number) => {
      if (!object(segment) || !object(segment.plan)) { anomaly(key, 'Malformed declared segment', { ordinal: i + 1, segment }); return; }
      const matches: { value: ObjectValue; n: number }[] = observed.flatMap((value: unknown, n: number) => object(value) && value.id === segment.id ? [{ value, n }] : []);
      if (matches.length === 1 && object(matches[0].value.report)) used.add(matches[0].n);
      else anomaly(key, 'Missing or duplicate observed segment', { ordinal: i + 1, id: segment.id, matches: matches.length });
      if (raw.series.segments.filter((other: unknown) => object(other) && other.id === segment.id).length > 1) anomaly(key, 'Duplicate declared segment', segment.id);
      add({ segment: i + 1, id: segment.id, prerequisite: present(segment, 'prerequisite'), declaredLocation: `series.segments[${i}]`, observedLocations: matches.map(({ n }: any) => `segments[${n}]`) });
      browserRows(segment.plan, matches.length === 1 && object(matches[0].value.report) ? matches[0].value.report : undefined, i + 1, segment.id);
    });
    observed.forEach((segment: unknown, i: number) => { if (!used.has(i)) { const detailKey = `section:extra-segment:${i + 1}`; details.set(detailKey, segment); anomaly(detailKey, 'Extra or ambiguous observed segment', { ordinal: i + 1 }); } });
  } else {
    const key = 'section:media'; details.set(key, raw);
    const requests = Array.isArray(raw.requests) ? raw.requests : object(raw.request) ? [{ segmentId: null, request: raw.request }] : [];
    const coverage = object(raw.coverage) && Array.isArray(raw.coverage.checks) ? raw.coverage.checks : [];
    add({ candidate: raw.candidate, media: raw.media, scope: raw.scope,
      coverage: object(raw.coverage) ? { valid: present(raw.coverage, 'valid'), complete: present(raw.coverage, 'complete') } : { present: false },
      sections: sections(raw, '', ['series', 'requests', 'request', 'coverage', 'checks']),
      columns: ['ordinal', 'id', 'path', 'kind', 'mediaId', 'state', 'outcome', 'detailKey'] });
    unknown(raw, ['candidate', 'media', 'scope', 'series', 'requests', 'request', 'coverage', 'checks'], key);
    if (has(raw, 'coverage') && (!object(raw.coverage) || !Array.isArray(raw.coverage.checks))) anomaly(key, 'Missing or malformed coverage checks');
    if (Array.isArray(raw.checks)) raw.checks.forEach((check: unknown, i: number) => {
      const detailKey = `section:checks:${i + 1}`;
      add({ normalCheck: object(check) ? { ordinal: i + 1, stepId: check.stepId ?? null, kind: check.kind ?? null, mediaId: check.mediaId ?? null, state: present(check, 'state'),
        outcome: object(check.result) ? check.result.outcome ?? 'unknown' : 'missing' } : { ordinal: i + 1, outcome: 'unknown' }, detailKey,
        detailRequired: !object(check) || !object(check.result) || check.result.outcome !== 'passed' || check.result.error != null || check.result.failure != null });
    });
    const fields: { segmentId: unknown; field: ObjectValue; index: number }[] = [];
    requests.forEach((r: unknown, i: number) => {
      if (!object(r) || !object(r.request) || !Array.isArray(r.request.fields)) { anomaly(key, 'Missing request fields', { request: i + 1 }); return; }
      r.request.fields.forEach((field: unknown, index: number) => { if (object(field)) fields.push({ segmentId: r.segmentId, field, index }); else anomaly(key, 'Malformed request field', { request: i + 1, index }); });
    });
    coverage.forEach((check: unknown, i: number) => {
      const detailKey = `coverage:${i + 1}`, matching = object(check) ? fields.filter(row => row.field.id === check.id) : [];
      details.set(detailKey, { check, requests: matching });
      if (!object(check)) { anomaly(detailKey, 'Malformed coverage check'); return; }
      add([i + 1, check.id ?? null, check.path ?? null, check.kind ?? null, check.mediaId ?? null, check.state ?? null,
        has(check, 'outcome') ? check.outcome : 'not_recorded', detailKey], detailKey,
      { ordinal: i + 1, id: check.id, kind: check.kind, outcome: has(check, 'outcome') ? check.outcome : 'not_recorded' });
      if (coverage.filter((other: unknown) => object(other) && other.id === check.id).length !== 1) anomaly(detailKey, 'Duplicate coverage ID', check.id);
      if (!has(check, 'expected') || !has(check, 'actual') || !isDeepStrictEqual(check.expected, check.actual)) anomaly(detailKey, 'Coverage expected/actual missing or different');
      if (check.error != null || has(check, 'result') && (!object(check.result) || check.result.outcome !== 'passed')) anomaly(detailKey, 'Coverage error or non-pass result');
      if (requests.length && !matching.length) anomaly(detailKey, 'Extra coverage without a declared field');
      if (requests.length && (!Array.isArray(check.observations) || !check.observations.length || !Array.isArray(check.witnesses) || !check.witnesses.length)) anomaly(detailKey, 'Missing coverage observations/witnesses');
      for (const collection of ['observations', 'witnesses']) if (Array.isArray(check[collection])) for (const ref of check[collection]) {
        if (!object(ref) || typeof ref.reportPath !== 'string' || !ref.reportPath) anomaly(detailKey, 'Missing coverage reference', { collection, ref });
        else if (requests.some((r: unknown) => object(r) && r.segmentId != null) && !requests.some((r: unknown) => object(r) && r.segmentId === ref.segmentId)) anomaly(detailKey, 'Coverage references unknown segment', { collection, ref });
      }
      for (const row of matching) if (!isDeepStrictEqual(row.field.path, check.path) || !isDeepStrictEqual(row.field.expected, check.expected)) anomaly(detailKey, 'Request and coverage identity/expected differs');
    });
    fields.forEach(row => {
      const matches = coverage.filter((check: unknown) => object(check) && check.id === row.field.id);
      if (!matches.length || fields.filter(other => other.segmentId === row.segmentId && other.field.id === row.field.id).length > 1) {
        const detailKey = `section:request-field:${fields.indexOf(row) + 1}`; details.set(detailKey, row); anomaly(detailKey, !matches.length ? 'Missing coverage for request field' : 'Duplicate declared request field', { segmentId: row.segmentId, id: row.field.id });
      }
    });
    add({ counts: { requests: requests.length, declaredFields: fields.length, coverageChecks: coverage.length } });
  }
  return { lines, details };
}

/** Keeps native byte/line bounds while making every page's coverage explicit. */
export function evidenceReadPage(display: ReviewEvidenceDisplay, source: string, keys: string[] | undefined, offset: number, limit?: number): Buffer {
  if (keys && (!Array.isArray(keys) || !keys.length || keys.length > 8 || new Set(keys).size !== keys.length || keys.some(key => typeof key !== 'string' || !display.details.has(key)))) throw new Error('Evidence detail batch requires 1..8 unique advertised keys from this file.');
  const lines = keys ? keys.flatMap(key => {
    const item = { key, value: display.details.get(key) }, compact = JSON.stringify(item);
    return Buffer.byteLength(compact) <= DEFAULT_MAX_BYTES - 2048 ? [compact] : JSON.stringify(item, null, 2).split('\n');
  }) : display.lines;
  const selected = lines.slice(offset - 1, limit === undefined ? undefined : offset - 1 + limit);
  const truncated = truncateHead(selected.join('\n'), { maxBytes: DEFAULT_MAX_BYTES - 2048, maxLines: 1998 });
  const returned = selected.length ? truncated.firstLineExceedsLimit ? 0 : truncated.outputLines : 0;
  const more = offset - 1 + returned < lines.length;
  const header = { source, view: keys ? 'details' : 'index', ...(keys ? { evidenceDetails: keys } : {}), totalLines: lines.length,
    from: offset, to: returned ? offset + returned - 1 : null, complete: !more && offset <= lines.length, more, outOfRange: offset > lines.length,
    nextOffset: more && returned ? offset + returned : null, ...(truncated.firstLineExceedsLimit ? { error: 'Detail line exceeds the SDK limit; use raw source. Evidence remains incomplete.' } : {}) };
  const page = JSON.stringify(header) + (returned ? '\n' + truncated.content : '');
  if (Buffer.byteLength(page) > DEFAULT_MAX_BYTES) throw new Error('Evidence page metadata exceeds the SDK byte bound; use raw source.');
  return Buffer.from(page, 'utf8');
}
