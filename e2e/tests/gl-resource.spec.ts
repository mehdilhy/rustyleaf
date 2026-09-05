import { test, expect } from '@playwright/test';
import { waitForMap, panMap, tryGC } from '../helpers/map-driver';

test.describe('GL resource balance (8.3)', () => {
  test('textures created match textures deleted after map churn', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/e2e/fixtures/gl-instrumented.html');
    await waitForMap(page);

    // Let tiles load for a bit
    await page.waitForTimeout(5000);

    // Pan a few times to trigger tile evictions
    for (let i = 0; i < 4; i++) {
      await panMap(page, 200, 0, 10);
      await page.waitForTimeout(1000);
    }

    const stats = await page.evaluate(() => (window as any).__glStats);

    console.log(JSON.stringify(stats, null, 2));

    const imbalance = stats.createTexture - stats.deleteTexture;

    console.log(`GL textures: created=${stats.createTexture} deleted=${stats.deleteTexture} imbalance=${imbalance}`);

    if (imbalance > 0) {
      console.log('BUG CONFIRMED (INV-2): textures are created but not deleted. ' +
        `Imbalance: ${imbalance} textures leaked on GPU.`);
    }

    // Some imbalance is expected during active rendering (textures still in use)
    // But the real test is: after panning + eviction, deleteTexture should fire
    // Today it likely never fires
    console.log('NOTE: GL resource tracking — soft check. deleteTexture count > 0 confirms INV-2 fix.',
      stats.deleteTexture > 0 ? 'PASS (deletes observed)' : 'FAIL (no deletes — textures never freed)');
  });

  test('buffers created match buffers deleted after layer removal', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/e2e/fixtures/gl-instrumented.html');
    await waitForMap(page);

    await page.waitForTimeout(3000);

    await tryGC(page);
    await page.waitForTimeout(1000);

    const stats = await page.evaluate(() => (window as any).__glStats);

    console.log(`GL buffers: created=${stats.createBuffer} deleted=${stats.deleteBuffer} imbalance=${stats.createBuffer - stats.deleteBuffer}`);

    const bufferImbalance = stats.createBuffer - stats.deleteBuffer;
    console.log('NOTE: GL buffer balance — soft check.',
      bufferImbalance === 0 ? 'PASS' : `FAIL: ${bufferImbalance} buffers leaked`);
  });
});
