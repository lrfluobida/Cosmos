import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { TestContext } from 'node:test';
import { runPublicValidationCli } from '../../probes/public-cli/validation.ts';
import { runCli } from '../../src/cli/index.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import type { ApprovedArt } from '../../src/runtime/approved-art-source.ts';
import type { ApprovedDesign } from '../../src/runtime/approved-design-source.ts';
import { selectCodeDraftFeedback } from '../../src/runtime/code-draft-feedback.ts';
import { selectCodeDraft } from '../../src/runtime/code-draft-source.ts';
import type { ConfirmedRequirementsSource } from '../../src/runtime/confirmed-requirements-source.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { silentOutput } from '../runtime/confirmed-requirements.fixture.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';
import { fundingFixture } from '../runtime/public-validation-funding.fixture.ts';
import { failedCodeCapture } from './captured-code-draft.fixture.ts';

const io = () => ({ input: Readable.from([]), output: silentOutput() });
const page = 'authors/coding/index.html', helper = 'authors/coding/src/helper.ts', entry = 'authors/coding/src/main.ts';
const html = '<div id="status">等待</div><script type="module" src="/src/main.ts"></script>';
const partial = 'export const status = "等待";', revised = 'export const status = "完成";';

export async function exerciseCodeDraft(t: TestContext, options: Parameters<typeof ordinaryHostFixture>[1], common: string[],
  design: ApprovedDesign, art: ApprovedArt, requirements: ConfirmedRequirementsSource, nativeFetch: typeof fetch) {
  const previous = await ordinaryHostFixture(t, { ...options, sessionFactory: async (config, session) => {
    const original = JSON.parse(config.context!);
    assert.equal(original.role, 'coding');
    assert.equal(original.codeDraftFeedback, undefined);
    assert.equal(original.initialCodeDraftFiles, undefined);
    assert.equal(config.feedbackReadWritePaths, undefined);
    assert.ok(original.rules.some((rule: string) => rule.includes('Follow each planOffset continuation')));
    return { ...session, prompt: async () => {
      const write = config.tools!.find(tool => tool.name === 'write')!;
      for (const [path, content] of [[page, html], [helper, partial]]) await write.execute('partial', { path, content }, undefined, undefined, undefined as never);
      throw new Error('Interrupted before entry module');
    } };
  } });
  const first: any = await runCli(['new', previous.root, ...common, '--approved-design-from', design.reference.location,
    '--approved-art-from', art.reference.location], { ...io(), host: previous.host });
  assert.equal(first.outcome, 'incomplete');
  const oldSnapshot = await readFile(join(previous.root, 'snapshot.json'));
  const findings = [{ observed: 'The entry module does not update the page.', hint: 'Read the entry page and helper.' }];
  const initialFiles = [{ path: page, content: html }, { path: helper, content: partial }];
  let reviewerVerdict: object | undefined;
  const next = await ordinaryHostFixture(t, { ...options, fullToolchain: true, sessionFactory: async config => {
    const packet = JSON.parse(config.context!);
    if (packet.role !== 'coding') {
      assert.equal(packet.codeDraftFeedback, undefined);
      assert.equal(packet.initialCodeDraftFiles, undefined);
      assert.equal(config.feedbackReadWritePaths, undefined);
      assert.equal(packet.role, 'reviewer');
      reviewerVerdict = { verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: { evidenceId: string }) => item.evidenceId) };
      return createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-code-draft' } });
    }
    assert.deepEqual(packet.codeDraftFeedback, findings);
    assert.deepEqual(packet.initialCodeDraftFiles, initialFiles);
    assert.deepEqual(config.feedbackReadWritePaths, packet.ownership.writePaths);
    assert.ok(!packet.rules.some((rule: string) => rule.includes('Follow each planOffset continuation')));
    assert.doesNotMatch(config.tools!.find(tool => tool.name === 'read')!.description, /Follow each continuation once until complete/);
    assert.ok(packet.ownership.readPaths.includes('toolchain/node_modules/phaser/src'));
    assert.equal(config.maxRequests, 32);
    assert.match(packet.rules.join('\n'), /editable, unreviewed code draft/);
    return createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-code-draft' } });
  } });
  const { reference: legacy, files } = await selectCodeDraft(previous.root, design, art, requirements, next);
  assert.deepEqual([...files.keys()], [page, helper]);
  await assert.rejects(selectCodeDraft(previous.root, design, art, { ...requirements, revision: requirements.revision + 1 }, next), /same confirmed/);
  await assert.rejects(selectCodeDraft(previous.root, design, { ...art, reference: { ...art.reference, version: '0'.repeat(64) } }, requirements, next), /approved art/);
  await writeFile(join(previous.root, helper), revised);
  await assert.rejects(selectCodeDraft(previous.root, design, art, requirements, next, legacy), /Pinned code draft changed/);
  await writeFile(join(previous.root, helper), partial);
  const source = await failedCodeCapture(t, options, common, design, art, requirements, previous.root, next);
  const reference = source.reference;
  initialFiles.push(source.main);
  const funding = await (await fundingFixture(t)).authorization('coding-draft', 720000), decision = join(funding.sharedRoot, funding.authorization.location);
  const feedbackFile = join(funding.sharedRoot, 'feedback.json');
  const note = JSON.stringify({ formatVersion: 'ordinary-code-draft-feedback/1', codeDraft: reference, findings });
  await writeFile(feedbackFile, note);
  const feedback = (await selectCodeDraftFeedback(feedbackFile, reference, next.root)).reference;
  await writeFile(decision, JSON.stringify({ ...funding.payload, formatVersion: 'public-validation-authorization/2', brief: previous.draft.brief,
    runRoot: next.root, requirementsSource: requirements, renderFrames: false, sourceRefs: [...funding.payload.sourceRefs, design.reference, art.reference, reference, feedback] }));
  const command = ['new', next.root, '--shared-root', funding.sharedRoot, '--authorization', decision];
  const invoke = (args: string[]) => runPublicValidationCli(args, { ...io(), host: next.host }) as Promise<any>;
  const resume = () => invoke(['resume', next.root]);
  const shared = await readFile(join(funding.sharedRoot, 'snapshot.json'));
  for (const invalid of [
    JSON.stringify({ ...JSON.parse(note), codeDraft: { ...reference, version: '0'.repeat(64) } }),
    JSON.stringify({ ...JSON.parse(note), findings: Array(5).fill(findings[0]) }),
    JSON.stringify({ ...JSON.parse(note), approved: true }),
    JSON.stringify({ ...JSON.parse(note), findings: [{ observed: 'a'.repeat(513) }] }),
    note.padEnd(4097),
  ]) {
    await writeFile(feedbackFile, invalid);
    await assert.rejects(selectCodeDraftFeedback(feedbackFile, reference, next.root), /code draft feedback/i);
  }
  await writeFile(feedbackFile, note + ' ');
  await assert.rejects(invoke(command), /Pinned code draft feedback changed/);
  assert.deepEqual(await readFile(join(funding.sharedRoot, 'snapshot.json')), shared);
  await writeFile(feedbackFile, note);
  const sourceHelper = join(reference.location, 'registry/captures/game-source/v1/files/src/helper.ts');
  await writeFile(sourceHelper, revised);
  await assert.rejects(invoke(command), /differs from the signed candidate/);
  assert.deepEqual(await readFile(join(funding.sharedRoot, 'snapshot.json')), shared);
  await writeFile(sourceHelper, partial);

  let rounds = 0, reviews = 0;
  const audioPath = 'authors/coding/src/audioLoader.ts';
  const audioSource = 'import type Phaser from "phaser";\nexport function loader(game: Phaser.Game) { return game.load; }';
  function reply(body: any) {
    const results = body.messages.filter((message: { role: string }) => message.role === 'tool');
    const tool = (name: string, args: object, index = 0) => ({ index, id: 'draft-' + rounds + '-' + index,
      type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const calls = rounds === 0 ? [tool('edit', { path: helper, edits: [{ oldText: partial, newText: revised }] }),
        tool('write', { path: entry, content: "import {status} from './helper'; document.querySelector('#status')!.textContent=status;" }, 1),
        tool('write', { path: audioPath, content: audioSource }, 2)]
      : rounds === 1 ? [tool('read', { path: helper }), tool('read', { path: art.proof.media.location + '/public/assets/manifest.json' }, 1),
        tool('read', { path: 'toolchain/node_modules/phaser/src/sound/webaudio/WebAudioSound.js', offset: 8, limit: 12 }, 2)]
      : rounds < 28 ? [tool('read', { path: helper })]
      : rounds === 28 ? [tool('read', { path: audioPath })]
      : rounds === 29 ? [tool('edit', { path: audioPath, edits: [{ oldText: 'game: Phaser.Game) { return game.load', newText: 'scene: Phaser.Scene) { return scene.load' }] })] : [];
    if (reviewerVerdict) {
      assert.doesNotMatch(body.messages[0].content, /initialCodeDraftFiles|export const status/);
      assert.deepEqual(body.tools.map((tool: any) => tool.function.name), ['read']);
      reviews++;
    } else {
      assert.ok(body.messages[0].content.includes('"initialCodeDraftFiles":' + JSON.stringify(initialFiles)));
      assert.match(body.messages[0].content, /working files, which always take precedence/);
    }
    if (rounds === 2) {
      assert.ok(results.some((item: any) => item.content.includes(revised)));
      assert.ok(results.some((item: any) => item.content.includes('"characters"')) && results.some((item: any) => item.content.includes('@class WebAudioSound')));
    }
    if (rounds === 28) {
      assert.match(JSON.stringify(body.messages.at(-1)), /audioLoader\.ts.*TS2339.*Property 'load' does not exist on type 'Game'/);
    }
    if (rounds === 30 && !reviewerVerdict) {
      assert.equal(body.tools?.length ?? 0, 0);
      const feedback = body.messages.at(-1).content[0].text;
      assert.match(feedback, /"passed":true/);
      assert.match(feedback, /built in/);
    }
    if (!reviewerVerdict) rounds++;
    const delta = calls.length ? { tool_calls: calls } : { content: JSON.stringify(reviewerVerdict ?? { summary: 'Completed the entry and helper', remaining: [], uncertainty: [] }) };
    const chunk = { id: 'offline-code', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 50, total_tokens: 170 } };
    return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
  }
  let wireError: unknown;
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const events = reply(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(200, { 'content-type': 'text/event-stream' }).end(events);
    } catch (error) {
      wireError = error;
      response.writeHead(400).end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    return nativeFetch('http://127.0.0.1:' + address.port, { method: 'POST', body: await request.arrayBuffer(), signal: request.signal });
  });

  let phase = 'before-author';
  const execute = next.host.execute;
  next.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    const host = await createBrowserHost({ ...hostInput, ...next.hostOptions });
    if (phase === 'before-author') host.bindPreparedTasks = async () => { throw new Error('Interrupted after staging'); };
    else {
      const save = hostInput.controller.saveTask.bind(hostInput.controller);
      hostInput.controller.saveTask = async (...args) => {
        await save(...args);
        if (phase === 'after-capture' && args[0].artifacts.length) {
          phase = 'captured';
          throw new RecoveryBlocked('Interrupted after coding capture');
        }
      };
    }
    return host;
  } });
  assert.equal((await invoke(command)).outcome, 'incomplete');
  assert.equal(rounds, 0);
  assert.equal(await readFile(join(next.root, helper), 'utf8'), partial);
  await writeFile(join(next.root, helper), revised);
  await assert.rejects(resume(), /Staged code draft changed/);
  await writeFile(join(next.root, helper), partial);
  await writeFile(feedbackFile, note + ' ');
  await assert.rejects(resume(), /code draft feedback/i);
  assert.equal(rounds, 0);
  await writeFile(feedbackFile, note);
  phase = 'after-capture';
  const captured = await resume();
  if (wireError) throw wireError;
  assert.equal(phase, 'captured', JSON.stringify(captured.gaps));
  assert.equal(await readFile(join(next.root, helper), 'utf8'), revised);
  next.host.execute = execute;
  const report = await resume();
  if (wireError) throw wireError;
  assert.equal(report.outcome, 'awaiting_user_experience', JSON.stringify(report.gaps));
  await assert.rejects(selectCodeDraft(next.root, design, art, requirements, previous), /pending review/);
  assert.deepEqual(next.packets.map(p => p.role), ['coding', 'reviewer']);
  assert.equal(rounds, 31);
  assert.equal(reviews, 1);
  assert.equal(await readFile(join(next.root, helper), 'utf8'), revised);
  const capture = JSON.parse(await readFile(join(next.root, 'registry/captures/game-source/v1/capture.json'), 'utf8'));
  assert.ok(capture.metadata.provenance.sourceRefs.includes(reference.artifactId + '@' + reference.version));
  assert.deepEqual(await readFile(join(previous.root, 'snapshot.json')), oldSnapshot);
  assert.deepEqual(await readFile(join(reference.location, 'snapshot.json')), source.snapshot);
  assert.equal(await readFile(sourceHelper, 'utf8'), partial);
  const state = JSON.parse(await readFile(join(next.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.ledger.limitMicroCny, 720000);
  assert.deepEqual(state.ledger.allocations.map((row: any) => row.amountMicroCny), [0, 0, 648000]);
  assert.ok(state.ledger.entries.length === rounds + reviews && state.ledger.entries.every((row: any) => row.status === 'settled'));
  await invoke(['settle', next.root]);
}
