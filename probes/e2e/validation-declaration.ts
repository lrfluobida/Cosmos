import { freeze } from '../../src/roles/requirements.ts';

const caseId = 'cos20-native-validation-4';
/** A source-reviewed declaration; importing or parsing it never grants execution authority. */
export const VALIDATION_CASE = freeze({
  formatVersion: 'validation-declaration-2', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
  limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000,
    durationMs: 45 * 60 * 1000, maxRequests: 80, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 2_000_000 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 1_900_000 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 5_700_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 7_600_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 3_800_000 },
  },
  outputTokens: { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 },
  inputs: {
    requirements: { version: 'cos10-pilot-v2', path: 'probes/e2e/requirements.json', sha256: 'acffdb97c36ffb3c4718c82a365eaedc6bc3a73447db2aa9357548c2c30a9b39' },
    template: { sha256: 'd6dfe213c0b57c41e0be90bc017705b7de9316dd54c58e611affc9fb376c7025', files: [
      { path: 'templates/2d/.gitignore', sha256: 'e8bc935ce727f1809c792f4c5d26c5fc75ba2b7df7fc9390c56c8892f6a6007f' },
      { path: 'templates/2d/README.md', sha256: 'feb28e727bafb348e6ec7c9c1db273ea31ccc7597e30bfde6d66778fde6b0ee1' },
      { path: 'templates/2d/index.html', sha256: 'b0097ed0a9b71418c3d42b1148f7916bbeaeee31e25bcbb068381f5caccfc9b3' },
      { path: 'templates/2d/package-lock.json', sha256: '00f5933e6e13e44b6e718d91dfe3fe611a0c1cd551beec31c6ed1aee13fc1d6d' },
      { path: 'templates/2d/package.json', sha256: '8aab2571684f8decbe4f508bafd73567b6079e7b1dd864cf4da74c0a948a02b0' },
      { path: 'templates/2d/src/main.ts', sha256: '7772dab13e1e4f3eaa97b8f18e51a23e0801de5817fcd96430147d15b5c3fa3d' },
      { path: 'templates/2d/tsconfig.json', sha256: '4b7fc79c5060f1da4bca27ebd267e4c173ead0e007761ac3a0497d907d44d282' },
      { path: 'templates/2d/vite.config.ts', sha256: '22e3894704e1e6a87598dbe997ce100357e570d3f7fd7f4a47d46626683fece9' },
    ] },
  },
} as const);
export type ValidationDeclaration = typeof VALIDATION_CASE;
export interface ValidationEntryIntent { caseId: string; reviewedPlatformSha: string; preflightOnly: boolean; operatorSource: string | null; intentOnly: true }

/** Strict arguments for the future audited entry; no arbitrary case/root/clock/reset knobs. */
export function parseValidationEntry(args: string[]): ValidationEntryIntent {
  const [command, reviewedPlatformSha, operatorSource] = args, preflightOnly = command === '--validation-preflight';
  if (!['--validation-preflight', '--validation-case'].includes(command) || !/^[a-f0-9]{40}$/.test(reviewedPlatformSha ?? '')
    || (preflightOnly ? args.length !== 2 : args.length !== 3 || !operatorSource?.trim() || operatorSource.length > 2000 || /[\x00-\x1f\x7f]/.test(operatorSource))) {
    throw new Error('Usage: --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>');
  }
  return { caseId, reviewedPlatformSha, preflightOnly, operatorSource: preflightOnly ? null : operatorSource, intentOnly: true };
}
