import { once } from 'node:events';
import { access, cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import type { ProductHost } from '../cli/session.ts';
import type { ArtifactReference, EvidenceContract, TaskContract } from '../contracts/index.ts';
import { validateTask } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { createArtifactRegistry } from '../artifacts/index.ts';
import type { PassedEvidence } from '../artifacts/index.ts';
import { directory, regularFile, safePath, snapshot } from '../artifacts/paths.ts';
import { createRoleFactory } from '../roles/factory.ts';
import { requestDesignDraft, requestDesignQuestions } from '../roles/interview.ts';
import { requireBrowserDraft, validateGameDraft, withHostStages, gameplayAcceptance, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../roles/requirements.ts';
import type { AcceptancePlan } from '../acceptance/plan.ts';
import type { AcceptanceReport } from '../acceptance/runner.ts';
import { runOwnedNode } from './recovery/owned-command.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { HostFailure } from './repair/feedback.ts';
import type { RepairFeedback } from './repair/feedback.ts';
import type { GenerationHost, HostInput } from './entrypoint.ts';
import type { PreparedTask } from './orchestrator.ts';
import { requireOriginalTask } from './recovery/task-journal.ts';
import { requireContinuationInputs } from './continuation-inputs.ts';
import { requireContinuationTask } from './continuation-validation.ts';
import { executionWindowView } from './execution-window.ts';
import { materializeTaskInputs } from './entrypoint-workspace.ts';
import { executeGeneration } from './entrypoint.ts';
import { renderDeclaredMedia, validateDesign, validateDeclaredMedia, withMediaObservations } from './entrypoint-media.ts';
import { validateMedia } from '../artifacts/media.ts';
import type { DesignDocument } from './entrypoint-media.ts';
import type { GameDraft, BrowserGameDraft } from '../roles/requirements.ts';
import type { ExecutionRequirement, ValidationRequirement } from '../roles/execution-input.ts';
import { isValidationRequirement, validateExecutionInput } from '../roles/execution-input.ts';
import type { ValidationExecutionBinding } from './validation-scope.ts';
import { currentValidationCase, requireValidationTask, validationRole } from './validation-validation.ts';
import { requireValidationBrowserScope, requireValidationPreparationScope } from './entrypoint-validation.ts';
import type { ValidationBrowserProposal, ValidationPreparationProposal } from './entrypoint-validation.ts';
import type { BrowserInputPreparation } from './entrypoint-preparation.ts';
import { runPersistentAcceptance } from '../acceptance/persistent.ts';
import type { PersistentAcceptanceSeries, PersistentAcceptanceOptions, PersistentAcceptanceReport } from '../acceptance/persistent.ts';
import type { RoleFactoryOptions } from '../roles/factory.ts';
import type { RoleInput } from '../roles/factory.ts';
import { TaskJournal } from './recovery/task-journal.ts';
import type { RecoveryOptions } from './recovery/task-journal.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from './repair/policy.ts';
import { validationHash } from './validation-validation.ts';
import { createGameDesignCheck, GAME_DESIGN_CHECK, MEDIA_IDENTIFIER_RULE } from './entrypoint-design-check.ts';
import { createCodingBuildCheck, GAME_BUILD_CHECK } from './entrypoint-coding-check.ts';
import { CODING_TEMPLATE_FILES, codingInputSignature } from './coding-check-worker.ts';
import { createHumanPreparationScope } from './entrypoint-human-preparation.ts';
import type { HumanPreparationInput, HumanPreparationScope } from './entrypoint-human-preparation.ts';
import { createHumanContinuationScope } from './entrypoint-human-continuation.ts';
import type { HumanContinuationInput, HumanContinuationScope } from './entrypoint-human-continuation.ts';
import { modeFromSelection, preparationContract } from '../roles/preparation-mode.ts';

const TEMPLATE_FILES = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
const CAPABILITIES = 'Windows Phaser 2D with normal mouse/locator input and visible assertions; independent design/art/coding roles. Art uses bounded procedural SVG layer animations (1-16 characters) and PCM synthesis (0-16 clips, each <=30 seconds). The final candidate must expose read-only actual Phaser media loading, animation-state and sound-start observations; the host checks these against the dynamic manifest alongside normal-input screenshots and independent source review. User listening and visual recognizability remain final experience checks. Put unsupported keyboard/touch, external assets/services, unavailable acceptance adapters or a roster above these bounds in unsupported; do not silently shrink the brief. Full classic-PC benchmark needs its separate COS-14 trusted acceptance adapter, which this generic profile does not supply.';
const requestReservation = (request: { inputBytes: number; maxOutputTokens: number; hasImages: boolean }) => (request.hasImages ? 1_000_000 : request.inputBytes) * 2 + request.maxOutputTokens * 8;
async function writeJson(root: string, name: string, value: unknown) { const path = await safePath(root, name); await mkdir(dirname(path), { recursive: true }); await publishReceipt(path, value); }
async function json(root: string, name: string): Promise<any> { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, name))); }
async function copyRefs(root: string, target: string, refs: ArtifactReference[]) {
  for (const location of new Set(refs.map(ref => ref.location))) {
    const source = await safePath(root, location), destination = await safePath(target, location);
    if ((await lstat(source)).isDirectory()) {
      for (const [name, bytes] of await snapshot(source)) {
        const path = await safePath(destination, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes, { flag: 'wx' });
      }
    } else { await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, await regularFile(root, location), { flag: 'wx' }); }
  }
}

/** The gated launcher is owned before it may start a compiler or browser worker. */
async function ownedNode(input: Pick<HostInput, 'controller'>, authority: HostExecutionAuthority, args: string[], cwd: string, signal: AbortSignal, timeoutMs: number) {
  return runOwnedNode({ controller: input.controller, authority, args, cwd, signal, timeoutMs });
}
async function serve(project: string) {
  const server = createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1) || 'index.html';
      const bytes = await regularFile(join(project, 'dist'), name);
      const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local preview address.');
  return { url: `http://127.0.0.1:${address.port}`, async close() { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); } };
}
export interface HostExecutionAuthority { taskId: string; windowId: string | null; deadlineAt: string; caseId?: string }
export interface BrowserBuildReport {
  passed: boolean; diagnostics: string; work?: string;
  results?: { code: number | null; stdout: string; stderr: string }[];
}
export interface BrowserHostIO {
  build(project: string, name: string, signal: AbortSignal, authority: HostExecutionAuthority): Promise<BrowserBuildReport>;
  play(plan: AcceptancePlan, signal: AbortSignal, authority: HostExecutionAuthority): Promise<AcceptanceReport>;
  playPersistent?(series: PersistentAcceptanceSeries, options: PersistentAcceptanceOptions, authority: HostExecutionAuthority): Promise<PersistentAcceptanceReport>;
}
function nativeIO(input: Pick<HostInput, 'root' | 'controller' | 'work'>): BrowserHostIO {
  return {
    async build(project, name, signal, authority) {
      if (name !== authority.taskId) throw new Error('Build task differs from its host execution authority.');
      const root = await directory(input.root, `builds/${name}`), toolchain = join(input.root, 'toolchain');
      await cp(toolchain, root, { recursive: true }); await cp(project, root, { recursive: true });
      let diagnostics = ''; const results: NonNullable<BrowserBuildReport['results']> = [];
      for (const args of [[join(toolchain, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], [join(toolchain, 'node_modules/vite/bin/vite.js'), 'build']]) {
        const result = await ownedNode(input, authority, args, root, signal, 120000); diagnostics += result.diagnostics; results.push(result);
        if (!result.passed) return { passed: false, diagnostics, work: root, results };
      }
      signal.throwIfAborted(); await cp(join(root, 'dist'), join(project, 'dist'), { recursive: true, errorOnExist: true, force: false });
      return { passed: true, diagnostics, work: root, results };
    },
    async play(plan, signal, authority) {
      if (plan.taskId !== authority.taskId) throw new Error('Browser task differs from its host execution authority.');
      const path = `browser-plans/${plan.reportId}.json`; await writeJson(input.root, path, plan);
      const result = `browser-results/${plan.reportId}.json`; await directory(input.root, 'browser-results');
      const runner = new URL(import.meta.url.endsWith('.ts') ? '../acceptance/runner.ts' : '../acceptance/runner.js', import.meta.url).href;
      const source = `import {readFile,writeFile} from 'node:fs/promises';import {runAcceptance} from ${JSON.stringify(runner)};const plan=JSON.parse(await readFile(process.argv[1],'utf8'));const report=await runAcceptance(plan,{evidenceRoot:process.argv[2],channel:'msedge',env:process.env,timeoutMs:Number(process.argv[4])});await writeFile(process.argv[3],JSON.stringify(report),'utf8');`;
      const remaining = Date.parse(authority.deadlineAt) - Date.now() - 5000;
      if (remaining < 1000) throw new Error('Execution window time is insufficient for browser cleanup.');
      await ownedNode(input, authority, ['--experimental-strip-types', '--input-type=module', '-e', source, join(input.root, path), join(input.root, 'browser-evidence'), join(input.root, result), String(Math.min(180000, remaining))], input.root, signal, Math.min(185000, remaining + 1000));
      return json(input.root, result);
    },
    async playPersistent(series, options, authority) {
      if (series.segments.some(segment => segment.plan.taskId !== authority.taskId)
        || options.deadlineAt !== Date.parse(authority.deadlineAt)) throw new Error('Persistent browser task or deadline differs from host authority.');
      return input.work.run(async signal => runPersistentAcceptance(series, { ...options, signal: AbortSignal.any([signal, ...(options.signal ? [options.signal] : [])]),
        ownedChild: {
          prepare: async () => { await options.verifyBinding(); return input.controller.prepareOwnedChild(authority.windowId ? { taskId: authority.taskId, windowId: authority.windowId } : undefined); },
          register: async (pid, ticket) => { await input.controller.registerOwnedChild(pid, ticket); await options.verifyBinding(); },
        } }));
    },
  };
}
function validBrowserReport(report: AcceptanceReport, plan: AcceptancePlan): boolean {
  return report?.formatVersion === '1.0.0' && report.kind === 'normal_browser_input' && sameValue(report.plan, plan)
    && report.outcome === 'passed' && !!report.browser?.version && report.cleanup?.processExited === true && Array.isArray(report.errors) && report.errors.length === 0
    && Array.isArray(report.steps) && report.steps.length === plan.steps.length && report.steps.every((result, index) => {
      const expected = plan.steps[index];
      return result.id === expected.id && result.kind === expected.kind && result.outcome === 'passed'
        && (!['assert', 'wait-for'].includes(expected.kind) || ('expected' in expected && result.acceptanceId === expected.acceptanceId && result.expected === expected.expected && result.actual === expected.expected));
    });
}

/** Four roles retain separate authority; stage checks never substitute for gameplay. */
export interface BrowserHostBinding { windowId: string; tasks: PreparedTask[] }
export async function createBrowserHost(input: HostInput & { io?: BrowserHostIO; binding?: BrowserHostBinding }): Promise<GenerationHost> {
  if ('preparation' in input) throw new Error('Only the explicit preparation factory accepts a trusted preparation adapter.');
  requireBrowserDraft(input.draft);
  input.controller.requireExecutionWindow(input.binding?.windowId);
  validateGameDraft(input.draft);
  return createBrowserHostCore(input);
}
export interface ValidationBrowserHost extends GenerationHost {
  prepareValidationRepair(source: PreparedTask, feedback: RepairFeedback, recovery: RecoveryOptions): Promise<PreparedTask>;
}
export interface PreparedBrowserHost extends ValidationBrowserHost {
  closePreparation(): Promise<void>;
  bindPreparedCandidate(candidate: ArtifactReference): Promise<unknown>;
  withPreparation<T>(operation: () => Promise<T>): Promise<T>;
  bindPreparedTasks(tasks: PreparedTask[]): Promise<void>;
}
/** Source-owned human adapter; the exact confirmed contract is never converted to a validation profile. */
export async function createHumanPreparedBrowserHost(input: HumanPreparationInput & {
  preparation: BrowserInputPreparation; io?: BrowserHostIO; sessionFactory?: RoleFactoryOptions['sessionFactory'];
}): Promise<PreparedBrowserHost> {
  if ('validation' in input || 'binding' in input || 'proposal' in input || !input.preparation) throw new Error('Human preparation requires its original confirmed draft.');
  try {
    const humanPreparation = await createHumanPreparationScope(input);
    return await createBrowserHostCore({ ...input, humanPreparation }) as PreparedBrowserHost;
  } catch (error) { await input.preparation.close(); throw error; }
}
/** Explicit first-window factory; historical human tasks never receive this current authorization. */
export async function createHumanPreparedContinuationHost(input: HumanContinuationInput & {
  preparation: BrowserInputPreparation; io?: BrowserHostIO; sessionFactory?: RoleFactoryOptions['sessionFactory'];
}): Promise<PreparedBrowserHost> {
  if ('validation' in input || 'proposal' in input || !input.preparation || !input.binding?.preparation) throw new Error('Human continuation requires its exact prepared window binding.');
  try { const humanPreparation = await createHumanContinuationScope(input); return await createBrowserHostCore({ ...input, humanPreparation }) as PreparedBrowserHost; }
  catch (error) { await input.preparation.close(); throw error; }
}
/** Source-owned preparation opt-in; no public CLI or model-controlled acceptance override. */
export async function createValidationPreparedBrowserHost(input: Omit<HostInput, 'requirement' | 'draft' | 'binding'> & {
  requirement: ValidationRequirement; proposal: ValidationPreparationProposal; validation: ValidationExecutionBinding;
  preparation: BrowserInputPreparation; io?: BrowserHostIO; sessionFactory?: RoleFactoryOptions['sessionFactory'];
  historicalStages?: import('./historical-passed-stages.ts').HistoricalPassedStages;
}): Promise<PreparedBrowserHost> {
  if ('binding' in input || 'draft' in input || !input.preparation) throw new Error('Preparation uses only its explicit proposal, trusted adapter and case binding.');
  try {
    const host = await createBrowserHostCore({ ...input, draft: structuredClone(input.proposal) }) as PreparedBrowserHost;
    const capture = host.capture, verify = host.verify, preAuthor = host.preAuthor, validateTasks = host.validateTasks;
    host.capture = async (...args) => { try { return await capture(...args); } catch (error) { await host.closePreparation(); throw error; } };
    host.verify = async (...args) => { try { const evidence = await verify(...args); if (!input.preparation.candidateConsumer && evidence.some(item => item.outcome === 'failed')) await host.closePreparation(); return evidence; }
      catch (error) { await host.closePreparation(); throw error; } };
    if (preAuthor) host.preAuthor = async (...args) => { try { return await preAuthor(...args); } catch (error) { await host.closePreparation(); throw error; } };
    if (validateTasks) host.validateTasks = tasks => { try { validateTasks(tasks); } catch (error) { void host.closePreparation().catch(() => {}); throw error; } };
    return host;
  } catch (error) { await input.preparation.close(); throw error; }
}
/** Internal opt-in assembly. The public ordinary/formal entry does not accept this profile. */
export async function createValidationBrowserHost(input: Omit<HostInput, 'requirement' | 'draft' | 'binding'> & {
  requirement: ValidationRequirement; proposal: ValidationBrowserProposal; validation: ValidationExecutionBinding; io?: BrowserHostIO;
  sessionFactory?: RoleFactoryOptions['sessionFactory'];
}): Promise<ValidationBrowserHost> {
  if ('binding' in input || 'draft' in input || 'preparation' in input) throw new Error('Validation host uses only its explicit operator proposal and case binding.');
  return createBrowserHostCore({ ...input, draft: structuredClone(input.proposal) }) as Promise<ValidationBrowserHost>;
}
interface BrowserHostCoreInput extends Omit<HostInput, 'requirement' | 'draft'> {
  requirement: ExecutionRequirement; draft: GameDraft | ValidationBrowserProposal | ValidationPreparationProposal; io?: BrowserHostIO; validation?: ValidationExecutionBinding;
  preparation?: BrowserInputPreparation;
  sessionFactory?: RoleFactoryOptions['sessionFactory'];
  historicalStages?: import('./historical-passed-stages.ts').HistoricalPassedStages;
  humanPreparation?: HumanPreparationScope | HumanContinuationScope;
}
async function createBrowserHostCore(input: BrowserHostCoreInput): Promise<GenerationHost> {
  const binding = input.binding ? structuredClone(input.binding) : undefined;
  const validation = input.validation && { ...input.validation }, { root, controller, work } = input;
  const preparation = input.preparation;
  const human = input.humanPreparation;
  const historical = input.historicalStages;
  const requirement = structuredClone(input.requirement), draft = structuredClone(input.draft);
  let preparedRequirementRef: ArtifactReference | undefined;
  const validationScope = async () => {
    const scope = preparation ? await requireValidationPreparationScope({ root, controller, requirement: requirement as ValidationRequirement,
    proposal: draft as ValidationPreparationProposal, adapterId: preparation.adapterId, validation: validation! })
    : await requireValidationBrowserScope({ root, controller, requirement: requirement as ValidationRequirement, proposal: draft as ValidationBrowserProposal, validation: validation! });
    if (preparedRequirementRef && !sameValue(await json(root, `${preparedRequirementRef.location}/_cosmos/${historical ? 'current-' : ''}execution-requirement.json`), requirement)) throw new Error('Complete captured preparation requirement binding changed.');
    if (historical) await historical.verify(work.signal);
    return scope;
  };
  const preparationScope = async () => {
    if (!human) { await validationScope(); return; }
    await human.requireCurrent();
    if (preparedRequirementRef && !sameValue(await json(root, `${preparedRequirementRef.location}/_cosmos/execution-requirement.json`), requirement)) throw new Error('Complete captured human preparation requirement binding changed.');
  };
  const scope = validation ? await validationScope() : undefined;
  if (historical && (!validation?.historicalManifest || !preparation || resolve(historical.targetRoot) !== resolve(root)
    || !sameValue(historical.manifestRef, validation.historicalManifest.reference))) throw new Error('Historical host requires its source-owned preparation and exact current scope manifest.');
  const inherited = historical ? await historical.verify(work.signal) : undefined;
  if (inherited && (!isValidationRequirement(requirement) || !sameValue(requirement.acceptance, inherited.sourceRequirement.acceptance)
    || requirement.validation.frozenCaseInputHash !== inherited.sourceRequirement.validation.frozenCaseInputHash)) throw new Error('Current execution changed the accepted historical input or requirements.');
  if (historical) await historical.import(work.signal);
  const inheritedTask = (taskId: string) => inherited?.stages.find(stage => stage.task.taskId === taskId);
  if (draft.unsupported.length || requirement.acceptance.some(item => !item.evidenceKinds.includes('test_report'))
    || ![DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID].every(id => requirement.acceptance.some(item => item.acceptanceId === id))) throw new Error('The browser-input host requires separately confirmed design, media and gameplay checks.');
  const gameplayIds = gameplayAcceptance(draft).map(item => item.acceptanceId);
  const state = await controller.read();
  if (binding) {
    if (!input.resume) throw new Error('A continuation host must reuse its existing registry inputs.');
    await requireContinuationInputs(state, binding.tasks, root);
    for (const item of binding.tasks) {
      if (validateTask(item.task).length || item.task.state !== 'not_started') throw new Error('Host binding requires the fixed prepared task contracts.');
      if (state.continuation!.windows[0].grants.some(grant => grant.taskId === item.task.taskId)) {
        requireContinuationTask(state, item.task);
        const location = relative(root, resolve(item.workspace)).split(sep).join('/');
        if (!/^continuations\/[^/]+\/workspace$/.test(location)) throw new Error('New task workspace must be an isolated continuation workspace.');
        await safePath(root, location);
        if (item.expectedArtifacts?.some(ref => state.tasks.some(task => task.taskId !== item.task.taskId && task.outputs.some(output => output.destination === ref.location)))) throw new Error('Continuation output must use a new fixed registry version.');
      } else if (resolve(item.workspace) !== resolve(root)) throw new Error('Historical passed tasks must retain their original host workspace.');
    }
  }
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry', work, signal: work.signal }), io = input.io ?? nativeIO(input);
  const name = (value: string) => validation ? `${validation.caseId}-${value}` : value;
  const template = inherited?.template ?? registry.artifactRef(name('generic-template'), 'v1'), requirements = registry.artifactRef(name('requirement-bundle'), requirement.sources[0].version);
  const captures = [...(inherited ? [template, inherited.requirementCapture] : [template]), requirements], provenance = { kind: 'original-procedural' as const, generator: 'Cosmos trusted host inputs', sourceRefs: requirement.sources.map(ref => `${ref.artifactId}@${ref.version}`) };
  if (input.resume) {
    const lock = await lstat(join(root, 'registry/.commit.lock')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (lock) await registry.recoverOwnership();
    await registry.getCapture(template); await registry.getCapture(requirements);
  }
  else {
    if (!inherited) await registry.registerCapture({ taskId: 'host-template', artifactRef: template, sourceRoot: 'toolchain', files: TEMPLATE_FILES.map(name => ({ source: name, destination: name })),
      ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'code', provenance } });
    const folder = await directory(root, 'host-requirements');
    for (const ref of requirement.sources) await writeFile(join(folder, `${ref.artifactId}.json`), await regularFile(root, ref.location), { flag: 'wx' });
    if (preparation) await writeFile(join(folder, 'execution-requirement.json'), JSON.stringify(requirement, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    await registry.registerCapture({ taskId: 'host-requirements', artifactRef: requirements, sourceRoot: 'host-requirements',
      files: [...requirement.sources.map(ref => ({ source: `${ref.artifactId}.json`, destination: `_cosmos/${ref.artifactId}.json` })),
        ...(preparation ? [{ source: 'execution-requirement.json', destination: `_cosmos/${historical ? 'current-' : ''}execution-requirement.json` }] : [])],
      ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'data', provenance } });
  }
  const availableArtifacts = [...requirement.sources, ...captures];
  if (validation) for (const ref of captures) await registry.getCapture(ref);
  if (!binding && !validation) { await directory(root, 'authors/coding/src'); await directory(root, 'authors/design'); await directory(root, 'authors/art'); }
  const baseAllocation = state.ledger.allocations.filter(item => ['intake', 'planning'].includes(item.taskId)).reduce((sum, item) => sum + item.amountMicroCny, 0);
  const pool = validation ? 0 : state.ledger.limitMicroCny - baseAllocation, output = registry.candidateRef(name('game'), 'v1');
  const designOutput = inherited?.designArtifacts[0] ?? registry.artifactRef(name('design'), 'v1'), mediaOutput = inherited?.mediaArtifact ?? registry.artifactRef(name('media'), 'v1');
  if (preparation) {
    if (!human && (!validation || !scope)) throw new Error('Preparation requires its explicit execution scope.');
    preparedRequirementRef = requirements; await preparationScope();
    const byRole = (role: string) => { const item = human!.tasks().find(item => item.role === role); if (!item) throw new Error('Human preparation task role is missing.'); return item; };
    const identities = human ? {
      get designTaskId() { return byRole('design').task.taskId; }, get mediaTaskId() { return byRole('art').task.taskId; },
      get candidateTaskIds() { const id = byRole('coding').task.taskId; return { v1: id, v2: `${id.slice(0, 57)}-repair` }; },
      human, taskWorkspace: (taskId: string) => { const item = validationTasks.get(taskId) ?? binding?.tasks.find(item => item.task.taskId === taskId); if (!item) throw new Error('Original human task workspace is not bound.'); return item.workspace; },
    } : { designTaskId: inherited?.stages[0].task.taskId ?? scope!.window.quote.declaration.grants.design.taskId,
      mediaTaskId: inherited?.stages[1].task.taskId ?? scope!.window.quote.declaration.grants.art.taskId,
      candidateTaskIds: { v1: scope!.window.quote.declaration.grants.coding.taskId, v2: scope!.window.quote.declaration.grants.repair.taskId } };
    const context = { root, registry, requirement, requirementCapture: requirements, requirementFile: `_cosmos/${historical ? 'current-' : ''}execution-requirement.json`,
      primaryDesign: designOutput, candidates: { v1: output, v2: registry.candidateRef(name('game'), 'v2') },
      primaryMedia: mediaOutput,
      name, signal: work.signal, resume: input.resume, ...(inherited && historical ? { inherited: { binding: historical, verified: inherited } } : {}),
      requireScope: async () => { work.signal.throwIfAborted(); await preparationScope(); work.signal.throwIfAborted(); } } as import('./entrypoint-preparation.ts').BrowserPreparationContext;
    Object.defineProperties(context, Object.getOwnPropertyDescriptors(identities));
    await preparation.initialize(context);
    if (preparation.currentInputs) availableArtifacts.push(...preparation.currentInputs());
  }
  const proofs = new Map<string, PassedEvidence>(), failures = new Map<string, HostFailure>();
  const pictures = new Map<string, ArtifactReference[]>();
  const validationTasks = new Map<string, PreparedTask>();
  const boundTask = (task: TaskContract) => {
    const old = inheritedTask(task.taskId);
    if (old) { requireOriginalTask(old.task, task); if (!sameValue(old.task, task)) throw new Error('Inherited stage result changed.'); return { task: old.task, role: old.role, workspace: historical!.originalRoot, expectedArtifacts: old.task.artifacts }; }
    const item = validation || human && human.bound() ? validationTasks.get(task.taskId) : binding?.tasks.find(item => item.task.taskId === task.taskId);
    if ((binding || validation || human?.bound()) && !item) throw new Error('Task is outside the fixed host binding.');
    if (item) requireOriginalTask(item.task, task);
    return item;
  };
  const role = (task: TaskContract) => boundTask(task)?.role ?? (task.acceptanceIds.length === 1 && task.acceptanceIds[0] === DESIGN_ACCEPTANCE_ID ? 'design'
    : task.acceptanceIds.length === 1 && task.acceptanceIds[0] === MEDIA_ACCEPTANCE_ID ? 'art' : 'coding');
  const workspace = (task: TaskContract) => boundTask(task)?.workspace ?? root;
  const sourceRoot = (task: TaskContract, folder: string) => relative(root, join(workspace(task), folder)).split(sep).join('/');
  async function requireDispatch(task: TaskContract, signal: AbortSignal) {
    signal.throwIfAborted();
    if (validation) {
      const { snapshot, window } = await validationScope(); boundTask(task); requireValidationTask(snapshot, task);
      const recorded = snapshot.tasks.find(item => item.taskId === task.taskId);
      if (!recorded) throw new Error('Validation host task is not registered.');
      requireOriginalTask(recorded, task);
      const authority = await controller.validationAuthority(task.taskId, 'reviewer');
      if (!authority.admissionAllowed) throw new Error('Validation task has no active host execution authority.');
      if (preparation) await preparation.requireCurrent();
      signal.throwIfAborted(); return { taskId: task.taskId, caseId: window.caseId, windowId: window.windowId, deadlineAt: authority.deadlineAt };
    }
    controller.requireExecutionWindow(binding?.windowId);
    boundTask(task);
    const authority = await controller.executionAuthority(task.taskId);
    if ((binding || human) && !authority.admissionAllowed) throw new Error('Task has no active host execution authority.');
    if (human) { await human.requireCurrent(); await preparation!.requireCurrent(); }
    return { taskId: task.taskId, windowId: authority.windowId, deadlineAt: authority.deadlineAt };
  }
  async function requirePlanningDispatch(roleInput: Readonly<RoleInput>, signal: AbortSignal) {
    if (inherited) throw new Error('Inherited stages require a source-owned coding binding; no planner is dispatched.');
    signal.throwIfAborted();
    const { snapshot, window } = await validationScope(), grant = window.quote.declaration.grants.planning;
    if (roleInput.role !== 'cosmos' || roleInput.purpose !== 'planning' || roleInput.task.taskId !== grant.taskId
      || roleInput.task.budget.allocationMicroCny !== grant.amountMicroCny || resolve(roleInput.workspace) !== resolve(root)
      || roleInput.task.ownership.writePaths.length || roleInput.task.context.tools.some(tool => tool !== 'read')
      || validateExecutionInput({ requirement, task: roleInput.task, ledger: snapshot.ledger, run: snapshot.run }).length) throw new Error('Validation planning differs from its fixed billing grant and read-only scope.');
    const authority = await controller.validationAuthority(grant.taskId, 'planning');
    if (!authority.admissionAllowed) throw new Error('Validation planning has no fixed host authority.');
    if (preparation) await preparation.requireCurrent();
    signal.throwIfAborted();
  }
  const taskOutput = (task: TaskContract) => {
    const old = inheritedTask(task.taskId); if (old) { boundTask(task); return old.task.artifacts[0]; }
    const planned = boundTask(task);
    if (planned) {
      const kind = role(task), identity = name(kind === 'coding' ? 'game' : kind === 'design' ? 'design' : 'media');
      const ref = planned.expectedArtifacts?.find(ref => ref.artifactId === identity);
      const expected = ref && (kind === 'coding' ? registry.candidateRef(name('game'), ref.version) : registry.artifactRef(name(kind === 'design' ? 'design' : 'media'), ref.version));
      const refs = kind === 'design' && preparation ? [designOutput, ...preparation.designOutputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination }))] : ref ? [ref] : [];
      if (!ref || !sameValue(ref, expected) || !sameValue(planned.expectedArtifacts, refs) || task.outputs.length !== refs.length
        || refs.some(ref => !task.outputs.some(output => output.destination === ref.location))) throw new Error('Host binding has an invalid fixed output reference.');
      return ref;
    }
    const kind = role(task), refs = kind === 'coding' ? [output, registry.candidateRef('game', 'v2')] : [registry.artifactRef(kind === 'design' ? 'design' : 'media', 'v1'), registry.artifactRef(kind === 'design' ? 'design' : 'media', 'v2')];
    const ref = refs.find(ref => task.outputs[0]?.destination === ref.location);
    const refsForRole = kind === 'design' && preparation ? [ref, ...preparation.designOutputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination }))] : [ref];
    if (!ref || task.outputs.length !== refsForRole.length || task.outputs.some(item => !refsForRole.some(ref => ref?.location === item.destination))) throw new Error('Host output is not one of the fixed role versions.');
    return ref;
  };
  const nextOutput = (task: TaskContract) => role(task) === 'coding' ? registry.candidateRef('game', 'v2') : registry.artifactRef(role(task) === 'design' ? 'design' : 'media', 'v2');
  const outputRefs = (task: TaskContract) => role(task) === 'design' && preparation ? [taskOutput(task),
    ...preparation.designOutputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination }))] : [taskOutput(task)];
  const artDependencies = (task: TaskContract) => [...captures, selected(task, 'design'), ...(preparation?.artExtraInputs() ?? [])];
  const failureSource = (taskId: string, attemptId: string): ArtifactReference => ({ artifactId: `failure-source-${taskId}`, version: attemptId, location: `failure-sources/${taskId}/${attemptId}` });
  async function stageFeedback(feedback: RepairFeedback) {
    const target = await safePath(root, feedback.reference.location); await mkdir(dirname(target), { recursive: true });
    try { await publishReceipt(target, feedback); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !sameValue(await json(root, feedback.reference.location), feedback)) throw error; }
  }
  async function preserveFailure(task: TaskContract, kind: 'missing_output' | 'invalid_json' | 'invalid_schema', message: string, files: { sourcePath: string; bytes?: Buffer }[]): Promise<never> {
    // Decode before publishing any diagnosis. Unknown encoding/IO remains insufficient evidence.
    for (const file of files) if (file.bytes) new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    const attempt = task.attempts.at(-1)!, ref = failureSource(task.taskId, attempt.attemptId), folder = await directory(root, ref.location);
    const preserved = [];
    for (const [index, file] of files.entries()) {
      const snapshotPath = files.length === 1 ? 'raw.json' : `raw-${index}.txt`;
      if (file.bytes) await writeFile(join(folder, snapshotPath), file.bytes, { flag: 'wx' });
      preserved.push({ sourcePath: file.sourcePath, snapshotPath, present: !!file.bytes });
    }
    await publishReceipt(join(folder, 'manifest.json'), { formatVersion: 1, runId: task.runId, taskId: task.taskId, attemptId: attempt.attemptId,
      sessionRef: attempt.sessionRef, inputs: task.inputs, diagnosis: { kind, message }, files: preserved });
    const failure = new HostFailure(task.acceptance.map(item => ({ acceptanceId: item.acceptanceId, checkId: `role-output-${kind}`, classification: 'code_defect',
      summary: message, reproduction: [...item.steps], actual: message, expected: item.expected, evidenceRefs: [`${ref.location}/manifest.json`] })));
    failures.set(task.taskId, failure); throw failure;
  }
  async function readDeclaredOutput(task: TaskContract, path: string, validate: (value: unknown) => void): Promise<any> {
    let bytes: Buffer;
    try { bytes = await regularFile(workspace(task), path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return preserveFailure(task, 'missing_output', `Required role output is missing: ${path}.`, [{ sourcePath: path }]);
      throw error;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); let value: unknown;
    try { value = JSON.parse(text); }
    catch { return preserveFailure(task, 'invalid_json', `Role output is UTF-8 but not valid JSON: ${path}.`, [{ sourcePath: path, bytes }]); }
    try { validate(value); }
    catch { return preserveFailure(task, 'invalid_schema', `Role output does not match its fixed schema or design roster: ${path}. Read the preserved raw source and the unchanged task rules.`, [{ sourcePath: path, bytes }]); }
    return value;
  }
  const selected = (task: TaskContract, id: string) => {
    const identity = id === 'design' && inherited ? designOutput.artifactId : id === 'media' && inherited ? mediaOutput.artifactId : name(id);
    const ref = task.inputs.find(ref => ref.artifactId === identity); if (!ref) throw new Error(`Missing fixed ${id} dependency.`); return ref;
  };
  const designFor = async (task: TaskContract): Promise<DesignDocument> => {
    const ref = selected(task, 'design'); await registry.getCapture(ref);
    const design = await json(root, `${ref.location}/_cosmos/design.json`); validateDesign(design, gameplayIds); return design;
  };
  const designHostTools: NonNullable<RoleFactoryOptions['hostTools']> = async supplied => {
    if (supplied.role !== 'design') return [];
    const original = (await controller.read()).tasks.find(task => task.taskId === supplied.taskId);
    if (!original || role(original) !== 'design') throw new Error('Game design check requires its original design author task.');
    const fixedWorkspace = await realpath(workspace(original));
    if (resolve(supplied.workspace) !== fixedWorkspace) throw new Error('Game design check workspace differs from its original author.');
    const guard = async (signal: AbortSignal) => {
      signal.throwIfAborted(); work.signal.throwIfAborted(); controller.signal.throwIfAborted();
      const authority = await requireDispatch(original, signal), current = (await controller.read()).tasks.find(task => task.taskId === original.taskId);
      if (!current) throw new Error('Game design check original task is missing.');
      requireOriginalTask(original, current);
      if (current.state !== 'running' || current.attempts.at(-1)?.outcome !== 'running' || !sameValue(current.attempts, original.attempts)
        || Date.now() >= Date.parse(authority.deadlineAt)) throw new Error('Game design check has no active original author attempt or deadline.');
      const active = validation ? await controller.validationAuthority(original.taskId, 'author') : await controller.executionAuthority(original.taskId);
      if (!active.admissionAllowed) throw new Error('Game design check original author authority is inactive.');
      for (const ref of captures) await registry.getCapture(ref);
      for (const ref of requirement.sources) if (!(await regularFile(root, ref.location)).equals(await regularFile(root, `${requirements.location}/_cosmos/${ref.artifactId}.json`))) throw new Error('Game design check fixed requirement source changed.');
      if (await realpath(workspace(original)) !== fixedWorkspace) throw new Error('Game design check original workspace changed.');
      signal.throwIfAborted(); work.signal.throwIfAborted(); controller.signal.throwIfAborted();
    };
    return [createGameDesignCheck({ workspace: fixedWorkspace, gameplayIds, guard }), ...(preparation?.designHostTools ? await preparation.designHostTools.create(supplied) : [])];
  };
  const codingHostTools: NonNullable<RoleFactoryOptions['hostTools']> = async supplied => {
    if (supplied.role !== 'coding') return [];
    const recorded = (await controller.read()).tasks.find(task => task.taskId === supplied.taskId);
    if (!recorded || role(recorded) !== 'coding') throw new Error('Coding check requires its original coding author task.');
    const original = structuredClone(recorded), fixedWorkspace = await realpath(workspace(original)), attempt = original.attempts.at(-1);
    if (resolve(supplied.workspace) !== fixedWorkspace || !attempt) throw new Error('Coding check requires its original author workspace and attempt.');
    const locations = [...original.inputs, ...original.context.interfaces].map(ref => ref.location);
    const fixedInputs = await codingInputSignature(root, locations);
    const guard = async (signal: AbortSignal) => {
      signal.throwIfAborted(); work.signal.throwIfAborted(); controller.signal.throwIfAborted();
      const authority = await requireDispatch(original, signal), currentState = await controller.read();
      const current = currentState.tasks.find(task => task.taskId === original.taskId);
      if (!current) throw new Error('Coding check original task is missing.');
      requireOriginalTask(original, current);
      if (current.state !== 'running' || current.attempts.at(-1)?.outcome !== 'running' || !sameValue(current.attempts, original.attempts)) throw new Error('Coding check original author attempt is inactive or changed.');
      const active = validation ? await controller.validationAuthority(original.taskId, 'author') : await controller.executionAuthority(original.taskId);
      if (!active.admissionAllowed || currentState.ledger.entries.some(entry => entry.unknown) || Date.parse(authority.deadlineAt) - Date.now() <= 5000) throw new Error('Coding check authority, charges or cleanup deadline is unavailable.');
      for (const kind of ['design', 'art']) {
        const dependency = [...(inherited?.stages.map(stage => stage.task) ?? []), ...currentState.tasks].find(task => original.dependsOn.some(dep => dep.taskId === task.taskId) && role(task) === kind);
        if (!dependency || dependency.state !== 'passed' || dependency.review.verdict !== 'approved') throw new Error('Coding check requires passed current design and art inputs.');
      }
      for (const ref of captures) await registry.getCapture(ref);
      await registry.getCapture(selected(original, 'design')); await registry.getCapture(selected(original, 'media'));
      for (const name of CODING_TEMPLATE_FILES) if (!(await regularFile(root, `toolchain/${name}`)).equals(await regularFile(root, `${template.location}/${name}`))) throw new Error('Coding check selected toolchain configuration changed.');
      if (preparation) await preparation.requireCurrent();
      if (await realpath(workspace(original)) !== fixedWorkspace || await codingInputSignature(root, locations) !== fixedInputs
        || await codingInputSignature(fixedWorkspace, locations) !== fixedInputs) throw new Error('Coding check original workspace or fixed input bytes changed.');
      signal.throwIfAborted(); work.signal.throwIfAborted(); controller.signal.throwIfAborted(); return authority;
    };
    await guard(supplied.signal);
    return [createCodingBuildCheck({ controller, work, workspace: fixedWorkspace, toolchain: join(root, 'toolchain'),
      template: join(root, template.location), media: join(root, selected(original, 'media').location), taskId: original.taskId, attemptId: attempt.attemptId, guard })];
  };
  const captureLayout = (...entries: { artifactId: string; paths: string[] }[]) => `Capture file layout: ${JSON.stringify(entries)}. Select the exact current artifactId/version reference in this packet's inputs, including the reviewed task's output artifacts, and read reference.location + '/' + the relative path. Author writes use only the declared authors/... source paths before capture; reviewer and downstream reads use immutable captures. Never append authors/... to a capture root or infer a version/location from an author path. Layout guidance grants no additional read or write permission.`;
  const designLayout = { artifactId: designOutput.artifactId, paths: ['_cosmos/design.json'] };
  const mediaLayout = { artifactId: mediaOutput.artifactId, paths: ['_cosmos/mediaSpec.json', 'public/assets/manifest.json'] };
  const gameLayout = { artifactId: output.artifactId, paths: ['index.html', 'src/main.ts'] };
  const host: GenerationHost = {
    capability: preparation ? 'browser-design-input-preparation-v1' : 'browser-input-media2d-v1', availableArtifacts,
    taskPolicies: [
      { policyId: 'game-design', role: 'design', workspace: root, allocationMicroCny: Math.floor(pool * 0.15), writePaths: ['authors/design/design.json'],
        readOnlyPaths: ['requirements', 'registry'], tools: ['read', 'write', 'edit', GAME_DESIGN_CHECK], outputs: [{ ...designOutput, destination: designOutput.location, type: 'design', schema: 'game-design/1' }],
        rules: [`Cover only ${DESIGN_ACCEPTANCE_ID}; no dependencies. This is a design deliverable, not proof the game passes.`, captureLayout(designLayout),
          `Read ${requirement.sources[0].location}. Write authors/design/design.json with exactly {summary:string,implementationNotes:string[],acceptanceMapping:{gameplayId:string},characters:[{id,purpose,states:string[]}],audio:[{id,trigger,loop:boolean}]}. Map every gameplay ID ${JSON.stringify(gameplayIds)}. Declare 1-16 original characters and 0-16 audio clips required by the confirmed brief; preserve every requested actor, action and audio trigger.`,
          MEDIA_IDENTIFIER_RULE,
          `Before finishing, call ${GAME_DESIGN_CHECK} with no arguments and correct any errors yourself. It checks current generic design bytes only; the host independently captures and validates outputs. It does not change the map, grant a new attempt or authorize semantic rewrites.`,
          'Use only the supported bounded SVG layer animation and procedural PCM audio formats. Do not shrink the confirmed gameplay or fabricate execution evidence.'] },
      { policyId: 'game-art', role: 'art', workspace: root, allocationMicroCny: Math.floor(pool * 0.25), writePaths: ['authors/art/media.json'],
        readOnlyPaths: ['requirements', 'registry'], tools: ['read', 'write', 'edit'], outputs: [{ ...mediaOutput, destination: mediaOutput.location, type: 'game-media', schema: 'original-media/1' }],
        rules: [`Cover only ${MEDIA_ACCEPTANCE_ID}; depend on the design task. Read its exact _cosmos/design.json capture. Write authors/art/media.json with exactly {characters:CharacterSpec[],audio:AudioSpec[]}; IDs, states and loops must exactly match design.`, captureLayout(designLayout, mediaLayout),
          MEDIA_IDENTIFIER_RULE,
          'CharacterSpec: {id,width:16..512,height:16..512,anchor:{x,y},layers:[{id,shape:"rect"|"ellipse",x,y,width,height,fill:"#RRGGBB",stroke:"#RRGGBB",strokeWidth,radius?}],states:[{name,fps:1..60,loop:boolean,frames:[{layerId:{dx?,dy?,rotation?,scaleX?,scaleY?,opacity?}}]}]}. Up to 64 layers, 16 states, 256 total frames; every frame is a pose map and may be {}.',
          'AudioSpec: {id,sampleRate:22050|44100|48000,duration:0.02..30,loop:boolean,notes:[{midi:24..96,start,duration,gain:0..0.5,wave:"sine"|"triangle",attack,release}]}. Notes fit the clip; attack/release each >=0.002, their sum <=note duration. Produce audible original audio. The trusted host renders and validates actual files. Never copy reference artwork/audio.'] },
      { policyId: 'game-code', role: 'coding', workspace: root, allocationMicroCny: Math.floor(pool * 0.40), writePaths: ['authors/coding/src', 'authors/coding/index.html'],
      readOnlyPaths: ['requirements', 'registry', 'repair-feedback'], tools: ['read', 'write', 'edit', GAME_BUILD_CHECK],
      outputs: [{ ...output, destination: output.location, type: 'game-project', schema: 'browser-game/1' }],
      rules: [`Cover exactly the gameplay IDs ${JSON.stringify(gameplayIds)}; depend on both design and art tasks. Implement the actual confirmed brief: ${draft.brief}`, captureLayout(designLayout, mediaLayout, gameLayout),
        preparation ? `Read ${requirement.sources[0].location} for the fixed operator preparation proposal, then the complete captured execution requirement and prepared design plans.`
          : `Read ${requirement.sources[0].location} for the exact user answers and browser scenario.`,
        'Write only authors/coding/index.html and authors/coding/src/main.ts plus necessary files below src. Use the pinned Phaser template and the independent art capture: public/assets/manifest.json gives actual SVG frames and WAV files, served as /assets/... . Read the exact design and media input snapshots. Do not replace art output with coding-only art, modify dependencies or change acceptance.',
        `Before finishing, call ${GAME_BUILD_CHECK} with {}. Fix compiler errors within your existing write scope and check again in this same original coding session and attempt. This advisory check uses the current source, selected template and media; it does not publish a candidate, establish gameplay acceptance or independent approval, or claim a linked repair.`,
        preparation ? 'Provide real mouse gameplay and visible status/selectors required by the frozen design plans. No test-only victory shortcut, network resource, copied reference media or debug setter.'
          : 'Provide real mouse gameplay and visible status/selectors required by the scenario. No test-only victory shortcut, network resource, copied reference media or debug setter.',
        'Expose a non-configurable getter window.cosmosDebug returning frozen plain data. Its media.characters array follows manifest order: {id,loadedFrames,states:[{name,seen}]}; media.audio follows manifest order: {id,decoded,started}. Derive loadedFrames/decoded from actual Phaser texture/audio-cache readiness, states seen from actual displayed animation transitions, and started from successful sound start after normal user input. Preserve cumulative observations across scene changes in this document. Never fill these fields with declared constants or fabricate them; independent review checks their source. The host checks every declared state and audio clip on the frozen normal-input path and reports missing coverage as incomplete.',
        'The host builds, runs normal inputs, captures immutable output and asks a separate reviewer. Return only the required author handoff JSON after writing files.'] }],
    validateTasks(tasks) {
      if (human && !binding) for (const item of tasks) {
        const policy = host.taskPolicies.find(policy => policy.role === item.role);
        if (!policy || validateTask(item.task).length || resolve(item.workspace) !== resolve(policy.workspace)
          || !sameValue(item.expectedArtifacts, policy.outputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination })))
          || !sameValue(item.task.outputs, policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination })))
          || !sameValue(item.task.ownership, { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths }) || !sameValue(item.task.context.rules, policy.rules)
          || !sameValue(item.task.context.tools, policy.tools) || item.task.budget.allocationMicroCny !== policy.allocationMicroCny) throw new Error('Human task differs from its fixed role policy, workspace or outputs.');
        const inputs = [...availableArtifacts, ...item.task.dependsOn.flatMap(dep => tasks.find(parent => parent.task.taskId === dep.taskId)?.expectedArtifacts ?? [])];
        if (!sameValue(item.task.inputs, inputs) || !sameValue(item.task.context.interfaces, policy.interfaces ?? [])) throw new Error('Human task input dependency versions differ from the fixed plan.');
      }
      if (validation) {
        for (const item of tasks) {
          requireValidationTask(state, item.task, scope!.window);
          const policy = host.taskPolicies.find(policy => policy.role === item.role);
          if (!policy || item.task.taskId !== scope!.window.quote.declaration.grants[item.role as 'design' | 'art' | 'coding']?.taskId
            || validateExecutionInput({ requirement, task: item.task, ledger: state.ledger, run: state.run }).length || resolve(item.workspace) !== resolve(policy.workspace) || !sameValue(item.expectedArtifacts, policy.outputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination })))
            || !sameValue(item.task.outputs, policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination })))
            || !sameValue(item.task.ownership, { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths }) || !sameValue(item.task.context.rules, policy.rules)
            || !sameValue(item.task.context.tools, policy.tools) || availableArtifacts.some(ref => !item.task.inputs.some(input => sameValue(input, ref)))) throw new Error('Validation task differs from its fixed workspace, inputs or role policy.');
          const inputs = [...availableArtifacts, ...item.task.dependsOn.flatMap(dep => inheritedTask(dep.taskId)?.task.artifacts ?? tasks.find(task => task.task.taskId === dep.taskId)?.expectedArtifacts ?? [])];
          if (item.task.inputs.length !== inputs.length || item.task.inputs.some(ref => !inputs.some(fixed => sameValue(ref, fixed)))) throw new Error('Validation task input versions differ from the complete fixed dependencies.');
        }
      }
      if (binding && (tasks.length !== binding.tasks.length || tasks.some(item => {
        const fixed = boundTask(item.task);
        return !fixed || item.role !== fixed.role || resolve(item.workspace) !== resolve(fixed.workspace) || !sameValue(item.expectedArtifacts, fixed.expectedArtifacts);
      }))) throw new Error('Tasks differ from the fixed complete host binding.');
      const design = tasks.find(item => item.role === 'design') ?? (inherited && { task: inherited.stages[0].task }), art = tasks.find(item => item.role === 'art') ?? (inherited && { task: inherited.stages[1].task }), coding = tasks.find(item => item.role === 'coding');
      const exact = (left: string[], right: string[]) => left.length === right.length && left.every(id => right.includes(id));
      if (tasks.length !== (inherited ? 1 : 3) || !design || !art || !coding || !exact(design.task.acceptanceIds, [DESIGN_ACCEPTANCE_ID]) || !exact(art.task.acceptanceIds, [MEDIA_ACCEPTANCE_ID])
        || !exact(coding.task.acceptanceIds, gameplayIds) || design.task.dependsOn.length || !exact(art.task.dependsOn.map(item => item.taskId), [design.task.taskId])
        || !exact(coding.task.dependsOn.map(item => item.taskId), [design.task.taskId, art.task.taskId])) throw new Error('The plan must preserve distinct design, art and coding responsibilities and fixed dependency versions.');
      if (validation) {
        if (validationTasks.size) for (const item of tasks) requireOriginalTask(validationTasks.get(item.task.taskId)!.task, item.task);
        else for (const item of tasks) validationTasks.set(item.task.taskId, structuredClone(item));
      }
      tasks.forEach(item => taskOutput(item.task));
    },
    ...(binding || validation || human ? { async preAuthor(task: Readonly<TaskContract>, signal: AbortSignal) {
      await requireDispatch(task, signal);
      const target = workspace(task);
      const humanRepair = human && task.taskId === `${human.tasks().find(item => item.role === 'coding')!.task.taskId.slice(0, 57)}-repair` && resolve(target) === resolve(root);
      if (humanRepair) {
        const fixed = await snapshot(join(root, registry.artifactRef(name('game-source'), 'v1').location)), current = await snapshot(join(target, 'authors/coding'));
        if (current.size !== fixed.size || [...current].some(([path, bytes]) => !fixed.get(path)?.equals(bytes))) throw new Error('Coding repair author bytes differ from the sealed original source.');
      }
      for (const name of task.ownership.writePaths) {
        if (humanRepair && (name === 'authors/coding' || name.startsWith('authors/coding/'))) continue;
        const path = await safePath(target, name), info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
        if (info && (!info.isDirectory() || (await snapshot(path)).size)) throw new Error('Fresh author scope contains unknown partial output; preserve it for investigation.');
      }
      if (!human || resolve(target) !== resolve(root)) await materializeTaskInputs({ artifactRoot: root, workspace: target, task, requirement, signal, ...(validation ? { validation: { caseId: validation.caseId, taskId: task.taskId } } : {}) });
      if (validation && validationRole(currentValidationCase(await controller.read()), task.taskId) === 'repair') {
        const window = currentValidationCase(await controller.read()), source = (await controller.read()).tasks.find(item => item.taskId === window.repair!.sourceTaskId)!;
        const sourceRef = role(task) === 'coding' ? registry.artifactRef(name('game-source'), taskOutput(source).version) : taskOutput(source);
        await registry.getCapture(sourceRef);
        const folder = role(task) === 'coding' ? sourceRef.location : `${sourceRef.location}/_cosmos`;
        await requireDispatch(task, signal);
        for (const [path, bytes] of await snapshot(join(root, folder))) {
          if (role(task) === 'art' && path !== 'mediaSpec.json') continue;
          const output = role(task) === 'art' ? 'media.json' : path;
          const targetFile = await safePath(target, `authors/${role(task)}/${output}`); await mkdir(dirname(targetFile), { recursive: true }); await writeFile(targetFile, bytes, { flag: 'wx' });
        }
      }
      await directory(target, `authors/${role(task) === 'coding' ? 'coding/src' : role(task)}`);
      signal.throwIfAborted();
    } } : {}),
    roleFactory: createRoleFactory({ maxOutputTokens: 8192, authorMaxOutputTokens: { art: 65536, coding: 65536 }, maxRequests: scope?.window.quote.declaration.limits.maxRequests ?? 16, requestTimeoutMs: 120000, codingAuthorRequestTimeoutMs: 600000, estimatedMaxCostMicroCny: requestReservation,
      sessionFactory: input.sessionFactory,
      hostTools: async supplied => [...await designHostTools(supplied), ...await codingHostTools(supplied)],
      ...(validation || human ? { beforeTool: async (roleInput, signal) => {
        if (human && roleInput.purpose === 'planning') { await human.requireCurrent(); return; }
        if (roleInput.purpose === 'planning') await requirePlanningDispatch(roleInput, signal);
        else await requireDispatch(roleInput.task, signal);
      } } : {}) }),
    async capture(task, _proposal, signal) {
      await requireDispatch(task, signal); const ref = taskOutput(task), kind = role(task);
      const origin = { kind: 'original-procedural' as const, generator: `Native ${kind} role output`, sourceRefs: [task.attempts.at(-1)!.sessionRef, ...requirement.sources.map(ref => ref.location)] };
      if (kind === 'design') {
        await readDeclaredOutput(task, 'authors/design/design.json', value => validateDesign(value, gameplayIds));
        if (preparation) { await preparation.captureDesignExtras(task, workspace(task)); await requireDispatch(task, signal); }
        if (validation) await requireDispatch(task, signal);
        await registry.registerCapture({ taskId: task.taskId, artifactRef: ref, sourceRoot: sourceRoot(task, 'authors/design'), files: [{ source: 'design.json', destination: '_cosmos/design.json' }],
          ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, dependencies: captures, metadata: { kind: 'data', provenance: origin } });
      } else if (kind === 'art') {
        const design = await designFor(task), value = await readDeclaredOutput(task, 'authors/art/media.json', value => { validateDeclaredMedia(value, design); });
        const rendered = await renderDeclaredMedia(root, `rendered/${task.taskId}`, value, design, signal);
        if (validation) await requireDispatch(task, signal);
        await registry.registerCapture({ taskId: task.taskId, artifactRef: ref, sourceRoot: `rendered/${task.taskId}`, files: rendered.files.map(name => ({ source: name, destination: name })),
          ownership: { writePaths: ['public/assets', '_cosmos'], readOnlyPaths: [] }, dependencies: artDependencies(task), metadata: { kind: 'media', provenance: origin, media: rendered.media } });
      } else {
        const source = registry.artifactRef(name('game-source'), ref.version), authored = await snapshot(join(workspace(task), 'authors/coding')), files = [...authored.keys()];
        if (files.some(name => name !== 'index.html' && !name.startsWith('src/'))) throw new Error('Out-of-scope author project.');
        const missing = ['src/main.ts', 'index.html'].filter(name => !files.includes(name));
        if (missing.length) await preserveFailure(task, 'missing_output', `Required code outputs are missing: ${missing.join(', ')}.`,
          [...[...authored].map(([name, bytes]) => ({ sourcePath: `authors/coding/${name}`, bytes })), ...missing.map(name => ({ sourcePath: `authors/coding/${name}` }))]);
        // Both plans remain fixed task/review inputs. Only this candidate's plan enters the exact staged dependency closure.
        const inputs = [...captures, selected(task, 'design'), selected(task, 'media'), ...(preparation?.candidateExtraInputs(ref) ?? [])], media = await registry.getCapture(selected(task, 'media'));
        if (validation) await requireDispatch(task, signal);
        await registry.registerCapture({ taskId: task.taskId, artifactRef: source, sourceRoot: sourceRoot(task, 'authors/coding'), files: files.map(name => ({ source: name, destination: name })),
          ownership: { writePaths: ['src', 'index.html'], readOnlyPaths: ['_cosmos'] }, dependencies: inputs, metadata: { kind: 'code', provenance: origin } });
        if (validation) await requireDispatch(task, signal);
        await registry.stageCandidate({ taskId: task.taskId, authorId: task.authorId, contextId: task.context.contextId, candidateRef: ref, targetRoot: ref.location,
          inputs: [...inputs, source], expectedDeps: [...inputs, source], ownership: { writePaths: ['.'], readOnlyPaths: [] }, mediaRequirements: [{ artifactRef: selected(task, 'media'), media: media.metadata.media! }] });
        if (preparation) { await preparation.bindCandidate(ref); await requireDispatch(task, signal); }
      }
      const reviewWorkspace = await directory(root, `reviews/${task.taskId}`); return { artifacts: outputRefs(task), reviewWorkspace };
    },
    async verify(task, signal) {
      const authority = await requireDispatch(task, signal);
      const ref = taskOutput(task), kind = role(task), reportPath = `evidence/${task.taskId}/host-report.json`; let passed = false, actual = 'Host validation did not complete.';
      let classification: 'code_defect' | 'insufficient_evidence' = 'insufficient_evidence';
      let consumerDiagnostics: import('./entrypoint-preparation.ts').BrowserCandidateConsumerResult['diagnostics'] | undefined;
      let consumerRawEvidence: ArtifactReference[] = [];
      try {
        if (kind === 'design') {
          const design = await json(root, `${ref.location}/_cosmos/design.json`); validateDesign(design, gameplayIds);
          if (preparation) { await preparation.verifyDesignExtras(task); await requireDispatch(task, signal); } passed = true;
        } else if (kind === 'art') {
          const captured = await registry.getCapture(ref), design = await designFor(task);
          validateDeclaredMedia(await json(root, `${ref.location}/_cosmos/mediaSpec.json`), design);
          if (!captured.metadata.media) throw new Error('Missing generated media manifest.');
          await validateMedia(captured.metadata.media, join(root, ref.location), captured.files.map(file => file.destination)); passed = true;
        } else if (preparation && !preparation.candidateConsumer) {
          await preparation.bindCandidate(ref); await requireDispatch(task, signal);
          actual = 'Transfer inputs are bound; persistent/media execution consumer is not connected. Preparation cannot establish gameplay acceptance.';
        } else {
        const proof = await registry.verifyCandidate(ref, {
          build: async (_candidate, project) => {
            const checked = await io.build(project, task.taskId, signal, validation ? await requireDispatch(task, signal) : authority);
            if (validation) await requireDispatch(task, signal);
            await writeJson(root, `evidence/${task.taskId}/build.json`, checked);
            if (!checked.passed) {
              if (preparation?.candidateConsumer) {
                consumerDiagnostics = preparation.candidateBuildDiagnostic?.(task, checked, `evidence/${task.taskId}/build.json`);
                consumerRawEvidence = [{ artifactId: `${task.taskId}-build`, version: ref.version, location: `evidence/${task.taskId}/build.json` }];
                actual = consumerDiagnostics?.issues.map(issue => issue.summary).join('\n') || 'Build failed without attributable current compiler evidence.';
              } else { classification = 'code_defect'; actual = checked.diagnostics.slice(0, 16000) || 'Typecheck/build failed.'; }
            }
            return { passed: checked.passed, evidenceIds: [`${task.taskId}-host`] };
          },
          acceptance: async (_candidate, project) => {
            if (validation) await requireDispatch(task, signal);
            if (preparation?.candidateConsumer) {
              await preparation.bindCandidate(ref);
              const mediaArtifact = selected(task, 'media'), capture = await registry.getCapture(mediaArtifact);
              const manifestBytes = await regularFile(root, `${mediaArtifact.location}/public/assets/manifest.json`);
              if (!capture.metadata.media || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)), capture.metadata.media)) throw new Error('Actual media manifest differs from its capture.');
              const result = await preparation.candidateConsumer({ root, task, candidate: ref, project, mediaArtifact, media: capture.metadata.media,
                manifestSha256: validationHash(manifestBytes), signal, deadlineAt: Date.parse(authority.deadlineAt), requireCurrent: async () => { await requireDispatch(task, signal); await preparation.bindCandidate(ref); },
                playPersistent: async (series, options) => {
                  if (!io.playPersistent) throw new Error('Trusted persistent transport is unavailable.');
                  return io.playPersistent(series, options, await requireDispatch(task, signal));
                } });
              await requireDispatch(task, signal); consumerDiagnostics = result.diagnostics;
              const valid = result.passed && result.diagnostics.reportValid && !result.diagnostics.issues.length;
              actual = valid ? 'Current candidate passed persistent normal inputs and generated-media coverage.'
                : result.diagnostics.issues.map(issue => issue.summary).join('\n').slice(0, 16000) || 'Persistent/media evidence is incomplete.';
              pictures.set(task.taskId, result.pictures); consumerRawEvidence = result.rawEvidence;
              await writeJson(root, `evidence/${task.taskId}/browser.json`, { reportPath: result.reportPath, diagnostics: result.diagnostics });
              await writeJson(root, `evidence/${task.taskId}/media-usage.json`, result.mediaUsage);
              return { passed: valid, evidenceIds: [`${task.taskId}-host`] };
            }
            const server = await serve(project);
            try {
              const scenario = (draft as BrowserGameDraft | ValidationBrowserProposal).scenario;
              const gameplay: AcceptancePlan = { ...structuredClone(scenario), formatVersion: '1.0.0', projectId: 'game', runId: task.runId, taskId: task.taskId,
                reportId: `${task.taskId}-browser`, specVersion: requirement.specVersion, artifact: ref, url: server.url, acceptanceIds: task.acceptanceIds };
              const media = (await registry.getCapture(selected(task, 'media'))).metadata.media!;
              const { plan, checks } = withMediaObservations(gameplay, media);
              const report = await io.play(plan, signal, validation ? await requireDispatch(task, signal) : authority);
              if (validation) await requireDispatch(task, signal);
              await writeJson(root, `evidence/${task.taskId}/browser.json`, report);
              await writeJson(root, `evidence/${task.taskId}/media-usage.json`, { candidate: ref, media: selected(task, 'media'),
                checks: checks.map(check => ({ ...check, result: report.steps.find(step => step.id === check.stepId) ?? null })),
                scope: 'Engine loading/state/sound-start observations under the same normal-input replay, plus independent source review; audible quality and visual recognizability remain user experience checks.' });
              const valid = validBrowserReport(report, plan);
              if (valid) {
                const paths = [...new Set(report.steps.filter(step => scenario.steps.some(original => original.id === step.id) && step.screenshot).map(step => `browser-evidence/${step.screenshot}`))];
                const chosen = [...new Set([...paths.slice(0, 4), ...paths.slice(-4)])];
                for (const path of chosen) {
                  const bytes = await regularFile(root, path);
                  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Host screenshot is not a PNG.');
                }
                pictures.set(task.taskId, chosen.map((location, index) => ({ artifactId: `${task.taskId}-screenshot-${index}`, version: ref.version, location })));
              }
              if (!valid) { classification = sameValue(report.plan, plan) ? 'code_defect' : 'insufficient_evidence'; actual = 'Normal input report failed or did not match the fixed plan and candidate.'; }
              return { passed: valid, evidenceIds: [`${task.taskId}-host`] };
            } finally { await server.close(); }
          },
        });
        proofs.set(task.taskId, proof); passed = true;
        }
      } catch (error) {
        // A trusted consumer boundary failure is evidence insufficiency unless exact diagnostics already established a defect.
        if (preparation?.candidateConsumer && !consumerDiagnostics) actual = error instanceof Error ? error.message : 'Persistent consumer did not establish current evidence.';
      }
      const evidence: EvidenceContract = { contractVersion: '1.0.0', evidenceId: `${task.taskId}-host`, taskId: task.taskId, acceptanceIds: task.acceptanceIds,
        kind: 'test_report', source: { artifactId: `${task.taskId}-host-report`, version: ref.version, location: reportPath }, artifactVersions: [...task.inputs, ...task.artifacts],
        outcome: passed ? 'passed' : 'failed', recordedAt: new Date().toISOString(), summary: passed ? kind === 'coding' ? 'Fixed candidate built and passed normal input checks; independent review follows.'
          : `${kind} stage checks passed on fixed outputs; this is not a gameplay verdict.` : actual };
      if (validation) await requireDispatch(task, signal);
      await writeJson(root, reportPath, { evidence, proof: proofs.get(task.taskId) ?? null });
      if (!passed) failures.set(task.taskId, new HostFailure(consumerDiagnostics?.issues.length ? consumerDiagnostics.issues : task.acceptance.map(item => ({ acceptanceId: item.acceptanceId, checkId: 'browser-build', classification,
        summary: actual, reproduction: item.steps, expected: item.expected, actual, evidenceRefs: [reportPath] })),
      consumerDiagnostics?.passedChecks.map(check => ({ ...check, evidenceId: evidence.evidenceId })) ?? []));
      const supplemental: EvidenceContract[] = (pictures.get(task.taskId) ?? []).map((source, index) => ({ ...evidence, evidenceId: `${task.taskId}-image-${index}`, source, kind: 'screenshot', outcome: 'observed', summary: 'Normal-input screenshot of this exact candidate; interpreted with fixed source and runtime observations.' }));
      supplemental.push(...consumerRawEvidence.map((source, index): EvidenceContract => ({ ...evidence, evidenceId: `${task.taskId}-raw-${index}`, source,
        kind: 'test_report', outcome: 'observed', summary: 'Current persistent raw report directory: screenshots, video, logs and actual process/media facts.' })));
      if (passed && kind === 'coding') supplemental.push({ ...evidence, evidenceId: `${task.taskId}-media-usage`, kind: 'log', outcome: 'observed',
        source: { artifactId: `${task.taskId}-media-usage`, version: ref.version, location: `evidence/${task.taskId}/media-usage.json` },
        summary: 'Check the observation implementations against frozen Phaser source and normal-input screenshots. Read-only counters alone do not establish visible or audible quality.' });
      if (passed) {
        const refs = [...task.inputs, ...task.artifacts, ...task.context.interfaces, evidence.source, ...supplemental.map(item => item.source)];
        await copyRefs(root, join(root, `reviews/${task.taskId}`), refs.filter(ref => !consumerRawEvidence.some(parent => ref.location !== parent.location && ref.location.startsWith(parent.location + '/'))));
      }
      return [evidence, ...supplemental];
    },
    async reviewImages(task, signal) {
      if (validation) await requireDispatch(task, signal);
      return Promise.all(task.evidence.filter(item => item.kind === 'screenshot' && item.outcome === 'observed').slice(0, 8).map(async item => {
        signal.throwIfAborted(); const bytes = await regularFile(root, item.source.location);
        return { source: item.source, image: { type: 'image' as const, mimeType: 'image/png', data: bytes.toString('base64') } };
      }));
    },
    diagnoseFailure: task => failures.get(task.taskId),
    async recoverCapture(task) {
      try {
        if (validation) { const { snapshot } = await validationScope(); boundTask(task); requireValidationTask(snapshot, task); requireOriginalTask(snapshot.tasks.find(item => item.taskId === task.taskId)!, task); }
        const ref = taskOutput(task), kind = role(task);
        if (preparation) { if (kind === 'design') await preparation.verifyDesignExtras(task); else if (kind === 'coding') await preparation.bindCandidate(ref); }
        if (kind === 'coding') {
          const candidate = await registry.getCandidate(ref);
          if (candidate.taskId !== task.taskId || candidate.authorId !== task.authorId || candidate.contextId !== task.context.contextId) return null;
          const code = await registry.getCapture(registry.artifactRef(name('game-source'), ref.version));
          if (code.taskId !== task.taskId || !code.metadata.provenance.sourceRefs.includes(task.attempts.at(-1)!.sessionRef)) return null;
          if (task.state === 'passed') {
            const accepted = await registry.current();
            if (!sameValue(accepted?.candidateRef, ref) || accepted?.review.reviewerId !== task.review.reviewerId || accepted?.review.contextId !== task.review.contextId
              || !sameValue(accepted?.review.evidenceIds, task.review.evidenceIds)) return null;
          }
        } else {
          const capture = await registry.getCapture(ref), dependencies = kind === 'art' ? artDependencies(task) : captures;
          if (capture.taskId !== task.taskId || !capture.metadata.provenance.sourceRefs.includes(task.attempts.at(-1)!.sessionRef) || !sameValue(capture.dependencies, dependencies)) return null;
        }
        const reviewWorkspace = join(root, `reviews/${task.taskId}`); if (!(await lstat(reviewWorkspace)).isDirectory()) return null;
        return { artifacts: outputRefs(task), reviewWorkspace };
      } catch { return null; }
    },
    async repair(task, feedback) {
      if (binding || validation) return null;
      const current = await controller.read(), unallocated = current.ledger.limitMicroCny - current.ledger.allocations.reduce((sum, item) => sum + item.amountMicroCny, 0);
      if (unallocated <= 0) return null;
      await stageFeedback(feedback); const ref = nextOutput(task);
      return { outputs: [{ ...task.outputs[0], destination: ref.location }], expectedArtifacts: [ref], allocationMicroCny: unallocated };
    },
    async continuationTargets(sources, feedback, grants) {
      if (binding || validation) return null;
      if (human && (sources.length !== 1 || role(sources[0].task) !== 'coding' || taskOutput(sources[0].task).version !== 'v1')) return null;
      await stageFeedback(feedback);
      return sources.map(source => {
        const failed = source.task.taskId === feedback.sourceTaskId, ref = nextOutput(source.task), diagnostic = failureSource(feedback.sourceTaskId, feedback.sourceAttemptId);
        return { sourceTaskId: source.task.taskId, taskId: `${source.task.taskId.slice(0, failed ? 57 : 54)}-${failed ? 'repair' : 'successor'}`,
          allocationMicroCny: grants[source.task.taskId], outputs: [{ ...source.task.outputs[0], destination: ref.location }], expectedArtifacts: [ref],
          ...(failed && feedback.issues.some(issue => issue.evidenceRefs.includes(`${diagnostic.location}/manifest.json`)) ? { interfaces: [diagnostic] } : {}) };
      });
    },
    async finish(tasks) {
      if (preparation && !preparation.candidateConsumer) { await preparation.close(); return { gaps: ['Transfer input preparation only: persistent/media acceptance consumer and bounded design semantic repair are not connected.'] }; }
      let current = await controller.read();
      if (validation) {
        try { current = (await validationScope()).snapshot; for (const task of tasks) { boundTask(task); requireValidationTask(current, task); if (!sameValue(current.tasks.find(item => item.taskId === task.taskId), task)) throw new Error('Final validation task differs from its persistent result.'); } }
        catch { return { gaps: ['Current validation scope or complete persistent task approval is unavailable.'] }; }
      }
      const effectiveTasks = [...(inherited?.stages.map(stage => stage.task) ?? []), ...tasks];
      const task = tasks.find(task => role(task) === 'coding');
      if ((validation ? currentValidationCase(current).stopReason : executionWindowView(current).executionWindow.stopReason) || !task || effectiveTasks.length !== 3 || effectiveTasks.some(task => task.state !== 'passed' || task.review.verdict !== 'approved')
        || binding && (tasks.some(task => !binding.tasks.some(item => item.task.taskId === task.taskId)) || new Set(tasks.map(task => task.taskId)).size !== binding.tasks.length)) {
        const existing = await registry.current(); return { ...(existing ? { delivery: existing.targetRoot } : {}), gaps: ['Current tasks lack complete host checks and independent approval.'] };
      }
      const ref = taskOutput(task), proof = proofs.get(task.taskId);
      if (preparation?.candidateConsumer) {
        try {
          await preparation.requireCurrent();
          for (const item of tasks) {
            const origin = await json(root, `journal/task-${item.taskId}/origin.json`) as import('./recovery/task-journal.ts').RecoveryOrigin;
            requireOriginalTask(origin.prepared.task, item);
            const journal = await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, origin, true);
            const verified = await journal.read<{ signature: import('./recovery/task-journal.ts').ContentSignature }>('verified', item.attempts.at(-1)!.attemptId);
            const review = await journal.read<{ signature: import('./recovery/task-journal.ts').ContentSignature; reviewerId: string; contextId: string }>('review', item.attempts.at(-1)!.attemptId);
            if (!verified || !review || review.reviewerId !== item.review.reviewerId || review.contextId !== item.review.contextId) throw new Error('Current independent review receipt is unavailable.');
            const refs = [...item.inputs, ...item.artifacts, ...item.evidence.map(entry => entry.source)];
            await journal.requireSignature(verified.signature, refs); await journal.requireSignature(review.signature, refs);
          }
          await preparation.requireCurrent();
        } catch { return { gaps: ['Current persistent inputs, raw evidence or independent review signatures changed before promotion.'] }; }
      }
      if (proof) await registry.promoteCandidate(ref, { evidence: proof, review: { candidateRef: ref, attemptId: proof.attemptId, reviewerId: task.review.reviewerId!, contextId: task.review.contextId!, verdict: 'approved', evidenceIds: task.review.evidenceIds } });
      const accepted = await registry.current();
      if (!accepted || !sameValue(accepted.candidateRef, ref)) return { gaps: ['Candidate promotion cannot be established; preserve the original version and evidence.'] };
      return { delivery: accepted.targetRoot, gaps: [], acceptedCandidate: accepted, mediaUsage: `evidence/${task.taskId}/media-usage.json`,
        ...(inherited ? { inheritedStages: inherited.stages.map(stage => ({ taskId: stage.task.taskId, role: stage.role, caseId: inherited.manifest.caseId,
          windowId: inherited.manifest.windowId, manifestRef: historical!.manifestRef, artifacts: stage.task.artifacts })) } : {}) };
    },
  };
  if (preparation) {
    const design = host.taskPolicies.find(policy => policy.role === 'design')!, coding = host.taskPolicies.find(policy => policy.role === 'coding')!;
    design.outputs.push(...structuredClone(preparation.designOutputs)); design.writePaths.push(...preparation.designWritePaths);
    if (preparation.designHostTools) design.tools.push(...preparation.designHostTools.names);
    design.rules!.push(...preparation.designRules); coding.rules!.push(...preparation.codingRules);
    const prepared = host as PreparedBrowserHost;
    prepared.bindPreparedTasks = async tasks => {
      if (human) {
        if (binding) {
          host.validateTasks!(tasks); await human.bind(tasks);
          for (const item of tasks) validationTasks.set(item.task.taskId, structuredClone(item));
          await preparation.requireCurrent(); return;
        }
        if (!tasks.length || tasks.length > 3) throw new Error('Human preparation requires the fixed role tasks.');
        const execution = await json(root, 'execution.json'), originals = execution.tasks as PreparedTask[];
        if (!human.bound()) { host.validateTasks!(originals); await human.bind(originals); for (const item of originals) validationTasks.set(item.task.taskId, structuredClone(item)); }
        else await human.bind(originals);
        const current = await controller.read();
        if (input.resume && !current.tasks.length && !originals.some(item => current.ledger.allocations.some(grant => grant.taskId === item.task.taskId))) {
          const recovery = { artifactRoot: root, journalRoot: join(root, 'journal') };
          for (const item of originals) {
            const origin = { formatVersion: 1 as const, runId: current.run.runId, ledgerId: current.ledger.ledgerId, originalStartedAt: current.run.originalStartedAt,
              originalDeadlineAt: current.run.originalDeadlineAt, limitMicroCny: current.ledger.limitMicroCny, requirement, prepared: item,
              reviewProtocolCorrections: 1 as const, artifactRoot: root, sessionRoot: join(root, 'sessions') };
            const exists = await lstat(join(root, `journal/task-${item.task.taskId}/origin.json`)).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
            await TaskJournal.open(recovery, origin, !!exists);
          }
          await controller.registerTasks(originals.map(item => item.task));
        }
        const coding = originals.find(item => item.role === 'coding')!, repairId = `${coding.task.taskId.slice(0, 57)}-repair`;
        for (const item of tasks) {
          if (originals.some(original => sameValue(original, item))) continue;
          const plan = await json(root, 'repair-plan.json'), recorded = (await controller.read()).tasks.find(task => task.taskId === item.task.taskId);
          if (item.role !== 'coding' || item.task.taskId !== repairId || !plan.tasks?.some((fixed: PreparedTask) => sameValue(fixed, item)) || !recorded
            || !sameValue(item.expectedArtifacts, [registry.candidateRef(name('game'), 'v2')]) || !sameValue(item.task.dependsOn.map(dep => dep.taskId), coding.task.dependsOn.map(dep => dep.taskId))) throw new Error('Human coding repair differs from its sealed original binding.');
          requireOriginalTask(item.task, recorded); validationTasks.set(item.task.taskId, structuredClone(item));
        }
        await preparation.requireCurrent(); return;
      }
      const { snapshot, window } = await validationScope(); if (historical) await historical.verify(work.signal);
      const claimed = window.repair;
      if (inherited && claimed && tasks.some(item => item.task.taskId === claimed.taskId)) {
        if (!tasks.length || tasks.length > 2 || tasks.some(item => ![claimed.taskId, claimed.sourceTaskId].includes(item.task.taskId))) throw new Error('Repair binding contains another dispatch task.');
        const sourceOrigin = await json(root, `journal/task-${claimed.sourceTaskId}/origin.json`) as import('./recovery/task-journal.ts').RecoveryOrigin;
        host.validateTasks!([sourceOrigin.prepared]);
        for (const item of tasks) {
          const origin = await json(root, `journal/task-${item.task.taskId}/origin.json`) as import('./recovery/task-journal.ts').RecoveryOrigin;
          const recorded = snapshot.tasks.find(task => task.taskId === item.task.taskId);
          if (!recorded || !sameValue(origin.requirement, requirement) || !sameValue(origin.prepared, item)
            || origin.artifactRoot !== root || origin.sessionRoot !== join(root, 'sessions') || origin.validationCase?.caseId !== validation!.caseId
            || origin.validationCase.windowId !== validation!.windowId) throw new Error('Repair binding differs from its durable current-case origin.');
          requireOriginalTask(origin.prepared.task, recorded); requireValidationTask(snapshot, item.task);
          await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, origin, true);
          if (item.task.taskId === claimed.taskId && (!sameValue(item.expectedArtifacts, [registry.candidateRef(name('game'), 'v2')])
            || !sameValue(item.task.dependsOn.map(dep => dep.taskId), inherited.stages.map(stage => stage.task.taskId)))) throw new Error('Repair changed its current candidate or inherited dependency identities.');
          validationTasks.set(item.task.taskId, structuredClone(item));
        }
      } else host.validateTasks!(tasks);
      await preparation.requireCurrent();
    };
    prepared.closePreparation = () => preparation.close(); prepared.bindPreparedCandidate = candidate => preparation.bindCandidate(candidate);
    prepared.withPreparation = async operation => {
      try { return await work.run(async () => { try {
        await preparation.requireCurrent(); const result = await operation(); work.signal.throwIfAborted(); await preparationScope();
        if (preparation.candidateConsumer) await preparation.requireCurrent(); work.signal.throwIfAborted(); return result;
      } finally { await preparation.close(); } }); }
      finally { await preparation.close(); }
    };
  }
  if (validation) {
    for (const policy of host.taskPolicies) {
      const grant = scope!.window.quote.declaration.grants[policy.role as 'design' | 'art' | 'coding'];
      policy.allocationMicroCny = grant.amountMicroCny;
      policy.workspace = await directory(root, `validation/${validation.caseId}/${grant.taskId}/workspace`);
    }
    const nativeRoles = host.roleFactory;
    host.roleFactory = async roleInput => {
      if (roleInput.controller !== controller || !sameValue(roleInput.requirement, requirement)) throw new Error('Validation role is outside this fixed host scope.');
      const session = relative(root, resolve(roleInput.stateDirectory)).split(sep).join('/');
      if (!/^sessions\/[^/]+(?:\/(?:author|review))?$/.test(session)) throw new Error('Validation role session must remain in its fixed case root.');
      await safePath(root, session);
      if (roleInput.purpose === 'planning') {
        await requirePlanningDispatch(roleInput, controller.signal);
      } else {
        await requireDispatch(roleInput.task, controller.signal);
        const expected = roleInput.role === 'reviewer' ? join(root, `reviews/${roleInput.task.taskId}`) : workspace(roleInput.task);
        if (resolve(roleInput.workspace) !== resolve(expected)) throw new Error('Validation role workspace differs from its fixed host binding.');
      }
      return nativeRoles({ ...roleInput, validation });
    };
    (host as ValidationBrowserHost).prepareValidationRepair = async (source, feedback, recovery) => {
      const { snapshot: before, window } = await validationScope();
      if (preparation && !preparation.candidateConsumer) throw new Error('Preparation has no acceptance consumer; it cannot dispatch a coding repair.');
      if (preparation) await preparation.requireCurrent();
      if (window.repair || validationRole(window, source.task.taskId) !== 'coding' || resolve(recovery.artifactRoot) !== resolve(root) || resolve(recovery.journalRoot) !== join(root, 'journal')) throw new Error('Validation coding repair was already claimed or has a different fixed source.');
      const fixed = boundTask(source.task);
      if (!fixed || !sameValue(source, { ...fixed, task: before.tasks.find(task => task.taskId === source.task.taskId) })) throw new Error('Repair must retain the complete fixed prepared source binding and persisted task.');
      const options = { snapshot: before, requirement, validation, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(), estimate: { costMicroCny: 524_488, durationMs: 180000, cleanupMs: 5000 } };
      if (assessRepair(options).action !== 'repair') throw new Error('Current validation feedback cannot dispatch a coding repair.');
      const task = source.task, attempt = task.attempts.at(-1)!, origin = await json(root, `journal/task-${task.taskId}/origin.json`), journal = await TaskJournal.open(recovery, origin, true);
      const raw = await regularFile(root, relative(root, join(attempt.sessionRef, 'failure.json')).split(sep).join('/'));
      if (!sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), feedback)) throw new Error('Repair feedback differs from its durable source bytes.');
      const failed = await journal.read<{ taskId: string; attemptId: string; feedback: ArtifactReference; feedbackSha256: string; signature: import('./recovery/task-journal.ts').ContentSignature }>('failure-snapshot', attempt.attemptId);
      if (!failed || failed.taskId !== task.taskId || failed.attemptId !== attempt.attemptId || failed.feedbackSha256 !== validationHash(raw) || !sameValue(failed.feedback, feedback.reference)) throw new Error('Repair failure snapshot differs from its source.');
      await journal.requireSignature(failed.signature, [...task.inputs, ...task.artifacts, ...task.evidence.map(item => item.source)]);
      const candidate = await registry.getCandidate(taskOutput(task)), code = await registry.getCapture(registry.artifactRef(name('game-source'), taskOutput(task).version));
      if (candidate.taskId !== task.taskId || candidate.authorId !== task.authorId || candidate.contextId !== task.context.contextId || code.taskId !== task.taskId || !code.metadata.provenance.sourceRefs.includes(attempt.sessionRef)) throw new Error('Repair candidate source identity changed.');
      await validationScope(); if (preparation) await preparation.requireCurrent(); await stageFeedback(feedback); await controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback: feedback.reference });
      const snapshot = await controller.read(), grant = window.quote.declaration.grants.repair, ref = registry.candidateRef(name('game'), 'v2');
      const repair = createLinkedRepairTask({ ...options, snapshot, source, taskId: grant.taskId, allocationMicroCny: grant.amountMicroCny,
        outputs: [{ ...task.outputs[0], destination: ref.location }], expectedArtifacts: [ref] });
      repair.workspace = await directory(root, `validation/${validation.caseId}/${grant.taskId}/workspace`);
      await validationScope();
      await TaskJournal.open(recovery, { ...origin, prepared: repair }, false); await controller.registerTasks([repair.task]);
      validationTasks.set(repair.task.taskId, structuredClone(repair)); return repair;
    };
  }
  if (binding) {
    host.validateTasks!(binding.tasks);
    for (const item of binding.tasks) if (resolve(item.workspace) !== resolve(root)) await directory(root, relative(root, item.workspace).split(sep).join('/'));
  }
  if (human) {
    const nativeRoles = host.roleFactory;
    host.roleFactory = async roleInput => {
      if (roleInput.controller !== controller || !sameValue(roleInput.requirement, requirement)) throw new Error('Human role is outside its original preparation scope.');
      await human.requireCurrent();
      if (roleInput.purpose === 'planning') {
        if (binding) throw new Error('Human continuation cannot dispatch a planner.');
        const authority = await controller.executionAuthority(roleInput.task.taskId);
        if (roleInput.task.taskId !== 'planning' || !authority.admissionAllowed || resolve(roleInput.workspace) !== resolve(root)) throw new Error('Human preparation planner lacks original authority.');
      } else {
        await requireDispatch(roleInput.task, controller.signal);
        const expected = roleInput.role === 'reviewer' ? join(root, `reviews/${roleInput.task.taskId}`) : workspace(roleInput.task);
        if (resolve(roleInput.workspace) !== resolve(expected)) throw new Error('Human role workspace differs from its original binding.');
      }
      return nativeRoles(roleInput);
    };
  }
  if (inherited) host.taskPolicies = host.taskPolicies.filter(policy => policy.role === 'coding');
  return host;
}

/** Uses installed locked generic tools; preparation creates no game-specific output. */
export function createProductHost(repository: string, hostOptions: Pick<BrowserHostCoreInput, 'io' | 'sessionFactory'> = {}): ProductHost {
  const interviewCapabilities = async (options: Parameters<ProductHost['questions']>[0]) => {
    const { draftMode } = await options.controller.read(); modeFromSelection(draftMode);
    return draftMode ? `${preparationContract(draftMode).scope} Use the complete supplied acceptance and preserve unsupported requested scope. Original media uses the existing bounded SVG/PCM formats.` : CAPABILITIES;
  };
  return {
    async prepare(root, signal) {
      signal?.throwIfAborted();
      const mapping = await json(repository, 'docs/specs/github-issues.json');
      const required = ['COS-03', 'COS-04', 'COS-05', 'COS-06', 'COS-07', 'COS-08', 'COS-09', 'COS-10', 'COS-11', 'COS-12', 'COS-13'];
      const missing = required.filter(id => !mapping.tasks.some((task: { taskId: string; state: string }) => task.taskId === id && task.state === 'closed'));
      if (missing.length) return { environmentReady: false, executionReady: false, reason: `G3 尚未通过：${missing.join(', ')}` };
      if (!process.env.DEEPSEEK_API_KEY?.trim()) return { environmentReady: false, executionReady: true, reason: '需要通过当前进程环境配置 DEEPSEEK_API_KEY。' };
      const template = join(repository, 'templates/2d');
      try { for (const path of ['node_modules/typescript/bin/tsc', 'node_modules/vite/bin/vite.js']) await access(join(template, path)); }
      catch { return { environmentReady: false, executionReady: true, reason: '请先在通用 templates/2d 目录运行 npm ci，准备锁定依赖。' }; }
      const toolchain = join(root, 'toolchain');
      try { await access(join(toolchain, 'package-lock.json')); }
      catch { await cp(template, toolchain, { recursive: true, filter: path => relative(template, path).split(sep)[0] !== 'dist' }); }
      signal?.throwIfAborted();
      if (!(await regularFile(toolchain, 'package-lock.json')).equals(await regularFile(template, 'package-lock.json'))) throw new Error('Prepared toolchain differs from the locked template.');
      return { environmentReady: true, executionReady: true };
    },
    questions: async options => {
      return requestDesignQuestions({ ...options, capabilities: await interviewCapabilities(options), sessionFactory: hostOptions.sessionFactory, maxOutputTokens: 4096, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: requestReservation });
    },
    draft: async options => {
      const draft = await requestDesignDraft({ ...options, capabilities: await interviewCapabilities(options), sessionFactory: hostOptions.sessionFactory, maxOutputTokens: 8192, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: requestReservation });
      return draft.preparation ? draft : withHostStages(draft);
    },
    execute: options => executeGeneration({ ...options, createHost: async input => input.draft.preparation
      ? input.binding?.preparation
        ? (await import('./adapters/transfer/runtime-host.ts')).createHumanTransferContinuationHost({ ...input, binding: { ...input.binding, preparation: input.binding.preparation }, draft: input.draft, ...hostOptions })
        : (await import('./adapters/transfer/runtime-host.ts')).createHumanTransferConsumerHost({ ...input, draft: input.draft, ...hostOptions })
      : createBrowserHost({ ...input, ...hostOptions }) }),
  };
}
