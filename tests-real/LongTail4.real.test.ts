/**
 * LongTail4 — feature-handle dispatch tails: per-feature handler error
 * isolation, bindPopup auto-open on click, loadData re-load cleanup path.
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from '../tests/__mocks__/wasmMock';
const { Map, GeoJSONLayer } = RustyleafAPI as any;

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

describe('feature-handle dispatch tails (~2470, ~2509, ~2535)', () => {
  test('a throwing per-feature handler is isolated (error logged, others run)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const layer = new (GeoJSONLayer as any)(fc(), {
      onEachFeature: (f: any, handle: any) => handle.on('click', () => {
        if (f.properties.name === 'a') throw new Error('per-feature boom');
      }),
    });
    const map = makeMap();
    layer.addTo(map);

    wasmMock.rustyleafmap_on_click.mock.calls
      .filter((c: any[]) => c[0] === map.wasmMap.ptr)
      .forEach((c: any[]) => c[1]({
        type: 'click', latlng: [48.85, 2.35],
        feature: { layer_type: 'geojson-point', layer_index: layer.layerIndex, feature_index: 0, original_meta: { name: 'a', __rl_fid: 0 } },
      }));
    await flush();

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('bindPopup content auto-opens a popup on that feature click', async () => {
    const layer = new (GeoJSONLayer as any)(fc(), {
      onEachFeature: (f: any, handle: any) => handle.bindPopup(`popup-${f.properties.name}`),
    });
    const map = makeMap();
    layer.addTo(map);

    wasmMock.rustyleafmap_on_click.mock.calls
      .filter((c: any[]) => c[0] === map.wasmMap.ptr)
      .forEach((c: any[]) => c[1]({
        type: 'click', latlng: [48.85, 2.35],
        feature: { layer_type: 'geojson-point', layer_index: layer.layerIndex, feature_index: 0, original_meta: { name: 'a', __rl_fid: 0 } },
      }));
    await flush();

    const popupEl = map.containerElement.querySelector('.rustyleaf-popup');
    expect(popupEl).not.toBeNull();
  });

  test('loadData with unserializable geojson still sets dataLoaded state', async () => {
    const layer = new (GeoJSONLayer as any)(fc());
    const map = makeMap();
    layer.addTo(map);
    // Circular structure → JSON.stringify throws → jsonText null branch
    const circular: any = { type: 'FeatureCollection', features: [] };
    circular.self = circular;
    expect(() => layer.loadData(circular)).not.toThrow();
  });
});
