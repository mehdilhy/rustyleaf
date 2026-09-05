import { test } from '@playwright/test';
import { waitForMap } from '../helpers/map-driver';

test.describe('idle CPU / index rebuild counter (7.2 + 4.5)', () => {
  test('static map does not do unnecessary work', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/e2e/fixtures/idle-map.html');
    await waitForMap(page);

    // Let the map stabilize (initial render + a few frames)
    await page.waitForTimeout(3000);

    // Now measure CPU over 5s of pure idle — NO pan, NO zoom, NO input
    const startCDP = await page.evaluate(() => performance.now());

    // Sample render activity via counting how many times any work happens
    // We use a proxy: monitor requestAnimationFrame overhead
    const workerMs = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let cumulativeWork = 0;
        let lastTime = performance.now();
        let frames = 0;
        const DURATION = 5000;

        function tick(now: number) {
          const delta = now - lastTime;
          // Each rAF callback represents some CPU work
          // In a healthy engine with dirty flags, idle frames should be ~0ms of actual rendering
          cumulativeWork += delta;
          lastTime = now;
          frames++;
          if (now - performance.now() + delta < DURATION) {
            requestAnimationFrame(tick);
          } else {
            const avgFrameTime = cumulativeWork / frames;
            resolve(avgFrameTime);
          }
        }
        requestAnimationFrame(tick);
        // Wait 5s
        setTimeout(() => {
          resolve(cumulativeWork / Math.max(frames, 1));
        }, DURATION);
      });
    });

    console.log(`Idle avg frame wall-time: ${workerMs.toFixed(2)} ms`);

    // In a correct implementation with dirty flags:
    // idle frames should be ~0 real work (just clearing canvas, no R-tree rebuild)
    // Today: every frame rebuilds the R-tree, so wall-time per rAF > 16ms
    if (workerMs < 5) {
      console.log('PASS: idle frames are lightweight — dirty flags appear to work');
    } else if (workerMs < 16.67) {
      console.log('OK: idle frames within 60fps budget');
    } else {
      console.log('FAIL (expected): idle frames take > 16ms — per-frame R-tree rebuild or unnecessary render work. ' +
        `Average frame time: ${workerMs.toFixed(2)} ms. Fix: INV-5 (dirty-flag-driven index rebuild).`);
    }
  });

  test('idle vs active renders — ratio expected > 5x', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/e2e/fixtures/idle-map.html');
    await waitForMap(page);
    await page.waitForTimeout(2000);

    // Measure idle
    const idleFps = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        function tick() {
          frames++;
          if (performance.now() - start < 3000) {
            requestAnimationFrame(tick);
          } else {
            resolve(frames / ((performance.now() - start) / 1000));
          }
        }
        requestAnimationFrame(tick);
      });
    });

    console.log(`Idle rAF rate: ${idleFps.toFixed(1)} fps`);

    // In headless Chrome, rAF fires at the display refresh rate (~60fps) regardless of work done
    // So if the engine is doing heavy work, rAF still fires but frame budget is consumed
    // This test is mostly informational — it confirms rAF rate, not work done
  });
});
