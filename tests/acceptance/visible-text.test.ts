import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { observe } from '../../src/acceptance/browser.ts';

test('text observation requires Playwright visibility in a dedicated Edge fixture', { timeout: 15_000 }, async (t) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 5000 });
  try {
    const page = await browser.newPage();
    console.log(`Text observation fixture: Edge ${browser.version()}, headless=true`);
    await t.test('hidden victory text is rejected within the supplied timeout', async () => {
      await page.setContent('<button>Play</button><p id="result" style="display:none">victory</p>');
      assert.equal(await page.locator('#result').isVisible(), false);
      await assert.rejects(observe(page, { kind: 'text', selector: '#result' }, 150), { name: 'TimeoutError' });
    });
    await t.test('visible text is read without changing Chinese content', async () => {
      await page.setContent('<p id="result">状态：victory</p>');
      assert.equal(await observe(page, { kind: 'text', selector: '#result' }, 1000), '状态：victory');
    });
    await t.test('pending text observation resolves after normal button input reveals it', async () => {
      await page.setContent('<button id="show" onclick="document.querySelector(\'#result\').hidden = false">显示结果</button><p id="result" hidden>victory</p>');
      assert.equal(await page.locator('#result').isVisible(), false);
      const waiting = observe(page, { kind: 'text', selector: '#result' }, 1000);
      await page.getByRole('button', { name: '显示结果' }).click({ timeout: 1000 });
      assert.equal(await waiting, 'victory');
      assert.equal(await page.locator('#result').isVisible(), true);
    });
  } finally { await browser.close(); }
});
