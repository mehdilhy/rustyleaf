/**
 * Real-source tests for uncovered region H.
 *
 * Target ranges in src/rustyleaf-api.js (task ranges were slightly stale —
 * actual mapped locations noted per describe block):
 *   - Constructor/handler options: options are stored verbatim (line ~241),
 *     addHandler enable-if-truthy branch (247-252), setView zoom validation
 *     (320-322), panBy arg forms (331-339), zoomIn/zoomOut loops (341-351),
 *     custom maxBounds via setMaxBounds/_clampToMaxBounds (490-509).
 *   - Evented edges: on/off with context, off(type) removes ALL, once()
 *     re-fire guard, _fireLocalEvent error isolation (554-677).
 *   - Drag edges + cursor styles + marker interactivity (689-897):
 *     global mouseup outside canvas, cursor transitions, _registerMarker/
 *     _unregisterMarker/_topmostMarkerAt/_updateMarkerHover,
 *     _setupMarkerInteractivity click→popup auto-open (872-885).
 *   - Box zoom edges (1095-1112): min-size threshold both axes.
 *   - Popup autoClose (actual impl 1750-1800, tracked via _activePopup
 *     1487-1509, Map.closePopup 384-389).
 *   - Tooltip move/zoom rebinding fns (3534-3545) + offset option handling.
 *
 * Run: npx jest --config jest.real.config.js tests-real/InitAndEvents.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from '../tests/__mocks__/wasmMock';
const { Map, Marker, Popup, Tooltip } = RustyleafAPI as any;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeMap(options: any = {}): any {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12, ...options });
}

function mouseEvent(type: string, opts: any = {}) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 100,
    clientY: 100,
    ...opts,
  });
}

// Minimal duck-typed marker for _topmostMarkerAt/_updateMarkerHover unit tests.
// The wasm mock projects EVERY latlng to screen [400, 300].
function fakeMarker(opts: any = {}) {
  return {
    getLatLng: () => opts.latlng || [48.85, 2.35],
    getOpacity: () => (opts.opacity !== undefined ? opts.opacity : 1),
    getZIndexOffset: () => (opts.z !== undefined ? opts.z : 0),
    _size: opts.size || 14,
    fire: opts.fire || jest.fn(),
  };
}

describe('Constructor / handler options (real source)', () => {
  afterEach(() => {
    if ((global as any).__lastMap && !(global as any).__lastMap._destroyed) {
      (global as any).__lastMap.remove();
    }
  });

  test('Leaflet-style handler-disabling options are stored verbatim on map.options', () => {
    const map = makeMap({
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      keyboard: false,
    });
    (global as any).__lastMap = map;
    expect(map.options.zoomControl).toBe(false);
    expect(map.options.attributionControl).toBe(false);
    expect(map.options.doubleClickZoom).toBe(false);
    expect(map.options.scrollWheelZoom).toBe(false);
    expect(map.options.keyboard).toBe(false);
  });

  test('addHandler enables the handler when the same-named option is truthy', () => {
    class FakeHandler {
      enabled = false;
      constructor(public map: any) {}
      enable() { this.enabled = true; }
      disable() { this.enabled = false; }
    }
    const map = makeMap({ doubleClickZoom: true });
    (global as any).__lastMap = map;
    map.addHandler('doubleClickZoom', FakeHandler);
    expect(map.doubleClickZoom).toBeInstanceOf(FakeHandler);
    expect(map.doubleClickZoom.enabled).toBe(true);
  });

  test('addHandler does NOT enable the handler when the option is falsy', () => {
    class FakeHandler {
      enabled = false;
      constructor(public map: any) {}
      enable() { this.enabled = true; }
      disable() { this.enabled = false; }
    }
    const map = makeMap({ scrollWheelZoom: false });
    (global as any).__lastMap = map;
    map.addHandler('scrollWheelZoom', FakeHandler);
    expect(map.scrollWheelZoom.enabled).toBe(false);
  });

  test('setView rejects out-of-range / NaN zoom (lines 320-322)', () => {
    const map = makeMap();
    (global as any).__lastMap = map;
    expect(() => map.setView([48.85, 2.35], 99)).toThrow(/Invalid zoom level/);
    expect(() => map.setView([48.85, 2.35], NaN)).toThrow(/Invalid zoom level/);
    expect(() => map.setView([48.85, 2.35], -1)).toThrow(/Invalid zoom level/);
  });

  test('panBy accepts [x,y] array, {x,y} object, and (dx,dy) pair', () => {
    const map = makeMap();
    (global as any).__lastMap = map;

    wasmMock.rustyleafmap_pan.mockClear();
    map.panBy([10, -20]);
    expect(wasmMock.rustyleafmap_pan).toHaveBeenLastCalledWith(expect.anything(), 10, -20);

    map.panBy({ x: 5, y: 6 });
    expect(wasmMock.rustyleafmap_pan).toHaveBeenLastCalledWith(expect.anything(), 5, 6);

    map.panBy(3, 4);
    expect(wasmMock.rustyleafmap_pan).toHaveBeenLastCalledWith(expect.anything(), 3, 4);

    // {y} only: no 'x' key → NOT treated as an offset object; dx coerces to 0
    map.panBy({ y: 7 } as any);
    expect(wasmMock.rustyleafmap_pan).toHaveBeenLastCalledWith(expect.anything(), 0, 0);
  });

  test('zoomIn(delta)/zoomOut(delta) forward N zoom steps to wasm', () => {
    const map = makeMap();
    (global as any).__lastMap = map;
    const zin = jest.spyOn(map.wasmMap, 'zoom_in');
    const zout = jest.spyOn(map.wasmMap, 'zoom_out');

    map.zoomIn(3);
    expect(zin).toHaveBeenCalledTimes(3);
    map.zoomOut(2);
    expect(zout).toHaveBeenCalledTimes(2);

    zin.mockRestore();
    zout.mockRestore();
  });

  test('custom maxBounds: setView clamps the requested center into bounds', () => {
    const map = makeMap();
    (global as any).__lastMap = map;
    map.setMaxBounds([[40, -10], [50, 10]]);
    expect(map.getMaxBounds()).toEqual([[40, -10], [50, 10]]);

    map.setView([80, 150], 12);
    const center = map.getCenter();
    expect(center[0]).toBe(50);
    expect(center[1]).toBe(10);
  });

  test('setMaxBounds(null) disables clamping', () => {
    const map = makeMap();
    (global as any).__lastMap = map;
    map.setMaxBounds([[40, -10], [50, 10]]);
    map.setMaxBounds(null);
    expect(map.getMaxBounds()).toBeNull();

    map.setView([80, 150], 12);
    expect(map.getCenter()).toEqual([80, 150]);
  });
});

describe('Evented edge cases: on/off/once/_fireLocalEvent (real source)', () => {
  let map: any;
  beforeEach(() => { map = makeMap(); });
  afterEach(() => { if (!map._destroyed) map.remove(); });

  test('on(event, cb, context) invokes local-event handler with the given context as this', () => {
    const ctx = { tag: 'ctx-local' };
    let seenThis: any = null;
    map.on('dragstart', function (this: any) { seenThis = this; }, ctx); // eslint-disable-line @typescript-eslint/no-this-alias
    map._fireLocalEvent('dragstart', { type: 'dragstart' });
    expect(seenThis).toBe(ctx);
  });

  test('on(event, cb, context) invokes wasm-event handler with the given context as this', async () => {
    const ctx = { tag: 'ctx-wasm' };
    let seenThis: any = null;
    map.on('click', function (this: any) { seenThis = this; }, ctx); // eslint-disable-line @typescript-eslint/no-this-alias
    wasmMock.fire(map.wasmMap.ptr, 'click', { type: 'click' });
    await flush();
    expect(seenThis).toBe(ctx);
  });

  test('on() with a non-function callback is a no-op that returns this', () => {
    expect(map.on('dragstart', undefined as any)).toBe(map);
    expect(map.on('dragstart', 'nope' as any)).toBe(map);
    map._fireLocalEvent('dragstart', {});
    expect(map._listeners.dragstart).toBeUndefined();
  });

  test('off(type) with no callback removes ALL local handlers for that type', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    map.on('dragstart', h1);
    map.on('dragstart', h2);

    expect(map.off('dragstart')).toBe(map);
    map._fireLocalEvent('dragstart', {});

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
    expect(map._listeners.dragstart).toHaveLength(0);
    expect(map._localEvents.dragstart).toHaveLength(0);
  });

  test('off(type) removes ALL wasm handlers for that type (off_* per entry)', () => {
    map.on('move', jest.fn());
    map.on('move', jest.fn());
    wasmMock.rustyleafmap_off_move.mockClear();

    map.off('move');

    expect(wasmMock.rustyleafmap_off_move).toHaveBeenCalledTimes(2);
    expect(map._listeners.move).toHaveLength(0);
  });

  test('off(type, cb) removes only the matching wasm handler entry', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    map.on('click', cb1);
    map.on('click', cb2);
    wasmMock.rustyleafmap_off_click.mockClear();

    map.off('click', cb1);

    // Only cb1's wrapped handler was passed to wasm off_click
    expect(wasmMock.rustyleafmap_off_click).toHaveBeenCalledTimes(1);
    // cb1's entry is gone; cb2 and the internal marker-click handler remain
    expect(map._listeners.click.some((e: any) => e.callback === cb1)).toBe(false);
    expect(map._listeners.click.some((e: any) => e.callback === cb2)).toBe(true);
  });

  test('once() fires exactly once for a local event even if re-fired', () => {
    const cb = jest.fn();
    map.once('dragstart', cb);

    map._fireLocalEvent('dragstart', {});
    map._fireLocalEvent('dragstart', {});

    expect(cb).toHaveBeenCalledTimes(1);
    // wrapper was unregistered after the first fire
    expect(map._listeners.dragstart).toHaveLength(0);
  });

  test('once() guard prevents double invocation when two wasm events queue before unregister', async () => {
    const cb = jest.fn();
    map.once('move', cb);

    // Two synchronous dispatches: both wrappers run before the first unregisters
    wasmMock.fire(map.wasmMap.ptr, 'move', {});
    wasmMock.fire(map.wasmMap.ptr, 'move', {});
    await flush();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('once() with a non-function callback is a no-op', () => {
    expect(map.once('dragstart', null as any)).toBe(map);
    map._fireLocalEvent('dragstart', {});
    expect(map._listeners.dragstart).toBeUndefined();
  });

  test('_fireLocalEvent isolates a throwing handler: later handlers still run, console.error reports', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const boom = jest.fn(() => { throw new Error('handler exploded'); });
      const survivor = jest.fn();
      map.on('dragstart', boom);
      map.on('dragstart', survivor);

      expect(() => map._fireLocalEvent('dragstart', {})).not.toThrow();

      expect(boom).toHaveBeenCalledTimes(1);
      expect(survivor).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(String(errSpy.mock.calls[0][0])).toMatch(/error in 'dragstart' handler/);
      expect(errSpy.mock.calls[0][1]).toBeInstanceOf(Error);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('Drag edges: global mouseup + cursor styles (real source)', () => {
  let map: any;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    map = makeMap();
    canvas = map.canvas as HTMLCanvasElement;
    wasmMock.rustyleafmap_handle_mouse_down.mockClear();
    wasmMock.rustyleafmap_handle_mouse_up.mockClear();
    wasmMock.rustyleafmap_on_mouse_move.mockClear();
  });
  afterEach(() => {
    document.dispatchEvent(mouseEvent('mouseup'));
    if (!map._destroyed) map.remove();
  });

  test('mouseup delivered on document (outside canvas) still ends the drag', () => {
    canvas.dispatchEvent(mouseEvent('mousedown', { clientX: 50, clientY: 60 }));
    expect(canvas.style.cursor).toBe('move');

    document.dispatchEvent(mouseEvent('mousemove', { clientX: 90, clientY: 80 }));
    wasmMock.rustyleafmap_on_mouse_move.mockClear();

    // Release far outside the canvas (negative viewport coords)
    document.dispatchEvent(mouseEvent('mouseup', { clientX: -500, clientY: -500 }));

    expect(wasmMock.rustyleafmap_handle_mouse_up).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe('grab');

    // Global listeners detached: moves no longer reach wasm
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 999 }));
    expect(wasmMock.rustyleafmap_on_mouse_move).not.toHaveBeenCalled();
  });

  test('mouseleave during an active drag keeps the "move" cursor', () => {
    canvas.dispatchEvent(mouseEvent('mousedown'));
    canvas.dispatchEvent(new Event('mouseleave'));
    expect(canvas.style.cursor).toBe('move');
  });

  test('idle cursor lifecycle: enter → "grab", leave → "default", restore after release', () => {
    canvas.dispatchEvent(new Event('mouseenter'));
    expect(canvas.style.cursor).toBe('grab');

    canvas.dispatchEvent(new Event('mouseleave'));
    expect(canvas.style.cursor).toBe('default');

    canvas.dispatchEvent(new Event('mouseenter'));
    canvas.dispatchEvent(mouseEvent('mousedown'));
    expect(canvas.style.cursor).toBe('move');

    document.dispatchEvent(mouseEvent('mouseup'));
    expect(canvas.style.cursor).toBe('grab');
  });
});

describe('Marker interactivity internals (real source, ~842-897)', () => {
  let map: any;
  beforeEach(() => { map = makeMap(); });
  afterEach(() => { if (!map._destroyed) map.remove(); });

  test('_registerMarker/_unregisterMarker maintain the registry and clear hover state', () => {
    const m = fakeMarker();
    map._registerMarker(m);
    expect(map._markerRegistry).toContain(m);

    map._hoveredMarker = m;
    map._unregisterMarker(m);
    expect(map._markerRegistry).not.toContain(m);
    expect(map._hoveredMarker).toBeNull();

    // Removing an unknown marker is a safe no-op
    expect(() => map._unregisterMarker(fakeMarker())).not.toThrow();
  });

  test('_topmostMarkerAt: hit inside radius, miss outside, transparent skipped, zIndexOffset wins', () => {
    const low = fakeMarker({ z: 0 });
    const high = fakeMarker({ z: 100 });
    map._registerMarker(low);
    map._registerMarker(high);

    // screen_xy is [400,300]; radius for size 14 = max(14/2+4, 10) = 11
    expect(map._topmostMarkerAt(405, 305)).toBe(high); // higher zIndexOffset wins
    expect(map._topmostMarkerAt(500, 500)).toBeNull(); // outside any radius

    const ghost = fakeMarker({ opacity: 0 });
    const visibleOnly = fakeMarker({ latlng: [10, 10] }); // still projected to [400,300]
    const empty = makeMap();
    try {
      empty._registerMarker(ghost);
      expect(empty._topmostMarkerAt(400, 300)).toBeNull(); // transparent ignored
      empty._registerMarker(visibleOnly);
      expect(empty._topmostMarkerAt(400, 300)).toBe(visibleOnly);
    } finally {
      if (!empty._destroyed) empty.remove();
    }
  });

  test('_updateMarkerHover fires mouseover/mouseout only on transitions', () => {
    const m = fakeMarker();
    map._registerMarker(m);

    map._updateMarkerHover(400, 300);
    expect(m.fire).toHaveBeenCalledWith('mouseover', expect.objectContaining({ type: 'mouseover' }));
    expect(map._hoveredMarker).toBe(m);

    // Same marker again → no duplicate event
    map._updateMarkerHover(400, 300);
    expect(m.fire).toHaveBeenCalledTimes(1);

    // Leave the hit radius → mouseout
    map._updateMarkerHover(900, 900);
    expect(m.fire).toHaveBeenCalledWith('mouseout', expect.objectContaining({ type: 'mouseout' }));
    expect(map._hoveredMarker).toBeNull();
  });

  test('map click over a marker fires marker "click" and auto-opens its bound popup with skip-auto-close flag', async () => {
    const marker = new Marker([48.85, 2.35]);
    marker.bindPopup('marker popup');
    marker.addTo(map);

    wasmMock.fire(map.wasmMap.ptr, 'click', {
      type: 'click',
      latlng: [48.85, 2.35],
      containerPoint: [403, 303], // within radius of screen_xy [400,300]
    });
    await flush();

    expect(marker.isPopupOpen()).toBe(true);
    const popup = marker.getPopup();
    expect(popup).toBeTruthy();
    expect(popup.isOpen).toBe(true);
    expect(popup._skipAutoCloseOnce).toBe(true);
  });
});

describe('Box zoom edges (real source, ~1072-1113)', () => {
  let map: any;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    map = makeMap();
    canvas = map.canvas as HTMLCanvasElement;
    wasmMock.rustyleafmap_fit_bounds.mockClear();
  });
  afterEach(() => {
    document.dispatchEvent(mouseEvent('mouseup'));
    if (!map._destroyed) map.remove();
    document.querySelectorAll('.rustyleaf-boxzoom').forEach((b) => b.remove());
  });

  test('wide-but-short drag (< 10px tall) aborts: no fitBounds, no boxzoomend, box removed', () => {
    const boxZoomEnd = jest.fn();
    map.on('boxzoomend', boxZoomEnd);

    canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true, clientX: 100, clientY: 100 }));
    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeTruthy();

    document.dispatchEvent(mouseEvent('mouseup', { clientX: 300, clientY: 104 }));

    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeNull();
    expect(wasmMock.rustyleafmap_fit_bounds).not.toHaveBeenCalled();
    expect(boxZoomEnd).not.toHaveBeenCalled();
  });

  test('tall-but-narrow drag (< 10px wide) aborts as well', () => {
    const boxZoomEnd = jest.fn();
    map.on('boxzoomend', boxZoomEnd);

    canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(mouseEvent('mouseup', { clientX: 106, clientY: 320 }));

    expect(wasmMock.rustyleafmap_fit_bounds).not.toHaveBeenCalled();
    expect(boxZoomEnd).not.toHaveBeenCalled();
    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeNull();
  });

  test('SOURCE GAP: Escape does not cancel an in-progress box zoom (no key handling exists)', () => {
    // The task brief expects Escape to cancel box zoom, but _startBoxZoom only
    // listens for mousemove/mouseup — there is no Escape handler in the source.
    // This test pins the CURRENT behavior so a future fix flips it deliberately.
    canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true, clientX: 100, clientY: 100 }));
    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeTruthy();

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    // Still active: box present, no zoom performed
    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeTruthy();
    expect(wasmMock.rustyleafmap_fit_bounds).not.toHaveBeenCalled();

    // Cleanup: release below threshold so nothing else leaks
    document.dispatchEvent(mouseEvent('mouseup', { clientX: 103, clientY: 102 }));
    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeNull();
  });
});

describe('Popup autoClose behavior (real source, ~1750-1800)', () => {
  let map: any;
  beforeEach(() => { map = makeMap(); });
  afterEach(() => {
    try { map.closePopup(); } catch (e) { /* noop */ }
    if (!map._destroyed) map.remove();
  });

  test('autoClose (default true) closes the popup on a later map click', async () => {
    const popupClose = jest.fn();
    map.on('popupclose', popupClose);

    const p = new Popup({ content: 'one' }).setLatLng([48.85, 2.35]).openOn(map);
    await flush();
    expect(p.isOpen).toBe(true);
    expect(map._activePopup).toBe(p);

    wasmMock.fire(map.wasmMap.ptr, 'click', { containerPoint: [5, 5] });
    await flush();

    expect(p.isOpen).toBe(false);
    expect(map._activePopup).toBeNull();
    expect(popupClose).toHaveBeenCalled();
  });

  test('autoClose:false popup survives map clicks (no click listener registered)', async () => {
    const p = new Popup({ content: 'sticky', autoClose: false }).setLatLng([48.85, 2.35]).openOn(map);
    await flush();

    wasmMock.fire(map.wasmMap.ptr, 'click', { containerPoint: [5, 5] });
    await flush();

    expect(p.isOpen).toBe(true);
    expect(map._activePopup).toBe(p);
  });

  test('a click targeting an element inside the popup does not close it', async () => {
    const p = new Popup({ content: 'safe' }).setLatLng([48.85, 2.35]).openOn(map);
    await flush();

    const inner = document.createElement('button');
    p.element.appendChild(inner);

    wasmMock.fire(map.wasmMap.ptr, 'click', { containerPoint: [5, 5], target: inner });
    await flush();

    expect(p.isOpen).toBe(true);
  });

  test('_skipAutoCloseOnce is consumed by the first click pass, next click closes', async () => {
    const p = new Popup({ content: 'fresh' }).setLatLng([48.85, 2.35]).openOn(map);
    await flush();
    p._skipAutoCloseOnce = true;

    wasmMock.fire(map.wasmMap.ptr, 'click', { containerPoint: [5, 5] });
    await flush();
    expect(p.isOpen).toBe(true);          // survived: flag consumed
    expect(p._skipAutoCloseOnce).toBe(false);

    wasmMock.fire(map.wasmMap.ptr, 'click', { containerPoint: [5, 5] });
    await flush();
    expect(p.isOpen).toBe(false);         // second click closes normally
  });

  test('opening a second popup re-points _activePopup; SOURCE GAP: first popup is not auto-closed on open', async () => {
    const p1 = new Popup({ content: 'first' }).setLatLng([48.85, 2.35]).openOn(map);
    await flush();
    const p2 = new Popup({ content: 'second' }).setLatLng([47.0, 2.0]).openOn(map);
    await flush();

    expect(map._activePopup).toBe(p2);
    // Current source behavior: openOn() never closes map._activePopup, so the
    // first popup element stays in the DOM (differs from Leaflet autoClose).
    // Pinned deliberately so a parity fix flips this assertion.
    expect(p1.isOpen).toBe(true);
    expect(p1.element.parentNode).toBe(map.containerElement);
  });

  test('Map.closePopup() closes whichever popup is active (lines 384-389)', async () => {
    const p = new Popup({ content: 'bye' }).setLatLng([48.85, 2.35]).openOn(map);
    await flush();

    expect(map.closePopup()).toBe(map);
    expect(p.isOpen).toBe(false);
    expect(map._activePopup).toBeNull();

    // Safe to call again with nothing open
    expect(map.closePopup()).toBe(map);
  });
});

describe('Tooltip move/zoom rebinding + offset (real source, ~3523-3570)', () => {
  afterEach(() => {
    try { (global as any).__lastTooltip && (global as any).__lastTooltip.close(); } catch (e) { /* noop */ }
    if ((global as any).__lastMap && !(global as any).__lastMap._destroyed) (global as any).__lastMap.remove();
  });

  test('offset option is stored on the tooltip', () => {
    const t = new Tooltip({ content: 'o', offset: [7, -7] });
    (global as any).__lastTooltip = t;
    expect(t.options.offset).toEqual([7, -7]);
  });

  test('SOURCE GAP: offset is not applied by _updatePosition (raw screen_xy only)', () => {
    // _updatePosition (3607-3613) sets left/top straight from screen_xy and
    // never reads options.offset. Pinned as documentation of current behavior.
    const map = makeMap();
    (global as any).__lastMap = map;
    const t = new Tooltip({ content: 'offset-me', offset: [25, 25] });
    (global as any).__lastTooltip = t;
    t.setLatLng([48.85, 2.35]).openOn(map);
    expect(t.element.style.left).toBe('400px'); // no +25 applied
    expect(t.element.style.top).toBe('300px');  // no +25 applied
  });

  test('after openOn + flush, wasm move events reposition the open tooltip (3536-3537)', async () => {
    const map = makeMap();
    (global as any).__lastMap = map;
    const t = new Tooltip({ content: 'anchored' });
    (global as any).__lastTooltip = t;
    t.setLatLng([48.85, 2.35]).openOn(map);
    await flush();

    wasmMock.rustyleafmap_screen_xy.mockClear();
    wasmMock.fire(map.wasmMap.ptr, 'move', {});
    await flush();
    expect(wasmMock.rustyleafmap_screen_xy).toHaveBeenCalled();
    expect(t.element.style.left).toBe('400px');

    wasmMock.fire(map.wasmMap.ptr, 'zoom', {});
    await flush();
    expect(wasmMock.rustyleafmap_screen_xy).toHaveBeenCalledTimes(2);
  });

  test('tooltip.close() unbinds move/zoom: no further repositioning afterwards', async () => {
    const map = makeMap();
    (global as any).__lastMap = map;
    const t = new Tooltip({ content: 'closing' });
    (global as any).__lastTooltip = t;
    t.setLatLng([48.85, 2.35]).openOn(map);
    await flush();

    t.close();
    wasmMock.rustyleafmap_screen_xy.mockClear();

    wasmMock.fire(map.wasmMap.ptr, 'move', {});
    wasmMock.fire(map.wasmMap.ptr, 'zoom', {});
    await flush();

    expect(wasmMock.rustyleafmap_screen_xy).not.toHaveBeenCalled();
    expect(t.isOpenTooltip()).toBe(false);
    expect(t.getElement()).toBeNull();
  });
});
