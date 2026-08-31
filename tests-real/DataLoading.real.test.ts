/**
 * DataLoading.real.test.ts
 *
 * Real-source coverage for GeoJSON data loading entry points:
 *   - loadData            (string JSON path, invalid-JSON warn path,
 *                          immediate parse when already on map,
 *                          deferred path when not yet on map)
 *   - loadUrl             (fetch -> json -> loadData)
 *   - loadFromUrl         (fetch w/ text + streaming body, AbortController signal,
 *                          complete/error callbacks, !ok and rejected-fetch paths)
 *   - loadUrlStreaming    (reader-based streaming parser entry)
 *   - processChunk        (final-chunk client-side parse / state transitions)
 *   - addFeature/addFeatures (chunk entry points while mounted)
 *
 * Run: npx jest --config jest.real.config.js tests-real/DataLoading.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { Map, GeoJSONLayer } = RustyleafAPI as any;

const FC = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
      properties: { name: 'Paris' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.1276, 51.5072] },
      properties: { name: 'London' },
    },
  ],
};
const FC_TEXT = JSON.stringify(FC);

function makeMap(): any {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

function makeFetchResponse(body: any, opts: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    headers: {
      get: (name: string) => {
        if (/content-length/i.test(name)) return String(JSON.stringify(body).length);
        return null;
      },
    },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    body: null as any,
  };
}

describe('GeoJSONLayer data loading (real source)', () => {
  let fetchSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // jsdom may not ship a native fetch — guarantee one exists before spying.
    if (typeof global.fetch !== 'function') {
      (global as any).fetch = jest.fn();
    }
    fetchSpy = jest.spyOn(global, 'fetch');
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('loadData — string input', () => {
    test('parses a valid JSON string and stores both object and loaded state', () => {
      const layer = new GeoJSONLayer(null);
      const ret = layer.loadData(FC_TEXT);

      expect(ret).toBe(layer);
      expect(layer.dataLoaded).toBe(true);
      expect(layer.geojson).toEqual(FC);
    });

    test('warns and leaves geojson null for an invalid JSON string', () => {
      const layer = new GeoJSONLayer(null);
      layer.loadData('{not valid json!!');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON string provided to loadData')
      );
      // dataLoaded is still marked true (state transition), but object is null
      expect(layer.dataLoaded).toBe(true);
      expect(layer.geojson).toBeNull();
    });

    test('unparseable string still stashes raw text as deferred payload (wasm reports it)', () => {
      const layer = new GeoJSONLayer(null);
      layer.loadData('<<<garbage>>>');
      // geojson stays null, but jsonText passthrough is deferred for the
      // wasm-side parser to reject when mounted.
      expect(layer.geojson).toBeNull();
      expect(layer._pendingGeoJSONText).toBe('<<<garbage>>>');
    });

    test('immediate-parse path when layer is already on map', () => {
      const map = makeMap();
      const loadGeojsonSpy = jest.spyOn(map.wasmMap, 'load_geojson');
      const clearSpy = jest.spyOn(map.wasmMap, 'clear_geojson_layer');

      const layer = new GeoJSONLayer(null);
      layer.addTo(map);
      loadGeojsonSpy.mockClear();

      layer.loadData(FC_TEXT);

      expect(loadGeojsonSpy).toHaveBeenCalledTimes(1);
      const [layerIndex, text] = loadGeojsonSpy.mock.calls[0] as [number, string];
      expect(layerIndex).toBe(layer.layerIndex);
      expect(typeof text).toBe('string');
      expect(JSON.parse(text)).toEqual(FC);
      // immediate path must NOT leave a pending payload behind
      expect(layer._pendingGeoJSONText).toBeNull();
      expect(clearSpy).not.toHaveBeenCalled(); // first load, nothing to reset
    });

    test('deferred path when layer is not yet on map, then applied on addTo', () => {
      const map = makeMap();

      const layer = new GeoJSONLayer(null);
      layer.loadData(FC_TEXT);

      // Deferred branch: payload stashed, retry timer armed
      expect(layer._pendingGeoJSONText).toBe(FC_TEXT);
      expect(typeof layer._pendingTimer).not.toBe('undefined'); // retry timer armed

      const loadGeojsonSpy = jest.spyOn(map.wasmMap, 'load_geojson');
      layer.addTo(map);

      expect(loadGeojsonSpy).toHaveBeenCalledTimes(1);
      expect(loadGeojsonSpy.mock.calls[0][1]).toBe(FC_TEXT);
      // Deferred payload consumed and timer cleared
      expect(layer._pendingGeoJSONText).toBeNull();
      expect(layer._pendingTimer).toBeNull();
    });

    test('deferred retry interval fires once the layer becomes mounted', async () => {
      const map = makeMap();
      const layer = new GeoJSONLayer(null);
      layer.loadData(FC_TEXT);
      expect(layer._pendingGeoJSONText).not.toBeNull();

      const loadGeojsonSpy = jest.spyOn(map.wasmMap, 'load_geojson');

      // Simulate the layer becoming mounted without going through addTo's
      // deferred-flush branch: attach map/index manually, then let the
      // 100ms retry interval fire.
      layer.map = map;
      layer.layerIndex = map.wasmMap.add_geojson_layer();
      await new Promise((r) => setTimeout(r, 150));

      expect(loadGeojsonSpy).toHaveBeenCalledWith(layer.layerIndex, FC_TEXT);
      expect(layer._pendingGeoJSONText).toBeNull();
      expect(layer._pendingTimer).toBeNull();
    }, 5000);

    test('re-loading replaces prior dataset (reset + re-parse)', () => {
      const map = makeMap();
      const clearSpy = jest.spyOn(map.wasmMap, 'clear_geojson_layer');

      const layer = new GeoJSONLayer(null);
      layer.addTo(map);
      layer.loadData(FC_TEXT);

      const next = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [13.4, 52.52] },
            properties: { name: 'Berlin' },
          },
        ],
      };

      layer.loadData(next);
      expect(clearSpy).toHaveBeenCalled(); // old layer reset before new parse
      expect(layer.geojson).toEqual(next);
      expect(layer.dataLoaded).toBe(true);
    });

    test('identical no-op reload is skipped', () => {
      const map = makeMap();
      const loadGeojsonSpy = jest.spyOn(map.wasmMap, 'load_geojson');
      const clearSpy = jest.spyOn(map.wasmMap, 'clear_geojson_layer');

      const layer = new GeoJSONLayer(null);
      layer.addTo(map);
      const fcObj = JSON.parse(FC_TEXT);
      layer.loadData(fcObj);

      const callsAfterFirst = loadGeojsonSpy.mock.calls.length;
      layer.loadData(fcObj); // same reference + dataLoaded → skipped

      expect(loadGeojsonSpy.mock.calls.length).toBe(callsAfterFirst);
      expect(clearSpy).not.toHaveBeenCalled();
    });

    test('totalFeatures/dataLoaded state transitions across loads', () => {
      const map = makeMap();
      const countSpy = jest
        .spyOn(map.wasmMap, 'get_geojson_feature_count')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(FC.features.length);

      const layer = new GeoJSONLayer(null);
      layer.addTo(map);
      expect(layer.getFeatureCount()).toBe(0);
      expect(layer.dataLoaded ?? false).toBeFalsy();

      layer.loadData(FC_TEXT);
      expect(layer.dataLoaded).toBe(true);
      expect(layer.getFeatureCount()).toBe(FC.features.length);
    });
  });

  describe('loadUrl (fetch -> json)', () => {
    test('fetches, parses json and loads into the layer', async () => {
      fetchSpy.mockResolvedValueOnce(makeFetchResponse(FC));

      const layer = new GeoJSONLayer(null);
      const ret = await layer.loadUrl('https://example.com/data.geojson');

      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/data.geojson');
      expect(ret).toBe(layer);
      expect(layer.geojson).toEqual(FC);
      expect(layer.dataLoaded).toBe(true);
    });

    test('rejects on HTTP !ok with status in message', async () => {
      fetchSpy.mockResolvedValueOnce(makeFetchResponse(null, { ok: false, status: 404 }));

      const layer = new GeoJSONLayer(null);
      await expect(layer.loadUrl('https://example.com/missing.json')).rejects.toThrow(
        /HTTP error! status: 404/
      );
      expect(layer.geojson).toBeNull();
      expect(layer.dataLoaded ?? false).toBeFalsy();
    });

    test('propagates fetch rejection', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network down'));

      const layer = new GeoJSONLayer(null);
      await expect(layer.loadUrl('https://example.com/x')).rejects.toThrow('network down');
    });
  });

  describe('loadFromUrl (fetch + callbacks + abort signal)', () => {
    test('success via response.text() and completeCallback reports totals', async () => {
      fetchSpy.mockResolvedValueOnce(makeFetchResponse(FC_TEXT));

      const onComplete = jest.fn();
      const layer = new GeoJSONLayer(null);
      const ret = await layer.loadFromUrl('https://cdn.example.com/points.json', {
        completeCallback: onComplete,
      });

      expect(fetchSpy).toHaveBeenCalledWith('https://cdn.example.com/points.json', undefined);
      expect(ret).toBe(layer);
      expect(layer.dataLoaded).toBe(true);
      expect(onComplete).toHaveBeenCalledWith({
        totalFeatures: expect.any(Number),
        totalBytes: FC_TEXT.length,
      });
    });

    test('!ok response invokes errorCallback and throws HTTP error', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeFetchResponse(null, { ok: false, status: 500, statusText: 'Internal Server Error' })
      );

      const onError = jest.fn();
      const layer = new GeoJSONLayer(null);
      await expect(
        layer.loadFromUrl('https://example.com/bad', { errorCallback: onError })
      ).rejects.toThrow(/HTTP 500 Internal Server Error/);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to load GeoJSON from URL' })
      );
      const cbError = onError.mock.calls[0][0].error;
      expect(cbError).toBeInstanceOf(Error);
      expect(cbError.message).toContain('500');
    });

    test('rejected fetch invokes errorCallback and rethrows', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const onError = jest.fn();
      const layer = new GeoJSONLayer(null);
      await expect(
        layer.loadFromUrl('https://unreachable.example/', { errorCallback: onError })
      ).rejects.toThrow('Failed to fetch');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    test('AbortController signal is forwarded to fetch', async () => {
      fetchSpy.mockResolvedValueOnce(makeFetchResponse(FC_TEXT));
      const controller = new AbortController();

      const layer = new GeoJSONLayer(null);
      await layer.loadFromUrl('https://example.com/a.json', { signal: controller.signal });

      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/a.json', {
        signal: controller.signal,
      });
      expect(layer.dataLoaded).toBe(true);
    });

    test('aborting mid-flight surfaces the abort rejection through errorCallback', async () => {
      const controller = new AbortController();
      fetchSpy.mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            );
          })
      );
      const onError = jest.fn();
      const layer = new GeoJSONLayer(null);
      const p = layer.loadFromUrl('https://slow.example/huge.json', {
        signal: controller.signal,
        errorCallback: onError,
      });
      controller.abort();
      await expect(p).rejects.toThrow(/abort/i);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(layer.dataLoaded ?? false).toBeFalsy();
    });

    test('streams response.body via reader with progressCallback when provided', async () => {
      const encoder = new TextEncoder();
      const part1 = encoder.encode(FC_TEXT.slice(0, 20));
      const part2 = encoder.encode(FC_TEXT.slice(20));
      let reads = 0;
      const reader = {
        read: async () => {
          if (reads === 0) {
            reads++;
            return { done: false, value: part1 };
          }
          if (reads === 1) {
            reads++;
            return { done: false, value: part2 };
          }
          return { done: true, value: undefined };
        },
      };
      const progress = jest.fn();
      fetchSpy.mockResolvedValueOnce({
        ...makeFetchResponse(FC_TEXT),
        headers: { get: (n: string) => (/content-length/i.test(n) ? String(FC_TEXT.length) : null) },
        body: { getReader: () => reader },
      });

      const onComplete = jest.fn();
      const layer = new GeoJSONLayer(null);
      await layer.loadFromUrl('https://example.com/streamed.json', {
        progressCallback: progress,
        completeCallback: onComplete,
      });

      // one progress event per chunk
      expect(progress).toHaveBeenCalledTimes(2);
      expect(progress.mock.calls[1][0]).toMatchObject({
        loaded: FC_TEXT.length,
        percentage: 100,
      });
      expect(layer.geojson).toEqual(FC);
      expect(layer.dataLoaded).toBe(true);
      expect(onComplete).toHaveBeenCalledWith({
        totalFeatures: expect.any(Number),
        totalBytes: FC_TEXT.length,
      });
    });
  });

  describe('loadUrlStreaming (chunked streaming parser entry)', () => {
    function streamResponse(text: string, parts: number = 3) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      const size = Math.ceil(bytes.length / parts);
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < bytes.length; i += size) {
        chunks.push(bytes.slice(i, i + size));
      }
      let i = 0;
      return {
        ...makeFetchResponse(text),
        headers: { get: (n: string) => (/content-length/i.test(n) ? String(bytes.length) : null) },
        body: {
          getReader: () => ({
            read: async () =>
              i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
          }),
        },
      };
    }

    test('resolves with this and fires progress+complete callbacks', async () => {
      fetchSpy.mockResolvedValueOnce(streamResponse(FC_TEXT));

      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const map = makeMap();
      const countSpy = jest
        .spyOn(map.wasmMap, 'get_geojson_feature_count')
        .mockReturnValue(FC.features.length);

      const layer = new GeoJSONLayer(null);
      layer.addTo(map);
      const ret = await layer.loadUrlStreaming('https://example.com/big.geojson', {
        chunkSize: 16,
        progressCallback: onProgress,
        completeCallback: onComplete,
      });

      expect(ret).toBe(layer);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          totalFeatures: FC.features.length,
          totalBytes: FC_TEXT.length,
          loadedBytes: FC_TEXT.length,
        })
      );
      expect(onProgress).toHaveBeenCalled();
    });

    test('rejects and fires errorCallback on HTTP failure', async () => {
      fetchSpy.mockResolvedValueOnce(makeFetchResponse(null, { ok: false, status: 403 }));

      const onError = jest.fn();
      const layer = new GeoJSONLayer(null);
      await expect(
        layer.loadUrlStreaming('https://example.com/denied', { errorCallback: onError })
      ).rejects.toThrow(/HTTP error! status: 403/);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('processChunk final-parse state transitions', () => {
    test('final chunk parses accumulated streamed text into geojson', () => {
      const map = makeMap();
      const chunkSpy = jest.spyOn(map.wasmMap, 'load_geojson_chunk');

      const layer = new GeoJSONLayer(null);
      layer.addTo(map);

      layer.processChunk(FC_TEXT.slice(0, 10), false);
      expect(layer.geojson).toBeNull(); // not final yet

      layer.processChunk(FC_TEXT.slice(10), true);
      expect(chunkSpy).toHaveBeenLastCalledWith(layer.layerIndex, FC_TEXT.slice(10), true);
      expect(layer.geojson).toEqual(FC);
      expect(layer.dataLoaded).toBe(true);
    });

    test('no-op when layer is not on a map', () => {
      const layer = new GeoJSONLayer(null);
      expect(layer.processChunk(FC_TEXT, true)).toBeUndefined();
      expect(layer.geojson).toBeNull();
    });
  });

  describe('addFeature / addFeatures', () => {
    test('routes features through processChunk while mounted', () => {
      const map = makeMap();
      const chunkSpy = jest.spyOn(map.wasmMap, 'load_geojson_chunk');

      const layer = new GeoJSONLayer(null);
      layer.addTo(map);

      const feature = FC.features[0];
      expect(layer.addFeature(feature)).toBe(layer);
      expect(chunkSpy).toHaveBeenCalledWith(layer.layerIndex, JSON.stringify(feature), false);

      chunkSpy.mockClear();
      expect(layer.addFeatures([feature, feature])).toBe(layer);
      expect(chunkSpy).toHaveBeenCalledTimes(2);
    });

    test('is a silent no-op when unmounted', () => {
      const layer = new GeoJSONLayer(null);
      expect(layer.addFeature(FC.features[0])).toBe(layer);
      expect(layer.addFeatures([FC.features[0]])).toBe(layer);
      expect(layer._streamedText).toBeUndefined();
    });
  });
});
