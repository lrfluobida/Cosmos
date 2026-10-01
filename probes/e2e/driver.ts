import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleSession } from '../../src/roles/factory.ts';
import { prepareClarification, confirmRequirements } from '../../src/roles/requirements.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { RunController } from '../../src/runtime/run.ts';
import type { ArtifactReference, EvidenceContract, TaskContract } from '../../src/contracts/types.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import type { MediaMetadata, PassedEvidence } from '../../src/artifacts/types.ts';
import { directory } from '../../src/artifacts/paths.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { filteredChildEnvironment, PILOT_LIMITS, requestReservation } from './admission.ts';
import type { PilotGuard } from './budget.ts';
import { createPilotAcceptance } from './acceptance.ts';
import { buildProject, copyReviewInputs, files, jsonFile, serveBuild, writeJson } from './host.ts';
import { renderMedia, validateMediaSpec } from './media.ts';
import { rolePolicies, stageAcceptance, validateRolePlan } from './policy.ts';

const ownership = { writePaths: ['.'], readOnlyPaths: [] };
const provenance = (sourceRefs: string[], generator: string) => ({ kind: 'original-procedural' as const, sourceRefs, generator });

/** Production integration: native roles supply every game-specific artifact; host owns validation and promotion. */
export async function generatePilot(options: {
  repository: string; root: string; prefix: string; controller: RunController; guard: PilotGuard;
  toolchain: string; childAllocationCapMicroCny: number; confirmedAt: string;
  /** Offline admission/failure tests only; the production entry always uses the native SDK. */
  sessionFactory?: (config: PiSessionOptions) => Promise<RoleSession>;
}) {
  const { root, repository, prefix, controller, guard, toolchain } = options;
  const frozen = await jsonFile(repository, 'probes/e2e/requirements.json');
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry' });
  const inputRoot = await directory(root, 'inputs');
  await cp(join(repository, 'probes/e2e/requirements.json'), join(inputRoot, 'requirements.json'));
  await cp(join(repository, 'src/media/vector.ts'), join(inputRoot, 'character-format.ts'));
  await cp(join(repository, 'src/media/audio.ts'), join(inputRoot, 'audio-format.ts'));
  const sourceRef = registry.artifactRef(`${prefix}-requirements`, frozen.requirementVersion);
  await registry.registerCapture({ taskId: 'COS-10', artifactRef: sourceRef, sourceRoot: 'inputs', ownership, dependencies: [],
    metadata: { kind: 'data', provenance: provenance(['probes/e2e/requirements.json', 'src/media/vector.ts', 'src/media/audio.ts'], 'Frozen user-authorized pilot input and generic media format') },
    files: ['requirements.json', 'character-format.ts', 'audio-format.ts'].map(name => ({ source: name, destination: `_cosmos/${name}` })),
  });
  const baseRef = registry.artifactRef(`${prefix}-template`, 'v1');
  await registry.registerCapture({ taskId: 'COS-10', artifactRef: baseRef, sourceRoot: 'toolchain', ownership, dependencies: [],
    metadata: { kind: 'code', provenance: provenance(['templates/2d'], 'Unchanged generic Phaser toolchain baseline') },
    files: ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'].map(name => ({ source: name, destination: name })),
  });
  const available = [sourceRef, baseRef];
  const draft = prepareClarification({ brief: frozen.scope, specVersion: frozen.specVersion, sources: [sourceRef], acceptance: stageAcceptance(frozen.acceptanceIds),
    questions: [{ id: 'scope', prompt: 'Which fixed pilot and normal-input acceptance should Cosmos generate?' }],
    answers: { scope: `The already authorized ${frozen.requirementVersion} scope and all frozen acceptance checks. Root approved the v2 stage interfaces before any paid generation.` },
  });
  const requirement = confirmRequirements(draft, { confirmed: true, actorId: 'user-authorized-COS-10-coordinator', at: options.confirmedAt });
  await writeJson(root, 'confirmed-requirement.json', { draft, requirement });
  for (const role of ['design', 'art', 'coding']) await directory(root, `authors/${role}`);
  // Only generic source is present before native generation. It is not accepted game evidence.
  await cp(join(toolchain, 'src'), join(root, 'authors/coding/src'), { recursive: true });
  await cp(join(toolchain, 'index.html'), join(root, 'authors/coding/index.html'));
  const refs = { design: registry.artifactRef(`${prefix}-design`, 'v1'), art: registry.artifactRef(`${prefix}-art`, 'v1'), coding: registry.candidateRef(`${prefix}-game`, 'v1') };
  const { policies, repairAllocationMicroCny } = rolePolicies(root, prefix, options.childAllocationCapMicroCny, refs, frozen.acceptanceIds);
  for (const policy of Object.values(policies)) policy.rules!.push(
    `Read the fixed requirement file ${sourceRef.location}/_cosmos/requirements.json. Media format definitions are ${sourceRef.location}/_cosmos/character-format.ts and ${sourceRef.location}/_cosmos/audio-format.ts. The read tool reads files, not directories.`,
    `The generated design will be ${refs.design.location}/_cosmos/design.json. Generated media metadata will be ${refs.art.location}/public/assets/manifest.json; SVG/WAV paths in that manifest are relative to the final project root. These outputs are readable only after their declared task dependencies pass.`,
    `Generic project files are ${baseRef.location}/package.json and ${baseRef.location}/tsconfig.json. Use the unchanged baseline and put a data URI favicon in generated index.html to avoid unrelated missing-resource console errors.`,
  );
  const prepared = new Map<string, PreparedTask>();
  const reviewRoots = new Map<string, string>();
  const media = new Map<string, MediaMetadata>();
  const pictures = new Map<string, string[]>();
  const proofs = new Map<string, PassedEvidence>();
  let checkCount = 0;

  async function assembleDraft(task: TaskContract, name: string) {
    const path = await directory(root, `checks/${name}/project`);
    for (const input of task.inputs) await cp(join(root, input.location), path, { recursive: true });
    await cp(join(root, 'authors/coding'), path, { recursive: true });
    return path;
  }
  const roleFactory = createRoleFactory({
    maxOutputTokens: PILOT_LIMITS.authorMaxOutputTokens, maxRequests: PILOT_LIMITS.maxRequests, requestTimeoutMs: PILOT_LIMITS.requestTimeoutMs,
    thinkingLevel: 'low', estimatedMaxCostMicroCny: requestReservation,
    sessionFactory: async config => (options.sessionFactory ?? createPiSession)({ ...config,
      maxOutputTokens: config.systemPrompt.includes('task planner') ? PILOT_LIMITS.planningMaxOutputTokens : config.maxOutputTokens,
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
          const result = await buildProject(root, project, toolchain, name, guard.signal);
          await writeJson(root, `checks/${name}/result.json`, result);
          return { content: [{ type: 'text', text: JSON.stringify({ passed: result.passed, diagnostics: result.results.map(r => r.stdout + r.stderr).join('\n').slice(0, 24_000) }) }], details: { passed: result.passed } };
        },
      }) }];
    },
  });

  const planned = await planTaskDag({ controller, requirement, planningTaskId: 'COS-10', workspace: root, sessionRoot: join(root, 'sessions'), availableArtifacts: available,
    roles: policies, roleFactory, signal: guard.signal });
  validateRolePlan(planned.tasks, prefix, frozen.acceptanceIds);
  for (const item of planned.tasks) prepared.set(item.task.taskId, item);
  await writeJson(root, 'plan-reference.json', planned.plan);

  const evidence = (task: TaskContract, path: string, outcome: 'passed' | 'failed', summary: string): EvidenceContract => ({
    contractVersion: '1.0.0', evidenceId: `${task.taskId}-host`, taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report',
    source: { artifactId: `${task.taskId}-host-report`, version: 'v1', location: path }, artifactVersions: [...task.inputs, ...task.artifacts], outcome, recordedAt: new Date().toISOString(), summary,
  });
  const callbacks = {
    async capture(task: TaskContract, _proposal: unknown, signal: AbortSignal) {
      signal.throwIfAborted(); const item = prepared.get(task.taskId)!; const output = item.expectedArtifacts![0];
      const authorRoot = `authors/${item.role}`, inputs = task.inputs;
      const origin = provenance([task.attempts.at(-1)!.sessionRef, ...inputs.map(i => `${i.artifactId}@${i.version}`)], 'New native Cosmos role output in this timed run');
      if (item.role === 'design') {
        await registry.registerCapture({ taskId: task.taskId, artifactRef: output, sourceRoot: authorRoot, ownership, dependencies: inputs,
          files: [{ source: 'design.json', destination: '_cosmos/design.json' }], metadata: { kind: 'data', provenance: origin } });
      } else if (item.role === 'art') {
        const rendered = await renderMedia(root, `rendered/${task.taskId}`, await jsonFile(root, 'authors/art/mediaSpec.json'), signal);
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
              const result = await buildProject(root, project, toolchain, `${task.taskId}-final`, signal);
              await writeJson(root, `evidence/${task.taskId}/build.json`, result);
              details.buildLog = `evidence/${task.taskId}/build.json`;
              supplemental.push({ ...evidence(task, `evidence/${task.taskId}/build.json`, result.passed ? 'passed' : 'failed', 'Host typecheck/build diagnostics; gameplay verdict is in the combined host report'),
                evidenceId: `${task.taskId}-build-log`, kind: 'log', outcome: 'observed' });
              return { passed: result.passed, evidenceIds: [`${task.taskId}-build`] };
            },
            acceptance: async (_candidate, project) => {
              const server = await serveBuild(project);
              try {
                const report = await runAcceptance(createPilotAcceptance(output, server.url, prefix, `${task.taskId}-browser`), {
                  evidenceRoot: join(root, 'browser-evidence'), channel: 'msedge', env: filteredChildEnvironment(process.env), timeoutMs: Math.min(frozen.limits.browserTimeoutMs, guard.remainingMs()),
                });
                details.browserReport = `browser-evidence/${report.reportPath}`;
                const selectedPictures = report.steps.filter(s => s.screenshot && (['胜利', '失败'].includes(String(s.actual)) || s.id.endsWith('events-defenderHits') && s.actual === 1)).slice(0, 3).map(s => `browser-evidence/${s.screenshot!}`);
                pictures.set(task.taskId, selectedPictures);
                for (const entry of report.evidence) supplemental.push({ ...entry, taskId: task.taskId, source: { ...entry.source, location: `browser-evidence/${entry.source.location}` },
                  artifactVersions: [...task.inputs, ...task.artifacts] });
                return { passed: report.outcome === 'passed', evidenceIds: [`${task.taskId}-browser`] };
              } finally { await server.close(); }
            },
          });
          proofs.set(task.taskId, proof); details.verificationAttemptId = proof.attemptId; details.proof = proof;
          details.additionalHostChecks = { source: 'New native author session outputs captured in registry', offline: 'Browser blocks non-project network requests', media: 'Frozen load/state/audio observations plus fixed SVG/WAV interface and reviewer image inspection', standalone: 'Fresh build directory from pinned generic dependencies; candidate includes source, lockfile and dist' };
        }
        passed = true; details.outcome = 'passed';
      } catch (error) { details.failure = error instanceof Error ? error.message : 'Host check failed'; }
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
  const execute = (tasks: PreparedTask[], availableArtifacts: ArtifactReference[]) => executeTaskDag({ controller, requirement, tasks, sessionRoot: join(root, 'sessions'),
    availableArtifacts, roleFactory, signal: guard.signal, ...callbacks });
  const results = await execute(planned.tasks, available);
  let coding = results.find(task => prepared.get(task.taskId)?.role === 'coding')!;
  // One explicit role repair, preserving the failed task, original guard and ledger. Earlier-role failure is reported as a gap.
  if (coding.state !== 'passed' && ['failed', 'needs_changes'].includes(coding.state)
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
