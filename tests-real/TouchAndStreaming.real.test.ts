/**
 * TouchAndStreaming.real.test.ts
 *
 * Real-source coverage for uncovered region B of src/rustyleaf-api.js:
 *   (a) _setupTouchHandlers (lines ~923-1068): touchstart/touchmove/touchend/
 *       touchcancel on map.canvas — single-finger drag pan, two-finger pinch
 *       zoom, double-tap zoom, long-press contextmenu, pinch→pan handoff.
 *       jsdom has no TouchEvent, so we dispatch plain Events with touch-ish
 *       properties assigned (exactly what the handler reads: touches,
 *       changedTouches, type + preventDefault).
 *   (b) GeoJSONLayer.loadFile (lines ~2964-3022): FileReader-based chunked
 *       loading with progressCallback/completeCallback/errorCallback.
 *
 * Note on timers: the handler reads performance.now() for tap timing. jsdom's
 * window.performance is read-only so jest cannot fake it directly — we fake
 * timers with doNotFake:['performance'] and drive performance.now() with our
 * own spy.
 *
 * Run: npx jest --config jest.real.config.js tests-real/TouchAndStreaming.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from '../tests/__mocks__/wasmMock';
const { Map, GeoJSONLayer } = RustyleafAPI as any;

function makeMap(): any {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

/** Plain object shaped like a Touch — only clientX/clientY are read. */
function pt(clientX: number, clientY: number) {
  return { clientX, clientY };
}

/**
 * jsdom lacks TouchEvent. The handler only reads e.touches, e.changedTouches,
 * e.type and calls e.preventDefault(), so a cancelable Event with those
 * props assigned is a faithful stand-in.
 */
function touchEvent(type: string, touches: any[], changedTouches?: any[]) {
  return Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), {
    touches,
    changedTouches: changedTouches !== undefined ? changedTouches : touches,
  });
}

/** Mock wasm methods receive (ptr, ...realArgs) — drop the leading ptr. */
function lastRealArgs(fn: jest.Mock): any[] {
  return fn.mock.calls[fn.mock.calls.length - 1].slice(1);
}

const FC_TEXT = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.3522, 48.8566] }, properties: { name: 'Paris' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1276, 51.5072] }, properties: { name: 'London' } },
  ],
});

describe('Touch gesture handling (real source, lines ~923-1068)', () => {
  let map: any;
  let canvas: HTMLCanvasElement;
  // Drives performance.now() so double-tap / long-press windows are testable
  // alongside fake setTimeout timers.
  let nowVal: number;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useRealTimers();
    nowVal = 10_000;
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => nowVal);
    map = makeMap();
    canvas = map.canvas as HTMLCanvasElement;
    // jsdom rects are zero-sized; pin them so canvasPoint's scale factor is 1
    // and client coords pass through to wasm unchanged.
    jest
      .spyOn(canvas, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: canvas.width, height: canvas.height } as any);
    [
      wasmMock.rustyleafmap_handle_mouse_down,
      wasmMock.rustyleafmap_handle_mouse_up,
      wasmMock.rustyleafmap_on_mouse_move,
      wasmMock.rustyleafmap_on_wheel,
      wasmMock.rustyleafmap_handle_contextmenu,
    ].forEach((m) => m.mockClear());
  });

  afterEach(() => {
    jest.useRealTimers();
    if (map && !map._destroyed) map.remove();
    nowSpy.mockRestore();
    jest.restoreAllMocks();
  });

  /** Advance both the clock (performance.now) and fake timers. */
  function tick(ms: number) {
    nowVal += ms;
    jest.advanceTimersByTime(ms);
  }

  function startFakingTimers() {
    jest.useFakeTimers({ doNotFake: ['performance'] });
  }

  test('single-finger drag: touchstart→handle_mouse_down, touchmove→on_mouse_move, touchend→handle_mouse_up', () => {
    canvas.dispatchEvent(touchEvent('touchstart', [pt(50, 60)]));
    expect(wasmMock.rustyleafmap_handle_mouse_down).toHaveBeenCalledTimes(1);
    expect(lastRealArgs(wasmMock.rustyleafmap_handle_mouse_down)).toEqual([50, 60]);

    canvas.dispatchEvent(touchEvent('touchmove', [pt(80, 90)]));
    expect(wasmMock.rustyleafmap_on_mouse_move).toHaveBeenCalledTimes(1);
    expect(lastRealArgs(wasmMock.rustyleafmap_on_mouse_move)).toEqual([80, 90]);

    canvas.dispatchEvent(touchEvent('touchend', [], [pt(100, 110)]));
    expect(wasmMock.rustyleafmap_handle_mouse_up).toHaveBeenCalledTimes(1);
    expect(lastRealArgs(wasmMock.rustyleafmap_handle_mouse_up)).toEqual([100, 110]);

    // touchMode reset: further moves are ignored
    wasmMock.rustyleafmap_on_mouse_move.mockClear();
    canvas.dispatchEvent(touchEvent('touchmove', [pt(120, 120)]));
    expect(wasmMock.rustyleafmap_on_mouse_move).not.toHaveBeenCalled();
  });

  test('touch events call preventDefault (handlers registered non-passive)', () => {
    const ev = touchEvent('touchstart', [pt(10, 10)]);
    canvas.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  test('long-press (~500ms) fires contextmenu pipeline at the touch point', () => {
    startFakingTimers();
    canvas.dispatchEvent(touchEvent('touchstart', [pt(33, 44)]));
    expect(wasmMock.rustyleafmap_handle_contextmenu).not.toHaveBeenCalled();

    tick(499);
    expect(wasmMock.rustyleafmap_handle_contextmenu).not.toHaveBeenCalled();

    tick(1);
    expect(wasmMock.rustyleafmap_handle_contextmenu).toHaveBeenCalledTimes(1);
    expect(lastRealArgs(wasmMock.rustyleafmap_handle_contextmenu)).toEqual([33, 44]);
  });

  test('movement beyond the 12px slop cancels the pending long-press', () => {
    startFakingTimers();
    canvas.dispatchEvent(touchEvent('touchstart', [pt(50, 50)]));
    // 30px move > MOVE_SLOP_PX → long-press timer cleared
    canvas.dispatchEvent(touchEvent('touchmove', [pt(80, 50)]));
    tick(1000);
    expect(wasmMock.rustyleafmap_handle_contextmenu).not.toHaveBeenCalled();
  });

  test('lifting the finger before 500ms cancels the long-press (quick tap, no contextmenu)', () => {
    startFakingTimers();
    canvas.dispatchEvent(touchEvent('touchstart', [pt(50, 50)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(50, 50)]));
    tick(1000);
    expect(wasmMock.rustyleafmap_handle_contextmenu).not.toHaveBeenCalled();
  });

  test('two-finger pinch spread maps scale ratio onto wheel-zoom at the midpoint', () => {
    // Finger 1 lands (pan armed), finger 2 lands (pan cancelled, pinch starts)
    canvas.dispatchEvent(touchEvent('touchstart', [pt(100, 100)]));
    canvas.dispatchEvent(touchEvent('touchstart', [pt(100, 100), pt(200, 100)]));
    expect(lastRealArgs(wasmMock.rustyleafmap_handle_mouse_up)).toEqual([100, 100]);

    // spread 100px → 160px: deltaY = -(160/100 - 1) * 600 ≈ -360, mid = (180, 100)
    canvas.dispatchEvent(touchEvent('touchmove', [pt(100, 100), pt(260, 100)]));
    expect(wasmMock.rustyleafmap_on_wheel).toHaveBeenCalledTimes(1);
    let [deltaY, midX, midY] = lastRealArgs(wasmMock.rustyleafmap_on_wheel);
    expect(deltaY).toBeCloseTo(-360, 6);
    expect([midX, midY]).toEqual([180, 100]);

    // pinch-in: 160px → 80px: deltaY = -(80/160 - 1) * 600 = +300, mid = (140, 100)
    canvas.dispatchEvent(touchEvent('touchmove', [pt(100, 100), pt(180, 100)]));
    expect(wasmMock.rustyleafmap_on_wheel).toHaveBeenCalledTimes(2);
    [deltaY, midX, midY] = lastRealArgs(wasmMock.rustyleafmap_on_wheel);
    expect(deltaY).toBeCloseTo(300, 6);
    expect([midX, midY]).toEqual([140, 100]);
  });

  test('lifting both fingers ends pinch; touchmove afterwards is a no-op', () => {
    canvas.dispatchEvent(touchEvent('touchstart', [pt(100, 100)])); // pan
    canvas.dispatchEvent(touchEvent('touchstart', [pt(100, 100), pt(200, 100)])); // pinch
    canvas.dispatchEvent(touchEvent('touchend', [pt(100, 100)], [pt(200, 100)])); // one left → pan restart
    expect(lastRealArgs(wasmMock.rustyleafmap_handle_mouse_down)).toEqual([100, 100]);
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(100, 100)])); // full lift → mode null

    const downs = wasmMock.rustyleafmap_handle_mouse_down.mock.calls.length;
    const ups = wasmMock.rustyleafmap_handle_mouse_up.mock.calls.length;
    wasmMock.rustyleafmap_on_mouse_move.mockClear();
    wasmMock.rustyleafmap_on_wheel.mockClear();

    canvas.dispatchEvent(touchEvent('touchmove', [pt(150, 150)]));
    canvas.dispatchEvent(touchEvent('touchmove', [pt(150, 150), pt(250, 150)]));
    expect(wasmMock.rustyleafmap_on_mouse_move).not.toHaveBeenCalled();
    expect(wasmMock.rustyleafmap_on_wheel).not.toHaveBeenCalled();

    // nothing further released the drag
    expect(wasmMock.rustyleafmap_handle_mouse_down.mock.calls.length).toBe(downs);
    expect(wasmMock.rustyleafmap_handle_mouse_up.mock.calls.length).toBe(ups);
  });

  test('dropping from pinch back to one finger restarts pan (mouse_down re-issued, long-press re-armed)', () => {
    startFakingTimers();
    canvas.dispatchEvent(touchEvent('touchstart', [pt(100, 100), pt(200, 100)]));

    // lift one finger, keep the other: endTouch restarts pan at remaining touch
    canvas.dispatchEvent(touchEvent('touchend', [pt(100, 100)], [pt(200, 100)]));
    expect(wasmMock.rustyleafmap_handle_mouse_down).toHaveBeenCalledTimes(1);
    expect(lastRealArgs(wasmMock.rustyleafmap_handle_mouse_down)).toEqual([100, 100]);

    // re-armed long-press fires for the restarted pan
    jest.advanceTimersByTime(499);
    expect(wasmMock.rustyleafmap_handle_contextmenu).not.toHaveBeenCalled();
    tick(1);
    expect(wasmMock.rustyleafmap_handle_contextmenu).toHaveBeenCalledTimes(1);
    expect(lastRealArgs(wasmMock.rustyleafmap_handle_contextmenu)).toEqual([100, 100]);
  });

  test('double-tap zooms in one level at the tap point (on_wheel(-1, x, y))', () => {
    startFakingTimers();
    // tap 1: quick press+release within slop → recorded as lastTap
    canvas.dispatchEvent(touchEvent('touchstart', [pt(70, 80)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(70, 80)]));
    expect(wasmMock.rustyleafmap_on_wheel).not.toHaveBeenCalled();

    tick(100); // within DOUBLE_TAP_MS (300)

    // tap 2 near tap 1 → double tap zoom
    canvas.dispatchEvent(touchEvent('touchstart', [pt(72, 82)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(72, 82)]));
    expect(wasmMock.rustyleafmap_on_wheel).toHaveBeenCalledTimes(1);
    expect(lastRealArgs(wasmMock.rustyleafmap_on_wheel)).toEqual([-1, 72, 82]);
  });

  test('slow second tap (>300ms) is NOT a double-tap; distant third tap neither', () => {
    startFakingTimers();
    canvas.dispatchEvent(touchEvent('touchstart', [pt(70, 80)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(70, 80)]));

    tick(400); // > DOUBLE_TAP_MS → gap too big
    canvas.dispatchEvent(touchEvent('touchstart', [pt(70, 80)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(70, 80)]));
    expect(wasmMock.rustyleafmap_on_wheel).not.toHaveBeenCalled();

    tick(100);
    // near-in-time tap but far away spatially (> slop) — still no zoom
    canvas.dispatchEvent(touchEvent('touchstart', [pt(200, 200)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(200, 200)]));
    expect(wasmMock.rustyleafmap_on_wheel).not.toHaveBeenCalled();
  });

  test('a dragged release (>slop movement) resets double-tap tracking', () => {
    startFakingTimers();
    canvas.dispatchEvent(touchEvent('touchstart', [pt(70, 80)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(70, 80)]));

    tick(100);
    // drag well past the slop before releasing
    canvas.dispatchEvent(touchEvent('touchstart', [pt(70, 80)]));
    canvas.dispatchEvent(touchEvent('touchmove', [pt(150, 150)]));
    canvas.dispatchEvent(touchEvent('touchend', [], [pt(150, 150)]));
    expect(wasmMock.rustyleafmap_on_wheel).not.toHaveBeenCalled();
  });

  test('touchcancel releases the drag (handle_mouse_up) and resets touch mode', () => {
    canvas.dispatchEvent(touchEvent('touchstart', [pt(40, 40)]));
    canvas.dispatchEvent(touchEvent('touchcancel', [], [pt(40, 40)]));
    expect(wasmMock.rustyleafmap_handle_mouse_up).toHaveBeenCalledTimes(1);

    wasmMock.rustyleafmap_on_mouse_move.mockClear();
    canvas.dispatchEvent(touchEvent('touchmove', [pt(90, 90)]));
    expect(wasmMock.rustyleafmap_on_mouse_move).not.toHaveBeenCalled();
  });
});

describe('GeoJSONLayer.loadFile streaming (real source, lines ~2964-3022)', () => {
  let map: any;

  function makeLayer(): any {
    const layer = new GeoJSONLayer(null);
    layer.addTo(map);
    return layer;
  }

  beforeEach(() => {
    map = makeMap();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    wasmMock.rustyleafmap_load_geojson_chunk.mockClear();
    wasmMock.rustyleafmap_get_geojson_feature_count.mockReturnValue(2);
  });

  afterEach(() => {
    if (map && !map._destroyed) map.remove();
    jest.restoreAllMocks();
  });

  test('success path: single chunk loads, callbacks fire, promise resolves to the layer', async () => {
    const layer = makeLayer();
    const progress = jest.fn();
    const complete = jest.fn();
    const error = jest.fn();

    const file = new File([FC_TEXT], 'data.json', { type: 'application/json' });
    const ret = await layer.loadFile(file, { progressCallback: progress, completeCallback: complete, errorCallback: error });

    expect(ret).toBe(layer);
    expect(error).not.toHaveBeenCalled();

    // one chunk (default 1MB > file size), forwarded to wasm as final
    expect(wasmMock.rustyleafmap_load_geojson_chunk).toHaveBeenCalledTimes(1);
    const [, layerIndex, chunk, isFinal] = wasmMock.rustyleafmap_load_geojson_chunk.mock.calls[0];
    expect(chunk).toBe(FC_TEXT);
    expect(isFinal).toBe(true);
    expect(typeof layerIndex).toBe('number');

    // progress reported with 100%
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith({
      loaded: FC_TEXT.length,
      total: FC_TEXT.length,
      percentage: 100,
      featureCount: 2,
    });

    // complete reported
    expect(complete).toHaveBeenCalledWith({
      totalFeatures: 2,
      totalBytes: FC_TEXT.length,
      loadedBytes: FC_TEXT.length,
    });

    // client-side parse of the final stream
    expect(layer.dataLoaded).toBe(true);
    expect(layer.geojson).toEqual(JSON.parse(FC_TEXT));
  });

  test('multi-chunk: small chunkSize recurses through readChunk, only last chunk is final', async () => {
    const layer = makeLayer();
    const progress = jest.fn();
    const complete = jest.fn();

    const file = new File([FC_TEXT], 'data.json', { type: 'application/json' });
    await layer.loadFile(file, { chunkSize: 16, progressCallback: progress, completeCallback: complete });

    const calls = wasmMock.rustyleafmap_load_geojson_chunk.mock.calls;
    const expectedChunks = Math.ceil(FC_TEXT.length / 16);
    expect(calls.length).toBe(expectedChunks);
    // all but the last are non-final
    calls.slice(0, -1).forEach((c: any[]) => expect(c[3]).toBe(false));
    expect(calls[calls.length - 1][3]).toBe(true);

    // progress fired once per chunk, monotonically increasing loaded bytes
    expect(progress).toHaveBeenCalledTimes(expectedChunks);
    const loadedSeq = progress.mock.calls.map((c: any[]) => c[0].loaded);
    for (let i = 1; i < loadedSeq.length; i++) expect(loadedSeq[i]).toBeGreaterThan(loadedSeq[i - 1]);
    expect(loadedSeq[loadedSeq.length - 1]).toBe(FC_TEXT.length);
    expect(progress.mock.calls[0][0].total).toBe(FC_TEXT.length);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(layer.geojson).toEqual(JSON.parse(FC_TEXT));
  });

  test('invalid JSON: stream still completes; client-side geojson stays null', async () => {
    const layer = makeLayer();
    const complete = jest.fn();
    const error = jest.fn();
    const bad = new File(['{definitely not json'], 'bad.json', { type: 'application/json' });

    // The wasm mock does not throw, and processChunk swallows the client-side
    // JSON.parse failure — so the streaming pipeline completes regardless.
    const ret = await layer.loadFile(bad, { completeCallback: complete, errorCallback: error });

    expect(ret).toBe(layer);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    const [, , chunk, isFinal] = wasmMock.rustyleafmap_load_geojson_chunk.mock.calls[0];
    expect(chunk).toBe('{definitely not json');
    expect(isFinal).toBe(true);
    expect(layer.dataLoaded).toBeFalsy();
    expect(layer.geojson).toBeNull();
  });

  test('FileReader error path: errorCallback fires and the promise rejects', async () => {
    const layer = makeLayer();
    const error = jest.fn();
    const complete = jest.fn();

    const realFileReader = global.FileReader;
    class FailingReader {
      onload: any = null;
      onerror: any = null;
      readAsText() {
        setTimeout(() => {
          if (this.onerror) this.onerror({ target: { result: '' } });
        }, 0);
      }
    }
    (global as any).FileReader = FailingReader;

    try {
      const file = new File(['x'], 'data.json', { type: 'application/json' });
      await expect(layer.loadFile(file, { completeCallback: complete, errorCallback: error })).rejects.toThrow(
        'Failed to read file'
      );
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(error.mock.calls[0][0].message).toBe('Failed to read file');
      expect(complete).not.toHaveBeenCalled();
    } finally {
      (global as any).FileReader = realFileReader;
    }
  });
});
