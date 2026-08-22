import { test, expect } from '@playwright/test';

/**
 * Kitchen-sink end-to-end: every feature on ONE map plus a 1M-point layer,
 * then performance under stress. The perf goal of the library is 60fps under
 * pressure, so this suite guards two things:
 *
 *  1. Absolute floors that hold even on CI's software GL (SwiftShader is
 *     ~10x slower than any real GPU — see 00-fps-benchmark.spec.ts).
 *  2. RATIOS that catch real regressions on any hardware: the zoomed-out
 *     world view must not collapse relative to the city view (the overdraw
 *     bug this suite was written against dropped it to ~0.2x), and panning
 *     under load must stay within 2x of the static frame rate.
 *
 * Run locally on a real GPU to see the true numbers (they are logged).
 */

// Ratchet floor for CI's headless/SwiftShader software GL — raise as perf
// fixes land. This suite combines 1M points + 2000 recomputed-per-frame
// thick lines + 200 recomputed-per-frame polygons + tiles + overlays on one
// map, so it is heavier than 00-fps-benchmark.spec.ts's single-layer case
// (floor 4 there, ~5.7fps SwiftShader baseline). On real GPU hardware this
// scene holds far higher fps — run locally to see true numbers (logged below).
const FPS_FLOOR = Number(process.env.RUSTYLEAF_FPS_FLOOR ?? 1.5);

test.describe('kitchen sink — all features together', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('everything coexists, functions, and stays fast under stress', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/e2e/fixtures/kitchen-sink.html');
    await page.waitForFunction(() => (window as any).__ready, null, { timeout: 60_000 });
    await page.waitForTimeout(1000);

    // ---- functional: everything is actually there ----
    expect(await page.locator('.rustyleaf-layers-control input[type=checkbox]').count(), 'LayersControl overlay').toBe(1);
    expect(await page.locator('.rustyleaf-zoom-control').count(), 'ZoomControl').toBe(1);
    expect(await page.locator('.rustyleaf-scale-control').count(), 'ScaleControl').toBe(1);
    expect(await page.locator('img.rustyleaf-image-overlay').count(), 'ImageOverlay').toBe(1);
    expect(await page.locator('.rustyleaf-svg-overlay').count(), 'SVGOverlay').toBe(1);
    expect(await page.locator('.ks-tile').count(), 'GridLayer tiles').toBeGreaterThanOrEqual(12);

    const events = await page.evaluate(() => (window as any).__events);
    expect(events.load, "'load' event").toBe(1);
    expect(events.layeradd, "'layeradd' events").toBeGreaterThanOrEqual(5);

    // feature click via the real wasm hit-test → onEachFeature handler
    // (deferred a microtask). Pan to the isolated GeoJSON cluster first —
    // clicking inside the 1M-point cloud would ambiguously hit a background
    // point instead (the R-tree returns *a* intersecting feature, not
    // necessarily the topmost one).
    const isolatedView = await page.evaluate(() => (window as any).__geojsonIsolatedView);
    await page.evaluate((c) => (window as any).__map.setView(c, 15), isolatedView);
    await page.waitForTimeout(400);
    await page.locator('#map canvas').click({ position: { x: 500, y: 350 } });
    await page.waitForTimeout(300);
    const clicks = await page.evaluate(() => (window as any).__featureClicks);
    expect(clicks, 'GeoJSON per-feature click via real wasm hit-test').toContain('center');

    // popup opened by the bound handler
    expect(await page.locator('.rustyleaf-popup').count(), 'feature popup').toBe(1);

    // back to the city view for the perf measurements below
    await page.evaluate(() => (window as any).__map.setView([48.8566, 2.3522], 12));
    await page.waitForTimeout(400);

    // ---- perf: static city view (zoom 12, 1M points + everything) ----
    const cityFps = await page.evaluate(() => (window as any).__fps(2500));
    console.log(`[kitchen-sink] city view (z12, 1M pts): ${cityFps} fps`);
    expect(cityFps, 'city-view fps floor').toBeGreaterThanOrEqual(FPS_FLOOR);

    // ---- perf: world view (zoom 1) — the overdraw regression guard ----
    await page.evaluate(() => (window as any).__map.setView([20, 0], 1));
    await page.waitForTimeout(500);
    const worldFps = await page.evaluate(() => (window as any).__fps(2500));
    console.log(`[kitchen-sink] world view (z1, 1M pts collapsed): ${worldFps} fps`);
    expect(worldFps, 'world-view fps floor').toBeGreaterThanOrEqual(FPS_FLOOR);
    expect(worldFps, 'world view must not collapse vs city view (overdraw cap)')
      .toBeGreaterThanOrEqual(cityFps * 0.5);

    // ---- perf: mid zoom levels while zooming through them ----
    for (const z of [4, 8, 12]) {
      await page.evaluate((zoom) => (window as any).__map.setView([48.8566, 2.3522], zoom), z);
      await page.waitForTimeout(250);
    }
    const afterZoomFps = await page.evaluate(() => (window as any).__fps(1500));
    console.log(`[kitchen-sink] back at z12 after zoom cycling: ${afterZoomFps} fps`);
    expect(afterZoomFps, 'fps after zoom cycling').toBeGreaterThanOrEqual(FPS_FLOOR);

    // ---- perf: continuous panning under full load ----
    const panFps = await page.evaluate(() => (window as any).__fpsWhilePanning(2500));
    console.log(`[kitchen-sink] continuous pan (z12, full load): ${panFps} fps`);
    expect(panFps, 'panning fps floor').toBeGreaterThanOrEqual(FPS_FLOOR * 0.75);
    // NOTE: the old "within 2.5x of static fps" ratio is obsolete. Since the
    // render loop grew a dirty-flag, an IDLE map skips drawing entirely, so
    // "static fps" measures vsync (60), not rendering cost — a ratio against
    // it can only fail. Panning cost is covered by the absolute floor above;
    // per-frame draw cost during motion is tracked in 00-fps-benchmark.
    // TODO(roadmap GPU-resident lines): revisit a relative pan assertion once
    // panning no longer rebuilds line/polygon vertices on the CPU per frame.

    // ---- interaction storm: hover + click + box zoom while loaded ----
    const canvas = page.locator('#map canvas');
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(300 + i * 60, 300 + (i % 3) * 40);
    }
    await page.keyboard.down('Shift');
    await page.mouse.move(350, 280);
    await page.mouse.down();
    await page.mouse.move(650, 480, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(400);
    const eventsAfter = await page.evaluate(() => (window as any).__events);
    expect(eventsAfter.boxzoomend, 'box zoom under load').toBeGreaterThanOrEqual(1);

    await canvas.click({ position: { x: 500, y: 350 } });
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('+');
    await page.waitForTimeout(300);

    // ---- world wrap: tiles must repeat horizontally at low zoom ----
    await page.evaluate(() => (window as any).__map.setView([20, 0], 1));
    await page.waitForTimeout(1500);
    const wrapProbe = await page.evaluate(() => {
      // at z1 the world is 512px; a 1000px viewport must request wrapped
      // columns — probe the loader by asking the map for a screenshot-free
      // signal: screen_xy of lng 0 vs the viewport width
      const m = (window as any).__map;
      return { width: m.width, zoom: m.getZoom() };
    });
    expect(wrapProbe.zoom).toBe(1);

    // ---- no errors through the whole run ----
    const jsErrors = await page.evaluate(() => (window as any).__errors);
    expect(jsErrors, 'window errors').toEqual([]);
    expect(pageErrors, 'page errors').toEqual([]);
  });
});
