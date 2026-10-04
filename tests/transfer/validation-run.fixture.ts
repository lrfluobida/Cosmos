import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE } from '../../probes/transfer/validation-declaration.ts';
import { createValidationIdentityReader } from '../../probes/e2e/validation-identity.ts';
import { runChild } from '../../probes/e2e/host.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';

/** A temporary synthetic history, never Root's real ledger, authorization or generated game. */
export async function transferValidationFixture(t: TestContext) {
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-transfer-entry-')), source = fileURLToPath(new URL('../../', import.meta.url));
  t.after(async () => { assert.ok(repository.startsWith(tmpdir())); await rm(repository, { recursive: true, force: true }); });
  const git = async (...args: string[]) => {
    const result = await runChild('git', ['-c', 'user.name=Offline Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
      '-c', `core.hooksPath=${join(repository, '.git/no-hooks')}`, ...args], { cwd: repository, signal: new AbortController().signal, timeoutMs: 5000 });
    assert.equal(result.code, 0); return result.stdout.trim();
  };
  await git('init', '--initial-branch=main'); await git('config', 'core.autocrlf', 'false');
  for (const file of [VALIDATION_CASE.inputs.requirements, TRANSFER_VALIDATION_CASE.inputs.requirements, ...VALIDATION_CASE.inputs.template.files]) {
    await mkdir(dirname(join(repository, file.path)), { recursive: true }); await writeFile(join(repository, file.path), await readFile(join(source, file.path)));
  }
  await writeFile(join(repository, '.gitignore'), '.cosmos/\n', 'utf8'); await git('add', '.'); await git('commit', '-m', 'Offline fixed inputs');
  const ancestor = await git('rev-parse', 'HEAD');
  const mapping = JSON.parse(await readFile(join(source, 'docs/specs/github-issues.json'), 'utf8'));
  for (const item of mapping.tasks) {
    if (item.reviewedCommit || item.mergeCommit || item.taskId === 'COS-41') { item.reviewedCommit = ancestor; item.mergeCommit = ancestor; }
    if (item.taskId === 'COS-41') { item.reviewStatus = 'TRANSFER_DESIGN_FEEDBACK_SOURCE_READY'; item.integrationStatus = 'offline-verified-awaiting-live'; }
  }
  const mappingPath = join(repository, 'docs/specs/github-issues.json'); await mkdir(dirname(mappingPath), { recursive: true });
  await writeFile(mappingPath, JSON.stringify(mapping), 'utf8'); await git('add', '.'); await git('commit', '-m', 'Offline source approvals');
  let head = await git('rev-parse', 'HEAD');
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), root = join(repository, '.cosmos/e2e', TRANSFER_VALIDATION_CASE.caseId);
  const original = await RunController.create({ root: ledgerRoot, runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', specVersion: '1.0', kind: 'evaluation', scope: 'validation',
    now: () => Date.parse('2026-10-01T06:16:16.857Z'), allocations: [{ taskId: 'offline-legacy', amountMicroCny: 70_000_000 }, { taskId: 'COS-16', amountMicroCny: 10_000_000 }] });
  await original.importSettled({ requestId: 'prior-deepseek-direct-probes', taskId: 'offline-legacy', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 721_771,
    evidence: [{ artifactId: 'offline-only', version: 'v1', location: 'offline.json' }] }); await original.close();
  const oldIdentity = await createValidationIdentityReader({ repository, reviewedPlatformSha: head })(new AbortController().signal);
  async function close(caseIds: string[]) {
    const context = { root: ledgerRoot, repositoryRoot: repository, identityReader: async () => ({ ...oldIdentity }) };
    const quote = await prepareValidationAllocationClosure({ ...context, caseIds }), decisionId = `offline-closure-${caseIds.at(-1)}`;
    const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date().toISOString(),
      source: { artifactId: 'offline-closure', version: 'v1', location: `${decisionId}.json` }, sourceRefs: [{ artifactId: 'offline-only', version: head, location: 'OFFLINE synthetic; generatedByCosmos:false' }] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
      decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
    await applyValidationAllocationClosure({ ...context, quote, decision });
  }
  for (let number = 1; number <= 8; number++) {
    const caseId = `cos20-native-validation-${number}`, declaration: ValidationDeclaration = { ...structuredClone(VALIDATION_CASE), caseId,
      formatVersion: number <= 2 ? 'validation-declaration-1' : 'validation-declaration-2', limits: { ...VALIDATION_CASE.limits, maxRequests: number <= 2 ? 40 : 80 },
      grants: Object.fromEntries(Object.entries(VALIDATION_CASE.grants).map(([role, grant]) => [role, { ...grant, taskId: `${caseId}-${role}` }])) as ValidationDeclaration['grants'] };
    let clock = Date.parse('2026-10-02T00:00:00.000Z') + number * 3600000;
    const context = { root: ledgerRoot, repositoryRoot: repository, identityReader: async () => ({ ...oldIdentity }), now: () => clock };
    const quote = await prepareValidationCase({ ...context, declaration }), decisionId = `offline-case-${number}`;
    const decision = { kind: 'operator_validation' as const, decisionId, actorId: 'offline-coordinator', decidedAt: new Date(clock).toISOString(),
      source: { artifactId: 'offline-operator', version: 'v1', location: `${decisionId}.json` }, sourceRefs: [{ artifactId: 'offline-only', version: head, location: 'OFFLINE synthetic; generatedByCosmos:false' }] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId,
      actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...context, quote, decision }), controller = await RunController.openValidationCase({ ...context, caseId, windowId: window.windowId });
    try { clock += 1000; await controller.stop('OFFLINE consumed fixture; zero provider requests.'); } finally { await controller.close(); }
    await mkdir(join(repository, '.cosmos/e2e', caseId, 'registry'), { recursive: true });
    if (number === 3) await close([1, 2, 3].map(value => `cos20-native-validation-${value}`));
    else if (number > 3) await close([caseId]);
  }
  async function updateMapping(change: (mapping: any) => void) {
    change(mapping); await writeFile(mappingPath, JSON.stringify(mapping), 'utf8'); await git('add', '.'); await git('commit', '-m', 'Offline approval change'); head = await git('rev-parse', 'HEAD'); return head;
  }
  return { repository, ledgerRoot, root, head, mapping, git, updateMapping,
    args: ['--validation-case', head, 'OFFLINE synthetic standing operator source; generatedByCosmos:false'] };
}
