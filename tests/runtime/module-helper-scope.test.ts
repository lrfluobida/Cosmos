import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { modularFixture, scopedCounterSource } from './modular-host.test.ts';
import { CODING_TEMPLATE_FILES, codingSignature, projectInputs } from '../../src/runtime/coding-check-worker.ts';
import { removeOwned, snapshot } from '../../src/artifacts/paths.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';

test('COS73 current captured module inputs reject script helpers before compiler assembly', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos73-captured-')); t.after(() => removeOwned(tmpdir(), root));
  const put = async (name: string, text: string) => { await mkdir(join(root, name, '..'), { recursive: true }); await writeFile(join(root, name), text, 'utf8'); };
  await put('authors/coding/index.html', '<script type="module" src="/src/main.ts"></script>'); await put('authors/coding/src/main.ts', 'export {};');
  const fixed = { artifactId: 'design', version: 'v1', location: 'registry/captures/design/v1/files' };
  const contract = 'export interface ModuleA { advance(value:number):number; }\nexport interface ModuleB { label(value:number):string; }\n';
  await put(`${fixed.location}/_cosmos/module-contracts.d.ts`, contract); await mkdir(join(root, 'media/public/assets'), { recursive: true });
  const modules = await Promise.all((['a', 'b'] as const).map(async slot => {
    const ref = { artifactId: `module-${slot}`, version: 'v1', location: `registry/captures/module-${slot}/v1/files` };
    await put(`${ref.location}/src/modules/${slot}/index.ts`, slot === 'a' ? scopedCounterSource : 'export function label(value:number):string{return String(value);}');
    if (slot === 'b') await put(`${ref.location}/src/modules/b/global-types.ts`, 'interface Window { cosmosBoundaryType:string; }');
    return { slot, ref, directory: join(root, ref.location), signature: codingSignature(await snapshot(join(root, ref.location))) };
  }));
  const template = fileURLToPath(new URL('../../templates/2d', import.meta.url)), templateFiles = new Map(await Promise.all(CODING_TEMPLATE_FILES.map(async name => [name, await readFile(join(template, name))] as const)));
  const input = { taskId: 'current-integration', attemptId: 'current-attempt', workspace: root, toolchain: template, template, media: join(root, 'media'), deadlineAt: new Date(Date.now() + 60000).toISOString(), phase: 'typecheck' as const,
    sourceSignature: codingSignature(await snapshot(join(root, 'authors/coding'))), templateSignature: codingSignature(templateFiles), mediaSignature: codingSignature(new Map()),
    modular: { slot: 'integration' as const, contracts: { directory: join(root, fixed.location), ref: fixed, sha256: validationHash(contract) }, modules } };
  await assert.rejects(projectInputs(input), /src\/modules\/b\/global-types\.ts.*module scope/);
  assert.equal(codingSignature(await snapshot(modules[1].directory)), modules[1].signature, 'Reading rejects the unchanged captured bytes.');
});

/** Source pipeline evidence; provider/browser/review replies are synthetic. */
test('COS73 rejects an unimported global helper before module approval or integration dispatch', async t => {
  const f = await modularFixture(t, '', { helperScope: 'script' });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const module = state.tasks.find((task: any) => task.taskId === 'module-b-task');
  assert.notEqual(module.state, 'passed', 'The global helper must not receive a local module proof.');
  assert.notEqual(module.review.verdict, 'approved');
  assert.equal(f.packets.filter(packet => packet.taskId === 'module-b-task' && packet.role === 'reviewer').length, 0);
  assert.equal(f.packets.filter(packet => packet.taskId === 'integration-task' && packet.role === 'coding').length, 0);
  const advisory = JSON.parse(await readFile(join(f.root, 'evidence/cos73-author-check.json'), 'utf8'));
  assert.match(advisory.diagnostic, /src\/modules\/b\/global-types\.ts.*module scope/);
  assert.match(advisory.diagnostic, /import\/export|export \{\}/);
  assert.equal(f.result.acceptedCandidate, undefined);
  assert.equal((await readFile(join(f.root, 'registry/captures/module-a/v1/files/src/modules/a/index.ts'), 'utf8')), scopedCounterSource);
  assert.equal(state.ledger.limitMicroCny, 200000000); assert.deepEqual(state.ledger.entries, []);
});

test('COS73 localizing only the helper preserves A and passes actual local and final compilation', async t => {
  const f = await modularFixture(t, '', { helperScope: 'module' });
  assert.ok(f.result.acceptedCandidate, JSON.stringify({ root: f.root, gaps: f.result.gaps }));
  for (const slot of ['a', 'b']) {
    const report = JSON.parse(await readFile(join(f.root, `evidence/module-${slot}-task/module-compile.json`), 'utf8'));
    assert.equal(report.passed, true); assert.equal(report.results[0].code, 0); assert.equal(report.moduleCheck.passed, true);
  }
  const project = join(f.root, f.result.acceptedCandidate.targetRoot);
  assert.equal(await readFile(join(project, 'src/modules/a/index.ts'), 'utf8'), scopedCounterSource);
  assert.equal(await readFile(join(project, 'src/modules/b/global-types.ts'), 'utf8'), 'interface Window { cosmosBoundaryType: string; }\nexport {};\n');
  const build = JSON.parse(await readFile(join(f.root, 'evidence/integration-task/build.json'), 'utf8'));
  assert.deepEqual(build.results.map((result: any) => result.code), [0, 0]);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.filter((task: any) => task.state === 'passed').length, 5); assert.deepEqual(state.ledger.entries, []);
});
