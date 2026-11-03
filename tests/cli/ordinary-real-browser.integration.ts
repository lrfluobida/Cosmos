import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cp, mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lazyStream } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { runCli } from '../../dist/cli/index.js';
import { createProductHost } from '../../dist/runtime/entrypoint-host.js';
import { createPiSession } from '../../dist/providers/pi.js';
import { withHostStages } from '../../dist/roles/requirements.js';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { confirmedSource, silentOutput, snapshot } from '../runtime/confirmed-requirements.fixture.ts';
import { genericArt, genericDesign, genericPersistentDraft, genericPersistentHtml, savedText } from '../acceptance/generic-persistent.fixture.ts';

const { scenario, ...requirements } = genericPersistentDraft();
const draft = withHostStages({ ...requirements, ordinaryProfile: 'ordinary-design/1', experienceCriteria: [
  { criterionId: 'readable', description: '存档状态清楚', steps: ['购买保存后查看状态'], expected: '容易辨认' },
] });
const design = { ...genericDesign, experienceMapping: { readable: '状态清楚呈现' } };
const handoff = { summary: 'Controlled save and resume fixture.', remaining: [], uncertainty: [] };
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const say = (value: unknown) => [{ type: 'text', text: JSON.stringify(value) }];
const call = (id: string, name: string, args: object) => ({ type: 'toolCall', id, name, arguments: args });
const read = (id: string, path: string) => call(id, 'read', { path });
const write = (id: string, path: string, content: string) => call(id, 'write', { path, content });

/** Script only the model's responses. Each subsequent turn sees the actual SDK tool results. */
function response(packet: any, messages: any[]) {
  const results = messages.filter(message => message.role === 'toolResult');
  for (const item of results) assert.equal(item.isError, false, JSON.stringify(item.content).slice(0, 500));
  const result = (id: string) => JSON.parse(results.find(item => item.toolCallId === id).content[0].text);
  const has = (id: string) => results.some(item => item.toolCallId === id);
  const path = (artifactId: string) => packet.inputs.find((ref: any) => ref.artifactId === artifactId).location;
  if (packet.role === 'cosmos') return say({ tasks: [
    { taskId: 'design-task', policyId: 'game-design', role: 'design', objective: '设计存档操作', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
    { taskId: 'art-task', policyId: 'game-art', role: 'art', objective: '制作标记和音频', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design-task'] },
    { taskId: 'coding-task', policyId: 'game-code', role: 'coding', objective: '购买保存和恢复', acceptanceIds: ['save', 'resume'], dependsOn: ['design-task', 'art-task'] },
  ] });
  if (packet.role === 'design') {
    if (!has('design')) return [call('design', 'write-game-design', { operation: 'save', design })];
    if (!has('plan')) {
      const invalid = structuredClone(scenario);
      Object.assign(invalid.steps.find(step => step.id === 'purchased')!, { acceptanceId: 'typo' });
      return [call('plan', 'write-game-plan', { operation: 'save', scenario: invalid })];
    }
    if (!has('invalid')) return [call('invalid', 'validate-game-design', {})];
    assert.equal(result('invalid').passed, false); assert.match(JSON.stringify(result('invalid').errors), /scenario\.steps\[3\]: Unknown acceptanceId/);
    if (!has('repair')) return [call('repair', 'write-game-plan', { operation: 'repair-acceptance-ids', stage: 'main', corrections: [{ stepId: 'purchased', from: 'typo', to: 'save' }] })];
    if (!has('valid')) return [call('valid', 'validate-game-design', {})];
    assert.deepEqual(result('valid'), { passed: true, errors: [] });
  } else {
    if (!has('captured-plan')) return [read('captured-plan', path('design') + '/_cosmos/acceptance-plan.json'), read('captured-design', path('design') + '/_cosmos/design.json')];
    assert.deepEqual(result('captured-plan').scenario, scenario); assert.deepEqual(result('captured-design'), design);
    if (packet.role === 'reviewer') {
      assert.deepEqual(packet.ownership.writePaths, []);
      if (!has('evidence')) return [read('evidence', packet.evidence.find((item: any) => item.outcome === 'passed').source.location)];
      assert.equal(result('evidence').evidence.outcome, 'passed');
      return say({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId),
        ...(packet.designConcernReview ? { concernResolutions: [] } : {}) });
    }
    if (packet.role === 'art' && !has('art')) return [write('art', 'authors/art/media.json', JSON.stringify(genericArt))];
    if (packet.role === 'coding') {
      if (!has('manifest')) return [read('manifest', path('media') + '/public/assets/manifest.json')];
      if (!has('html')) return [write('html', 'authors/coding/index.html', genericPersistentHtml(result('manifest'))), write('entry', 'authors/coding/src/main.ts', '// UI implementation is in index.html.\n')];
    } else assert.equal(packet.role, 'art');
  }
  return say(handoff);
}

test('public ordinary requirements reuse repairs the authored plan and delivers a browser-verified save game', { timeout: 360_000 }, async t => {
  const parent = tmpdir(), sandbox = await mkdtemp(join(parent, 'cos169-'));
  if (!process.env.COSMOS_KEEP_EVIDENCE) t.after(() => removeOwned(parent, sandbox));
  const restore = (key: string, value: string) => {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  };
  const isolated = join(sandbox, 'temp'); await mkdir(isolated);
  restore('TMP', isolated); restore('TEMP', isolated); restore('TMPDIR', isolated);
  restore('DEEPSEEK_API_KEY', 'offline-transport-only');
  const repository = fileURLToPath(new URL('../../', import.meta.url)), installed = join(sandbox, 'repository');
  const template = join(repository, 'templates/2d'), target = join(installed, 'templates/2d');
  await mkdir(join(installed, 'docs/specs'), { recursive: true });
  await cp(join(repository, 'docs/specs/github-issues.json'), join(installed, 'docs/specs/github-issues.json'));
  await cp(template, target, { recursive: true, filter: file => !['dist', 'node_modules'].includes(relative(template, file).split(sep)[0]) });
  const modules = await realpath(join(process.env.COSMOS_TEMPLATE_ROOT ?? template, 'node_modules'));
  await cp(modules, join(target, 'node_modules'), { recursive: true, dereference: true });
  const source = await confirmedSource(t, { draft, intake: true });
  const root = join(sandbox, 'run'), roles: string[] = [], failures: unknown[] = [];
  let externalRequests = 0;
  const nativeFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname !== '127.0.0.1') { externalRequests++; throw new Error('External network disabled'); }
    return nativeFetch(input, { ...init, redirect: 'error' });
  });
  const role = new AsyncLocalStorage<object>(), create = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function (...args) {
    const packet: any = role.getStore(); assert.ok(packet);
    const runtime = await create.apply(this, args);
    runtime.streamSimple = (model, context, options) => lazyStream(model, async () => (async function* () {
      let content;
      try {
        roles.push(packet.role + ':' + packet.taskId);
        content = response(packet, context.messages);
      } catch (error) { failures.push(error); throw error; }
      const stopReason = content[0].type === 'toolCall' ? 'toolUse' : 'stop';
      await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: usage.input, completion_tokens: usage.output } }, model);
      yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', stopReason, timestamp: Date.now(), usage } };
    })());
    return runtime;
  });
  const host = createProductHost(installed, { sessionFactory: config => role.run(JSON.parse(config.context), () => createPiSession(config)) });
  const io = () => ({ host, input: Readable.from([]), output: silentOutput() });
  const result: any = await runCli(['new', root, '--requirements-from', source.root, '--requirements-revision', '2', '--max-minutes', '5'], io());
  if (failures.length) throw failures[0];
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  const json = async (file: string) => JSON.parse(await readFile(join(root, file), 'utf8'));
  const report = await json(result.report), state = await snapshot(root);
  assert.equal(report.automaticAcceptance, 'passed'); assert.equal(report.userExperience, 'not_confirmed');
  assert.deepEqual(report.ordinaryExecution.scenario, scenario);
  assert.equal((await json('execution.json')).ordinaryPlanAuthoringPolicy, 'structured-design-plan/3');
  assert.equal(state.requirementsSource.runId, source.state.run.runId); assert.deepEqual(state.run.humanDecisions, []);
  assert.ok(state.ledger.entries.length > 0);
  assert.ok(state.ledger.entries.every((entry: any) => entry.status === 'settled' && !entry.unknown && !entry.reservedMicroCny));
  assert.deepEqual(state.tasks.map((task: any) => task.state), ['passed', 'passed', 'passed']);
  for (const task of state.tasks) {
    assert.notEqual(task.authorId, task.review.reviewerId); assert.notEqual(task.context.contextId, task.review.contextId);
    assert.deepEqual(task.review.inputVersions, [...task.inputs, ...task.artifacts]);
  }
  const browser = await json('evidence/coding-task/browser.json'), delivery = await json('evidence/coding-task/delivery-check.json');
  const build = await json('evidence/coding-task/build.json'), media = await json('evidence/coding-task/media-usage.json');
  assert.equal(build.passed, true); assert.deepEqual(build.results.map((command: any) => command.code), [0, 0]);
  assert.equal(media.coverage.complete, true); assert.equal(media.coverage.valid, true);
  const candidate = report.acceptedCandidate.candidateRef;
  assert.deepEqual(delivery.candidate, candidate); assert.equal(result.delivery, candidate.location);
  assert.equal(delivery.outcome, 'passed'); assert.equal(delivery.helperExited, true); assert.notEqual(delivery.project, join(root, result.delivery));
  assert.equal(browser.outcome, 'passed'); assert.equal(browser.segments.length, 2);
  const [first, second] = browser.segments.map((segment: any) => segment.report);
  assert.equal(first.savedAtClose.actual, savedText); assert.equal(second.steps.find((step: any) => step.id === 'progress').actual, savedText);
  assert.notEqual(first.session.browserPid, second.session.browserPid); assert.equal(first.session.profile, second.session.profile);
  for (const segment of [first, second]) {
    assert.deepEqual(segment.plan.artifact, candidate); assert.equal(segment.plan.url, delivery.url); assert.equal(segment.browser.channel, 'msedge');
    assert.equal(segment.session.exitConfirmed, true); assert.equal(segment.cleanup.processExited, true);
  }
  assert.ok((await readFile(join(root, result.delivery, 'dist/index.html'), 'utf8')).includes('generic-save'));
  const before = await readFile(join(root, 'snapshot.json')), calls = roles.length;
  const resumed: any = await runCli(['resume', root], io());
  assert.deepEqual(await readFile(join(root, 'snapshot.json')), before); assert.equal(resumed.report, result.report);
  assert.equal(resumed.userExperience, 'not_confirmed'); assert.equal(roles.length, calls); assert.equal(externalRequests, 0);
  t.diagnostic(JSON.stringify({ root, report: result.report, delivery: result.delivery, scriptedSdkDispatches: calls, externalRequests,
    browserPids: [first.session.browserPid, second.session.browserPid], savedAtClose: first.savedAtClose.actual, userExperience: resumed.userExperience }));
});
