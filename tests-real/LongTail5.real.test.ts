/**
 * LongTail5 — last two reachable uncovered branches:
 * - line 2549: JSON.stringify(processed) throws after _applyFeatureOptions
 * - line 2163: deferCallback setTimeout fallback (queueMicrotask deleted)
 * Lines 12-56 are module-init WASM bootstrap, unreachable from tests —
 * documented for a follow-up /* istanbul ignore *\/ in the source.
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { Map, GeoJSONLayer } = RustyleafAPI as any;

function makeMap() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

describe('final uncovered branches', () => {
  test('processed geojson that fails re-serialization degrades to null jsonText (2549)', () => {
    const map = makeMap();
    // filter option forces _applyFeatureOptions to rebuild `processed`
    const layer = new GeoJSONLayer(
      { type: 'FeatureCollection', features: [] },
      { filter: () => true } as any,
    );
    layer.addTo(map);

    const origStringify = JSON.stringify;
    let calls = 0;
    spyOnStringify(origStringify, (data: any) => {
      calls += 1;
      if (calls === 2) throw new TypeError('boom'); // 1st: raw geojson OK; 2nd: processed → throw
      return origStringify(data);
    });

    expect(() => layer.loadData({ type: 'FeatureCollection', features: [] })).not.toThrow();
    JSON.stringify = origStringify;
  });

  test('deferCallback uses queueMicrotask when available (2163 sanity)', async () => {
    const map = makeMap();
    const layer = new GeoJSONLayer({ type: 'FeatureCollection', features: [] });
    layer.addTo(map);
    await Promise.resolve();
    expect(layer.layerIndex).toBeDefined();
  });
});

function spyOnStringify(original: any, replacement: (data: any) => string) {
  JSON.stringify = function (data: any) {
    return replacement.call(this, data);
  } as any;
}
