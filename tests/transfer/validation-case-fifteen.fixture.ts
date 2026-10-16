import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import { withTransferCaseFourteenFixture } from './validation-case-fourteen.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { deriveTransferValidationCaseFourteenDeclaration } from '../../probes/transfer/validation-case-fourteen-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as D } from '../../probes/transfer/validation-case-fifteen-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from '../../probes/transfer/validation-case-five-declaration.ts';
import { createTransferCaseFifteenAdmissionQuote, transferCaseFifteenHistoricalAccountingHash, requireTransferCaseFifteenAccountingSources } from '../../probes/transfer/validation-case-fifteen-entry.ts';
import { captureTransferCaseFifteenSource } from '../../probes/transfer/validation-case-fifteen-source.ts';
import { createHistoricalPassedStages } from '../../src/runtime/historical-passed-stages.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';

/** Reuse genuine SOURCE C1-C13 APIs/receipts, append only C14 accounting and closure20.
 * This has 364 synthetic requests, not the production ledger's 715. The fixed entry
 * rejects that difference; host success below is claimed through the original APIs. */
export async function withTransferCaseFifteenFixture(t: TestContext, operation: (f: {
  repository: string; ledgerRoot: string; root: string; head: string; archive: string; baseline: any; pins: any;
  input: ValidationHostInput; historical: ReturnType<typeof createHistoricalPassedStages>; context: any;
}) => Promise<void>) {
  const priorReuse = process.env.COS91_SOURCE_REUSE;
  process.env.COS91_SOURCE_REUSE = join(tmpdir(), 'cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C14-proof-6a66b182-230b-475c-b1df-3dc17f393aa6');
  try { await withTransferCaseFourteenFixture(t, async f => {
    const root = join(f.repository, '.cosmos/e2e', D.caseId), sourceFile = join(f.repository, D.inputs.requirements.path), key = `SOURCE-C15-${randomUUID()}`;
    await assert.rejects(lstat(root), (error: any) => error.code === 'ENOENT');
    await assert.rejects(lstat(sourceFile), (error: any) => error.code === 'ENOENT');
    let controller: RunController | undefined, work: OwnedWork | undefined;
    try {
      await cp(fileURLToPath(new URL('../../probes/transfer/requirements-case-fifteen.json', import.meta.url)), sourceFile);
      await f.git('add', D.inputs.requirements.path); await f.git('commit', '-m', 'SOURCE C15 fixed nongrouped input');
      const head = await f.git('rev-parse', 'HEAD'); await f.git('update-ref', 'refs/remotes/origin/main', head);
      const old = deriveTransferValidationCaseFourteenDeclaration(f.baseline), oldReader = fixedTransferValidationInput(old).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: head });
      const oldContext = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader: oldReader };
      const receipt = (id: string, kind: 'operator_validation' | 'operator_validation_allocation_closure', refs: any[] = [{ artifactId: 'SOURCE-only', version: head, location: 'SOURCE fixture; no provider authorization' }]) => ({ kind, decisionId: id, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(),
        source: { artifactId: id, version: 'SOURCE-only', location: `${id}.json` }, sourceRefs: refs });
      const reuse = join(f.repository, '.cosmos/SOURCE-C14-proof-665a7f7a-9cec-452a-8e4d-1fed5ca60101');
      const saved = await readFile(join(reuse, 'result-snapshot.json')), source = JSON.parse(saved.toString('utf8')); validateSnapshot(source);
      assert.equal(source.validation!.cases.length, 22); assert.equal(source.requests.length, 364); assert.equal(source.ledger.allocationClosures!.length, 105);
      const rows = source.ledger.entries.filter((row: any) => row.taskId === old.grants.coding.taskId);
      assert.equal(rows.length, 35); assert.equal(rows.reduce((sum: number, row: any) => sum + row.settledMicroCny, 0), 792_063);
      for (const name of await readdir(join(reuse, 'ledger-new-files'))) await cp(join(reuse, 'ledger-new-files', name), join(f.ledgerRoot, name));
      await writeFile(join(f.ledgerRoot, 'snapshot.json'), saved); await mkdir(f.root);
      const decision14 = source.validation!.cases.at(-1)!.operatorDecision;
      const closure = await prepareValidationAllocationClosure({ ...oldContext, caseIds: [old.caseId] }), close = receipt(`${key}-closure20`, 'operator_validation_allocation_closure', [decision14.source]);
      await writeFile(join(f.ledgerRoot, close.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...close, source: undefined, quote: closure }), 'utf8');
      await applyValidationAllocationClosure({ ...oldContext, quote: closure, decision: close as any });
      const baseline = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8')); validateSnapshot(baseline);
      assert.equal(baseline.validation!.cases.length, 22); assert.equal(baseline.ledger.allocationDelegations!.length, 14);
      assert.equal(baseline.ledger.allocationClosures!.length, 110); assert.equal(baseline.allocationClosureDecisions!.length, 20); assert.equal(baseline.requests.length, 364);
      await writeFile(join(f.archive, 'SOURCE-C15-baseline.json'), JSON.stringify(baseline), 'utf8');
      const manifestBytes = await readFile(join(f.ledgerRoot, 'cos20-transfer-validation-14-reuse.json'));
      const manifestRef = { artifactId: `${D.caseId}-historical-stages`, version: validationHash(manifestBytes), location: `${D.caseId}-reuse.json` };
      await writeFile(join(f.ledgerRoot, manifestRef.location), manifestBytes);
      const oldWindow = baseline.validation!.cases[12], historical = createHistoricalPassedStages({ originalRoot: join(f.repository, '.cosmos/e2e', D5.caseId), targetRoot: root,
        expected: { caseId: D5.caseId, windowId: oldWindow.windowId, ...oldWindow.quote.identity, designTaskId: D5.grants.design.taskId, artTaskId: D5.grants.art.taskId }, manifestRef,
        readManifest: signal => readFile(join(f.ledgerRoot, manifestRef.location), { signal }) });
      await historical.verify(new AbortController().signal);
      const identityReader = fixedTransferValidationInput(D).createTransferValidationIdentityReader({ repository: f.repository, reviewedPlatformSha: head });
      const context = { root: f.ledgerRoot, repositoryRoot: f.repository, identityReader: async (signal: AbortSignal) => {
        await requireTransferCaseFifteenAccountingSources(f.ledgerRoot, baseline, signal); return identityReader(signal);
      } };
      const quote = await prepareValidationCase({ ...context, declaration: D }), execution = await captureTransferCaseFifteenSource();
      const envelope = createTransferCaseFifteenAdmissionQuote(quote, manifestRef, [], execution, transferCaseFifteenHistoricalAccountingHash(baseline, quote));
      const bytes = JSON.stringify(envelope, null, 2) + '\n', admissionRef = { artifactId: `${D.caseId}-admission`, version: validationHash(bytes), location: `${D.caseId}-admission-${envelope.admissionId}.json` };
      await writeFile(join(f.ledgerRoot, admissionRef.location), bytes, 'utf8');
      const decision = receipt(key, 'operator_validation', [manifestRef, admissionRef]);
      await writeFile(join(f.ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
      const window = await RunController.claimValidationCase({ ...context, quote, decision: decision as any });
      controller = await RunController.openValidationCase({ ...context, caseId: D.caseId, windowId: window.windowId }); work = new OwnedWork(controller.signal);
      await mkdir(root); await cp(join(f.repository, 'templates/2d'), join(root, 'toolchain'), { recursive: true });
      await symlink(fileURLToPath(new URL('../../templates/2d/node_modules', import.meta.url)), join(root, 'toolchain/node_modules'), 'junction');
      const input = { repository: f.repository, ledgerRoot: f.ledgerRoot, root, controller, window, work, signal: work.signal };
      await operation({ repository: f.repository, ledgerRoot: f.ledgerRoot, root, head, archive: f.archive, baseline, pins: f.pins, input, historical, context });
    } finally {
      await work?.cancelAndDrain('SOURCE C15 fixture cleanup');
      if (controller) { if (!controller.signal.aborted) await controller.stop('SOURCE fixture finished'); await controller.close(); }
      if (await lstat(root).then(() => true, () => false)) await rename(root, join(f.archive, 'case15'));
      await unlink(sourceFile); await f.git('add', D.inputs.requirements.path); await f.git('commit', '-m', 'SOURCE restore original fixed inputs');
      await f.git('update-ref', 'refs/remotes/origin/main', await f.git('rev-parse', 'HEAD'));
    }
  }); } finally { if (priorReuse === undefined) delete process.env.COS91_SOURCE_REUSE; else process.env.COS91_SOURCE_REUSE = priorReuse; }
}
