import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { budgetCapacity, validateTask } from '../../src/contracts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { requireValidationTask } from '../../src/runtime/validation-validation.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { allocationFixture, closureDecision } from '../runtime/validation-allocations.fixture.ts';

test('planner binds a fresh validation proposal using closed-grant effective capacity', async t => {
  let owner: RunController | undefined;
  t.after(() => owner?.close());
  const gameIds = Array.from({ length: 8 }, (_, i) => `game-${i + 1}`), f = await allocationFixture(t, gameIds);
  const closureQuote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), closureOperator = await closureDecision(f, closureQuote);
  await applyValidationAllocationClosure({ ...f, quote: closureQuote, decision: closureOperator });
  f.advance(Date.now() - f.now());
  const declaration = f.declaration('cos20-planner-fixture'), quote = await prepareValidationCase({ ...f, declaration });
  const decision = { kind: 'operator_validation' as const, decisionId: 'offline-planner-decision', actorId: 'offline-coordinator', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'offline-planner-decision', version: 'v1', location: 'offline-planner-decision.json' },
    sourceRefs: [{ artifactId: 'offline-source', version: 'v1', location: 'offline-source.json' }] };
  const operatorPath = join(f.root, decision.source.location);
  await writeFile(operatorPath, JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...f, quote, decision });
  const controller = owner = await RunController.openValidationCase({ ...f, caseId: window.caseId, windowId: window.windowId });
  const snapshotPath = join(f.root, 'snapshot.json'), before = await readFile(snapshotPath), snapshot = await controller.read();
  assert.equal(snapshot.ledger.contractVersion, '3.0.0');
  assert.equal(snapshot.ledger.allocations.reduce((sum, grant) => sum + grant.amountMicroCny, 0), 168_596_040);
  assert.equal(snapshot.ledger.allocationClosures!.length, 15);
  assert.deepEqual(budgetCapacity(snapshot.ledger), { effectiveLimitMicroCny: 150_000_000, allocatedMicroCny: 106_522_666 });
  assert.equal(snapshot.ledger.entries.filter(entry => entry.taskId === declaration.grants.planning.taskId).length, 0);
  const source = { artifactId: 'offline-requirements', version: 'fixture-v1', location: 'requirements.json' };
  const requirement = createValidationRequirement({ specVersion: snapshot.run.specVersion, sources: [source],
    acceptance: ['design', 'art', ...gameIds].map(acceptanceId => ({ acceptanceId, description: acceptanceId, steps: ['Check the offline fixture'], expected: 'Passed', evidenceKinds: ['test_report'] })),
    validation: { runId: snapshot.run.runId, ledgerId: snapshot.ledger.ledgerId, caseId: window.caseId, windowId: window.windowId, ...quote.identity, decision } });
  const validation = { caseId: window.caseId, windowId: window.windowId,
    readScope: async () => ({ requirement, operatorReceipt: await readFile(operatorPath) }) };
  const authorRoles = ['design', 'art', 'coding'] as const;
  const roles = Object.fromEntries(authorRoles.map(role => [role, { workspace: f.repositoryRoot, allocationMicroCny: declaration.grants[role].amountMicroCny,
    writePaths: [`authors/${role}`], readOnlyPaths: ['requirements.json'], tools: ['read', 'write'],
    outputs: [{ artifactId: role, version: 'v1', destination: `artifacts/${role}/v1`, type: 'fixture', schema: 'offline/1' }] }]));
  const drafts = authorRoles.map(role => ({ taskId: declaration.grants[role].taskId, role, objective: `Offline ${role}`,
    acceptanceIds: role === 'coding' ? gameIds : [role], dependsOn: role === 'coding' ? [declaration.grants.design.taskId, declaration.grants.art.taskId] : [] }));
  let proposals = drafts, prompts = 0, closes = 0;
  const roleFactory = createRoleFactory({ maxOutputTokens: 4096, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 1,
    sessionFactory: async () => ({ prompt: async () => { prompts++; return { text: JSON.stringify({ tasks: proposals }) }; }, close: async () => { closes++; } }) });
  const options = { controller, requirement, validation, planningTaskId: declaration.grants.planning.taskId, workspace: f.repositoryRoot,
    sessionRoot: join(f.base, 'sessions'), availableArtifacts: [source], roles, roleFactory };
  const result = await planTaskDag(options);
  assert.equal(prompts, 1); assert.equal(closes, 1);
  assert.deepEqual(result.tasks.map(prepared => prepared.task.taskId), drafts.map(draft => draft.taskId));
  assert.deepEqual(result.tasks.map(prepared => prepared.task.budget.allocationMicroCny), authorRoles.map(role => declaration.grants[role].amountMicroCny));
  for (const [index, prepared] of result.tasks.entries()) {
    assert.deepEqual(validateTask(prepared.task), []);
    requireValidationTask(snapshot, prepared.task);
    assert.deepEqual(prepared.task.ownership, { writePaths: [`authors/${authorRoles[index]}`], readOnlyPaths: ['requirements.json'] });
    assert.deepEqual(prepared.task.acceptance.map(item => item.acceptanceId), drafts[index].acceptanceIds);
  }
  assert.deepEqual(result.tasks[2].task.inputs, [source, ...result.tasks.slice(0, 2).flatMap(prepared => prepared.expectedArtifacts!)]);
  const plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.equal(plan.status, 'validated_proposal'); assert.deepEqual(plan.tasks, result.tasks);
  assert.deepEqual(await readFile(snapshotPath), before, 'Planning must preserve historical fees, grants, closures, requests and case clocks');
  proposals = structuredClone(drafts);
  proposals[0].taskId = f.declaration(f.caseIds[0]).grants.design.taskId;
  proposals[2].dependsOn[0] = proposals[0].taskId;
  await assert.rejects(planTaskDag(options), /Plan tasks and policy slots must be unique and new/);
  assert.deepEqual(await readFile(snapshotPath), before);
  await assert.rejects(planTaskDag({ ...options, validation: undefined }), /Continuation execution is unsupported/);
  assert.deepEqual(await readFile(snapshotPath), before);
});
