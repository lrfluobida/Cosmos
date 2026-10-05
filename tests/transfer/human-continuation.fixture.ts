import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type test from 'node:test';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { createHumanTransferConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { humanFixture, fakeHumanSdk, humanPersistentReports } from './human-preparation.fixture.ts';

/** TEMP, synthetic stdin/SDK/build/browser transport; no actual game or human acceptance. */
export async function humanContinuationFixture(t: test.TestContext, options: { registeredRepair?: boolean } = {}) {
  const f = await humanFixture(t), calls: string[] = [], authorities: any[] = [];
  let continued = false, originalBuilds = 0;
  const io = {
    async build(project: string, taskId: string, authority: any) {
      authorities.push(authority);
      if (!continued && (!options.registeredRepair || ++originalBuilds > 1)) return { passed: false, diagnostics: 'Synthetic original toolchain unavailable' };
      await mkdir(join(project, 'dist'), { recursive: true });
      await writeFile(join(project, 'dist/index.html'), 'Synthetic current coding ' + taskId, 'utf8');
      return { passed: true, diagnostics: '' };
    },
    async play() { throw new Error('No generic browser fallback'); },
    async playPersistent(series: any, options: any, authority: any) {
      await options.verifyBinding(); authorities.push(authority);
      return humanPersistentReports(series, options, !continued);
    },
  };
  const sessionFactory = fakeHumanSdk(calls);
  const originalResult = await executeGeneration({ ...f, resume: false,
    createHost: input => createHumanTransferConsumerHost({ ...input, draft: input.draft as any, sessionFactory, io }) });
  assert.equal(originalResult.outcome, 'incomplete');
  assert.deepEqual(originalResult.taskHistory.map((task: any) => task.state), options.registeredRepair ? ['passed', 'passed', 'failed', 'failed'] : ['passed', 'passed', 'failed'], JSON.stringify(originalResult.gaps));
  const controller = await RunController.open({ root: f.root });
  await controller.stop('Synthetic original stopped for explicit coding continuation'); await controller.close();
  const original = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const paths = ['host-human-preparation-source.json', 'host-human-preparation-tasks.json', 'host-transfer-prepared-inputs.json', 'host-transfer-origin.json'];
  const preserved = await Promise.all(paths.map(async path => ({ path, bytes: await readFile(join(f.root, path)), mtime: (await stat(join(f.root, path))).mtimeMs })));
  const host = createProductHost('', { sessionFactory, io });
  host.prepare = async () => ({ environmentReady: true, executionReady: true });
  return { ...f, host, io, sessionFactory, calls, authorities, original, preserved,
    continue() { continued = true; },
    async requirePreserved() { for (const file of preserved) { assert.deepEqual(await readFile(join(f.root, file.path)), file.bytes); assert.equal((await stat(join(f.root, file.path))).mtimeMs, file.mtime); } },
  };
}
export function continuationStreams(answer?: (quoteId: string) => string | Promise<string>) {
  const input = new PassThrough(), output = new PassThrough(); let text = '', answered = false;
  output.on('data', async bytes => { text += bytes; const match = text.match(/confirm (cq1-[a-f0-9]{64})/);
    if (answer && match && !answered) { answered = true; input.end(await answer(match[1])); } });
  return { input, output, text: () => text };
}
