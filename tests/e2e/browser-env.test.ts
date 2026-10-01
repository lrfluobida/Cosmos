import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { filteredChildEnvironment } from '../../probes/e2e/admission.ts';
import { createPilotAcceptance } from '../../probes/e2e/acceptance.ts';

test('acceptance browser launch gets the pilot allowlist without credentials/preload or environment logging', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-pilot-browser-env-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const launch = t.mock.method(chromium, 'launchServer', async () => { throw new Error('Intentional test launch stop'); });
  const environment = filteredChildEnvironment({
    PATH: 'sentinel-allowed-path', SystemRoot: 'sentinel-system-root', TEMP: 'sentinel-temp',
    DEEPSEEK_API_KEY: 'sentinel-model-key-never-log', NODE_OPTIONS: '--require sentinel-preload-never-log.js',
  });
  const plan = createPilotAcceptance({ artifactId: 'fixture', version: 'v1', location: 'fixture/project' }, 'http://127.0.0.1:4173', 'env-test', 'env-test');
  const report = await runAcceptance(plan, { evidenceRoot: root, channel: 'msedge', env: environment });
  assert.equal(launch.mock.callCount(), 1);
  const options = launch.mock.calls[0].arguments[0];
  assert.ok(options?.env, 'An explicit environment is required to prevent process.env inheritance');
  assert.equal(options.env.DEEPSEEK_API_KEY, undefined); assert.equal(options.env.NODE_OPTIONS, undefined);
  assert.deepEqual(options.env, { PATH: 'sentinel-allowed-path', SystemRoot: 'sentinel-system-root', TEMP: 'sentinel-temp' });
  assert.equal(options.channel, 'msedge');
  for (const file of report.files) {
    assert.doesNotMatch(await readFile(join(root, file), 'utf8'), /sentinel-(?:model-key|preload|allowed-path|system-root|temp)/);
  }
});
