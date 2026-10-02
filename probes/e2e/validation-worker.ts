import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareToolchain, buildProject } from './host.ts';
import { renderMedia } from './media.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { filteredChildEnvironment } from './admission.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { safePath, within } from '../../src/artifacts/paths.ts';

/** Only the trusted parent creates jobs; the worker has no controller, ledger writer or model credentials. */
export async function runValidationWorker(path: string): Promise<void> {
  const job = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))), signal = new AbortController().signal;
  if (job?.formatVersion !== 'validation-worker-1' || !['bootstrap', 'build', 'media', 'acceptance'].includes(job.operation)
    || !within(resolve(job.root), resolve(job.response)) || resolve(job.root) === resolve(job.response)) throw new Error('Invalid fixed validation worker job.');
  await safePath(job.root); await safePath(job.repository);
  let result: unknown;
  if (job.operation === 'bootstrap') result = await prepareToolchain(job.repository, job.root, signal);
  else if (job.operation === 'build') {
    if (!within(job.root, job.project)) throw new Error('Build project is outside this case.');
    result = await buildProject(job.root, job.project, join(job.root, 'toolchain'), job.name, signal);
  } else if (job.operation === 'media') result = await renderMedia(job.root, job.folder, job.value, signal);
  else result = await runAcceptance(job.plan, { evidenceRoot: join(job.root, 'browser-evidence'), channel: 'msedge', timeoutMs: job.timeoutMs, env: filteredChildEnvironment(process.env) });
  await publishReceipt(job.response, { formatVersion: 'validation-worker-result-1', operation: job.operation, outcome: 'completed', result });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('Fixed validation worker requires one host-created job path.');
  runValidationWorker(fileURLToPath(pathToFileURL(resolve(process.argv[2])))).catch(() => { process.stderr.write('Fixed validation worker failed; inspect preserved host evidence.\n'); process.exitCode = 1; });
}
