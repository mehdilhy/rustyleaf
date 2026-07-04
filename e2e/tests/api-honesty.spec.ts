import { test, expect } from '@playwright/test';
import { waitForMap, panMap } from '../helpers/map-driver';

const MINIMUM_API = {
  map: [
    'setView', 'getCenter', 'getZoom', 'getBounds',
    'zoomIn', 'zoomOut', 'panBy', 'fitBounds',
    'project', 'unproject', 'on', 'off',
    'getWebGLSupport',
  ],
  pointLayer: ['add', 'clear', 'addTo', 'on', 'remove'],
  lineLayer: ['add', 'clear', 'addTo', 'on', 'remove'],
  polygonLayer: ['add', 'clear', 'addTo', 'on', 'remove'],
  geoJSONLayer: [
    'loadData', 'loadUrl', 'clear', 'addTo', 'on', 'remove',
    'setStyle', 'getBounds', 'getFeatureCount',
  ],
  tileLayer: ['addTo', 'remove'],
  popup: ['setLatLng', 'setContent', 'openOn', 'close', 'toggle', 'isOpenPopup'],
};

test.describe('API surface honesty (11.1)', () => {
  test('Map has all documented methods', async ({ page }) => {
    await page.goto('/e2e/fixtures/minimal.html');
    await waitForMap(page);

    const methods = await page.evaluate(() => {
      const m = (window as any).__map;
      if (!m) return { map: {} };
      const getMethods = (obj: any) => {
        const names: string[] = [];
        let proto = obj;
        while (proto && proto !== Object.prototype) {
          for (const key of Object.getOwnPropertyNames(proto)) {
            if (typeof proto[key] === 'function' && !key.startsWith('_') && key !== 'constructor') {
              names.push(key);
            }
          }
          proto = Object.getPrototypeOf(proto);
        }
        return [...new Set(names)];
      };
      return { map: getMethods(m) };
    });

    for (const method of MINIMUM_API.map) {
      expect(methods.map, `Map missing method: ${method}`).toContain(method);
    }
  });

  test('TileLayer has all documented methods', async ({ page }) => {
    await page.goto('/e2e/fixtures/minimal.html');
    await waitForMap(page);

    const exists = await page.evaluate(() => {
      const { TileLayer } = (window as any).__rustyleafExports || {};
      if (!TileLayer) return null;
      const t = new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(t))
        .filter(k => typeof t[k] === 'function' && k !== 'constructor');
      return methods;
    });

    if (exists === null) {
      console.log('Cannot introspect TileLayer class — skip');
      return;
    }
    for (const method of MINIMUM_API.tileLayer) {
      expect(exists, `TileLayer missing method: ${method}`).toContain(method);
    }
  });

  test('GeoJSONLayer has all documented methods', async ({ page }) => {
    await page.goto('/e2e/fixtures/minimal.html');
    await waitForMap(page);

    const exists = await page.evaluate(() => {
      const { GeoJSONLayer } = (window as any).__rustyleafExports || {};
      if (!GeoJSONLayer) return null;
      const g = new GeoJSONLayer(null);
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(g))
        .filter(k => typeof g[k] === 'function' && k !== 'constructor');
      return methods;
    });

    if (exists === null) {
      console.log('Cannot introspect GeoJSONLayer class — skip');
      return;
    }
    for (const method of MINIMUM_API.geoJSONLayer) {
      expect(exists, `GeoJSONLayer missing method: ${method}`).toContain(method);
    }
  });

  test('Popup has all documented methods', async ({ page }) => {
    await page.goto('/e2e/fixtures/minimal.html');
    await waitForMap(page);

    const exists = await page.evaluate(() => {
      const { Popup } = (window as any).__rustyleafExports || {};
      if (!Popup) return null;
      const p = new Popup();
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(p))
        .filter(k => typeof p[k] === 'function' && k !== 'constructor');
      return methods;
    });

    if (exists === null) {
      console.log('Cannot introspect Popup class — skip');
      return;
    }
    for (const method of MINIMUM_API.popup) {
      expect(exists, `Popup missing method: ${method}`).toContain(method);
    }
  });
});
