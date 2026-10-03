import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleSession } from '../../src/roles/factory.ts';
import { prepareClarification, confirmRequirements } from '../../src/roles/requirements.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { RunController } from '../../src/runtime/run.ts';
import type { ArtifactReference, EvidenceContract, TaskContract } from '../../src/contracts/types.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import type { ArtifactRegistry } from '../../src/artifacts/index.ts';
import type { MediaMetadata, PassedEvidence } from '../../src/artifacts/types.ts';
import { directory, safePath } from '../../src/artifacts/paths.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { filteredChildEnvironment, PILOT_LIMITS, requestReservation } from './admission.ts';
import type { PilotGuard } from './budget.ts';
import { createPilotAcceptance } from './acceptance.ts';
import { buildProject, copyReviewInputs, files, jsonFile, serveBuild, writeJson } from './host.ts';
import { renderMedia, validateMediaSpec } from './media.ts';
import { rolePolicies, stageAcceptance, validateRolePlan } from './policy.ts';
import type { Continuation } from './continuation.ts';
import { diagnoseBuild, diagnoseBrowser, diagnosedFailure } from './diagnostics.ts';
import type { Diagnostics } from './diagnostics.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import type { RepairFeedback } from '../../src/runtime/repair/feedback.ts';
import { TRIAL } from './trial.ts';
import type { ExperimentAdmission } from './experiment.ts';
import { startupStep, verifyStartupInputs } from './startup.ts';
import type { ValidationCaseWindow } from '../../src/runtime/validation-types.ts';
import type { ValidationExecutionBinding } from '../../src/runtime/validation-scope.ts';
import type { ValidationRequirement } from '../../src/roles/execution-input.ts';
import type { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { sameValue } from '../../src/contracts/validation.ts';

const ownership = { writePaths: ['.'], readOnlyPaths: [] };
const provenance = (sourceRefs: string[], generator: string) => ({ kind: 'original-procedural' as const, sourceRefs, generator });

/** Production integration: native roles supply every game-specific artifact; host owns validation and promotion. */
export async function generatePilot(options: {
  repository: string; root: string; prefix: string; controller: RunController; guard: PilotGuard;
  toolchain: string; childAllocationCapMicroCny: number; confirmedAt: string;
  /** Offline admission/failure tests only; the production entry always uses the native SDK. */
  sessionFactory?: (config: PiSessionOptions) => Promise<RoleSession>;
  continuation?: Continuation;
  trial?: boolean;
  experiment?: ExperimentAdmission;
  startupRecovery?: boolean;
  /** New host callers may opt into a single durable author format correction. Historical callers omit it. */
  authorProtocolCorrections?: 0 | 1;
  /** Validation-only coding clarification sharing the single author follow-up slot. */
  codingHandoffClarifications?: 0 | 1;
  validation?: { window: ValidationCaseWindow; binding: ValidationExecutionBinding; work: OwnedWork;
    prepareRepair(source: PreparedTask, original: PreparedTask, requirement: ValidationRequirement, registry: ArtifactRegistry): Promise<PreparedTask | null> };
  /** Trusted offline fixture adapters only; production uses the concrete host tools below. */
  host?: { buildProject?: (root: string, project: string, toolchain: string, name: string, signal: AbortSignal, taskId?: string) => ReturnType<typeof buildProject>;
    runAcceptance?: (plan: Parameters<typeof runAcceptance>[0], options: Parameters<typeof runAcceptance>[1], taskId?: string) => ReturnType<typeof runAcceptance>;
    renderMedia?: (root: string, folder: string, value: unknown, signal: AbortSignal, taskId?: string) => ReturnType<typeof renderMedia> };
  repairEstimate?: { costMicroCny: number; durationMs: number; cleanupMs: number; requests: number };
}) {
  const { root, repository, prefix, controller, guard, toolchain } = options;
  if (![0, 1].includes(options.authorProtocolCorrections ?? 0)) throw new Error('Author protocol corrections must be 0 or 1.');
  if (options.authorProtocolCorrections === 1 && !options.validation) throw new Error('Pilot author correction requires explicit validation recovery.');
  if (![0, 1].includes(options.codingHandoffClarifications ?? 0)) throw new Error('Coding handoff clarifications must be 0 or 1.');
  if (options.codingHandoffClarifications === 1 && !options.validation) throw new Error('Pilot coding handoff clarification requires explicit validation recovery.');
  const validation = options.validation;
  if (validation) {
    controller.requireValidationCase(validation.window.caseId, validation.window.windowId);
    if (options.trial || options.experiment || options.continuation || options.startupRecovery || prefix !== validation.window.caseId || guard.deadlineAt !== validation.window.deadlineAt) throw new Error('Validation case cannot use a historical pilot execution path.');
  }
  const bounded = options.experiment?.limits ?? (options.trial ? TRIAL : undefined);
  if (options.experiment && (options.trial || options.continuation || options.startupRecovery || prefix !== options.experiment.experimentId
    || guard.deadlineAt !== options.experiment.deadlineAt || guard.committedCapMicroCny !== options.experiment.committedCapMicroCny
    || options.childAllocationCapMicroCny !== options.experiment.limits.childAllocationMicroCny)) throw new Error('Experiment requires its own fixed admission and guard');
  const host = { buildProject, runAcceptance, renderMedia, ...options.host };
  const frozen = options.continuation?.frozen ?? await jsonFile(repository, 'probes/e2e/requirements.json');
  const startup = { root, signal: guard.signal, recovery: options.startupRecovery };
  const registry = await startupStep({ ...startup, phase: 'registry-create' }, () => createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry', signal: guard.signal, ...(validation ? { work: validation.work } : {}) }));
  const sourceRef = options.continuation?.available[0] ?? registry.artifactRef(`${prefix}-requirements`, frozen.requirementVersion);
  const baseRef = options.continuation?.available[1] ?? registry.artifactRef(`${prefix}-template`, 'v1');
  if (!options.continuation) {
  await startupStep({ ...startup, phase: 'input-validation' }, async () => {
    if (options.startupRecovery) await verifyStartupInputs(repository, root);
    else {
      const inputRoot = await directory(root, 'inputs');
      await cp(join(repository, 'probes/e2e/requirements.json'), join(inputRoot, 'requirements.json'));
      await cp(join(repository, 'src/media/vector.ts'), join(inputRoot, 'character-format.ts'));
      await cp(join(repository, 'src/media/audio.ts'), join(inputRoot, 'audio-format.ts'));
    }
  });
  await startupStep({ ...startup, phase: 'requirements-capture', captureRef: sourceRef }, () => registry.registerCapture({ taskId: validation?.window.quote.declaration.grants.planning.taskId ?? 'COS-10', artifactRef: sourceRef, sourceRoot: 'inputs', ownership, dependencies: [],
    metadata: { kind: 'data', provenance: provenance(['probes/e2e/requirements.json', 'src/media/vector.ts', 'src/media/audio.ts'], validation ? 'Frozen validation input and generic media format' : 'Frozen user-authorized pilot input and generic media format') },
    files: ['requirements.json', 'character-format.ts', 'audio-format.ts'].map(name => ({ source: name, destination: `_cosmos/${name}` })),
  }));
  await startupStep({ ...startup, phase: 'template-capture', captureRef: baseRef }, () => registry.registerCapture({ taskId: validation?.window.quote.declaration.grants.planning.taskId ?? 'COS-10', artifactRef: baseRef, sourceRoot: 'toolchain', ownership, dependencies: [],
    metadata: { kind: 'code', provenance: provenance(['templates/2d'], 'Unchanged generic Phaser toolchain baseline') },
    files: ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'].map(name => ({ source: name, destination: name })),
  }));
  }
  const available = options.continuation?.available ?? [sourceRef, baseRef];
  const draft = validation ? undefined : prepareClarification({ brief: frozen.scope, specVersion: frozen.specVersion, sources: [sourceRef], acceptance: stageAcceptance(frozen.acceptanceIds),
    questions: [{ id: 'scope', prompt: 'Which fixed pilot and normal-input acceptance should Cosmos generate?' }],
    answers: { scope: options.experiment
      ? `The unchanged ${frozen.requirementVersion} scope and all frozen acceptance checks. Coordinator execution decision source: ${options.experiment.decision.source}`
      : `The already authorized ${frozen.requirementVersion} scope and all frozen acceptance checks. Root approved the v2 stage interfaces before any paid generation.` },
  });
  const requirement = validation ? (await validation.binding.readScope(guard.signal)).requirement : options.continuation?.requirement ?? confirmRequirements(draft!, { confirmed: true,
    actorId: options.experiment ? 'coordinator-explicit-execution' : 'user-authorized-COS-10-coordinator', at: options.confirmedAt });
  if (!options.continuation) {
  if (validation) await writeJson(root, 'validation-requirement.json', requirement);
  else await writeJson(root, 'confirmed-requirement.json', { draft, requirement });
  for (const role of ['design', 'art', 'coding']) await directory(root, `authors/${role}`);
  // Only generic source is present before native generation. It is not accepted game evidence.
  await cp(join(toolchain, 'src'), join(root, 'authors/coding/src'), { recursive: true });
  await cp(join(toolchain, 'index.html'), join(root, 'authors/coding/index.html'));
  }
  const refs = { design: registry.artifactRef(`${prefix}-design`, 'v1'), art: registry.artifactRef(`${prefix}-art`, 'v1'), coding: registry.candidateRef(`${prefix}-game`, 'v1') };
  const { policies, repairAllocationMicroCny } = rolePolicies(root, prefix, options.childAllocationCapMicroCny, refs, frozen.acceptanceIds);
  if (bounded) for (const role of ['design', 'art', 'coding'] as const) policies[role].allocationMicroCny = bounded.allocations[role];
  if (validation) for (const role of ['design', 'art', 'coding'] as const) {
    policies[role].allocationMicroCny = validation.window.quote.declaration.grants[role].amountMicroCny;
    policies[role].rules!.push(`Use exactly taskId ${validation.window.quote.declaration.grants[role].taskId} for this ${role} role. The three task IDs are ${['design', 'art', 'coding'].map(name => validation.window.quote.declaration.grants[name as 'design' | 'art' | 'coding'].taskId).join(', ')}. Coding must depend on both the declared design and art task IDs; do not invent other IDs or grants.`);
    policies[role].rules!.push(`This operator_validation case ends at ${validation.window.deadlineAt}. Use the durable validationCase execution deadline; originalDeadlineAt is historical only and no formal window is extended. This case allows CNY ${validation.window.quote.declaration.limits.incrementalMicroCny / 1_000_000} incremental cost, ${validation.window.quote.declaration.limits.durationMs / 60000} minutes, ${validation.window.quote.declaration.limits.maxRequests} requests including reviews, corrections and compaction, and at most one coding repair. Preserve all fixed acceptance.`);
  }
  for (const policy of Object.values(policies)) policy.rules!.push(
    `Read the fixed requirement file ${sourceRef.location}/_cosmos/requirements.json. Media format definitions are ${sourceRef.location}/_cosmos/character-format.ts and ${sourceRef.location}/_cosmos/audio-format.ts. The read tool reads files, not directories.`,
    `The generated design will be ${refs.design.location}/_cosmos/design.json. Generated media metadata will be ${refs.art.location}/public/assets/manifest.json; SVG/WAV paths in that manifest are relative to the final project root. These outputs are readable only after their declared task dependencies pass.`,
    `Generic project files are ${baseRef.location}/package.json and ${baseRef.location}/tsconfig.json. Use the unchanged baseline and put a data URI favicon in generated index.html to avoid unrelated missing-resource console errors.`,
  );
  if (bounded) for (const policy of Object.values(policies)) policy.rules!.push(
    `This independent trial stops at ${guard.deadlineAt} and allows ${bounded.maxRequests} total provider requests including reviews/corrections, with at most one semantic repair. The later shared-ledger deadline and the older source document's 90-minute ceiling do not extend this ${bounded.durationMs / 60_000}-minute trial. All frozen gameplay and host acceptance checks remain required.`,
  );
  const prepared = new Map<string, PreparedTask>();
  const reviewRoots = new Map<string, string>();
  const media = new Map<string, MediaMetadata>();
  const pictures = new Map<string, string[]>();
  const proofs = new Map<string, PassedEvidence>();
  const diagnostics = new Map<string, Diagnostics>();
  let checkCount = 0;

  async function assembleDraft(task: TaskContract, name: string) {
    const path = await directory(root, `checks/${name}/project`);
    for (const input of task.inputs) await cp(join(root, input.location), path, { recursive: true });
    await cp(join(prepared.get(task.taskId)!.workspace, 'authors/coding'), path, { recursive: true });
    return path;
  }
  const roleFactory = createRoleFactory({
    maxOutputTokens: validation?.window.quote.declaration.outputTokens.design ?? PILOT_LIMITS.authorMaxOutputTokens,
    maxRequests: validation?.window.quote.declaration.limits.maxRequests ?? PILOT_LIMITS.maxRequests, requestTimeoutMs: PILOT_LIMITS.requestTimeoutMs,
    ...(validation ? { authorMaxOutputTokens: { art: validation.window.quote.declaration.outputTokens.art, coding: validation.window.quote.declaration.outputTokens.coding } } : {}),
    thinkingLevel: 'low', estimatedMaxCostMicroCny: requestReservation,
    sessionFactory: async config => (options.sessionFactory ?? createPiSession)({ ...config,
      maxOutputTokens: !validation && JSON.parse(config.context).role === 'cosmos' ? PILOT_LIMITS.planningMaxOutputTokens : config.maxOutputTokens,
      budget: guard.wrap(config.budget),
    }),
    hostTools: async input => {
      if (input.role === 'art') return [{ readOnly: true, tool: defineTool({ name: 'check_media', label: 'Validate media data', description: 'Validate the declared mediaSpec.json at the fixed art output path. No arguments.', parameters: Type.Object({}, { additionalProperties: false }),
        async execute() { guard.signal.throwIfAborted(); validateMediaSpec(await jsonFile(root, 'authors/art/mediaSpec.json')); return { content: [{ type: 'text', text: 'All character/audio specifications passed the frozen format and state checks.' }], details: {} }; },
      }) }];
      if (input.role !== 'coding') return [];
      return [{ readOnly: false, tool: defineTool({ name: 'check_project', label: 'Check current project', description: 'Typecheck/build the fixed coding output with its declared media inputs. No commands, paths or arguments accepted.', parameters: Type.Object({}, { additionalProperties: false }),
        async execute() {
          guard.signal.throwIfAborted(); if (++checkCount > 8) throw new Error('Pilot build-check limit reached');
          const task = prepared.get(input.taskId)!.task, name = `draft-${checkCount}`;
          const project = await assembleDraft(task, name);
          const result = await host.buildProject(root, project, toolchain, name, guard.signal, task.taskId);
          await writeJson(root, `checks/${name}/result.json`, result);
          return { content: [{ type: 'text', text: JSON.stringify({ passed: result.passed, diagnostics: result.results.map(r => r.stdout + r.stderr).join('\n').slice(0, 24_000) }) }], details: { passed: result.passed } };
        },
      }) }];
    },
  });

  const planned = options.continuation ? { tasks: options.continuation.tasks, plan: options.continuation.plan }
    : await planTaskDag({ controller, requirement, validation: validation?.binding, planningTaskId: validation?.window.quote.declaration.grants.planning.taskId ?? 'COS-10', workspace: root, sessionRoot: join(root, 'sessions'), availableArtifacts: available,
      roles: policies, roleFactory, signal: guard.signal });
  if (!options.continuation) validateRolePlan(planned.tasks, prefix, frozen.acceptanceIds);
  for (const item of planned.tasks) prepared.set(item.task.taskId, item);
  if (!options.continuation) await writeJson(root, 'plan-reference.json', planned.plan);

  const evidence = (task: TaskContract, path: string, outcome: 'passed' | 'failed', summary: string): EvidenceContract => ({
    contractVersion: '1.0.0', evidenceId: `${task.taskId}-host`, taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report',
    source: { artifactId: `${task.taskId}-host-report`, version: 'v1', location: path }, artifactVersions: [...task.inputs, ...task.artifacts], outcome, recordedAt: new Date().toISOString(), summary,
  });
  const callbacks = {
    async capture(task: TaskContract, _proposal: unknown, signal: AbortSignal) {
      signal.throwIfAborted(); const item = prepared.get(task.taskId)!; const output = item.expectedArtifacts![0];
      const authorRoot = relative(root, join(item.workspace, `authors/${item.role}`)).replaceAll('\\', '/'), inputs = task.inputs;
      const origin = provenance([task.attempts.at(-1)!.sessionRef, ...inputs.map(i => `${i.artifactId}@${i.version}`)], 'New native Cosmos role output in this timed run');
      if (item.role === 'design') {
        if (options.continuation) {
          // The clarification role cannot write; retain the original immutable design capture and its provenance.
          await registry.getCapture(options.continuation.designRef);
        } else {
        await registry.registerCapture({ taskId: task.taskId, artifactRef: output, sourceRoot: authorRoot, ownership, dependencies: inputs,
          files: [{ source: 'design.json', destination: '_cosmos/design.json' }], metadata: { kind: 'data', provenance: origin } });
        }
      } else if (item.role === 'art') {
        const rendered = await host.renderMedia(root, `rendered/${task.taskId}`, await jsonFile(item.workspace, 'authors/art/mediaSpec.json'), signal, task.taskId);
        const selected = (await files(join(root, `rendered/${task.taskId}`))).filter(name => name !== 'contact-sheet.png');
        await registry.registerCapture({ taskId: task.taskId, artifactRef: output, sourceRoot: `rendered/${task.taskId}`, ownership, dependencies: inputs,
          files: selected.map(name => ({ source: name, destination: name })), metadata: { kind: 'media', provenance: { ...origin, generator: 'Native art role MediaSpec + Cosmos bounded vector/PCM renderers' }, media: rendered.media } });
        media.set(output.artifactId, rendered.media); pictures.set(task.taskId, [rendered.screenshot]);
      } else {
        const codeRef = registry.artifactRef(`${prefix}-code`, output.version);
        const selected = await files(join(root, authorRoot));
        if (!selected.includes('src/main.ts') || !selected.includes('index.html') || selected.some(name => name !== 'index.html' && !name.startsWith('src/'))) throw new Error('Coding output must stay inside the declared project files');
        await registry.registerCapture({ taskId: task.taskId, artifactRef: codeRef, sourceRoot: authorRoot, ownership, dependencies: inputs,
          files: selected.map(name => ({ source: name, destination: name })), metadata: { kind: 'code', provenance: origin } });
        const captures = await Promise.all(inputs.map(ref => registry.getCapture(ref)));
        await registry.stageCandidate({ taskId: task.taskId, authorId: task.authorId, contextId: task.context.contextId, candidateRef: output, targetRoot: output.location,
          inputs: [...inputs, codeRef], expectedDeps: [...inputs, codeRef], ownership,
          mediaRequirements: captures.filter(c => c.metadata.media).map(c => ({ artifactRef: c.artifactRef, media: c.metadata.media! })),
        });
      }
      const reviewWorkspace = await directory(root, `reviews/${task.taskId}`); reviewRoots.set(task.taskId, reviewWorkspace);
      return { artifacts: [output], reviewWorkspace };
    },
    async verify(task: TaskContract, signal: AbortSignal): Promise<EvidenceContract[]> {
      const item = prepared.get(task.taskId)!, output = task.artifacts[0], reportPath = `evidence/${task.taskId}/host-report.json`;
      const details: Record<string, unknown> = { taskId: task.taskId, role: item.role, artifactVersions: [...task.inputs, ...task.artifacts], outcome: 'failed',
        files: (await files(join(root, output.location))).map(name => `${output.location}/${name}`) };
      let passed = false;
      const supplemental: EvidenceContract[] = [];
      try {
        signal.throwIfAborted();
        if (item.role === 'design') {
          const design = await jsonFile(root, `${output.location}/_cosmos/design.json`);
          if (!design || typeof design.summary !== 'string' || !design.summary.trim() || !Array.isArray(design.implementationNotes) || !design.implementationNotes.length
            || !design.implementationNotes.every((s: unknown) => typeof s === 'string' && s.trim()) || frozen.acceptanceIds.some((id: string) => typeof design.acceptanceMapping?.[id] !== 'string' || !design.acceptanceMapping[id].trim())) throw new Error('Design mapping is incomplete');
          details.check = 'Design schema and every gameplay acceptance mapping exist; independent review still checks fidelity.';
        } else if (item.role === 'art') {
          const captured = await registry.getCapture(output); details.media = captured.metadata.media;
          details.check = 'Registry validated every rendered frame/WAV against the generated manifests; source session retained.';
        } else {
          const proof = await registry.verifyCandidate(output, {
            build: async (_candidate, project) => {
              const result = await host.buildProject(root, project, toolchain, `${task.taskId}-final`, signal, task.taskId);
              await writeJson(root, `evidence/${task.taskId}/build.json`, result);
              details.buildLog = `evidence/${task.taskId}/build.json`;
              const checked = diagnoseBuild(task, result, details.buildLog as string); diagnostics.set(task.taskId, checked);
              supplemental.push({ ...evidence(task, `evidence/${task.taskId}/build.json`, result.passed ? 'passed' : 'failed', 'Host typecheck/build diagnostics; gameplay verdict is in the combined host report'),
                evidenceId: `${task.taskId}-build-log`, kind: 'log', outcome: 'observed', source: { artifactId: `${task.taskId}-build-report`, version: 'v1', location: `evidence/${task.taskId}/build.json` } });
              return { passed: result.passed && checked.reportValid && !checked.issues.length, evidenceIds: [`${task.taskId}-build`] };
            },
            acceptance: async (_candidate, project) => {
              const server = await serveBuild(project);
              try {
                const plan = createPilotAcceptance(output, server.url, prefix, `${task.taskId}-browser`);
                if (validation) plan.taskId = task.taskId;
                const report = await host.runAcceptance(plan, {
                  evidenceRoot: join(root, 'browser-evidence'), channel: 'msedge', env: filteredChildEnvironment(process.env), timeoutMs: Math.min(frozen.limits.browserTimeoutMs, guard.remainingMs()),
                }, task.taskId);
                details.browserReport = `browser-evidence/${report.reportPath}`;
                const checked = diagnoseBrowser(task, report, plan, details.browserReport as string);
                diagnostics.set(task.taskId, { ...checked, passedChecks: [...(diagnostics.get(task.taskId)?.passedChecks ?? []), ...checked.passedChecks] });
                const selectedPictures = report.steps.filter(s => s.screenshot && (['胜利', '失败'].includes(String(s.actual)) || s.id.endsWith('events-defenderHits') && s.actual === 1)).slice(0, 3).map(s => `browser-evidence/${s.screenshot!}`);
                pictures.set(task.taskId, checked.reportValid ? selectedPictures : []);
                if (checked.reportValid) for (const entry of report.evidence) supplemental.push({ ...entry, taskId: task.taskId, source: { ...entry.source, location: `browser-evidence/${entry.source.location}` },
                  artifactVersions: [...task.inputs, ...task.artifacts] });
                return { passed: report.outcome === 'passed' && checked.reportValid && !checked.issues.length, evidenceIds: [`${task.taskId}-browser`] };
              } finally { await server.close(); }
            },
          });
          proofs.set(task.taskId, proof); details.verificationAttemptId = proof.attemptId; details.proof = proof;
          details.additionalHostChecks = { source: 'New native author session outputs captured in registry', offline: 'Browser blocks non-project network requests', media: 'Frozen load/state/audio observations plus fixed SVG/WAV interface and reviewer image inspection', standalone: 'Fresh build directory from pinned generic dependencies; candidate includes source, lockfile and dist' };
        }
        passed = true; details.outcome = 'passed';
      } catch (error) { details.failure = validation ? 'Host check did not establish acceptance; inspect fixed host reports.' : error instanceof Error ? error.message : 'Host check failed'; }
      await writeJson(root, reportPath, details);
      const result = [evidence(task, reportPath, passed ? 'passed' : 'failed', `${item.role} host validation: ${passed ? 'passed' : 'failed'}; see exact fixed-version report`), ...supplemental];
      for (const [index, path] of (pictures.get(task.taskId) ?? []).entries()) if (!result.some(e => e.source.location === path)) result.push({ ...result[0], evidenceId: `${task.taskId}-image-${index}`, kind: 'screenshot', outcome: 'observed', source: { artifactId: `${task.taskId}-image-${index}`, version: 'v1', location: path }, summary: 'Host-rendered image of this captured version' });
      if (passed) await copyReviewInputs(root, reviewRoots.get(task.taskId)!, [...task.inputs, ...task.artifacts, ...task.context.interfaces, ...result.map(e => e.source)]);
      return result;
    },
    async reviewImages(task: TaskContract, signal: AbortSignal) {
      return Promise.all((pictures.get(task.taskId) ?? []).map(async path => {
        signal.throwIfAborted(); const source = task.evidence.find(e => e.source.location === path)!.source;
        return { source, image: { type: 'image' as const, mimeType: 'image/png', data: (await readFile(join(root, path))).toString('base64') } };
      }));
    },
  };
  const recovery = { artifactRoot: root, journalRoot: join(root, 'journal'), recoverCapture: async (task: TaskContract) => {
    const item = prepared.get(task.taskId), ref = item?.expectedArtifacts?.[0]; if (!item || !ref || !sameValue(task.artifacts, [ref])) return null;
    try {
      const capture = await registry.getCapture(item.role === 'coding' ? registry.artifactRef(`${prefix}-code`, ref.version) : ref);
      if (capture.taskId !== task.taskId || !capture.metadata.provenance.sourceRefs.includes(task.attempts.at(-1)!.sessionRef) || !sameValue(capture.dependencies, task.inputs)) return null;
      if (item.role === 'coding') { const candidate = await registry.getCandidate(ref); if (candidate.taskId !== task.taskId || candidate.authorId !== task.authorId || candidate.contextId !== task.context.contextId) return null; }
      return { artifacts: [ref], reviewWorkspace: join(root, `reviews/${task.taskId}`) };
    } catch { return null; }
  } };
  const execution = (tasks: PreparedTask[], availableArtifacts: ArtifactReference[]) => ({ controller, requirement, validation: validation?.binding, tasks, sessionRoot: join(root, 'sessions'),
    ...(options.authorProtocolCorrections !== undefined ? { authorProtocolCorrections: options.authorProtocolCorrections } : {}),
    ...(options.codingHandoffClarifications === 1 ? { codingHandoffClarifications: 1 as const } : {}),
    availableArtifacts, roleFactory, signal: guard.signal, reviewProtocolCorrections: (validation?.window.quote.declaration.limits.reviewProtocolCorrections ?? bounded?.reviewProtocolCorrections ?? 0) as 0 | 1,
    ...((bounded || validation) ? { diagnoseFailure: (task: TaskContract, stage: string) => stage === 'host_verification' ? diagnosedFailure(task, diagnostics.get(task.taskId)) : undefined } : {}),
    ...(validation ? { recovery } : {}), ...callbacks });
  const execute = (tasks: PreparedTask[], availableArtifacts: ArtifactReference[]) => executeTaskDag(execution(tasks, availableArtifacts));
  const results = await execute(planned.tasks, available);
  let coding = results.find(task => prepared.get(task.taskId)?.role === 'coding')!;
  if (validation && ['failed', 'needs_changes'].includes(coding.state) && results.filter(task => task !== coding).every(task => task.state === 'passed') && !guard.signal.aborted) {
    const source = { ...prepared.get(coding.taskId)!, task: (await controller.read()).tasks.find(task => task.taskId === coding.taskId)! };
    const repair = await validation.prepareRepair(source, prepared.get(coding.taskId)!, requirement as ValidationRequirement, registry);
    if (repair) {
      prepared.set(repair.task.taskId, repair);
      const resumed = await resumeTaskDag(execution([...planned.tasks.filter(item => item.task.taskId !== coding.taskId), repair], available));
      const repaired = resumed.tasks.find(task => task.taskId === repair.task.taskId); if (repaired) { results.push(repaired); coding = repaired; }
    }
  }
  // One explicit role repair, preserving the failed task, original guard and ledger. Earlier-role failure is reported as a gap.
  if (bounded && coding.state !== 'passed' && ['failed', 'needs_changes', 'waiting_user'].includes(coding.state)
    && coding.attempts.length && results.filter(task => task !== coding).every(task => task.state === 'passed') && !guard.signal.aborted) {
    const snapshot = await controller.read(), source = { ...prepared.get(coding.taskId)!, task: snapshot.tasks.find(task => task.taskId === coding.taskId)! };
    const feedbackPath = relative(root, join(source.task.attempts.at(-1)!.sessionRef, 'failure.json')).replaceAll('\\', '/');
    const feedback = await jsonFile(root, feedbackPath) as RepairFeedback;
    const estimate = options.repairEstimate ?? bounded.repairEstimate;
    const policy = { snapshot, requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(), estimate, cancelled: guard.signal.aborted };
    const decision = assessRepair(policy), journal = await jsonFile(root, 'pilot-budget.json');
    const committed = snapshot.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
    const trialStop = committed + estimate.costMicroCny > guard.committedCapMicroCny ? 'trial_budget'
      : Date.now() + estimate.durationMs + estimate.cleanupMs >= Date.parse(guard.deadlineAt) ? 'trial_deadline'
      : journal.requestIds.length + estimate.requests > bounded.maxRequests ? 'trial_requests' : null;
    await writeJson(root, 'repair-decision.json', { ...decision, trialStop, estimate, sourceFeedback: feedback.reference,
      action: trialStop ? 'stop' : decision.action, automaticDispatch: !trialStop && decision.action === 'repair' });
    if (!trialStop && decision.action === 'repair') {
      const repairedRef = registry.candidateRef(`${prefix}-game`, 'v2');
      const repair = createLinkedRepairTask({ ...policy, source, taskId: `${prefix}-repair`, allocationMicroCny: bounded.allocations.repair,
        outputs: source.task.outputs.map(output => ({ ...output, destination: repairedRef.location })), expectedArtifacts: [repairedRef] });
      // Add only exact host evidence references so feedback-linked diagnostics can actually be read.
      for (const evidence of source.task.evidence.filter(item => ['test_report', 'log'].includes(item.kind))) {
        if (!repair.task.context.interfaces.some(ref => ref.artifactId === evidence.source.artifactId)) repair.task.context.interfaces.push(evidence.source);
      }
      await writeJson(root, 'repair-dispatch.json', { sourceTaskId: source.task.taskId, sourceAttemptId: feedback.sourceAttemptId, newTaskId: repair.task.taskId,
        feedback: feedback.reference, expectedArtifacts: repair.expectedArtifacts, semanticRepairUsed: 1, maxSemanticRepairs: 1, deadlineAt: guard.deadlineAt });
      const destination = await safePath(root, feedback.reference.location); await mkdir(dirname(destination), { recursive: true });
      await cp(await safePath(root, feedbackPath), destination, { force: false, errorOnExist: true });
      prepared.set(repair.task.taskId, repair);
      const repaired = await execute([repair], [...available, ...results.filter(task => task.state === 'passed').flatMap(task => task.artifacts)]);
      results.push(...repaired); coding = repaired[0];
    }
  }
  // The historical entry keeps its original behavior; it remains consumed and cannot reopen the old run.
  if (!validation && !bounded && !options.continuation && coding.state !== 'passed' && ['failed', 'needs_changes'].includes(coding.state)
    && results.filter(task => task !== coding).every(task => task.state === 'passed') && !guard.signal.aborted) {
    const failurePath = `evidence/${coding.taskId}/repair-input.json`;
    await writeJson(root, failurePath, { state: coding.state, stateReason: coding.stateReason, handoff: coding.handoff,
      artifacts: coding.artifacts, evidence: coding.evidence, attempts: coding.attempts,
      hostReport: await jsonFile(root, `evidence/${coding.taskId}/host-report.json`).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null; throw error;
      }),
    });
    const original = prepared.get(coding.taskId)!, repair = structuredClone(original);
    repair.task.taskId = `${prefix}-repair`; repair.task.authorId = `coding-${randomUUID()}`; repair.task.context.contextId = `author-${randomUUID()}`;
    repair.task.budget.allocationMicroCny = repairAllocationMicroCny;
    repair.task.context.knownFailures = [{ classification: 'code_defect', summary: 'Previous fixed candidate failed host validation or independent review.',
      reproduction: ['Read the fixed failed task and available host report; correct only the assigned game output.'], actual: coding.handoff.remaining.join('; '), expected: 'Every unchanged acceptance assertion passes.', evidenceRefs: [failurePath] }];
    const failureRef = { artifactId: `${coding.taskId}-failure`, version: 'v1', location: failurePath };
    repair.task.context.interfaces.push(failureRef);
    repair.task.context.rules.push(`Read ${failureRef.location} and its build/browser diagnostics. Repair only generated code through the same role tools. Original budget/deadline and acceptance remain fixed.`);
    repair.task.ownership.readOnlyPaths.push(`evidence/${coding.taskId}`, 'browser-evidence');
    const repairedRef = registry.candidateRef(`${prefix}-game`, 'v2'); repair.expectedArtifacts = [repairedRef]; repair.task.outputs[0].destination = repairedRef.location;
    prepared.set(repair.task.taskId, repair);
    const repaired = await execute([repair], [...available, ...results.filter(t => t.state === 'passed').flatMap(t => t.artifacts)]);
    results.push(...repaired); coding = repaired[0];
  }
  if (coding.state !== 'passed') return { outcome: 'failed', tasks: results, plan: planned.plan, remaining: 'No independently accepted game candidate. Preserve failed artifacts and evidence.' };
  const proof = proofs.get(coding.taskId)!;
  const accepted = await registry.promoteCandidate(coding.artifacts[0], { evidence: proof, review: {
    candidateRef: coding.artifacts[0], attemptId: proof.attemptId, reviewerId: coding.review.reviewerId!, contextId: coding.review.contextId!, verdict: 'approved', evidenceIds: coding.review.evidenceIds,
  } });
  return { outcome: 'passed', tasks: results, plan: planned.plan, accepted };
}
