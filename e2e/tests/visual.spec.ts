import { test, expect } from '@playwright/test';
import { waitForMap, takeCanvasScreenshot } from '../helpers/map-driver';

const FIXTURE_URL = '/e2e/fixtures/minimal.html';

test.describe('visual regression — points', () => {
  test('renders points on gray background', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    await takeCanvasScreenshot(page, 'vector-points');
  });
});

test.describe('visual regression — lines', () => {
  test('renders line segments', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    await takeCanvasScreenshot(page, 'vector-lines');
  });
});

test.describe('visual regression — polygons', () => {
  test('renders triangulated polygons', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    await takeCanvasScreenshot(page, 'vector-polygons');
  });
});

test.describe('visual regression — geojson', () => {
  test('renders geojson points, lines, and polygons', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    await takeCanvasScreenshot(page, 'geojson-all');
  });
});

test.describe('visual regression — full canvas', () => {
  test('canvas is not empty after init', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await waitForMap(page);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await takeCanvasScreenshot(page, 'canvas-full');
  });
});
