import { createHash } from 'node:crypto';
import { lstat, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ArtifactReference, TaskContract } from '../contracts/types.ts';
import { sameValue, validateTask } from '../contracts/validation.ts';
import { directory, id, noConflicts, pathName, regularFile, snapshot, within } from '../artifacts/paths.ts';
import type { Capture } from '../artifacts/types.ts';
import { freeze, HOST_STAGE_ACCEPTANCE } from '../roles/requirements.ts';
import { validateExecutionRequirement } from '../roles/execution-input.ts';
import type { ValidationRequirement } from '../roles/execution-input.ts';
import { TaskJournal, RecoveryBlocked, requireOriginalTask } from './recovery/task-journal.ts';
import type { ContentSignature, RecoveryOrigin } from './recovery/task-journal.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { validateTransferDesign } from './adapters/transfer/oracle.ts';
import type { FrozenTransferDesign } from './adapters/transfer/binding.ts';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const receiptNames = ['origin', 'author', 'capture-started', 'capture', 'verify-started', 'verified', 'review-started', 'review'] as const;
type ReceiptName = typeof receiptNames[number];
export interface HistoricalSourceIdentity {
  caseId: string; windowId: string; reviewedPlatformSha: string; frozenCaseInputHash: string; designTaskId: string; artTaskId: string;
}
export interface HistoricalPassedManifest extends HistoricalSourceIdentity {
  formatVersion: 'historical-passed-stages/1'; originalRoot: string; requirement: ValidationRequirement;
  stages: { role: 'design' | 'art'; task: TaskContract; receipts: Record<ReceiptName, string> }[];
  captures: { ref: ArtifactReference; manifestSha256: string; signature: ContentSignature }[];
  preparedSha256: string;
  /** This fixed source admits only the successful first check; it never reopens a semantic rewrite. */
  designAudit: { startedSha256: string; resultSha256: string; rawSha256: string };
}
export interface VerifiedHistoricalStages {
  manifest: HistoricalPassedManifest; sourceRequirement: ValidationRequirement;
  stages: HistoricalPassedManifest['stages']; captures: Capture[];
  template: ArtifactReference; requirementCapture: ArtifactReference;
  designArtifacts: ArtifactReference[]; mediaArtifact: ArtifactReference; frozen: FrozenTransferDesign;
}
export interface HistoricalPassedStages {
  readonly originalRoot: string; readonly targetRoot: string; readonly manifestRef: ArtifactReference;
  readonly readManifest: (signal: AbortSignal) => Promise<Uint8Array>;
  verify(signal: AbortSignal): Promise<VerifiedHistoricalStages>;
  import(signal: AbortSignal): Promise<VerifiedHistoricalStages>;
}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RecoveryBlocked(`Historical stages: ${message}`);
}
function keys(value: unknown, expected: string[], label: string): asserts value is Record<string, any> {
  requireThat(value && typeof value === 'object' && !Array.isArray(value)
    && sameValue(Object.keys(value).sort(), [...expected].sort()), `${label} schema changed`);
}
function digest(value: unknown) { requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'invalid fixed digest'); }
function time(value: unknown): number {
  requireThat(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'invalid historical timestamp');
  return Date.parse(value);
}
function capturePath(ref: ArtifactReference): string {
  keys(ref, ['artifactId', 'version', 'location'], 'capture reference'); id(ref.artifactId); id(ref.version, true);
  const path = `registry/captures/${ref.artifactId}/${ref.version}`;
  requireThat(ref.location === path + '/files', 'capture has a foreign registry location'); return path;
}
async function optional(root: string, path: string): Promise<Buffer | null> {
  try { return await regularFile(root, path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** Source-owned roots and identities must be derived by the fixed caller, never a model or manifest. */
export function createHistoricalPassedStages(input: {
  originalRoot: string; targetRoot: string; expected: HistoricalSourceIdentity; manifestRef: ArtifactReference;
  readManifest(signal: AbortSignal): Promise<Uint8Array>;
}): HistoricalPassedStages {
  const originalRoot = resolve(input.originalRoot), targetRoot = resolve(input.targetRoot);
  const expected = freeze(structuredClone(input.expected)), manifestRef = freeze(structuredClone(input.manifestRef));
  keys(expected, ['caseId', 'windowId', 'reviewedPlatformSha', 'frozenCaseInputHash', 'designTaskId', 'artTaskId'], 'trusted source identity');
  keys(manifestRef, ['artifactId', 'version', 'location'], 'manifest reference'); id(manifestRef.artifactId); digest(manifestRef.version); pathName(manifestRef.location);
  requireThat(typeof input.readManifest === 'function' && originalRoot !== targetRoot && !within(originalRoot, targetRoot) && !within(targetRoot, originalRoot), 'separate trusted source and target Roots required');
  const mappingPath = 'host-historical-stage-import.json';
  async function readManifest(signal: AbortSignal): Promise<Uint8Array> {
    signal.throwIfAborted(); const bytes = await input.readManifest(signal); signal.throwIfAborted();
    requireThat(bytes instanceof Uint8Array && sha(bytes) === manifestRef.version, 'actual manifest digest changed'); return bytes;
  }
  async function verify(signal: AbortSignal): Promise<VerifiedHistoricalStages> {
    const bytes = await readManifest(signal), value = decode(bytes) as HistoricalPassedManifest;
    keys(value, ['formatVersion', 'originalRoot', ...Object.keys(expected), 'requirement', 'stages', 'captures', 'preparedSha256', 'designAudit'], 'manifest');
    requireThat(value.formatVersion === 'historical-passed-stages/1' && value.originalRoot === originalRoot
      && Object.entries(expected).every(([key, item]) => value[key as keyof HistoricalSourceIdentity] === item)
      && await realpath(originalRoot) === originalRoot, 'original Root or source identity changed');
    requireThat(!validateExecutionRequirement(value.requirement, 'operator_validation').length, 'original requirement is invalid');
    const source = value.requirement.validation;
    requireThat(source.caseId === expected.caseId && source.windowId === expected.windowId && source.reviewedPlatformSha === expected.reviewedPlatformSha
      && source.frozenCaseInputHash === expected.frozenCaseInputHash, 'original requirement source identity changed');
    requireThat(Array.isArray(value.stages) && value.stages.length === 2 && value.stages[0].role === 'design' && value.stages[1].role === 'art', 'exact design/art stages required');
    requireThat(Array.isArray(value.captures) && value.captures.length === 7, 'complete seven-capture source closure required');
    const captures: Capture[] = [];
    // One fresh read per fixed location in this verification, shared by overlapping receipt signatures.
    const signatures = new Map<string, ContentSignature[number]>(), captureFiles = new Map<string, Map<string, Buffer>>();
    const signature = async (refs: ArtifactReference[], journal: TaskJournal): Promise<ContentSignature> => {
      const locations = [...new Set(refs.map(ref => ref.location))].sort();
      await Promise.all(locations.map(async location => {
        if (!signatures.has(location)) signatures.set(location, (await journal.signature([refs.find(ref => ref.location === location)!]))[0]);
      }));
      return locations.map(location => signatures.get(location)!);
    };
    const requireSignature = async (fixed: ContentSignature, refs: ArtifactReference[], journal: TaskJournal) => {
      requireThat(sameValue(fixed, await signature(refs, journal)), 'fixed historical signature content changed');
    };
    for (const item of value.captures) {
      keys(item, ['ref', 'manifestSha256', 'signature'], 'capture proof'); digest(item.manifestSha256);
      const path = capturePath(item.ref), raw = await regularFile(originalRoot, path + '/capture.json');
      requireThat(sha(raw) === item.manifestSha256, 'capture manifest bytes changed');
      const capture = decode(raw) as Capture;
      keys(capture, ['taskId', 'artifactRef', 'sourceRoot', 'files', 'ownership', 'metadata', 'dependencies', 'capturedAt'], 'canonical capture');
      requireThat(sameValue(capture.artifactRef, item.ref) && Array.isArray(capture.files) && capture.files.length > 0
        && Array.isArray(capture.dependencies), 'capture identity or inventory changed');
      noConflicts(capture.files.map(file => file.destination));
      const files = await snapshot(join(originalRoot, item.ref.location)); captureFiles.set(item.ref.location, files);
      signatures.set(item.ref.location, { location: item.ref.location, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, sha256: sha(bytes) })) });
      requireThat(sameValue([...files.keys()].sort(), capture.files.map(file => file.destination).sort()), 'capture file inventory changed');
      captures.push(capture);
    }
    requireThat(new Set(captures.map(item => item.artifactRef.artifactId)).size === captures.length, 'duplicate capture identity');
    for (const capture of captures) for (const ref of capture.dependencies) requireThat(captures.some(item => sameValue(item.artifactRef, ref)), 'capture dependency closure is incomplete');
    let designOrigin!: RecoveryOrigin;
    for (const [index, stage] of value.stages.entries()) {
      keys(stage, ['role', 'task', 'receipts'], 'stage'); keys(stage.receipts, [...receiptNames], 'receipt digest');
      const task = stage.task, taskId = index ? expected.artTaskId : expected.designTaskId, attempt = task.attempts?.[0];
      requireThat(!validateTask(task).length && task.taskId === taskId && task.runId === source.runId && task.budget.ledgerId === source.ledgerId
        && task.kind === 'evaluation' && sameValue(task.acceptanceIds, [HOST_STAGE_ACCEPTANCE[index].acceptanceId])
        && task.specVersion === value.requirement.specVersion && task.state === 'passed' && task.review.verdict === 'approved'
        && task.attempts.length === 1 && attempt?.outcome === 'passed' && !task.handoff.remaining.length && !task.handoff.uncertainty.length
        && (index ? sameValue(task.dependsOn.map(dep => ({ taskId: dep.taskId, state: dep.state, requiredState: dep.requiredState })), [{ taskId: expected.designTaskId, state: 'passed', requiredState: 'passed' }]) : !task.dependsOn.length), 'stage task or PASS contract changed');
      const start = time(attempt.startedAt), end = time(attempt.endedAt); requireThat(start <= end && end <= Date.now(), 'attempt time changed');
      const raw: Record<string, any> = {};
      await Promise.all(receiptNames.map(async name => {
        digest(stage.receipts[name]); const receipt = await regularFile(originalRoot, `journal/task-${encodeURIComponent(taskId)}/${name}.json`);
        requireThat(sha(receipt) === stage.receipts[name], `${name} receipt bytes changed`); raw[name] = decode(receipt);
      }));
      const origin = raw.origin as RecoveryOrigin;
      requireThat(origin.formatVersion === 3 && origin.artifactRoot === originalRoot && origin.sessionRoot === join(originalRoot, 'sessions')
        && origin.prepared.workspace === join(originalRoot, `validation/${expected.caseId}/${taskId}/workspace`)
        && origin.prepared.role === stage.role && sameValue(origin.requirement, value.requirement)
        && origin.validationCase?.caseId === expected.caseId && origin.validationCase.windowId === expected.windowId
        && origin.runId === task.runId && origin.ledgerId === task.budget.ledgerId && origin.prepared.task.state === 'not_started', 'original journal binding changed');
      requireOriginalTask(origin.prepared.task, task);
      requireThat(time(origin.validationCase.startedAt) <= start && end < time(origin.validationCase.deadlineAt), 'stage exceeds its original window');
      // Open only the actual source Root. Never project an old origin into the new Root.
      const journal = await TaskJournal.open({ artifactRoot: originalRoot, journalRoot: join(originalRoot, 'journal') }, origin, true);
      const author = await journal.read<any>('author', attempt.attemptId), capture = await journal.read<any>('capture', attempt.attemptId);
      const verified = await journal.read<any>('verified', attempt.attemptId), begun = await journal.read<any>('review-started', attempt.attemptId), review = await journal.read<any>('review', attempt.attemptId);
      for (const name of ['capture-started', 'verify-started'] as const) requireThat(await journal.read(name, attempt.attemptId), 'missing phase start receipt');
      requireThat(author && typeof author.proposal?.summary === 'string' && author.proposal.summary.trim()
        && sameValue(Object.keys(author.proposal).sort(), ['remaining', 'summary', 'uncertainty']) && sameValue(author.proposal.remaining, []) && sameValue(author.proposal.uncertainty, []), 'original author handoff is incomplete');
      await requireSignature(author.signature, task.inputs, journal);
      requireThat(capture && sameValue(capture.captured.artifacts, task.artifacts) && sameValue(origin.prepared.expectedArtifacts, task.artifacts)
        && capture.captured.reviewWorkspace === join(originalRoot, `reviews/${taskId}`)
        && (capture.capturedAt === undefined || start <= time(capture.capturedAt) && time(capture.capturedAt) <= end), 'canonical complete capture receipt changed');
      await requireSignature(capture.signature, task.artifacts, journal);
      requireThat(verified && sameValue(verified.evidence, task.evidence), 'host verified evidence receipt changed');
      const refs = [...task.inputs, ...task.artifacts, ...task.evidence.map(item => item.source)];
      await requireSignature(verified.signature, refs, journal);
      requireThat(review && begun && review.reviewerId === task.review.reviewerId && review.contextId === task.review.contextId
        && begun.reviewerId === review.reviewerId && begun.contextId === review.contextId && review.reviewerId !== task.authorId && review.contextId !== task.context.contextId
        && review.completedAt === attempt.endedAt && sameValue(review.verdict, { verdict: 'approved', inputVersions: task.review.inputVersions, evidenceIds: task.review.evidenceIds, findings: [] })
        && sameValue(task.review.inputVersions, [...task.inputs, ...task.artifacts]), 'genuine independent approved review receipt changed');
      await requireSignature(review.signature, refs, journal);
      for (const acceptanceId of task.acceptanceIds) {
        const accepted = value.requirement.acceptance.find(item => item.acceptanceId === acceptanceId);
        requireThat(accepted && task.evidence.some(item => task.review.evidenceIds.includes(item.evidenceId) && item.outcome === 'passed'
          && item.acceptanceIds.includes(acceptanceId) && accepted.evidenceKinds.includes(item.kind)
          && [...task.inputs, ...task.artifacts].every(ref => item.artifactVersions.some(actual => sameValue(ref, actual)))), 'selected evidence does not pass the fixed versions');
      }
      for (const evidence of task.evidence) if (evidence.kind === 'test_report' && evidence.outcome === 'passed') {
        const report = decode(await regularFile(originalRoot, evidence.source.location)); requireThat(sameValue(report.evidence, evidence), 'actual host report differs from selected evidence');
      }
      for (const ref of task.artifacts) {
        const selected = captures.find(item => sameValue(item.artifactRef, ref));
        requireThat(selected && (selected.taskId === taskId || selected.taskId === 'host-transfer-plan') && start <= time(selected.capturedAt) && time(selected.capturedAt) <= end, 'captured output author or time changed');
      }
      if (!index) designOrigin = origin;
    }
    const journal = await TaskJournal.open({ artifactRoot: originalRoot, journalRoot: join(originalRoot, 'journal') }, designOrigin, true);
    for (const item of value.captures) await requireSignature(item.signature, [item.ref], journal);
    const design = value.stages[0].task, art = value.stages[1].task;
    requireThat(design.artifacts.length === 4 && art.artifacts.length === 1 && art.inputs.filter(ref => ref.location.startsWith('registry/captures/')).length === 6, 'historical stage output closure changed');
    const template = captures.find(item => item.taskId === 'host-template'), requirement = captures.find(item => item.taskId === 'host-requirements');
    requireThat(template && requirement && captures.filter(item => item.taskId === 'host-template').length === 1 && captures.filter(item => item.taskId === 'host-requirements').length === 1, 'one original template and requirement are required');
    const ref = (name: string) => captures.find(item => item.artifactRef.artifactId === expected.caseId + '-' + name)?.artifactRef;
    requireThat(sameValue(template.artifactRef, ref('generic-template')) && sameValue(requirement.artifactRef, ref('requirement-bundle'))
      && sameValue(design.artifacts, ['design', 'transfer-design', 'plan-v1', 'plan-v2'].map(ref)) && sameValue(art.artifacts, [ref('media')]), 'original named stage capture identities changed');
    requireThat(sameValue(design.inputs, [...value.requirement.sources, template.artifactRef, requirement.artifactRef])
      && sameValue(art.inputs, [...design.inputs, ...design.artifacts]), 'original complete task inputs changed');
    requireThat(sameValue(decode(await regularFile(originalRoot, requirement.artifactRef.location + '/_cosmos/execution-requirement.json')), value.requirement), 'original captured requirement changed');
    digest(value.preparedSha256); const preparedBytes = await regularFile(originalRoot, 'host-transfer-prepared-inputs.json');
    requireThat(sha(preparedBytes) === value.preparedSha256, 'original prepared receipt bytes changed'); const prepared = decode(preparedBytes);
    requireThat(prepared.formatVersion === 'transfer-prepared-inputs/1' && prepared.taskId === design.taskId && prepared.attemptId === design.attempts[0].attemptId
      && prepared.sessionRef === design.attempts[0].sessionRef && sameValue(prepared.frozen.requirement, requirement.artifactRef)
      && design.artifacts.some(ref => sameValue(ref, prepared.frozen.artifact)), 'original prepared map binding changed');
    const mapBytes = await regularFile(originalRoot, prepared.frozen.artifact.location + '/_cosmos/transfer-design.json');
    const map = validateTransferDesign(decode(mapBytes), requirement.artifactRef);
    requireThat(sha(mapBytes) === prepared.frozen.designSha256 && map.design.mapVersion === prepared.frozen.mapVersion, 'canonical sealed map changed');
    keys(value.designAudit, ['startedSha256', 'resultSha256', 'rawSha256'], 'design audit');
    const auditPath = `host-transfer-design-validation/${design.taskId}/${design.attempts[0].attemptId}/check-1-`;
    const auditRaw = await regularFile(originalRoot, auditPath + 'raw.json'), startedRaw = await regularFile(originalRoot, auditPath + 'started.json'), resultRaw = await regularFile(originalRoot, auditPath + 'result.json');
    for (const hash of Object.values(value.designAudit)) digest(hash);
    requireThat(sha(auditRaw) === value.designAudit.rawSha256 && sha(startedRaw) === value.designAudit.startedSha256 && sha(resultRaw) === value.designAudit.resultSha256 && auditRaw.equals(mapBytes), 'design audit raw receipt bytes changed');
    requireThat(!await optional(originalRoot, auditPath.replace('check-1-', 'check-2-') + 'started.json'), 'source map used a different audit chain');
    const started = decode(startedRaw), completed = decode(resultRaw), attempt = design.attempts[0], originalWindow = designOrigin.validationCase!;
    keys(started, ['formatVersion', 'binding', 'check', 'startedAt', 'authority', 'raw'], 'design audit start');
    requireThat(started.formatVersion === 'transfer-design-check-started/1' && started.check === 1
      && sameValue(started.binding, { taskId: design.taskId, attemptId: attempt.attemptId, attemptStartedAt: attempt.startedAt, authorId: design.authorId,
        contextId: design.context.contextId, sessionRef: attempt.sessionRef, workspace: designOrigin.prepared.workspace, requirement: value.requirement,
        requirementCapture: requirement.artifactRef, inputs: design.inputs, inputSignature: await signature([...design.inputs, ...design.context.interfaces], journal) })
      && sameValue(started.authority, { sourceVersion: expected.reviewedPlatformSha, caseId: expected.caseId, windowId: expected.windowId, startedAt: originalWindow.startedAt, deadlineAt: originalWindow.deadlineAt })
      && sameValue(started.raw, { location: auditPath + 'raw.json', present: true, sha256: sha(auditRaw) }), 'design audit source/input binding changed');
    const result = { passed: true, rewritesRemaining: 0, mapVersion: map.design.mapVersion };
    requireThat(sameValue(completed, { formatVersion: 'transfer-design-check-result/1', startedSha256: sha(JSON.stringify(started)), completedAt: completed.completedAt, result, resultSha256: sha(JSON.stringify(result)) })
      && Math.max(time(originalWindow.startedAt), time(attempt.startedAt)) <= time(started.startedAt) && time(started.startedAt) <= time(completed.completedAt)
      && time(completed.completedAt) < time(originalWindow.deadlineAt) && time(completed.completedAt) <= time(attempt.endedAt), 'design audit verdict, hash chain or timestamps changed');
    const sourceRefs = value.requirement.sources.map(item => item.location);
    const procedural = (generator: string, refs: string[]) => ({ kind: 'original-procedural', generator, sourceRefs: refs });
    for (const capture of captures) {
      const name = capture.artifactRef.artifactId.slice(expected.caseId.length + 1);
      const deps = name === 'design' ? [template.artifactRef, requirement.artifactRef] : name === 'transfer-design' ? [requirement.artifactRef]
        : name.startsWith('plan-') ? [requirement.artifactRef, prepared.frozen.artifact]
        : name === 'media' ? [template.artifactRef, requirement.artifactRef, design.artifacts[0], prepared.frozen.artifact] : [];
      const provenance = name === 'design' ? procedural('Native design role output', [attempt.sessionRef, ...sourceRefs])
        : name === 'transfer-design' ? procedural('Native design role output', [attempt.sessionRef, auditPath + 'result.json#sha256=' + sha(resultRaw), ...sourceRefs])
        : name === 'media' ? procedural('Native art role output', [art.attempts[0].sessionRef, ...sourceRefs])
        : name.startsWith('plan-') ? procedural('COS36 trusted rules and plan converter', [requirement.artifactRef.artifactId + '@' + requirement.artifactRef.version,
          prepared.frozen.artifact.artifactId + '@' + prepared.frozen.artifact.version, prepared.plans[name === 'plan-v1' ? 'v1' : 'v2'].binding.candidate.artifactId + '@' + prepared.plans[name === 'plan-v1' ? 'v1' : 'v2'].binding.candidate.version])
        : procedural('Cosmos trusted host inputs', value.requirement.sources.map(item => item.artifactId + '@' + item.version));
      requireThat(sameValue(capture.dependencies, deps) && sameValue(capture.metadata.provenance, provenance)
        && capture.metadata.kind === (name === 'generic-template' ? 'code' : name === 'media' ? 'media' : 'data'), 'original capture dependencies or provenance changed');
      if (name === 'media') requireThat(sameValue(decode(await regularFile(originalRoot, capture.artifactRef.location + '/public/assets/manifest.json')), capture.metadata.media), 'actual original media metadata changed');
    }
    for (const plan of Object.values(prepared.plans) as any[]) {
      const ref = design.artifacts.find(item => sameValue(item, plan.artifact)); requireThat(ref, 'original plan output missing');
      const raw = await regularFile(originalRoot, ref.location + '/_cosmos/transfer-plan.json'), { planSha256, ...data } = plan;
      requireThat(sha(raw) === planSha256 && sameValue(decode(raw), data) && sameValue(plan.binding.design, prepared.frozen), 'original plan bytes or lineage changed');
    }
    const closure = [...design.inputs, ...design.artifacts, ...art.inputs, ...art.artifacts].filter(ref => ref.location.startsWith('registry/captures/'));
    requireThat(captures.every(item => closure.some(ref => sameValue(item.artifactRef, ref))), 'manifest contains unrelated captures');
    const imported = await optional(targetRoot, mappingPath);
    if (imported) {
      requireThat(sameValue(decode(imported), mapping(value)), 'import Root mapping receipt changed');
      for (const item of value.captures) {
        requireThat((await regularFile(targetRoot, capturePath(item.ref) + '/capture.json')).equals(await regularFile(originalRoot, capturePath(item.ref) + '/capture.json')), 'imported capture manifest changed');
        const files = await snapshot(join(targetRoot, item.ref.location)), original = captureFiles.get(item.ref.location)!;
        requireThat(files.size === original.size && [...files].every(([path, raw]) => original.get(path)?.equals(raw)), 'imported canonical capture bytes changed');
      }
    }
    await readManifest(signal); signal.throwIfAborted();
    return freeze({ manifest: value, sourceRequirement: value.requirement, stages: value.stages, captures,
      template: template.artifactRef, requirementCapture: requirement.artifactRef, designArtifacts: design.artifacts, mediaArtifact: art.artifacts[0], frozen: prepared.frozen });
  }
  function mapping(manifest: HistoricalPassedManifest) {
    return { formatVersion: 'historical-stage-root-mapping/1', originalRoot, targetRoot, manifestRef, stages: manifest.stages.map(({ role, task }) => ({ role, taskId: task.taskId, artifacts: task.artifacts })), captures: manifest.captures };
  }
  return Object.freeze({ originalRoot, targetRoot, manifestRef, readManifest, verify, async import(signal: AbortSignal) {
    const verified = await verify(signal);
    if (await optional(targetRoot, mappingPath)) return verified;
    // Unknown/partial destinations are never silently overwritten, even with equal bytes.
    for (const item of verified.manifest.captures) requireThat(!await lstat(join(targetRoot, capturePath(item.ref))).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; }), 'unknown or duplicate import destination');
    for (const item of verified.manifest.captures) {
      signal.throwIfAborted(); const folder = await directory(targetRoot, capturePath(item.ref));
      await writeFile(join(folder, 'capture.json'), await regularFile(originalRoot, capturePath(item.ref) + '/capture.json'), { flag: 'wx', signal });
      for (const [path, raw] of await snapshot(join(originalRoot, item.ref.location))) {
        const folderName = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
        const destination = await directory(targetRoot, item.ref.location + (folderName === '.' ? '' : '/' + folderName));
        await writeFile(join(destination, path.slice(path.lastIndexOf('/') + 1)), raw, { flag: 'wx', signal });
      }
    }
    await verify(signal); await publishReceipt(join(targetRoot, mappingPath), mapping(verified.manifest), signal);
    return verify(signal);
  } });
}
