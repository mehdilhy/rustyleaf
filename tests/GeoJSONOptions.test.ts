/**
 * GeoJSON layer options test suite (TDD — RED then GREEN)
 *
 * GeoJSON layer options:
 * - filter(feature)            → excluded features never reach the wasm core
 * - pointToLayer(feature, ll)  → point features render via the returned layer
 * - onEachFeature(feature, l)  → per-feature hook; handles support bindPopup
 *                                and on('click'), dispatched via map clicks
 *                                (the wasm hit-test attaches e.feature, shaped
 *                                as { layer_type, layer_index, feature_index,
 *                                original_meta } — original_meta carries the
 *                                user's properties incl. the injected
 *                                __rl_fid; dispatch is gated on layer_index
 *                                matching this layer so two GeoJSONLayers
 *                                with colliding fids don't cross-fire).
 *
 * Run with: npm test -- GeoJSONOptions.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { GeoJSONLayer, CircleMarker, Map } = RustyleafAPI as any;

function fc() {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { name: 'a' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.36, 48.86] }, properties: { name: 'b' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[2.3, 48.8], [2.4, 48.9]] }, properties: { name: 'l' } },
    ],
  };
}

describe('GeoJSONLayer options', () => {
  function makeMap() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const map = new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
    jest.spyOn(map.wasmMap, 'load_geojson');
    jest.spyOn(map.wasmMap, 'add_points');
    return map;
  }

  test('filter excludes features from the wasm payload', () => {
    const map = makeMap();
    const layer = new GeoJSONLayer(fc(), { filter: (f: any) => f.properties.name !== 'a' });
    layer.addTo(map);
    const payload = map.wasmMap.load_geojson.mock.calls[0][1];
    expect(payload).not.toContain('"a"');
    expect(payload).toContain('"b"');
    expect(payload).toContain('"l"');
  });

  test('pointToLayer renders point features via the returned layer', () => {
    const map = makeMap();
    const seen: any[] = [];
    const layer = new GeoJSONLayer(fc(), {
      pointToLayer: (feature: any, latlng: any) => {
        seen.push([feature.properties.name, latlng]);
        return new CircleMarker(latlng, { radius: 6 });
      },
    });
    layer.addTo(map);
    // called once per point feature, with [lat, lng]
    expect(seen).toEqual([['a', [48.85, 2.35]], ['b', [48.86, 2.36]]]);
    // the returned CircleMarkers were added to the map as GPU points
    expect(map.wasmMap.add_points).toHaveBeenCalledTimes(2);
    // the wasm geojson payload no longer contains the point features
    const payload = map.wasmMap.load_geojson.mock.calls[0][1];
    expect(payload).not.toContain('"Point"');
    expect(payload).toContain('"LineString"');
  });

  test('onEachFeature is called for every kept feature', () => {
    const map = makeMap();
    const names: string[] = [];
    const layer = new GeoJSONLayer(fc(), {
      filter: (f: any) => f.properties.name !== 'b',
      onEachFeature: (f: any) => names.push(f.properties.name),
    });
    layer.addTo(map);
    expect(names).toEqual(['a', 'l']);
  });

  test('onEachFeature handles support bindPopup, opened on feature click', async () => {
    const map = makeMap();
    const layer = new GeoJSONLayer(fc(), {
      onEachFeature: (f: any, l: any) => l.bindPopup('Hello ' + f.properties.name),
    });
    layer.addTo(map);
    // Simulate the real wasm feature-click event shape: hit-test meta wraps
    // the feature as { layer_type, layer_index, feature_index, original_meta }.
    const clickHandlers = map._events.click || [];
    expect(clickHandlers.length).toBeGreaterThan(0);
    clickHandlers.forEach((cb: any) => cb({
      type: 'click', latlng: [48.85, 2.35],
      feature: { layer_type: 'geojson-point', layer_index: layer.layerIndex, feature_index: 0, original_meta: { name: 'a', __rl_fid: 0 } },
    }));
    await new Promise((r) => setTimeout(r, 0)); // dispatch is deferred a microtask
    const popup = map.containerElement.querySelector('.rustyleaf-popup');
    expect(popup).not.toBeNull();
    expect(popup.innerHTML).toContain('Hello a');
  });

  test('onEachFeature handles support on("click")', async () => {
    const map = makeMap();
    const clicks: string[] = [];
    const layer = new GeoJSONLayer(fc(), {
      onEachFeature: (f: any, l: any) => l.on('click', (e: any) => clicks.push(e.feature.properties.name)),
    });
    layer.addTo(map);
    (map._events.click || []).forEach((cb: any) => cb({
      type: 'click', latlng: [48.86, 2.36],
      feature: { layer_type: 'geojson-point', layer_index: layer.layerIndex, feature_index: 1, original_meta: { name: 'b', __rl_fid: 1 } },
    }));
    await new Promise((r) => setTimeout(r, 0)); // dispatch is deferred a microtask
    expect(clicks).toEqual(['b']);
  });

  test('a hit on a different GeoJSONLayer does not cross-fire this layer\'s handler', async () => {
    const map = makeMap();
    const clicksA: string[] = [];
    const layerA = new GeoJSONLayer(fc(), {
      onEachFeature: (f: any, l: any) => l.on('click', (e: any) => clicksA.push(e.feature.properties.name)),
    });
    layerA.addTo(map);
    const otherLayerIndex = layerA.layerIndex + 1; // simulate a second GeoJSONLayer
    (map._events.click || []).forEach((cb: any) => cb({
      type: 'click', latlng: [48.85, 2.35],
      // Same fid (0) as layerA's feature 'a', but on a different layer_index
      feature: { layer_type: 'geojson-point', layer_index: otherLayerIndex, feature_index: 0, original_meta: { name: 'a', __rl_fid: 0 } },
    }));
    await new Promise((r) => setTimeout(r, 0));
    expect(clicksA).toEqual([]);
  });
});
