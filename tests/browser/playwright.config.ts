import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  outputDir: '../../.cosmos/browser-results',
  reporter: [['list'], ['json', { outputFile: '../../.cosmos/browser-report.json' }]],
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    headless: process.env.COSMOS_HEADED !== '1',
    screenshot: 'only-on-failure',
  },
});
