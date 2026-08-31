/**
 * Real-source tests for the long tail of uncovered lines in src/rustyleaf-api.js.
 *
 * Covers (istanbul ranges from the coverage report):
 *   - Map: setZoom (356), closeTooltip with active tooltip (393),
 *     setMinZoom/setMaxZoom (421-427), wasmMap.destroy on remove (1164),
 *     destroy() alias + control registry (1175-1190)
 *   - Input handlers: draggable-marker drag pipeline (748-769), hover
 *     mousemove rAF path (803-814), wheel (819-820), contextmenu (824-825),
 *     window resize wiring (829)
 *   - Box zoom forcing container position:relative (1075)
 *   - TileLayer: attribution container positioning (1228), remove_tile_layer
 *     detach (1249)
 *   - Popup: HTMLElement content (1622-1624), viewport-adjustment branches
 *     (1652/1654/1658/1660/1665), close-button listeners (1723-1734),
 *     _handleResize (1803-1804)
 *   - FeatureGroup.off fan-out (2125)
 *   - Overlays: ImageOverlay container positioning (2226), SVGOverlay
 *     _createElement (2314)
 *   - GeoJSONLayer: _applyFeatureOptions geometry shapes (2361-2363),
 *     handler-error catches (2457, 2470), reload cleanup of stale
 *     pointToLayer layers (2509), circular-input guard (2535),
 *     processed re-stringify (2546-2549), unparseable-string addTo fallback
 *     (2842, 2850), off(callback) filter (2874), free_gpu guard body (2886),
 *     addFeature failure warn (3094), getFeaturesInBounds recursion (3118-3120),
 *     setStyleFunction (3127-3131), streaming readChunk error (2676-2679),
 *     findCompleteJsonEnd escape handling (2724-2725, 2729-2730)
 *   - parseMarkerColor 3-digit / 6-digit / fallback (3174-3180)
 *
 * Run with: npx jest --config jest.real.config.js tests-real/LongTail2.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from '../tests/__mocks__/wasmMock';

const { Map, TileLayer, GeoJSONLayer, Popup, Tooltip, Marker, FeatureGroup,
  ImageOverlay, SVGOverlay } = RustyleafAPI as any;

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

/**
 * Temporarily force window.getComputedStyle to report position:'static'.
 * Several code paths only mutate container style when the computed position
 * is 'static'; jsdom's computed style does not always agree, so we pin it.
 */
function withStaticPosition(fn: () => void) {
  const orig = window.getComputedStyle.bind(window);
  (window as any).getComputedStyle = () => ({ position: 'static' });
  try {
    fn();
  } finally {
    window.getComputedStyle = orig;
  }
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Map setters and lifecycle tails (real source)', () => {
  test('setZoom keeps the center and applies the new zoom (line 356)', () => {
    const map = makeMap();
    try {
      const centerBefore = map.getCenter();
      const ret = map.setZoom(10);
      expect(ret).toBe(map);
      expect(map.getZoom()).toBe(10);
      expect(map.getCenter()).toEqual(centerBefore);
    } finally {
      map.remove();
    }
  });

  test('closeTooltip closes the active tooltip (line 393)', async () => {
    const map = makeMap();
    try {
      const tip = new Tooltip({ content: 'hi' }).setLatLng([48.85, 2.35]);
      tip.openOn(map);
      await Promise.resolve(); // flush deferCallback microtasks

      expect((map as any)._activeTooltip).toBe(tip);
      map.closeTooltip();
      expect(tip.isOpenTooltip()).toBe(false);
      expect((map as any)._activeTooltip).toBeNull();

      await Promise.resolve(); // let deferred listeners run safely post-close
    } finally {
      map.remove();
    }
  });

  test('setMinZoom / setMaxZoom delegate to the wasm core (lines 421-427)', () => {
    const map = makeMap();
    try {
      wasmMock.rustyleafmap_set_min_zoom.mockClear();
      wasmMock.rustyleafmap_set_max_zoom.mockClear();

      expect(map.setMinZoom(3)).toBe(map);
      expect(map.setMaxZoom(18)).toBe(map);

      expect(wasmMock.rustyleafmap_set_min_zoom).toHaveBeenCalledWith(expect.anything(), 3);
      expect(wasmMock.rustyleafmap_set_max_zoom).toHaveBeenCalledWith(expect.anything(), 18);
    } finally {
      map.remove();
    }
  });

  test('remove() destroys the wasm map when a destroy hook exists (line 1164)', () => {
    const map = makeMap();
    const destroySpy = jest.fn();
    (map.wasmMap as any).destroy = destroySpy;

    map.remove();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  test('destroy() aliases remove(); controls round-trip through the registry (1175-1190)', () => {
    const map = makeMap();
    const destroySpy = jest.fn();
    (map.wasmMap as any).destroy = destroySpy;

    const control = { addTo: jest.fn(() => control), remove: jest.fn() };
    expect(map.addControl(control)).toBe(control);
    expect(control.addTo).toHaveBeenCalledWith(map);

    expect(map.destroy()).toBe(map);
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect((map as any)._destroyed).toBe(true);

    // removeControl works after destruction too (registry still filters)
    map.removeControl(control);
    expect(control.remove).toHaveBeenCalledTimes(1);
    expect((map as any)._controls).toEqual([]);
  });
});

describe('Canvas input handler tails (real source)', () => {
  let map: any;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    map = makeMap();
    canvas = map.canvas as HTMLCanvasElement;
    // Give the canvas a deterministic mapping client px -> canvas px.
    canvas.width = 800;
    canvas.height = 600;
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 } as DOMRect
    );
  });

  afterEach(() => {
    document.dispatchEvent(mouseEvent('mouseup'));
    if (map && !map._destroyed) map.remove();
  });

  test('dragging a draggable marker fires dragstart/drag/dragend and moves it (748-769)', () => {
    const marker = new Marker([48.8566, 2.3522], { draggable: true });
    marker.addTo(map);

    const events: string[] = [];
    marker.on('dragstart', () => events.push('dragstart'));
    marker.on('drag', () => events.push('drag'));
    marker.on('dragend', () => events.push('dragend'));

    // screen_xy mock projects every latlng to canvas px [400, 300].
    canvas.dispatchEvent(mouseEvent('mousedown', { clientX: 400, clientY: 300 }));
    expect(canvas.style.cursor).toBe('move');
    expect(events).toEqual(['dragstart']);

    document.dispatchEvent(mouseEvent('mousemove', { clientX: 420, clientY: 290 }));
    expect(events).toEqual(['dragstart', 'drag']);
    expect(marker.getLatLng()).toEqual([48.8566, 2.3522]); // unproject mock value

    document.dispatchEvent(mouseEvent('mouseup', { clientX: 420, clientY: 290 }));
    expect(events).toEqual(['dragstart', 'drag', 'dragend']);
    expect(canvas.style.cursor).toBe('grab');

    // Listeners detached: further moves produce no extra drag events
    document.dispatchEvent(mouseEvent('mousemove', { clientX: 500 }));
    expect(events).toEqual(['dragstart', 'drag', 'dragend']);
  });

  test('non-draggable marker under the cursor does not hijack the drag', () => {
    const marker = new Marker([48.8566, 2.3522], { draggable: false });
    marker.addTo(map);
    const dragstart = jest.fn();
    marker.on('dragstart', dragstart);

    canvas.dispatchEvent(mouseEvent('mousedown', { clientX: 400, clientY: 300 }));
    expect(dragstart).not.toHaveBeenCalled();
    expect(wasmMock.rustyleafmap_handle_mouse_down).toHaveBeenCalled();

    document.dispatchEvent(mouseEvent('mouseup'));
  });

  test('hover mousemove goes through rAF into hit-testing + wasm hover (803-814)', async () => {
    (map.wasmMap as any).handle_mouse_hover = jest.fn();
    const marker = new Marker([48.8566, 2.3522]);
    marker.addTo(map);
    const over = jest.fn();
    marker.on('mouseover', over);

    canvas.dispatchEvent(mouseEvent('mousemove', { clientX: 400, clientY: 300 }));

    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    expect((map.wasmMap as any).handle_mouse_hover).toHaveBeenCalledTimes(1);
    expect(over).toHaveBeenCalledTimes(1);
  });

  test('wheel events forward deltaY and coordinates to on_wheel (819-820)', () => {
    wasmMock.rustyleafmap_on_wheel.mockClear();
    const e = new WheelEvent('wheel', { deltaY: 120, clientX: 33, clientY: 44, bubbles: true, cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(wasmMock.rustyleafmap_on_wheel).toHaveBeenCalledTimes(1);
  });

  test('contextmenu is prevented and forwarded (824-825)', () => {
    wasmMock.rustyleafmap_handle_contextmenu.mockClear();
    const e = new MouseEvent('contextmenu', { button: 2, clientX: 7, clientY: 8, bubbles: true, cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(wasmMock.rustyleafmap_handle_contextmenu).toHaveBeenCalledTimes(1);
  });

  test('window resize reaches _handleResize via the stored handler (line 829)', () => {
    const spy = jest.spyOn(map, '_handleResize');
    window.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('Container position:relative fixes (real source)', () => {
  test('box zoom pins a static-positioned container (line 1075)', () => {
    const map = makeMap();
    try {
      expect(map.containerElement.style.position).not.toBe('relative');
      withStaticPosition(() => {
        map.canvas.dispatchEvent(mouseEvent('mousedown', { shiftKey: true }));
      });
      expect(map.containerElement.style.position).toBe('relative');

      document.dispatchEvent(mouseEvent('mouseup')); // release box zoom listeners
    } finally {
      map.remove();
    }
  });

  test('TileLayer attribution pins a static-positioned container (line 1228)', () => {
    const map = makeMap();
    try {
      const tl = new TileLayer('https://tile.example/{z}/{x}/{y}.png', { attribution: '© Example' });
      withStaticPosition(() => tl.addTo(map));

      expect(map.containerElement.style.position).toBe('relative');
      const attrib = map.containerElement.querySelector('.rustyleaf-attribution') as HTMLElement;
      expect(attrib).toBeTruthy();
      expect(attrib.innerHTML).toContain('© Example');
    } finally {
      map.remove();
    }
  });

  test('TileLayer.remove detaches the wasm tile layer (line 1249)', () => {
    const map = makeMap();
    try {
      const removeTileLayer = jest.fn();
      (map.wasmMap as any).remove_tile_layer = removeTileLayer;

      const tl = new TileLayer('https://tile.example/{z}/{x}/{y}.png');
      tl.addTo(map);
      const removed = jest.fn();
      map.on('layerremove', removed);

      tl.remove();
      expect(removeTileLayer).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledTimes(1);
      expect((tl as any)._map).toBeNull();
    } finally {
      map.remove();
    }
  });

  test('ImageOverlay.addTo pins a static-positioned container (line 2226)', () => {
    const map = makeMap();
    try {
      const overlay = new ImageOverlay('img.png', [[48, 2], [49, 3]]);
      withStaticPosition(() => overlay.addTo(map));

      expect(map.containerElement.style.position).toBe('relative');
      expect((overlay.getElement() as HTMLElement).tagName).toBe('IMG');
      expect(map.containerElement.contains(overlay.getElement())).toBe(true);
    } finally {
      map.remove();
    }
  });

  test('SVGOverlay reuses its svg element and ignores setUrl (line 2314)', () => {
    const map = makeMap();
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const overlay = new SVGOverlay(svg, [[48, 2], [49, 3]]);

      // _createElement hands back the pre-supplied element
      expect((overlay as any)._createElement()).toBe(svg);

      overlay.addTo(map);
      expect(overlay.getElement()).toBe(svg);
      expect(overlay.setUrl('ignored.png')).toBe(overlay);
      expect(svg.getAttribute('src')).toBeNull();
    } finally {
      map.remove();
    }
  });
});

describe('Popup layout tails (real source)', () => {
  function rect(l: number, t: number, r: number, b: number) {
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t } as DOMRect;
  }

  test('HTMLElement content is mounted into the content wrapper (1622-1624)', () => {
    const map = makeMap();
    try {
      const popup = new Popup().setLatLng([48.85, 2.35]).setContent('<p>text</p>');
      popup.openOn(map);

      const el = document.createElement('div');
      el.textContent = 'element content';
      popup.setContent(el);

      const wrapper = (popup as any).contentWrapper as HTMLElement;
      expect(wrapper.contains(el)).toBe(true);
    } finally {
      map.remove();
    }
  });

  test('_adjustForViewport clamps popups off the left/top edges (1652, 1658, 1665)', () => {
    const map = makeMap();
    const popup: any = new Popup({ autoPan: false }).setLatLng([48.85, 2.35]);
    popup.openOn(map);

    // setup.ts defines getBoundingClientRect as a read-only prototype value;
    // override with a configurable own property on the popup element.
    Object.defineProperty(popup.element, 'getBoundingClientRect', {
      value: () => rect(-100, -200, -60, -160),
      configurable: true,
    });
    Object.defineProperty(map.containerElement, 'getBoundingClientRect', {
      value: () => rect(0, 0, 800, 600),
      configurable: true,
    });

    popup._adjustForViewport(0, 0);

    expect(popup.element.style.transform).toContain('100px');  // offsetX = 0 - (-100)
    expect(popup.element.style.transform).toContain('200px');  // offsetY = 0 - (-200)
    map.remove();
  });

  test('_adjustForViewport clamps popups off the right/bottom edges (1654, 1660)', () => {
    const map = makeMap();
    const popup: any = new Popup({ autoPan: false }).setLatLng([48.85, 2.35]);
    popup.openOn(map);

    Object.defineProperty(popup.element, 'getBoundingClientRect', {
      value: () => rect(820, 620, 850, 650),
      configurable: true,
    });
    Object.defineProperty(map.containerElement, 'getBoundingClientRect', {
      value: () => rect(0, 0, 800, 600),
      configurable: true,
    });

    popup._adjustForViewport(800, 600);

    expect(popup.element.style.transform).toContain('-50px');  // 800 - 850
    expect(popup.element.style.transform).toContain('-50px');
    map.remove();
  });

  test('close button reacts to mouseover/mouseout/click (1723-1734)', () => {
    const map = makeMap();
    try {
      const popup = new Popup({ closeButton: true }).setLatLng([48.85, 2.35]).setContent('x');
      popup.openOn(map);

      const btn = popup.element.querySelector('.rustyleaf-popup-close-button') as HTMLElement;
      expect(btn).toBeTruthy();

      btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(btn.style.background).toBe('rgb(240, 240, 240)');
      expect(btn.style.color).toBe('rgb(51, 51, 51)');

      btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      expect(btn.style.background).toBe('transparent');

      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      btn.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(popup.isOpen).toBe(false);
    } finally {
      map.remove();
    }
  });

  test('window resize repositions an open popup (1803-1804)', () => {
    const map = makeMap();
    try {
      const popup: any = new Popup({ autoPan: false }).setLatLng([48.85, 2.35]);
      popup.openOn(map);
      const spy = jest.spyOn(popup, '_updatePosition');

      window.dispatchEvent(new Event('resize'));
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      map.remove();
    }
  });
});

describe('FeatureGroup / marker color tails (real source)', () => {
  test('FeatureGroup.off fans out to child layers (line 2125)', () => {
    const m1: any = new Marker([1, 2]);
    const m2: any = new Marker([3, 4]);
    const fg = new FeatureGroup([m1, m2]);

    const cb = jest.fn();
    fg.on('click', cb);
    expect(m1._events.click).toHaveLength(1);
    expect(m2._events.click).toHaveLength(1);

    fg.off('click', cb);
    expect(m1._events.click).toHaveLength(0);
    expect(m2._events.click).toHaveLength(0);
  });

  test('parseMarkerColor: 3-digit hex expands, 6-digit parses, junk falls back (3174-3180)', () => {
    const short: any = new Marker([1, 2], { color: '#f00' });
    expect(short._color).toEqual([1, 0, 0]);

    const full: any = new Marker([1, 2], { color: '#336699' });
    expect(full._color[0]).toBeCloseTo(0x33 / 255);
    expect(full._color[1]).toBeCloseTo(0x66 / 255);
    expect(full._color[2]).toBeCloseTo(0x99 / 255);

    const junk: any = new Marker([1, 2], { color: 'nope!' });
    expect(junk._color).toEqual([0.878, 0.224, 0.243]);
  });
});

describe('GeoJSONLayer tails (real source)', () => {
  function attachedLayer(options: any) {
    const map = makeMap();
    const gl: any = new GeoJSONLayer(null, options);
    gl.addTo(map);
    if (gl.layerIndex === undefined) gl.layerIndex = 0; // mock core returns no index
    return { map, gl };
  }

  test('_applyFeatureOptions wraps bare geometries, Features and junk (2361-2363)', () => {
    const seen: any[] = [];
    const { map, gl } = attachedLayer({ onEachFeature: (f: any) => seen.push(f) });
    try {
      gl.loadData({ type: 'LineString', coordinates: [[0, 0], [1, 1]] });
      expect(seen[0].type).toBe('Feature');           // bare geometry wrapped (2362)

      gl.loadData({ type: 'Feature', geometry: { type: 'Point', coordinates: [2, 48] }, properties: {} });
      expect(seen[1].geometry.type).toBe('Point');    // single Feature (2361)

      gl.loadData({ totally: 'not geojson' });
      expect(seen[2]).toBeUndefined();                // junk -> zero features (2363)
    } finally {
      map.remove();
    }
  });

  test('errors in layer-level handlers are caught and logged (line 2457)', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { map, gl } = attachedLayer({});
    try {
      gl.on('click', () => { throw new Error('listener boom'); });
      expect(() => gl._dispatchFeatureEvent({ latlng: [1, 2] }, 'click')).not.toThrow();
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('error in GeoJSONLayer \'click\' handler'),
        expect.any(Error)
      );
    } finally {
      map.remove();
    }
  });

  test('errors in per-feature handlers are caught and logged (line 2470)', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { map, gl } = attachedLayer({});

    const handle: any = {
      feature: { type: 'Feature', properties: {}, geometry: null },
      _events: {},
      on(event: string, cb: (e: any) => void) {
        (this._events[event] = this._events[event] || []).push(cb);
      },
    };
    handle.on('click', () => { throw new Error('feature boom'); });
    gl._featureHandles[0] = handle;

    const e = { latlng: [1, 2], feature: { layer_type: 'geojson_layer', layer_index: gl.layerIndex, original_meta: { __rl_fid: 0 } } };
    expect(() => gl._dispatchFeatureEvent(e, 'click')).not.toThrow();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('error in feature \'click\' handler'),
      expect.any(Error)
    );
    map.remove();
  });

  test('re-loading data removes stale pointToLayer layers (line 2509)', () => {
    const staleRemoves = { count: 0 };
    const mkLayer = () => ({
      addTo: jest.fn(),
      remove: jest.fn(() => { staleRemoves.count += 1; }),
    });
    const made: any[] = [];
    const { map, gl } = attachedLayer({
      pointToLayer: (_f: any, _ll: any) => { const l = mkLayer(); made.push(l); return l; },
    });
    try {
      gl.loadData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 48] }, properties: {} },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 49] }, properties: {} },
        ],
      });
      expect(made).toHaveLength(2);
      expect(made[0].addTo).toHaveBeenCalledWith(map);   // mounted via _mountFeatureExtras

      gl.loadData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [4, 50] }, properties: {} },
        ],
      });
      // Old extras detached, fresh dataset produced a new layer
      expect(made[0].remove).toHaveBeenCalled();
      expect(made[1].remove).toHaveBeenCalled();
      expect(staleRemoves.count).toBe(2);
      expect(gl._featureLayers).toHaveLength(1);
    } finally {
      map.remove();
    }
  });

  test('circular (unserializable) input degrades gracefully (line 2535)', () => {
    const { map, gl } = attachedLayer({});
    try {
      const circular: any = { name: 'loop' };
      circular.self = circular;

      expect(() => gl.loadData(circular)).not.toThrow();
      expect(gl.dataLoaded).toBe(true);
    } finally {
      map.remove();
    }
  });

  test('filtered datasets are re-serialized before hitting the core (2546-2549)', () => {
    const { map, gl } = attachedLayer({ filter: (f: any) => f.properties.keep });
    try {
      wasmMock.rustyleafmap_load_geojson.mockClear();
      gl.loadData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 48] }, properties: { keep: true } },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 49] }, properties: { keep: false } },
        ],
      });

      expect(wasmMock.rustyleafmap_load_geojson).toHaveBeenCalled();
      const payload = JSON.parse(wasmMock.rustyleafmap_load_geojson.mock.calls[0][2]);
      expect(payload.features).toHaveLength(1);           // filtered before stringify
      expect(payload.features[0].properties.keep).toBe(true);
    } finally {
      map.remove();
    }
  });

  test('addTo with an unparseable geojson string passes it through (2842, 2850)', () => {
    wasmMock.rustyleafmap_load_geojson.mockClear();
    const map = makeMap();
    try {
      // layerIndex stays undefined in the mock core, so pin it and re-run the
      // addTo data path directly: parse fails -> raw string passthrough.
      const gl: any = new GeoJSONLayer('{definitely not json');
      gl.addTo(map);
      gl.layerIndex = 0;
      gl.dataLoaded = false;
      gl.addTo(map);

      expect(wasmMock.rustyleafmap_load_geojson).toHaveBeenCalledWith(expect.anything(), 0, '{definitely not json');
    } finally {
      map.remove();
    }
  });

  test('off(event, cb) removes only the matching listener (line 2874)', () => {
    const gl: any = new GeoJSONLayer();
    const a = jest.fn();
    const b = jest.fn();

    gl.on('click', a);
    gl.on('click', b);
    expect(gl._layerEvents.click).toHaveLength(2);

    gl.off('click', a);
    expect(gl._layerEvents.click).toEqual([b]);

    gl.off('click');                                     // no cb -> clear all
    expect(gl._layerEvents.click).toBeUndefined();
  });

  test('remove() frees gpu resources when the core exposes the hook (line 2886)', () => {
    const { map, gl } = attachedLayer({});
    try {
      const freeGpu = jest.fn();
      (map.wasmMap as any).free_geojson_layer_gpu = freeGpu;
      wasmMock.rustyleafmap_set_geojson_layer_visible.mockClear();

      const idx = gl.layerIndex;
      gl.remove();
      expect(wasmMock.rustyleafmap_set_geojson_layer_visible).toHaveBeenCalledWith(expect.anything(), idx, false);
      expect(freeGpu).toHaveBeenCalledWith(idx);
    } finally {
      map.remove();
    }
  });

  test('addFeature warns when serialization fails (line 3094)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { map, gl } = attachedLayer({});
    try {
      const bad: any = { geometry: {} };
      bad.geometry.self = bad;                             // JSON.stringify throws

      expect(() => gl.addFeature(bad)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith('Failed to add feature:', expect.anything());
    } finally {
      map.remove();
    }
  });

  test('getFeaturesInBounds recurses into nested coordinate arrays (3118-3120)', () => {
    const gl: any = new GeoJSONLayer();
    (gl as any).geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [2.1, 48.1] }, properties: { n: 1 } },
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[10, 10], [2.2, 48.2]] }, properties: { n: 2 } },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [5, 5], [5, 0], [0, 0]]] }, properties: { n: 3 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: null }, properties: { n: 4 } },
      ],
    };

    const hits = gl.getFeaturesInBounds([[48, 2], [48.3, 2.4]]);
    expect(hits.map((f: any) => f.properties.n).sort()).toEqual([1, 2]);

    // No bounds -> everything returned unfiltered (null-coords feature included)
    const all = gl.getFeaturesInBounds(undefined as any);
    expect(all).toHaveLength(4);
  });

  test('setStyleFunction stores the fn and pushes styles to the core (3127-3131)', () => {
    const { map, gl } = attachedLayer({});
    try {
      wasmMock.rustyleafmap_set_geojson_style.mockClear();
      const styleFn = (f: any) => ({ color: f.properties.kind });
      const ret = gl.setStyleFunction(styleFn);

      expect(ret).toBe(gl);
      expect(gl.styleFunction).toBe(styleFn);
      expect(wasmMock.rustyleafmap_set_geojson_style).toHaveBeenCalledWith(
        expect.anything(),                                    // wasm ptr
        gl.layerIndex,
        expect.objectContaining({ pointColor: '#0080ff', lineWidth: 2 })
      );
    } finally {
      map.remove();
    }
  });

  test('findCompleteJsonEnd survives escaped quotes and backslashes (2724-2730)', () => {
    const gl: any = new GeoJSONLayer();
    const tricky = JSON.stringify({ a: 'she said "hi" \\ and continued' });
    const rest = '{"next":1}';
    const buffer = tricky + rest;

    expect(gl.findCompleteJsonEnd(buffer)).toBe(tricky.length - 1); // closing } of obj 1
    expect(gl.findCompleteJsonEnd('{"unclosed": ')).toBe(-1);

    // Streaming split across objects still processes both halves
    const out = gl.processStreamingBuffer(buffer, false);
    expect(out.processed).toBe(2);
    expect(out.remaining).toBe('');
  });
});

describe('Streaming loader error paths (real source)', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('loadUrlStreaming reports reader failures via errorCallback and rejects (2676-2679)', async () => {
    const { map, gl } = ((): any => {
      const m = makeMap();
      const g: any = new GeoJSONLayer();
      g.addTo(m);
      if (g.layerIndex === undefined) g.layerIndex = 0;
      return { map: m, gl: g };
    })();

    (global as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: () => Promise.reject(new Error('stream boom')),
          }),
        },
      })
    );

    const errorCallback = jest.fn();
    await expect(gl.loadUrlStreaming('https://example/data.geojson', { errorCallback }))
      .rejects.toThrow('stream boom');
    expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));

    map.remove();
  });
});
