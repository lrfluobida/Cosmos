import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PILOT_LIMITS, requestReservation } from '../../probes/e2e/admission.ts';
import * as declaration from '../../probes/e2e/validation-declaration.ts';
import * as inputs from '../../probes/e2e/validation-input.ts';
const repository = fileURLToPath(new URL('../../', import.meta.url)), sha = 'a'.repeat(40);

async function fixture(t: test.TestContext) {
  assert.equal(typeof inputs.readValidationInput, 'function', 'The separate fixed evaluation input reader is required.');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-validation-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of [declaration.VALIDATION_CASE.inputs.requirements, ...declaration.VALIDATION_CASE.inputs.template.files]) {
    await mkdir(dirname(join(root, file.path)), { recursive: true }); await writeFile(join(root, file.path), await readFile(join(repository, file.path)));
  }
  return root;
}

test('one declaration owns fixed IDs, resource bounds and the opt-in author limits without changing legacy probes', () => {
  const value = declaration.VALIDATION_CASE; assert.ok(value, 'A distinct validation declaration is required.');
  assert.equal(value.caseId, 'cos20-native-validation-7'); assert.equal(value.formatVersion, 'validation-declaration-2');
  assert.equal(value.sourceModel, 'deepseek-flash');
  assert.deepEqual(value.limits, { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000, durationMs: 45 * 60 * 1000, maxRequests: 80, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 });
  assert.equal(Object.values(value.grants).reduce((sum: number, grant: any) => sum + grant.amountMicroCny, 0), 21_000_000);
  assert.ok(Object.values(value.grants).every((grant: any) => grant.taskId.startsWith(`${value.caseId}-`)));
  assert.equal(value.outputTokens.art, 65536); assert.equal(value.outputTokens.coding, 65536);
  assert.equal(value.outputTokens.design, 16384); assert.equal(value.outputTokens.reviewer, 16384); assert.equal(value.outputTokens.planning, 4096);
  assert.equal(requestReservation({ inputBytes: 10, hasImages: false, maxOutputTokens: value.outputTokens.art }), 524_308);
  assert.equal(PILOT_LIMITS.authorMaxOutputTokens, 16384); assert.equal(PILOT_LIMITS.durationMs, 90 * 60 * 1000);
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.grants.art)); assert.ok(Object.isFrozen(value.inputs.template.files));
});

test('strict new entry parsing preserves the exact reviewed SHA and operator source as an unactivated intent', () => {
  assert.equal(typeof declaration.parseValidationEntry, 'function');
  assert.deepEqual(declaration.parseValidationEntry(['--validation-preflight', sha]), { caseId: 'cos20-native-validation-7', reviewedPlatformSha: sha, preflightOnly: true, operatorSource: null, intentOnly: true });
  const source = 'Offline fixture only: standing validation authorization reference';
  assert.deepEqual(declaration.parseValidationEntry(['--validation-case', sha, source]), { caseId: 'cos20-native-validation-7', reviewedPlatformSha: sha, preflightOnly: false, operatorSource: source, intentOnly: true });
});

test('entry parsing rejects arbitrary case IDs, roots, clocks, resets and incomplete or extra arguments', () => {
  assert.equal(typeof declaration.parseValidationEntry, 'function');
  for (const args of [[], ['--experiment', sha, 'source'], ['--validation-case', sha], ['--validation-case', 'HEAD', 'source'],
    ['--validation-case', sha, ''], ['--validation-case', sha, 'a\nb'], ['--validation-case', sha, 'x'.repeat(2001)],
    ['--validation-case', sha, 'source', '--reset'], ['--validation-case', sha, 'source', '--root', 'elsewhere'],
    ['--validation-preflight', sha, 'source'], ['--validation-case', sha, 'source', '--case-id', 'old-trial'], ['--validation-case', sha, 'source', '--now', '1'],
    ['--validation-case', sha, 'source', '--author-protocol-corrections', '0'], ['--validation-case', sha, 'source', '--coding-handoff-clarifications', '0'],
    ['--validation-case', sha, 'source', '--host-evidenced-coding-handoff', '0'],
    ['--validation-case', sha, 'source', '--fixture']]) {
    assert.throws(() => declaration.parseValidationEntry(args), /usage|validation/i);
  }
});

test('frozen source verification returns evaluation input without a fabricated confirmation, window or file mutation', async t => {
  const root = await fixture(t), path = join(root, 'probes/e2e/requirements.json'), before = await readFile(path), modified = (await stat(path)).mtimeMs;
  const value = await inputs.readValidationInput(root);
  assert.equal(value.kind, 'validation-case-input'); assert.equal(value.caseId, 'cos20-native-validation-7');
  assert.equal(value.requirements.requirementVersion, 'cos10-pilot-v2'); assert.equal(value.requirements.acceptanceIds.length, 8); assert.equal(value.requirements.stageAcceptanceIds.length, 2);
  assert.equal(value.manifest.template.sha256, declaration.VALIDATION_CASE.inputs.template.sha256);
  for (const field of ['confirmed', 'confirmedBy', 'humanDecisions', 'startedAt', 'deadlineAt', 'windowId']) assert.equal(Object.hasOwn(value, field), false);
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, modified);
  assert.ok(Object.isFrozen(value.requirements.rules));
});

for (const changed of ['requirements', 'template', 'extra', 'missing', 'encoding'] as const) test(`fixed input rejects ${changed} drift before any driver execution`, async t => {
  const root = await fixture(t), path = join(root, changed === 'requirements' || changed === 'encoding' ? 'probes/e2e/requirements.json' : 'templates/2d/src/main.ts');
  if (changed === 'extra') await writeFile(join(root, 'templates/2d/src/extra.ts'), '// Not part of the reviewed generic input\n', 'utf8');
  else if (changed === 'missing') await rm(path);
  else await writeFile(path, changed === 'encoding' ? Buffer.from([0xff]) : Buffer.concat([await readFile(path), Buffer.from('\n')]));
  await assert.rejects(inputs.readValidationInput(root), /fixed|changed|UTF|encoding|encoded|ENOENT|template/i);
});
