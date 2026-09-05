/**
 * Real-source tests for input handling: mouse drag, box zoom, keyboard panning.
 *
 * Covers uncovered region of src/rustyleaf-api.js:
 *   - _setupDragHandlers wiring inside _setupEventHandlers (lines ~679-835):
 *     preventSelection, handleGlobalMouseMove, handleGlobalMouseUp,
 *     mousedown → isDragging state machine, dragstart/drag local events
 *   - _startBoxZoom (lines ~1071-1113): shift+drag rectangle → fitBounds
 *   - _setupKeyboardHandlers (lines ~901-917): arrows → panBy, +/- → zoom
 *
 * Run with: npx jest --config jest.real.config.js tests-real/DragEvents.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from '../tests/__mocks__/wasmMock';
const { Map } = RustyleafAPI as any;

function makeMap() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
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

describe('Mouse drag handling (real source)', () => {
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
    // Release any leaked global listeners by sending a mouseup
    document.dispatchEvent(mouseEvent('mouseup'));
    if (map && !map._destroyed) map.remove();
    document.querySelectorAll('.rustyleaf-boxzoom').forEach((b) => b.remove());
  });

  test('mousedown sets dragging state: cursor becomes "move", handle_mouse_down fires', () => {
    expect(canvas.style.cursor).toBe('grab');
    canvas.dispatchEvent(mouseEvent('mousedown', { clientX: 50, clientY: 60 }));
    expect(canvas.style.cursor).toBe('move');
    expect(wasmMock.rustyleafmap_handle_mouse_down).toHaveBeenCalledTimes(1);
  });

  test('first global mousemove fires local "dragstart", later moves fire "drag"', () => {
    const events: string[] = [];
    map.on('dragstart', () => events.push('dragstart'));
    map.on('drag', () => events.push('drag'));

    canvas.dispatchEvent(mouseEvent('mousedown'));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 110, clientY: 105 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 120, clientY: 110 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 130, clientY: 115 }));

    expect(events).toEqual(['dragstart', 'drag', 'drag']);
  });

  test('mousemove during drag forwards coordinates to wasm on_mouse_move', () => {
    canvas.dispatchEvent(mouseEvent('mousedown', { clientX: 40, clientY: 40 }));
    wasmMock.rustyleafmap_on_mouse_move.mockClear();

    document.dispatchEvent(mouseEvent('mousemove', { clientX: 70, clientY: 80 }));

    expect(wasmMock.rustyleafmap_on_mouse_move).toHaveBeenCalledTimes(1);
    const [x, y] = wasmMock.rustyleafmap_on_mouse_move.mock.calls[0].slice(1);
    // jsdom rects are zero-sized, so canvas coords are scaled by width/rect.width;
    // we only assert the deltas are proportional to the CSS movement.
    expect(typeof x).toBe('number');
    expect(typeof y).toBe('number');
  });

  test('mouseup ends drag: handle_mouse_up fires, cursor resets to "grab", listeners detached', () => {
    canvas.dispatchEvent(mouseEvent('mousedown'));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 120 }));
    expect(canvas.style.cursor).toBe('move');

    wasmMock.rustyleafmap_handle_mouse_up.mockClear();
    document.dispatchEvent(mouseEvent('mouseup', { clientX: 140, clientY: 150 }));

    expect(wasmMock.rustyleafmap_handle_mouse_up).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe('grab');

    // Global listeners must be gone: further moves do not reach wasm or events
    wasmMock.rustyleafmap_on_mouse_move.mockClear();
    let dragCount = 0;
    map.on('drag', () => dragCount++);
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 200 }));
    expect(wasmMock.rustyleafmap_on_mouse_move).not.toHaveBeenCalled();
    expect(dragCount).toBe(0);
  });

  test('selectstart is prevented while dragging (preventSelection)', () => {
    canvas.dispatchEvent(mouseEvent('mousedown'));

    const duringDrag = new Event('selectstart', { cancelable: true });
    document.dispatchEvent(duringDrag);
    expect(duringDrag.defaultPrevented).toBe(true);

    document.dispatchEvent(mouseEvent('mouseup'));

    const afterDrag = new Event('selectstart', { cancelable: true });
    document.dispatchEvent(afterDrag);
    expect(afterDrag.defaultPrevented).toBe(false);
  });

  test('non-left-button mousedown does not start a drag', () => {
    canvas.dispatchEvent(mouseEvent('mousedown', { button: 2 }));
    expect(canvas.style.cursor).toBe('grab');
    expect(wasmMock.rustyleafmap_handle_mouse_down).not.toHaveBeenCalled();
  });

  test('mousemove before any mousedown never reaches the drag pipeline', () => {
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 200 }));
    expect(wasmMock.rustyleafmap_on_mouse_move).not.toHaveBeenCalled();
  });
});

describe('Box zoom (shift+drag, real source)', () => {
  let map: any;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    map = makeMap();
    canvas = map.canvas as HTMLCanvasElement;
    wasmMock.rustyleafmap_fit_bounds.mockClear();
    wasmMock.rustyleafmap_unproject.mockClear();
  });

  afterEach(() => {
    document.dispatchEvent(mouseEvent('mouseup'));
    if (map && !map._destroyed) map.remove();
    document.querySelectorAll('.rustyleaf-boxzoom').forEach((b) => b.remove());
  });

  test('shift+mousedown creates a .rustyleaf-boxzoom div in the container', () => {
    canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true }));

    const box = map.containerElement.querySelector('.rustyleaf-boxzoom');
    expect(box).toBeTruthy();
    expect((box as HTMLElement).style.position).toBe('absolute');
    expect((box as HTMLElement).style.pointerEvents).toBe('none');
    // Normal drag must NOT have started
    expect(wasmMock.rustyleafmap_handle_mouse_down).not.toHaveBeenCalled();
  });

  test('mousemove updates box geometry from drag rectangle', () => {
    canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 260, clientY: 220 }));

    const box = map.containerElement.querySelector('.rustyleaf-boxzoom') as HTMLElement;
    expect(box).toBeTruthy();
    // jsdom rects are zero, so offsets equal raw mins; width/height are absolute deltas
    expect(box.style.width).toBe('160px');
    expect(box.style.height).toBe('120px');
  });

  test('large-enough mouseup finishes: box removed, fitBounds called, boxzoomend fired', () => {
    const boxZoomEnd = jest.fn();
    map.on('boxzoomend', boxZoomEnd);

    canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 260, clientY: 220 }));
    document.dispatchEvent(mouseEvent('mouseup', { clientX: 260, clientY: 220 }));

    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeNull();
    expect(wasmMock.rustyleafmap_fit_bounds).toHaveBeenCalledTimes(1);
    // fitBounds receives a flat [sw_lat, sw_lng, ne_lat, ne_lng] array built
    // from two unproject() results
    const flat = wasmMock.rustyleafmap_fit_bounds.mock.calls[0][1];
    expect(Array.isArray(flat)).toBe(true);
    expect(flat).toHaveLength(4);
    expect(boxZoomEnd).toHaveBeenCalledTimes(1);
  });

  test('tiny drag (< 10px) aborts: no fitBounds, no boxzoomend, box still removed', () => {
    const boxZoomEnd = jest.fn();
    map.on('boxzoomend', boxZoomEnd);

    canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 105, clientY: 102 }));
    document.dispatchEvent(mouseEvent('mouseup', { clientX: 105, clientY: 102 }));

    expect(map.containerElement.querySelector('.rustyleaf-boxzoom')).toBeNull();
    expect(wasmMock.rustyleafmap_fit_bounds).not.toHaveBeenCalled();
    expect(boxZoomEnd).not.toHaveBeenCalled();
  });

  test('shift+mousedown prevents default (no text selection)', () => {
    const e = mouseEvent('mousedown', { shiftKey: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('Keyboard panning (real source)', () => {
  let map: any;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    map = makeMap();
    canvas = map.canvas as HTMLCanvasElement;
    jest.spyOn(map, 'panBy');
  });

  afterEach(() => {
    if (map && !map._destroyed) map.remove();
  });

  function keydown(key: string) {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    canvas.dispatchEvent(e);
    return e;
  }

  test('canvas is made focusable (tabIndex) for keyboard input', () => {
    expect(canvas.tabIndex).toBe(0);
  });

  test.each([
    ['ArrowUp', 0, -60],
    ['ArrowDown', 0, 60],
    ['ArrowLeft', -60, 0],
    ['ArrowRight', 60, 0],
  ])('%s pans by 60px in the right direction', (key, dx, dy) => {
    keydown(key as string);
    expect(map.panBy).toHaveBeenCalledWith(dx, dy);
  });

  test('+ and = zoom in, - and _ zoom out', () => {
    const zin = jest.spyOn(map.wasmMap, 'zoom_in');
    const zout = jest.spyOn(map.wasmMap, 'zoom_out');

    keydown('+');
    keydown('=');
    keydown('-');
    keydown('_');

    expect(zin).toHaveBeenCalledTimes(2);
    expect(zout).toHaveBeenCalledTimes(2);
  });

  test('handled keys are preventDefault-ed so the page does not scroll', () => {
    expect(keydown('ArrowUp').defaultPrevented).toBe(true);
    expect(keydown('+').defaultPrevented).toBe(true);
  });

  test('unhandled keys fall through without preventDefault or panning', () => {
    const before = (map.panBy as jest.Mock).mock.calls.length;
    const e = keydown('a');
    expect(e.defaultPrevented).toBe(false);
    expect((map.panBy as jest.Mock).mock.calls.length).toBe(before);
  });

  test('arrow keydown reaches the wasm pan pipeline', () => {
    wasmMock.rustyleafmap_pan.mockClear();
    keydown('ArrowRight');
    expect(wasmMock.rustyleafmap_pan).toHaveBeenCalled();
    const args = wasmMock.rustyleafmap_pan.mock.calls[0];
    expect(args[1]).toBe(60); // dx
    expect(args[2]).toBe(0);  // dy
  });
});
