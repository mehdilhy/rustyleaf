import { test, expect } from '@playwright/test';
import { waitForMap } from '../helpers/map-driver';

test.describe('multi-instance isolation (5.3)', () => {
  test('each map has distinct canvas elements', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/e2e/fixtures/two-maps.html');
    await waitForMap(page);

    const isolation = await page.evaluate(() => {
      const allCanvases = document.querySelectorAll('canvas');
      return {
        canvasCount: allCanvases.length,
        ids: Array.from(allCanvases).map(c => c.id),
        uniqueIds: new Set(Array.from(allCanvases).map(c => c.id)).size,
        inMapA: document.querySelector('#mapA canvas') !== null,
        inMapB: document.querySelector('#mapB canvas') !== null,
      };
    });

    console.log(JSON.stringify(isolation, null, 2));

    expect(isolation.canvasCount, 'Two map divs need two canvases').toBeGreaterThanOrEqual(2);
    expect(isolation.inMapA, 'Map A must have its own canvas').toBe(true);
    expect(isolation.inMapB, 'Map B must have its own canvas').toBe(true);
  });

  test('map B stays empty when only map A gets data', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/e2e/fixtures/two-maps.html');
    await waitForMap(page);

    // Probe using the public JS API — getFeatureCount on each map's GeoJSON layers
    const counts = await page.evaluate(() => {
      const a = (window as any).__mapA;
      const b = (window as any).__mapB;
      if (!a || !b) return { error: 'Maps not created' };

      // Use the public API: map A had a GeoJSON layer with data added
      // Map B was created without any layers
      // We check via the Map's internal layer tracking
      const aGeojsonCount = a._geojsonLayerCount || 0;
      const bGeojsonCount = b._geojsonLayerCount || 0;

      // Also check internal WASM layer arrays if accessible
      let wasmPointLayersA = 0;
      let wasmPointLayersB = 0;
      try {
        wasmPointLayersA = a.wasmMap?.__wbg_ptr ? 1 : 0;
        wasmPointLayersB = b.wasmMap?.__wbg_ptr ? 1 : 0;
      } catch {}

      return {
        aGeojsonLayers: aGeojsonCount,
        bGeojsonLayers: bGeojsonCount,
      };
    });

    console.log(JSON.stringify(counts, null, 2));

    // Map A has 1 GeoJSON layer, Map B has 0
    expect(counts.aGeojsonLayers, 'Map A must have its GeoJSON layer').toBeGreaterThan(0);
    expect(counts.bGeojsonLayers, 'Map B must NOT have Map A\'s layers').toBe(0);

    console.log('NOTE: This verifies JS-wrapper-level isolation. WASM-level cross-contamination ' +
      '(thread_local! TILE_TEXTURES + SPATIAL_INDEX) requires INV-1 fix + wasm-bindgen-test. ' +
      'See test catalog 5.3 for the hard version.');
  });

  test('both maps render independently (screenshot per map)', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/e2e/fixtures/two-maps.html');
    await waitForMap(page);
    await page.waitForTimeout(500);

    // Screenshot map A
    const canvasA = page.locator('#mapA canvas');
    await expect(canvasA).toBeVisible({ timeout: 5000 });
    await expect(canvasA).toHaveScreenshot('two-maps-A.png', {
      maxDiffPixelRatio: 0.03,
    });

    // Screenshot map B
    const canvasB = page.locator('#mapB canvas');
    await expect(canvasB).toBeVisible({ timeout: 5000 });
    await expect(canvasB).toHaveScreenshot('two-maps-B.png', {
      maxDiffPixelRatio: 0.03,
    });
  });
});
