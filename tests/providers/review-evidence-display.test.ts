import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createWorkspaceTools } from '../../src/providers/workspace-tools.ts';

export function browserReport() {
  const step = { id: '中文-check', kind: 'assert', acceptanceId: 'AC', observation: { kind: 'text', selector: '#status' }, expected: '中文', timeoutMs: 100 };
  return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: { projectId: 'p', taskId: 't', runId: 'r', specVersion: 'v1', reportId: 'main',
    artifact: { artifactId: 'game', version: 'v1', location: 'candidate' }, viewport: { width: 100, height: 100 }, steps: [step] },
    outcome: 'passed', reportPath: 'p/main/report.json', errors: [], failureFacts: { formatVersion: 1, termination: null, errors: [] },
    cleanup: { browserPid: 1, forced: false, processExited: true }, files: [], evidence: [],
    steps: [{ id: step.id, kind: step.kind, acceptanceId: 'AC', outcome: 'passed', expected: '中文', actual: '中文', error: null,
      screenshot: 'p/main/001.png', observation: { completed: 1 } }] };
}

async function fixture(t: TestContext, report: unknown = browserReport()) {
  const root = await mkdtemp(join(tmpdir(), 'cos231-read-'));
  t.after(async () => { assert.ok(root.startsWith(join(tmpdir(), 'cos231-read-'))); await rm(root, { recursive: true, force: true }); });
  const bytes = JSON.stringify(report, null, 2) + '\n'; await writeFile(join(root, 'report.json'), bytes, 'utf8');
  const options = { workspace: root, readPaths: ['report.json'], writePaths: [] };
  const [raw] = await createWorkspaceTools(options), [selected] = await createWorkspaceTools({ ...options, reviewEvidencePaths: ['report.json'] });
  const read = async (args: Record<string, unknown> = {}) => selected.execute('selected', { path: 'report.json', ...args } as never, undefined, undefined, undefined as never);
  return { root, bytes, raw, selected, read };
}

function text(result: any): string { return result.content.map((c: any) => c.text ?? '').join('\n'); }
function rows(result: any): any[] { return text(result).split('\n').filter(Boolean).map(line => JSON.parse(line)); }

test('COS231 actual read enumerates results and exact plan/result without altering raw Chinese evidence', async t => {
  const f = await fixture(t), response = await f.read();
  assert.match(text(response), /"view":"index"/, 'Selected evidence must expose a navigation index instead of raw plan-first JSON.');
  const index = rows(response);
  assert.equal(index[0].view, 'index');
  assert.equal(index[0].complete, true);
  assert.ok(index.some(row => row.observationDetailsIncluded === false));
  assert.ok(index.some(row => Array.isArray(row) && row.includes('中文-check') && row.includes('step:1:1')));
  const detail = rows(await f.read({ evidenceDetails: ['step:1:1'] }));
  assert.deepEqual(detail[1].value.planStep, browserReport().plan.steps[0]);
  assert.deepEqual(detail[1].value.results, [browserReport().steps[0]]);
  assert.equal(await readFile(join(f.root, 'report.json'), 'utf8'), f.bytes);
  assert.deepEqual(await f.read({ offset: 2, limit: 8 }), await f.raw.execute('raw', { path: 'report.json', offset: 2, limit: 8 }, undefined, undefined, undefined as never));
});

test('COS231 read rejects invalid and partly unknown detail batches atomically', async t => {
  const f = await fixture(t);
  for (const evidenceDetails of [[], Array(9).fill('step:1:1'), ['step:1:1', 'step:1:1'], ['step:1:1', 'step:2:1']])
    await assert.rejects(f.read({ evidenceDetails }), /detail|batch/i);
  for (const args of [{ evidenceOffset: 0 }, { evidenceOffset: 1.5 }, { evidenceDetails: ['step:1:1'], offset: 1 },
    { evidenceOffset: 1, planOffset: 1 }, { evidenceOffset: 1, artFrames: [] }]) await assert.rejects(f.read(args), /evidence|combine/i);
});

test('COS231 navigation preserves all failed/skipped/missing/unknown/duplicate and extra steps', async t => {
  const report: any = browserReport(), step = report.plan.steps[0], result = report.steps[0];
  report.plan.steps = Array.from({ length: 5 }, (_, i) => ({ ...step, id: 's' + i }));
  report.steps = [
    { ...result, id: 's0', outcome: 'failed', expected: false, actual: 0, error: '中文错误', failure: 'mismatch' },
    { ...result, id: 's1', outcome: 'skipped', actual: null }, { ...result, id: 's2', outcome: 'not_known' },
    { ...result, id: 'extra' }, { ...result, id: 's0' }];
  const f = await fixture(t, report), all = rows(await f.read());
  const counts = all.find(r => r.counts)?.counts;
  assert.deepEqual(counts, { planned: 5, observed: 5, passed: 0, failed: 1, skipped: 1, missing: 2, extra: 2, unknown: 1 });
  assert.ok(all.some(r => r.anomaly === 'Duplicate observed step ID'));
  const detail = rows(await f.read({ evidenceDetails: ['step:1:2', 'step:1:1'] }));
  assert.deepEqual(detail.slice(1).map(r => r.key), ['step:1:2', 'step:1:1']);
  assert.equal(detail[2].value.results[0].actual, 0); assert.equal(detail[2].value.results[0].expected, false);
  assert.equal(detail[2].value.results[0].error, '中文错误');
});

test('COS231 parent retains missing reopen and nested negative facts under a passed outcome', async t => {
  const main: any = browserReport();
  main.nativeWaits = { cleanup: { rawPending: 1, steps: [{ step: 'raw_settle', outcome: 'pending', rawPending: true }] } };
  main.renderFrames = { error: '渲染错误', before: { issues: ['before issue'] }, after: { issues: ['after issue'] } };
  const parent = { formatVersion: '1.0.0', kind: 'persistent_profile_process_reopen', outcome: 'passed',
    series: { segments: [{ id: 'save', plan: main.plan }, { id: 'resume', plan: main.plan }] }, segments: [{ id: 'save', report: main }],
    checkpoint: { outcome: 'skipped', actual: null }, errors: [] };
  const f = await fixture(t, parent), all = rows(await f.read());
  assert.ok(all.some(r => r.anomaly === 'cleanup rawPending' && r.value === 1));
  assert.ok(all.some(r => r.anomaly === 'cleanup step 1' && r.value.rawPending === true));
  assert.ok(all.some(r => r.anomaly === 'renderFrames error' && r.value === '渲染错误'));
  assert.ok(all.some(r => r.anomaly === 'renderFrames before.issues'));
  assert.ok(all.some(r => r.segment === 2 && r.counts?.missing === 1));
  const detail = rows(await f.read({ evidenceDetails: ['step:2:1'] }));
  assert.deepEqual(detail[1].value.results, []); assert.deepEqual(detail[1].value.planStep, main.plan.steps[0]);
});

test('COS231 honest pages cover 398 rows and batch size eight without losing identity', async t => {
  const report: any = browserReport(), step = report.plan.steps[0], result = report.steps[0];
  report.plan.steps = Array.from({ length: 398 }, (_, i) => ({ ...step, id: 's' + i }));
  report.steps = report.plan.steps.map((s: any) => ({ ...result, id: s.id }));
  const f = await fixture(t, report), collected: any[] = []; let offset = 1, pages = 0;
  do { const page = await f.read({ evidenceOffset: offset, limit: 23 }), parsed = rows(page), header = parsed.shift();
    assert.ok(Buffer.byteLength(text(page)) <= 51200); assert.equal(header.from, offset); collected.push(...parsed); pages++;
    if (!header.more) { assert.equal(header.complete, true); break; } assert.ok(header.nextOffset > offset); offset = header.nextOffset;
  } while (pages < 100);
  assert.equal(collected.filter(Array.isArray).length, 398); assert.ok(pages > 1);
  const end = rows(await f.read({ evidenceOffset: 10000 }))[0]; assert.equal(end.to, null); assert.equal(end.more, false);
  const detail = rows(await f.read({ evidenceDetails: Array.from({ length: 8 }, (_, i) => `step:1:${i + 1}`) }));
  assert.equal(detail.length, 9);
});

test('COS231 media request fields, values and missing witnesses stay exact', async t => {
  const field = { id: 'c1', path: ['media', 'audio', '0'], expected: false };
  const media = { candidate: { artifactId: 'game' }, media: { artifactId: 'media' }, scope: 'observation only',
    requests: [{ segmentId: 'save', request: { fields: [field, { ...field, id: 'absent' }] } }],
    coverage: { valid: false, complete: false, checks: [{ ...field, actual: 0, kind: 'audio', mediaId: '音乐', observations: [], witnesses: [] }] } };
  const f = await fixture(t, media), all = rows(await f.read());
  assert.ok(all.some(r => r.anomaly === 'Missing coverage for request field'));
  assert.ok(all.some(r => r.anomaly === 'Missing coverage observations/witnesses'));
  const detail = rows(await f.read({ evidenceDetails: ['coverage:1'] }))[1].value;
  assert.deepEqual(detail.requests[0].field, field); assert.equal(detail.check.actual, 0); assert.equal(detail.check.expected, false);
});

test('COS231 raw/unsupported/UTF-8 fallback, cancellation and original path guards', async t => {
  const f = await fixture(t);
  for (const bytes of [Buffer.from('plain 中文'), Buffer.from('{"x":1}'), Buffer.from('\ufeff{}'), Buffer.from([0xff])]) {
    await writeFile(join(f.root, 'report.json'), bytes);
    assert.match(text(await f.read()), /Evidence index unavailable/);
    await assert.rejects(f.read({ evidenceOffset: 1 }), /unavailable/);
    assert.deepEqual(await f.read({ offset: 1 }), await f.raw.execute('raw', { path: 'report.json', offset: 1 }, undefined, undefined, undefined as never));
  }
  await writeFile(join(f.root, 'outside.json'), f.bytes, 'utf8');
  await assert.rejects(f.read({ path: 'outside.json', evidenceOffset: 1 }), /outside allowed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.selected.execute('cancel', { path: 'report.json' }, controller.signal, undefined, undefined as never), { name: 'AbortError' });
  await rm(join(f.root, 'report.json'));
  try { await symlink(join(f.root, 'outside.json'), join(f.root, 'report.json'), 'file'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.diagnostic('File symlink unavailable; original directory-junction guards covered separately.'); return; } throw error; }
  await assert.rejects(f.read(), /Symlink/);
});

test('COS231 large exact detail is paged honestly, not dropped or silently complete', async t => {
  const report: any = browserReport();
  report.plan.steps[0].observation = { kind: 'pixel-pattern', rows: Array.from({ length: 3000 }, (_, i) => '中'.repeat(12) + i) };
  const f = await fixture(t, report), fragments: string[] = []; let offset = 1;
  for (let i = 0; i < 30; i++) {
    const page = text(await f.read({ evidenceDetails: ['step:1:1'], evidenceOffset: offset }));
    assert.ok(Buffer.byteLength(page) <= 51200); const [first, ...body] = page.split('\n'), header = JSON.parse(first);
    fragments.push(...body); if (!header.more) break; assert.ok(header.nextOffset > offset); offset = header.nextOffset;
  }
  const detail = JSON.parse(fragments.join('\n'));
  assert.deepEqual(detail.value.planStep, report.plan.steps[0]);
  report.plan.steps[0].observation = { kind: 'text', selector: 'x'.repeat(60000) };
  await writeFile(join(f.root, 'report.json'), JSON.stringify(report), 'utf8');
  let page = JSON.parse(text(await f.read({ evidenceDetails: ['step:1:1'], evidenceOffset: 9 })).split('\n')[0]);
  // The actual oversized scalar may start on another line; its page never claims completion.
  if (!page.error) { const full = JSON.stringify({ key: 'step:1:1', value: { planStep: report.plan.steps[0], results: report.steps } }, null, 2).split('\n');
    const line = full.findIndex(s => Buffer.byteLength(s) > 51200) + 1;
    page = JSON.parse(text(await f.read({ evidenceDetails: ['step:1:1'], evidenceOffset: line })).split('\n')[0]); }
  assert.equal(page.complete, false); assert.match(page.error, /exceeds/);
});

test('COS231 normal media checks and foreign witness references are visible', async t => {
  const check = { id: 'c1', path: ['media', 'audio', '0'], expected: true, actual: true, kind: 'audio', mediaId: 'm',
    observations: [{ segmentId: 'foreign', reportPath: 'outside/report.json', value: true }], witnesses: [{ segmentId: 'foreign', reportPath: 'outside/report.json' }] };
  const media = { candidate: {}, media: {}, scope: 'test', requests: [{ segmentId: 'save', request: { fields: [{ id: 'c1', path: check.path, expected: true }] } }],
    coverage: { valid: true, complete: true, checks: [check] }, checks: [{ stepId: 'browser-media-1', kind: 'audio', mediaId: 'm', result: { outcome: 'failed', error: 'real failure' } }] };
  const f = await fixture(t, media), all = rows(await f.read());
  assert.ok(all.some(r => r.anomaly === 'Coverage references unknown segment'));
  assert.ok(all.some(r => r.normalCheck?.stepId === 'browser-media-1' && r.normalCheck.outcome === 'failed' && r.detailRequired));
});

test('COS231 oversized navigation retains stable identity, failure and mandatory anomaly detail', async t => {
  const report: any = browserReport(); report.plan.steps[0].id = 'x'.repeat(60000);
  report.steps[0] = { ...report.steps[0], id: report.plan.steps[0].id, outcome: 'failed', error: '错'.repeat(25000) };
  const f = await fixture(t, report), all = rows(await f.read());
  assert.ok(all.some(r => r.complete === false && r.identity?.segment === 1 && r.identity?.ordinal === 1 && r.identity?.outcome === 'failed' && r.detailKey === 'step:1:1'));
  assert.ok(all.some(r => r.anomaly === 'Result has error/failure' && r.detailRequired === true && r.detailKey === 'step:1:1'));
  assert.equal(await readFile(join(f.root, 'report.json'), 'utf8'), f.bytes);
});
