/**
 * Layer visibility / removal test suite (TDD — RED then GREEN)
 *
 * layer.remove() used to be a JS-side stub — the layer
 * stayed on the GPU forever. Now remove() hides the wasm layer (visible flag,
 * already honored by every render pass) and re-addTo() to the same map toggles
 * it back instead of duplicating the layer.
 *
 * Also covers a regression: add_*_layer() must return the new layer index —
 * it used to return undefined, which wasm-bindgen coerced to 0, so every
 * layer of a kind collapsed into index 0.
 *
 * Run with: npm test -- LayerVisibility.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { PointLayer, LineLayer, PolygonLayer, GeoJSONLayer, Map } = RustyleafAPI as any;

describe('Layer visibility / removal', () => {
  function makeMap() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const map = new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
    for (const m of [
      'add_point_layer', 'add_points', 'set_point_layer_visible',
      'add_line_layer', 'set_line_layer_visible',
      'add_polygon_layer', 'set_polygon_layer_visible',
      'set_geojson_layer_visible',
    ]) {
      jest.spyOn(map.wasmMap, m);
    }
    return map;
  }

  const point = { lat: 48.8566, lng: 2.3522, size: 5, color: '#ff0000' };

  test('two point layers get distinct wasm layer indices', () => {
    const map = makeMap();
    new PointLayer().add([point]).addTo(map);
    new PointLayer().add([point]).addTo(map);
    const indices = map.wasmMap.add_points.mock.calls.map((c: any[]) => c[0]);
    expect(indices.length).toBe(2);
    expect(indices[0]).not.toBe(indices[1]);
  });

  test('PointLayer.remove() hides the wasm layer', () => {
    const map = makeMap();
    const layer = new PointLayer().add([point]).addTo(map);
    expect(layer.remove()).toBe(layer);
    expect(map.wasmMap.set_point_layer_visible).toHaveBeenCalledWith(expect.any(Number), false);
  });

  test('remove() before addTo is a safe no-op', () => {
    const layer = new PointLayer();
    expect(layer.remove()).toBe(layer);
  });

  test('re-addTo the same map re-shows instead of duplicating', () => {
    const map = makeMap();
    const layer = new PointLayer().add([point]).addTo(map);
    layer.remove();
    layer.addTo(map);
    expect(map.wasmMap.add_point_layer).toHaveBeenCalledTimes(1);
    expect(map.wasmMap.set_point_layer_visible).toHaveBeenCalledWith(expect.any(Number), true);
  });

  test('LineLayer.remove() hides the wasm layer', () => {
    const map = makeMap();
    const layer = new LineLayer();
    layer.add([{ coords: [{ lat: 48.85, lng: 2.35 }, { lat: 48.86, lng: 2.36 }] }]);
    layer.addTo(map);
    layer.remove();
    expect(map.wasmMap.set_line_layer_visible).toHaveBeenCalledWith(expect.any(Number), false);
  });

  test('PolygonLayer.remove() hides the wasm layer', () => {
    const map = makeMap();
    const layer = new PolygonLayer();
    layer.add([{ rings: [[{ lat: 48.8, lng: 2.2 }, { lat: 48.8, lng: 2.5 }, { lat: 48.9, lng: 2.5 }]] }]);
    layer.addTo(map);
    layer.remove();
    expect(map.wasmMap.set_polygon_layer_visible).toHaveBeenCalledWith(expect.any(Number), false);
  });

  test('GeoJSONLayer.remove() hides the wasm layer and re-addTo re-shows it', () => {
    const map = makeMap();
    const layer = new GeoJSONLayer({ type: 'FeatureCollection', features: [] });
    layer.addTo(map);
    layer.remove();
    expect(map.wasmMap.set_geojson_layer_visible).toHaveBeenCalledWith(expect.any(Number), false);
    layer.addTo(map);
    expect(map.wasmMap.set_geojson_layer_visible).toHaveBeenCalledWith(expect.any(Number), true);
  });
});
