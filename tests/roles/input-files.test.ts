import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { artifact, requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-input-files-')), workspace = join(root, 'workspace');
  await mkdir(workspace);
  const inputs = [artifact('template', 'v1', 'registry/template/v1'), artifact('design', 'v2', 'registry/design/v2'),
    artifact('plan-a', 'v1', 'registry/plan-a/v1'), artifact('plan-b', 'v1', 'registry/plan-b/v1'), artifact('需求', 'v1', 'requirements/需求.json')];
  const api = artifact('接口', 'v1', 'interfaces/接口.json'), output = artifact('code', 'v3', 'registry/code/v3'), report = artifact('report', 'v3', 'evidence/检查.json');
  const files: Record<string, string> = {
    'registry/template/v1/package.json': '{"name":"通用模板"}', 'registry/template/v1/package-lock.json': '{}',
    'registry/template/v1/tsconfig.json': '{}', 'registry/template/v1/vite.config.ts': 'export default {}',
    'registry/design/v2/嵌套/设计.json': '{"summary":"当前设计版本二"}', 'registry/design/v2/A.json': '{}',
    'registry/plan-a/v1/_cosmos/transfer-plan.json': '{"role":"art"}', 'registry/plan-b/v1/_cosmos/transfer-plan.json': '{"role":"coding"}',
    'requirements/需求.json': '固定中文需求', 'interfaces/接口.json': '只读中文接口',
    'registry/code/v3/src/main.ts': '// 当前作者输出', 'evidence/检查.json': '主机检查证据',
    'registry/design/v1/旧设计.json': '旧版本不应出现在清单', 'unrelated/other-role.json': '其他角色',
    'registry/private.json': '父目录不应出现在清单',
  };
  for (const [path, content] of Object.entries(files)) { await mkdir(dirname(join(workspace, path)), { recursive: true }); await writeFile(join(workspace, path), content, 'utf8'); }
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    scope: 'validation', specVersion: 'spec-v1', limitMicroCny: 100_000_000, allocations: [{ taskId: 'COS-example', amountMicroCny: 50_000_000 }] });
  const task = taskFixture() as TaskContract, requirement = requirementFixture() as RequirementContract;
  Object.assign(task, { inputs, dependsOn: [], state: 'not_started', attempts: [], artifacts: [output] });
  task.context.interfaces = [api, inputs[1]]; task.context.tools = ['read', 'write', 'edit'];
  task.ownership = { writePaths: ['game'], readOnlyPaths: ['registry', 'requirements', 'unrelated'] };
  task.budget.originalDeadlineAt = (await controller.read()).run.originalDeadlineAt;
  task.evidence[0].source = report; task.evidence[0].artifactVersions = [...inputs, output];
  requirement.sources = [inputs[4]];
  const configs: PiSessionOptions[] = [];
  const factory = createRoleFactory({ maxOutputTokens: 100, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => { configs.push(config); return { prompt: async () => { throw new Error('No model request in file catalog test'); }, close: async () => {} }; } });
  const create = async (role: 'coding' | 'reviewer' = 'coding') => {
    const created = await factory({ role, task, requirement, workspace, stateDirectory: join(root, 'sessions'), controller });
    await created.close(); return configs.at(-1)!;
  };
  t.after(async () => { await controller.close(); assert.equal(dirname(root), tmpdir()); await rm(root, { recursive: true, force: true }); });
  return { root, workspace, task, requirement, inputs, api, output, report, files, controller, configs, create };
}

async function read(config: PiSessionOptions, path: string) {
  const tool = config.tools.find(tool => tool.name === 'read'); assert.ok(tool);
  const result = await (tool.execute as any)('catalog-read', { path }, undefined, undefined, undefined);
  return result.content.filter((item: any) => item.type === 'text').map((item: any) => item.text).join('\n');
}

for (const role of ['coding', 'reviewer'] as const) test(`COS54 ${role} packet lists only exact selected files and preserves scoped reads and fixed contracts`, async t => {
  const f = await fixture(t), beforeTask = structuredClone(f.task), before = await f.controller.read();
  const config = await f.create(role), packet = JSON.parse(config.context);
  const refs = [...f.inputs, f.api, ...(role === 'reviewer' ? [f.output, f.report] : [])];
  assert.ok(Array.isArray(packet.inputFiles), 'Missing frozen input file inventory');
  assert.deepEqual(packet.inputFiles.map(({ artifactId, version, location }: ArtifactReference) => ({ artifactId, version, location })), refs);
  for (const entry of packet.inputFiles) {
    const actual = Object.keys(f.files).filter(path => path === entry.location || path.startsWith(entry.location + '/'));
    assert.equal(entry.kind, actual.includes(entry.location) ? 'file' : 'directory');
    assert.deepEqual(entry.files, actual.map(path => path === entry.location ? '' : path.slice(entry.location.length + 1)).sort());
    for (const file of entry.files) await read(config, file ? entry.location + '/' + file : entry.location);
  }
  assert.deepEqual(packet.inputFiles[0].files, ['package-lock.json', 'package.json', 'tsconfig.json', 'vite.config.ts']);
  assert.match(await read(config, f.inputs[1].location + '/嵌套/设计.json'), /当前设计版本二/);
  assert.notEqual(packet.inputFiles[2].location, packet.inputFiles[3].location);
  assert.equal(config.context.includes('旧设计.json'), false); assert.equal(config.context.includes('other-role.json'), false);
  assert.equal(config.context.includes('private.json'), false);
  assert.deepEqual(packet.inputs, role === 'reviewer' ? [...f.inputs, f.output] : f.inputs);
  assert.deepEqual(packet.interfaces, beforeTask.context.interfaces);
  assert.deepEqual(packet.ownership.readPaths, role === 'reviewer'
    ? [...f.inputs, f.output, ...beforeTask.context.interfaces, f.report].map(ref => ref.location)
    : [...beforeTask.ownership.readOnlyPaths, ...beforeTask.ownership.writePaths, ...f.inputs.map(ref => ref.location), ...beforeTask.context.interfaces.map(ref => ref.location)]);
  assert.deepEqual(packet.ownership.writePaths, role === 'reviewer' ? [] : ['game']);
  assert.deepEqual(config.tools.map(tool => tool.name), role === 'reviewer' ? ['read'] : ['read', 'write', 'edit']);
  assert.match(config.systemPrompt, /inputFiles/); assert.match(config.systemPrompt, /file inventory is not verification evidence/i);
  if (role === 'reviewer') {
    assert.deepEqual(packet.evidence, beforeTask.evidence);
    await assert.rejects(read(config, 'registry/design/v1/旧设计.json'), /outside allowed/);
    await assert.rejects(read(config, 'unrelated/other-role.json'), /outside allowed/);
    await assert.rejects(read(config, 'registry/private.json'), /outside allowed/);
  }
  assert.deepEqual(f.task, beforeTask); assert.deepEqual(await f.controller.read(), before);
  for (const [path, content] of Object.entries(f.files)) assert.equal(await readFile(join(f.workspace, path), 'utf8'), content);
  f.task.inputs[1].version = 'mutated';
  assert.equal(JSON.parse(config.context).inputFiles[1].version, 'v2');
});

test('COS54 missing selected reference is explicit and supplies no guessed filenames', async t => {
  const f = await fixture(t), missing = artifact('missing', 'v1', 'registry/missing/v1'); f.task.inputs.push(missing);
  const packet = JSON.parse((await f.create()).context);
  assert.deepEqual(packet.inputFiles.find((entry: ArtifactReference) => entry.artifactId === missing.artifactId), { ...missing, kind: 'missing', files: [] });
  await assert.rejects(read(f.configs.at(-1)!, missing.location), /ENOENT/);
});

for (const unsafe of ['workspace-root', 'outside-workspace', 'linked-entry'] as const) test(`COS54 refuses ${unsafe} before creating a role session`, async t => {
  const f = await fixture(t);
  if (unsafe === 'linked-entry') await symlink(join(f.workspace, 'unrelated'), join(f.workspace, f.inputs[1].location, 'linked'), 'junction');
  else f.task.inputs.push(artifact('unsafe', 'v1', unsafe === 'workspace-root' ? '.' : '../outside'));
  if (unsafe === 'workspace-root') f.task.ownership.writePaths = [];
  await assert.rejects(f.create(), /fixed files|workspace|symbolic link|junction|overlap/i);
  assert.equal(f.configs.length, 0);
});

test('COS54 stopped run creates no role session or catalog tool access', async t => {
  const f = await fixture(t); await f.controller.stop('停止测试');
  await assert.rejects(f.create()); assert.equal(f.configs.length, 0);
});
