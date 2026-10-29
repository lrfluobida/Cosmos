import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ReadToolDetails } from '@earendil-works/pi-coding-agent';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import type { RoleInput } from '../../src/roles/factory.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

test('COS146 host selects its verified revision and reviewer, not an initial author with a revision suffix', async t => {
  const originalId = 'design-task-revision', selected: string[] = [];
  let active: Awaited<ReturnType<typeof createBrowserHost>>, currentInput: Omit<RoleInput, 'role' | 'task' | 'workspace' | 'stateDirectory'>;
  let source = '', capture = '';
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, limits: { limitMicroCny: 5000000, durationMs: 1800000 }, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!), read = config.tools!.find(tool => tool.name === 'read')!;
    const invoke = (path: string, extra = {}) => read.execute('host-json', { path, ...extra }, undefined, undefined, undefined as never);
    if (packet.role === 'cosmos') return { close: fallback.close, prompt: async (...args) => {
      const response = await fallback.prompt(...args);
      return { text: response.text.replaceAll('design-task', originalId) };
    } };
    if (packet.role === 'design' && packet.taskId === originalId) return { close: fallback.close, prompt: async (...args) => {
      assert.doesNotMatch(read.description, /compact display/);
      assert.doesNotMatch(read.description, /^For JSON (review|revision),/);
      const response = await fallback.prompt(...args), path = 'authors/design/acceptance-plan.json';
      source = ' \n'.repeat(30000) + JSON.stringify(JSON.parse(await readFile(join(config.workspace, path), 'utf8')), null, 2);
      await writeFile(join(config.workspace, path), source, 'utf8');
      assert.equal(((await invoke(path)).details as ReadToolDetails | undefined)?.truncation?.truncated, true);
      selected.push('initial-raw'); return response;
    } };
    if (packet.role === 'reviewer') return { close: fallback.close, prompt: async () => {
      assert.equal(packet.taskId, originalId); assert.match(read.description, /compact display/);
      assert.match(read.description, /^For JSON review,/);
      capture = packet.inputs.find((ref: any) => ref.artifactId === 'design').location + '/_cosmos/acceptance-plan.json';
      const result = await invoke(capture);
      assert.equal(result.details, undefined);
      assert.equal(result.content[0].type === 'text' && result.content[0].text, JSON.stringify(JSON.parse(source)));
      selected.push('reviewer-compact');
      return { text: JSON.stringify({ verdict: 'changes_requested', findings: ['Clarify the original completion requirement.'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }) };
    } };
    assert.equal(packet.role, 'design');
    return { close: fallback.close, prompt: async () => {
      assert.equal(packet.taskId, originalId + '-revision'); assert.match(read.description, /compact display/);
      assert.match(read.description, /^For JSON revision,/);
      const result = await invoke(capture);
      assert.equal(result.details, undefined);
      assert.equal(result.content[0].type === 'text' && result.content[0].text, JSON.stringify(JSON.parse(source)));
      const raw = await invoke(capture, { offset: 30001, limit: 100 });
      assert.equal(raw.content[0].type === 'text' && raw.content[0].text, source.split('\n').slice(30000).join('\n'));
      assert.equal(await readFile(join(config.workspace, capture), 'utf8'), source);
      assert.equal(await readFile(join(f.root, capture), 'utf8'), source);
      const state = await currentInput.controller.read(), task = structuredClone(state.tasks.find(item => item.taskId === packet.taskId)!);
      task.taskId = 'unbound-revision';
      await assert.rejects(active.roleFactory({ ...currentInput, role: 'design', task, workspace: config.workspace, stateDirectory: join(f.root, 'never-created') }), /outside the fixed ordinary design selection/);
      selected.push('revision-compact');
      throw new Error('Synthetic stop after selected read checks; no model generation claim.');
    } };
  } });
  f.host.execute = async input => executeGeneration({ ...input, createHost: async hostInput => {
    currentInput = { controller: hostInput.controller, requirement: hostInput.requirement };
    active = await createBrowserHost({ ...hostInput, ...f.hostOptions, ordinaryDesignRevisionPolicy: 'independent-review/1' });
    return active;
  } });
  const result: any = await f.execute();
  assert.equal(result.outcome, 'incomplete');
  assert.deepEqual(selected, ['initial-raw', 'reviewer-compact', 'revision-compact']);
  assert.equal(f.packets.some(packet => ['art', 'coding'].includes(packet.role)), false);
  assert.equal(await readFile(join(f.root, capture), 'utf8'), source);
});
