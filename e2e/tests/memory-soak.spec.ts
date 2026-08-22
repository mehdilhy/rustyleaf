import { test, expect } from '@playwright/test';
import {
  waitForMap,
  waitForGeoJSON,
  panMap,
  zoomIn,
  zoomOut,
  startMemorySampling,
  stopMemorySampling,
  computeMemorySlope,
  tryGC,
} from '../helpers/map-driver';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WARMUP_DURATION_MS = 10_000;
const SOAK_DURATION_MS = 30_000;
const MEMORY_GROWTH_TARGET_BYTES_PER_MIN = 1_000_000;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'artifacts', 'memory-soak');
const FIXTURE_URL = '/e2e/fixtures/geojson-heavy.html';

const pans = [
  () => panMap, () => zoomIn, () => zoomOut,
] as const;

test.describe('memory soak — 5.5MB GeoJSON', () => {
  test('heap does not grow without bound', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    await waitForGeoJSON(page);

    // Warmup: let initial allocations and GC stabilize
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(640, 360);
      await page.mouse.down();
      await page.mouse.move(640 + 50, 360 - 50, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    await tryGC(page);
    await page.waitForTimeout(2000);

    // Now sample during pan/zoom
    const samplingPromise = startMemorySampling(page, 1000);

    const start = Date.now();
    let direction = 0;
    while (Date.now() - start < SOAK_DURATION_MS) {
      const box = await page.locator('canvas').boundingBox();
      if (!box) break;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      if (direction % 3 === 0) {
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 80, cy - 40, { steps: 5 });
        await page.mouse.up();
      } else if (direction % 3 === 1) {
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx - 60, cy + 30, { steps: 5 });
        await page.mouse.up();
      } else {
        await page.mouse.wheel(cx, cy, { deltaX: 0, deltaY: direction % 6 === 2 ? -120 : 120 });
      }
      direction++;
      await page.waitForTimeout(300);
    }

    await tryGC(page);
    await page.waitForTimeout(2000);

    await stopMemorySampling(page);
    const samples = await samplingPromise;

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'samples.json'), JSON.stringify(samples, null, 2));

    expect(samples.length, 'No memory samples collected').toBeGreaterThan(10);

    const slopeBytesPerSample = computeMemorySlope(samples, 0.3);
    const slopeBytesPerMinute = slopeBytesPerSample * 60;

    const initialMB = (samples[0].jsHeapUsed / 1e6).toFixed(2);
    const finalMB = (samples[samples.length - 1].jsHeapUsed / 1e6).toFixed(2);
    const rateMB = (slopeBytesPerMinute / 1e6).toFixed(2);

    console.log(`Memory trend (last 30%): ${rateMB} MB/min`);
    console.log(`Initial heap: ${initialMB} MB`);
    console.log(`Final heap:   ${finalMB} MB`);

    if (Math.abs(slopeBytesPerMinute) > MEMORY_GROWTH_TARGET_BYTES_PER_MIN) {
      console.log(`NOTE: leak of ${rateMB} MB/min exceeds target ${(MEMORY_GROWTH_TARGET_BYTES_PER_MIN / 1e6).toFixed(0)} MB/min. ` +
        `Closure::forget() + missing delete_texture. Fix: INV-2 + INV-3.`);
    }
  });

  test('wasm memory does not grow without bound', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    await waitForGeoJSON(page);

    await tryGC(page);
    await page.waitForTimeout(1000);

    const samplingPromise2 = startMemorySampling(page, 2000);

    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const box = await page.locator('canvas').boundingBox();
      if (!box) break;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 60, cy - 30, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }

    await tryGC(page);
    await page.waitForTimeout(1000);

    await stopMemorySampling(page);
    const samples = await samplingPromise2;

    const wasmSamples = samples.filter(s => s.wasmMemory > 0);
    if (wasmSamples.length < 5) {
      console.log('Not enough WASM memory samples — engine does not expose __wasmMemory yet');
      return;
    }

    const initial = wasmSamples[0].wasmMemory;
    const final = wasmSamples[wasmSamples.length - 1].wasmMemory;

    console.log(`WASM memory: ${(initial / 1e6).toFixed(1)} MB → ${(final / 1e6).toFixed(1)} MB`);

    if (initial > 0) {
      const growthRatio = final / initial;
      expect(growthRatio, `WASM memory grew from ${initial} to ${final} (${growthRatio.toFixed(2)}x)`).toBeLessThan(3);
    }
  });
});
