/**
 * MapLifecycle.real.test.ts
 *
 * Real-source coverage for map lifecycle regions of src/rustyleaf-api.js:
 *   - WASM init block (lines 12-56): probe/fetch-instantiate fallback +
 *     error paths are module-init-time code; see notes below on reachability
 *     under the TLA-stripping transformer.
 *   - webglcontextlost/webglcontextrestored handlers on map.canvas
 *     (lines 140-157) and the WebGL-not-supported fallback UI (164-175),
 *     plus the init_canvas failure UI path (183-194).
 *   - setView maxBounds clamping, fitBounds flattening, invalidateSize
 *     (356-402 region + 500-515).
 *   - flyTo option-shape branches: numeric zoom arg, options object,
 *     no second arg (451-459).
 *   - geolocation locate()/stopLocate() success and error paths (524-549).
 *   - once() semantics, off(event) removing ALL handlers for an event,
 *     and context argument passing to handlers (606-677).
 *
 * Run: npx jest --config jest.real.config.js tests-real/MapLifecycle.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from '../tests/__mocks__/wasmMock';
const { Map } = RustyleafAPI as any;

function makeMap(): any {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

// Drain the queueMicrotask deferrals used for wasm-event dispatch.
const flushMicrotasks = () => Promise.resolve();

describe('Map lifecycle (real source)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    // Remove any geolocation stub installed by a test.
    try {
      delete (navigator as any).geolocation;
    } catch {
      /* not configurable — ignore */
    }
  });

  // ------------------------------------------------------------------
  // WASM init block (src lines 8-60)
  // ------------------------------------------------------------------
  describe('WASM init module block', () => {
    // The init machinery (__rustyleafWasmAlreadyInitialized,
    // __ensureRustyleafWasmReady and the fetch/instantiate fallback) executes
    // at module-evaluation time. Under jest-transform-cjs-tla the top-level
    // `await __ensureRustyleafWasmReady()` is stripped/downgraded, so by the
    // time any test runs, that code has already run exactly once and its
    // internals are NOT exported — the fetch-instantiate fallback (32-53)
    // and the ready-promise caching (22-24, 56) are unreachable from tests.
    //
    // Istanbul-ignore candidate:
    //   /* istanbul ignore next */ around __ensureRustyleafWasmReady's
    //   fetch/instantiate body (lines 29-54) in src/rustyleaf-api.js, or
    //   exclude the module-init block via an istanbul ignore-file hint.
    test('module evaluates cleanly through the already-initialized probe path', () => {
      // Reaching this point proves: the module imported, the probe
      // (new RustyleafMap(1,1) -> free()) succeeded against the mocked glue
      // (so the manual fetch fallback was skipped), and evaluation completed.
      expect(typeof RustyleafAPI.Map).toBe('function');

      const map = makeMap();
      expect(map.wasmMap).toBeDefined();
      expect(typeof map.wasmMap.ptr).toBe('number');
      map.remove();
    });
  });

  // ------------------------------------------------------------------
  // Context loss recovery (src lines 139-158)
  // ------------------------------------------------------------------
  describe('webglcontextlost / webglcontextrestored handlers', () => {
    let map: any;

    beforeEach(() => {
      map = makeMap();
      // The mock wasm core has no context-loss methods; the source guards
      // with `this.wasmMap && this.wasmMap.handle_*`, so attach spies the
      // same way the real glue would expose them.
      map.wasmMap.handle_context_lost = jest.fn();
      map.wasmMap.handle_context_restored = jest.fn();
      wasmMock.rustyleafmap_init_canvas.mockClear();
    });

    afterEach(() => {
      if (map && !map._destroyed) map.remove();
    });

    test('webglcontextlost preventDefaults, notifies wasm, flags restore-needed and stops the render loop', () => {
      const rafBefore = map._rafId;
      expect(rafBefore).toBeDefined();

      const event = new window.Event('webglcontextlost', { cancelable: true });
      map.canvas.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(map.wasmMap.handle_context_lost).toHaveBeenCalledTimes(1);
      expect(map._needsRestore).toBe(true);
      expect(map._rafId).toBeUndefined();
    });

    test('webglcontextlost without wasm handler still flags restore and stops loop', () => {
      delete map.wasmMap.handle_context_lost;

      const event = new window.Event('webglcontextlost', { cancelable: true });
      map.canvas.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(map._needsRestore).toBe(true);
      expect(map._rafId).toBeUndefined();
    });

    test('webglcontextrestored reinitializes the canvas, notifies wasm, restarts the render loop', () => {
      // Lose first so the restore path has something to recover from.
      map.canvas.dispatchEvent(new window.Event('webglcontextlost'));
      expect(map._needsRestore).toBe(true);

      const canvasId = map.canvas.id;
      map.canvas.dispatchEvent(new window.Event('webglcontextrestored'));

      expect(map.wasmMap.handle_context_restored).toHaveBeenCalledTimes(1);
      expect(wasmMock.rustyleafmap_init_canvas).toHaveBeenCalledWith(
        map.wasmMap.ptr,
        canvasId
      );
      expect(map._needsRestore).toBe(false);
      expect(map._rafId).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // WebGL support fallbacks (src lines 63-106, 160-195)
  // ------------------------------------------------------------------
  describe('WebGL-not-supported fallback UI', () => {
    // setup.ts installs getContext via a NON-configurable defineProperty, so
    // jest.spyOn on the prototype would fail. Route all canvas creation
    // through a createElement spy instead and strip contexts there — this
    // drives checkWebGLSupport()'s `!gl` branch (level 'none').
    function breakAllCanvases(): jest.SpyInstance {
      const realCreate = document.createElement.bind(document);
      return jest.spyOn(document, 'createElement').mockImplementation(((tag: string, opts?: any) => {
        const el = realCreate(tag, opts);
        if ((el as any) instanceof HTMLCanvasElement || String(tag).toLowerCase() === 'canvas') {
          (el as any).getContext = () => null;
        }
        return el;
      }) as any);
    }

    test('constructor renders fallback UI and throws when WebGL is unavailable', () => {
      const createSpy = breakAllCanvases();
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const el = document.createElement('div');
      document.body.appendChild(el);

      expect(() => new Map(el, { center: [48.8566, 2.3522], zoom: 12 })).toThrow(
        'WebGL not supported'
      );

      const html = el.innerHTML;
      expect(html).toContain('WebGL Not Supported');
      // level === 'none' from the !gl branch
      expect(html).toContain('Support level: none');
      // error field present -> error paragraph rendered
      expect(html).toContain('Error: WebGL not available');
      expect(createSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    test('init_canvas failure renders the initialization-failed UI and rethrows', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const protoSpy = jest
        .spyOn(wasmMock.RustyleafMap.prototype, 'init_canvas')
        .mockImplementation(() => {
          throw new Error('boom: bad context');
        });

      const el = document.createElement('div');
      document.body.appendChild(el);

      expect(() => new Map(el, {})).toThrow('boom: bad context');
      expect(el.innerHTML).toContain('WebGL Initialization Failed');
      expect(el.innerHTML).toContain('boom: bad context');
      protoSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  // ------------------------------------------------------------------
  // setView clamping / fitBounds / invalidateSize (src lines 309-327, 438-446, 490-515)
  // ------------------------------------------------------------------
  describe('setView clamping with maxBounds', () => {
    test('without maxBounds, coordinates pass through unclamped', () => {
      const map = makeMap();
      map.setView([-33.9, 151.2], 10);
      expect(map.getCenter()).toEqual([-33.9, 151.2]);
      expect(map.getZoom()).toBe(10);
      map.remove();
    });

    test('setMaxBounds stores bounds and re-clamps current view', () => {
      const map = makeMap();
      map.setMaxBounds([
        [40, -10],
        [50, 10],
      ]);
      expect(map.getMaxBounds()).toEqual([
        [40, -10],
        [50, 10],
      ]);
      // Paris center (48.85, 2.35) is inside the box — untouched.
      expect(map.getCenter()).toEqual([48.8566, 2.3522]);
      map.remove();
    });

    test('setMaxBounds(null) clears bounds without touching the view', () => {
      const map = makeMap();
      wasmMock.rustyleafmap_set_view.mockClear();
      map.setMaxBounds(null);
      expect(map.getMaxBounds()).toBeNull();
      expect(wasmMock.rustyleafmap_set_view).not.toHaveBeenCalled();
      map.remove();
    });

    test('setView clamps out-of-bounds targets into maxBounds (min/max normalization)', () => {
      const map = makeMap();
      // Deliberately reversed corners: _clampToMaxBounds min/max-normalizes.
      map.setMaxBounds([
        [50, 10],
        [40, -10],
      ]);
      map.setView([65, 25], 8);
      const [lat, lng] = map.getCenter();
      expect(lat).toBe(50); // clamped to maxLat
      expect(lng).toBe(10); // clamped to maxLng

      map.setView([10, -40], 8);
      const [lat2, lng2] = map.getCenter();
      expect(lat2).toBe(40); // clamped to minLat
      expect(lng2).toBe(-10); // clamped to minLng
      map.remove();
    });

    test('in-bounds targets within maxBounds are unchanged', () => {
      const map = makeMap();
      map.setMaxBounds([
        [40, -10],
        [50, 10],
      ]);
      map.setView([44, 5], 9);
      expect(map.getCenter()).toEqual([44, 5]);
      map.remove();
    });

    test('setView rejects malformed centers and out-of-range zooms', () => {
      const map = makeMap();
      expect(() => map.setView([91, 0], 5)).toThrow(/Invalid center/);
      expect(() => map.setView('paris' as any, 5)).toThrow(/Invalid center/);
      expect(() => map.setView([NaN, 2], 5)).toThrow(/Invalid center/);
      expect(() => map.setView([48, 181], 5)).toThrow(/Invalid center/);
      expect(() => map.setView([48, 2], 25)).toThrow(/Invalid zoom level/);
      expect(() => map.setView([48, 2], NaN)).toThrow(/Invalid zoom level/);
      expect(() => map.setView([48, 2], 'high' as any)).toThrow(/Invalid zoom level/);
      map.remove();
    });
  });

  describe('fitBounds', () => {
    test('flattens the [[sw],[ne]] bounds array for the wasm call', () => {
      const map = makeMap();
      wasmMock.rustyleafmap_fit_bounds.mockClear();
      map.fitBounds([
        [48.1, 2.2],
        [48.9, 2.5],
      ]);
      // wasm methods receive (ptr, ...args) in the glue layer.
      expect(wasmMock.rustyleafmap_fit_bounds).toHaveBeenCalledWith(
        map.wasmMap.ptr,
        [48.1, 2.2, 48.9, 2.5]
      );
      expect(map.fitBounds([[48, 2], [49, 3]])).toBe(map); // chainable
      map.remove();
    });

    test('flyToBounds delegates to fitBounds', () => {
      const map = makeMap();
      wasmMock.rustyleafmap_fit_bounds.mockClear();
      map.flyToBounds([
        [10, 20],
        [30, 40],
      ]);
      expect(wasmMock.rustyleafmap_fit_bounds).toHaveBeenCalledWith(
        map.wasmMap.ptr,
        [10, 20, 30, 40]
      );
      map.remove();
    });
  });

  describe('invalidateSize', () => {
    test('re-reads container size, resizes wasm viewport and fires resize', async () => {
      const map = makeMap();
      wasmMock.rustyleafmap_resize.mockClear();

      const sizes: any[] = [];
      map.on('resize', (e: any) => sizes.push(e));

      expect(map.invalidateSize()).toBe(map); // chainable

      // setup.ts mocks getBoundingClientRect to 800x600.
      expect(wasmMock.rustyleafmap_resize).toHaveBeenCalledWith(map.wasmMap.ptr, 800, 600);
      await flushMicrotasks();
      expect(sizes).toHaveLength(1);
      expect(sizes[0].type).toBe('resize');
      expect(sizes[0].newSize).toEqual([800, 600]);
      expect(map.width).toBe(800);
      expect(map.height).toBe(600);
      map.remove();
    });
  });

  // ------------------------------------------------------------------
  // flyTo option-shape branches (src lines 451-459)
  // ------------------------------------------------------------------
  describe('flyTo option-shape branches', () => {
    test('numeric second arg + explicit duration 0 flies immediately', () => {
      const map = makeMap();
      map.flyTo([46.5, 5.0], 15, { duration: 0 });
      expect(map.getCenter()).toEqual([46.5, 5.0]);
      expect(map.getZoom()).toBe(15);
      map.remove();
    });

    // NOTE: setup.ts defines window.performance as a read-only property, which
    // breaks jest.useFakeTimers() (@sinonjs/fake-timers tries to hijack it).
    // So these animation tests use real timers with short durations instead.
    test('numeric second arg animates over the given duration', async () => {
      const map = makeMap();
      map.flyTo([47.0, 6.0], 14, { duration: 120 });
      // Mid-flight: not there yet.
      await new Promise((r) => setTimeout(r, 40));
      const [midLat] = map.getCenter();
      expect(midLat).toBeGreaterThan(47.0);
      expect(midLat).toBeLessThan(48.8566);
      // Complete.
      await new Promise((r) => setTimeout(r, 250));
      expect(map.getCenter()).toEqual([47.0, 6.0]);
      expect(map.getZoom()).toBe(14);
      expect(map._flyTimer).toBeNull();
      map.remove();
    });

    test('options object as second arg supplies zoom + duration', () => {
      const map = makeMap();
      map.flyTo([45.0, 7.0], { zoom: 13, duration: 0 });
      expect(map.getCenter()).toEqual([45.0, 7.0]);
      expect(map.getZoom()).toBe(13);
      map.remove();
    });

    test('no second arg keeps the current zoom and animates position only', async () => {
      const map = makeMap(); // zoom 12
      map.flyTo([49.5, 1.5], { duration: 100 });
      await new Promise((r) => setTimeout(r, 300));
      expect(map.getCenter()).toEqual([49.5, 1.5]);
      expect(map.getZoom()).toBe(12); // unchanged targetZoom = fromZoom
      map.remove();
    });

    test('a new flyTo cancels an in-flight one (timer cleanup)', async () => {
      const map = makeMap();
      map.flyTo([60, 10], { duration: 500 }); // starts interval
      const firstTimer = map._flyTimer;
      expect(firstTimer).not.toBeNull();
      map.flyTo([50, 4], { duration: 0 }); // cancels previous, lands instantly
      expect(map.getCenter()).toEqual([50, 4]);
      await new Promise((r) => setTimeout(r, 700)); // old animation must NOT resume
      expect(map.getCenter()).toEqual([50, 4]);
      map.remove();
    });
  });

  // ------------------------------------------------------------------
  // Geolocation (src lines 517-552)
  // ------------------------------------------------------------------
  describe('locate() / stopLocate()', () => {
    type GeoCbs = {
      success: (pos: any) => void;
      error: (err: any) => void;
      options: any;
    };

    function stubGeolocation(): { geo: any; calls: GeoCbs[] } {
      const calls: GeoCbs[] = [];
      const geo = {
        getCurrentPosition: jest.fn((success: any, error: any, options: any) => {
          calls.push({ success, error, options });
        }),
        watchPosition: jest.fn((success: any, error: any, options: any) => {
          calls.push({ success, error, options });
          return 77;
        }),
        clearWatch: jest.fn(),
      };
      Object.defineProperty(navigator, 'geolocation', {
        value: geo,
        configurable: true,
      });
      return { geo, calls };
    }

    test('no geolocation available fires locationerror with code 0', () => {
      const map = makeMap();
      const errors: any[] = [];
      map.on('locationerror', (e: any) => errors.push(e));

      expect(map.locate()).toBe(map);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(0);
      expect(errors[0].message).toBe('Geolocation is not available');
      map.remove();
    });

    test('successful fix fires locationfound with latlng + accuracy', async () => {
      const map = makeMap();
      const { calls } = stubGeolocation();
      const found: any[] = [];
      map.on('locationfound', (e: any) => found.push(e));

      map.locate();
      expect(calls).toHaveLength(1);

      calls[0].success({ coords: { latitude: 48.9, longitude: 2.4, accuracy: 12.5 } });
      expect(found).toHaveLength(1);
      expect(found[0].latlng).toEqual([48.9, 2.4]);
      expect(found[0].accuracy).toBe(12.5);
      // No setView option -> view untouched.
      expect(map.getCenter()).toEqual([48.8566, 2.3522]);
      map.remove();
    });

    test('options.setView pans to the fix, honoring maxZoom', () => {
      const map = makeMap(); // zoom 12
      const { calls } = stubGeolocation();

      map.locate({ setView: true, maxZoom: 11 });
      calls[0].success({ coords: { latitude: 48.9, longitude: 2.4, accuracy: 5 } });
      expect(map.getCenter()).toEqual([48.9, 2.4]);
      expect(map.getZoom()).toBe(11); // min(currentZoom=12, maxZoom=11)

      // Without maxZoom, keeps current zoom.
      map.locate({ setView: true });
      calls[1].success({ coords: { latitude: 47, longitude: 3, accuracy: 5 } });
      expect(map.getZoom()).toBe(11);
      map.remove();
    });

    test('position error surfaces as locationerror with code + message', () => {
      const map = makeMap();
      const { calls } = stubGeolocation();
      const errors: any[] = [];
      map.on('locationerror', (e: any) => errors.push(e));

      map.locate();
      calls[0].error({ code: 1, message: 'User denied geolocation prompt' });

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(1);
      expect(errors[0].message).toBe('User denied geolocation prompt');
      map.remove();
    });

    test('geo options are forwarded (enableHighAccuracy, timeout, maximumAge)', () => {
      const map = makeMap();
      const { calls } = stubGeolocation();

      map.locate({ enableHighAccuracy: true, timeout: 2500, maximumAge: 30000 });
      expect(calls[0].options).toEqual({
        enableHighAccuracy: true,
        timeout: 2500,
        maximumAge: 30000,
      });

      // Defaults when omitted.
      map.locate();
      expect(calls[1].options).toEqual({
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0,
      });
      map.remove();
    });

    test('options.watch uses watchPosition; stopLocate clears it once', () => {
      const map = makeMap();
      const { geo, calls } = stubGeolocation();

      map.locate({ watch: true });
      expect(geo.watchPosition).toHaveBeenCalledTimes(1);
      expect(geo.getCurrentPosition).not.toHaveBeenCalled();
      expect(calls).toHaveLength(1);
      expect(map._locateWatchId).toBe(77);

      expect(map.stopLocate()).toBe(map);
      expect(geo.clearWatch).toHaveBeenCalledWith(77);
      expect(map._locateWatchId).toBeNull();

      // Second stopLocate is a no-op.
      geo.clearWatch.mockClear();
      map.stopLocate();
      expect(geo.clearWatch).not.toHaveBeenCalled();
      map.remove();
    });

    test('stopLocate without a prior watch is a safe no-op', () => {
      const map = makeMap();
      const { geo } = stubGeolocation();
      expect(map.stopLocate()).toBe(map);
      expect(geo.clearWatch).not.toHaveBeenCalled();
      map.remove();
    });
  });

  // ------------------------------------------------------------------
  // Event API: on / once / off / context (src lines 601-677)
  // ------------------------------------------------------------------
  describe('on / once / off / context', () => {
    let map: any;

    beforeEach(() => {
      map = makeMap();
    });

    afterEach(() => {
      if (map && !map._destroyed) map.remove();
    });

    test('on() with a non-function callback is ignored but chainable', () => {
      expect(map.on('click', undefined as any)).toBe(map);
      expect(map.on('click', null as any)).toBe(map);
    });

    test('once() on a local event fires exactly once across repeated triggers', () => {
      const cb = jest.fn();
      map.once('resize', cb);
      map.invalidateSize();
      map.invalidateSize();
      map.invalidateSize();
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test('once() on a wasm-deferred event guards against double dispatch', async () => {
      const cb = jest.fn();
      map.once('click', cb);

      wasmMock.fire(map.wasmMap.ptr, 'click', { type: 'click', x: 1, y: 2 });
      wasmMock.fire(map.wasmMap.ptr, 'click', { type: 'click', x: 3, y: 4 });
      await flushMicrotasks();

      expect(cb).toHaveBeenCalledTimes(1);
    });

    test('once() passes the payload through to the callback', async () => {
      const cb = jest.fn();
      map.once('click', cb);
      wasmMock.fire(map.wasmMap.ptr, 'click', { type: 'click', x: 9, y: 8 });
      await flushMicrotasks();
      expect(cb).toHaveBeenCalledWith({ type: 'click', x: 9, y: 8 });
    });

    test('off(event) removes ALL handlers for that event (local events)', async () => {
      const a = jest.fn();
      const b = jest.fn();
      const c = jest.fn();
      map.on('resize', a);
      map.on('resize', b);
      // An unrelated event must survive off('resize').
      map.on('dragstart', c);

      map.off('resize');

      map.invalidateSize();
      await flushMicrotasks();
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();

      map._fireLocalEvent('dragstart', { type: 'dragstart' });
      expect(c).toHaveBeenCalledTimes(1);
    });

    test('off(event) removes ALL handlers for that event (wasm events)', async () => {
      const a = jest.fn();
      const b = jest.fn();
      map.on('click', a);
      map.on('click', b);

      wasmMock.rustyleafmap_off_click.mockClear();
      map.off('click');
      // Both user wrapped entries were unregistered on the wasm side (plus
      // the internal marker-interactivity handler registered in the
      // constructor), so >= 2 off_click calls for our two handlers.
      expect(wasmMock.rustyleafmap_off_click.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(map._listeners['click'].length).toBe(0);
      expect(map._localEvents['click']).toEqual([]);
    });

    test('off(event) removes ALL handlers for that event (local events)', () => {
      const a = jest.fn();
      const b = jest.fn();
      const c = jest.fn();
      map.on('resize', a);
      map.on('resize', b);
      map.on('dragstart', c);

      map.off('resize');

      map.invalidateSize();
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
      // An unrelated event survives off('resize').
      map._fireLocalEvent('dragstart', { type: 'dragstart' });
      expect(c).toHaveBeenCalledTimes(1);
    });

    test('off(event, callback) removes just that handler (wasm events)', async () => {
      const a = jest.fn();
      const b = jest.fn();
      map.on('click', a);
      map.on('click', b);

      // The mock core's off_click doesn't unregister from its dispatch list,
      // so assert at the wrapper boundary: after off, `a`'s entry is gone
      // from _listeners while `b`'s remains.
      const beforeA = map._listeners['click'].length;

      wasmMock.rustyleafmap_off_click.mockClear();
      map.off('click', a);
      expect(wasmMock.rustyleafmap_off_click).toHaveBeenCalledTimes(1);
      expect(map._listeners['click'].length).toBe(beforeA - 1);
      expect(map._listeners['click'].some((e: any) => e.callback === b)).toBe(true);
    });

    test('off(event, originalCallback) resolves the wrapped entry for wasm events', () => {
      const a = jest.fn();
      map.on('click', a);
      map.off('click', a); // original fn, not the wrapper

      // Only the internal marker-interactivity entry may remain.
      expect(map._listeners['click'].some((e: any) => e.callback === a)).toBe(false);
      expect(a).not.toHaveBeenCalled();
    });

    test('context argument is applied as `this` for local events', () => {
      const ctx = { tag: 'ctx-local' };
      let receivedThis: any;
      map.on('resize', function (this: any) { // eslint-disable-line @typescript-eslint/no-this-alias
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        receivedThis = this;
      }, ctx);

      map.invalidateSize();
      expect(receivedThis).toBe(ctx);
    });

    test('context argument is applied as `this` for wasm events (deferred)', async () => {
      const ctx = { tag: 'ctx-wasm' };
      const cb = jest.fn(function (this: any) {});
      map.on('click', cb, ctx);

      wasmMock.fire(map.wasmMap.ptr, 'click', { type: 'click' });
      await flushMicrotasks();

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.instances[0]).toBe(ctx);
    });

    test('handlers default to the map as `this` when no context given', () => {
      let receivedThis: any;
      map.on('resize', function (this: any) { // eslint-disable-line @typescript-eslint/no-this-alias
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        receivedThis = this;
      });
      map.invalidateSize();
      expect(receivedThis).toBe(map);
    });

    test('a throwing handler does not prevent other handlers from running', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const good = jest.fn();
      map.on('resize', () => {
        throw new Error('handler exploded');
      });
      map.on('resize', good);

      map.invalidateSize();
      expect(good).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
