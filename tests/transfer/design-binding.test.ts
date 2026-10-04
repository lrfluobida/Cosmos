import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { validatePlan } from '../../src/acceptance/plan.ts';

// Only synthetic unit data; never a template or runtime generation input.
const requirementRef = { artifactId: 'requirements', version: 'r1', location: 'registry/captures/requirements/r1/files' };
const ids = ['T16-01', 'T16-02', 'T16-03', 'T16-04', 'T16-05', 'T16-06'];
const restore = ['up', 'right', 'up', 'right', 'down'];
const synthetic = () => ({
  formatVersion: 'cos16-design/1', requirement: requirementRef, mapVersion: 'map-v1',
  map: { tiles: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    player: [1, 4], boxes: [[3, 3], [4, 3]], targets: [[3, 5], [4, 5]] },
  solution: [...restore, 'down', 'up', 'up', 'right', 'down', 'down'],
  paths: { wall: ['up', 'left'], push: [...restore], boxWall: [...restore, 'down', 'down'],
    doubleBox: ['up', 'right', 'right'], restart: [...restore], restore: [...restore] },
});
async function api() {
  const modules = await Promise.all(['design', 'oracle', 'binding'].map(name =>
    import('../../probes/transfer/' + name + '.ts').catch(error => {
      if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
      throw error;
    })));
  const value = Object.assign({}, ...modules);
  assert.equal(typeof value.validateTransferDesign, 'function', 'COS36 oracle API missing');
  assert.equal(typeof value.freezeTransferDesign, 'function', 'COS36 binding API missing');
  return value;
}
const provenance = { kind: 'original-procedural' as const, generator: 'Synthetic unit fixture', sourceRefs: ['unit-test'] };
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-transfer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry' });
  await mkdir(join(root, 'requirement'));
  await mkdir(join(root, 'author'));
  const requirement = { contractVersion: '1.0.0', specVersion: 'spec-v1', confirmedBy: 'user-fixture',
    confirmedAt: '2026-10-04T00:00:00.000Z', sources: [{ artifactId: 'brief', version: 'r1', location: 'requirements/brief.json' }],
    acceptance: ids.map(acceptanceId => ({ acceptanceId, description: '固定鼠标验收', steps: ['正常点击'],
      expected: '固定规则', evidenceKinds: ['test_report', 'screenshot', 'video', 'log'] })) };
  await writeFile(join(root, 'requirement/requirement.json'), JSON.stringify(requirement), 'utf8');
  await registry.registerCapture({ taskId: 'host-requirement', artifactRef: requirementRef, sourceRoot: 'requirement',
    files: [{ source: 'requirement.json', destination: '_cosmos/requirement.json' }],
    ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, metadata: { kind: 'data', provenance }, dependencies: [] });
  await writeFile(join(root, 'author/design.json'), JSON.stringify(synthetic()), 'utf8');
  const freeze = { root, registry, requirement: requirementRef, requirementFile: '_cosmos/requirement.json',
    designSource: 'author/design.json', artifact: registry.artifactRef('transfer-design', 'd1'),
    taskId: 'design-task', provenance };
  const currentRequirement = { artifact: requirementRef, specVersion: 'spec-v1' };
  return { root, registry, freeze, currentRequirement };
}
async function candidate(f: Awaited<ReturnType<typeof fixture>>, frozen: any, prepared: any, version = 'c1') {
  const ref = f.registry.candidateRef('game', version);
  await f.registry.stageCandidate({ taskId: 'integration', authorId: 'code', contextId: 'code-context',
    candidateRef: ref, targetRoot: ref.location, inputs: [requirementRef, frozen.artifact, prepared.artifact],
    expectedDeps: [requirementRef, frozen.artifact, prepared.artifact], ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] } });
  return ref;
}
function binding(f: Awaited<ReturnType<typeof fixture>>, frozen: any, artifact: any) {
  return { root: f.root, registry: f.registry, frozen, currentRequirement: f.currentRequirement,
    candidate: artifact, planArtifact: f.registry.artifactRef('transfer-plan', 'p1'),
    url: 'http://127.0.0.1:4173', runId: 'unit-run', reportId: 'unit-plan' };
}

test('valid design yields immutable legal, blocked, single-target and dual-target oracle traces', async () => {
  const a = await api(), source = synthetic(), before = structuredClone(source);
  const result = a.validateTransferDesign(source, requirementRef);
  assert.deepEqual(source, before);
  assert.deepEqual(result.initial.player, [1, 4]);
  assert.equal(result.initial.steps, 0);
  assert.equal(result.initial.won, false);
  assert.equal(result.scenes.wall[0].outcome, 'walk');
  for (const name of ['wall', 'boxWall', 'doubleBox']) {
    const trace = result.scenes[name], blocked = trace.at(-1);
    assert.equal(blocked.outcome, name === 'wall' ? 'wall' : name === 'boxWall' ? 'box-wall' : 'double-box');
    assert.deepEqual(blocked.after, blocked.before);
  }
  const pushed = result.scenes.push.at(-1);
  assert.equal(pushed.outcome, 'push'); assert.deepEqual(pushed.after.player, [3, 3]);
  assert.deepEqual(pushed.after.boxes, [[3, 4], [4, 3]]); assert.equal(pushed.after.steps, 5);
  const one = result.solution.find((step: any) => step.after.targets.filter((item: any) => item.occupied).length === 1);
  assert.equal(one.after.won, false);
  assert.equal(result.solution.at(-1).after.won, true);
  assert.deepEqual(result.restore, result.scenes.restore.at(-1).after);
  assert.equal(result.continuation.length, 6);
  const json = JSON.parse(a.snapshotJSON(result.restore));
  assert.deepEqual(Object.keys(json), ['mapVersion', 'player', 'boxes', 'targets', 'steps', 'won']);
  assert.deepEqual(json.targets, [{ position: [3, 5], occupied: false }, { position: [4, 5], occupied: false }]);
});

test('schema rejects ragged/open/oversized maps, counts, overlaps, coordinates, directions and unknown fields', async () => {
  const a = await api();
  const mutations = [
    (d: any) => d.map.tiles[1] = '#....#',
    (d: any) => d.map.tiles[0] = '.######',
    (d: any) => d.map.tiles.push('#######', '#######'),
    (d: any) => d.map.tiles = d.map.tiles.map((row: string) => row + '##'),
    (d: any) => d.map.boxes.pop(),
    (d: any) => d.map.targets.push([2, 2]),
    (d: any) => d.map.player = [0, 0],
    (d: any) => d.map.player = [1.5, 4],
    (d: any) => d.map.player = [7, 4],
    (d: any) => d.map.player = [3, 3],
    (d: any) => d.map.boxes[1] = [3, 3],
    (d: any) => d.map.targets[1] = [3, 5],
    (d: any) => d.solution[0] = 'teleport',
    (d: any) => d.mapVersion = 'latest',
    (d: any) => d.expected = { won: true },
    (d: any) => d.paths.extra = [],
    (d: any) => d.requirement.version = 'r2',
  ];
  for (const mutate of mutations) {
    const value = structuredClone(synthetic()); mutate(value);
    assert.throws(() => a.validateTransferDesign(value, requirementRef));
  }
});

test('oracle rejects missing coverage, blocked access, wrong probes, restore prerequisites and overlong solutions', async () => {
  const a = await api();
  const mutations = [
    (d: any) => delete d.paths.boxWall,
    (d: any) => d.paths.wall = ['left'],
    (d: any) => d.paths.push = ['up'],
    (d: any) => d.paths.doubleBox = ['up', 'left', 'right'],
    (d: any) => d.paths.restart = ['up'],
    (d: any) => d.paths.restore = ['up'],
    (d: any) => d.solution = ['down', ...d.solution],
    (d: any) => d.solution = Array(41).fill('up'),
    (d: any) => d.solution.pop(),
    (d: any) => d.paths.restore = [...d.solution],
    (d: any) => d.map.targets = [[3, 3], [4, 3]],
    (d: any) => d.paths.push = [...d.solution, 'up'],
  ];
  for (const mutate of mutations) {
    const value = structuredClone(synthetic()); mutate(value);
    assert.throws(() => a.validateTransferDesign(value, requirementRef));
  }
});

test('freeze validates strict UTF-8 and captured requirements before registering immutable host data', async t => {
  const a = await api(), f = await fixture(t);
  const frozen = await a.freezeTransferDesign(f.freeze);
  assert.match(frozen.designSha256, /^[a-f0-9]{64}$/);
  assert.match(frozen.requirementSha256, /^[a-f0-9]{64}$/);
  assert.equal(frozen.mapVersion, 'map-v1'); assert.deepEqual(frozen.acceptanceIds, ids);
  const capture = await f.registry.getCapture(frozen.artifact);
  assert.deepEqual(capture.dependencies, [requirementRef]);
  await writeFile(join(f.root, 'author/design.json'), '作者后续修改', 'utf8');
  assert.deepEqual(JSON.parse(await readFile(join(f.root, frozen.artifact.location, '_cosmos/transfer-design.json'), 'utf8')), synthetic());
  await assert.rejects(a.freezeTransferDesign(f.freeze), /JSON|immutable|exists/);
  await writeFile(join(f.root, 'author/design.json'), Buffer.from([0xff, 0xfe, 0x41]));
  await assert.rejects(a.freezeTransferDesign({ ...f.freeze, artifact: f.registry.artifactRef('transfer-design', 'd2') }), /UTF|encoded|encoding/i);
  await assert.rejects(f.registry.getCapture(f.registry.artifactRef('transfer-design', 'd2')), /ENOENT/);
  await writeFile(join(f.root, 'author/design.json'), JSON.stringify({ ...synthetic(), expected: {} }), 'utf8');
  await assert.rejects(a.freezeTransferDesign({ ...f.freeze, artifact: f.registry.artifactRef('transfer-design', 'd3') }));
  await assert.rejects(f.registry.getCapture(f.registry.artifactRef('transfer-design', 'd3')), /ENOENT/);
});

test('binding keeps six ACs, normal buttons, saved expectations and an explicit unavailable process checkpoint', async t => {
  const a = await api(), f = await fixture(t), frozen = await a.freezeTransferDesign(f.freeze);
  assert.equal(typeof a.prepareTransferAcceptance, 'function', 'pre-coding plan preparation API missing');
  const planned = f.registry.candidateRef('game', 'c1');
  const prepared = await a.prepareTransferAcceptance(binding(f, frozen, planned));
  const repairInput = { ...binding(f, frozen, f.registry.candidateRef('game', 'c2')),
    planArtifact: f.registry.artifactRef('transfer-plan', 'p2'), reportId: 'unit-repair' };
  const repair = await a.prepareTransferAcceptance(repairInput);
  assert.deepEqual(repair.segments.map((segment: any) => segment.plan.steps), prepared.segments.map((segment: any) => segment.plan.steps));
  await assert.rejects(f.registry.getCandidate(planned), /ENOENT/);
  const ref = await candidate(f, frozen, prepared);
  const result = await a.bindTransferAcceptance({ ...binding(f, frozen, ref), prepared });
  assert.deepEqual(result, prepared);
  const repairedCandidate = await candidate(f, frozen, repair, 'c2');
  assert.deepEqual(await a.bindTransferAcceptance({ ...repairInput, candidate: repairedCandidate, prepared: repair }), repair);
  await assert.rejects(a.bindTransferAcceptance({ ...binding(f, frozen, repairedCandidate), prepared }), /binding/i);
  await assert.rejects(a.prepareTransferAcceptance(binding(f, frozen, planned)), /immutable|exists/i);
  assert.deepEqual(result.acceptanceIds, ids);
  assert.equal(result.phase, 'preparation-only'); assert.equal(result.executable, false);
  assert.deepEqual(result.binding.candidate, ref); assert.deepEqual(result.binding.design, frozen);
  assert.deepEqual(result.artifact, f.registry.artifactRef('transfer-plan', 'p1'));
  const planCapture = await f.registry.getCapture(result.artifact);
  assert.deepEqual(planCapture.dependencies, [requirementRef, frozen.artifact]);
  const planBytes = await readFile(join(f.root, result.artifact.location, '_cosmos/transfer-plan.json'));
  assert.equal(result.planSha256, (await import('node:crypto')).createHash('sha256').update(planBytes).digest('hex'));
  const stored = JSON.parse(planBytes.toString('utf8'));
  const { planSha256, ...planData } = result;
  assert.deepEqual(stored, planData);
  assert.deepEqual([...new Set(result.segments.flatMap((segment: any) => segment.plan.acceptanceIds))], ids);
  for (const segment of result.segments) {
    assert.deepEqual(validatePlan(segment.plan), []);
    assert.deepEqual(segment.plan.artifact, ref);
    assert.equal(segment.plan.specVersion, 'spec-v1');
    assert.ok(segment.plan.steps.length <= 200);
    assert.ok(segment.plan.steps.every((step: any) => ['locator-click', 'assert', 'wait-for'].includes(step.kind)));
    assert.ok(segment.plan.steps.filter((step: any) => step.kind === 'locator-click')
      .every((step: any) => /^\[data-testid="(start|up|down|left|right|restart|continue)"\]$/.test(step.selector)));
  }
  const restoreSegment = result.segments.find((segment: any) => segment.id === 'restore');
  const victorySegment = result.segments.find((segment: any) => segment.id === 'victory');
  assert.equal(restoreSegment.executable, false); assert.equal(victorySegment.executable, false);
  assert.equal(result.checkpoint.kind, 'close-process-reopen');
  assert.equal(result.checkpoint.executable, false);
  assert.equal(result.checkpoint.sameProfile, true); assert.equal(result.checkpoint.sameOrigin, true);
  assert.equal(result.checkpoint.origin, 'http://127.0.0.1:4173');
  assert.equal(result.checkpoint.expected, a.snapshotJSON(a.validateTransferDesign(synthetic(), requirementRef).restore));
  assert.ok(restoreSegment.plan.steps.some((step: any) => step.observation?.path?.at(-1) === 'saveSnapshot'));
  assert.equal(victorySegment.plan.steps.find((step: any) => step.kind === 'locator-click').selector, '[data-testid="continue"]');
  assert.ok(victorySegment.plan.steps.some((step: any) => step.observation?.kind === 'text' && step.expected === '胜利'));
  const firstSingle = victorySegment.plan.steps.findIndex((step: any) => step.observation?.path?.at(-1) === 'snapshot'
    && JSON.parse(step.expected).targets.filter((target: any) => target.occupied).length === 1);
  const firstSingleBoard = victorySegment.plan.steps.slice(firstSingle).findIndex((step: any) =>
    step.observation?.kind === 'visible' && step.observation.selector === '[data-testid="board"]');
  assert.ok(firstSingleBoard > 0 && firstSingleBoard < 4);
  assert.ok(victorySegment.plan.steps.slice(firstSingle).some((step: any) =>
    step.observation?.kind === 'text' && step.expected === '进行中'));
  assert.ok(result.segments[0].plan.steps.some((step: any) => step.observation?.kind === 'visible' && step.observation.selector === '[data-testid="board"]'));
});

test('binding rejects stale requirement/design/map/hash, missing candidate input and altered captured or staged bytes', async t => {
  const a = await api(), f = await fixture(t), frozen = await a.freezeTransferDesign(f.freeze);
  assert.equal(typeof a.prepareTransferAcceptance, 'function', 'pre-coding plan preparation API missing');
  const prepared = await a.prepareTransferAcceptance(binding(f, frozen, f.registry.candidateRef('game', 'c1')));
  const ref = await candidate(f, frozen, prepared), valid = { ...binding(f, frozen, ref), prepared };
  const invalid = [
    { ...valid, currentRequirement: { artifact: { ...requirementRef, version: 'r2' }, specVersion: 'spec-v1' } },
    { ...valid, currentRequirement: { artifact: requirementRef, specVersion: 'spec-v2' } },
    { ...valid, frozen: { ...frozen, mapVersion: 'other-map' } },
    { ...valid, frozen: { ...frozen, designSha256: '0'.repeat(64) } },
    { ...valid, frozen: { ...frozen, artifact: f.registry.artifactRef('transfer-design', 'd2') } },
    { ...valid, prepared: { ...prepared, planSha256: '0'.repeat(64) } },
    { ...valid, prepared: { ...prepared, checkpoint: { ...prepared.checkpoint, executable: true } } },
    { ...valid, runId: 'another-run' },
  ];
  for (const value of invalid) await assert.rejects(a.bindTransferAcceptance(value));
  const missing = f.registry.candidateRef('game', 'missing');
  await f.registry.stageCandidate({ taskId: 'integration', authorId: 'code', contextId: 'code-context',
    candidateRef: missing, targetRoot: missing.location, inputs: [requirementRef], expectedDeps: [requirementRef],
    ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] } });
  await assert.rejects(a.bindTransferAcceptance({ ...valid, candidate: missing }), /input|binding/i);
  const requirementFile = join(f.root, requirementRef.location, '_cosmos/requirement.json');
  const requirementBytes = await readFile(requirementFile);
  await writeFile(requirementFile, requirementBytes.toString('utf8').replace('固定规则', '改变规则'), 'utf8');
  await assert.rejects(a.bindTransferAcceptance(valid), /requirement hash/i);
  await writeFile(requirementFile, requirementBytes);
  const stagedFile = join(f.root, ref.location, '_cosmos/transfer-design.json');
  const original = await readFile(stagedFile);
  await writeFile(stagedFile, '{}', 'utf8');
  await assert.rejects(a.bindTransferAcceptance(valid), /candidate|changed/i);
  await writeFile(stagedFile, original);
  await writeFile(join(f.root, frozen.artifact.location, '_cosmos/transfer-design.json'), '{}', 'utf8');
  await assert.rejects(a.bindTransferAcceptance(valid), /hash|changed/i);
});

test('explicit operator requirement retains real validation identity and exact host stages without human fields', async t => {
  const a = await api(), f = await fixture(t);
  const { createValidationRequirement } = await import('../../src/roles/execution-input.ts');
  const { HOST_STAGE_ACCEPTANCE } = await import('../../src/roles/requirements.ts');
  const original = JSON.parse(await readFile(join(f.root, requirementRef.location, '_cosmos/requirement.json'), 'utf8'));
  const requirement = createValidationRequirement({ specVersion: original.specVersion, sources: original.sources,
    acceptance: [...original.acceptance, ...HOST_STAGE_ACCEPTANCE], validation: { runId: 'unit-run', ledgerId: 'unit-ledger', caseId: 'unit-case', windowId: 'unit-window',
      reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: 'b'.repeat(64), decision: { kind: 'operator_validation', decisionId: 'unit-decision',
        actorId: 'unit-operator', decidedAt: '2026-10-04T00:00:00.000Z', source: original.sources[0], sourceRefs: original.sources } } });
  await writeFile(join(f.root, requirementRef.location, '_cosmos/requirement.json'), JSON.stringify(requirement), 'utf8');
  await assert.rejects(a.freezeTransferDesign(f.freeze), /confirmed|requirement|profile/i);
  const frozen = await a.freezeTransferDesign({ ...f.freeze, requirementProfile: 'operator_validation', preserveHostStages: true });
  assert.equal(frozen.requirementProfile, 'operator_validation'); assert.equal(frozen.preserveHostStages, true);
  assert.deepEqual(frozen.acceptanceIds, ids); assert.ok(!('confirmedBy' in requirement));
  const prep = await a.prepareTransferAcceptance(binding(f, frozen, f.registry.candidateRef('game', 'c1')));
  assert.deepEqual(prep.acceptanceIds, ids); assert.equal(prep.binding.design.requirementProfile, 'operator_validation');
  const bad = structuredClone(requirement); bad.acceptance[6].expected = '改变阶段';
  await writeFile(join(f.root, requirementRef.location, '_cosmos/requirement.json'), JSON.stringify(bad), 'utf8');
  await assert.rejects(a.prepareTransferAcceptance(binding(f, frozen, f.registry.candidateRef('game', 'c2'))));
  const human = { ...original, acceptance: [...original.acceptance, ...HOST_STAGE_ACCEPTANCE] };
  await writeFile(join(f.root, requirementRef.location, '_cosmos/requirement.json'), JSON.stringify(human), 'utf8');
  const humanFrozen = await a.freezeTransferDesign({ ...f.freeze, artifact: f.registry.artifactRef('human-transfer', 'v1'), requirementProfile: 'human', preserveHostStages: true });
  assert.equal(humanFrozen.requirementProfile, 'human'); assert.equal(human.confirmedBy, original.confirmedBy); assert.equal(human.confirmedAt, original.confirmedAt);
  const humanPlan = await a.prepareTransferAcceptance({ ...binding(f, humanFrozen, f.registry.candidateRef('human-game', 'c1')), planArtifact: f.registry.artifactRef('human-plan', 'p1') });
  assert.deepEqual(humanPlan.acceptanceIds, ids);
});
