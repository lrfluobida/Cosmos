import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { createPilotGuard } from '../../probes/e2e/budget.ts';
import { generatePilot } from '../../probes/e2e/driver.ts';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertPilotNotStarted } from '../../probes/e2e/budget.ts';
import { assertTrialUnused, TRIAL } from '../../probes/e2e/trial.ts';
import { readContinuation } from '../../probes/e2e/continuation.ts';
import { readStartupRecovery, STARTUP_DEADLINE } from '../../probes/e2e/startup.ts';
import { writeJson, jsonFile } from '../../probes/e2e/host.ts';
import { checkExperimentAdmission, claimExperiment, readExperimentHistory, EXPERIMENT } from '../../probes/e2e/experiment.ts';
import type { TestContext } from 'node:test';
import * as entry from '../../probes/e2e/run.ts';

const sha = 'a'.repeat(40), now = Date.parse('2026-10-01T16:00:00.000Z');
const source = new URL('../../', import.meta.url);
async function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-01T06:16:16.857Z') });
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-experiment-')), ledgerRoot = join(repository, '.cosmos/validation-shared');
  const controller = await RunController.create({ root: ledgerRoot, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation',
    kind: 'evaluation', scope: 'validation', specVersion: '1.0', allocations: [{ taskId: 'COS-10', amountMicroCny: 10_000_000 },
      { taskId: 'prior', amountMicroCny: 721_771 }, { taskId: 'retained-old', amountMicroCny: 58_674_269 }] });
  t.after(async () => { await controller.close(); await rm(repository, { recursive: true, force: true }); });
  t.mock.timers.setTime(now);
  const importCharge = (requestId: string, taskId: string, actualCostMicroCny: number) => controller.importSettled({ requestId, taskId, provider: 'simulated', pricingVersion: 'fixture', actualCostMicroCny,
    evidence: [{ artifactId: 'simulated-receipt', version: 'v1', location: 'simulated.json' }] });
  await importCharge('prior-deepseek-direct-probes', 'prior', 721_771);
  const oldIds = Array.from({ length: 13 }, (_, i) => `simulated-old-${i}`);
  for (const [i, requestId] of oldIds.entries()) await importCharge(requestId, 'COS-10', i === 12 ? 13_119 : 13_116);
  const oldRoot = join(repository, '.cosmos/e2e/pilot-20261001081828147'), deadlineAt = '2026-10-01T09:48:34.671Z';
  const journal = { startedAt: '2026-10-01T08:18:34.671Z', deadlineAt, maxRequests: 40, requestIds: oldIds };
  await writeJson(ledgerRoot, 'cos10-pilot.json', { root: oldRoot, deadlineAt });
  await writeJson(oldRoot, 'result.json', { outcome: 'failed', simulated: true });
  await writeJson(oldRoot, 'continuation-result.json', { outcome: 'failed', pilotBudget: journal, simulated: true });
  await writeJson(oldRoot, 'continuation-origin.json', { simulated: true });
  await writeJson(oldRoot, 'pilot-budget.json', journal);
  const frozen = JSON.parse(await readFile(new URL('probes/e2e/requirements.json', source), 'utf8'));
  await writeJson(repository, 'probes/e2e/requirements.json', frozen);
  await writeJson(oldRoot, 'confirmed-requirement.json', { requirement: { sources: [{ location: 'frozen' }] } });
  await writeJson(oldRoot, 'frozen/_cosmos/requirements.json', frozen);
  const trialRoot = join(repository, '.cosmos/e2e', TRIAL.id), snapshot = await controller.read();
  const trialOrigin = { trialId: TRIAL.id, root: trialRoot, runId: snapshot.run.runId, ledgerId: snapshot.run.ledgerId, platformHead: '26aee74902b08ea7d32b8ebaf7a0a17ac286e051',
    startedAt: '2026-10-01T11:43:38.426Z', deadlineAt: STARTUP_DEADLINE, sharedDeadlineAt: snapshot.run.originalDeadlineAt, limits: TRIAL,
    baselineRequestIds: snapshot.ledger.entries.map(entry => entry.requestId), baselineCommittedMicroCny: 892_282, budgets: { sharedLedger: ledgerRoot } };
  await writeJson(ledgerRoot, `${TRIAL.id}.json`, trialOrigin); await writeJson(trialRoot, 'origin.json', trialOrigin);
  const emptyJournal = { startedAt: trialOrigin.startedAt, deadlineAt: STARTUP_DEADLINE, maxRequests: 40, requestIds: [] };
  await writeJson(trialRoot, 'pilot-budget.json', emptyJournal);
  await writeJson(trialRoot, 'result.json', { outcome: 'failed', root: trialRoot, platformHead: trialOrigin.platformHead, startedAt: trialOrigin.startedAt,
    deadlineAt: STARTUP_DEADLINE, trialCommittedMicroCny: 0, trialJournal: emptyJournal, simulated: true });
  const dependencies = (JSON.parse(await readFile(new URL('docs/specs/github-issues.json', source), 'utf8')) as { tasks: any[] }).tasks;
  const input = { snapshot, dependencies, now, platformHead: sha, isAncestor: async () => true,
    decision: { approvedPlatformHead: sha, source: 'SIMULATED offline coordinator decision; no live permission' } };
  return { repository, ledgerRoot, controller, oldRoot, trialRoot, input, frozen };
}

// All execution decisions, provider charges and generated fixtures in this file are simulated.
test('experiment guard rejects incremental exposure below the unchanged shared phase cap', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-experiment-cap-'));
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'simulated-run', ledgerId: 'simulated-ledger',
    kind: 'evaluation', scope: 'validation', specVersion: '1.0', allocations: [{ taskId: 'COS-10', amountMicroCny: 10_000_000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  await controller.importSettled({ requestId: 'simulated-history', taskId: 'COS-10', provider: 'fixture', pricingVersion: 'fixture', actualCostMicroCny: 892_282,
    evidence: [{ artifactId: 'simulated-receipt', version: 'v1', location: 'simulated.json' }] });
  const originalDeadline = (await controller.read()).run.originalDeadlineAt;
  const options = { root, controller, deadlineAt: new Date(Date.now() + 60_000).toISOString(), maxRequests: 40, committedCapMicroCny: 5_892_282 };
  const guard = await createPilotGuard(options); t.after(() => guard.close());
  let admissions = 0;
  const budget = guard.wrap({ beforeRequest: async () => { admissions++; }, afterResponse: async () => {} });
  const request = { requestId: 'simulated-over', modelId: 'deepseek-flash' as const, inputBytes: 1, maxOutputTokens: 1, hasImages: false, estimatedMaxCostMicroCny: 5_000_001 };
  await assert.rejects(budget.beforeRequest(request), /budget cap/);
  assert.equal(admissions, 0);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'pilot-budget.json'), 'utf8')).requestIds, []);
  await budget.beforeRequest({ ...request, requestId: 'simulated-at-cap', estimatedMaxCostMicroCny: 5_000_000 });
  assert.equal(admissions, 1);
  assert.equal((await controller.read()).run.originalDeadlineAt, originalDeadline);
});

test('fixed experiment admission retains all baseline charges/allocations and needs a matching explicit decision', async t => {
  const f = await fixture(t), before = await f.controller.read();
  const admitted = await checkExperimentAdmission(f.input);
  assert.equal(admitted.experimentId, EXPERIMENT.id); assert.equal(admitted.deadlineAt, '2026-10-01T16:45:00.000Z');
  assert.equal(admitted.committedCapMicroCny, 5_892_282); assert.deepEqual(admitted.baselineLedger, before.ledger);
  assert.equal(admitted.approvals.find(item => item.taskId === 'COS-11')?.state, 'open');
  assert.deepEqual(await f.controller.read(), before);
  await assert.rejects(checkExperimentAdmission({ ...f.input, decision: { ...f.input.decision, source: '' } }), /decision/);
  await assert.rejects(checkExperimentAdmission({ ...f.input, decision: { ...f.input.decision, approvedPlatformHead: 'b'.repeat(40) } }), /decision/);
  for (const change of [
    (v: typeof f.input) => { v.snapshot.ledger.entries[0].unknown = true; },
    (v: typeof f.input) => { v.snapshot.run.originalDeadlineAt = '2026-10-01T19:00:00.000Z'; },
    (v: typeof f.input) => { v.snapshot.ledger.allocations[2].amountMicroCny = 140_000_000; },
    (v: typeof f.input) => { v.dependencies.find(item => item.taskId === 'COS-13')!.reviewedCommit = 'b'.repeat(40); },
  ]) { const value = { ...f.input, snapshot: structuredClone(before), dependencies: structuredClone(f.input.dependencies) }; change(value); await assert.rejects(checkExperimentAdmission(value)); }
  const late = await checkExperimentAdmission({ ...f.input, now: Date.parse('2026-10-01T18:00:00.000Z') });
  assert.equal(late.deadlineAt, before.run.originalDeadlineAt);
});

test('new claim is consumed before any capture while every old entry stays refused and byte-identical', async t => {
  const f = await fixture(t), admission = await checkExperimentAdmission(f.input);
  const oldPaths = [join(f.ledgerRoot, 'cos10-pilot.json'), join(f.oldRoot, 'result.json'), join(f.oldRoot, 'continuation-result.json'),
    join(f.oldRoot, 'pilot-budget.json'), join(f.ledgerRoot, `${TRIAL.id}.json`), join(f.trialRoot, 'origin.json'), join(f.trialRoot, 'result.json'), join(f.trialRoot, 'pilot-budget.json')];
  const bytes = await Promise.all(oldPaths.map(path => readFile(path))), ledger = await f.controller.read();
  const history = await readExperimentHistory(f.repository, f.ledgerRoot, now);
  assert.equal(history.fixedTrial.recoveryRejection.kind, 'coordinator_record');
  assert.equal(history.fixedTrial.requestCount, 0);
  const args = { repository: f.repository, ledgerRoot: f.ledgerRoot, controller: f.controller, admission, history };
  const origin = await claimExperiment(args);
  assert.equal(origin.root, join(f.repository, '.cosmos/e2e', EXPERIMENT.id));
  assert.deepEqual(await jsonFile(f.ledgerRoot, `${EXPERIMENT.id}.json`), origin);
  await assert.rejects(claimExperiment(args), /already|exists/);
  await assert.rejects(assertPilotNotStarted(f.ledgerRoot), /prior COS-10/);
  await assert.rejects(readContinuation(f.repository, f.ledgerRoot, f.controller), /already used/);
  await assert.rejects(assertTrialUnused(f.repository, f.ledgerRoot), /already/);
  await assert.rejects(readStartupRecovery(f.repository, f.ledgerRoot, f.controller), /deadline expired/);
  assert.deepEqual(await f.controller.read(), ledger);
  for (const [index, path] of oldPaths.entries()) assert.ok((await readFile(path)).equals(bytes[index]), path);
});

test('a partial experiment root consumes the declaration and changed frozen history is rejected', async t => {
  const f = await fixture(t), admission = await checkExperimentAdmission(f.input), history = await readExperimentHistory(f.repository, f.ledgerRoot, now);
  await mkdir(join(f.repository, '.cosmos/e2e', EXPERIMENT.id));
  await assert.rejects(claimExperiment({ repository: f.repository, ledgerRoot: f.ledgerRoot, controller: f.controller, admission, history }), /already|exists/);
  const altered = { ...f.frozen, acceptanceIds: f.frozen.acceptanceIds.slice(1) };
  await rm(join(f.repository, 'probes/e2e/requirements.json'));
  await writeJson(f.repository, 'probes/e2e/requirements.json', altered);
  await assert.rejects(readExperimentHistory(f.repository, f.ledgerRoot, now), /frozen v2/);
});

test('the fixed CLI entry requires an explicit SHA/source and exposes no experiment identity or reset option', () => {
  assert.ok('parsePilotArguments' in entry, 'the production CLI must parse the new explicit decision');
  const parse = entry.parsePilotArguments as (args: string[]) => Record<string, unknown>;
  assert.deepEqual(parse(['--experiment', sha, 'SIMULATED offline decision']), { experimentDecision: { approvedPlatformHead: sha, source: 'SIMULATED offline decision' } });
  for (const args of [['--experiment'], ['--experiment', sha], ['--experiment', sha, ''], ['--experiment', sha, 'source', '--reset'],
    ['--experiment', 'another-root', 'source'], ['--trial', '--experiment', sha, 'source']]) assert.throws(() => parse(args), /Usage|decision/);
  assert.equal(parse(['--trial']).trial, true); assert.equal(parse(['--continue']).continuation, true);
  assert.equal(parse(['--trial-recover-startup']).trialRecoverStartup, true);
});

const simulatedMedia = {
  characters: ['producer', 'shooter', 'defender', 'normal', 'armored'].map(id => ({ id, width: 64, height: 64, anchor: { x: 32, y: 64 },
    layers: [{ id: 'body', shape: 'ellipse', x: 16, y: 16, width: 32, height: 32, fill: '#22aacc', stroke: '#112233', strokeWidth: 1 }],
    states: ['idle', 'attack', 'death'].map(name => ({ name, fps: 4, loop: name !== 'death', frames: [{ body: { opacity: 1 } }, { body: { opacity: 0.7, dx: 2 } }] })) })),
  audio: ['bgm', 'place', 'shoot', 'hit', 'victory', 'defeat'].map(id => ({ id, sampleRate: 22050, duration: 0.1, loop: id === 'bgm',
    notes: [{ midi: 60, start: 0, duration: 0.08, gain: 0.1, wave: 'sine', attack: 0.01, release: 0.01 }] })),
};

for (const exhaustIncrementalBudget of [false, true]) test(`real driver uses declared limits, correction and the same repair guard (incremental stop: ${exhaustIncrementalBudget})`, async t => {
  const f = await fixture(t), admission = await checkExperimentAdmission(f.input), prefix = EXPERIMENT.id;
  const history = await readExperimentHistory(f.repository, f.ledgerRoot, now);
  const origin = await claimExperiment({ repository: f.repository, ledgerRoot: f.ledgerRoot, controller: f.controller, admission, history });
  const root = origin.root, repository = fileURLToPath(source), toolchain = join(root, 'toolchain');
  await cp(join(repository, 'templates/2d'), toolchain, { recursive: true, filter: path => !path.includes('node_modules') && !path.includes('dist') });
  const guard = await createPilotGuard({ root, controller: f.controller, deadlineAt: admission.deadlineAt, maxRequests: 40, committedCapMicroCny: admission.committedCapMicroCny });
  t.after(() => guard.close());
  const seen: { role: string; maxOutputTokens: number; rules: string[] }[] = [], buildVersions: string[] = [];
  let paidFixtures = 0, corrections = 0;
  const result = await generatePilot({ repository, root, prefix, controller: f.controller, guard, toolchain, childAllocationCapMicroCny: 19_000_000,
    confirmedAt: admission.startedAt, experiment: admission,
    sessionFactory: async config => {
      const packet = JSON.parse(config.context); seen.push({ role: packet.role, maxOutputTokens: config.maxOutputTokens, rules: packet.rules });
      let prompts = 0;
      return { async prompt(text) {
        prompts++; const requestId = randomUUID(), inputTokens = packet.role === 'cosmos' && exhaustIncrementalBudget ? 1_050_000 : 1;
        await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: inputTokens, maxOutputTokens: 1, hasImages: false, estimatedMaxCostMicroCny: inputTokens * 2 + 8 });
        paidFixtures++;
        try {
          if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: [
            { taskId: `${prefix}-design`, role: 'design', objective: 'Simulated task planner phrase in an author objective', acceptanceIds: ['PILOT-DESIGN'], dependsOn: [] },
            { taskId: `${prefix}-art`, role: 'art', objective: 'Simulated media fixture only', acceptanceIds: ['PILOT-MEDIA'], dependsOn: [`${prefix}-design`] },
            { taskId: `${prefix}-coding`, role: 'coding', objective: 'Simulated compile failure only', acceptanceIds: f.frozen.acceptanceIds, dependsOn: [`${prefix}-design`, `${prefix}-art`] },
          ] }) };
          if (packet.role === 'reviewer') {
            if (prompts === 2) { assert.match(text, /only protocol correction/); corrections++; }
            return { text: JSON.stringify({ verdict: 'approved', inputVersions: packet.inputs,
              evidenceIds: packet.evidence.filter((e: any) => e.kind === 'test_report').map((e: any) => e.evidenceId),
              findings: packet.taskId.endsWith('-design') && prompts === 1 ? ['Simulated positive finding requiring protocol correction.'] : [] }) };
          }
          const write = config.tools.find(tool => tool.name === 'write')!;
          const put = (path: string, content: string) => write.execute(randomUUID(), { path, content }, undefined, undefined, undefined as never);
          if (packet.role === 'design') await put('authors/design/design.json', JSON.stringify({ summary: 'Simulated test fixture', implementationNotes: ['No target game implemented'],
            acceptanceMapping: Object.fromEntries(f.frozen.acceptanceIds.map((id: string) => [id, 'Simulated mapping'])) }));
          else if (packet.role === 'art') await put('authors/art/mediaSpec.json', JSON.stringify(simulatedMedia));
          else {
            await put('authors/coding/src/main.ts', 'export const simulated: number = "broken";\n');
            await put('authors/coding/index.html', '<!doctype html><p>Simulated host fixture only</p>');
          }
          return { text: JSON.stringify({ summary: 'Simulated assigned output', remaining: [], uncertainty: [] }) };
        } finally {
          await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', stopReason: 'stop', elapsedMs: 0,
            usage: { input: inputTokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: inputTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        }
      }, async close() {} };
    },
    host: {
      async buildProject(_root, project) {
        buildVersions.push(project.includes('/v2/') || project.includes('\\v2\\') ? 'v2' : 'v1');
        return { passed: false, work: project, results: [{ code: 2, stdout: "src/main.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.", stderr: '' }] };
      },
      async runAcceptance() { throw new Error('No browser may start in this simulated failed-build test'); },
    },
  });
  assert.equal(result.outcome, 'failed'); assert.equal(corrections, 1);
  assert.equal(seen.find(item => item.role === 'cosmos')!.maxOutputTokens, 4096);
  assert.ok(seen.filter(item => item.role !== 'cosmos').every(item => item.maxOutputTokens === 16384));
  assert.match(seen.find(item => item.role === 'design')!.rules.join('\n'), /45-minute/);
  const decision = await jsonFile(root, 'repair-decision.json');
  assert.equal(decision.automaticDispatch, !exhaustIncrementalBudget);
  assert.equal(decision.trialStop, exhaustIncrementalBudget ? 'trial_budget' : null);
  assert.deepEqual(buildVersions, exhaustIncrementalBudget ? ['v1'] : ['v1', 'v2']);
  const snapshot = await f.controller.read(), journal = await jsonFile(root, 'pilot-budget.json');
  assert.equal(journal.requestIds.length, paidFixtures); assert.equal(journal.deadlineAt, admission.deadlineAt);
  assert.equal(journal.committedCapMicroCny, admission.committedCapMicroCny);
  assert.deepEqual(snapshot.ledger.entries.slice(0, admission.baselineLedger.entries.length), admission.baselineLedger.entries);
  assert.deepEqual(snapshot.ledger.allocations.slice(0, admission.baselineLedger.allocations.length), admission.baselineLedger.allocations);
  assert.equal(snapshot.tasks.filter(task => task.taskId === `${prefix}-repair`).length, exhaustIncrementalBudget ? 0 : 1);
  assert.equal(snapshot.run.originalDeadlineAt, admission.sharedDeadlineAt); assert.deepEqual(snapshot.run.humanDecisions, []);
});
