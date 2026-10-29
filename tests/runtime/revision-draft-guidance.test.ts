import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createPiSession } from '../../src/providers/pi.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { ORDINARY_PLAN_AUTHORING_RULE } from '../../src/runtime/entrypoint-plan-authoring.ts';
import type { RoleInput } from '../../src/roles/factory.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

const path = 'authors/design/acceptance-plan.json';
const handoff = JSON.stringify({ summary: 'Synthetic local identifier edit only; no real review finding resolved.', remaining: [], uncertainty: [] });

test('verified revision guidance reaches native payloads while a same-suffix initial author retains its original scope', async t => {
  const originalId = 'design-task-revision', payloads: any[] = [], descriptions: string[] = [];
  let active: Awaited<ReturnType<typeof createBrowserHost>>, roleInput: RoleInput, source: Buffer, revisionWorkspace = '';
  let failure: unknown;
  const f = await ordinaryHostFixture(t, { persistent: true, revisionPolicy: true, limits: { limitMicroCny: 5000000, durationMs: 1800000 },
    configure: draft => { draft.brief += ' The brief says seeded revision; this is not a host selection.'; },
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!), writer = config.tools!.find(tool => tool.name === 'write-game-plan');
      if (packet.role === 'cosmos') return { close: fallback.close, prompt: async (...args) => {
        const response = await fallback.prompt(...args);
        return { text: response.text.replaceAll('design-task', originalId) };
      } };
      if (packet.role === 'reviewer') {
        assert.equal(writer, undefined);
        return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({ verdict: 'changes_requested', findings: ['Clarify the original completion requirement.'],
          inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId) }) }) };
      }
      if (packet.role !== 'design') { assert.equal(writer, undefined); return fallback; }
      assert.ok(writer);
      if (packet.taskId === originalId) return { close: fallback.close, prompt: async (...args) => {
        try {
          descriptions.push(writer.description);
          assert.match(writer.description, /[Ss]ave replaces the entire scenario/);
          assert.doesNotMatch(writer.description, /seeded|unapproved drafts/);
          return await fallback.prompt(...args);
        } catch (error) { failure = error; throw error; }
      } };
      try {
        assert.equal(packet.taskId, originalId + '-revision');
        assert.equal(writer.executionMode, 'sequential');
        descriptions.push(writer.description); revisionWorkspace = config.workspace;
        assert.match(writer.description, /seeded from the previous capture.*unapproved drafts/);
        assert.match(writer.description, /current drafts and actual review findings/);
        assert.match(writer.description, /preserve unaffected coverage and reopen structure/);
        assert.match(writer.description, /do not save an empty plan just to start revision/);
        assert.match(writer.description, /full replacement remains allowed/);
        assert.match(writer.description, /Raw read\/write\/edit remain available/);
        assert.match(writer.description, /null.*offset\/limit.*schema requires/);
        assert.match(writer.description, /numeric pages.*exact source anchors/);
        const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
        const revision = JSON.parse(await readFile(join(f.root, 'ordinary-design-revision-plan.json'), 'utf8'));
        const original = execution.tasks.find((item: any) => item.role === 'design').task;
        assert.deepEqual(packet.rules, revision.task.task.context.rules);
        assert.deepEqual(revision.task.task.context.rules.slice(0, original.context.rules.length), original.context.rules);
        assert.deepEqual(revision.task.task.context.tools, original.context.tools);
        assert.ok(packet.rules.includes(ORDINARY_PLAN_AUTHORING_RULE));
        source = await readFile(join(f.root, 'registry/captures/design/v1/files/_cosmos/acceptance-plan.json'));
        assert.deepEqual(await readFile(join(config.workspace, path)), source);
        assert.deepEqual(await readFile(join(config.workspace, 'authors/design/design.json')), await readFile(join(f.root, 'registry/captures/design/v1/files/_cosmos/design.json')));
        const originalInput = roleInput, wrong = structuredClone(originalInput.task); wrong.taskId = 'unbound-revision';
        await assert.rejects(active.roleFactory({ ...originalInput, task: wrong }), /outside the fixed ordinary design selection/);
        await assert.rejects(active.roleFactory({ ...originalInput, workspace: join(f.root, 'authors') }), /workspace|ownership/i);
        const otherRole = await active.roleFactory({ ...originalInput, role: 'art' }); await otherRole.close();
        return createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos150-synthetic' } });
      } catch (error) { failure = error; throw error; }
    } });
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    active = await createBrowserHost({ ...hostInput, ...f.hostOptions, ordinaryDesignRevisionPolicy: 'independent-review/1' });
    const create = active.roleFactory;
    active.roleFactory = async input => { if (input.role === 'design') roleInput = input; return create(input); };
    return active;
  } });
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    try {
      const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text()); payloads.push(body);
      const writer = body.tools.find((tool: any) => tool.function.name === 'write-game-plan')?.function;
      assert.ok(writer); assert.equal(writer.description, descriptions[1]);
      assert.equal(writer.parameters.additionalProperties, false);
      assert.deepEqual(Object.keys(writer.parameters.properties).sort(), ['checkpoint', 'operation', 'scenario', 'stage', 'steps']);
      const actions = [
        { name: 'read', arguments: { path, offset: null, limit: null } },
        { name: 'read', arguments: { path, offset: 1, limit: 100 } },
        { name: 'edit', arguments: { path, edits: [{ oldText: `"viewport":${JSON.stringify(f.scenario.viewport)},"steps":[{"id":"click"`,
          newText: `"viewport":${JSON.stringify(f.scenario.viewport)},"steps":[{"id":"synthetic-revision-click"` }] } },
      ];
      const action = actions[payloads.length - 1];
      const delta = action ? { tool_calls: [{ index: 0, id: `synthetic-${payloads.length}`, type: 'function', function: { name: action.name, arguments: JSON.stringify(action.arguments) } }] } : { content: handoff };
      const chunk = { id: 'offline-cos150', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: action ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    } catch (error) { failure = error; throw error; }
  });
  const result: any = await f.execute(); if (failure) throw failure;
  assert.equal(payloads.length, 4); assert.equal(descriptions.length, 2);
  assert.ok(Buffer.byteLength(descriptions[1]) - Buffer.byteLength(descriptions[0]) <= 850);
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.acceptedCandidate, undefined);
  assert.equal(f.plays.length, 0); assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 2, JSON.stringify(result.gaps));
  const expected = JSON.parse(source!.toString('utf8')); expected.scenario.steps[0].id = 'synthetic-revision-click';
  assert.deepEqual(JSON.parse(await readFile(join(revisionWorkspace, path), 'utf8')), expected);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'registry/captures/design/v2/files/_cosmos/acceptance-plan.json'), 'utf8')), expected);
  assert.deepEqual(await readFile(join(f.root, 'registry/captures/design/v1/files/_cosmos/acceptance-plan.json')), source!);
});
