import { test, expect } from '@playwright/test';
import {
  waitForMap,
  waitForGeoJSON,
  runPanZoomLoop,
  measureFps,
} from '../helpers/map-driver';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Ratchet floor — raise as perf fixes land (see comments at the assertion).
// Current headless/SwiftShader baseline: ~5.7 avg FPS. Long-term target: 50+.
const FPS_MINIMUM = 4;
const FPS_TARGET = 60;
const BENCH_DURATION_MS = 10_000;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'artifacts', 'fps-benchmark');
const FIXTURE_URL = '/e2e/fixtures/geojson-heavy.html';

test.describe('FPS benchmark — 5.5MB GeoJSON', () => {
  test('sustains minimum FPS during pan/zoom', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    await waitForGeoJSON(page);

    await page.waitForTimeout(2000);

    const measurePromise = measureFps(page, BENCH_DURATION_MS);

    await runPanZoomLoop(page, BENCH_DURATION_MS);

    const fps = await measurePromise;

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify(fps, null, 2));

    console.log(`FPS: min=${fps.min.toFixed(1)} avg=${fps.avg.toFixed(1)} p50=${fps.p50.toFixed(1)} p95=${fps.p95.toFixed(1)} p99=${fps.p99.toFixed(1)} frames=${fps.frames}`);

    if (fps.avg < FPS_TARGET) {
      console.log(`TARGET (${FPS_TARGET} FPS) not yet met. Current: ${fps.avg.toFixed(1)} FPS.`);
    }

    // HARD floor with ratchet: increase this value when each fix lands.
    // Fix 1 (geographic R-tree):        expect ≥5
    // Fix 2 (dirty flag):               expect ≥20
    // Fix 3 (GPU-upload-once, polygon): expect ≥30
    // Fix 4 (uniforms):                 expect ≥40
    // Fix 5 (GPU-upload-once, lines):   expect ≥50 (avg ~60 observed)
    expect(fps.avg, `Average FPS (${fps.avg.toFixed(1)}) below ratchet floor (${FPS_MINIMUM}). Fix 1-5 above.`).toBeGreaterThanOrEqual(FPS_MINIMUM);
  });
});
