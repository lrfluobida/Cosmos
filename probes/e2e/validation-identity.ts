import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { safePath } from '../../src/artifacts/paths.ts';
import { runChild } from './host.ts';
import { readValidationInput } from './validation-input.ts';

/** The expected SHA selects reviewed source; only actual Git and fixed file reads establish identity. */
export function createValidationIdentityReader(options: { repository: string; reviewedPlatformSha: string }) {
  const repository = resolve(options.repository), expectedHead = options.reviewedPlatformSha;
  if (!/^[a-f0-9]{40}$/.test(expectedHead)) throw new Error('Validation identity requires an exact reviewed SHA.');
  return async (signal: AbortSignal): Promise<{ reviewedPlatformSha: string; frozenCaseInputHash: string }> => {
    const deadline = performance.now() + 5000, combined = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    const remaining = () => {
      combined.throwIfAborted(); const left = Math.ceil(deadline - performance.now());
      if (left <= 0) throw new Error('Validation identity check timed out.'); return left;
    };
    remaining();
    const root = await realpath(await safePath(repository));
    const git = async (...args: string[]) => {
      const result = await runChild('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', ...args],
        { cwd: root, signal: combined, timeoutMs: remaining() });
      remaining();
      if (result.code !== 0) throw new Error('Validation identity Git check failed.');
      return result.stdout.trim();
    };
    const top = await realpath(await git('rev-parse', '--show-toplevel'));
    if (top !== root) throw new Error('Validation identity requires the exact repository root.');
    const inspect = async () => {
      const branch = await git('symbolic-ref', '--quiet', '--short', 'HEAD');
      const head = await git('rev-parse', 'HEAD');
      const index = await git('ls-files', '-v', '-z');
      if (index.split('\0').some(entry => /^[a-zS] /.test(entry))) throw new Error('Validation identity rejects assume-unchanged or skip-worktree index flags.');
      const status = await git('status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none');
      if (branch !== 'main' || head !== expectedHead || status) throw new Error('Validation identity requires the reviewed HEAD on clean main, including untracked source.');
      return { branch, head, status };
    };
    const before = await inspect();
    const input = await readValidationInput(root); remaining();
    const after = await inspect();
    if (before.head !== after.head || before.branch !== after.branch || before.status !== after.status) throw new Error('Validation source identity changed during inspection.');
    remaining();
    return Object.freeze({ reviewedPlatformSha: after.head, frozenCaseInputHash: createHash('sha256').update(JSON.stringify(input.manifest)).digest('hex') });
  };
}
