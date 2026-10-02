import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validationRunFixture } from './validation-run.fixture.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { runValidationWithHost } from '../../probes/e2e/validation-run.ts';
import { createValidationScopeReader } from '../../probes/e2e/validation-driver.ts';
import { stageAcceptance } from '../../probes/e2e/policy.ts';
import { requireValidationScope } from '../../src/runtime/validation-scope.ts';

test('actual scope reader authenticates full acceptance, operator bytes and registered input provenance', async t => {
  const f = await validationRunFixture(t); let checked = false;
  const report = await runValidationWithHost({ repository: f.repository, args: f.args, host: {
    prepare: async () => {}, execute: async input => {
      const registry = await createArtifactRegistry({ workspaceRoot: input.root, registryRoot: 'registry' });
      const source = registry.artifactRef(`${input.window.caseId}-requirements`, VALIDATION_CASE.inputs.requirements.version), template = registry.artifactRef(`${input.window.caseId}-template`, 'v1');
      const binding = createValidationScopeReader({ repository: input.repository, ledgerRoot: input.ledgerRoot, root: input.root, window: input.window });
      await assert.rejects(binding.readScope(input.signal), /capture|ENOENT|missing/i);
      await mkdir(join(input.root, 'inputs'));
      for (const [from, to] of [[VALIDATION_CASE.inputs.requirements.path, 'requirements.json'], ['src/media/vector.ts', 'character-format.ts'], ['src/media/audio.ts', 'audio-format.ts']]) {
        await writeFile(join(input.root, 'inputs', to), await readFile(join(input.repository, from)));
      }
      await registry.registerCapture({ taskId: VALIDATION_CASE.grants.planning.taskId, artifactRef: source, sourceRoot: 'inputs',
        files: ['requirements.json', 'character-format.ts', 'audio-format.ts'].map(name => ({ source: name, destination: `_cosmos/${name}` })), ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [],
        metadata: { kind: 'data', provenance: { kind: 'original-procedural', generator: 'Frozen validation input and generic media format', sourceRefs: [VALIDATION_CASE.inputs.requirements.path, 'src/media/vector.ts', 'src/media/audio.ts'] } } });
      await mkdir(join(input.root, 'toolchain'));
      for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(input.root, 'toolchain', name), await readFile(join(input.repository, 'templates/2d', name)));
      await registry.registerCapture({ taskId: VALIDATION_CASE.grants.planning.taskId, artifactRef: template, sourceRoot: 'toolchain',
        files: ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'].map(name => ({ source: name, destination: name })), ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [],
        metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'Unchanged generic Phaser toolchain baseline', sourceRefs: ['templates/2d'] } } });
      const observed = await binding.readScope(input.signal);
      assert.deepEqual(observed.requirement.acceptance, stageAcceptance(input.window.quote.requirements.acceptanceIds));
      assert.equal(Object.hasOwn(observed.requirement, 'confirmedBy'), false);
      await requireValidationScope(input.controller, observed.requirement, binding);
      const weakened = structuredClone(observed.requirement); weakened.acceptance[0].expected = 'Only inspect IDs';
      await assert.rejects(requireValidationScope(input.controller, weakened, binding), /scope|changed/i);
      const receiptPath = join(input.ledgerRoot, input.window.operatorDecision.source.location), original = await readFile(receiptPath);
      await writeFile(receiptPath, Buffer.concat([original, Buffer.from('\n')]));
      await assert.rejects(binding.readScope(input.signal), /operator|source|changed/i); await writeFile(receiptPath, original);
      await writeFile(join(input.root, source.location, '_cosmos/requirements.json'), '{}', 'utf8');
      await assert.rejects(binding.readScope(input.signal), /capture|changed|snapshot|bytes/i);
      checked = true; return { outcome: 'failed', gaps: ['Offline scope fixture only; generatedByCosmos:false'] };
    },
  } });
  assert.equal(checked, true); assert.equal(report.outcome, 'failed'); assert.equal('requestsUsed' in report && report.requestsUsed, 0);
});
