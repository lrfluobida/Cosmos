import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { regularFile } from '../../src/artifacts/paths.ts';
import { runCli } from '../../src/cli/index.ts';
import type { ProductHost } from '../../src/cli/session.ts';
import { readPublicFundingIntent, reservePublicValidationFunding, settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { validateFundingAuthorization } from '../../src/runtime/public-validation-funding-validation.ts';

const usage = 'Usage: validation.ts new <run-dir> --shared-root <original-ledger> --authorization <decision.json> | resume <run-dir> | settle <run-dir>';
/** Operator accounting wrapper. All interviews, stdin confirmations and generation use the original public CLI. */
export async function runPublicValidationCli(args: string[], io: { input?: Readable; output?: Writable; host?: ProductHost } = {}) {
  const [command, path, ...options] = args;
  if (!path || !['new', 'resume', 'settle'].includes(command)) throw new Error(usage);
  const root = resolve(path);
  if (command === 'new') {
    const parsed = new Map<string, string>();
    for (let index = 0; index < options.length; index += 2) {
      if (!['--shared-root', '--authorization'].includes(options[index]) || !options[index + 1] || parsed.has(options[index])) throw new Error(usage);
      parsed.set(options[index], options[index + 1]);
    }
    if (parsed.size !== 2) throw new Error(usage);
    const sourcePath = resolve(parsed.get('--authorization')!), raw = await regularFile(dirname(sourcePath), basename(sourcePath));
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); validateFundingAuthorization(payload);
    const binding = await reservePublicValidationFunding({ sharedRoot: resolve(parsed.get('--shared-root')!), runRoot: root,
      authorization: { artifactId: 'public-funding-authorization', version: payload.fundingId, location: sourcePath } });
    const saved = await lstat(resolve(root, 'snapshot.json')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (saved) return runCli(['resume', root], io);
    const selection = payload.formatVersion === 'public-validation-authorization/2'
      ? ['--requirements-from', payload.requirementsSource.root, '--requirements-revision', String(payload.requirementsSource.revision)] : ['--brief', payload.brief];
    return runCli(['new', root, ...selection, '--max-cny', (payload.limits.limitMicroCny / 1_000_000).toFixed(6),
      '--max-minutes', String(payload.limits.durationMs / 60_000), '--render-frames', String(payload.renderFrames)], { ...io, funding: binding });
  }
  if (options.length) throw new Error(usage);
  const intent = await readPublicFundingIntent(root);
  if (!intent) throw new Error('Public funding intent is required.');
  if (command === 'resume') return runCli(['resume', root], io);
  const result = await settlePublicValidationFunding({ sharedRoot: intent.binding.sharedRoot, runRoot: root, fundingId: intent.binding.fundingId });
  (io.output ?? process.stdout).write(JSON.stringify(result, null, 2) + '\n'); return result;
}

const invoked = process.argv[1] ? await realpath(process.argv[1]).catch(() => resolve(process.argv[1])) : undefined;
if (invoked && import.meta.url === pathToFileURL(invoked).href) runPublicValidationCli(process.argv.slice(2)).catch(error => {
  console.error(`public validation: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1;
});
