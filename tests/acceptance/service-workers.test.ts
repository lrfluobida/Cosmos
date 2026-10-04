import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { BrowserContext } from '@playwright/test';
import * as api from '../../src/acceptance/persistent.ts';

test('persistent context installs the pinned registration blocker for each document before page scripts', async () => {
  assert.equal(typeof api.blockPersistentServiceWorkers, 'function');
  const scripts: unknown[] = [];
  const context: Pick<BrowserContext, 'addInitScript'> = { async addInitScript(script) {
    scripts.push(script); return { async dispose() {}, async [Symbol.asyncDispose]() {} };
  } };
  await api.blockPersistentServiceWorkers(context);
  assert.equal(scripts.length, 1); assert.equal(typeof scripts[0], 'string');
  for (const document of ['parent', 'child-frame', 'reopened-parent']) {
    let registered = false; const warnings: string[] = [];
    const navigator = { serviceWorker: { register: async () => { registered = true; return { document }; } } };
    runInNewContext(scripts[0] as string, { navigator, console: { warn: (message: string) => warnings.push(message) } });
    assert.equal(await navigator.serviceWorker.register(), undefined); assert.equal(registered, false, document);
    assert.deepEqual(warnings, ['Service Worker registration blocked by Playwright']);
  }
  assert.doesNotThrow(() => runInNewContext(scripts[0] as string, { navigator: {} }));
  await assert.rejects(api.blockPersistentServiceWorkers({ addInitScript: async () => { throw new Error('init failed'); } }), /init failed/);
});
