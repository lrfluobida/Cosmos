import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import type { ValidationDeclaration, OperatorValidationDecision } from '../../src/runtime/validation-types.ts';
import type { ValidationExecutionBinding } from '../../src/runtime/validation-scope.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { requireValidationPreparationScope } from '../../src/runtime/entrypoint-validation.ts';
import { createHistoricalPassedStages } from '../../src/runtime/historical-passed-stages.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE as GROUP } from '../../probes/transfer/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIX as C6 } from '../../probes/transfer/validation-case-six-declaration.ts';

const sourceRepository = join(tmpdir(), 'cosmos-transfer-entry-T81i3U');
const sourceLedger = join(sourceRepository, '.cosmos/validation-shared');
const sourceRoot = join(sourceRepository, '.cosmos/e2e/cos20-transfer-validation-5');
const manifestLocation = 'cos20-transfer-validation-6-reuse.json';
const sourceIdentity = {
  caseId: 'cos20-transfer-validation-5',
  windowId: 'validation-vq2-9182506ab949910b1145620640f3f31703057e3ab1b85d9e39e547ca6e1f4986',
  reviewedPlatformSha: 'ab43521ea244221db1060bc9b7e130439fc1ca57',
  frozenCaseInputHash: 'f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c',
  designTaskId: 'cos20-transfer-validation-5-design', artTaskId: 'cos20-transfer-validation-5-art',
};

/** SOURCE host seam only: fresh API-issued windows, no fixed C6 entry admission,
 * replayed C1-C5, provider, generated game or browser. The archived C5 stays read-only. */
async function legacyHostFixture(t: TestContext, changedInput: boolean) {
  const manifestBytes = await readFile(join(sourceLedger, manifestLocation));
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'cosmos-C6-host-boundary-'));
  const ledgerRoot = join(repositoryRoot, '.cosmos/validation-shared'), root = join(repositoryRoot, '.cosmos/e2e', C6.caseId);
  let active: RunController | undefined, work: OwnedWork | undefined;
  t.after(async () => {
    try { await work?.cancelAndDrain('SOURCE host boundary finished'); await active?.close(); }
    finally {
      assert.ok(resolve(repositoryRoot).startsWith(resolve(tmpdir()) + sep));
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
  const manifestRef = { artifactId: `${C6.caseId}-historical-stages`, version: validationHash(manifestBytes), location: manifestLocation };
  const historical = createHistoricalPassedStages({ originalRoot: sourceRoot, targetRoot: root, expected: sourceIdentity, manifestRef,
    readManifest: async signal => { signal.throwIfAborted(); return readFile(join(sourceLedger, manifestLocation)); } });
  const inherited = await historical.verify(new AbortController().signal);
  const sourceInput = await readFile(join(sourceRoot, inherited.requirementCapture.location, '_cosmos/cos20-transfer-validation-5-input.json'));
  assert.equal(validationHash(sourceInput), C6.inputs.requirements.sha256);
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  for (const file of C6.inputs.template.files) {
    const bytes = await readFile(join(repository, file.path)); assert.equal(validationHash(bytes), file.sha256);
    await mkdir(dirname(join(repositoryRoot, file.path)), { recursive: true }); await writeFile(join(repositoryRoot, file.path), bytes);
  }
  await mkdir(dirname(join(repositoryRoot, C6.inputs.requirements.path)), { recursive: true });
  await writeFile(join(repositoryRoot, C6.inputs.requirements.path), sourceInput);
  active = await RunController.create({ root: ledgerRoot, runId: inherited.sourceRequirement.validation.runId,
    ledgerId: inherited.sourceRequirement.validation.ledgerId, kind: 'evaluation', scope: 'validation', specVersion: inherited.sourceRequirement.specVersion,
    allocations: [{ taskId: 'COS-16', amountMicroCny: 10_000_000 }], durationMs: 1000, now: () => Date.now() - 2000 });
  await active.close(); active = undefined;
  await writeFile(join(ledgerRoot, manifestLocation), manifestBytes);
  const claim = async (declaration: ValidationDeclaration) => {
    const identity = { reviewedPlatformSha: sourceIdentity.reviewedPlatformSha, frozenCaseInputHash: validationInputHash(declaration) };
    const context = { root: ledgerRoot, repositoryRoot, identityReader: async () => identity };
    const quote = await prepareValidationCase({ ...context, declaration });
    const decision: OperatorValidationDecision = { kind: 'operator_validation', decisionId: `SOURCE-${declaration.caseId}`, actorId: 'SOURCE-host-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: `SOURCE-${declaration.caseId}`, version: 'v1', location: `SOURCE-${declaration.caseId}.json` }, sourceRefs: [manifestRef] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...context, quote, decision });
    active = await RunController.openValidationCase({ ...context, caseId: declaration.caseId, windowId: window.windowId });
    await mkdir(join(repositoryRoot, '.cosmos/e2e', declaration.caseId), { recursive: true });
    return { controller: active, context, window, decision, identity };
  };
  const close = async (current: Awaited<ReturnType<typeof claim>>) => {
    await current.controller.stop('SOURCE accounting-only seed closed without requests'); await current.controller.close(); active = undefined;
    const quote = await prepareValidationAllocationClosure({ ...current.context, caseIds: [current.window.caseId] });
    const decision = { ...current.decision, kind: 'operator_validation_allocation_closure' as const, decisionId: `${current.decision.decisionId}-closure`,
      source: { ...current.decision.source, location: `${current.decision.decisionId}-closure.json` } };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...decision, source: undefined, quote }), 'utf8');
    await applyValidationAllocationClosure({ ...current.context, quote, decision });
  };
  const seedId = 'cos20-source-legacy-ledger', groupId = 'cos20-source-legacy-group';
  const ungrouped = JSON.parse(sourceInput.toString('utf8')); delete ungrouped.budgetGroup;
  const seedBytes = JSON.stringify(ungrouped);
  const seed: ValidationDeclaration = { ...structuredClone(VALIDATION_CASE), caseId: seedId,
    grants: Object.fromEntries(Object.entries(VALIDATION_CASE.grants).map(([role, grant]) => [role, { ...grant, taskId: `${seedId}-${role}` }])) as ValidationDeclaration['grants'],
    inputs: { template: structuredClone(C6.inputs.template), requirements: { version: C6.inputs.requirements.version, path: 'seed-requirements.json', sha256: validationHash(seedBytes) } } };
  await writeFile(join(repositoryRoot, seed.inputs.requirements.path), seedBytes, 'utf8'); await close(await claim(seed));
  const group: ValidationDeclaration = { ...structuredClone(GROUP), caseId: groupId,
    grants: Object.fromEntries(Object.entries(GROUP.grants).map(([role, grant]) => [role, { ...grant, taskId: `${groupId}-${role}` }])) as ValidationDeclaration['grants'] };
  await close(await claim(group));
  // A whitespace-only byte change preserves the complete preparation/acceptance,
  // while the new declaration, identity, quote and operator genuinely bind a different hash.
  const bytes = changedInput ? Buffer.concat([sourceInput, Buffer.from('\n')]) : sourceInput;
  const declaration: ValidationDeclaration = { ...structuredClone(C6), inputs: { ...C6.inputs,
    requirements: { ...C6.inputs.requirements, sha256: validationHash(bytes) } } };
  await writeFile(join(repositoryRoot, declaration.inputs.requirements.path), bytes);
  const current = await claim(declaration); work = new OwnedWork(current.controller.signal);
  await mkdir(join(root, 'requirements')); await writeFile(join(root, 'requirements/fixed.json'), bytes);
  await cp(join(repositoryRoot, 'templates/2d'), join(root, 'toolchain'), { recursive: true });
  const requirement = createValidationRequirement({ specVersion: inherited.sourceRequirement.specVersion, acceptance: inherited.sourceRequirement.acceptance,
    sources: [{ artifactId: `${C6.caseId}-input`, version: declaration.inputs.requirements.version, location: 'requirements/fixed.json' }],
    validation: { runId: inherited.sourceRequirement.validation.runId, ledgerId: inherited.sourceRequirement.validation.ledgerId,
      caseId: C6.caseId, windowId: current.window.windowId, ...current.identity, decision: current.decision } });
  const proposal = JSON.parse(bytes.toString('utf8')).preparation;
  let scopeReads = 0, verifies = 0, imports = 0, sessions = 0, builds = 0;
  const validation: ValidationExecutionBinding = { caseId: C6.caseId, windowId: current.window.windowId,
    historicalManifest: { reference: manifestRef, readBytes: historical.readManifest },
    readScope: async signal => { signal.throwIfAborted(); scopeReads++; return { requirement, operatorReceipt: await readFile(join(ledgerRoot, current.decision.source.location)) }; } };
  const input = { root, controller: current.controller, requirement, proposal, validation, work, resume: false,
    historicalStages: { ...historical, verify: async (signal: AbortSignal) => { verifies++; return historical.verify(signal); },
      import: async (signal: AbortSignal) => { imports++; return historical.import(signal); } },
    sessionFactory: async () => { sessions++; throw new Error('SOURCE host seam must not create a session'); },
    io: { build: async () => { builds++; throw new Error('SOURCE host seam must not build'); }, play: async () => { throw new Error('SOURCE host seam must not open a browser'); } } };
  return { input, inherited, root, ledgerRoot, declaration, sourceInput, current, manifestBytes,
    counts: () => ({ scopeReads, verifies, imports, sessions, builds }) };
}

test('C6 different authenticated input hash reaches the real host guard and is refused before import or sessions', async t => {
  const f = await legacyHostFixture(t, true), before = await readFile(join(f.ledgerRoot, 'snapshot.json')), names = await readdir(f.root);
  assert.notEqual(f.input.requirement.validation.frozenCaseInputHash, f.inherited.sourceRequirement.validation.frozenCaseInputHash);
  assert.deepEqual(f.input.requirement.acceptance, f.inherited.sourceRequirement.acceptance);
  const scope = await requireValidationPreparationScope({ ...f.input, adapterId: 'cos16-input/1' });
  assert.equal(scope.window.caseId, C6.caseId); assert.deepEqual(scope.window.quote.declaration, f.declaration);
  const reads = f.counts().scopeReads;
  await assert.rejects(async () => { const host = await createTransferReusedConsumerHost(f.input); await host.closePreparation(); },
    { message: 'Fixed C15/C5 historical input authority changed.' });
  assert.ok(f.counts().scopeReads > reads); assert.equal(f.counts().verifies, 2, 'Both real historical checks completed after the current scope check.');
  assert.deepEqual({ imports: f.counts().imports, sessions: f.counts().sessions, builds: f.counts().builds }, { imports: 0, sessions: 0, builds: 0 });
  assert.deepEqual(await readdir(f.root), names); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  assert.deepEqual(await readFile(join(sourceLedger, manifestLocation)), f.manifestBytes);
});

test('C6 unchanged input hash still constructs the real historical consumer host', async t => {
  const f = await legacyHostFixture(t, false);
  assert.deepEqual(f.declaration, C6);
  assert.equal(f.input.requirement.validation.frozenCaseInputHash, f.inherited.sourceRequirement.validation.frozenCaseInputHash);
  const host = await createTransferReusedConsumerHost(f.input);
  try { assert.equal(f.counts().imports, 1); assert.equal(f.counts().sessions, 0); assert.equal(f.counts().builds, 0); assert.equal(host.taskPolicies.length, 1); }
  finally { await host.closePreparation(); }
  assert.deepEqual(await readFile(join(sourceLedger, manifestLocation)), f.manifestBytes);
});
