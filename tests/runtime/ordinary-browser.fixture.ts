import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TestContext } from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { executePersistentSeries } from '../../src/acceptance/persistent.ts';

/** Fake browser transport only; the production normal/persistent verifiers consume these explicit synthetic records. */
export async function ordinaryBrowserReport(root: string, plan: any, request?: any, session?: any) {
  const folder = [plan.projectId, plan.artifact.artifactId, plan.artifact.version, plan.runId, plan.reportId].join('/'), startedAt = new Date().toISOString();
  await mkdir(join(root, folder), { recursive: true });
  for (const file of ['final.png', 'browser.webm', 'browser.log']) await writeFile(join(root, folder, file), file.endsWith('.png')
    ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64') : 'Synthetic transport evidence');
  const endedAt = new Date().toISOString();
  const report: any = { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: structuredClone(plan), startedAt, endedAt, outcome: 'passed',
    browser: { name: 'chromium', channel: 'msedge', version: 'synthetic-browser', headless: true, viewport: plan.viewport }, timeoutMs: 10000,
    cleanup: { browserPid: session?.browserPid ?? 3999, forced: false, processExited: true }, ...(session ? { session } : {}),
    steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}), outcome: 'passed',
      expected: 'expected' in step ? step.expected : 'input delivered', actual: 'expected' in step ? step.expected : 'input delivered', error: null,
      screenshot: `${folder}/final.png`, ...('expected' in step ? { observation: { completed: 1 } } : {}) })), errors: [],
    files: ['plan.json', 'final.png', 'browser.webm', 'browser.log', 'report.json'].map(name => `${folder}/${name}`), reportPath: `${folder}/report.json`, evidence: [],
    failureFacts: { formatVersion: 1, termination: null, errors: [] },
    ...(request ? { mediaObservations: { request: structuredClone(request), recordedAt: endedAt, values: request.fields.map((field: any) => field.expected) } } : {}) };
  await writeFile(join(root, folder, 'plan.json'), JSON.stringify(plan), 'utf8');
  await writeFile(join(root, report.reportPath), JSON.stringify(report), 'utf8'); return report;
}
export async function ordinaryPersistentReport(series: any, options: any) {
  let index = 0;
  return executePersistentSeries(series, options, async (plan, lifecycle) => {
    const current = index++, pid = 3000 + current;
    return ordinaryBrowserReport(options.evidenceRoot, plan, options.segmentMediaObservations[current].request,
      { browserPid: pid, profile: lifecycle.profile, commandLineProfile: lifecycle.profile, origin: new URL(plan.url).origin,
        closeEvent: true, exitConfirmed: true, exitCode: 0, signalCode: null });
  });
}

export async function ordinaryClassicSource(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos112-reference-')); t.after(() => removeOwned(tmpdir(), root));
  for (const file of ['reference.json', 'catalog.json']) await cp(new URL(`../../benchmarks/classic-pc/reference/${file}`, import.meta.url), join(root, file));
  const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
  for (const row of catalog.entries) row.evidenceRefs = [];
  const entity = catalog.entries.find((row: any) => row.category === 'plants'); entity.label = 'Synthetic fixture'; entity.referenceName = null; delete entity.referenceBinding;
  catalog.measurements = [{ id: 'synthetic-cost', entryId: 'VALUE-PLANTS', entityId: entity.id, status: 'verified_for_reference', value: 7,
    unit: 'fixture coins', metric: 'synthetic cost', method: 'Synthetic SOURCE only', tolerance: 'exact', evidenceRefs: ['fixture-input', 'fixture-rule'] }];
  catalog.evidence = ['normal_input', 'deterministic_rule'].map((kind, index) => ({ id: index ? 'fixture-rule' : 'fixture-input', kind, referenceId: catalog.referenceId,
    status: 'pass', entryIds: ['VALUE-PLANTS', entity.id], path: `evidence/synthetic-${index}.txt`, observedAt: '2026-10-17T00:00:00Z',
    preconditions: 'Synthetic SOURCE fixture', steps: 'Normal fixture input', expected: '7', observed: '7' }));
  await mkdir(join(root, 'evidence'));
  for (const record of catalog.evidence) await writeFile(join(root, record.path), 'Synthetic reference evidence; no reference game observation.\n', 'utf8');
  await writeFile(join(root, 'catalog.json'), JSON.stringify(catalog), 'utf8'); return root;
}
