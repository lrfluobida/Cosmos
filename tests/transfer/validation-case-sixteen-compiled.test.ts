import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filteredChildEnvironment } from '../../probes/e2e/admission.ts';
import { transferSourceSandbox, exerciseTransferSourceClosure } from './validation-case-sixteen.fixture.ts';

const platform = fileURLToPath(new URL('../../', import.meta.url)), execute = promisify(execFile);
let compiled: ReturnType<typeof transferSourceSandbox> | undefined;

test('compiled C16 executes the actual JS build worker and preserves a real compiler failure', async t => {
  const { root, worker } = await (compiled ??= transferSourceSandbox(t, true)), work = join(root, 'SOURCE-worker');
  t.diagnostic(`SOURCE/TEMP actual JS worker ${worker}; no browser or provider`);
  const project = join(work, 'project'), toolchain = join(work, 'toolchain'), response = join(work, 'result.json'), request = join(work, 'job.json');
  await mkdir(project, { recursive: true }); await mkdir(join(toolchain, 'node_modules'), { recursive: true });
  await cp(await realpath(join(platform, 'node_modules/typescript')), join(toolchain, 'node_modules/typescript'), { recursive: true });
  await writeFile(join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, types: [] }, files: ['index.ts'] }), 'utf8');
  await writeFile(join(project, 'index.ts'), 'const value: number = "SOURCE expected compiler failure";\n', 'utf8');
  await writeFile(request, JSON.stringify({ formatVersion: 'validation-worker-1', operation: 'build', root: work,
    repository: root, project, name: 'compiled-failure', response }), 'utf8');
  const result = await execute(process.execPath, [worker, request], { cwd: work, windowsHide: true, env: filteredChildEnvironment(process.env), timeout: 30_000 });
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  const receipt = JSON.parse(await readFile(response, 'utf8'));
  assert.equal(receipt.formatVersion, 'validation-worker-result-1'); assert.equal(receipt.operation, 'build'); assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.result.passed, false); assert.equal(receipt.result.results.length, 1);
  assert.equal(receipt.result.results[0].code, 2); assert.match(receipt.result.results[0].stdout, /error TS2322/);
  assert.equal(resolve(receipt.result.work), join(work, 'builds/compiled-failure'));
});

test('compiled C16 binds authentic SOURCE admission, selects its JS worker and rejects shared transitive drift before dispatch', async t => {
  await exerciseTransferSourceClosure(t, 'sixteen', await (compiled ??= transferSourceSandbox(t, true)));
});
