import { lstat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, inflateSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/types.ts';
import type { ArtifactRegistry } from '../artifacts/index.ts';
import { directory, regularFile, safePath, snapshot } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import type { BrowserGameDraft, OrdinaryGameDraft, BrowserScenario } from '../roles/requirements.ts';
import { gameplayAcceptance } from '../roles/requirements.ts';
import type { AcceptancePlan } from '../acceptance/plan.ts';
import type { AcceptanceReport } from '../acceptance/runner.ts';
import { completedObservation, deliveredInputs } from '../acceptance/failure-facts.ts';
import { diagnoseBrowser } from './repair/browser-diagnostics.ts';
import type { Diagnostics } from './repair/browser-diagnostics.ts';
import { createClassicEntryPlan, requireClassicEntrySelection, validateClassicEntryPlan } from './classic-entry-input.ts';
import { publishReceipt } from './recovery/receipt-file.ts';

const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const SIDECAR = '_cosmos/classic-entry-plan.json';
interface Execution { plan: AcceptancePlan; current(): Promise<void> }

/** Validate actual PNG chunks and decoded scanlines, not merely its eight-byte magic. */
function requirePng(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Classic assertion screenshot is not PNG.');
  let offset = 8, width = 0, height = 0, rowBytes = 0, ended = false; const data: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('Classic PNG chunk is corrupt.');
    const kind = bytes.toString('ascii', offset + 4, offset + 8), payload = bytes.subarray(offset + 8, end - 4);
    if (offset === 8) {
      if (kind !== 'IHDR' || size !== 13) throw new Error('Classic PNG header is missing.');
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[payload[9]], depth = payload[8];
      if (!width || width > 4096 || !height || height > 4096 || !channels || ![1, 2, 4, 8, 16].includes(depth)
        || [2, 4, 6].includes(payload[9]) && depth < 8 || payload[9] === 3 && depth === 16
        || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) throw new Error('Unsupported classic PNG header.');
      rowBytes = Math.ceil(width * channels * depth / 8) + 1;
    } else if (kind === 'IHDR') throw new Error('Duplicate classic PNG header.');
    if (kind === 'IDAT') data.push(payload);
    offset = end;
    if (kind === 'IEND') { if (size !== 0 || offset !== bytes.length) throw new Error('Invalid classic PNG ending.'); ended = true; break; }
  }
  if (!ended || !data.length) throw new Error('Incomplete classic PNG.');
  const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: rowBytes * height });
  if (decoded.length !== rowBytes * height) throw new Error('Classic PNG scanlines are incomplete.');
  for (let y = 0; y < height; y++) if (decoded[y * rowBytes] > 4) throw new Error('Invalid classic PNG scanline.');
}

export async function createClassicEntryScope(input: { root: string; registry: ArtifactRegistry; requirement: RequirementContract;
  draft: BrowserGameDraft | OrdinaryGameDraft; requirementCapture: ArtifactReference; referenceRefs: ArtifactReference[]; sourceRoot?: string; resume: boolean;
  scenario?(design: ArtifactReference): Promise<BrowserScenario> }) {
  const { root, registry, requirement, requirementCapture, referenceRefs } = input, draft = structuredClone(input.draft), selection = draft.classicEntry!;
  const source = await requireClassicEntrySelection(selection, input.sourceRoot), refs: ArtifactReference[] = [];
  const gameplayIds = gameplayAcceptance(draft).map(row => row.acceptanceId);
  const viewportFor = async (design: ArtifactReference) => draft.ordinaryProfile ? (await input.scenario!(design)).viewport : draft.scenario.viewport;
  if (selection.measurement) {
    const ref = registry.artifactRef('classic-entry-reference-evidence', 'v1'), folder = 'host-classic-entry-reference';
    if (!input.resume) {
      for (const [path, bytes] of source.files) { const target = await directory(root, `${folder}/${path.slice(0, path.lastIndexOf('/'))}`); await writeFile(join(target, path.split('/').at(-1)!), bytes, { flag: 'wx' }); }
      await registry.registerCapture({ taskId: 'host-classic-entry', artifactRef: ref, sourceRoot: folder,
        files: [...source.files.keys()].map(path => ({ source: path, destination: `_cosmos/classic/${path}` })), dependencies: [...referenceRefs, requirementCapture],
        ownership: { writePaths: ['_cosmos/classic/evidence'], readOnlyPaths: [] }, metadata: { kind: 'data',
          provenance: { kind: 'original-procedural', generator: 'Cosmos fixed classic reference evidence capture', sourceRefs: requirement.sources.map(ref => `${ref.artifactId}@${ref.version}`) } } });
    }
    await registry.getCapture(ref); refs.push(ref);
  }
  const requireCurrent = async () => {
    await requireClassicEntrySelection(selection, input.sourceRoot);
    for (const [index, name] of ['reference', 'catalog'].entries()) {
      await registry.getCapture(referenceRefs[index]);
      if (!(await regularFile(root, `${referenceRefs[index].location}/_cosmos/classic/${name}.json`)).equals(index ? source.catalogBytes : source.referenceBytes)) throw new Error('Classic entry reference/catalog capture changed.');
    }
    if (refs[0]) { await registry.getCapture(refs[0]); for (const [path, bytes] of source.files) if (!(await regularFile(root, `${refs[0].location}/_cosmos/classic/${path}`)).equals(bytes)) throw new Error('Classic entry reference evidence capture changed.'); }
    for (const ref of requirement.sources) if (!(await regularFile(root, ref.location)).equals(await regularFile(root, `${requirementCapture.location}/_cosmos/${ref.artifactId}.json`))) throw new Error('Classic entry confirmation source changed.');
    if (!sameValue(decode(await regularFile(root, requirement.sources[0].location)), draft)) throw new Error('Classic entry confirmed draft changed.');
  };
  const mappingRef = (candidate: ArtifactReference) => registry.artifactRef(`classic-entry-mapping-${candidate.artifactId}`, candidate.version);
  const designPlan = async (design: ArtifactReference) => {
    await requireCurrent(); await registry.getCapture(design);
    const mapping = decode(await regularFile(root, `${design.location}/${SIDECAR}`));
    validateClassicEntryPlan(mapping, selection, gameplayIds, await viewportFor(design)); return mapping;
  };
  const expectedMapping = async (task: TaskContract, candidate: ArtifactReference, design: ArtifactReference) => ({ formatVersion: 'classic-entry-mapping/1',
    selection, reference: referenceRefs[0], catalog: referenceRefs[1], evidence: refs, requirement: requirementCapture, design, candidate,
    runId: task.runId, taskId: task.taskId, attemptId: task.attempts.at(-1)!.attemptId, specVersion: task.specVersion, sidecar: await designPlan(design) });
  const dependencies = (design: ArtifactReference) => [...referenceRefs, ...refs, requirementCapture, design];
  const requireMapping = async (task: TaskContract, candidate: ArtifactReference, design: ArtifactReference) => {
    const expected = await expectedMapping(task, candidate, design), ref = mappingRef(candidate), capture = await registry.getCapture(ref);
    if (capture.taskId !== task.taskId || !sameValue(capture.dependencies, dependencies(design))
      || !sameValue(decode(await regularFile(root, `${ref.location}/_cosmos/classic/entry-mapping.json`)), expected)) throw new Error('Fixed classic entry mapping changed.');
    return expected;
  };
  await requireCurrent();
  return {
    refs, selection, requireCurrent,
    validatePlan(value: unknown, viewport = draft.ordinaryProfile ? undefined : draft.scenario.viewport) {
      if (!viewport) throw new Error('Captured ordinary plan viewport is required.');
      validateClassicEntryPlan(value, selection, gameplayIds, viewport);
    },
    async captureMapping(task: TaskContract, candidate: ArtifactReference, design: ArtifactReference) {
      if (!selection.measurement) { await requireCurrent(); return []; }
      const mapping = await expectedMapping(task, candidate, design), ref = mappingRef(candidate), folder = `host-classic-entry/${candidate.artifactId}-${candidate.version}`;
      await directory(root, folder); await publishReceipt(join(root, folder, 'entry-mapping.json'), mapping);
      await registry.registerCapture({ taskId: task.taskId, artifactRef: ref, sourceRoot: folder, files: [{ source: 'entry-mapping.json', destination: '_cosmos/classic/entry-mapping.json' }],
        dependencies: dependencies(design), ownership: { writePaths: ['_cosmos/classic'], readOnlyPaths: [] }, metadata: { kind: 'data',
          provenance: { kind: 'original-procedural', generator: 'Cosmos fixed classic entry mapping', sourceRefs: [task.attempts.at(-1)!.sessionRef] } } });
      return [ref];
    },
    async bindExecution(task: TaskContract, candidate: ArtifactReference, design: ArtifactReference, project: string, url: string): Promise<Execution> {
      const mapping = await requireMapping(task, candidate, design), fixedCandidate = await registry.getCandidate(candidate), files = await snapshot(project);
      const plan = createClassicEntryPlan(mapping.sidecar, selection, gameplayIds, { projectId: 'game', taskId: task.taskId, runId: task.runId,
        specVersion: task.specVersion, artifact: candidate, reportId: `${task.taskId}-classic-entry`, viewport: await viewportFor(design), url });
      return { plan, current: async () => { await requireMapping(task, candidate, design);
        if (!sameValue(await registry.getCandidate(candidate), fixedCandidate) || !isDeepStrictEqual(await snapshot(project), files)) throw new Error('Classic entry current candidate bytes changed.'); } };
    },
    async evaluate(value: { task: TaskContract; candidate: ArtifactReference; design: ArtifactReference; deadlineAt: string;
      execution?: Execution; report?: AcceptanceReport; blockedReason?: string; requireCurrent(): Promise<void> }) {
      const { task, candidate, execution, report } = value, path = `evidence/${task.taskId}/classic-entries.json`, measurement = selection.measurement;
      let outcome = 'not_executed', reason = selection.reason ?? value.blockedReason ?? 'prerequisite_failed', diagnostics: Diagnostics | undefined;
      let picture: ArtifactReference | undefined; const evidence: ArtifactReference[] = [...referenceRefs, ...refs];
      if (measurement) evidence.push(mappingRef(candidate));
      try {
        await value.requireCurrent(); await requireCurrent();
        if (measurement) {
          await requireMapping(task, candidate, value.design); await execution?.current();
          if (execution && report) {
            const plan = execution.plan, folder = [plan.projectId, candidate.artifactId, candidate.version, task.runId, plan.reportId].join('/'), evidenceRoot = join(root, 'browser-evidence');
            const start = Date.parse(report.startedAt), end = Date.parse(report.endedAt), deadline = Date.parse(value.deadlineAt);
            if (report.formatVersion !== '1.0.0' || report.kind !== 'normal_browser_input' || report.reportPath !== `${folder}/report.json`
              || !sameValue(report.plan, plan) || !sameValue(report.browser?.viewport, plan.viewport) || report.browser?.name !== 'chromium'
              || !report.browser.version || report.session !== undefined || !Number.isSafeInteger(report.cleanup?.browserPid) || report.cleanup.browserPid! <= 0
              || report.cleanup.processExited !== true || !report.failureFacts
              || !Number.isFinite(start) || !Number.isFinite(end) || start > end || end > Date.now() || end >= deadline
              || !Number.isSafeInteger(report.timeoutMs) || report.timeoutMs <= 0 || !Array.isArray(report.files) || !Array.isArray(report.steps) || !Array.isArray(report.errors)
              || !sameValue(decode(await regularFile(evidenceRoot, `${folder}/plan.json`)), plan)
              || !sameValue(decode(await regularFile(evidenceRoot, report.reportPath)), report)) throw new Error('Classic entry raw plan/report binding or lifecycle changed.');
            for (const file of report.files) {
              if (typeof file !== 'string' || !file.startsWith(folder + '/')) throw new Error('Classic entry raw evidence path escaped its exact report.');
              const bytes = await regularFile(evidenceRoot, file); if (!bytes.length) throw new Error('Classic entry raw evidence is empty.');
              if (file.endsWith('.png')) requirePng(bytes);
            }
            if (new Set(report.files).size !== report.files.length || ['plan.json', 'report.json', 'browser.webm', 'browser.log'].some(name => !report.files.includes(`${folder}/${name}`))) throw new Error('Classic entry raw evidence is incomplete.');
            const last = report.steps.at(-1);
            if (!last || !completedObservation(last) || !deliveredInputs(report, plan, plan.steps.length - 1) || !last.screenshot?.endsWith('.png') || !report.files.includes(last.screenshot)) throw new Error('Classic entry input delivery, completed observation or assertion screenshot is missing.');
            diagnostics = diagnoseBrowser(task, report, plan, `browser-evidence/${report.reportPath}`);
            outcome = diagnostics.reportValid && !diagnostics.issues.length && report.outcome === 'passed' ? 'passed'
              : diagnostics.reportValid && diagnostics.issues.length && diagnostics.issues.every(issue => issue.classification === 'code_defect') ? 'failed' : 'insufficient_evidence';
            reason = outcome === 'passed' ? 'observed_visible_value' : outcome === 'failed' ? 'visible_value_mismatch' : 'raw_evidence_insufficient';
            picture = { artifactId: `${task.taskId}-classic-entry-screenshot`, version: candidate.version, location: `browser-evidence/${last.screenshot}` };
            evidence.push({ artifactId: `${task.taskId}-classic-entry-raw`, version: candidate.version, location: `browser-evidence/${folder}` });
            await execution.current();
          }
        }
        await value.requireCurrent(); await requireCurrent();
      } catch (error) {
        outcome = 'insufficient_evidence'; reason = error instanceof Error ? error.message : 'Classic entry evidence is incomplete.';
        if (execution) {
          const plan = execution.plan, location = `browser-evidence/${[plan.projectId, candidate.artifactId, candidate.version, task.runId, plan.reportId].join('/')}`;
          try { if ((await lstat(await safePath(root, location))).isDirectory() && !evidence.some(ref => ref.location === location))
            evidence.push({ artifactId: `${task.taskId}-classic-entry-raw`, version: candidate.version, location }); }
          catch { /* Missing or unsafe raw is reported as insufficient; never invent its contents. */ }
        }
        diagnostics = { reportValid: false, passedChecks: [], issues: [{ acceptanceId: gameplayIds[0], checkId: 'classic-entry/evidence', classification: 'insufficient_evidence',
          summary: reason, actual: reason, expected: 'Fixed reference, mapping, current candidate and original normal-input evidence.',
          reproduction: ['Inspect the fixed classic entry mapping, source captures and independent raw report.'], evidenceRefs: [path] }] };
      }
      const result = { formatVersion: 'classic-entry-report/1', acceptance: 'partial', recordedAt: new Date().toISOString(), selection,
        candidate, taskId: task.taskId, runId: task.runId, attemptId: task.attempts.at(-1)!.attemptId, specVersion: task.specVersion, deadlineAt: value.deadlineAt,
        captures: [...evidence], plan: execution?.plan ?? null, raw: report?.reportPath ?? null, policyReport: `evidence/${task.taskId}/classic-policy.json`,
        blockers: ['reference_not_frozen', 'full_execution_adapter_pending'], entries: source.catalog.entries.map((entry: any) => {
          const selected = entry.id === measurement?.entryId;
          return { ...structuredClone(entry), entryId: entry.id, referenceStatus: entry.status,
            mapping: { status: selected ? execution ? 'defined' : 'missing' : 'missing', measurementId: selected ? measurement!.id : null,
              entityId: selected ? measurement!.entityId : null, source: selected ? mappingRef(candidate) : null },
            normalInput: { outcome: selected ? outcome : 'not_executed', reason: selected || !measurement ? reason : 'not_selected_by_single_measurement_slice',
              plan: selected ? execution?.plan ?? null : null, raw: selected ? report?.reportPath ?? null : null, assertionId: selected && execution ? 'classic-entry-observe' : null },
            mechanism: { outcome: 'not_executed' }, valueImplementation: { outcome: 'not_executed' },
            gaps: [entry.status === 'needs_reference' ? 'reference_unverified' : 'entry_execution_incomplete', 'mechanism_not_executed', 'value_implementation_not_executed'] };
        }), missingInformation: { referenceBlockers: source.reference.blockers, census: source.catalog.closure, measurements: source.catalog.measurements } };
      await directory(root, `evidence/${task.taskId}`); await publishReceipt(join(root, path), result);
      evidence.push({ artifactId: `${task.taskId}-classic-entries`, version: candidate.version, location: path });
      return { result, evidence, picture, diagnostics, passed: measurement ? outcome === 'passed' : outcome === 'not_executed' };
    },
  };
}
