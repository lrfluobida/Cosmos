import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import test from 'node:test';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { runProductSession } from '../../src/cli/session.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { runContinuationSession } from '../../src/cli/continuation-session.ts';

test('production new default completes ordinary prepare interview confirmation design and consumer chain', async t => {
  const f = await ordinaryHostFixture(t, { productionDefault: true });
  assert.equal(f.host.ordinaryProfile, 'ordinary-design/1');
  const result: any = await f.execute(); assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.match(f.output(), /由运行时设计形成具体操作与自动验收计划/); assert.match(f.output(), /状态清楚/);
  const draft = JSON.parse(await readFile(join(f.root, 'requirements/v1/draft.json'), 'utf8'));
  assert.equal(draft.scenario, undefined); assert.equal(draft.ordinaryProfile, 'ordinary-design/1');
  assert.deepEqual(result.ordinaryExecution.scenario, f.scenario);
});
test('production new profile readiness still blocks interview before any model or clock', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos112-readiness-')), repository = await mkdtemp(join(tmpdir(), 'cos112-source-'));
  await mkdir(join(repository, 'docs/specs'), { recursive: true }); await writeFile(join(repository, 'docs/specs/github-issues.json'), '{"tasks":[]}', 'utf8');
  let requests = 0;
  const host = createProductHost(repository, { sessionFactory: async () => { requests++; throw new Error('Readiness must prevent model access.'); } });
  assert.equal(host.ordinaryProfile, 'ordinary-design/1');
  const result: any = await runProductSession({ command: 'new', root, brief: '鼠标点击目标', host, input: Readable.from([]), output: new Writable({ write(_chunk, _encoding, done) { done(); } }) });
  assert.equal(result.outcome, 'waiting_prerequisites'); assert.equal(requests, 0);
  const snapshot = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.formatVersion, 'intake-1'); assert.equal(snapshot.ordinaryProfile, 'ordinary-design/1');
  assert.equal(snapshot.run.originalStartedAt, undefined); t.diagnostic(`SOURCE readiness only; ${root}`);
});
test('ordinary explicit continuation keeps original approved design and uses its isolated coding workspace', async t => {
  const f = await ordinaryHostFixture(t, { pause: true, productionDefault: true }); await f.execute();
  const controller = await RunController.open({ root: f.root });
  await controller.stop('Synthetic SOURCE continuation fixture.'); await controller.close();
  const original: any = await readRunSnapshot(f.root), input = new PassThrough(), output = new PassThrough(); let text = '', answered = false;
  output.on('data', chunk => { text += chunk; const quote = text.match(/confirm (cq1-[a-f0-9]{64})/); if (quote && !answered) { answered = true; input.end(`confirm ${quote[1]}\n`); } });
  const result: any = await runContinuationSession({ root: f.root, host: f.host, input, output, additionalMicroCny: 1000000, additionalDurationMs: 600000 });
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps)); assert.ok(result.windowId);
  assert.equal(result.ordinaryExecution.design.version, 'v1'); assert.deepEqual(result.ordinaryExecution.scenario, f.scenario);
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, 1); assert.equal(f.packets.filter(packet => packet.role === 'art').length, 1);
  const after: any = await readRunSnapshot(f.root);
  assert.equal(after.run.originalStartedAt, original.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, original.run.originalDeadlineAt);
  assert.deepEqual(after.stopReason, original.stopReason); assert.deepEqual(after.ledger.entries, original.ledger.entries);
});
