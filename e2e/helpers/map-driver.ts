import { Page, Locator, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function waitForMap(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForFunction(() => (window as any).__rustyleafReady === true, { timeout });
}

export async function waitForGeoJSON(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => (window as any).__rustyleafGeoJSONReady === true, { timeout });
}

export async function getMapCenter(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const m = (window as any).__map;
    return m.getCenter();
  });
}

export async function getMapZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as any).__map;
    return m.getZoom();
  });
}

export async function getFeatureCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as any).__map;
    return m._geojsonLayerCount || 0;
  });
}

export async function panMap(page: Page, dx: number, dy: number, steps = 5): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const stepX = dx / steps;
  const stepY = dy / steps;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(cx + stepX * (i + 1), cy + stepY * (i + 1), { steps: 2 });
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

export async function zoomIn(page: Page, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('Canvas not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.wheel(cx, cy, { deltaX: 0, deltaY: -120 });
    await page.waitForTimeout(500);
  }
}

export async function zoomOut(page: Page, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('Canvas not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.wheel(cx, cy, { deltaX: 0, deltaY: 120 });
    await page.waitForTimeout(500);
  }
}

export async function runPanZoomLoop(page: Page, durationMs: number): Promise<void> {
  const start = Date.now();
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let direction = 0;
  const pans = [
    [50, 0], [0, -50], [-50, 0], [0, 50],
    [30, -30], [-30, 30], [20, 20], [-20, -20],
  ];
  while (Date.now() - start < durationMs) {
    const [dx, dy] = pans[direction % pans.length];
    direction++;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 5 });
    await page.waitForTimeout(20);
    await page.mouse.up();
    await page.waitForTimeout(100);
    if (direction % 4 === 0) {
      await page.mouse.wheel(cx, cy, { deltaX: 0, deltaY: direction % 8 === 0 ? -120 : 120 });
      await page.waitForTimeout(300);
    }
    if (direction % 10 === 0) {
      await page.waitForTimeout(500);
    }
  }
}

interface MemorySample {
  timestamp: number;
  jsHeapUsed: number;
  jsHeapTotal: number;
  jsHeapLimit: number;
  wasmMemory: number;
}

export async function startMemorySampling(page: Page, intervalMs = 1000): Promise<Promise<MemorySample[]>> {
  return page.evaluate((interval) => {
    return new Promise<MemorySample[]>((resolve) => {
      const s: MemorySample[] = [];
      const timer = setInterval(() => {
        const mem = (performance as any).memory;
        let wasmBytes = 0;
        try {
          const m = (window as any).__wasmMemory;
          if (m) wasmBytes = m.buffer?.byteLength || 0;
        } catch {}
        s.push({
          timestamp: Date.now(),
          jsHeapUsed: mem?.usedJSHeapSize || 0,
          jsHeapTotal: mem?.totalJSHeapSize || 0,
          jsHeapLimit: mem?.jsHeapSizeLimit || 0,
          wasmMemory: wasmBytes,
        });
      }, interval);
      (window as any).__stopMemorySampling = () => {
        clearInterval(timer);
        resolve(s);
        delete (window as any).__stopMemorySampling;
      };
    });
  }, intervalMs);
}

export async function stopMemorySampling(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__stopMemorySampling?.();
  });
}

export function computeMemorySlope(samples: MemorySample[], tailRatio = 0.3): number {
  if (samples.length < 10) return 0;
  const startIdx = Math.floor(samples.length * (1 - tailRatio));
  const tail = samples.slice(startIdx);
  if (tail.length < 2) return 0;
  const n = tail.length;
  const sumX = tail.reduce((s, _, i) => s + i, 0);
  const sumY = tail.reduce((s, t) => s + t.jsHeapUsed, 0);
  const sumXY = tail.reduce((s, t, i) => s + i * t.jsHeapUsed, 0);
  const sumX2 = tail.reduce((s, _, i) => s + i * i, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export async function measureFps(page: Page, durationMs = 10_000): Promise<{
  min: number; avg: number; p50: number; p95: number; p99: number; frames: number;
}> {
  const result = await page.evaluate((duration) => {
    return new Promise<{
      min: number; avg: number; p50: number; p95: number; p99: number; frames: number;
    }>((resolve) => {
      const frameTimes: number[] = [];
      let lastTime = performance.now();
      let count = 0;
      let min = Infinity;
      const start = performance.now();

      function tick(t: number) {
        const delta = t - lastTime;
        if (delta > 0) {
          frameTimes.push(delta);
          if (delta < min) min = delta;
          count++;
        }
        lastTime = t;
        if (t - start < duration) {
          requestAnimationFrame(tick);
        } else {
          const sorted = [...frameTimes].sort((a, b) => a - b);
          const avg = frameTimes.reduce((s, d) => s + d, 0) / frameTimes.length;
          resolve({
            min: 1000 / (min || 16.67),
            avg: 1000 / (avg || 16.67),
            p50: 1000 / (sorted[Math.floor(sorted.length * 0.5)] || 16.67),
            p95: 1000 / (sorted[Math.floor(sorted.length * 0.95)] || 16.67),
            p99: 1000 / (sorted[Math.floor(sorted.length * 0.99)] || 16.67),
            frames: count,
          });
        }
      }
      requestAnimationFrame(tick);
    });
  }, durationMs);
  return result;
}

export async function takeCanvasScreenshot(page: Page, name: string): Promise<void> {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);
  await expect(canvas).toHaveScreenshot(`${name}.png`, {
    maxDiffPixelRatio: 0.03,
    animations: 'disabled',
  });
}

export async function tryGC(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      (window as any).gc?.();
    } catch {}
  });
}
