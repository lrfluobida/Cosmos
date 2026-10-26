/** SOURCE-only, zero paid traffic. Run: npm run validate:public:offline
 * Requires installed lockfile dependencies and Edge. COSMOS_TEMPLATE_ROOT may name
 * an equivalent installed template. No installation, live run or paid authorization.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';

const self = fileURLToPath(import.meta.url), repository = resolve(dirname(self), '../..');
const cases = [
  ['intake-resume', 'tests/cli/intake-truncation.test.ts', 'funded public resume preserves old answers and charges, then requires actual draft confirmation'],
  ['intake-original-grant', 'tests/roles/public-validation-replay.test.ts', 'public offline replay preserves settled intake costs at room10 and room13 boundaries', 'expected_rejection'],
  ['author-output', 'tests/roles/author-output-budget.test.ts', 'COS124 native normalized input, selected cap, real reservation and six billing fields agree across settlements'],
  ['design-compaction', 'tests/providers/ordinary-design-compaction.test.mjs', 'COS125 real native summary is quoted before dispatch and preserves original sources'],
  ['request-32', 'tests/runtime/ordinary-design-request-capacity.test.ts', 'COS122 native design author reaches protocol handoff on model request 32'],
  ['request-33', 'tests/runtime/ordinary-design-request-capacity.test.ts', 'COS122 native request 33 is denied before transport and accounting, including readonly correction', 'expected_rejection'],
  ['planning-json', 'tests/roles/planning-json-output.test.ts', 'trusted planning reaches native JSON transport and preserves host bindings: validation=false'],
  ['planning-invalid', 'tests/roles/planning-json-output.test.ts', 'JSON transport remains fail closed for invalid responses without correction', 'expected_rejection'],
  ['planning-binding', 'tests/roles/planning-acceptance-binding.test.ts', 'trusted acceptance binding preserves the proposal and every other task contract field'],
  ['review-approved', 'tests/providers/design-review-budget.test.mjs', 'COS127 SDK complete approved uses native compact reads and the original grant'],
  ['review-length', 'tests/providers/design-review-budget.test.mjs', 'COS127 SDK length with complete-looking approved JSON settles and cannot approve or retry', 'expected_rejection'],
  ['author-protocol', 'tests/runtime/public-author-protocol.test.ts', 'COS128 public ordinary corrects prose-prefixed handoff once'],
  ['ordinary-delivery', 'tests/runtime/entrypoint-delivery.integration.ts', 'public offline ordinary captured design reaches real clean delivery'],
  ['capture-drift', 'tests/runtime/entrypoint-delivery.integration.ts', 'public offline ordinary changed capture blocks downstream dispatch', 'expected_rejection'],
].map(([caseId, file, name, expected = 'flow_passed']) => ({ caseId, file, name, expected, observed: 'uncovered', hits: 0, selectedSkip: 0 }));
const localKeys = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)'];
const internalKeys = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PLAYWRIGHT_BROWSERS_PATH', 'COSMOS_TEMPLATE_ROOT', 'COSMOS_PREFLIGHT_RESULTS', 'COSMOS_KEEP_EVIDENCE'];
// Windows adds these OS variables to child environments even when env is explicit.
const windowsKeys = ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME'];
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const exact = name => new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');

function command(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: repository, shell: false, windowsHide: true, ...options });
    let stdout = '', stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; }); child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function installed(root) {
  const packageJson = await json(join(root, 'package.json')), lock = await json(join(root, 'package-lock.json'));
  const hidden = await json(join(root, 'node_modules/.package-lock.json'));
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    if (entry.optional && (entry.os && !entry.os.includes(process.platform) || entry.cpu && !entry.cpu.includes(process.arch))) continue;
    assert.equal(hidden.packages[path]?.version, entry.version, `Missing or mismatched locked dependency: ${path}`);
    assert.equal((await json(join(root, path, 'package.json'))).version, entry.version, `Installed dependency differs: ${path}`);
  }
  for (const [name, version] of Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
    assert.equal(lock.packages['node_modules/' + name]?.version, version, `Manifest differs from lock: ${name}`);
  }
}

async function worker() {
  const output = process.env.COSMOS_PREFLIGHT_RESULTS;
  assert.ok(output && dirname(output) === resolve(tmpdir()) && /^cosmos-public-offline-/.test(output.slice(dirname(output).length + 1)), 'Use the public runner entrypoint.');
  const summary = { scope: 'source_only', realModelGeneration: 'unverified', paidAuthorized: false, newEntryHandoff: 'unverified',
    sourceSha: null, sourceWorkingTree: 'unverified', versions: { node: process.version }, cases, checksPassed: 0, handoffPassed: 0, expectedRejections: 0,
    selectedSkip: 0, actualProviderCostMicroCny: null, uncovered: ['real model generation', 'new requirements entry handoff', 'user experience', 'full classic benchmark'], errors: [] };
  const logs = [];
  try {
    assert.ok(Object.keys(process.env).every(key => [...localKeys, ...internalKeys, ...windowsKeys].includes(key.toUpperCase())), 'Worker environment must be allowlisted before tests.');
    assert.match(process.version, /^v22\./, 'Node 22 is required.');
    assert.equal(cases.length, 14); assert.equal(new Set(cases.map(row => row.name)).size, 14);
    const source = await command('git', ['rev-parse', 'HEAD']); assert.equal(source.code, 0, 'Source SHA is unavailable.'); summary.sourceSha = source.stdout.trim();
    const status = await command('git', ['status', '--porcelain', '--untracked-files=normal']); assert.equal(status.code, 0, 'Source status is unavailable.');
    summary.sourceWorkingTree = status.stdout.trim() ? 'modified' : 'clean';
    await installed(repository);
    const template = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? join(repository, 'templates/2d'));
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) {
      assert.ok((await readFile(join(template, file))).equals(await readFile(join(repository, 'templates/2d', file))), `Template source differs: ${file}`);
    }
    await installed(template);
    summary.versions.sdk = (await json(join(repository, 'node_modules/@earendil-works/pi-coding-agent/package.json'))).version;
    const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
    assert.ok(edge, 'Local Microsoft Edge is required. No browser download is allowed.');
    const version = await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Item -LiteralPath '${edge}').VersionInfo.ProductVersion`]);
    assert.equal(version.code, 0, 'Edge version is unavailable.'); summary.versions.edge = version.stdout.trim();
    const ffmpeg = (await json(join(repository, 'node_modules/playwright-core/browsers.json'))).browsers.find(item => item.name === 'ffmpeg');
    assert.ok(process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(join(process.env.PLAYWRIGHT_BROWSERS_PATH, `ffmpeg-${ffmpeg.revision}`, 'ffmpeg-win64.exe')),
      'The locked Playwright ffmpeg binary is required. No download is allowed.');
    summary.versions.ffmpegRevision = ffmpeg.revision;
    // Owned browser workers filter PLAYWRIGHT_BROWSERS_PATH; retain only this binary
    // at their default cache path inside the isolated local app directory.
    const localFfmpeg = join(process.env.LOCALAPPDATA, 'ms-playwright', `ffmpeg-${ffmpeg.revision}`, 'ffmpeg-win64.exe');
    await mkdir(dirname(localFfmpeg), { recursive: true });
    await copyFile(join(process.env.PLAYWRIGHT_BROWSERS_PATH, `ffmpeg-${ffmpeg.revision}`, 'ffmpeg-win64.exe'), localFfmpeg);
    const build = await command(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json']);
    await writeFile(join(output, 'build.log'), build.stdout + build.stderr, 'utf8'); assert.equal(build.code, 0, 'Build failed; see build.log.');
    for (const file of new Set(cases.map(row => row.file))) {
      const selected = cases.filter(row => row.file === file), stream = run({ files: [join(repository, file)], isolation: 'process', concurrency: 1,
        execArgv: ['--experimental-strip-types'], timeout: 240000, testNamePatterns: selected.map(row => exact(row.name)) });
      let finalSummary;
      for await (const { type, data } of stream) {
        if (type === 'test:summary') { finalSummary = data; logs.push({ file, type, counts: data.counts, success: data.success }); }
        if (type === 'test:stdout' || type === 'test:diagnostic') {
          try {
            const value = JSON.parse(data.message);
            if (value.kind === 'COS130-source-only-root' && dirname(value.root) === resolve(tmpdir())) {
              const row = selected.find(row => row.name === value.caseName); if (row) row.evidence = { ...row.evidence, root: value.root };
            }
            if (value.kind === 'COS130-source-only-fixture' && dirname(value.root) === resolve(tmpdir())
              && /^delivery\/report-[\da-f-]+\.json$/.test(value.report)) {
              cases.find(row => row.caseId === 'ordinary-delivery').evidence = { root: value.root, report: value.report };
            }
          } catch { /* Raw test output, native contexts and environment values are never copied. */ }
        }
        if (type !== 'test:pass' && type !== 'test:fail') continue;
        const row = selected.find(row => row.name === data.name);
        if (!row) { if (type === 'test:fail') summary.errors.push(`Unexpected test failure in ${file}`); continue; }
        row.hits++; row.selectedSkip += Number(Boolean(data.skip || data.todo));
        row.observed = type === 'test:pass' && !data.skip && !data.todo && row.hits === 1 ? row.expected : 'failed';
        row.actualProviderCostMicroCny = row.observed === row.expected ? 0 : null;
        logs.push({ caseId: row.caseId, type, name: row.name, observed: row.observed, durationMs: data.details.duration_ms,
          ...(type === 'test:fail' ? { errorCode: data.details.error?.code ?? 'TEST_FAILED', failureType: data.details.error?.failureType ?? 'unknown' } : {}) });
      }
      if (!finalSummary?.success) summary.errors.push(`Test group did not complete successfully: ${file}`);
      for (const row of selected) if (row.hits !== 1 || row.selectedSkip || row.observed !== row.expected) summary.errors.push(`Missing, skipped, repeated or failed case: ${row.caseId}`);
      console.log(`${file}: ${selected.filter(row => row.observed === row.expected && row.hits === 1).length}/${selected.length}`);
    }
  } catch (error) { summary.errors.push(error.message); }
  summary.checksPassed = cases.filter(row => row.observed === row.expected && row.hits === 1 && !row.selectedSkip).length;
  summary.handoffPassed = Number(cases.find(row => row.caseId === 'ordinary-delivery').observed === 'flow_passed');
  summary.expectedRejections = cases.filter(row => row.observed === 'expected_rejection').length;
  summary.selectedSkip = cases.reduce((sum, row) => sum + row.selectedSkip, 0);
  summary.actualProviderCostMicroCny = summary.checksPassed === 14 ? 0 : null;
  summary.passed = summary.errors.length === 0 && summary.checksPassed === 14 && summary.handoffPassed === 1 && summary.selectedSkip === 0;
  await writeFile(join(output, 'tests.jsonl'), logs.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ checksPassed: summary.checksPassed, handoffPassed: summary.handoffPassed, expectedRejections: summary.expectedRejections,
    uncovered: summary.uncovered, paidAuthorized: false, summary: join(output, 'summary.json'), errors: summary.errors }));
  process.exitCode = summary.passed ? 0 : 1;
}

if (process.argv.length === 2) {
  const output = await mkdtemp(join(tmpdir(), 'cosmos-public-offline-')), safeEnv = {};
  for (const key of localKeys) { const found = Object.keys(process.env).find(name => name.toUpperCase() === key); if (found) safeEnv[found] = process.env[found]; }
  const home = join(output, 'home'); await mkdir(home);
  Object.assign(safeEnv, { HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, COSMOS_PREFLIGHT_RESULTS: output, COSMOS_KEEP_EVIDENCE: '1' });
  if (process.platform === 'win32') Object.assign(safeEnv, { HOMEDRIVE: home.slice(0, 2), HOMEPATH: home.slice(2) });
  if (process.env.LOCALAPPDATA) safeEnv.PLAYWRIGHT_BROWSERS_PATH = resolve(process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.LOCALAPPDATA, 'ms-playwright'));
  if (process.env.COSMOS_TEMPLATE_ROOT) safeEnv.COSMOS_TEMPLATE_ROOT = resolve(process.env.COSMOS_TEMPLATE_ROOT);
  console.log(`SOURCE only; synthetic transport; results: ${output}`);
  const child = await command(process.execPath, [self, '--worker'], { env: safeEnv, stdio: 'inherit' });
  process.exitCode = child.code ?? 1;
} else if (process.argv.length === 3 && process.argv[2] === '--worker') await worker();
else { console.error('This fixed SOURCE runner accepts no run, ledger, controller or provider arguments.'); process.exitCode = 1; }
