// Regression tests for the round-3 feature work:
//   1. Two new touch gestures: double-tap zoom + long-press (tap-hold)
//   2. GPU buffer freeing when a layer is removed
//
// Gesture contract (Leaflet parity):
//   - Double-tap on the map zooms in one level (and a single tap must NOT zoom).
//   - Pressing and holding one finger (~500ms+) without moving fires a
//     'contextmenu' map event (Leaflet's tap-hold behavior) with a latlng;
//     a short tap or a drag must not fire it. We also listen for a literal
//     'longpress' event and accept either, since both names appear in the wild.
//
// GPU buffer contract:
//   - Every GPU buffer allocated for a layer must be released (gl.deleteBuffer)
//     after layer.remove(), so repeated add/remove cycles do not accumulate
//     leaked buffers.
//
// Touch events are dispatched synthetically onto the canvas (same technique
// the mouse-event specs use) so the tests are deterministic in headless CI.

import { test, expect } from '@playwright/test';
import { waitForMap, tryGC } from '../helpers/map-driver';

interface Pt {
  x: number;
  y: number;
}

async function canvasCenter(page: import('@playwright/test').Page): Promise<Pt> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Dispatch a synthetic TouchEvent at the given client coordinates. */
async function dispatchTouch(
  page: import('@playwright/test').Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  pt: Pt,
  identifier = 1
): Promise<void> {
  await page.evaluate(
    ({ type, pt, identifier }) => {
      const canvas = document.querySelector('canvas')!;
      const touch = new Touch({
        identifier,
        target: canvas,
        clientX: pt.x,
        clientY: pt.y,
        pageX: pt.x,
        pageY: pt.y,
        radiusX: 2,
        radiusY: 2,
        rotationAngle: 0,
        force: 1,
      });
      const touches = type === 'touchend' ? [] : [touch];
      const targetTouches = touches;
      const changedTouches = [touch];
      canvas.dispatchEvent(
        new TouchEvent(type, {
          touches,
          targetTouches,
          changedTouches,
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    },
    { type, pt, identifier }
  );
}

/** Install GL call counters BEFORE any page script creates a WebGL context. */
async function installGlCounters(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const glStats = {
      createBuffer: 0,
      deleteBuffer: 0,
    };
    (window as any).__glStats = glStats;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
      const ctx: any = orig.call(this, type, ...rest);
      if (!ctx || !String(type).includes('webgl')) return ctx;
      if ((ctx as any).__rustyleafInstrumented) return ctx;
      Object.defineProperty(ctx, '__rustyleafInstrumented', { value: true });
      for (const key of ['createBuffer', 'deleteBuffer'] as const) {
        const fn = ctx[key].bind(ctx);
        ctx[key] = (...args: any[]) => {
          glStats[key]++;
          return fn(...args);
        };
      }
      return ctx;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

async function glStats(page: import('@playwright/test').Page): Promise<{ createBuffer: number; deleteBuffer: number }> {
  return page.evaluate(() => ({
    createBuffer: (window as any).__glStats?.createBuffer ?? 0,
    deleteBuffer: (window as any).__glStats?.deleteBuffer ?? 0,
  }));
}

/**
 * Poll GL stats until at least one deleteBuffer fires past `baseline`
 * (deferred cleanups can lag the remove() call), giving GC a nudge each pass.
 */
async function waitForBufferDeletion(
  page: import('@playwright/test').Page,
  baseline: { createBuffer: number; deleteBuffer: number },
  timeoutMs = 10_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await glStats(page);
    if (s.deleteBuffer - baseline.deleteBuffer > 0) return true;
    await tryGC(page);
    await page.waitForTimeout(250);
  }
  return false;
}

test.describe('new touch gestures (double-tap zoom, long-press)', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/fixtures/_smoke.html');
    await waitForMap(page);
    // Let a few frames render so any lazy init settles before we interact.
    await page.waitForTimeout(500);
  });

  test('double-tap zooms in one level; single tap does not', async ({ page }) => {
    const zoomBefore = await page.evaluate(() => (window as any).__map.getZoom());
    const c = await canvasCenter(page);

    // Negative control: one quick tap must NOT change the zoom.
    await dispatchTouch(page, 'touchstart', c);
    await dispatchTouch(page, 'touchend', c);
    await page.waitForTimeout(450); // longer than any sane double-tap window
    const zoomAfterSingleTap = await page.evaluate(() => (window as any).__map.getZoom());
    expect(
      Math.abs(zoomAfterSingleTap - zoomBefore),
      'single tap must not zoom'
    ).toBeLessThan(0.25);

    // Double-tap: two taps well inside the detection window.
    await dispatchTouch(page, 'touchstart', c);
    await dispatchTouch(page, 'touchend', c);
    await page.waitForTimeout(80);
    await dispatchTouch(page, 'touchstart', c);
    await dispatchTouch(page, 'touchend', c);

    // Wait out the zoom animation.
    await page.waitForTimeout(1200);
    const zoomAfterDoubleTap = await page.evaluate(() => (window as any).__map.getZoom());

    console.log(`zoom: before=${zoomBefore.toFixed(2)} afterSingle=${zoomAfterSingleTap.toFixed(2)} afterDoubleTap=${zoomAfterDoubleTap.toFixed(2)}`);
    const delta = zoomAfterDoubleTap - zoomBefore;
    expect(delta, `double-tap should zoom in ~1 level (got delta=${delta.toFixed(2)})`).toBeGreaterThan(0.5);
    expect(delta, `double-tap should zoom in ~1 level (got delta=${delta.toFixed(2)})`).toBeLessThan(2.0);
  });

  test('long-press fires tap-hold event once with latlng; moves and short taps do not', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.__tapHoldEvents = [];
      const record = (e: any) =>
        w.__tapHoldEvents.push({
          type: e.type,
          latlng: e.latlng ? Array.isArray(e.latlng) ? [...e.latlng] : { ...e.latlng } : null,
        });
      w.__map.on('contextmenu', record);
      // Some implementations expose a dedicated gesture name instead of
      // Leaflet's 'contextmenu' convention — accept either.
      try { w.__map.on('longpress', record); } catch {}
    });

    const c = await canvasCenter(page);

    // 1. Short tap: must NOT trigger tap-hold.
    await dispatchTouch(page, 'touchstart', c);
    await dispatchTouch(page, 'touchend', c);
    await page.waitForTimeout(400);

    // 2. Drag (press + move + release): must NOT trigger tap-hold.
    await dispatchTouch(page, 'touchstart', c);
    for (let i = 1; i <= 4; i++) {
      await dispatchTouch(page, 'touchmove', { x: c.x + i * 15, y: c.y });
      await page.waitForTimeout(30);
    }
    await dispatchTouch(page, 'touchend', { x: c.x + 60, y: c.y });
    await page.waitForTimeout(400);

    let events = await page.evaluate(() => (window as any).__tapHoldEvents);
    expect(events.length, `short tap and drag must not fire tap-hold (got ${JSON.stringify(events)})`).toBe(0);

    // 3. Genuine long-press: hold past the ~500ms threshold without moving.
    await dispatchTouch(page, 'touchstart', c);
    await page.waitForTimeout(900);
    await dispatchTouch(page, 'touchend', c);
    await page.waitForTimeout(400);

    events = await page.evaluate(() => (window as any).__tapHoldEvents);
    expect(
      events.length,
      `long-press must fire exactly one tap-hold event (got ${JSON.stringify(events)})`
    ).toBe(1);
    expect(events[0].latlng, 'tap-hold event should carry a latlng').toBeTruthy();

    // 4. Holding again must fire again (not swallowed after first fire).
    await dispatchTouch(page, 'touchstart', c);
    await page.waitForTimeout(900);
    await dispatchTouch(page, 'touchend', c);
    await page.waitForTimeout(400);

    events = await page.evaluate(() => (window as any).__tapHoldEvents);
    expect(events.length).toBe(2);
  });
});

test.describe('GPU buffer freeing on layer remove', () => {
  test.beforeEach(async ({ page }) => {
    await installGlCounters(page);
    await page.goto('/e2e/fixtures/_smoke.html');
    await waitForMap(page);
    await page.waitForTimeout(500);

    // Warm-up: add + remove one throwaway layer so any one-time lazy
    // allocations (shared/global buffers) land BEFORE our baseline. The
    // assertion then measures only per-layer steady-state behavior.
    await page.evaluate(() => {
      const w = window as any;
      const warmup = new w.R.PointLayer();
      warmup.add([{ lat: 48.85, lng: 2.35, size: 2, color: '#ffffff', meta: null }]);
      warmup.addTo(w.__map);
      setTimeout(() => warmup.remove(), 800);
    });
    await page.waitForTimeout(1500);
    await tryGC(page);
    await page.waitForTimeout(500);
  });

  test('removing point layers releases their GPU buffers', async ({ page }) => {
    const N_POINTS = 20_000;
    const baseline = await glStats(page);
    await page.evaluate((n) => {
      const w = window as any;
      w.__gpuTestLayers = [];
      for (let l = 0; l < 3; l++) {
        const pts = [];
        for (let i = 0; i < n; i++) {
          pts.push({
            lat: 48.7 + Math.random() * 0.3,
            lng: 2.15 + Math.random() * 0.4,
            size: 4,
            color: '#ff0000',
            meta: null,
          });
        }
        const layer = new w.R.PointLayer();
        layer.add(pts);
        layer.addTo(w.__map);
        w.__gpuTestLayers.push(layer);
      }
    }, N_POINTS);

    // Give the renderer time to upload buffers and render a few frames.
    await page.waitForTimeout(2000);

    const afterAdd = await glStats(page);
    const created = afterAdd.createBuffer - baseline.createBuffer;
    console.log(`GL buffers created for layers: ${created}`);

    // Sanity: adding layers must actually allocate GPU buffers.
    expect(created, 'adding layers must allocate GPU buffers').toBeGreaterThan(0);

    // Remove all three layers.
    await page.evaluate(() => {
      const w = window as any;
      for (const layer of w.__gpuTestLayers) layer.remove();
      w.__gpuTestLayers = [];
    });

    // Allow deferred cleanup + GC to run; wait until deletes actually land.
    const sawDelete = await waitForBufferDeletion(page, baseline);
    await tryGC(page);
    await page.waitForTimeout(500);

    const afterRemove = await glStats(page);
    const deleted = afterRemove.deleteBuffer - baseline.deleteBuffer;
    const residualLeak =
      afterRemove.createBuffer - afterRemove.deleteBuffer -
      (baseline.createBuffer - baseline.deleteBuffer);

    console.log(
      `GL buffers: created=${afterRemove.createBuffer} deleted=${afterRemove.deleteBuffer} ` +
      `(delta after test: +${created} created, ${deleted} deleted, residual leak=${residualLeak})`
    );

    expect(deleted, 'layer.remove() must free GPU buffers (deleteBuffer never fired)').toBeGreaterThan(0);
    // Small slack allowed for persistent shared/global resources (e.g. an
    // atlas or program-lifetime buffer allocated lazily during the first
    // layer add). Anything growing with layer count is a real leak.
    expect(
      residualLeak,
      `${residualLeak} buffers leaked across 3 layer additions/removals`
    ).toBeLessThanOrEqual(2);
  });

  test('repeated add/remove cycles do not accumulate buffer leaks', async ({ page }) => {
    const CYCLES = 5;
    const N_POINTS = 10_000;

    // Warm-up cycle (excluded from the leak accounting) so one-time lazy
    // allocations don't count against the per-cycle steady-state.
    await page.evaluate((n) => {
      const w = window as any;
      const pts = [];
      for (let i = 0; i < n; i++) {
        pts.push({ lat: 48.85, lng: 2.35, size: 2, color: '#ffffff', meta: null });
      }
      const layer = new w.R.PointLayer();
      layer.add(pts);
      layer.addTo(w.__map);
      setTimeout(() => layer.remove(), 800);
    }, N_POINTS);
    await page.waitForTimeout(1500);
    await tryGC(page);

    const baseline = await glStats(page);

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      await page.evaluate((n) => {
        const w = window as any;
        const pts = [];
        for (let i = 0; i < n; i++) {
          pts.push({
            lat: 48.75 + Math.random() * 0.2,
            lng: 2.2 + Math.random() * 0.3,
            size: 4,
            color: '#00ff00',
            meta: null,
          });
        }
        const layer = new w.R.PointLayer();
        layer.add(pts);
        layer.addTo(w.__map);
        w.__cycleLayer = layer;
      }, N_POINTS);

      await page.waitForTimeout(600);

      await page.evaluate(() => {
        (window as any).__cycleLayer.remove();
        (window as any).__cycleLayer = null;
      });

      await tryGC(page);
      await page.waitForTimeout(300);
    }

    // Final settle so any last deferred deletions land.
    const sawDelete = await waitForBufferDeletion(page, baseline);
    if (sawDelete) console.log('deferred buffer deletions observed during cycles test');
    await tryGC(page);
    await page.waitForTimeout(500);

    const end = await glStats(page);
    const leakPerCycle =
      (end.createBuffer - end.deleteBuffer) - (baseline.createBuffer - baseline.deleteBuffer);

    console.log(
      `cycles=${CYCLES}: total created=${end.createBuffer}, deleted=${end.deleteBuffer}, ` +
      `net growth=${leakPerCycle} buffers over ${CYCLES} cycles`
    );

    expect(
      leakPerCycle,
      `net buffer growth of ${leakPerCycle} over ${CYCLES} add/remove cycles indicates a leak`
    ).toBeLessThanOrEqual(2);
  });

  test('removing a GeoJSON layer releases its GPU buffers', async ({ page }) => {
    const baseline = await glStats(page);

    await page.evaluate(() => {
      const w = window as any;
      // Polygon features exercise the layer-owned polygon+line GPU buffers
      // (points share the global per-frame point_buffer, which is never
      // create_buffer'd per layer).
      const features = [];
      for (let i = 0; i < 200; i++) {
        const cx = 2.2 + Math.random() * 0.3;
        const cy = 48.75 + Math.random() * 0.2;
        const r = 0.005;
        const ring = [];
        for (let k = 0; k < 8; k++) {
          ring.push([cx + r * Math.cos((k / 8) * 2 * Math.PI), cy + r * Math.sin((k / 8) * 2 * Math.PI)]);
        }
        ring.push(ring[0]);
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { id: i },
        });
      }
      const gj = new w.R.GeoJSONLayer(null, { pointColor: '#0000ff', pointSize: 5 });
      gj.addTo(w.__map);
      gj.loadData({ type: 'FeatureCollection', features });
      w.__gjLayer = gj;
    });

    await page.waitForTimeout(2000);

    const afterAdd = await glStats(page);
    expect(afterAdd.createBuffer - baseline.createBuffer).toBeGreaterThan(0);

    await page.evaluate(() => {
      (window as any).__gjLayer.remove();
      (window as any).__gjLayer = null;
    });

    // Wait for any deferred cleanup to actually fire.
    const sawDelete = await waitForBufferDeletion(page, baseline);
    if (!sawDelete) {
      expect(sawDelete, 'GeoJSON layer.remove() must free GPU buffers (deleteBuffer never fired)').toBe(true);
    }
    await tryGC(page);
    await page.waitForTimeout(500);

    const afterRemove = await glStats(page);
    const residualLeak =
      afterRemove.createBuffer - afterRemove.deleteBuffer -
      (baseline.createBuffer - baseline.deleteBuffer);

    console.log(`geojson remove: residual leak=${residualLeak}`);
    expect(residualLeak, `${residualLeak} buffers leaked after GeoJSON layer remove()`).toBeLessThanOrEqual(2);
  });
});
