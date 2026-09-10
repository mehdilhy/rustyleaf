// Smoke-tests the shipped dist bundle in real Chromium:
// bundle must resolve ./rustyleaf_core_bg.js + fetch the wasm and boot a Map.
// Starts e2e/serve.mjs itself; run: npm run test:smoke
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const server = spawn(process.execPath, ['e2e/serve.mjs'], { stdio: 'ignore' });
await delay(1500);
let failed = false;
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  await page.goto('http://localhost:3333/e2e/fixtures/_size-smoke.html');
  await page.waitForFunction(() => window.__smoke !== undefined, null, { timeout: 30000 });
  const result = await page.evaluate(() => window.__smoke);
  console.log('SMOKE:', JSON.stringify(result));
  const fatal = errors.filter((e) => !/WebGL1|falling back|limited/i.test(e));
  if (!result.ok) {
    console.error('bundle smoke FAILED:', result.error);
    failed = true;
  } else if (fatal.length > 0) {
    console.error('bundle smoke page errors:', fatal.join('\n'));
    failed = true;
  } else {
    console.log('bundle smoke OK');
  }
  await browser.close();
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
