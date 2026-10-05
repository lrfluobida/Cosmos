import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, symlink, stat, cp } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2], template = process.argv[3];
const feeData = JSON.parse(await readFile(join(root, 'SOURCE-fees.json'), 'utf8'));
const caseSevenFeeData = () => structuredClone(feeData);
  const importCompiled = (name: string) => import(pathToFileURL(join(root, 'probes/transfer', name + '.js')).href);
  const source = await importCompiled('validation-case-seven-source'), closure = await source.captureTransferCaseSevenSource();
  assert.equal(closure.variant, 'compiled'); assert.ok(closure.files.every((file: any) => file.path.endsWith('.js'))); await source.requireTransferCaseSevenSource(closure);
  const sourceCopy = await import(pathToFileURL(join(root, 'probes/transfer/validation-case-seven-source.ts')).href), sourceClosure = await sourceCopy.captureTransferCaseSevenSource();
  assert.equal(sourceClosure.variant, 'source'); await sourceCopy.requireTransferCaseSevenSource(sourceClosure);
  const api = await importCompiled('validation-case-seven-run'), ledgerRoot = join(root, 'SOURCE-repository/.cosmos/validation-shared'); await mkdir(ledgerRoot, { recursive: true });
  const unknown = caseSevenFeeData(); Object.assign(unknown.ledger.entries.at(-1)!, { unknown: true, status: 'unknown', reservedMicroCny: 974_882, settledMicroCny: 0 });
  const path = join(ledgerRoot, 'snapshot.json'); await writeFile(path, JSON.stringify(unknown), 'utf8'); const before = await readFile(path), info = await stat(path);
  await assert.rejects(api.preflightTransferValidationCaseSevenRun({ repository: join(root, 'SOURCE-repository'), args: ['--validation-preflight', 'a'.repeat(40)] }), /unknown|reconciliation/);
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, info.mtimeMs);
  const declaration = api.deriveTransferValidationCaseSevenDeclaration(caseSevenFeeData()), driver = await importCompiled('validation-case-seven-driver');
  const repository = join(root, 'SOURCE-bootstrap'), caseRoot = join(repository, '.cosmos/e2e', declaration.caseId); await mkdir(caseRoot, { recursive: true });
  const signal = new AbortController().signal, state: any = { ...caseSevenFeeData(), allocationClosureDecisions: [] }, window: any = { caseId: declaration.caseId, windowId: 'SOURCE-compiled-C7', deadlineAt: new Date(Date.now() + declaration.limits.durationMs).toISOString(), quote: { declaration,
    basis: { revision: 1, snapshotSha256: 'a'.repeat(64), requestIds: state.ledger.entries.map((e: any) => e.requestId) } } };
  const entry = await importCompiled('validation-case-seven-entry'), manifestRef = { artifactId: declaration.caseId + '-historical-stages', version: 'b'.repeat(64), location: declaration.caseId + '-reuse.json' };
  const envelope = entry.createTransferCaseSevenAdmissionQuote(window.quote, manifestRef, [], closure, entry.transferCaseSevenHistoricalAccountingHash(state, window.quote));
  const { createHash } = await import('node:crypto'), envelopeBytes = Buffer.from(JSON.stringify(envelope, null, 2) + '\n'), envelopeRef = { artifactId: declaration.caseId + '-admission', version: createHash('sha256').update(envelopeBytes).digest('hex'), location: declaration.caseId + '-admission-' + envelope.admissionId + '.json' };
  const currentLedger = join(repository, '.cosmos/validation-shared'); await mkdir(currentLedger, { recursive: true });
  await writeFile(join(currentLedger, envelopeRef.location), envelopeBytes); window.operatorDecision = { sourceRefs: [manifestRef, envelopeRef] };
  await mkdir(join(repository, 'templates/2d'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(repository, 'templates/2d', name), await readFile(join(template, name)));
  const input: any = { repository, root: caseRoot, ledgerRoot: join(repository, '.cosmos/validation-shared'), signal, window,
    controller: { requireValidationCase: () => {}, read: async () => state }, work: { run: async (operation: any) => operation(signal) } };
  await driver.bootstrapTransferValidationCaseSevenToolchain(input, async (job: any) => {
    assert.equal(job.args[1], join(root, 'probes/e2e/validation-worker.js')); assert.ok((await stat(job.args[1])).isFile());
    await mkdir(join(caseRoot, 'toolchain'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(caseRoot, 'toolchain', name), await readFile(join(template, name)));
    await mkdir(join(caseRoot, 'toolchain/node_modules'), { recursive: true });
    for (const name of ['typescript', 'vite']) await cp(join(template, 'node_modules', name), join(caseRoot, 'toolchain/node_modules', name), { recursive: true });
    const request = JSON.parse(await readFile(job.args.at(-1), 'utf8')); await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(caseRoot, 'toolchain') }), 'utf8');
    return { passed: true };
  });
  const browser = closure.dependencies.find((d: any) => d.name === '@playwright/test'), child = browser.files.find((file: any) => file.path.includes(`${sep}playwright${sep}lib${sep}common${sep}`));
  assert.ok(child, 'An actual loaded Playwright child must be bound.'); assert.ok(resolve(child.path).startsWith(resolve(root) + sep));
  const childBytes = await readFile(child.path); await writeFile(child.path, Buffer.concat([childBytes, Buffer.from('\n/* SOURCE temporary mutation */\n')]));
  await assert.rejects(source.requireTransferCaseSevenSource(closure), /source|dependency|bytes/);
  await assert.rejects(sourceCopy.requireTransferCaseSevenSource(sourceClosure), /source|dependency|bytes/); await writeFile(child.path, childBytes);
  for (const leaf of ['typescript/lib/_tsc.js', 'vite/dist/node/cli.js']) {
    const path = join(caseRoot, 'toolchain/node_modules', leaf), bytes = await readFile(path); assert.ok(resolve(path).startsWith(resolve(root) + sep));
    await writeFile(path, Buffer.concat([bytes, Buffer.from('\n/* SOURCE temporary mutation */\n')]));
    await assert.rejects(source.requireTransferCaseSevenToolchain(closure, caseRoot, signal), /toolchain|closure|bytes/);
    await assert.rejects(sourceCopy.requireTransferCaseSevenToolchain(sourceClosure, caseRoot, signal), /toolchain|closure|bytes/); await writeFile(path, bytes);
  }
  const config = join(repository, 'templates/2d/tsconfig.json'), configBytes = await readFile(config); await writeFile(config, Buffer.concat([configBytes, Buffer.from(' ')]));
  await assert.rejects(source.requireTransferCaseSevenTemplate(closure, repository, signal), /template|baseline/); await writeFile(config, configBytes);
  await source.requireTransferCaseSevenSource(closure); await source.requireTransferCaseSevenToolchain(closure, caseRoot, signal);
console.log('SOURCE/TEMP source and compiled browser/tool/template mutation guards PASS');
