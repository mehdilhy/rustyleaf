import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'report' }],
    ['json', { outputFile: 'results.json' }],
    ['list'],
  ],
  snapshotPathTemplate: '{testDir}/baselines/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:3333',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
        },
      },
    },
  ],
  webServer: {
    command: 'node --no-warnings e2e/serve.mjs',
    cwd: '..',
    port: 3333,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  outputDir: './artifacts',
});
