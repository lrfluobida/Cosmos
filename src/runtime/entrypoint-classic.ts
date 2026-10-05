import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/types.ts';
import type { ArtifactRegistry, Capture } from '../artifacts/index.ts';
import { directory, regularFile, snapshot } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import type { BrowserGameDraft } from '../roles/requirements.ts';
import type { GenericPersistentAcceptanceSeries, PersistentAcceptanceReport } from '../acceptance/persistent.ts';
import { verifyPersistentSegmentEvidence } from '../acceptance/persistent.ts';
import { createGenericPersistentSeries, verifyGenericPersistentEvidence } from './entrypoint-persistent.ts';
import { diagnosePersistentBrowser } from './adapters/transfer/persistent-diagnostics.ts';
import { diagnoseBuild } from './repair/browser-diagnostics.ts';
import type { BrowserBuildReport } from './entrypoint-host.ts';
import { publishReceipt } from './recovery/receipt-file.ts';

const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const policies = [{ entryId: 'STARTUP', consumer: 'clean-delivery-finally' }, { entryId: 'OFFLINE', consumer: 'normal-save-process-reopen' }];
const referenceRoot = fileURLToPath(new URL('../../benchmarks/classic-pc/reference/', import.meta.url));
const validateReference = async (reference: any, catalog: any): Promise<string[]> =>
  (await import(new URL('../../benchmarks/classic-pc/reference/validate.mjs', import.meta.url).href)).validate(reference, catalog);

/** Declared mappings alone cannot establish an executed outcome. */
export async function inspectClassicMapping(reference: any, catalog: any, mapping: any, expected: any): Promise<string[]> {
  const errors = await validateReference(reference, catalog);
  if (reference.frozen || catalog.frozen || catalog.status !== 'provisional') errors.push('This policy selection requires its provisional unfrozen reference.');
  if (catalog.entries.length !== 230 || catalog.entries.filter((row: any) => row.status === 'needs_reference').length !== 221
    || catalog.entries.filter((row: any) => row.kind === 'acceptance_policy' && row.status === 'requirement_defined').length !== 9) errors.push('Complete provisional denominator changed.');
  if (!sameValue(mapping, expected) || mapping?.referenceId !== reference.referenceId || mapping?.referenceId !== catalog.referenceId) errors.push('Fixed classic mapping binding changed.');
  if (!sameValue(mapping?.mappings, policies)) errors.push('Missing, unknown or duplicate classic policy mapping.');
  return errors;
}

interface Mapping {
  formatVersion: 'classic-policy-mapping/1'; selection: BrowserGameDraft['benchmark']; referenceId: string;
  reference: ArtifactReference; catalog: ArtifactReference; requirement: ArtifactReference; design: ArtifactReference; candidate: ArtifactReference;
  taskId: string; runId: string; specVersion: string; scenario: BrowserGameDraft['scenario']; mappings: typeof policies;
}
type PolicyOutcome = 'passed' | 'failed' | 'insufficient_evidence';
interface Execution { series: GenericPersistentAcceptanceSeries; ready: { pid: number; project: string; url: string }; packageFiles: string[]; current(): Promise<void> }

/** Only the host reads the source catalog and binds the original confirmed inputs. */
export async function createClassicPolicyScope(input: { root: string; registry: ArtifactRegistry; requirement: RequirementContract;
  draft: BrowserGameDraft; requirementCapture: ArtifactReference; resume: boolean }) {
  const { root, registry, requirement, requirementCapture } = input, draft = structuredClone(input.draft);
  if (draft.benchmark !== 'classic-pc-runtime-policy/1' || !draft.scenario.reopen) throw new Error('Classic policy selection or normal reopen is missing.');
  const bytes = await Promise.all(['reference', 'catalog'].map(name => regularFile(referenceRoot, `${name}.json`)));
  const [reference, catalog] = bytes.map(decode), source = 'host-classic-policy';
  const refs = ['reference', 'catalog'].map(name => registry.artifactRef(`classic-policy-${name}`, 'provisional-v1'));
  const captures: Capture[] = [];
  for (const [index, name] of ['reference', 'catalog'].entries()) {
    if (!input.resume) {
      const folder = await directory(root, `${source}/${name}`); await writeFile(join(folder, `${name}.json`), bytes[index], { flag: 'wx' });
      await registry.registerCapture({ taskId: 'host-classic-policy', artifactRef: refs[index], sourceRoot: `${source}/${name}`,
        files: [{ source: `${name}.json`, destination: `_cosmos/classic/${name}.json` }], dependencies: [requirementCapture],
        ownership: { writePaths: ['_cosmos/classic'], readOnlyPaths: [] }, metadata: { kind: 'data',
          provenance: { kind: 'original-procedural', generator: 'Cosmos fixed provisional classic policy source', sourceRefs: requirement.sources.map(ref => `${ref.artifactId}@${ref.version}`) } } });
    }
    captures.push(await registry.getCapture(refs[index]));
  }
  const requireReference = async () => {
    for (const [index, name] of ['reference', 'catalog'].entries()) if (!sameValue(await registry.getCapture(refs[index]), captures[index])
      || !(await regularFile(root, `${refs[index].location}/_cosmos/classic/${name}.json`)).equals(bytes[index])) throw new Error('Fixed classic reference/catalog capture changed.');
    for (const ref of requirement.sources) if (!(await regularFile(root, ref.location)).equals(await regularFile(root, `${requirementCapture.location}/_cosmos/${ref.artifactId}.json`))) throw new Error('Original classic confirmation source changed.');
    if (!sameValue(decode(await regularFile(root, requirement.sources[0].location)), draft)) throw new Error('Confirmed classic draft selection changed.');
  };
  const mappingRef = (candidate: ArtifactReference) => registry.artifactRef(`classic-policy-mapping-${candidate.artifactId}`, candidate.version);
  const expectedMapping = (task: TaskContract, candidate: ArtifactReference, design: ArtifactReference): Mapping => ({ formatVersion: 'classic-policy-mapping/1',
    selection: draft.benchmark, referenceId: reference.referenceId, reference: refs[0], catalog: refs[1], requirement: requirementCapture, design, candidate,
    taskId: task.taskId, runId: task.runId, specVersion: task.specVersion, scenario: structuredClone(draft.scenario), mappings: structuredClone(policies) });
  const requireMapping = async (task: TaskContract, candidate: ArtifactReference, design: ArtifactReference) => {
    await requireReference();
    const ref = mappingRef(candidate), capture = await registry.getCapture(ref), expected = expectedMapping(task, candidate, design);
    if (capture.taskId !== task.taskId || !sameValue(capture.dependencies, [...refs, requirementCapture, design])) throw new Error('Classic mapping capture dependencies changed.');
    const mapping = decode(await regularFile(root, `${ref.location}/_cosmos/classic/mapping.json`));
    const errors = await inspectClassicMapping(reference, catalog, mapping, expected); if (errors.length) throw new Error(errors.join('; '));
    return mapping as Mapping;
  };
  await requireReference();
  return {
    refs,
    async captureMapping(task: TaskContract, candidate: ArtifactReference, design: ArtifactReference) {
      await requireReference(); const mapping = expectedMapping(task, candidate, design), errors = await inspectClassicMapping(reference, catalog, mapping, mapping);
      if (errors.length) throw new Error(errors.join('; '));
      const ref = mappingRef(candidate), folder = await directory(root, `${source}/${candidate.artifactId}-${candidate.version}`);
      await publishReceipt(join(folder, 'mapping.json'), mapping);
      await registry.registerCapture({ taskId: task.taskId, artifactRef: ref, sourceRoot: `${source}/${candidate.artifactId}-${candidate.version}`,
        files: [{ source: 'mapping.json', destination: '_cosmos/classic/mapping.json' }], dependencies: [...refs, requirementCapture, design],
        ownership: { writePaths: ['_cosmos/classic'], readOnlyPaths: [] }, metadata: { kind: 'data',
          provenance: { kind: 'original-procedural', generator: 'Cosmos current classic policy mapping', sourceRefs: requirement.sources.map(ref => `${ref.artifactId}@${ref.version}`) } } });
      return ref;
    },
    async bindExecution(task: TaskContract, candidate: ArtifactReference, design: ArtifactReference, series: GenericPersistentAcceptanceSeries, project: string): Promise<Execution> {
      const mapping = await requireMapping(task, candidate, design), fixedCandidate = await registry.getCandidate(candidate), files = await snapshot(project);
      const expected = createGenericPersistentSeries({ scenario: mapping.scenario, requirement: requirementCapture, design, candidate, projectId: 'game', taskId: task.taskId,
        runId: task.runId, specVersion: task.specVersion, reportId: `${task.taskId}-persistent`, url: series.segments[0].plan.url, acceptanceIds: task.acceptanceIds });
      if (!sameValue(series, expected)) throw new Error('Expanded classic plans differ from the fixed mapping.');
      const ready = decode(await regularFile(root, `delivery-work/${task.taskId}/ready.json`));
      if (!sameValue(ready.candidate, candidate) || ready.url !== series.segments[0].plan.url) throw new Error('Classic clean launcher readiness differs.');
      return { series: structuredClone(series), ready, packageFiles: [...files.keys()], current: async () => {
        await requireMapping(task, candidate, design);
        if (!sameValue(await registry.getCandidate(candidate), fixedCandidate) || !isDeepStrictEqual(await snapshot(project), files)) throw new Error('Current classic candidate changed.');
      } };
    },
    async evaluate(value: { task: TaskContract; candidate: ArtifactReference; design: ArtifactReference; deadlineAt: string; build?: BrowserBuildReport;
      execution?: Execution; report?: PersistentAcceptanceReport; signal: AbortSignal; requireCurrent(): Promise<void> }) {
      const { task, candidate, execution, report } = value, path = `evidence/${task.taskId}/classic-policy.json`, issues: string[] = [];
      let startup: PolicyOutcome = 'insufficient_evidence', offline: PolicyOutcome = 'insufficient_evidence';
      let binding: Mapping = expectedMapping(task, candidate, value.design), clean: any = null;
      try {
        await value.requireCurrent(); binding = await requireMapping(task, candidate, value.design); await execution?.current();
        const built = decode(await regularFile(root, `evidence/${task.taskId}/build.json`));
        if (!sameValue(built, value.build)) throw new Error('Original classic build receipt changed.');
        const buildDiagnostic = diagnoseBuild(task, { passed: built.passed, work: built.work ?? '', results: built.results ?? [] }, `evidence/${task.taskId}/build.json`);
        if (!built.passed) {
          startup = buildDiagnostic.reportValid && buildDiagnostic.issues.some(issue => issue.classification === 'code_defect') ? 'failed' : 'insufficient_evidence';
          issues.push(...buildDiagnostic.issues.map(issue => issue.summary));
        } else {
          if (!buildDiagnostic.reportValid || buildDiagnostic.issues.length) throw new Error('Both current build commands are unproven.');
          if (!execution || !report) throw new Error('Current classic normal-input execution is missing.');
          const deadlineAt = Date.parse(value.deadlineAt), evidenceRoot = join(root, 'browser-evidence');
          const diagnostics = await diagnosePersistentBrowser(task, report, { series: execution.series, deadlineAt, reportPath: report.reportPath },
            { evidenceRoot, signal: value.signal, verifyBinding: async () => { await value.requireCurrent(); await execution.current(); } });
          if (!diagnostics.reportValid) throw new Error('Current classic raw/process/plan evidence is inconsistent.');
          if (diagnostics.issues.length) { offline = diagnostics.issues.every(issue => issue.classification === 'code_defect') ? 'failed' : 'insufficient_evidence'; issues.push(...diagnostics.issues.map(issue => issue.summary)); }
          else { await verifyGenericPersistentEvidence(execution.series, report, evidenceRoot, deadlineAt); offline = 'passed'; }
          clean = decode(await regularFile(root, `evidence/${task.taskId}/delivery-check.json`));
          if (clean.formatVersion !== 'clean-delivery-check/1' || !sameValue(clean.candidate, candidate) || clean.deadlineAt !== value.deadlineAt
            || clean.url !== execution.ready.url || clean.project !== execution.ready.project || clean.helperPid !== execution.ready.pid || !Number.isSafeInteger(clean.helperPid) || clean.helperPid <= 0
            || clean.bytesMatched !== true || clean.helperExited !== true || clean.helperResult?.passed !== true
            || clean.helperResult?.code !== 0 || !sameValue(clean.packageFiles, execution.packageFiles) || !['passed', 'failed'].includes(clean.outcome) || typeof clean.acceptancePassed !== 'boolean'
            || !Number.isFinite(Date.parse(clean.endedAt)) || Date.parse(clean.endedAt) > Date.now() || Date.parse(clean.endedAt) >= deadlineAt || Date.parse(clean.endedAt) < Date.parse(report.endedAt)) throw new Error('Final clean delivery lifecycle/package receipt is incomplete.');
          const first = report.segments[0]?.report;
          if (!first) throw new Error('Startup normal document is missing.');
          if (first.outcome === 'passed') {
            await verifyPersistentSegmentEvidence(first, execution.series.segments[0].plan, evidenceRoot, first.session!.profile);
            startup = clean.outcome === 'passed' && clean.acceptancePassed === true ? 'passed' : 'failed';
          } else startup = diagnostics.issues.some(issue => issue.classification === 'code_defect') ? 'failed' : 'insufficient_evidence';
        }
        await value.requireCurrent(); await requireMapping(task, candidate, value.design); await execution?.current();
      } catch (error) {
        startup = offline = 'insufficient_evidence'; issues.push(error instanceof Error ? error.message : 'Classic evidence is incomplete.');
      }
      const result = { formatVersion: 'classic-policy-report/1', acceptance: 'partial', recordedAt: new Date().toISOString(), binding,
        captures: [...refs, mappingRef(candidate)], plans: execution?.series ?? null, blockers: ['reference_not_frozen', 'full_execution_adapter_pending'],
        referenceValidationErrors: await validateReference(reference, catalog), mappingErrors: issues,
        entries: catalog.entries.map((entry: any) => ({ ...structuredClone(entry), entryId: entry.id,
          outcome: entry.id === 'STARTUP' ? startup : entry.id === 'OFFLINE' ? offline : entry.status === 'needs_reference' ? 'reference_unknown' : 'policy_not_executed',
          gaps: entry.id === 'STARTUP' || entry.id === 'OFFLINE' ? [...issues] : [entry.status === 'needs_reference' ? 'reference_unverified' : 'policy_execution_pending', 'mapping_missing'] })),
        missingInformation: { referenceBlockers: reference.blockers, census: catalog.closure, measurements: catalog.measurements,
          missingMappingIds: catalog.entries.filter((entry: any) => !policies.some(policy => policy.entryId === entry.id)).map((entry: any) => entry.id) },
        evidence: { build: `evidence/${task.taskId}/build.json`, cleanup: `evidence/${task.taskId}/delivery-check.json`, browser: report?.reportPath ?? null,
          networkPolicy: 'existing runner permits project origin, data and blob only; external origins are blocked', cleanupEndedAt: clean?.endedAt ?? null } };
      await mkdir(join(root, dirname(path)), { recursive: true }); await publishReceipt(join(root, path), result);
      return { result, evidence: [{ artifactId: `${task.taskId}-classic-policy`, version: candidate.version, location: path }, ...refs, mappingRef(candidate)] };
    },
  };
}
