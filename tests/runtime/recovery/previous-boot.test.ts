import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { OwnerLock } from '../../../src/runtime/recovery/ownership.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const utf8 = (value: unknown) => Buffer.from(JSON.stringify(value) + '\n');
const git = (root: string, ...args: string[]) => childProcess.execFileSync('git', ['-C', root, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
const files = ['src/runtime/recovery/ownership.ts', 'src/runtime/recovery/windows-boot.ts', 'src/runtime/recovery/receipt-file.ts', 'src/artifacts/paths.ts'];

async function fixture(t: test.TestContext, name = '.controller.lock', childPid?: number) {
  assert.equal(typeof OwnerLock.preparePreviousBootRecovery, 'function', 'Explicit previous boot prepare is required');
  const base = await fs.mkdtemp(join(tmpdir(), 'cosmos-previous-boot-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = join(base, 'old-run'), evidenceRoot = join(base, 'operator'), candidate = join(base, 'candidate'), generation = join(base, 'generation');
  for (const path of [root, evidenceRoot, candidate, generation]) await fs.mkdir(path);
  for (const path of files) { await fs.mkdir(dirname(join(candidate, path)), { recursive: true }); await fs.copyFile(join(repository, path), join(candidate, path)); }
  await fs.writeFile(join(candidate, 'package.json'), '{"type":"module"}\n', 'utf8');
  await fs.writeFile(join(generation, 'original.txt'), '冻结的原 generation 来源\n', 'utf8');
  for (const path of [candidate, generation]) {
    git(path, 'init', '-b', path === generation ? 'main' : 'codex/maintenance'); git(path, 'add', '.');
    git(path, '-c', 'user.name=TEMP fixture', '-c', 'user.email=temp@example.invalid', 'commit', '-m', 'TEMP frozen source');
  }
  const maintenanceSource = { repository: candidate, commitSha: git(candidate, 'rev-parse', 'HEAD') };
  const generationSource = { repository: generation, commitSha: git(generation, 'rev-parse', 'HEAD') };
  const owner = { formatVersion: 1, token: 'original-owner', pid: 2_000_000_000, acquiredAt: new Date(Date.now() - 86_400_000).toISOString(),
    untrackedWriters: name === '.commit.lock', children: childPid ? [{ ticket: 'old-child', pid: childPid }] : [] };
  const original = utf8(owner), lockPath = join(root, name);
  await fs.writeFile(lockPath, original); await fs.writeFile(join(root, 'snapshot.json'), '费用与原窗口保持不变\n', 'utf8');
  await fs.writeFile(join(root, 'artifact.txt'), '固定产物\n', 'utf8');
  await new Promise(resolve => setTimeout(resolve, 5));
  let bootAt = new Date().toISOString();
  let rawChange: (value: any) => void = () => {};
  const nativeExec = childProcess.execFileSync;
  t.mock.method(childProcess, 'execFileSync', (file: any, args: any, options: any) => {
    if (!String(file).endsWith('powershell.exe')) return nativeExec(file, args, options);
    const paths = JSON.parse(options.input).paths;
    const raw = { formatVersion: 1, machineId: '11111111-2222-3333-4444-555555555555', machineName: 'TEMP-HOST', observedAt: new Date().toISOString(), lastBootUpTime: bootAt,
      kernelBoot: { provider: 'Microsoft-Windows-Kernel-Boot', eventId: 27, version: 1, recordId: '201', machine: 'TEMP-HOST', timeCreated: bootAt, bootType: 0 },
      kernelGeneral: { provider: 'Microsoft-Windows-Kernel-General', eventId: 12, version: 0, recordId: '200', machine: 'TEMP-HOST', timeCreated: bootAt, bootMode: 0, startTime: bootAt },
      paths: paths.map((path: string) => ({ path, canonicalPath: path, drive: parse(path).root, driveType: 3, volumeSerial: 'A1B2C3D4', fileSystem: 'NTFS', reparseFree: true })) };
    rawChange(raw); return utf8(raw);
  });
  const references = [];
  for (const role of ['launch', 'claim', 'root-intent', 'independent-review'] as const) {
    const path = join(evidenceRoot, `${role}.json`), bytes = utf8({ role, evidence: 'SOURCE/TEMP 原本机来源证据；独立 operator 审查引用' });
    await fs.writeFile(path, bytes); references.push({ role, path, sha256: hash(bytes) });
  }
  const provenance = { formatVersion: 'previous-boot-provenance-1', caseId: 'TEMP-case', windowId: 'TEMP-window', originalRoot: root,
    generationSource, ownerSha256: hash(original), machineHash: hash('11111111-2222-3333-4444-555555555555\ntemp-host'),
    writerScope: 'local-processes-ended-by-full-boot', explanation: '原启动与 claim 属于本机，所有 writer 限本机，无远端或自动重启任务。',
    actorId: 'TEMP-operator', reviewerId: 'TEMP-independent-reviewer', reviewedAt: new Date().toISOString(), references };
  const provenanceSource = { path: join(evidenceRoot, 'provenance.json'), sha256: hash(utf8(provenance)) };
  await fs.writeFile(provenanceSource.path, utf8(provenance));
  const api = (await import(pathToFileURL(join(candidate, files[0])).href)).OwnerLock as typeof OwnerLock;
  const input = { root, name, evidenceRoot, provenanceSource, maintenanceSource };
  const prepare = () => api.preparePreviousBootRecovery(input);
  async function decide(quote: any) {
    const path = join(evidenceRoot, `${quote.operationId}.decision.json`), bytes = utf8({ formatVersion: 'previous-boot-decision-1', kind: 'operator_previous_boot_recovery',
      decisionId: `decision-${quote.operationId}`, actorId: 'TEMP-operator', decidedAt: new Date().toISOString(), provenanceSource, quote });
    await fs.writeFile(path, bytes, { flag: 'wx' }); return { path, sha256: hash(bytes) };
  }
  const apply = (quote: any, decisionSource: any) => api.recoverPreviousBoot({ root, name, evidenceRoot, quote, decisionSource });
  async function unchanged() {
    assert.deepEqual(await fs.readFile(lockPath), original);
    assert.equal(await fs.readFile(join(root, 'snapshot.json'), 'utf8'), '费用与原窗口保持不变\n');
    assert.equal(await fs.readFile(join(root, 'artifact.txt'), 'utf8'), '固定产物\n');
  }
  return { ...input, base, root, candidate, generation, generationSource, lockPath, original, owner, provenance, api, prepare, decide, apply, unchanged,
    nextBoot: async () => { await new Promise(resolve => setTimeout(resolve, 5)); bootAt = new Date().toISOString(); },
    changeRaw: (change: typeof rawChange) => { rawChange = change; } };
}

test('previous boot maintenance requires explicit read-only quote and exact apply APIs', () => {
  assert.equal(typeof OwnerLock.preparePreviousBootRecovery, 'function', 'Explicit previous boot prepare is required');
  assert.equal(typeof OwnerLock.recoverPreviousBoot, 'function', 'Explicit previous boot apply is required');
});

test('old controller with a reused live PID is archived without killing it, witnessed by its independent parent', async t => {
  const supervisor = childProcess.spawn(process.execPath, ['-e', `
    const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e',"process.on('message',m=>m==='exit'?process.exit(0):process.send('alive'))"],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    process.send({pid:child.pid}); child.on('message',m=>process.send(m));
    process.on('message',m=>child.send(m)); child.on('exit',code=>{process.send({childExit:code});process.exit(code||0)});
  `], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  const [ready] = await once(supervisor, 'message');
  t.after(async () => { if (supervisor.exitCode === null) { supervisor.send('exit'); await once(supervisor, 'exit'); } });
  const f = await fixture(t, '.controller.lock', ready.pid);
  await assert.rejects(OwnerLock.recover(f.root, f.name), /alive/i);
  let terminationCalls = 0;
  const originalKill = process.kill;
  t.mock.method(process, 'kill', (pid: number, signal: any = 'SIGTERM') => {
    if (signal !== 0) { terminationCalls++; throw new Error('Nonzero kill forbidden during recovery'); }
    return originalKill(pid, signal);
  });
  t.mock.method(childProcess.ChildProcess.prototype, 'kill', () => { terminationCalls++; throw new Error('Child termination forbidden during recovery'); });
  const quote = await f.prepare(); await f.unchanged();
  const result = await f.apply(quote, await f.decide(quote));
  assert.equal(result.status, 'recovered'); assert.equal(result.deleted, true);
  assert.deepEqual(await fs.readFile(quote.archivePath), f.original);
  await assert.rejects(fs.readFile(f.lockPath), { code: 'ENOENT' });
  const alive = once(supervisor, 'message'); supervisor.send('ping'); assert.equal((await alive)[0], 'alive');
  assert.equal(terminationCalls, 0); t.diagnostic('Independent parent received child alive handshake; nonzero kill calls: 0');
  assert.equal(await fs.readFile(join(f.root, 'snapshot.json'), 'utf8'), '费用与原窗口保持不变\n');
});

test('old untracked registry writer is recovered only through the explicit entry', async t => {
  const f = await fixture(t, '.commit.lock'); await assert.rejects(OwnerLock.recover(f.root, f.name), /untracked/i);
  const quote = await f.prepare(), decision = await f.decide(quote);
  await f.apply(quote, decision); assert.deepEqual(await fs.readFile(quote.archivePath), f.original);
  assert.equal(JSON.parse(await fs.readFile(quote.archivePath, 'utf8')).untrackedWriters, true);
  await fs.writeFile(f.lockPath, utf8({ ...f.owner, token: 'new-owner' }));
  await assert.rejects(f.apply(quote, decision)); assert.equal(JSON.parse(await fs.readFile(f.lockPath, 'utf8')).token, 'new-owner');
});

test('v1 file creation may precede acquiredAt because acquire opens the file before timestamping the record', async t => {
  const f = await fixture(t);
  f.owner.acquiredAt = new Date().toISOString();
  await new Promise(resolve => setTimeout(resolve, 5));
  const bytes = utf8(f.owner); await fs.writeFile(f.lockPath, bytes); await f.nextBoot();
  f.provenance.ownerSha256 = hash(bytes); const provenanceBytes = utf8(f.provenance);
  await fs.writeFile(f.provenanceSource.path, provenanceBytes); f.provenanceSource.sha256 = hash(provenanceBytes);
  const quote = await f.prepare(); await f.apply(quote, await f.decide(quote));
  assert.deepEqual(await fs.readFile(quote.archivePath), bytes);
});

test('current boot, missing provenance, remote or unknown scope and boot evidence are blocked', async t => {
  for (const cause of ['current', 'source-missing', 'copied', 'remote', 'unknown', 'resume', 'fast-startup', 'no-event', 'clock', 'volume'] as const) await t.test(cause, async sub => {
    const f = await fixture(sub);
    if (cause === 'current') {
      f.owner.acquiredAt = new Date().toISOString(); await fs.writeFile(f.lockPath, utf8(f.owner));
      f.provenance.ownerSha256 = hash(utf8(f.owner));
    }
    if (cause === 'source-missing') await fs.unlink(f.provenance.references[0].path);
    if (cause === 'copied') f.provenance.originalRoot = join(f.base, 'copied');
    if (cause === 'remote') f.provenance.writerScope = 'remote-service';
    if (cause === 'unknown') f.provenance.explanation = '';
    if (['current', 'copied', 'remote', 'unknown'].includes(cause)) { const bytes = utf8(f.provenance); await fs.writeFile(f.provenanceSource.path, bytes); f.provenanceSource.sha256 = hash(bytes); }
    f.changeRaw(raw => {
      if (cause === 'resume') raw.kernelBoot.bootType = 2;
      if (cause === 'fast-startup') raw.kernelBoot.bootType = 1;
      if (cause === 'no-event') delete raw.kernelGeneral;
      if (cause === 'clock') raw.observedAt = '2020-01-01T00:00:00.000Z';
      if (cause === 'volume') raw.paths[0].driveType = 4;
    });
    const before = await fs.readFile(f.lockPath); await assert.rejects(f.prepare());
    assert.deepEqual(await fs.readFile(f.lockPath), before); assert.equal(await fs.readFile(join(f.root, 'snapshot.json'), 'utf8'), '费用与原窗口保持不变\n');
  });
});

test('junction aliases and non-v1 owner records cannot be prepared', async t => {
  for (const cause of ['junction', 'legacy', 'unknown-field', 'bad-child'] as const) await t.test(cause, async sub => {
    const f = await fixture(sub);
    if (cause === 'junction') { await fs.rename(f.root, `${f.root}-original`); await fs.symlink(`${f.root}-original`, f.root, 'junction'); }
    else {
      const owner: any = structuredClone(f.owner);
      if (cause === 'legacy') owner.formatVersion = 0;
      if (cause === 'unknown-field') owner.safe = true;
      if (cause === 'bad-child') owner.children = [{ ticket: 'invalid', pid: -1 }];
      const bytes = utf8(owner); await fs.writeFile(f.lockPath, bytes); f.provenance.ownerSha256 = hash(bytes);
      const provenanceBytes = utf8(f.provenance); await fs.writeFile(f.provenanceSource.path, provenanceBytes); f.provenanceSource.sha256 = hash(provenanceBytes);
      await f.nextBoot();
    }
    const before = await fs.readFile(f.lockPath); await assert.rejects(f.prepare()); assert.deepEqual(await fs.readFile(f.lockPath), before);
  });
});

test('quote rejects replacement, metadata, authority, source or boot changes', async t => {
  for (const cause of ['same-bytes-new-file', 'mtime', 'bytes', 'quote', 'decision', 'provenance', 'reference', 'maintenance', 'generation', 'boot', 'machine'] as const) await t.test(cause, async sub => {
    const f = await fixture(sub), quote = await f.prepare(), decision = await f.decide(quote);
    if (cause === 'same-bytes-new-file') { await fs.rename(f.lockPath, `${f.lockPath}.old`); await fs.writeFile(f.lockPath, f.original); }
    if (cause === 'mtime') await fs.utimes(f.lockPath, new Date(), new Date());
    if (cause === 'bytes') await fs.appendFile(f.lockPath, '\n');
    if (cause === 'quote') quote.owner.record.token = 'changed';
    if (cause === 'decision') await fs.appendFile(decision.path, '\n');
    if (cause === 'provenance') await fs.appendFile(f.provenanceSource.path, '\n');
    if (cause === 'reference') await fs.appendFile(f.provenance.references[0].path, '\n');
    if (cause === 'maintenance') await fs.appendFile(join(f.candidate, files[0]), '\n');
    if (cause === 'generation') { await fs.appendFile(join(f.generation, 'original.txt'), '\n'); git(f.generation, 'add', '.'); git(f.generation, '-c', 'user.name=TEMP', '-c', 'user.email=temp@example.invalid', 'commit', '-m', 'Changed main'); }
    if (cause === 'boot') f.changeRaw(raw => { raw.kernelBoot.recordId = '301'; });
    if (cause === 'machine') f.changeRaw(raw => { raw.machineId = '99999999-2222-3333-4444-555555555555'; });
    const before = await fs.readFile(f.lockPath); await assert.rejects(f.apply(quote, decision)); assert.deepEqual(await fs.readFile(f.lockPath), before);
    await assert.rejects(fs.readFile(`${f.lockPath}.recovery`), { code: 'ENOENT' });
  });
});

test('archive failure, concurrent guards and unresolved outcome preserve the correct boundary', async t => {
  for (const cause of ['archive-exists', 'archive-readback', 'concurrent', 'guard', 'outcome-exists', 'outcome', 'unlink-unknown'] as const) await t.test(cause, async sub => {
    const f = await fixture(sub), quote = await f.prepare(), decision = await f.decide(quote);
    if (cause === 'archive-exists') await fs.writeFile(quote.archivePath, 'occupied');
    if (cause === 'guard') await fs.writeFile(`${f.lockPath}.recovery`, 'unresolved');
    if (cause === 'outcome-exists') await fs.writeFile(quote.outcomePath, 'occupied');
    if (cause === 'outcome') {
      const nativeUnlink = fs.unlink;
      sub.mock.method(fs, 'unlink', async (path: any) => {
        await nativeUnlink(path); if (String(path) === f.lockPath) await fs.writeFile(quote.outcomePath, 'late audit failure');
      });
    }
    if (cause === 'archive-readback') {
      const nativeRead = fs.readFile;
      sub.mock.method(fs, 'readFile', (...args: any[]) => String(args[0]) === quote.archivePath ? Promise.resolve(Buffer.from('corrupt')) : (nativeRead as any)(...args));
    }
    if (cause === 'unlink-unknown') {
      const nativeUnlink = fs.unlink;
      sub.mock.method(fs, 'unlink', async (path: any) => { if (String(path) === f.lockPath) { await nativeUnlink(path); throw new Error('Unknown unlink completion'); } return nativeUnlink(path); });
    }
    if (cause === 'concurrent') {
      const results = await Promise.allSettled([f.apply(quote, decision), f.apply(quote, decision)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.deepEqual(await fs.readFile(quote.archivePath), f.original);
    } else {
      await assert.rejects(f.apply(quote, decision));
      if (cause === 'outcome' || cause === 'unlink-unknown') {
        await assert.rejects(fs.readFile(f.lockPath), { code: 'ENOENT' });
        assert.ok(await fs.readFile(`${f.lockPath}.recovery`)); assert.ok(await fs.readFile(quote.intentPath));
        await assert.rejects(f.apply(quote, decision), /busy|unresolved/i);
      } else await f.unchanged();
    }
  });
});

test('apply rechecks authority and OS changes during archival, and forbids production override inputs', async t => {
  for (const cause of ['boot-during-archive', 'decision-during-archive', 'guard-replaced', 'override'] as const) await t.test(cause, async sub => {
    const f = await fixture(sub), quote = await f.prepare(), approved = await f.decide(quote);
    if (cause === 'override') {
      for (const key of ['now', 'bootAt', 'isDead', 'allowUntracked', 'verifier', 'test']) await assert.rejects(f.api.preparePreviousBootRecovery({
        root: f.root, name: f.name, evidenceRoot: f.evidenceRoot, provenanceSource: f.provenanceSource, maintenanceSource: f.maintenanceSource, [key]: true } as any), /schema/i);
      await f.unchanged(); return;
    }
    const nativeOpen = fs.open;
    sub.mock.method(fs, 'open', async (...args: any[]) => {
      const result = await (nativeOpen as any)(...args);
      if (String(args[0]) === quote.archivePath) {
        if (cause === 'boot-during-archive') f.changeRaw(raw => { raw.kernelBoot.recordId = '301'; });
        if (cause === 'decision-during-archive') await fs.appendFile(approved.path, '\n');
        if (cause === 'guard-replaced') { await fs.rename(`${f.lockPath}.recovery`, `${f.lockPath}.saved-guard`); await fs.writeFile(`${f.lockPath}.recovery`, 'foreign guard'); }
      }
      return result;
    });
    await assert.rejects(f.apply(quote, approved)); await f.unchanged();
    if (cause === 'guard-replaced') assert.equal(await fs.readFile(`${f.lockPath}.recovery`, 'utf8'), 'foreign guard');
  });
});

test('a guard replaced before its initial path read is never mistaken for this operation guard', async t => {
  const f = await fixture(t), quote = await f.prepare(), approved = await f.decide(quote), nativeOpen = fs.open;
  t.mock.method(fs, 'open', async (...args: any[]) => {
    const handle = await (nativeOpen as any)(...args);
    if (String(args[0]) === `${f.lockPath}.recovery`) {
      const nativeSync = handle.sync.bind(handle);
      t.mock.method(handle, 'sync', async () => {
        await nativeSync(); await fs.rename(`${f.lockPath}.recovery`, `${f.lockPath}.original-guard`);
        await fs.writeFile(`${f.lockPath}.recovery`, 'foreign guard before binding');
      });
    }
    return handle;
  });
  await assert.rejects(f.apply(quote, approved), /guard/i);
  await f.unchanged(); assert.equal(await fs.readFile(`${f.lockPath}.recovery`, 'utf8'), 'foreign guard before binding');
});

test('independent maintenance unlocks then frozen original APIs use real deadline and close the same allocation', async t => {
  const f = await fixture(t), frozenSha = '2f84eb328e59f20d73ceccdc69ff708f7be200a5';
  const archive = childProcess.execFileSync('git', ['-C', repository, 'archive', frozenSha, 'src', 'probes', 'package.json'], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  childProcess.execFileSync('tar', ['-xf', '-', '-C', f.generation], { input: archive, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const { RunController } = await import(pathToFileURL(join(f.generation, 'src/runtime/run.ts')).href);
  const { prepareValidationCase } = await import(pathToFileURL(join(f.generation, 'src/runtime/validation-window.ts')).href);
  const { createReviewedValidationIdentityReader } = await import(pathToFileURL(join(f.generation, 'probes/e2e/validation-identity.ts')).href);
  const { OwnerLock: originalOwner } = await import(pathToFileURL(join(f.generation, 'src/runtime/recovery/ownership.ts')).href);
  assert.equal(originalOwner.recoverPreviousBoot, undefined, 'Frozen original source does not contain the maintenance entry');
  await fs.mkdir(join(f.generation, 'template'));
  const requirements = utf8({ specVersion: '1.0', requirementVersion: 'fixture-v1', acceptanceIds: ['game'], stageAcceptanceIds: ['design', 'art'], rule: '真实截止后仅收口' });
  const template = utf8({ fixture: true }), templateFiles = [{ path: 'template/package.json', sha256: hash(template) }];
  await fs.writeFile(join(f.generation, 'requirements.json'), requirements); await fs.writeFile(join(f.generation, templateFiles[0].path), template);
  await fs.writeFile(join(f.generation, '.gitignore'), '.cosmos/\n', 'utf8');
  git(f.generation, 'add', '.'); git(f.generation, '-c', 'user.name=TEMP', '-c', 'user.email=temp@example.invalid', 'commit', '-m', 'Frozen original runtime fixture');
  f.generationSource.commitSha = git(f.generation, 'rev-parse', 'HEAD');
  const inputs = { requirements: { version: 'fixture-v1', path: 'requirements.json', sha256: hash(requirements) }, template: { sha256: hash(JSON.stringify(templateFiles)), files: templateFiles } };
  const readFixed = async (root: string) => {
    assert.equal(hash(await fs.readFile(join(root, inputs.requirements.path))), inputs.requirements.sha256);
    assert.equal(hash(await fs.readFile(join(root, templateFiles[0].path))), templateFiles[0].sha256);
    return { manifest: inputs };
  };
  const identityReader = createReviewedValidationIdentityReader({ repository: f.generation, reviewedPlatformSha: f.generationSource.commitSha }, readFixed);
  await fs.unlink(f.lockPath); await fs.unlink(join(f.root, 'snapshot.json'));
  // Historical clock is used only to construct this synthetic interrupted run. Recovery/accounting below use real time.
  let historical = Date.now() - 2 * 86_400_000;
  const initial = await RunController.create({ root: f.root, runId: 'TEMP-interrupted', ledgerId: 'TEMP-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0',
    allocations: [{ taskId: 'legacy', amountMicroCny: 1_000_000 }], now: () => historical });
  await initial.importSettled({ requestId: 'settled-before-boot', taskId: 'legacy', provider: 'fixture', pricingVersion: 'v1', actualCostMicroCny: 17,
    evidence: [{ artifactId: 'original-receipt', version: 'v1', location: 'original-receipt.json' }] });
  await initial.close(); historical += 12 * 60 * 60 * 1000 + 1;
  const caseId = 'cos20-previous-boot-fixture';
  const declaration = { formatVersion: 'validation-declaration-2', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
    limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000, durationMs: 2_700_000, maxRequests: 80, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
    grants: Object.fromEntries(Object.entries({ planning: 2_000_000, design: 1_900_000, art: 5_700_000, coding: 7_600_000, repair: 3_800_000 }).map(([role, amountMicroCny]) => [role, { taskId: `${caseId}-${role}`, amountMicroCny }])),
    outputTokens: { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 }, inputs };
  const context = { root: f.root, repositoryRoot: f.generation, identityReader };
  const caseQuote = await prepareValidationCase({ ...context, declaration, now: () => historical });
  const operator = { kind: 'operator_validation', decisionId: 'TEMP-case-decision', actorId: 'TEMP-operator', decidedAt: new Date(historical).toISOString(),
    source: { artifactId: 'TEMP-case-decision', version: 'v1', location: 'case-decision.json' }, sourceRefs: [{ artifactId: 'original-authority', version: 'v1', location: 'original-authority.json' }] };
  await fs.writeFile(join(f.root, operator.source.location), utf8({ formatVersion: 'operator-validation-decision-1', ...Object.fromEntries(Object.entries(operator).filter(([key]) => key !== 'source')), quote: caseQuote }));
  const window = await RunController.claimValidationCase({ ...context, quote: caseQuote, decision: operator, now: () => historical });
  await fs.mkdir(join(f.generation, '.cosmos/e2e', caseId, 'registry'), { recursive: true });
  const originalBytes = await fs.readFile(join(f.root, 'snapshot.json')), state = JSON.parse(originalBytes.toString('utf8'));
  assert.equal(state.validation.cases[0].stopReason, null); assert.ok(Date.parse(window.deadlineAt) < Date.now());
  await fs.writeFile(f.lockPath, f.original); await f.nextBoot();
  const provenanceBytes = utf8(f.provenance); await fs.writeFile(f.provenanceSource.path, provenanceBytes); f.provenanceSource.sha256 = hash(provenanceBytes);
  const maintenanceQuote = await f.prepare();
  assert.equal(maintenanceQuote.maintenanceSource.repository, f.candidate); assert.equal(maintenanceQuote.generationSource.commitSha, f.generationSource.commitSha);
  await f.apply(maintenanceQuote, await f.decide(maintenanceQuote));
  assert.deepEqual(await fs.readFile(join(f.root, 'snapshot.json')), originalBytes, 'Maintenance cannot mutate original runtime accounting');
  const accountingStartedAt = Date.now();
  const childResult = childProcess.execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
    import assert from 'node:assert/strict'; import fs from 'node:fs/promises'; import {readFileSync} from 'node:fs';
    import {join} from 'node:path'; import {pathToFileURL} from 'node:url'; import {createHash} from 'node:crypto';
    const p=JSON.parse(readFileSync(0,'utf8')), load=path=>import(pathToFileURL(join(p.generation,path)).href);
    const {RunController}=await load('src/runtime/run.ts');
    const closure=await load('src/runtime/validation-allocations.ts');
    const {createReviewedValidationIdentityReader}=await load('probes/e2e/validation-identity.ts');
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    const identityReader=createReviewedValidationIdentityReader({repository:p.generation,reviewedPlatformSha:p.sha},async root=>{
      for(const file of [p.inputs.requirements,...p.inputs.template.files]) assert.equal(hash(await fs.readFile(join(root,file.path))),file.sha256);
      return {manifest:p.inputs};
    });
    const context={root:p.root,repositoryRoot:p.generation,identityReader};
    const accounting=await RunController.openValidationCase({...context,caseId:p.caseId,windowId:p.windowId,accountingOnly:true});
    const stopped=await accounting.read(); assert.equal(stopped.validation.cases[0].stopReason.code,'deadline');
    await assert.rejects(accounting.prepareOwnedChild(),/accounting|stopped/i); await accounting.close();
    await assert.rejects(fs.readFile(join(p.root,'.controller.lock')),{code:'ENOENT'});
    const quote=await closure.prepareValidationAllocationClosure({...context,caseIds:[p.caseId]});
    const decision={kind:'operator_validation_allocation_closure',decisionId:'TEMP-closure',actorId:'TEMP-independent-operator',decidedAt:new Date().toISOString(),
      source:{artifactId:'TEMP-closure',version:'v1',location:'closure.json'},sourceRefs:p.sourceRefs};
    await fs.writeFile(join(p.root,decision.source.location),JSON.stringify({formatVersion:'operator-validation-allocation-closure-decision-1',
      ...Object.fromEntries(Object.entries(decision).filter(([key])=>key!=='source')),quote})+'\\n','utf8');
    await closure.applyValidationAllocationClosure({...context,quote,decision});
    console.log(JSON.stringify({pid:process.pid,stopAt:stopped.validation.cases[0].stopReason.at}));
  `], { input: JSON.stringify({ root: f.root, generation: f.generation, sha: f.generationSource.commitSha, inputs, caseId, windowId: window.windowId, sourceRefs: operator.sourceRefs }),
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const accounted = JSON.parse(childResult.toString('utf8')); assert.notEqual(accounted.pid, process.pid); assert.ok(Date.parse(accounted.stopAt) >= accountingStartedAt);
  const after = JSON.parse(await fs.readFile(join(f.root, 'snapshot.json'), 'utf8'));
  for (const key of ['tasks', 'requests']) assert.deepEqual(after[key], state[key]);
  for (const key of ['fees', 'originalDeadlineAt', 'humanDecisions']) assert.deepEqual(after.run[key], state.run[key]);
  assert.deepEqual(after.ledger.entries, state.ledger.entries); assert.deepEqual(after.validation.cases[0].quote, state.validation.cases[0].quote);
  assert.equal(after.validation.cases[0].deadlineAt, window.deadlineAt); assert.equal(after.validation.cases.length, 1); assert.equal(after.allocationClosureDecisions.length, 1);
  assert.equal(git(f.generation, 'rev-parse', 'HEAD'), f.generationSource.commitSha); assert.equal(git(f.generation, 'status', '--porcelain'), '');
  await fs.appendFile(join(f.generation, 'original.txt'), 'later source\n'); git(f.generation, 'add', '.'); git(f.generation, '-c', 'user.name=TEMP', '-c', 'user.email=temp@example.invalid', 'commit', '-m', 'Premature main advance');
  await assert.rejects(identityReader(new AbortController().signal), /HEAD|clean main/i);
  t.diagnostic('TEMP candidate maintenance -> frozen original accountingOnly (real now) -> deadline -> close -> exact closure; no new request or attempt');
});
