import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, stat, lstat, readdir, unlink, cp, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transferCaseEightFixture, loadTransferCaseEightFixture } from './validation-case-eight.fixture.ts';
import { deriveTransferValidationCaseEightDeclaration } from '../../probes/transfer/validation-case-eight-declaration.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { bootstrapTransferValidationCaseEightToolchain, stageTransferValidationCaseEightInput, executeTransferValidationCaseEightDag } from '../../probes/transfer/validation-case-eight-driver.ts';
import { prepareTransferValidationCaseEightExecution } from '../../probes/transfer/validation-case-eight-task.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { syntheticTransferSessions } from './validation-case-six-stages.fixture.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
let admittedSeed: string | undefined;

test('C8 authenticated history admits its independent quote and rejects changed source fees grants or owners without writes', async t => {
  const f = process.env.COS76_SOURCE_SEED ? await loadTransferCaseEightFixture(process.env.COS76_SOURCE_SEED) : await transferCaseEightFixture(t);
  t.diagnostic(`SOURCE/TEMP admission proof ${f.repository}`);
  const snapshot = join(f.ledgerRoot, 'snapshot.json'), original = await readFile(snapshot), baseline: any = f.baseline;
  const D = deriveTransferValidationCaseEightDeclaration(baseline); let hostCalls = 0;
  const host = { prepare: async () => { hostCalls++; }, execute: async () => { hostCalls++; return { outcome: 'failed' as const, gaps: ['SOURCE unexpected dispatch'] }; } };
  async function refuse(pattern: RegExp) {
    const before = await readFile(snapshot), info = await stat(snapshot), files = await readdir(join(f.repository, '.cosmos'), { recursive: true });
    await assert.rejects(f.entry.runTransferValidationCaseEightWithHost({ repository: f.repository, args: f.args, host }), pattern);
    assert.equal(hostCalls, 0); assert.deepEqual(await readFile(snapshot), before); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs);
    assert.deepEqual(await readdir(join(f.repository, '.cosmos'), { recursive: true }), files);
    await assert.rejects(lstat(f.root), (error: any) => error.code === 'ENOENT');
  }
  for (const mutate of [
    (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 58_415 }),
    (s: any) => { s.allocationClosureDecisions.pop(); },
    (s: any) => { s.ledger.allocationClosures.pop(); },
    (s: any) => { s.validation.cases[14].stopReason = null; },
    (s: any) => { s.validation.cases.pop(); },
    (s: any) => { s.ledger.allocationDelegations[6].caseId = 'foreign'; },
    (s: any) => { s.validation.cases[12].quote.identity.reviewedPlatformSha = '0'.repeat(40); },
    (s: any) => { s.validation.cases[14].quote.declaration.grants.coding.amountMicroCny++; },
  ]) {
    const changed = structuredClone(baseline); mutate(changed); await writeFile(snapshot, JSON.stringify(changed), 'utf8');
    try { await refuse(/unknown|reconcil|Invalid|Validation|snapshot|audit|allocation|closed|declaration|delegation|quote/); } finally { await writeFile(snapshot, original); }
  }
  for (const path of [join(f.ledgerRoot, '.controller.lock.recovery'), join(f.manifest.originalRoot, 'registry/.commit.lock.recovery')]) {
    await writeFile(path, 'SOURCE unresolved owner', 'utf8'); try { await refuse(/owner|unresolved/); } finally { await unlink(path); }
  }
  const closureSource = join(f.ledgerRoot, baseline.allocationClosureDecisions[12].operatorDecision.source.location), closureBytes = await readFile(closureSource);
  await writeFile(closureSource, Buffer.concat([closureBytes, Buffer.from(' ')])); try { await refuse(/closure|source|bytes/); } finally { await writeFile(closureSource, closureBytes); }
  const manifestPath = join(f.ledgerRoot, 'cos20-transfer-validation-8-reuse.json'), manifestBytes = await readFile(manifestPath);
  await writeFile(manifestPath, '{}', 'utf8'); try { await refuse(/historical|manifest|source|stage/i); } finally { await writeFile(manifestPath, manifestBytes); }
  const mappingPath = join(f.repository, 'docs/specs/github-issues.json'), mappingBytes = await readFile(mappingPath), mapping = JSON.parse(mappingBytes.toString('utf8'));
  const unrelated = await f.git('commit-tree', `${f.head}^{tree}`, '-m', 'SOURCE unrelated approval');
  for (const [taskId, change] of [['COS-60', { reviewStatus: 'SOURCE_NOT_READY' }], ['COS-74', { reviewStatus: 'SOURCE_NOT_READY' }], ['COS-75', { reviewStatus: 'SOURCE_NOT_READY' }],
    ['COS-75', { reviewedCommit: unrelated }], ['COS-75', { mergeCommit: unrelated }]] as const) {
    const wrong = structuredClone(mapping); Object.assign(wrong.tasks.find((item: any) => item.taskId === taskId), change);
    await writeFile(mappingPath, JSON.stringify(wrong), 'utf8'); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE fixed C8 dependency refusal');
    f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
    await refuse(/COS-60|COS-74|COS-75|ancestor/);
  }
  await writeFile(mappingPath, mappingBytes); await f.git('add', 'docs/specs/github-issues.json'); await f.git('commit', '-m', 'SOURCE restore approved C8 prerequisites');
  f.head = await f.git('rev-parse', 'HEAD'); f.args[1] = f.head; await f.git('update-ref', 'refs/remotes/origin/main', f.head);
  const ready = await f.entry.preflightTransferValidationCaseEightRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(ready.paidRequests, 0); assert.equal(ready.quote.declaration.grants.coding.amountMicroCny, 1_720_718);
  const changed = structuredClone(baseline), oldAudit = changed.allocationClosureDecisions.pop(); changed.ledger.allocationClosures.splice(-5);
  changed.ledger.entries.at(-1).settledMicroCny += 31_585; changed.run.fees.settledMicroCny += 31_585;
  changed.events = changed.events.filter((event: any) => !(event.type === 'validation_allocation_closed' && event.reason.includes(oldAudit.operatorDecision.decisionId)));
  changed.events.forEach((event: any, i: number) => { event.sequence = i + 1; }); changed.revision = oldAudit.quote.basis.revision;
  validateSnapshot(changed); await writeFile(snapshot, JSON.stringify(changed), 'utf8');
  const identityReader = fixedTransferValidationInput(changed.validation!.cases[14].quote.declaration).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: f.head });
  const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader }, quote = await prepareValidationAllocationClosure({ ...context, caseIds: [changed.validation!.currentCaseId] });
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'SOURCE-C7-second-cost-closure', actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
    source: { artifactId: 'SOURCE-C7-second-closure', version: 'v1', location: 'SOURCE-C7-second-closure.json' }, sourceRefs: [{ artifactId: 'SOURCE-C7-second-cost', version: 'SOURCE-90000', location: 'SOURCE-only settlement variant' }] };
  await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...decision, source: undefined, quote }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote, decision });
  const second = await f.entry.preflightTransferValidationCaseEightRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(second.quote.declaration.grants.coding.amountMicroCny, ready.quote.declaration.grants.coding.amountMicroCny - 31_585);
  assert.notEqual(second.admissionRef!.version, ready.admissionRef!.version); assert.notEqual(second.quote.quoteId, ready.quote.quoteId);
  const stale = { kind: 'operator_validation' as const, decisionId: 'SOURCE-C8-old-quote', actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
    source: { artifactId: 'SOURCE-C8-old-quote', version: 'v1', location: 'SOURCE-C8-old-quote.json' }, sourceRefs: [ready.inheritedSource, ready.admissionRef!] };
  await writeFile(join(f.ledgerRoot, stale.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...stale, source: undefined, quote: ready.quote }), 'utf8');
  await assert.rejects(RunController.claimValidationCase({ ...context, quote: ready.quote, decision: stale }), /stale|baseline|capacity|budget/);
  await writeFile(snapshot, original); assert.equal(validationHash(await readFile(snapshot)), validationHash(original));
  const markerPath = join(f.repository, '.cosmos/SOURCE-C8-fixture.json'), marker = JSON.parse(await readFile(markerPath, 'utf8'));
  await writeFile(markerPath, JSON.stringify({ ...marker, head: f.head }), 'utf8');
  assert.equal(D.caseId, 'cos20-transfer-validation-8'); assert.equal(hostCalls, 0);
  t.diagnostic(`SOURCE C8 admission variants PASS; reusable before-claim seed ${f.repository}`);
  admittedSeed = f.repository;
});

test('C8 current host claims one real linked repair and its cold driver reaches the current repair author factory', async t => {
  const seed = admittedSeed ?? process.env.COS76_SOURCE_SEED;
  assert.ok(seed, 'Run admission first or provide the exact SOURCE/TEMP before15 fixture.');
  const f = await loadTransferCaseEightFixture(seed), D = deriveTransferValidationCaseEightDeclaration(f.baseline), calls: Parameters<typeof syntheticTransferSessions>[0] = [];
  const before = structuredClone(f.baseline), transport = syntheticTransferSessions(calls), configs: any[] = [];
  let prepares = 0, bootstraps = 0, repairFactory = 0, coldCapture = 0;
  const sessionFactory: any = async (config: any) => {
    const packet = JSON.parse(config.context); configs.push(config);
    assert.equal(config.requestTimeoutMs, packet.role === 'coding' ? 600000 : 120000); assert.equal((await config.requestWindow()).cleanupMs, 5000);
    assert.equal(packet.role, 'coding');
    if (packet.taskId === D.grants.repair.taskId) { repairFactory++; throw new Error('SOURCE controlled completion at current repair factory; no v2 capture or promotion.'); }
    return transport(config);
  };
  const io: any = { build: async (project: string) => ({ passed: false, work: project, diagnostics: 'SOURCE C8 generated code defect', results: [{ code: 1, stdout: 'src/main.ts(1,1): error TS2322: SOURCE synthetic defect', stderr: '' }] }),
    play: async () => { throw new Error('SOURCE no browser'); }, playPersistent: async () => { throw new Error('SOURCE no browser'); } };
  const host: any = { prepare: async () => { prepares++; }, execute: async () => { throw new Error('SOURCE direct driver boundary only'); } };
  const started = await f.entry.startTransferValidationCaseEight({ repository: f.repository, args: f.args, host }), input = started.input;
  let current: Awaited<ReturnType<typeof createTransferReusedConsumerHost>> | undefined;
  try {
    await bootstrapTransferValidationCaseEightToolchain(input, async (job: any) => {
      bootstraps++; assert.equal(job.authority.taskId, D.grants.planning.taskId);
      await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
      await symlink(fileURLToPath(new URL('../../templates/2d/node_modules', import.meta.url)), join(input.root, 'toolchain/node_modules'), 'junction');
      const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
      await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
      return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'SOURCE fixed bootstrap transport', cleanup: {} };
    });
    const scoped = await stageTransferValidationCaseEightInput(input, started.historical);
    current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
      work: input.work, resume: false, historicalStages: started.historical, sessionFactory, io });
    const execution = await prepareTransferValidationCaseEightExecution({ state: await input.controller.read(), window: input.window, requirement: scoped.requirement, host: current,
      historical: await started.historical.verify(input.signal), root: input.root, manifestRef: started.historical.manifestRef, capability: current.capability, signal: input.signal }, false);
    const prepared = execution.tasks[0]; await current.bindPreparedTasks([prepared]);
    assert.equal(prepared.task.taskId, D.grants.coding.taskId); assert.equal(execution.tasks.length, 1);
    const receipt = await readFile(join(input.root, 'execution-reused.json')), info = await stat(join(input.root, 'execution-reused.json'));
    assert.deepEqual(await prepareTransferValidationCaseEightExecution({ state: await input.controller.read(), window: input.window, requirement: scoped.requirement, host: current,
      historical: await started.historical.verify(input.signal), root: input.root, manifestRef: started.historical.manifestRef, capability: current.capability, signal: input.signal }, true), execution);
    assert.deepEqual(await readFile(join(input.root, 'execution-reused.json')), receipt); assert.equal((await stat(join(input.root, 'execution-reused.json'))).mtimeMs, info.mtimeMs);
    const recovery = { artifactRoot: input.root, journalRoot: join(input.root, 'journal'), recoverCapture: current.recoverCapture };
    const failed = await executeTaskDag({ controller: input.controller, requirement: scoped.requirement, validation: scoped.binding, historicalDependencies: started.historical,
      tasks: [prepared], sessionRoot: join(input.root, 'sessions'), availableArtifacts: current.availableArtifacts, roleFactory: current.roleFactory, preAuthor: current.preAuthor,
      capture: current.capture, verify: current.verify, reviewImages: current.reviewImages, diagnoseFailure: current.diagnoseFailure, recovery,
      reviewProtocolCorrections: 1, authorProtocolCorrections: 1, codingHandoffClarifications: 1, hostEvidencedCodingHandoff: 1 });
    assert.equal(failed[0].state, 'failed'); assert.equal(failed[0].attempts[0].failure!.classification, 'code_defect');
    const feedback = JSON.parse(await readFile(join(failed[0].attempts[0].sessionRef, 'failure.json'), 'utf8'));
    const repair = await current.prepareValidationRepair({ ...prepared, task: failed[0] }, feedback, recovery); await current.bindPreparedTasks([repair]);
    assert.equal(repair.task.taskId, D.grants.repair.taskId); assert.equal(repair.task.attempts.length, 0);
    await assert.rejects(current.prepareValidationRepair({ ...prepared, task: failed[0] }, feedback, recovery), /already|claimed/);
    t.diagnostic('SOURCE current C8 candidate/failure signature and real host.prepareValidationRepair PASS; cold branch next.');
    await current.closePreparation(); current = undefined; await input.work.cancelAndDrain('SOURCE C8 cold owner close'); await input.controller.close();
    const cold = await f.entry.startTransferValidationCaseEight({ repository: f.repository, args: f.args, host }, true);
    try {
      assert.equal(cold.input.window.windowId, input.window.windowId); assert.equal(cold.input.window.deadlineAt, input.window.deadlineAt);
      const coldScope = await stageTransferValidationCaseEightInput(cold.input, cold.historical, true);
      const coldHost = await createTransferReusedConsumerHost({ root: cold.input.root, controller: cold.input.controller, requirement: coldScope.requirement, proposal: coldScope.proposal, validation: coldScope.binding,
        work: cold.input.work, resume: true, historicalStages: cold.historical, sessionFactory, io });
      const capture = coldHost.capture; coldHost.capture = async (...args: Parameters<typeof capture>) => { coldCapture++; return capture(...args); };
      const result = await executeTransferValidationCaseEightDag(cold.input, coldScope.requirement, coldScope.binding, coldHost, cold.historical, true);
      assert.equal(result.outcome, 'failed'); assert.equal(repairFactory, 1); assert.equal(coldCapture, 0);
      assert.deepEqual(result.plan, execution.plan); await cold.input.controller.stop('SOURCE current repair factory reached; no v2 proof requested.');
    } finally { await cold.input.work.cancelAndDrain('SOURCE C8 cold proof complete'); await cold.input.controller.close(); }
    const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
    assert.equal(after.validation.cases.length, 16); assert.equal(after.ledger.allocationDelegations.length, 8);
    assert.deepEqual(after.validation.cases.slice(0, 15), before.validation!.cases); assert.deepEqual(after.allocationClosureDecisions, before.allocationClosureDecisions);
    assert.deepEqual(after.ledger.allocationClosures, before.ledger.allocationClosures); assert.deepEqual(after.ledger.entries.slice(0, before.ledger.entries.length), before.ledger.entries);
    assert.equal(prepares, 1); assert.equal(bootstraps, 1); assert.deepEqual(configs.map(c => JSON.parse(c.context).taskId), [D.grants.coding.taskId, D.grants.repair.taskId]);
    assert.deepEqual(calls.map(c => c.role), ['coding']);
    t.diagnostic(`SOURCE/TEMP C8 claim/current-host-repair/cold-driver proof ${f.repository}; fake SDK/build, no browser or v2 promotion.`);
  } finally { await current?.closePreparation().catch(() => {}); await input.work.cancelAndDrain('SOURCE C8 cleanup').catch(() => {}); await input.controller.close().catch(() => {}); }
});
