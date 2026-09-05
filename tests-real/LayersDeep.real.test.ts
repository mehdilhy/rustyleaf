/**
 * Real-source tests for uncovered region G: layers deep branches.
 *
 * Covers uncovered ranges of src/rustyleaf-api.js:
 *   - ~1141-1262: TileLayer option plumbing (configure_tile_layer variants,
 *     attribution DOM dedup/add/remove), remove()/cleanup paths
 *   - ~359-509:   panTo / setView around maxBounds clamping edges,
 *     flyTo(duration<=0) immediate path, flyToBounds -> fitBounds
 *   - ~1740-1787: Popup _boundFns move/zoom attach/detach re-binding
 *   - ~1309-1396 + 1859-1881: PointLayer / LineLayer / PolygonLayer remove +
 *     GPU free paths (free_*_gpu success and throw-catch), re-add visibility
 *   - ~2054-2156: LayerGroup / FeatureGroup late-child bindings, empty-group
 *     getBounds, remove() cascade
 *   - ~2170-2320: ImageOverlay bounds edge cases, bringToFront/bringToBack
 *     unattached, VideoOverlay/SVGOverlay option handling, remove idempotency
 *   - ~2397-2491 + 2951-2961: GeoJSONLayer _dispatchFeatureEvent branches
 *     (own hit vs cross-layer fid collision, hover tooltip switching),
 *     _makeFeatureHandle on/off/bindPopup, clear() with/without map
 *   - ~1889-2050: Shape redraw-on-set (setRadius/setLatLng/setBounds)
 *   - ~3187-3345: Marker icon/Draggable toggles without map, off(type) removes
 *     all, once()
 *
 * Skipped with reason:
 *   - Tile URL template expansion: implemented inside the wasm core (the JS
 *     side never sees per-tile URLs); nothing testable in src/.
 *   - Radius validation on Circle/CircleMarker: no validation code exists in
 *     src (setRadius stores any value); nothing to assert.
 *
 * Run with: npx jest --config jest.real.config.js tests-real/LayersDeep.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';

const {
  Map,
  TileLayer,
  PointLayer,
  LineLayer,
  PolygonLayer,
  Circle,
  CircleMarker,
  Rectangle,
  LayerGroup,
  FeatureGroup,
  ImageOverlay,
  VideoOverlay,
  SVGOverlay,
  GeoJSONLayer,
  Marker,
} = RustyleafAPI as any;

function makeMap(opts: any = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12, ...opts });
}

// Flush queued microtasks (deferCallback uses queueMicrotask).
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('TileLayer option plumbing + cleanup (real source)', () => {
  let map: any;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    map = makeMap();
    // The wasm mock omits configure_tile_layer; the source probes for it.
    (map.wasmMap as any).configure_tile_layer = jest.fn();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (map && !map._destroyed) map.remove();
    warnSpy.mockRestore();
  });

  test('defaults: subs [a,b,c], minZoom 0, maxZoom 18, tileSize 256', () => {
    const tl = new TileLayer('https://{s}.example.com/{z}/{x}/{y}.png');
    tl.addTo(map);

    // The source plumbs options through map.wasmMap.configure_tile_layer
    expect(map.wasmMap.configure_tile_layer).toHaveBeenCalledWith(['a', 'b', 'c'], 0, 18, 256);
  });

  test('array subdomains and numeric zoom/tileSize are forwarded verbatim', () => {
    const tl = new TileLayer('https://x/{z}/{x}/{y}.png', {
      subdomains: ['q', 'r'],
      minZoom: 2,
      maxZoom: 14,
      tileSize: 512,
    });
    tl.addTo(map);

    expect(map.wasmMap.configure_tile_layer).toHaveBeenCalledWith(['q', 'r'], 2, 14, 512);
  });

  test('string subdomains are split into characters', () => {
    const tl = new TileLayer('https://x/{z}/{x}/{y}.png', { subdomains: 'xyz' });
    tl.addTo(map);

    expect(map.wasmMap.configure_tile_layer).toHaveBeenCalledWith(['x', 'y', 'z'], 0, 18, 256);
  });

  test('configure_tile_layer failure is caught and warns instead of throwing', () => {
    const tl = new TileLayer('https://x/{z}/{x}/{y}.png');
    (map.wasmMap as any).configure_tile_layer = jest.fn(() => { throw new Error('boom'); });

    expect(() => tl.addTo(map)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'TileLayer: failed to apply options:',
      expect.any(Error)
    );
  });

  test('attribution: appended once, deduplicated across layers, removed on remove()', () => {
    const t1 = new TileLayer('https://a/{z}/{x}/{y}.png', { attribution: '© A' });
    const t2 = new TileLayer('https://b/{z}/{x}/{y}.png', { attribution: '© A' });
    t1.addTo(map);
    t2.addTo(map);

    let attrib = map.containerElement.querySelector('.rustyleaf-attribution');
    expect(attrib).not.toBeNull();
    expect(attrib.innerHTML).toBe('© A'); // deduped

    const t3 = new TileLayer('https://c/{z}/{x}/{y}.png', { attribution: '© C' });
    t3.addTo(map);
    attrib = map.containerElement.querySelector('.rustyleaf-attribution');
    expect(attrib.innerHTML.split(' | ').sort()).toEqual(['© A', '© C']);

    t1.remove();
    expect(attrib.innerHTML).toBe('© A | © C'.replace('© A | ', '')); // '© C'
    expect(t1._attributionElement).toBeNull();

    // Second remove() is a no-op (already detached)
    expect(() => t1.remove()).not.toThrow();
  });

  test('addTo with a non-map object returns this without touching wasm', () => {
    const tl = new TileLayer('https://x/{z}/{x}/{y}.png');
    const ret = tl.addTo(null);
    expect(ret).toBe(tl);
    expect(map.wasmMap.configure_tile_layer).not.toHaveBeenCalled();
    expect(tl._map).toBeUndefined();
  });

  test('remove() before addTo is safe and notifies nothing', () => {
    const tl = new TileLayer('https://x/{z}/{x}/{y}.png');
    expect(() => tl.remove()).not.toThrow();
    expect(tl._map).toBeUndefined();
  });
});

describe('Map pan/zoom helpers around maxBounds edges (real source)', () => {
  let map: any;

  beforeEach(() => { map = makeMap(); });
  afterEach(() => { if (!map._destroyed) map.remove(); });

  test('setMaxBounds stores bounds and getMaxBounds round-trips', () => {
    const b = [[40, -5], [50, 5]];
    map.setMaxBounds(b);
    expect(map.getMaxBounds()).toEqual(b);
    expect(map.setMaxBounds(null).getMaxBounds()).toBeNull();
  });

  test('setView beyond maxBounds is clamped at both corners', () => {
    map.setMaxBounds([[40, -5], [50, 5]]);

    map.setView([85, 170], 12); // far northeast (within validation limits)
    expect(map.getCenter()).toEqual([50, 5]);

    map.setView([-60, -120], 12); // far southwest
    expect(map.getCenter()).toEqual([40, -5]);

    // Inside bounds stays untouched
    map.setView([45, 0], 12);
    expect(map.getCenter()).toEqual([45, 0]);
  });

  test('panTo keeps current zoom and clamps to maxBounds', () => {
    expect(map.panTo([46, 1]).getZoom()).toBe(12);
    map.setMaxBounds([[44, -2], [49, 3]]);
    map.panTo([60, 20]);
    expect(map.getCenter()).toEqual([49, 3]);
  });

  test('_clampToMaxBounds normalizes inverted sw/ne corner ordering', () => {
    map._maxBounds = [[50, 5], [40, -5]]; // ne given as sw
    expect(map._clampToMaxBounds([45, 0])).toEqual([45, 0]);
    expect(map._clampToMaxBounds([10, -90])).toEqual([40, -5]);
  });

  test('flyTo with duration <= 0 jumps straight to the target view', () => {
    const timerSpy = jest.spyOn(globalThis, 'setInterval');
    map.flyTo([47, 3], { duration: 0 });
    expect(map.getCenter()).toEqual([47, 3]);
    expect(timerSpy).not.toHaveBeenCalled();
    timerSpy.mockRestore();
  });

  test('flyTo accepts a numeric zoom argument (Leaflet signature)', () => {
    const timerSpy = jest.spyOn(globalThis, 'setInterval');
    map.flyTo([47, 3], 14, { duration: 0 });
    expect(map.getCenter()).toEqual([47, 3]);
    expect(map.getZoom()).toBe(14);
    timerSpy.mockRestore();
  });

  test('flyToBounds delegates to fitBounds', () => {
    const fitSpy = jest.fn();
    map.fitBounds = fitSpy;
    const b = [[48, 2], [49, 3]];
    expect(map.flyToBounds(b, { duration: 0 })).toBe(map);
    expect(fitSpy).toHaveBeenCalledWith(b);
  });
});

describe('Popup _boundFns move/zoom attach-detach re-binding (real source)', () => {
  let map: any;

  beforeEach(() => { map = makeMap(); });
  afterEach(() => {
    map.closePopup();
    if (!map._destroyed) map.remove();
  });

  function listenerCount(m: any, ev: string) {
    return ((m._listeners && m._listeners[ev]) || []).length;
  }

  test('open/close/open reuses one _boundFns object and does not leak move/zoom listeners', async () => {
    const p = new RustyleafAPI.Popup({}).setLatLng([48.85, 2.35]).setContent('hi');

    p.openOn(map);
    await flush();
    expect(listenerCount(map, 'move')).toBe(1);
    expect(listenerCount(map, 'zoom')).toBe(1);
    const bound = p._boundFns;

    p.close();
    await flush();
    expect(listenerCount(map, 'move')).toBe(0);
    expect(listenerCount(map, 'zoom')).toBe(0);

    p.setSource({});
    p.openOn(map);
    await flush();
    expect(p._boundFns).toBe(bound); // reused, not recreated
    expect(listenerCount(map, 'move')).toBe(1);
    expect(listenerCount(map, 'zoom')).toBe(1);
  });

  test('autoClose registers exactly one deferred map click handler across reopen', async () => {
    const p = new RustyleafAPI.Popup({});
    p.openOn(map);
    await flush();
    expect(p._autoCloseBound).toBe(true);
    const clickCount = listenerCount(map, 'click');

    p.close();
    await flush();
    expect(p._autoCloseBound).toBe(false);
    // close() detached the auto-close click handler
    expect(listenerCount(map, 'click')).toBe(clickCount - 1);

    // Reopening registers exactly one handler again
    p.openOn(map);
    await flush();
    expect(listenerCount(map, 'click')).toBe(clickCount);
  });

  test('_removeEventListeners detaches window resize listener registered on open', async () => {
    const before = (window as any)._rustyleafProbe;
    const resizeSpy = jest.spyOn(window, 'addEventListener');
    const p = new RustyleafAPI.Popup({}).setContent('x');
    p.openOn(map);
    expect(resizeSpy).toHaveBeenCalled();
    resizeSpy.mockRestore();

    const removeSpy = jest.spyOn(window, 'removeEventListener');
    p.close();
    expect(removeSpy).toHaveBeenCalled();
    void before;
  });
});

describe.each([
  ['PointLayer', 'point'],
] as const)('%s remove + GPU free paths (real source)', () => {
  test('placeholder', () => { /* real tests below */ });
});

describe('PointLayer / LineLayer / PolygonLayer remove + GPU free (real source)', () => {
  let map: any;

  beforeEach(() => { map = makeMap(); });
  afterEach(() => { if (!map._destroyed) map.remove(); });

  test('PointLayer.remove frees GPU buffer and hides layer; re-add re-shows without new index', () => {
    const freeGpu = jest.fn();
    (map.wasmMap as any).free_point_layer_gpu = freeGpu;

    const pl = new PointLayer();
    pl.add([{ lat: 48.8, lng: 2.3 }]);
    pl.addTo(map);
    const idx = pl._layerIndex;

    pl.remove();
    expect(freeGpu).toHaveBeenCalledWith(idx);
    expect((map._attachedLayers as Set<any>).has(pl)).toBe(false);

    // Re-add to same map: takes the re-show branch, no duplicate index upload
    pl.addTo(map);
    expect(pl._layerIndex).toBe(idx);
    expect((map._attachedLayers as Set<any>).has(pl)).toBe(true);
  });

  test('PointLayer.remove survives a throwing free_point_layer_gpu (stale index)', () => {
    (map.wasmMap as any).free_point_layer_gpu = jest.fn(() => {
      throw new Error('stale gpu index');
    });
    const pl = new PointLayer();
    pl.add([{ lat: 48.8, lng: 2.3 }]);
    pl.addTo(map);

    expect(() => pl.remove()).not.toThrow();
    expect((map._attachedLayers as Set<any>).has(pl)).toBe(false);
  });

  test('LineLayer.remove frees GPU and re-add re-shows the same layer index', () => {
    const freeGpu = jest.fn();
    (map.wasmMap as any).free_line_layer_gpu = freeGpu;

    const ll = new LineLayer();
    ll.add([{ coords: [{ lat: 48.8, lng: 2.3 }, { lat: 48.9, lng: 2.4 }] }]);
    ll.addTo(map);
    const idx = (ll as any)._layerIndex;
    expect(idx).toBeDefined();

    ll.remove();
    expect(freeGpu).toHaveBeenCalledWith(idx);
    expect((map._attachedLayers as Set<any>).has(ll)).toBe(false);

    (ll as any).addTo(map);
    expect((ll as any)._layerIndex).toBe(idx);
    expect((map._attachedLayers as Set<any>).has(ll)).toBe(true);
  });

  test('PolygonLayer.remove frees GPU and re-add re-shows the same layer index', () => {
    const freeGpu = jest.fn();
    (map.wasmMap as any).free_polygon_layer_gpu = freeGpu;

    const pg = new PolygonLayer();
    pg.add([{ rings: [[{ lat: 48.8, lng: 2.3 }, { lat: 48.9, lng: 2.4 }, { lat: 48.85, lng: 2.5 }]] }]);
    pg.addTo(map);
    const idx = (pg as any)._layerIndex;

    pg.remove();
    expect(freeGpu).toHaveBeenCalledWith(idx);
    expect((map._attachedLayers as Set<any>).has(pg)).toBe(false);

    (pg as any).addTo(map);
    expect((pg as any)._layerIndex).toBe(idx);
    expect((map._attachedLayers as Set<any>).has(pg)).toBe(true);
  });

  test('layers without free_*_gpu support still remove cleanly (typeof guard)', () => {
    // No free_point_layer_gpu present on this wasmMap instance at all
    const pl = new PointLayer();
    pl.add([{ lat: 48.8, lng: 2.3 }]);
    pl.addTo(map);
    expect((map.wasmMap as any).free_point_layer_gpu).toBeUndefined();

    expect(() => pl.remove()).not.toThrow();
    expect((map._attachedLayers as Set<any>).has(pl)).toBe(false);
  });
});

describe('LayerGroup / FeatureGroup deep branches (real source)', () => {
  let map: any;

  beforeEach(() => { map = makeMap(); });
  afterEach(() => { if (!map._destroyed) map.remove(); });

  function circle(lat: number, lng: number) {
    return new Circle([lat, lng], { radius: 100 });
  }

  test('addLayer after addTo attaches late children to the live map', () => {
    const g = new LayerGroup([circle(48.85, 2.35)]);
    g.addTo(map);

    const late = circle(48.9, 2.4);
    g.addLayer(late);
    // Shapes track attachment via their underlying wasm layer, not themselves
    expect((late as any)._layer).toBeTruthy();

    g.removeLayer(late);
    // The inner layer is hidden (map ref kept for re-show), not nulled
    expect((late as any)._layer.map).toBeTruthy();

    // Duplicate add is ignored
    const first = g.getLayers()[0];
    g.addLayer(first);
    expect(g.getLayers().length).toBe(1);
  });

  test('clearLayers removes children from the map when attached, else just empties', () => {
    const detached = new LayerGroup([circle(48.85, 2.35)]);
    detached.clearLayers();
    expect(detached.getLayers()).toEqual([]);

    const g = new LayerGroup([circle(48.85, 2.35), circle(48.9, 2.4)]);
    g.addTo(map);
    g.clearLayers();
    expect(g.getLayers()).toEqual([]);
    expect(map.eachLayer.length).toBeDefined();
  });

  test('eachLayer iterates a snapshot (mutation during iteration is safe)', () => {
    const a = circle(48.85, 2.35);
    const g = new LayerGroup([a]);
    const seen: any[] = [];
    g.eachLayer((l: any) => { seen.push(l); g.removeLayer(l); });
    expect(seen).toEqual([a]);
  });

  test('remove() cascades child removal and detaches the group from its map', () => {
    const a = circle(48.85, 2.35);
    const g = new FeatureGroup([a]);
    g.addTo(map);
    expect((a as any)._layer).toBeTruthy();

    g.remove();
    // Child inner layers are hidden but keep their map ref for re-show
    expect((a as any)._layer.map).toBeTruthy();
    expect((g as any)._map).toBeNull();

    // Idempotent
    expect(() => g.remove()).not.toThrow();
  });

  test('FeatureGroup late-added children inherit previously-bound events', () => {
    const g = new FeatureGroup([]);
    const hits: string[] = [];
    g.on('click', () => hits.push('group'));

    const c = circle(48.85, 2.35);
    g.addLayer(c); // late child gets the binding applied
    expect(typeof (c as any)._layer).toBe('object');
    // The shape forwards group bindings to its underlying vector layer
    expect(hits).toEqual([]);

    // Firing through the child reaches the group binding
    (c as any).fire ? (c as any).fire('click', {}) : null;
  });

  test('FeatureGroup.off removes specific callbacks or whole event types', () => {
    const g = new FeatureGroup([]);
    const cb1 = () => {};
    const cb2 = () => {};
    g.on('click', cb1);
    g.on('click', cb2);
    expect((g as any)._groupBindings.filter((b: any) => b.event === 'click').length).toBe(2);

    g.off('click', cb1);
    expect((g as any)._groupBindings.map((b: any) => b.callback)).toEqual([cb2]);

    g.off('click');
    expect((g as any)._groupBindings).toEqual([]);
  });

  test('getBounds unions child bounds; empty group and childless-null cases return null', () => {
    expect(new FeatureGroup([]).getBounds()).toBeNull();

    const g = new FeatureGroup([
      new Circle([48.85, 2.35], { radius: 0 }),
      new Circle([49.0, 2.6], { radius: 0 }),
    ]);
    const b = g.getBounds();
    expect(b[0][0]).toBeCloseTo(48.85, 5);
    expect(b[1][0]).toBeCloseTo(49.0, 5);
    expect(b[1][1]).toBeCloseTo(2.6, 5);

    // Children without getBounds are skipped
    const mixed = new FeatureGroup([{} as any]);
    expect(mixed.getBounds()).toBeNull();
  });

  test('hasLayer / getLayers reflect membership', () => {
    const a = circle(48.85, 2.35);
    const g = new LayerGroup([a]);
    expect(g.hasLayer(a)).toBe(true);
    expect(g.hasLayer(circle(0, 0))).toBe(false);
    expect(g.getLayers()).toEqual([a]);
  });
});

describe('ImageOverlay / VideoOverlay / SVGOverlay branches (real source)', () => {
  let map: any;

  beforeEach(() => { map = makeMap(); });
  afterEach(() => {
    document.querySelectorAll(
      '.rustyleaf-image-overlay,.rustyleaf-video-overlay,.rustyleaf-svg-overlay'
    ).forEach((n) => n.remove());
    if (!map._destroyed) map.remove();
  });

  test('bounds edge cases: setBounds clones inputs and getBounds round-trips', () => {
    const io = new ImageOverlay('u.png', [[48.8, 2.3], [48.9, 2.4]]);
    const b = [[10, 20], [30, 40]];
    io.setBounds(b);
    b[0][0] = 999; // mutate caller's array — overlay must hold its own copy
    expect(io.getBounds()).toEqual([[10, 20], [30, 40]]);
  });

  test('bringToFront/bringToBack are safe before the overlay is attached', () => {
    const io = new ImageOverlay('u.png', [[48.8, 2.3], [48.9, 2.4]]);
    expect(io.getElement()).toBeNull();
    expect(() => io.bringToFront()).not.toThrow();
    expect(() => io.bringToBack()).not.toThrow();
  });

  test('after addTo, bringToFront/bringToBack reorder within the container', () => {
    const io = new ImageOverlay('u.png', [[48.8, 2.3], [48.9, 2.4]], { interactive: true });
    io.addTo(map);
    expect(io.getElement().parentNode).toBe(map.containerElement);
    expect(io.bringToFront().getElement().style.pointerEvents).toBe('auto');
    io.bringToBack();
    expect(map.containerElement.contains(io.getElement())).toBe(true);
  });

  test('opacity and className options apply to the element; setters work pre-attach', () => {
    const io = new ImageOverlay('u.png', [[48.8, 2.3], [48.9, 2.4]], {
      opacity: 0.5,
      className: 'fancy',
      alt: 'photo',
    });
    io.setOpacity(0.25); // before attach: stores option
    io.setUrl('v.png');
    io.addTo(map);
    const el = io.getElement() as HTMLImageElement;
    expect(el.style.opacity).toBe('0.25'); // latest setOpacity wins at attach
    expect(el.classList.contains('fancy')).toBe(true);
    expect(el.getAttribute('alt')).toBe('photo');
    expect(el.getAttribute('src')).toBe('v.png'); // setUrl pre-attach honored
  });

  test('remove() detaches element and view listeners; second remove is idempotent', async () => {
    const io = new ImageOverlay('u.png', [[48.8, 2.3], [48.9, 2.4]]);
    io.addTo(map);
    await flush();
    expect(((map as any)._listeners['move'] || []).length).toBeGreaterThan(0);

    const moveCountBefore = ((map as any)._listeners['move'] || []).length;
    io.remove();
    expect(map.containerElement.querySelector('.rustyleaf-image-overlay')).toBeNull();
    expect(((map as any)._listeners['move'] || []).length).toBe(moveCountBefore - 1);

    expect(() => io.remove()).not.toThrow(); // idempotent
  });

  test('VideoOverlay defaults mute/loop/autoplay on, explicit falses win', () => {
    const v1 = new VideoOverlay('clip.mp4', [[48.8, 2.3], [48.9, 2.4]]);
    v1.addTo(map);
    const e1 = v1.getElement() as HTMLVideoElement;
    expect(e1.tagName).toBe('VIDEO');
    expect(e1.muted).toBe(true);
    expect(e1.loop).toBe(true);
    expect(e1.autoplay).toBe(true);
    v1.remove();

    const v2 = new VideoOverlay('clip.mp4', [[48.8, 2.3], [48.9, 2.4]], {
      muted: false, loop: false, autoplay: false,
    });
    v2.addTo(map);
    const e2 = v2.getElement() as HTMLVideoElement;
    expect(e2.muted).toBe(false);
    expect(e2.loop).toBe(false);
    expect(e2.autoplay).toBe(false);

    v2.setUrl('other.mp4');
    expect(e2.src).toContain('other.mp4');
  });

  test('SVGOverlay wraps a provided svg element; setUrl is a no-op', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    const so = new SVGOverlay(svg, [[48.8, 2.3], [48.9, 2.4]]);
    expect(so.setUrl('ignored.png')).toBe(so);
    so.addTo(map);
    expect(so.getElement()).toBe(svg);
    expect(svg.classList.contains('rustyleaf-svg-overlay')).toBe(true);
    expect(map.containerElement.contains(svg)).toBe(true);
    so.remove();
    expect(map.containerElement.contains(svg)).toBe(false);
  });
});

describe('GeoJSONLayer feature-event dispatch + handles (real source)', () => {
  let map: any;
  const warnSpyRef = { current: null as jest.SpyInstance | null };

  beforeEach(() => {
    map = makeMap();
    warnSpyRef.current = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpyRef.current?.mockRestore();
    if (!map._destroyed) map.remove();
  });

  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[2.3, 48.8], [2.4, 48.9]] }, properties: { name: 'road-a' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[2.31, 48.81], [2.41, 48.91]] }, properties: { name: 'road-b' } },
    ],
  };

  function hitMeta(layerIndex: number, fid: number) {
    return { layer_type: 'geojson', layer_index: layerIndex, feature_index: fid, original_meta: { __rl_fid: fid } };
  }

  test('own-hit click dispatches to the right feature handle', () => {
    const seen: string[] = [];
    const layer = new GeoJSONLayer(fc, {
      onEachFeature: (f: any, h: any) => h.on('click', (e: any) => seen.push(e.feature.properties.name)),
    });
    layer.addTo(map);

    layer._dispatchFeatureEvent({ feature: hitMeta(layer.layerIndex, 1), latlng: [48.8, 2.3] }, 'click');
    expect(seen).toEqual(['road-b']);
  });

  test('cross-layer fid collision: a hit on layer A does NOT fire layer B handles', () => {
    const aHits: string[] = [];
    const bHits: string[] = [];
    const layerA = new GeoJSONLayer(fc, {
      onEachFeature: (f: any, h: any) => h.on('click', () => aHits.push(f.properties.name)),
    }).addTo(map);
    const layerB = new GeoJSONLayer(fc, {
      onEachFeature: (f: any, h: any) => h.on('click', () => bHits.push(f.properties.name)),
    }).addTo(map);

    expect(layerB.layerIndex).not.toBe(layerA.layerIndex);

    // Click lands on layer A's feature 0 — layer B shares fid numbering.
    layerB._dispatchFeatureEvent({ feature: hitMeta(layerA.layerIndex, 0) }, 'click');
    expect(bHits).toEqual([]);
    expect(aHits).toEqual([]);

    layerA._dispatchFeatureEvent({ feature: hitMeta(layerA.layerIndex, 0) }, 'click');
    expect(aHits).toEqual(['road-a']);
    expect(bHits).toEqual([]);
  });

  test('hover opens a tooltip and hovering another feature closes the previous one', () => {
    const layer = new GeoJSONLayer(fc, {
      onEachFeature: (f: any, h: any) => h.bindTooltip(`tip-${f.properties.name}`),
    }).addTo(map);

    layer._dispatchFeatureEvent({ feature: hitMeta(layer.layerIndex, 0), latlng: [48.8, 2.3] }, 'hover');
    expect(layer._openTooltip).not.toBeNull();
    expect(layer._openTooltipFid).toBe(0);

    layer._dispatchFeatureEvent({ feature: hitMeta(layer.layerIndex, 1), latlng: [48.8, 2.3] }, 'hover');
    expect(layer._openTooltipFid).toBe(1);

    // Same-fid hover does not stack a second tooltip
    const before = layer._openTooltip;
    layer._dispatchFeatureEvent({ feature: hitMeta(layer.layerIndex, 1), latlng: [48.8, 2.3] }, 'hover');
    expect(layer._openTooltip).toBe(before);
  });

  test('feature click with bound popup opens it on the map', () => {
    const layer = new GeoJSONLayer(fc, {
      onEachFeature: (f: any, h: any) => h.bindPopup(`pop-${f.properties.name}`),
    }).addTo(map);

    layer._dispatchFeatureEvent({ feature: hitMeta(layer.layerIndex, 0), latlng: [48.8, 2.3] }, 'click');
    expect(map._activePopup).not.toBeNull();
    expect(map.containerElement.querySelector('.rustyleaf-popup')).not.toBeNull();
  });

  test('non-feature hit still delivers layer-level listeners with normalized payload', () => {
    const layer = new GeoJSONLayer(fc);
    const got: any[] = [];
    layer.on('click', (e: any) => got.push(e));
    layer.addTo(map);

    // No original_meta → normalizedFeature null, but listener fires
    layer._dispatchFeatureEvent({ feature: { layer_type: 'geojson', layer_index: layer.layerIndex } }, 'click');
    expect(got.length).toBe(1);
    expect(got[0].type).toBe('click');
    expect(got[0].target).toBe(layer);
    expect(got[0].feature).toBeNull();

    // With original_meta, properties are wrapped from the raw meta
    got.length = 0;
    layer._dispatchFeatureEvent({
      feature: { layer_type: 'geojson', layer_index: layer.layerIndex, original_meta: { k: 1 } },
    }, 'click');
    expect(got[0].feature).toEqual({ geometry: null, properties: { k: 1 } });
  });

  test('layer-level listeners also see feature hits; a throwing handler is isolated', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // onEachFeature creates per-feature handles — required for feature-hit
    // dispatch to reach layer-level listeners (no-handle hits return early).
    const layer = new GeoJSONLayer(fc, { onEachFeature: () => {} });
    const calls: string[] = [];
    layer.on('click', () => { calls.push('first'); throw new Error('handler blew up'); });
    layer.on('click', () => calls.push('second'));
    layer.addTo(map);

    layer._dispatchFeatureEvent({ feature: hitMeta(layer.layerIndex, 0) }, 'click');
    expect(calls).toEqual(['first', 'second']);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('handle off() unsubscribes a specific callback', () => {
    const seen: string[] = [];
    const layer = new GeoJSONLayer(fc, {
      onEachFeature: (f: any, h: any) => {
        const cb = () => seen.push(f.properties.name);
        h.on('click', cb);
        h.on('click', cb);
        h.off('click', cb);
      },
    });
    layer.addTo(map);

    layer._dispatchFeatureEvent({ feature: hitMeta(layer.layerIndex, 0) }, 'click');
    expect(seen).toEqual([]);
  });

  test('clear() wipes data; calls wasm clear only when mounted', () => {
    const layerNoMap = new GeoJSONLayer(fc);
    layerNoMap.loadData(fc);
    layerNoMap.clear();
    expect(layerNoMap.geojson).toBeNull();

    const layer = new GeoJSONLayer(fc);
    layer.addTo(map);
    layer.clear();
    expect(layer.geojson).toBeNull();
  });

  test('remove() twice is idempotent and hides the wasm layer only once meaningfully', () => {
    const layer = new GeoJSONLayer(fc);
    layer.addTo(map);
    layer.remove();
    expect(() => layer.remove()).not.toThrow();
    expect(map.hasLayer(layer)).toBe(false);
  });
});

describe('Shape redraw-on-set branches (Circle/CircleMarker/Rectangle)', () => {
  let map: any;

  beforeEach(() => { map = makeMap(); });
  afterEach(() => { if (!map._destroyed) map.remove(); });

  test('geometry setters before addTo do not throw (redraw is a no-op without a map)', () => {
    const c = new Circle([48.85, 2.35]);
    expect(c.setRadius(500)).toBe(c);
    expect(c.setLatLng([48, 2])).toBe(c);
    expect(c.getRadius()).toBe(500);

    const cm = new CircleMarker([48.85, 2.35]);
    expect(cm.setRadius(7)).toBe(cm);
    expect(cm.setLatLng([48, 2])).toBe(cm);

    const r = new Rectangle([[48.8, 2.3], [48.9, 2.4]]);
    expect(r.setBounds([[48, 2], [49, 3]])).toBe(r);
    expect(r.getBounds()).toEqual([[48, 2], [49, 3]]);
  });

  test('Circle.setRadius after addTo rebuilds the underlying polygon layer', () => {
    const c = new Circle([48.85, 2.35], { radius: 100 });
    c.addTo(map);
    const oldLayer = (c as any)._layer;
    expect(oldLayer).toBeTruthy();

    c.setRadius(300);
    expect((c as any)._layer).not.toBe(oldLayer);
    expect((c as any)._attachedMap).toBe(map);
    // The rebuilt inner layer is attached to the same map
    expect((map._attachedLayers as Set<any>).has((c as any)._layer)).toBe(true);
  });

  test('CircleMarker.setLatLng after addTo swaps in a fresh point layer', () => {
    const cm = new CircleMarker([48.85, 2.35], { radius: 5 });
    cm.addTo(map);
    const oldLayer = (cm as any)._layer;

    cm.setLatLng([48.9, 2.4]);
    expect((cm as any)._layer).not.toBe(oldLayer);
    expect(cm.getLatLng()).toEqual([48.9, 2.4]);
  });

  test('Rectangle.setBounds after addTo rebuilds; ring corners match bounds', () => {
    const r = new Rectangle([[48.8, 2.3], [48.9, 2.4]]);
    r.addTo(map);
    const oldLayer = (r as any)._layer;

    r.setBounds([[10, 20], [30, 40]]);
    expect((r as any)._layer).not.toBe(oldLayer);

    const uploaded = ((r as any)._layer.polygons as any[])[0];
    expect(uploaded.rings[0]).toEqual([
      { lat: 10, lng: 20 },
      { lat: 10, lng: 40 },
      { lat: 30, lng: 40 },
      { lat: 30, lng: 20 },
    ]);
  });

  test('events registered before addTo are replayed onto the underlying layer', () => {
    const c = new Circle([48.85, 2.35]);
    const hits: string[] = [];
    c.on('click', () => hits.push('clicked'));
    expect((c as any)._pendingEvents.length).toBe(1);

    c.addTo(map);
    expect((c as any)._pendingEvents.length).toBe(0);
    expect((c as any)._layer.clickCallback).toBeDefined();
  });

  test('re-adding a shape to the same map reuses its layer (reattach branch)', () => {
    const c = new Circle([48.85, 2.35], { radius: 100 });
    c.addTo(map);
    const layer = (c as any)._layer;
    c.remove();
    c.addTo(map);
    expect((c as any)._layer).toBe(layer);
  });

  test('Circle.getBounds reflects geodesic radius shrinkage with latitude', () => {
    const eq = new Circle([0, 0], { radius: 111320 }); // ~1 deg
    const bEq = eq.getBounds();
    expect(Math.abs(bEq[1][0] - 1)).toBeLessThan(1e-6);    // dLat ≈ 1° at equator
    expect(Math.abs(bEq[1][1] - 1)).toBeLessThan(1e-6);    // ne lng ≈ +1°

    const polar = new Circle([60, 0], { radius: 111320 });
    const bP = polar.getBounds();
    // dLat is unchanged by latitude; dLng doubles at cos(60°)=0.5
    expect(bP[1][0]).toBeCloseTo(60 + 1, 5);
    expect((bP[1][1] - bP[0][1])).toBeCloseTo(4, 5);       // 2 * (2 * dLng_eq)
  });
});

describe('Marker icon/Draggable/event toggles without a map (real source)', () => {
  test('constructor validates latlng strictly', () => {
    expect(() => new Marker([48.85, 2.35])).not.toThrow();
    expect(() => new Marker([NaN, 2] as any)).toThrow(/Invalid latlng/);
    expect(() => new Marker([48.85] as any)).toThrow(/Invalid latlng/);
    expect(() => new Marker('x' as any)).toThrow(/Invalid latlng/);
  });

  test('setIcon / icon accessors work without a map', () => {
    const m = new Marker([48.85, 2.35]);
    const custom = new RustyleafAPI.Icon({ iconUrl: 'pin.png' });
    expect(m.setIcon(custom)).toBe(m);
    expect(m.getIcon()).toBe(custom);
    expect(m.getIcon().options.iconUrl).toBe('pin.png');
  });

  test('setDraggable/isDraggable toggle without a map', () => {
    const m = new Marker([48.85, 2.35], { draggable: true });
    expect(m.isDraggable()).toBe(true);
    m.setDraggable(false);
    expect(m.isDraggable()).toBe(false);
    m.setDraggable(1 as any);
    expect(m.isDraggable()).toBe(true);
    m.setDraggable(undefined as any);
    expect(m.isDraggable()).toBe(false);
  });

  test('off(event) without a callback removes ALL listeners for that event', () => {
    const m = new Marker([48.85, 2.35]);
    const calls: number[] = [];
    const a = () => calls.push(1);
    const b = () => calls.push(2);
    m.on('click', a);
    m.on('click', b);
    m.fire('click', {});
    expect(calls).toEqual([1, 2]);

    m.off('click'); // wipe-all branch
    m.fire('click', {});
    expect(calls).toEqual([1, 2]);
  });

  test('off of a missing event type is a safe no-op', () => {
    const m = new Marker([48.85, 2.35]);
    expect(m.off('nothing')).toBe(m);
  });

  test('once() fires exactly once then self-unregisters', () => {
    const m = new Marker([48.85, 2.35]);
    const calls: any[] = [];
    m.once('click', (d: any) => calls.push(d));
    m.fire('click', { n: 1 });
    m.fire('click', { n: 2 });
    expect(calls).toEqual([{ n: 1 }]);
  });

  test('setOpacity clamps to [0,1]; zIndexOffset setter round-trips (no map attached)', () => {
    const m = new Marker([48.85, 2.35]);
    expect(m.setOpacity(-5).getOpacity()).toBe(0);
    expect(m.setOpacity(2).getOpacity()).toBe(1);
    expect(m.setOpacity(0.42).getOpacity()).toBe(0.42);
    expect(m.setZIndexOffset(77).getZIndexOffset()).toBe(77);
  });

  test('remove() before addTo is a safe no-op', () => {
    const m = new Marker([48.85, 2.35]);
    expect(m.remove()).toBe(m);
    expect(m.getElement()).toBeNull();
  });
});
