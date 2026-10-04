import { once } from 'node:events';
import { access, cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
import { validateGameDraft, withHostStages, gameplayAcceptance, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../roles/requirements.ts';
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
import type { GameDraft } from '../roles/requirements.ts';
import type { ExecutionRequirement, ValidationRequirement } from '../roles/execution-input.ts';
import { validateExecutionInput } from '../roles/execution-input.ts';
import type { ValidationExecutionBinding } from './validation-scope.ts';
import { currentValidationCase, requireValidationTask, validationRole } from './validation-validation.ts';
import { requireValidationBrowserScope } from './entrypoint-validation.ts';
import type { ValidationBrowserProposal } from './entrypoint-validation.ts';
import type { RoleFactoryOptions } from '../roles/factory.ts';
import type { RoleInput } from '../roles/factory.ts';
import { TaskJournal } from './recovery/task-journal.ts';
import type { RecoveryOptions } from './recovery/task-journal.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from './repair/policy.ts';
import { validationHash } from './validation-validation.ts';

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
export interface BrowserHostIO {
  build(project: string, name: string, signal: AbortSignal, authority: HostExecutionAuthority): Promise<{ passed: boolean; diagnostics: string }>;
  play(plan: AcceptancePlan, signal: AbortSignal, authority: HostExecutionAuthority): Promise<AcceptanceReport>;
}
function nativeIO(input: Pick<HostInput, 'root' | 'controller'>): BrowserHostIO {
  return {
    async build(project, name, signal, authority) {
      if (name !== authority.taskId) throw new Error('Build task differs from its host execution authority.');
      const root = await directory(input.root, `builds/${name}`), toolchain = join(input.root, 'toolchain');
      await cp(toolchain, root, { recursive: true }); await cp(project, root, { recursive: true });
      let diagnostics = '';
      for (const args of [[join(toolchain, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], [join(toolchain, 'node_modules/vite/bin/vite.js'), 'build']]) {
        const result = await ownedNode(input, authority, args, root, signal, 120000); diagnostics += result.diagnostics;
        if (!result.passed) return { passed: false, diagnostics };
      }
      signal.throwIfAborted(); await cp(join(root, 'dist'), join(project, 'dist'), { recursive: true, errorOnExist: true, force: false });
      return { passed: true, diagnostics };
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
  input.controller.requireExecutionWindow(input.binding?.windowId);
  validateGameDraft(input.draft);
  return createBrowserHostCore(input);
}
export interface ValidationBrowserHost extends GenerationHost {
  prepareValidationRepair(source: PreparedTask, feedback: RepairFeedback, recovery: RecoveryOptions): Promise<PreparedTask>;
}
/** Internal opt-in assembly. The public ordinary/formal entry does not accept this profile. */
export async function createValidationBrowserHost(input: Omit<HostInput, 'requirement' | 'draft' | 'binding'> & {
  requirement: ValidationRequirement; proposal: ValidationBrowserProposal; validation: ValidationExecutionBinding; io?: BrowserHostIO;
  sessionFactory?: RoleFactoryOptions['sessionFactory'];
}): Promise<ValidationBrowserHost> {
  if ('binding' in input || 'draft' in input) throw new Error('Validation host uses only its explicit operator proposal and case binding.');
  return createBrowserHostCore({ ...input, draft: structuredClone(input.proposal) }) as Promise<ValidationBrowserHost>;
}
interface BrowserHostCoreInput extends Omit<HostInput, 'requirement' | 'draft'> {
  requirement: ExecutionRequirement; draft: GameDraft | ValidationBrowserProposal; io?: BrowserHostIO; validation?: ValidationExecutionBinding;
  sessionFactory?: RoleFactoryOptions['sessionFactory'];
}
async function createBrowserHostCore(input: BrowserHostCoreInput): Promise<GenerationHost> {
  const binding = input.binding ? structuredClone(input.binding) : undefined;
  const validation = input.validation && { ...input.validation }, { root, controller, work } = input;
  const requirement = structuredClone(input.requirement), draft = structuredClone(input.draft);
  const validationScope = () => requireValidationBrowserScope({ root, controller, requirement: requirement as ValidationRequirement, proposal: draft as ValidationBrowserProposal, validation: validation! });
  const scope = validation ? await validationScope() : undefined;
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
  const template = registry.artifactRef(name('generic-template'), 'v1'), requirements = registry.artifactRef(name('requirement-bundle'), requirement.sources[0].version);
  const captures = [template, requirements], provenance = { kind: 'original-procedural' as const, generator: 'Cosmos trusted host inputs', sourceRefs: requirement.sources.map(ref => `${ref.artifactId}@${ref.version}`) };
  if (input.resume) {
    const lock = await lstat(join(root, 'registry/.commit.lock')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (lock) await registry.recoverOwnership();
    await registry.getCapture(template); await registry.getCapture(requirements);
  }
  else {
    await registry.registerCapture({ taskId: 'host-template', artifactRef: template, sourceRoot: 'toolchain', files: TEMPLATE_FILES.map(name => ({ source: name, destination: name })),
      ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'code', provenance } });
    const folder = await directory(root, 'host-requirements');
    for (const ref of requirement.sources) await writeFile(join(folder, `${ref.artifactId}.json`), await regularFile(root, ref.location), { flag: 'wx' });
    await registry.registerCapture({ taskId: 'host-requirements', artifactRef: requirements, sourceRoot: 'host-requirements',
      files: requirement.sources.map(ref => ({ source: `${ref.artifactId}.json`, destination: `_cosmos/${ref.artifactId}.json` })),
      ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'data', provenance } });
  }
  const availableArtifacts = [...requirement.sources, ...captures];
  if (validation) for (const ref of captures) await registry.getCapture(ref);
  if (!binding && !validation) { await directory(root, 'authors/coding/src'); await directory(root, 'authors/design'); await directory(root, 'authors/art'); }
  const baseAllocation = state.ledger.allocations.filter(item => ['intake', 'planning'].includes(item.taskId)).reduce((sum, item) => sum + item.amountMicroCny, 0);
  const pool = validation ? 0 : state.ledger.limitMicroCny - baseAllocation, output = registry.candidateRef(name('game'), 'v1');
  const designOutput = registry.artifactRef(name('design'), 'v1'), mediaOutput = registry.artifactRef(name('media'), 'v1');
  const proofs = new Map<string, PassedEvidence>(), failures = new Map<string, HostFailure>();
  const pictures = new Map<string, ArtifactReference[]>();
  const validationTasks = new Map<string, PreparedTask>();
  const boundTask = (task: TaskContract) => {
    const item = validation ? validationTasks.get(task.taskId) : binding?.tasks.find(item => item.task.taskId === task.taskId);
    if ((binding || validation) && !item) throw new Error('Task is outside the fixed host binding.');
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
      signal.throwIfAborted(); return { taskId: task.taskId, caseId: window.caseId, windowId: window.windowId, deadlineAt: authority.deadlineAt };
    }
    controller.requireExecutionWindow(binding?.windowId);
    boundTask(task);
    const authority = await controller.executionAuthority(task.taskId);
    if (binding && !authority.admissionAllowed) throw new Error('Task has no active continuation host execution authority.');
    return { taskId: task.taskId, windowId: authority.windowId, deadlineAt: authority.deadlineAt };
  }
  async function requirePlanningDispatch(roleInput: Readonly<RoleInput>, signal: AbortSignal) {
    signal.throwIfAborted();
    const { snapshot, window } = await validationScope(), grant = window.quote.declaration.grants.planning;
    if (roleInput.role !== 'cosmos' || roleInput.purpose !== 'planning' || roleInput.task.taskId !== grant.taskId
      || roleInput.task.budget.allocationMicroCny !== grant.amountMicroCny || resolve(roleInput.workspace) !== resolve(root)
      || roleInput.task.ownership.writePaths.length || roleInput.task.context.tools.some(tool => tool !== 'read')
      || validateExecutionInput({ requirement, task: roleInput.task, ledger: snapshot.ledger, run: snapshot.run }).length) throw new Error('Validation planning differs from its fixed billing grant and read-only scope.');
    const authority = await controller.validationAuthority(grant.taskId, 'planning');
    if (!authority.admissionAllowed) throw new Error('Validation planning has no fixed host authority.');
    signal.throwIfAborted();
  }
  const taskOutput = (task: TaskContract) => {
    const planned = boundTask(task);
    if (planned) {
      const ref = planned.expectedArtifacts?.[0], kind = role(task);
      const expected = ref && (kind === 'coding' ? registry.candidateRef(name('game'), ref.version) : registry.artifactRef(name(kind === 'design' ? 'design' : 'media'), ref.version));
      if (!ref || planned.expectedArtifacts!.length !== 1 || task.outputs.length !== 1 || task.outputs[0].destination !== ref.location || !sameValue(ref, expected)) throw new Error('Host binding has an invalid fixed output reference.');
      return ref;
    }
    const kind = role(task), refs = kind === 'coding' ? [output, registry.candidateRef('game', 'v2')] : [registry.artifactRef(kind === 'design' ? 'design' : 'media', 'v1'), registry.artifactRef(kind === 'design' ? 'design' : 'media', 'v2')];
    const ref = refs.find(ref => task.outputs[0]?.destination === ref.location);
    if (!ref || task.outputs.length !== 1) throw new Error('Host output is not one of the fixed role versions.');
    return ref;
  };
  const nextOutput = (task: TaskContract) => role(task) === 'coding' ? registry.candidateRef('game', 'v2') : registry.artifactRef(role(task) === 'design' ? 'design' : 'media', 'v2');
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
    const ref = task.inputs.find(ref => ref.artifactId === name(id)); if (!ref) throw new Error(`Missing fixed ${id} dependency.`); return ref;
  };
  const designFor = async (task: TaskContract): Promise<DesignDocument> => {
    const ref = selected(task, 'design'); await registry.getCapture(ref);
    const design = await json(root, `${ref.location}/_cosmos/design.json`); validateDesign(design, gameplayIds); return design;
  };
  const host: GenerationHost = {
    capability: 'browser-input-media2d-v1', availableArtifacts,
    taskPolicies: [
      { policyId: 'game-design', role: 'design', workspace: root, allocationMicroCny: Math.floor(pool * 0.15), writePaths: ['authors/design/design.json'],
        readOnlyPaths: ['requirements', 'registry'], tools: ['read', 'write', 'edit'], outputs: [{ ...designOutput, destination: designOutput.location, type: 'design', schema: 'game-design/1' }],
        rules: [`Cover only ${DESIGN_ACCEPTANCE_ID}; no dependencies. This is a design deliverable, not proof the game passes.`,
          `Read ${requirement.sources[0].location}. Write authors/design/design.json with exactly {summary:string,implementationNotes:string[],acceptanceMapping:{gameplayId:string},characters:[{id,purpose,states:string[]}],audio:[{id,trigger,loop:boolean}]}. Map every gameplay ID ${JSON.stringify(gameplayIds)}. Declare 1-16 original characters and 0-16 audio clips required by the confirmed brief; preserve every requested actor, action and audio trigger.`,
          'Use only the supported bounded SVG layer animation and procedural PCM audio formats. Do not shrink the confirmed gameplay or fabricate execution evidence.'] },
      { policyId: 'game-art', role: 'art', workspace: root, allocationMicroCny: Math.floor(pool * 0.25), writePaths: ['authors/art/media.json'],
        readOnlyPaths: ['requirements', 'registry'], tools: ['read', 'write', 'edit'], outputs: [{ ...mediaOutput, destination: mediaOutput.location, type: 'game-media', schema: 'original-media/1' }],
        rules: [`Cover only ${MEDIA_ACCEPTANCE_ID}; depend on the design task. Read its exact _cosmos/design.json capture. Write authors/art/media.json with exactly {characters:CharacterSpec[],audio:AudioSpec[]}; IDs, states and loops must exactly match design.`,
          'CharacterSpec: {id,width:16..512,height:16..512,anchor:{x,y},layers:[{id,shape:"rect"|"ellipse",x,y,width,height,fill:"#RRGGBB",stroke:"#RRGGBB",strokeWidth,radius?}],states:[{name,fps:1..60,loop:boolean,frames:[{layerId:{dx?,dy?,rotation?,scaleX?,scaleY?,opacity?}}]}]}. Up to 64 layers, 16 states, 256 total frames; every frame is a pose map and may be {}.',
          'AudioSpec: {id,sampleRate:22050|44100|48000,duration:0.02..30,loop:boolean,notes:[{midi:24..96,start,duration,gain:0..0.5,wave:"sine"|"triangle",attack,release}]}. Notes fit the clip; attack/release each >=0.002, their sum <=note duration. Produce audible original audio. The trusted host renders and validates actual files. Never copy reference artwork/audio.'] },
      { policyId: 'game-code', role: 'coding', workspace: root, allocationMicroCny: Math.floor(pool * 0.40), writePaths: ['authors/coding/src', 'authors/coding/index.html'],
      readOnlyPaths: ['requirements', 'registry', 'repair-feedback'], tools: ['read', 'write', 'edit'],
      outputs: [{ ...output, destination: output.location, type: 'game-project', schema: 'browser-game/1' }],
      rules: [`Cover exactly the gameplay IDs ${JSON.stringify(gameplayIds)}; depend on both design and art tasks. Implement the actual confirmed brief: ${draft.brief}`, `Read ${requirement.sources[0].location} for the exact user answers and browser scenario.`,
        'Write only authors/coding/index.html and authors/coding/src/main.ts plus necessary files below src. Use the pinned Phaser template and the independent art capture: public/assets/manifest.json gives actual SVG frames and WAV files, served as /assets/... . Read the exact design and media input snapshots. Do not replace art output with coding-only art, modify dependencies or change acceptance.',
        'Provide real mouse gameplay and visible status/selectors required by the scenario. No test-only victory shortcut, network resource, copied reference media or debug setter.',
        'Expose a non-configurable getter window.cosmosDebug returning frozen plain data. Its media.characters array follows manifest order: {id,loadedFrames,states:[{name,seen}]}; media.audio follows manifest order: {id,decoded,started}. Derive loadedFrames/decoded from actual Phaser texture/audio-cache readiness, states seen from actual displayed animation transitions, and started from successful sound start after normal user input. Preserve cumulative observations across scene changes in this document. Never fill these fields with declared constants or fabricate them; independent review checks their source. The host checks every declared state and audio clip on the frozen normal-input path and reports missing coverage as incomplete.',
        'The host builds, runs normal inputs, captures immutable output and asks a separate reviewer. Return only the required author handoff JSON after writing files.'] }],
    validateTasks(tasks) {
      if (validation) {
        for (const item of tasks) {
          requireValidationTask(state, item.task, scope!.window);
          const policy = host.taskPolicies.find(policy => policy.role === item.role);
          if (!policy || item.task.taskId !== scope!.window.quote.declaration.grants[item.role as 'design' | 'art' | 'coding']?.taskId
            || validateExecutionInput({ requirement, task: item.task, ledger: state.ledger, run: state.run }).length || resolve(item.workspace) !== resolve(policy.workspace) || !sameValue(item.expectedArtifacts, policy.outputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination })))
            || !sameValue(item.task.outputs, policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination })))
            || !sameValue(item.task.ownership, { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths }) || !sameValue(item.task.context.rules, policy.rules)
            || !sameValue(item.task.context.tools, policy.tools) || availableArtifacts.some(ref => !item.task.inputs.some(input => sameValue(input, ref)))) throw new Error('Validation task differs from its fixed workspace, inputs or role policy.');
          const inputs = [...availableArtifacts, ...item.task.dependsOn.flatMap(dep => tasks.find(task => task.task.taskId === dep.taskId)?.expectedArtifacts ?? [])];
          if (item.task.inputs.length !== inputs.length || item.task.inputs.some(ref => !inputs.some(fixed => sameValue(ref, fixed)))) throw new Error('Validation task input versions differ from the complete fixed dependencies.');
        }
      }
      if (binding && (tasks.length !== binding.tasks.length || tasks.some(item => {
        const fixed = boundTask(item.task);
        return !fixed || item.role !== fixed.role || resolve(item.workspace) !== resolve(fixed.workspace) || !sameValue(item.expectedArtifacts, fixed.expectedArtifacts);
      }))) throw new Error('Tasks differ from the fixed complete host binding.');
      const design = tasks.find(item => item.role === 'design'), art = tasks.find(item => item.role === 'art'), coding = tasks.find(item => item.role === 'coding');
      const exact = (left: string[], right: string[]) => left.length === right.length && left.every(id => right.includes(id));
      if (tasks.length !== 3 || !design || !art || !coding || !exact(design.task.acceptanceIds, [DESIGN_ACCEPTANCE_ID]) || !exact(art.task.acceptanceIds, [MEDIA_ACCEPTANCE_ID])
        || !exact(coding.task.acceptanceIds, gameplayIds) || design.task.dependsOn.length || !exact(art.task.dependsOn.map(item => item.taskId), [design.task.taskId])
        || !exact(coding.task.dependsOn.map(item => item.taskId), [design.task.taskId, art.task.taskId])) throw new Error('The plan must preserve distinct design, art and coding responsibilities and fixed dependency versions.');
      if (validation) {
        if (validationTasks.size) for (const item of tasks) requireOriginalTask(validationTasks.get(item.task.taskId)!.task, item.task);
        else for (const item of tasks) validationTasks.set(item.task.taskId, structuredClone(item));
      }
      tasks.forEach(item => taskOutput(item.task));
    },
    ...(binding || validation ? { async preAuthor(task: Readonly<TaskContract>, signal: AbortSignal) {
      await requireDispatch(task, signal);
      const target = workspace(task);
      for (const name of task.ownership.writePaths) {
        const path = await safePath(target, name), info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
        if (info && (!info.isDirectory() || (await snapshot(path)).size)) throw new Error('Fresh author scope contains unknown partial output; preserve it for investigation.');
      }
      await materializeTaskInputs({ artifactRoot: root, workspace: target, task, requirement, signal, ...(validation ? { validation: { caseId: validation.caseId, taskId: task.taskId } } : {}) });
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
    roleFactory: createRoleFactory({ maxOutputTokens: 8192, authorMaxOutputTokens: { art: 65536, coding: 65536 }, maxRequests: scope?.window.quote.declaration.limits.maxRequests ?? 16, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: requestReservation,
      ...(validation ? { sessionFactory: input.sessionFactory, beforeTool: async (roleInput, signal) => {
        if (roleInput.purpose === 'planning') await requirePlanningDispatch(roleInput, signal);
        else await requireDispatch(roleInput.task, signal);
      } } : {}) }),
    async capture(task, _proposal, signal) {
      await requireDispatch(task, signal); const ref = taskOutput(task), kind = role(task);
      const origin = { kind: 'original-procedural' as const, generator: `Native ${kind} role output`, sourceRefs: [task.attempts.at(-1)!.sessionRef, ...requirement.sources.map(ref => ref.location)] };
      if (kind === 'design') {
        await readDeclaredOutput(task, 'authors/design/design.json', value => validateDesign(value, gameplayIds));
        if (validation) await requireDispatch(task, signal);
        await registry.registerCapture({ taskId: task.taskId, artifactRef: ref, sourceRoot: sourceRoot(task, 'authors/design'), files: [{ source: 'design.json', destination: '_cosmos/design.json' }],
          ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, dependencies: captures, metadata: { kind: 'data', provenance: origin } });
      } else if (kind === 'art') {
        const design = await designFor(task), value = await readDeclaredOutput(task, 'authors/art/media.json', value => { validateDeclaredMedia(value, design); });
        const rendered = await renderDeclaredMedia(root, `rendered/${task.taskId}`, value, design, signal);
        if (validation) await requireDispatch(task, signal);
        await registry.registerCapture({ taskId: task.taskId, artifactRef: ref, sourceRoot: `rendered/${task.taskId}`, files: rendered.files.map(name => ({ source: name, destination: name })),
          ownership: { writePaths: ['public/assets', '_cosmos'], readOnlyPaths: [] }, dependencies: [...captures, selected(task, 'design')], metadata: { kind: 'media', provenance: origin, media: rendered.media } });
      } else {
        const source = registry.artifactRef(name('game-source'), ref.version), authored = await snapshot(join(workspace(task), 'authors/coding')), files = [...authored.keys()];
        if (files.some(name => name !== 'index.html' && !name.startsWith('src/'))) throw new Error('Out-of-scope author project.');
        const missing = ['src/main.ts', 'index.html'].filter(name => !files.includes(name));
        if (missing.length) await preserveFailure(task, 'missing_output', `Required code outputs are missing: ${missing.join(', ')}.`,
          [...[...authored].map(([name, bytes]) => ({ sourcePath: `authors/coding/${name}`, bytes })), ...missing.map(name => ({ sourcePath: `authors/coding/${name}` }))]);
        const inputs = [...captures, selected(task, 'design'), selected(task, 'media')], media = await registry.getCapture(selected(task, 'media'));
        if (validation) await requireDispatch(task, signal);
        await registry.registerCapture({ taskId: task.taskId, artifactRef: source, sourceRoot: sourceRoot(task, 'authors/coding'), files: files.map(name => ({ source: name, destination: name })),
          ownership: { writePaths: ['src', 'index.html'], readOnlyPaths: ['_cosmos'] }, dependencies: inputs, metadata: { kind: 'code', provenance: origin } });
        if (validation) await requireDispatch(task, signal);
        await registry.stageCandidate({ taskId: task.taskId, authorId: task.authorId, contextId: task.context.contextId, candidateRef: ref, targetRoot: ref.location,
          inputs: [...inputs, source], expectedDeps: [...inputs, source], ownership: { writePaths: ['.'], readOnlyPaths: [] }, mediaRequirements: [{ artifactRef: selected(task, 'media'), media: media.metadata.media! }] });
      }
      const reviewWorkspace = await directory(root, `reviews/${task.taskId}`); return { artifacts: [ref], reviewWorkspace };
    },
    async verify(task, signal) {
      const authority = await requireDispatch(task, signal);
      const ref = taskOutput(task), kind = role(task), reportPath = `evidence/${task.taskId}/host-report.json`; let passed = false, actual = 'Host validation did not complete.';
      let classification: 'code_defect' | 'insufficient_evidence' = 'insufficient_evidence';
      try {
        if (kind === 'design') {
          const design = await json(root, `${ref.location}/_cosmos/design.json`); validateDesign(design, gameplayIds); passed = true;
        } else if (kind === 'art') {
          const captured = await registry.getCapture(ref), design = await designFor(task);
          validateDeclaredMedia(await json(root, `${ref.location}/_cosmos/mediaSpec.json`), design);
          if (!captured.metadata.media) throw new Error('Missing generated media manifest.');
          await validateMedia(captured.metadata.media, join(root, ref.location), captured.files.map(file => file.destination)); passed = true;
        } else {
        const proof = await registry.verifyCandidate(ref, {
          build: async (_candidate, project) => {
            const checked = await io.build(project, task.taskId, signal, validation ? await requireDispatch(task, signal) : authority);
            if (validation) await requireDispatch(task, signal);
            await writeJson(root, `evidence/${task.taskId}/build.json`, checked);
            if (!checked.passed) { classification = 'code_defect'; actual = checked.diagnostics.slice(0, 16000) || 'Typecheck/build failed.'; }
            return { passed: checked.passed, evidenceIds: [`${task.taskId}-host`] };
          },
          acceptance: async (_candidate, project) => {
            if (validation) await requireDispatch(task, signal);
            const server = await serve(project);
            try {
              const gameplay: AcceptancePlan = { ...structuredClone(draft.scenario), formatVersion: '1.0.0', projectId: 'game', runId: task.runId, taskId: task.taskId,
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
                const paths = [...new Set(report.steps.filter(step => draft.scenario.steps.some(original => original.id === step.id) && step.screenshot).map(step => `browser-evidence/${step.screenshot}`))];
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
      } catch { /* Trusted diagnostics above distinguish a code defect from missing host evidence. */ }
      const evidence: EvidenceContract = { contractVersion: '1.0.0', evidenceId: `${task.taskId}-host`, taskId: task.taskId, acceptanceIds: task.acceptanceIds,
        kind: 'test_report', source: { artifactId: `${task.taskId}-host-report`, version: ref.version, location: reportPath }, artifactVersions: [...task.inputs, ...task.artifacts],
        outcome: passed ? 'passed' : 'failed', recordedAt: new Date().toISOString(), summary: passed ? kind === 'coding' ? 'Fixed candidate built and passed normal input checks; independent review follows.'
          : `${kind} stage checks passed on fixed outputs; this is not a gameplay verdict.` : actual };
      if (validation) await requireDispatch(task, signal);
      await writeJson(root, reportPath, { evidence, proof: proofs.get(task.taskId) ?? null });
      if (!passed) failures.set(task.taskId, new HostFailure(task.acceptance.map(item => ({ acceptanceId: item.acceptanceId, checkId: 'browser-build', classification,
        summary: actual, reproduction: item.steps, expected: item.expected, actual, evidenceRefs: [reportPath] }))));
      const supplemental: EvidenceContract[] = (pictures.get(task.taskId) ?? []).map((source, index) => ({ ...evidence, evidenceId: `${task.taskId}-image-${index}`, source, kind: 'screenshot', outcome: 'observed', summary: 'Normal-input screenshot of this exact candidate; interpreted with fixed source and runtime observations.' }));
      if (passed && kind === 'coding') supplemental.push({ ...evidence, evidenceId: `${task.taskId}-media-usage`, kind: 'log', outcome: 'observed',
        source: { artifactId: `${task.taskId}-media-usage`, version: ref.version, location: `evidence/${task.taskId}/media-usage.json` },
        summary: 'Check the observation implementations against frozen Phaser source and normal-input screenshots. Read-only counters alone do not establish visible or audible quality.' });
      if (passed) await copyRefs(root, join(root, `reviews/${task.taskId}`), [...task.inputs, ...task.artifacts, ...task.context.interfaces, evidence.source, ...supplemental.map(item => item.source)]);
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
          const capture = await registry.getCapture(ref), dependencies = kind === 'art' ? [...captures, selected(task, 'design')] : captures;
          if (capture.taskId !== task.taskId || !capture.metadata.provenance.sourceRefs.includes(task.attempts.at(-1)!.sessionRef) || !sameValue(capture.dependencies, dependencies)) return null;
        }
        const reviewWorkspace = join(root, `reviews/${task.taskId}`); if (!(await lstat(reviewWorkspace)).isDirectory()) return null;
        return { artifacts: [ref], reviewWorkspace };
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
      await stageFeedback(feedback);
      return sources.map(source => {
        const failed = source.task.taskId === feedback.sourceTaskId, ref = nextOutput(source.task), diagnostic = failureSource(feedback.sourceTaskId, feedback.sourceAttemptId);
        return { sourceTaskId: source.task.taskId, taskId: `${source.task.taskId.slice(0, failed ? 57 : 54)}-${failed ? 'repair' : 'successor'}`,
          allocationMicroCny: grants[source.task.taskId], outputs: [{ ...source.task.outputs[0], destination: ref.location }], expectedArtifacts: [ref],
          ...(failed && feedback.issues.some(issue => issue.evidenceRefs.includes(`${diagnostic.location}/manifest.json`)) ? { interfaces: [diagnostic] } : {}) };
      });
    },
    async finish(tasks) {
      let current = await controller.read();
      if (validation) {
        try { current = (await validationScope()).snapshot; for (const task of tasks) { boundTask(task); requireValidationTask(current, task); if (!sameValue(current.tasks.find(item => item.taskId === task.taskId), task)) throw new Error('Final validation task differs from its persistent result.'); } }
        catch { return { gaps: ['Current validation scope or complete persistent task approval is unavailable.'] }; }
      }
      const task = tasks.find(task => role(task) === 'coding');
      if ((validation ? currentValidationCase(current).stopReason : executionWindowView(current).executionWindow.stopReason) || !task || tasks.length !== 3 || tasks.some(task => task.state !== 'passed' || task.review.verdict !== 'approved')
        || binding && (tasks.some(task => !binding.tasks.some(item => item.task.taskId === task.taskId)) || new Set(tasks.map(task => task.taskId)).size !== binding.tasks.length)) {
        const existing = await registry.current(); return { ...(existing ? { delivery: existing.targetRoot } : {}), gaps: ['Current tasks lack complete host checks and independent approval.'] };
      }
      const ref = taskOutput(task), proof = proofs.get(task.taskId);
      if (proof) await registry.promoteCandidate(ref, { evidence: proof, review: { candidateRef: ref, attemptId: proof.attemptId, reviewerId: task.review.reviewerId!, contextId: task.review.contextId!, verdict: 'approved', evidenceIds: task.review.evidenceIds } });
      const accepted = await registry.current();
      if (!accepted || !sameValue(accepted.candidateRef, ref)) return { gaps: ['Candidate promotion cannot be established; preserve the original version and evidence.'] };
      return { delivery: accepted.targetRoot, gaps: [], acceptedCandidate: accepted, mediaUsage: `evidence/${task.taskId}/media-usage.json` };
    },
  };
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
      await validationScope(); await stageFeedback(feedback); await controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback: feedback.reference });
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
  return host;
}

/** Uses installed locked generic tools; preparation creates no game-specific output. */
export function createProductHost(repository: string): ProductHost {
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
    questions: options => requestDesignQuestions({ ...options, capabilities: CAPABILITIES, maxOutputTokens: 4096, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: requestReservation }),
    draft: async options => withHostStages(await requestDesignDraft({ ...options, capabilities: CAPABILITIES, maxOutputTokens: 8192, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: requestReservation })),
    execute: options => executeGeneration({ ...options, createHost: createBrowserHost }),
  };
}
