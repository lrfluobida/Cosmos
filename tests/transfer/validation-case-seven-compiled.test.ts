import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, symlink, stat, cp } from 'node:fs/promises';
import { join, resolve, sep, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { caseSevenFeeData } from './validation-case-seven.fixture.ts';
test('compiled C7 binds its actual JS closure, rejects unknown for free and selects its actual JS worker', async t => {
  const platform = fileURLToPath(new URL('../../', import.meta.url)), root = await mkdtemp(join(tmpdir(), 'cos60-compiled-'));
  t.diagnostic(`SOURCE/TEMP compiled C7 proof at ${root}`);
  await promisify(execFile)(process.execPath, [join(platform, 'node_modules/typescript/bin/tsc'), '--outDir', root, '--rootDir', platform,
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck', '--types', 'node', '--rewriteRelativeImportExtensions',
    'probes/transfer/validation-case-seven-run.ts', 'probes/e2e/validation-worker.ts', 'src/runtime/coding-check-worker.ts', 'src/acceptance/process.ts'], { cwd: platform });
  await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8'); await writeFile(join(root, 'package-lock.json'), await readFile(join(platform, 'package-lock.json')));
  const template = join(platform, 'templates/2d'); await mkdir(join(root, 'templates/2d'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'templates/2d', name), await readFile(join(template, name)));
  await symlink(join(template, 'node_modules'), join(root, 'templates/2d/node_modules'), 'junction');
  await mkdir(join(root, 'node_modules/@earendil-works'), { recursive: true }); await mkdir(join(root, 'node_modules/@playwright'), { recursive: true });
  for (const name of ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', 'typebox']) await symlink(join(platform, 'node_modules', name), join(root, 'node_modules', name), 'junction');
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) await cp(join(platform, 'node_modules', name), join(root, 'node_modules', name), { recursive: true });
  const sourceOriginal = await import('../../probes/transfer/validation-case-seven-source.ts'), originalClosure = await sourceOriginal.captureTransferCaseSevenSource();
  for (const file of originalClosure.files) { const destination = join(root, relative(platform, file.path)); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, await readFile(file.path)); }
  await writeFile(join(root, 'SOURCE-fees.json'), JSON.stringify(caseSevenFeeData()), 'utf8');
  const helper = join(root, 'SOURCE-compiled-boundary.ts'); await cp(fileURLToPath(new URL('./validation-case-seven-compiled.fixture.ts', import.meta.url)), helper);
  const result = await promisify(execFile)(process.execPath, ['--experimental-strip-types', helper, root, template], { cwd: root });
  assert.match(result.stdout, /mutation guards PASS/); t.diagnostic(result.stdout.trim());
});
