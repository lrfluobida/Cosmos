import { createServer } from 'node:http';
import { runAcceptance } from '../../../src/acceptance/index.ts';

const mode = process.argv[3] ?? 'click';
const server = createServer((_, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('<button id="freeze" style="width:200px;height:100px" onclick="while(true){}">Freeze</button><p id="status">ready</p>'
    + '<script>Object.defineProperty(window,"cosmosDebug",{get(){while(true){}},configurable:false})</script>');
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No server port');
try {
  const report = await runAcceptance({
    formatVersion: '1.0.0', projectId: 'hang-fixture', taskId: 'COS-08', runId: `hang-${Date.now()}`, reportId: `frozen-${mode}`, specVersion: '1.0',
    artifact: { artifactId: 'fixture', version: 'hang-v1', location: 'tests/acceptance/fixtures/hang-worker.ts' },
    url: `http://127.0.0.1:${address.port}`, viewport: { width: 1280, height: 720 }, acceptanceIds: ['startup', 'input'], steps: [
      { id: 'ready', kind: 'assert', acceptanceId: 'startup', observation: { kind: 'text', selector: '#status' }, expected: 'ready', timeoutMs: 500 },
      mode === 'click' ? { id: 'freeze', kind: 'mouse-click', selector: '#freeze', x: 0.5, y: 0.5 }
        : { id: 'freeze', kind: 'assert', acceptanceId: 'input', observation: { kind: 'debug', path: ['value'] }, expected: 1, timeoutMs: 60_000 },
      { id: 'response', kind: 'wait-for', acceptanceId: 'input', observation: { kind: 'text', selector: '#status' }, expected: 'clicked', timeoutMs: 500 },
    ],
  }, { evidenceRoot: process.argv[2], timeoutMs: 3500 });
  console.log(JSON.stringify(report));
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
