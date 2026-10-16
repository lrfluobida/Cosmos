import assert from 'node:assert/strict';
import test from 'node:test';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTransferCaseFifteenFixture } from './validation-case-fifteen.fixture.ts';
import { stageTransferValidationCaseFifteenInput } from '../../probes/transfer/validation-case-fifteen-driver.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';

test('C15 real coding-only driver reaches the reused consumer host with a different C5 input hash', async t => {
  await withTransferCaseFifteenFixture(t, async f => {
    const scoped = await stageTransferValidationCaseFifteenInput(f.input, f.historical), inherited = await f.historical.verify(f.input.signal);
    assert.notEqual(scoped.requirement.validation.frozenCaseInputHash, inherited.sourceRequirement.validation.frozenCaseInputHash);
    assert.deepEqual(scoped.requirement.acceptance, inherited.sourceRequirement.acceptance);
    let sessions = 0, imports = 0;
    const construct = (historicalStages = f.historical, requirement = scoped.requirement, proposal = scoped.proposal, resume = false) => createTransferReusedConsumerHost({
      root: f.root, controller: f.input.controller, requirement, proposal, validation: scoped.binding, work: f.input.work, resume, historicalStages,
      sessionFactory: async () => { sessions++; throw new Error('SOURCE construction creates no role session'); },
      io: { build: async () => { throw new Error('SOURCE construction creates no build'); }, play: async () => { throw new Error('SOURCE construction creates no browser'); } } });
    for (const [label, mutate] of [
      ['wrong C5 window', (value: any) => { value.sourceRequirement.validation.windowId = 'wrong-window'; }],
      ['wrong C5 source', (value: any) => { value.manifest.reviewedPlatformSha = '0'.repeat(40); }],
      ['wrong requirement capture', (value: any) => { value.requirementCapture = value.mediaArtifact; }],
      ['wrong captured source path', (value: any) => { value.sourceRequirement.sources[0].location = 'requirements/other.json'; }],
      ['changed complete acceptance', (value: any) => { value.sourceRequirement.acceptance[0].expected += 'changed'; }],
      ['wrong historical operator', (value: any) => { value.sourceRequirement.validation.decision.actorId = 'other'; }],
      ['wrong historical root', (value: any) => { value.manifest.originalRoot = f.root; }],
    ] as const) {
      const historical = { ...f.historical, verify: async (signal: AbortSignal) => { const value = structuredClone(await f.historical.verify(signal)); mutate(value); return value; },
        import: async (signal: AbortSignal) => { imports++; return f.historical.import(signal); } };
      await assert.rejects(construct(historical), /historical|requirement|C15|capture|source/i, label);
      assert.equal(imports, 0, label); assert.equal(sessions, 0, label);
    }
    const wrongCase = structuredClone(scoped.requirement); wrongCase.validation.caseId = 'cos20-transfer-validation-6';
    await assert.rejects(construct(f.historical, wrongCase), /scope|authority|input/i);
    const wrongPath = structuredClone(scoped.requirement); wrongPath.sources[0].location = 'requirements/other.json';
    await assert.rejects(construct(f.historical, wrongPath), /scope|authority|input/i);
    const currentPath = join(f.root, 'requirements/fixed.json'), currentBytes = await readFile(currentPath);
    for (const mutate of [(value: any) => { value.scope += 'changed'; }, (value: any) => { value.preparation.brief += 'changed'; },
      (value: any) => { value.budgetGroup = { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 }; }]) {
      const value = JSON.parse(currentBytes.toString('utf8')); mutate(value); await writeFile(currentPath, JSON.stringify(value), 'utf8');
      try { await assert.rejects(construct(), /input|source|fixed/i); } finally { await writeFile(currentPath, currentBytes); }
      assert.equal(sessions, 0);
    }
    await assert.rejects(lstat(join(f.root, 'host-historical-stage-import.json')), (error: any) => error.code === 'ENOENT');
    const host = await createTransferReusedConsumerHost({ root: f.root, controller: f.input.controller, requirement: scoped.requirement, proposal: scoped.proposal,
      validation: scoped.binding, work: f.input.work, resume: false, historicalStages: f.historical,
      sessionFactory: async () => { sessions++; throw new Error('SOURCE construction creates no role session'); },
      io: { build: async () => { throw new Error('SOURCE construction creates no build'); }, play: async () => { throw new Error('SOURCE construction creates no browser'); } } });
    try { assert.equal(sessions, 0); assert.equal(host.taskPolicies.length, 1); assert.equal(host.taskPolicies[0].role, 'coding'); }
    finally { await host.closePreparation(); }
    const restored = await construct(f.historical, scoped.requirement, scoped.proposal, true);
    await restored.closePreparation(); assert.equal(sessions, 0);
    await assert.rejects(lstat(join(f.root, 'sessions')), (error: any) => error.code === 'ENOENT');
  });
});
