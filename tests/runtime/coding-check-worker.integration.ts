import assert from 'node:assert/strict';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { snapshot } from '../../src/artifacts/paths.ts';
import { codingAuthor } from './entrypoint-coding-check.test.ts';

const toolchain = process.env.COSMOS_CODING_CHECK_TOOLCHAIN;
const exited = (pid: number) => { try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; } };

for (const version of ['source', 'compiled'] as const) test(`COS55 ${version} real owned tsc/Vite failure then original author edit succeeds in two isolated projects`, async t => {
  assert.ok(toolchain, 'Set COSMOS_CODING_CHECK_TOOLCHAIN to a TEMP pinned generic template installation');
  const createHost = version === 'compiled' ? (await import('../../dist/runtime/entrypoint-host.js')).createValidationBrowserHost : undefined;
  const f = await codingAuthor(t, { templateRoot: toolchain, createHost });
  await cp(join(toolchain!, 'node_modules'), join(f.root, 'toolchain/node_modules'), { recursive: true });
  const before = await f.controller.read(), sources = await snapshot(f.roleInput.workspace);
  const author = join(f.roleInput.workspace, 'authors/coding');
  await writeFile(join(author, 'index.html'), '<html><body><p>合成编译检查</p><script type="module" src="/src/main.ts"></script></body></html>', 'utf8');
  await writeFile(join(author, 'src/main.ts'), 'const value: number = "编译错误"; export { value };\n', 'utf8');
  const first = await f.call(); assert.equal(first.passed, false); assert.match(first.diagnostics, /TS\d+/);
  await writeFile(join(author, 'src/main.ts'), 'const value: number = 1; export { value };\n', 'utf8');
  const second = await f.call(); assert.equal(second.passed, true); assert.equal(second.results.length, 2);
  assert.notEqual(first.work, second.work);
  for (const report of [first, second]) {
    assert.ok(report.workerPids.every((pid: number) => exited(pid))); assert.ok(report.results.every((result: any) => exited(result.pid)));
    const path = resolve(report.work), prefix = resolve(tmpdir()) + sep;
    assert.ok(path.startsWith(prefix)); assert.match(path, /coding-self-check/);
    t.after(async () => { assert.ok(path.startsWith(prefix)); await rm(path, { recursive: true, force: true }); });
    const template = f.task.inputs.find(ref => ref.artifactId.endsWith('generic-template'))!;
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) {
      assert.deepEqual(await readFile(join(path, name)), await readFile(join(f.root, template.location, name)));
    }
    const media = f.task.inputs.find(ref => ref.artifactId.endsWith('media'))!;
    assert.deepEqual(await snapshot(join(path, 'public/assets')), await snapshot(join(f.root, media.location, 'public/assets')));
  }
  const afterSources = await snapshot(f.roleInput.workspace);
  for (const [name, bytes] of sources) if (!name.startsWith('authors/coding/')) assert.deepEqual(afterSources.get(name), bytes);
  assert.deepEqual(await f.controller.read(), before);
  const owner = JSON.parse(await readFile(join(f.ledgerRoot, '.controller.lock'), 'utf8'));
  assert.ok(owner.children.length >= 2 && owner.children.every((child: any) => exited(child.pid)));
  assert.equal(f.configs.filter(config => JSON.parse(config.context).role === 'coding').length, 1);
  assert.equal(f.calls.filter(call => call.kind === 'coding' || call.kind === 'build' || call.kind === 'play').length, 0);
});
