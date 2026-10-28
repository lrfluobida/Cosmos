import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleInput } from '../../src/roles/factory.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';

async function planningOnly(t: test.TestContext, modular: boolean, check: (input: {
  root: string; host: Awaited<ReturnType<typeof createBrowserHost>>; roleInput: RoleInput;
  configs: PiSessionOptions[]; planned: Awaited<ReturnType<typeof planTaskDag>>;
}) => Promise<void>) {
  const configs: PiSessionOptions[] = [];
  const f = await ordinaryHostFixture(t, { modular, sessionFactory: async (config, session) => { configs.push(config); return session; } });
  f.host.prepare = async () => {
    await mkdir(join(f.root, 'toolchain'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(f.root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}' : '{}', 'utf8');
    return { environmentReady: true, executionReady: true };
  };
  let checked = false, failure: unknown;
  f.host.execute = async input => {
    const controller = await RunController.open({ root: input.root });
    try {
      const host = await createBrowserHost({ ...input, controller, work: new OwnedWork(controller.signal), ...f.hostOptions });
      let roleInput: RoleInput | undefined;
      const before = await controller.read();
      const planned = await planTaskDag({ controller, requirement: input.requirement, planningTaskId: 'planning', workspace: input.root,
        sessionRoot: join(input.root, 'sessions'), availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies,
        roleFactory: async supplied => { roleInput = supplied; return host.roleFactory(supplied); } });
      host.validateTasks!(planned.tasks);
      assert.deepEqual(await controller.read(), before);
      await check({ root: input.root, host, roleInput: roleInput!, configs, planned }); checked = true;
    } catch (error) { failure = error; }
    finally { await controller.close(); }
    return { outcome: 'incomplete', gaps: ['Planning-only source fixture; no generation or provider request.'] };
  };
  await f.execute();
  if (failure) throw failure;
  assert.equal(checked, true); assert.deepEqual(f.plays, []);
}

for (const modular of [false, true]) test(`ordinary ${modular ? 'five' : 'three'} slot planning indexes only display and retains full contracts`, async t => {
  await planningOnly(t, modular, async ({ roleInput, configs, planned }) => {
    const original = structuredClone({ task: roleInput.task, requirement: roleInput.requirement });
    const config = configs[0], packet = JSON.parse(config.context);
    assert.deepEqual(packet.acceptance, roleInput.requirement.acceptance.map(({ acceptanceId }) => ({ acceptanceId })));
    assert.match(config.systemPrompt!, /Planning acceptance is an exact ID index/);
    assert.match(config.systemPrompt!, /continue any partial read until complete/);
    assert.match(config.systemPrompt!, /descriptions, steps, expected outcomes, evidence kinds, brief, questions, answers and experience criteria/);
    for (const source of roleInput.requirement.sources) {
      assert.ok(packet.inputs.some((ref: unknown) => JSON.stringify(ref) === JSON.stringify(source)));
      assert.ok(packet.inputFiles.some((ref: any) => ref.artifactId === source.artifactId && ref.version === source.version && ref.location === source.location && ref.kind === 'file'));
    }
    assert.equal(config.maxOutputTokens, 8192); assert.equal(config.maxRequests, 16); assert.equal(config.jsonOutput, true);
    assert.deepEqual(packet.tools, ['read']); assert.equal(planned.tasks.length, modular ? 5 : 3);
    let legacy: PiSessionOptions | undefined;
    const session = await createRoleFactory({ maxOutputTokens: 8192, maxRequests: 16, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: 1000,
      sessionFactory: async supplied => { legacy = supplied; return { prompt: async () => ({ text: '{}' }), close: async () => {} }; } })(roleInput);
    await session.close();
    const legacyPacket = JSON.parse(legacy!.context);
    assert.deepEqual(legacyPacket.acceptance, roleInput.requirement.acceptance);
    assert.deepEqual({ ...packet, acceptance: [] }, { ...legacyPacket, acceptance: [] }, 'Every other display field stays unchanged.');
    for (const { task } of planned.tasks) assert.deepEqual(task.acceptance.map(({ evidenceDestinations, ...item }) => item),
      roleInput.requirement.acceptance.filter(item => task.acceptanceIds.includes(item.acceptanceId)).map(({ acceptanceId, steps, expected }) => ({ acceptanceId, steps, expected })));
    assert.deepEqual({ task: roleInput.task, requirement: roleInput.requirement }, original);
  });
});

test('ordinary planning refuses mismatched requirements and unavailable exact sources before creating a session', async t => {
  await planningOnly(t, false, async ({ root, host, roleInput, configs }) => {
    const before = configs.length;
    const reject = async (input: RoleInput) => { await assert.rejects(host.roleFactory(input)); assert.equal(configs.length, before); };
    const changed = structuredClone(roleInput.requirement); changed.acceptance[0].description += ' changed';
    await reject({ ...roleInput, requirement: changed });
    const extra = structuredClone(roleInput.requirement); extra.acceptance.push({ ...extra.acceptance[0], acceptanceId: 'unique-extra' });
    await reject({ ...roleInput, requirement: extra });
    const task = structuredClone(roleInput.task); task.inputs = task.inputs.filter(ref => ref.artifactId !== roleInput.requirement.sources[0].artifactId);
    await reject({ ...roleInput, task });
    const wrongVersion = structuredClone(roleInput.task); wrongVersion.inputs.find(ref => ref.artifactId === roleInput.requirement.sources[0].artifactId)!.version += '-other';
    await reject({ ...roleInput, task: wrongVersion });
    const noRead = structuredClone(roleInput.task); noRead.context.tools = [];
    await reject({ ...roleInput, task: noRead });
    await reject({ ...roleInput, workspace: join(root, 'toolchain') });
    const missingSource = structuredClone(roleInput.requirement); missingSource.sources.pop();
    await reject({ ...roleInput, requirement: missingSource });
    for (const source of roleInput.requirement.sources) {
      const path = join(root, source.location), bytes = await readFile(path);
      await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')]));
      try { await reject(roleInput); } finally { await writeFile(path, bytes); }
      await rename(path, `${path}.held`);
      try { await reject(roleInput); } finally { await rename(`${path}.held`, path); }
    }
  });
});

test('default planning and selected nonplanning roles keep complete acceptance display', async t => {
  await planningOnly(t, false, async ({ roleInput }) => {
    const configs: PiSessionOptions[] = [];
    for (const selected of [false, true]) {
      const factory = createRoleFactory({ maxOutputTokens: 8192, maxRequests: 16, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: 1000,
        ...(selected ? { ordinaryPlanningAcceptanceIndex: async () => { throw new Error('Nonplanning roles must not invoke the planning verifier.'); } } : {}),
        sessionFactory: async config => { configs.push(config); return { prompt: async () => ({ text: '{}' }), close: async () => {} }; } });
      for (const role of ['cosmos', 'design', 'reviewer'] as const) {
        const session = await factory({ ...roleInput, role, purpose: role === 'cosmos' && !selected ? 'planning' : undefined }); await session.close();
        assert.deepEqual(JSON.parse(configs.at(-1)!.context).acceptance, roleInput.requirement.acceptance);
        assert.doesNotMatch(configs.at(-1)!.systemPrompt!, /Planning acceptance is an exact ID index/);
      }
    }
  });
});
