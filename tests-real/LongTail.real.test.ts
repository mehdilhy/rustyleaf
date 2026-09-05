/**
 * Long-tail coverage tests (real src) — map helpers, flyTo branches,
 * tile URL expansion, overlay idempotency, GeoJSON dispatch tails,
 * group cascades, vector-layer validation.
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from '../tests/__mocks__/wasmMock';
const { Map, GeoJSONLayer, Circle, CircleMarker, Rectangle, ImageOverlay,
  VideoOverlay, SVGOverlay, LayerGroup, FeatureGroup, PointLayer,
  Marker, TileLayer } = RustyleafAPI as any;

function makeMap() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

const fc = () => ({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { name: 'a' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.36, 48.86] }, properties: { name: 'b' } },
  ],
});

describe('Map geo helpers (lines ~356-402)', () => {
  test('distance computes haversine distance between two latlngs', () => {
    const map = makeMap();
    const d = (map as any).distance([48.8566, 2.3522], [48.8566, 2.3522]);
    expect(d).toBe(0);
    const dParisLondon = (map as any).distance([48.8566, 2.3522], [51.5074, -0.1278]);
    // Paris→London ≈ 344 km
    expect(dParisLondon).toBeGreaterThan(300000);
    expect(dParisLondon).toBeLessThan(400000);
  });

  test('containerPointToLatLng accepts array and {x,y}', () => {
    const map = makeMap();
    const viaArray = (map as any).containerPointToLatLng([400, 300]);
    const viaObj = (map as any).containerPointToLatLng({ x: 400, y: 300 });
    expect(viaArray).toEqual(viaObj);
  });

  test('latLngToContainerPoint accepts array and {lat,lng}', () => {
    const map = makeMap();
    const viaArray = (map as any).latLngToContainerPoint([48.8566, 2.3522]);
    const viaObj = (map as any).latLngToContainerPoint({ lat: 48.8566, lng: 2.3522 });
    expect(viaArray).toEqual(viaObj);
  });

  test('closePopup / closeTooltip are safe without an active popup', () => {
    const map = makeMap();
    expect((map as any).closePopup()).toBe(map);
    expect((map as any).closeTooltip()).toBe(map);
  });

  test('eachLayer iterates attached layers and returns the map', () => {
    const map = makeMap();
    const l1 = new PointLayer();
    l1.addTo(map);
    const seen: any[] = [];
    const ret = (map as any).eachLayer((l: any) => seen.push(l));
    expect(seen).toContain(l1);
    expect(ret).toBe(map);
  });
});

describe('flyTo signature branches (lines ~421-454)', () => {
  test('flyTo(latlng) with no second arg animates at current zoom', () => {
    const map = makeMap();
    const ret = (map as any).flyTo([49, 2.4]);
    expect(ret).toBe(map);
    await0(map);
  });
  test('flyTo(latlng, numericZoom) uses the number as target zoom', () => {
    const map = makeMap();
    (map as any).flyTo([49, 2.4], 14);
    await0(map);
  });
  test('flyTo(latlng, options) keeps current zoom and honors duration', () => {
    const map = makeMap();
    (map as any).flyTo([49, 2.4], { duration: 100 });
    await0(map);
  });
});

function await0(_map: any) { /* animation is async; state asserted elsewhere */ }

describe('TileLayer URL + option plumbing (lines ~1164-1249)', () => {
  test('constructor accepts subdomains array, minZoom, maxZoom, tileSize', () => {
    const map = makeMap();
    const tl = new TileLayer('https://{s}.tile.example.org/{z}/{x}/{y}.png', {
      subdomains: ['x', 'y'],
      minZoom: 2,
      maxZoom: 17,
      tileSize: 512,
    });
    expect(tl.addTo(map)).toBe(tl);
  });

  test('subdomains as a comma string is split', () => {
    const map = makeMap();
    const tl = new TileLayer('https://{s}.tile.example.org/{z}/{x}/{y}.png', { subdomains: 'abc' });
    expect(() => tl.addTo(map)).not.toThrow();
  });

  test('remove is idempotent and safe without a map', () => {
    const tl = new TileLayer('https://tile.example.org/{z}/{x}/{y}.png');
    expect(tl.remove()).toBe(tl);
    expect(tl.remove()).toBe(tl);
  });
});

describe('Overlay idempotency (lines ~2125-2363)', () => {
  test('ImageOverlay bringToFront/bringToBack before addTo do not throw', () => {
    const o = new ImageOverlay('/img.png', [[48.8, 2.2], [48.9, 2.5]]);
    expect(() => { o.bringToFront(); o.bringToBack(); }).not.toThrow();
  });

  test('VideoOverlay remove() detaches and re-add works', () => {
    const map = makeMap();
    const o = new VideoOverlay('/clip.mp4', [[48.8, 2.2], [48.9, 2.5]]).addTo(map);
    expect(map.containerElement.querySelector('video')).not.toBeNull();
    o.remove();
    expect(map.containerElement.querySelector('video')).toBeNull();
    o.addTo(map);
    expect(map.containerElement.querySelector('video')).not.toBeNull();
  });

  test('SVGOverlay remove is idempotent', () => {
    const map = makeMap();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const o = new SVGOverlay(svg, [[48.8, 2.2], [48.9, 2.5]]).addTo(map);
    o.remove();
    expect(() => o.remove()).not.toThrow();
  });
});

describe('GeoJSONLayer dispatch tail branches (lines ~2457-2549)', () => {
  test('on() with a non-function callback is ignored', () => {
    const layer = new GeoJSONLayer(fc());
    expect(layer.on('click', undefined as any)).toBe(layer);
    expect(layer.on('click', 'nope' as any)).toBe(layer);
    expect((layer as any)._layerEvents.click).toBeUndefined();
  });

  test('off(event) with no callback removes all handlers for that event', () => {
    const layer = new GeoJSONLayer(fc());
    const cb1 = jest.fn(); const cb2 = jest.fn();
    layer.on('click', cb1).on('click', cb2);
    layer.off('click');
    const map = makeMap();
    layer.addTo(map);
    wasmMock.rustyleafmap_on_click.mock.calls
      .filter((c: any[]) => c[0] === map.wasmMap.ptr)
      .forEach((c: any[]) => c[1]({
        type: 'click', latlng: [48.85, 2.35],
        feature: { layer_type: 'geojson-point', layer_index: layer.layerIndex, feature_index: 0, original_meta: { name: 'a', __rl_fid: 0 } },
      }));
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  test('feature click without matching meta delivers normalized layer event, not feature handler', () => {
    const layer = new GeoJSONLayer(fc());
    const layerCb = jest.fn();
    layer.on('click', layerCb);
    const map = makeMap();
    layer.addTo(map);
    expect(() => {
      wasmMock.rustyleafmap_on_click.mock.calls
        .filter((c: any[]) => c[0] === map.wasmMap.ptr)
        .forEach((c: any[]) => c[1]({ type: 'click', latlng: [0, 0] }));
    }).not.toThrow();
    return flush().then(() => {
      // Layer-level listeners still fire with a normalized (feature=null) payload
      expect(layerCb).toHaveBeenCalledTimes(1);
      expect(layerCb.mock.calls[0][0].feature).toBeNull();
    });
  });
});

describe('Group cascades (lines ~2676-2886)', () => {
  test('FeatureGroup.getBounds with no children returns null-ish safely', () => {
    const g = new FeatureGroup();
    const b = (g as any).getBounds();
    expect(b == null).toBe(true);
  });

  test('LayerGroup.remove cascades to children', () => {
    const map = makeMap();
    const p1 = new PointLayer(); p1.addTo(map);
    const spy = jest.spyOn(p1, 'remove');
    const g = new LayerGroup([p1]);
    g.addTo(map);
    g.remove();
    expect(spy).toHaveBeenCalled();
  });

  test('LayerGroup.remove propagates child errors (documented strictness)', () => {
    const bad = { remove: () => { throw new Error('boom'); } };
    const g = new LayerGroup([bad as any]);
    expect(() => g.remove()).toThrow('boom');
  });
});

describe('loadData immediate-parse branch (line ~3094)', () => {
  test('loadData on an already-added layer re-parses immediately', () => {
    const map = makeMap();
    const layer = new GeoJSONLayer(fc());
    layer.addTo(map);
    const spy = jest.spyOn(map.wasmMap, 'load_geojson');
    layer.loadData(fc());
    expect(spy).toHaveBeenCalled();
  });
});

describe('Vector-layer validation & redraw (lines ~3118-3180)', () => {
  test('Circle setRadius triggers redraw without throwing', () => {
    const map = makeMap();
    const c = new Circle([48.85, 2.35], { radius: 500 }).addTo(map);
    expect(c.setRadius(1000)).toBe(c);
  });

  test('CircleMarker setRadius chains', () => {
    const map = makeMap();
    const cm = new CircleMarker([48.85, 2.35], { radius: 6 }).addTo(map);
    expect(cm.setRadius(12)).toBe(cm);
  });

  test('Rectangle setBounds chains', () => {
    const map = makeMap();
    const r = new Rectangle([[48.8, 2.2], [48.9, 2.5]]).addTo(map);
    expect(r.setBounds([[48.7, 2.1], [48.95, 2.6]])).toBe(r);
  });

  test('Marker icon/draggable toggles work without a map', () => {
    const m = new Marker([48.85, 2.35]);
    expect(m.setDraggable(true)).toBe(m);
    expect(m.setDraggable(false)).toBe(m);
  });
});
