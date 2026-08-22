/**
 * WMSTileLayer / GridLayer / plugin-system test suite (TDD — RED then GREEN)
 *
 * - WMSTileLayer builds a GetMap URL template with a {bbox-epsg-3857} token
 *   that the Rust tile loader substitutes per tile.
 * - GridLayer renders programmable DOM tiles (createTile) positioned over the
 *   map, pruned/re-rendered on view changes.
 * - Handler + map.addHandler + Util are the Leaflet-style plugin surface.
 *
 * Run with: npm test -- PluginsAndTiles.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { WMSTileLayer, GridLayer, Handler, Util, Map } = RustyleafAPI as any;

function makeMap() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

describe('WMSTileLayer', () => {
  test('builds a WMS GetMap template with bbox token', () => {
    const wms = new WMSTileLayer('https://example.com/wms', { layers: 'roads,water', transparent: true });
    const url = wms.wasmTileLayer.urlTemplate;
    expect(url).toContain('https://example.com/wms?');
    expect(url).toContain('service=WMS');
    expect(url).toContain('request=GetMap');
    expect(url).toContain('layers=roads%2Cwater');
    expect(url).toContain('transparent=true');
    expect(url).toContain('width=256');
    expect(url).toContain('srs=EPSG%3A3857');
    expect(url).toContain('bbox={bbox-epsg-3857}');
  });

  test('WMS 1.3.0 uses crs instead of srs; existing query strings are appended to', () => {
    const wms = new WMSTileLayer('https://example.com/wms?key=abc', { layers: 'x', version: '1.3.0' });
    const url = wms.wasmTileLayer.urlTemplate;
    expect(url).toContain('?key=abc&');
    expect(url).toContain('crs=EPSG%3A3857');
    expect(url).not.toContain('srs=');
  });

  test('addTo attaches like a TileLayer', () => {
    const map = makeMap();
    const wms = new WMSTileLayer('https://example.com/wms', { layers: 'x' });
    expect(wms.addTo(map)).toBe(wms);
  });
});

describe('GridLayer', () => {
  test('createTile is called for every visible tile and tiles are positioned', () => {
    const map = makeMap(); // mock map is 800x600, tileSize 256
    const created: any[] = [];
    class DebugGrid extends GridLayer {
      createTile(coords: any) {
        created.push(coords);
        const el = document.createElement('div');
        el.textContent = `${coords.z}/${coords.x}/${coords.y}`;
        return el;
      }
    }
    const grid = new DebugGrid();
    expect(grid.addTo(map)).toBe(grid);
    // 800x600 with 256px tiles needs at least 4x3 tiles
    expect(created.length).toBeGreaterThanOrEqual(12);
    expect(created[0].z).toBe(12);
    const container = map.containerElement.querySelector('.rustyleaf-grid-layer');
    expect(container).not.toBeNull();
    const tile = container.firstChild;
    expect(tile.style.position).toBe('absolute');
    expect(tile.style.width).toBe('256px');
  });

  test('remove() detaches the tile container', () => {
    const map = makeMap();
    const grid = new GridLayer().addTo(map);
    expect(grid.remove()).toBe(grid);
    expect(map.containerElement.querySelector('.rustyleaf-grid-layer')).toBeNull();
  });
});

describe('Handler + map.addHandler', () => {
  class Wobble extends Handler {
    hooksAdded = 0;
    hooksRemoved = 0;
    addHooks() { this.hooksAdded++; }
    removeHooks() { this.hooksRemoved++; }
  }

  test('enable/disable call addHooks/removeHooks exactly once each', () => {
    const map = makeMap();
    const h = new Wobble(map);
    expect(h.enabled()).toBe(false);
    h.enable();
    h.enable();
    expect(h.enabled()).toBe(true);
    expect(h.hooksAdded).toBe(1);
    h.disable();
    h.disable();
    expect(h.enabled()).toBe(false);
    expect(h.hooksRemoved).toBe(1);
  });

  test('map.addHandler exposes the handler on the map and honors options', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const map = new Map(el, { center: [48.85, 2.35], zoom: 12, wobble: true } as any);
    map.addHandler('wobble', Wobble);
    expect(map.wobble).toBeInstanceOf(Wobble);
    expect(map.wobble.enabled()).toBe(true); // options.wobble was truthy
  });
});

describe('Util', () => {
  test('stamp assigns stable unique ids', () => {
    const a = {}, b = {};
    expect(Util.stamp(a)).toBe(Util.stamp(a));
    expect(Util.stamp(a)).not.toBe(Util.stamp(b));
  });

  test('template substitutes {tokens}', () => {
    expect(Util.template('{z}/{x}', { z: 3, x: 7 })).toBe('3/7');
    expect(() => Util.template('{missing}', {})).toThrow();
  });

  test('wrapNum wraps longitudes', () => {
    expect(Util.wrapNum(190, [-180, 180])).toBe(-170);
    expect(Util.wrapNum(-190, [-180, 180])).toBe(170);
  });

  test('formatNum rounds to the given precision', () => {
    expect(Util.formatNum(1.23456, 2)).toBe(1.23);
  });

  test('setOptions merges into obj.options', () => {
    const obj: any = { options: { a: 1 } };
    Util.setOptions(obj, { b: 2 });
    expect(obj.options).toEqual({ a: 1, b: 2 });
  });
});
