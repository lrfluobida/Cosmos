import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { filterBrowserEnvironment } from '../../src/acceptance/persistent.ts';
import { validatePlan, type Observation, type Step } from '../../src/acceptance/plan.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';

const pattern = { kind: 'pixel-pattern', x: 90, y: 50, width: 60, height: 60, color: '#1281ef', tolerance: 8,
  rows: ['-+-', '+++', '-+-'] } as const;
const layout: Observation = { kind: 'layout', selectors: ['#badge', '#label', '#control'] };
const check = (id: string, observation: Observation, expected: string | boolean | number = true): Step =>
  ({ id, kind: 'assert', acceptanceId: 'scene', observation, expected, timeoutMs: 3000 });
const plan = (url: string, reportId: string, steps: Step[]) => ({ formatVersion: '1.0.0', projectId: 'synthetic', taskId: 'input',
  reportId, runId: 'visual', specVersion: 'v1', artifact: { artifactId: 'sample', version: 'v1', location: 'sample' },
  url, viewport: { width: 320, height: 200 }, acceptanceIds: ['scene'], steps });

test('rejects malformed masks, out-of-viewport samples and ambiguous layout declarations before launch', () => {
  for (const observation of [{ ...pattern, x: 300 }, { ...pattern, tolerance: 97 }, { ...pattern, rows: ['++', '-'] },
    { ...pattern, rows: ['..'] }, { ...layout, selectors: ['#a', '#a'] }, { kind: 'external-requests', value: 0 }]) {
    assert.notEqual(validatePlan(plan('http://localhost/', 'invalid', [check('invalid', observation as Observation)])).length, 0);
  }
});

test('real Edge compares compositor pixels, CSS boxes and the host network record', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-visual-'));
  t.after(async () => { if (process.env.COSMOS_KEEP_EVIDENCE !== '1') await rm(root, { recursive: true, force: true }); });
  const received: string[] = [];
  const foreign = createServer((req, res) => { received.push(req.url!); res.end('response'); });
  foreign.on('upgrade', (req, socket) => { received.push(req.url!); socket.destroy(); });
  await new Promise<void>(done => foreign.listen(0, '127.0.0.1', done));
  t.after(async () => { foreign.closeAllConnections(); await new Promise<void>(done => foreign.close(() => done())); });
  const foreignAddress = foreign.address(); assert.ok(foreignAddress && typeof foreignAddress !== 'string');
  const foreignHost = `127.0.0.1:${foreignAddress.port}`;
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0}#badge,#item{position:absolute;left:90px;top:50px;width:60px;height:60px}#label{position:absolute;left:10px;top:10px}
    #control{position:absolute;left:200px;top:140px}#cover{position:absolute;left:90px;top:50px;width:30px;height:60px;pointer-events:none;background:white}
    </style><main id=stage><canvas id=item width=60 height=60></canvas><div id=badge></div><span id=label>名称</span><button id=control disabled>继续</button></main>
    <script>const g=item.getContext('2d');g.fillStyle='#1281ef';g.fillRect(20,0,20,60);g.fillRect(0,20,60,20);
    if(location.pathname==='/cover'){const el=document.createElement('div');el.id='cover';stage.append(el)}
    if(location.pathname==='/external'){fetch('http://${foreignHost}/blocked').catch(()=>{});new WebSocket('ws://${foreignHost}/socket')}
    if(location.pathname==='/redirect'){fetch('/next').catch(()=>{})}
    if(location.pathname==='/worker'){window.w=new Worker('/worker.js');w.onmessage=()=>label.textContent='worker ready'}
    // A candidate cannot change the host's screenshot decoder or native layout measurement.
    window.OffscreenCanvas=undefined;window.IntersectionObserver=undefined;</script>`;
  const server = createServer((req, res) => {
    if (req.url === '/next') { res.writeHead(302, { location: `http://${foreignHost}/redirect-target` }); res.end(); return; }
    if (req.url === '/worker.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end('postMessage("ready")'); return; }
    res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }); res.end(html);
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const options = { evidenceRoot: root, channel: 'msedge' as const, env: filterBrowserEnvironment(process.env), timeoutMs: 20000 };
  const sample: Observation = { ...pattern, rows: [...pattern.rows] };
  for (const covered of [false, true]) {
    const mode = covered ? 'cover' : 'clear';
    const steps = [check('shape', sample, !covered), check('color', { ...sample, color: '#ff1122' }, false),
      check('silhouette', { ...sample, rows: ['+++', '+++', '+++'] }, false), check('geometry', layout, !covered),
      check('overlap', { kind: 'layout', selectors: ['#badge', '#item'] }, false),
      check('relative', { kind: 'visible', selector: '#badge:right-of(#label):below(#label):above(#control):left-of(#control)' }),
      check('forbidden', { kind: 'visible', selector: '#stage :text-matches("倒计时|游戏失败")' }, false),
      check('positive-text-match', { kind: 'visible', selector: '#stage :text-matches("名称|其他")' }),
      check('local', { kind: 'external-requests' }, 0)];
    const report = await runAcceptance(plan(`http://127.0.0.1:${address.port}/${mode}`, mode, steps), options);
    assert.equal(report.outcome, 'passed', JSON.stringify({ errors: report.errors, steps: report.steps }));
    assert.ok(report.steps[0].screenshot);
    assert.equal((await readFile(join(root, report.steps[0].screenshot))).subarray(1, 4).toString(), 'PNG');
  }
  const report = await runAcceptance(plan(`http://127.0.0.1:${address.port}/external`, 'external', [
    { ...check('attempts', { kind: 'external-requests' }, 2), kind: 'wait-for' },
  ]), options);
  assert.equal(report.steps[0].actual, 2, JSON.stringify(report));
  assert.equal(report.outcome, 'failed');
  assert.match(report.errors.join(' '), /Blocked non-project request/);
  assert.match(report.errors.join(' '), /Blocked non-project WebSocket/);
  assert.deepEqual(received, []);
  const redirected = await runAcceptance(plan(`http://127.0.0.1:${address.port}/redirect`, 'redirect', [
    { ...check('redirect-attempt', { kind: 'external-requests' }, 1), kind: 'wait-for' },
  ]), options);
  assert.equal(redirected.outcome, 'failed');
  assert.equal(redirected.steps[0].actual, 1);
  assert.match(redirected.errors.join(' '), /Non-project redirect request/);
  const workerStep: Step = { ...check('ready', { kind: 'text', selector: '#label' }, 'worker ready'), kind: 'wait-for' };
  for (const checked of [false, true]) {
    const withWorker = await runAcceptance(plan(`http://127.0.0.1:${address.port}/worker`, `worker-${checked}`,
      checked ? [workerStep, check('coverage', { kind: 'external-requests' }, 0)] : [workerStep]), options);
    assert.equal(withWorker.outcome, checked ? 'failed' : 'passed', JSON.stringify(withWorker.errors));
    if (checked) {
      assert.match(withWorker.errors.join(' '), /External request evidence incomplete for Chromium worker/);
      assert.equal(withWorker.steps[1].actual, null);
    }
  }
});
