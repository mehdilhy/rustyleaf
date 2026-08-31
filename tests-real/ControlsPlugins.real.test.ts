/**
 * Region E coverage (REAL source): controls, handlers, util, misc plugin surface.
 *
 * Targets uncovered ranges of src/rustyleaf-api.js:
 *   - 3724            AttributionControl onAdd: static-position container fix
 *   - 3782-3797       ScaleControl move/zoom handler wiring + teardown
 *   - 3824-3842       ScaleControl metric/imperial render branches (+both-off fallback)
 *   - 3890-3919       WMSTileLayer.setParams (attached + detached paths)
 *   - 3959            GridLayer.addTo static-position fix
 *   - 4010-4012       GridLayer stale-tile pruning
 *   - 4093-4112       Util.throttle lock/pendingArgs machinery
 *   - 4123            Util.falseFn
 *   - 4152-4155       LayersControl constructor base+overlay wiring
 *   - 4172-4174       LayersControl.removeLayer
 *   - 4212-4215       LayersControl base-layer radio switch handler
 *
 * Run: npx jest --config jest.real.config.js tests-real/ControlsPlugins.real.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const {
  Map,
  Control,
  ZoomControl,
  AttributionControl,
  ScaleControl,
  LayersControl,
  WMSTileLayer,
  GridLayer,
  Handler,
  Util,
} = RustyleafAPI as any;

function makeMap(options: any = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, Object.assign({ center: [48.8566, 2.3522], zoom: 12 }, options));
}

function fakeLayer(name = 'layer') {
  return {
    name,
    addTo: jest.fn(function (this: any) { return this; }),
    remove: jest.fn(function (this: any) { return this; }),
  };
}

describe('AttributionControl (lines ~3704-3761, incl. 3724)', () => {
  test('default prefix renders and registers itself on the map', () => {
    const map = makeMap();
    const attr = new AttributionControl();
    expect(attr.getPrefix()).toBe('Rustyleaf');
    attr.addTo(map);

    const el = map.containerElement.querySelector('.rustyleaf-attribution');
    expect(el).toBeTruthy();
    expect(attr.getContainer()).toBe(el);
    expect((el as HTMLElement).textContent).toBe('Rustyleaf');
    expect(map.attributionControl).toBe(attr);
  });

  test('fixes static-position map container (line 3724)', () => {
    const map = makeMap();
    // Force the container back to static to exercise the branch.
    map.containerElement.style.position = 'static';
    const attr = new AttributionControl();
    attr.addTo(map);
    expect(map.containerElement.style.position).toBe('relative');
  });

  test('addAttribution dedupes and ignores falsy text', () => {
    const map = makeMap();
    const attr = new AttributionControl();
    attr.addTo(map);
    attr.addAttribution('');
    attr.addAttribution(null);
    expect(attr.getAttributions()).toEqual([]);

    attr.addAttribution('© OSM');
    attr.addAttribution('© OSM'); // duplicate ignored
    expect(attr.getAttributions()).toEqual(['© OSM']);
    expect((attr.getContainer() as HTMLElement).textContent).toBe('Rustyleaf | © OSM');
  });

  test('getAttributions returns a defensive copy', () => {
    const attr = new AttributionControl();
    attr.addAttribution('a');
    const copy = attr.getAttributions();
    copy.push('bogus');
    expect(attr.getAttributions()).toEqual(['a']);
  });

  test('setPrefix updates rendering; custom prefix via options', () => {
    const map = makeMap();
    const attr = new AttributionControl({ prefix: 'Leaflet' });
    expect(attr.getPrefix()).toBe('Leaflet');
    attr.addTo(map);
    expect((attr.getContainer() as HTMLElement).textContent).toBe('Leaflet');

    attr.setPrefix('Powered by X');
    expect(attr.getPrefix()).toBe('Powered by X');
    expect((attr.getContainer() as HTMLElement).textContent).toBe('Powered by X');

    attr.setPrefix(''); // empty prefix drops the part entirely
    attr.addAttribution('src');
    expect((attr.getContainer() as HTMLElement).textContent).toBe('src');
  });

  test('remove() detaches container and clears state', () => {
    const map = makeMap();
    const attr = new AttributionControl().addTo(map);
    const el = attr.getContainer() as HTMLElement;
    attr.remove();
    expect(el.parentNode).toBeNull();
    expect(attr.getContainer()).toBeNull();
    expect(attr._map).toBeNull();
  });
});

describe('ScaleControl (lines ~3763-3859, incl. 3782-3797, 3824-3842)', () => {
  // At zoom 12 / Paris, mpp ≈ 25.1 m/px → maxWidth 100 ⇒ ~2.5km ("2 km") and
  // ~8250ft ≥ 1mi ("1 mi"); maxWidth 10 ⇒ ~251m ("m" branch) and ~825ft ("ft" branch).
  const labelsOf = (ctrl: any) =>
    Array.from((ctrl.getContainer() as HTMLElement).querySelectorAll('span')).map(
      (s) => s.textContent
    );

  test('default: renders both metric (km) and imperial (mi) segments', () => {
    const map = makeMap();
    const scale = new ScaleControl();
    scale.addTo(map);
    expect(scale.getContainer()).toBeTruthy();
    const labels = labelsOf(scale);
    expect(labels.some((l) => / km$/.test(l!))).toBe(true);
    expect(labels.some((l) => / mi$/.test(l!))).toBe(true);
  });

  test('small maxWidth hits metres and feet branches (lines 3824, 3836)', () => {
    const map = makeMap();
    const scale = new ScaleControl({ maxWidth: 10 });
    scale.addTo(map);
    const labels = labelsOf(scale);
    expect(labels.some((l) => / m$/.test(l!) && !/km/.test(l!))).toBe(true);
    expect(labels.some((l) => / ft$/.test(l!))).toBe(true);
    expect(labels.some((l) => / mi$/.test(l!))).toBe(false);
  });

  test('imperial:false → metric only', () => {
    const map = makeMap();
    const scale = new ScaleControl({ imperial: false });
    scale.addTo(map);
    const labels = labelsOf(scale);
    expect(labels.length).toBe(1);
    expect(labels[0]).toMatch(/(km|m)$/);
  });

  test('metric:false → imperial only', () => {
    const map = makeMap();
    const scale = new ScaleControl({ metric: false });
    scale.addTo(map);
    const labels = labelsOf(scale);
    expect(labels.length).toBe(1);
    expect(labels[0]).toMatch(/(mi|ft)$/);
  });

  test('metric:false && imperial:false → Leaflet-style fallback keeps metric (3840-3843)', () => {
    const map = makeMap();
    const scale = new ScaleControl({ metric: false, imperial: false });
    scale.addTo(map);
    const labels = labelsOf(scale);
    expect(labels.length).toBe(1);
    expect(labels[0]!.endsWith(' m')).toBe(true);
    // Fallback width is the full maxWidth bar.
    const lineEl = (scale.getContainer() as HTMLElement).querySelector(
      'div'
    ) as HTMLElement;
    expect(lineEl.style.width).toBe('100px');
  });

  test('onAdd wires move/zoom handlers; onRemove unwinds them (3782-3797)', () => {
    const map = makeMap();
    const onSpy = jest.spyOn(map, 'on');
    const offSpy = jest.spyOn(map, 'off');

    const scale = new ScaleControl();
    scale.addTo(map);
    expect(onSpy).toHaveBeenCalledWith('move', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('zoom', expect.any(Function));
    const handlers = scale._viewHandlers;
    expect(handlers).toBeTruthy();

    const beforeUpdate = (scale.getContainer() as HTMLElement).innerHTML;
    // Fire the wired handlers directly — they must re-render the bar.
    handlers.move();
    handlers.zoom();
    expect((scale.getContainer() as HTMLElement).innerHTML).toBe(beforeUpdate);

    scale.remove();
    expect(offSpy).toHaveBeenCalledWith('move', handlers.move);
    expect(offSpy).toHaveBeenCalledWith('zoom', handlers.zoom);
    expect(scale._viewHandlers).toBeNull();

    onSpy.mockRestore();
    offSpy.mockRestore();
  });

  test('_update is a no-op without a container or map', () => {
    const scale = new ScaleControl();
    expect(() => scale._update(undefined)).not.toThrow();
    const map = makeMap();
    scale._update(map); // no _containerEl yet
    expect(scale.getContainer()).toBeNull();
  });
});

describe('ZoomControl inherits Control API (sanity for region E base class)', () => {
  test('position getters/setters and container plumbing', () => {
    const map = makeMap();
    const zoom = new ZoomControl({ position: 'topright' });
    expect(zoom.getPosition()).toBe('topright');
    zoom.setPosition('bottomleft');
    expect(zoom.getPosition()).toBe('bottomleft');
    zoom.addTo(map);
    expect(
      map.containerElement.querySelector('.rustyleaf-zoom-control')
    ).toBeTruthy();
    zoom.remove();
    expect(zoom.getContainer()).toBeNull();
  });

  test('base Control.onAdd/onRemove defaults', () => {
    const map = makeMap();
    const c = new Control();
    c.addTo(map);
    expect(c.getContainer()).toBeTruthy();
    expect(c.onRemove(map)).toBe(c);
    c.remove();
  });
});

describe('LayersControl (lines ~4147-4223, incl. 4152-4155, 4172-4174, 4212-4215)', () => {
  test('constructor wires base layers AND overlays (4151-4156)', () => {
    const base1 = fakeLayer('base1');
    const base2 = fakeLayer('base2');
    const over1 = fakeLayer('over1');
    const ctrl = new LayersControl(
      { 'Base One': base1, 'Base Two': base2 },
      { 'Overlay One': over1 }
    );
    expect(ctrl._entries.map((e: any) => e.name)).toEqual([
      'Base One',
      'Base Two',
      'Overlay One',
    ]);
    expect(ctrl._entries.map((e: any) => e.overlay)).toEqual([
      false,
      false,
      true,
    ]);
  });

  test('renders radios for bases and checkboxes for overlays after addTo', () => {
    const map = makeMap();
    const base1 = fakeLayer();
    const over1 = fakeLayer();
    const ctrl = new LayersControl({ B: base1 }, { O: over1 });
    ctrl.addTo(map);

    const root = map.containerElement.querySelector('.rustyleaf-layers-control');
    expect(root).toBeTruthy();
    const inputs = Array.from(root!.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.length).toBe(2);
    expect(inputs[0].type).toBe('radio');
    expect(inputs[0].name).toBe('rustyleaf-base-layer');
    expect(inputs[1].type).toBe('checkbox');
    expect(inputs.every((i) => i.checked)).toBe(true);
    expect(root!.textContent).toContain('B');
    expect(root!.textContent).toContain('O');
  });

  test('works with no initial layers', () => {
    const ctrl = new LayersControl(undefined as any, undefined as any);
    expect(ctrl._entries).toEqual([]);
    expect(ctrl.getContainer()).toBeNull(); // not added yet → _refresh early-returns
  });

  test('removeLayer filters entries and refreshes DOM (4172-4174)', () => {
    const map = makeMap();
    const b1 = fakeLayer();
    const b2 = fakeLayer();
    const ctrl = new LayersControl({ A: b1, B: b2 });
    ctrl.addTo(map);
    let inputs = ctrl.getContainer().querySelectorAll('input');
    expect(inputs.length).toBe(2);

    ctrl.removeLayer(b1);
    expect(ctrl._entries.length).toBe(1);
    inputs = ctrl.getContainer().querySelectorAll('input');
    expect(inputs.length).toBe(1);
  });

  test('selecting a base radio removes sibling base layers and adds the chosen one (4205-4216)', () => {
    const map = makeMap();
    const streets = fakeLayer('streets');
    const satellite = fakeLayer('satellite');
    const ctrl = new LayersControl({ Streets: streets, Satellite: satellite });
    ctrl.addTo(map);

    const inputs = Array.from(
      ctrl.getContainer().querySelectorAll('input')
    ) as HTMLInputElement[];
    // Simulate switching to Satellite: uncheck its radio, fire change.
    inputs[1].checked = false;
    inputs[1].dispatchEvent(new Event('change'));

    expect(satellite.addTo).toHaveBeenCalledWith(map);
    // The non-selected base got removed exactly once by the switch handler.
    expect(streets.remove).toHaveBeenCalled();
  });

  test('overlay checkbox toggles add/remove of the overlay layer', () => {
    const map = makeMap();
    const over = fakeLayer('over');
    const ctrl = new LayersControl(null as any, { Over: over });
    ctrl.addTo(map);

    const box = ctrl.getContainer().querySelector('input') as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(over.remove).toHaveBeenCalled();

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(over.addTo).toHaveBeenCalledWith(map);
  });

  test('change handler is inert before the control is on a map', () => {
    const layer = fakeLayer();
    const ctrl = new LayersControl({ L: layer });
    // No _container until addTo → build one manually to reach _refresh listener.
    ctrl._container = document.createElement('div');
    ctrl._refresh();
    const input = ctrl._container.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new Event('change')); // this._map is null → early return
    expect(layer.addTo).not.toHaveBeenCalled();
    expect(layer.remove).not.toHaveBeenCalled();
  });

  test('addBaseLayer/addOverlay chainable and refresh live DOM', () => {
    const map = makeMap();
    const ctrl = new LayersControl();
    ctrl.addTo(map);
    expect(ctrl.addBaseLayer(fakeLayer(), 'New Base')).toBe(ctrl);
    expect(ctrl.addOverlay(fakeLayer(), 'New Over')).toBe(ctrl);
    expect(ctrl.getContainer().querySelectorAll('input').length).toBe(2);
  });
});

describe('WMSTileLayer.setParams (lines 3888-3921, target 3890-3919)', () => {
  test('builds a WMS GetMap URL with encoded default params', () => {
    const wms = new WMSTileLayer('https://example.com/wms', {
      layers: 'topo',
    });
    expect(wms.wmsParams.service).toBe('WMS');
    expect(wms.wmsParams.request).toBe('GetMap');
    expect(wms.wmsParams.layers).toBe('topo');
    expect(wms.wmsParams.version).toBe('1.1.1');
    expect(wms._baseUrl).toBe('https://example.com/wms');
    expect(wms.url_template ?? wms.wasmTileLayer.urlTemplate).toContain(
      'service=WMS'
    );
    expect(wms.wasmTileLayer.urlTemplate).toContain('srs=EPSG%3A3857');
    // NOTE: the {bbox-epsg-3857} token is appended raw (not encoded).
    expect(wms.wasmTileLayer.urlTemplate.endsWith('&bbox={bbox-epsg-3857}')).toBe(true);
  });

  test('baseUrl containing ? joins params with &', () => {
    const wms = new WMSTileLayer('https://example.com/wms?token=x', {});
    expect(wms.wasmTileLayer.urlTemplate.startsWith(
      'https://example.com/wms?token=x&service=WMS'
    )).toBe(true);
  });

  test('version 1.3.0 uses crs instead of srs', () => {
    const wms = new WMSTileLayer('https://example.com/wms', {
      version: '1.3.0',
    });
    expect(wms.wmsParams.crs).toBe('EPSG:3857');
    expect(wms.wmsParams.srs).toBeUndefined();
    expect(wms.wasmTileLayer.urlTemplate).toContain('crs=EPSG%3A3857');
    expect(wms.wasmTileLayer.urlTemplate).not.toContain('srs=');
  });

  test('transparent/style/format/tileSize options are honoured', () => {
    const wms = new WMSTileLayer('https://example.com/wms', {
      transparent: true,
      styles: 'dark',
      format: 'image/jpeg',
      tileSize: 512,
    });
    expect(wms.wmsParams.transparent).toBe('true');
    expect(wms.wmsParams.styles).toBe('dark');
    expect(wms.wmsParams.format).toBe('image/jpeg');
    expect(wms.wmsParams.width).toBe(512);
    expect(wms.wmsParams.height).toBe(512);
  });

  test('setParams while DETACHED falls back to updating url_template (3916-3917)', () => {
    const wms = new WMSTileLayer('https://example.com/wms', { layers: 'a' });
    // Simulate a wasm layer exposing a writable template.
    (wms as any).wasmTileLayer = { url_template: 'old-template' };
    const ret = wms.setParams({ layers: 'b', styles: 'bold' });
    expect(ret).toBe(wms);
    expect(wms.wasmTileLayer.url_template).toContain('layers=b');
    expect(wms.wasmTileLayer.url_template).toContain('styles=bold');
    expect(wms.wasmTileLayer.url_template).toContain('srs=EPSG%3A3857');
    expect(wms.wmsParams.layers).toBe('b');
  });

  test('setParams while ATTACHED rebuilds the wasm tile layer (3898-3915)', () => {
    const map = makeMap();
    // Extend the mocked wasm core instance with the tile-swap surface.
    (map.wasmMap as any).remove_tile_layer = jest.fn();
    (map.wasmMap as any).configure_tile_layer = jest.fn();

    const wms = new WMSTileLayer('https://example.com/wms', {
      layers: 'base',
      maxZoom: 19,
      subdomains: 'abc',
      minZoom: 2,
      tileSize: 256,
    });
    wms.addTo(map);
    const oldWasmLayer = wms.wasmTileLayer;

    wms.setParams({ layers: 'updated', version: '1.3.0' });

    expect((map.wasmMap as any).remove_tile_layer).toHaveBeenCalled();
    expect(wms.wasmTileLayer).not.toBe(oldWasmLayer);
    expect(wms.wasmTileLayer.urlTemplate).toContain('layers=updated');
    expect(wms.wasmTileLayer.urlTemplate).toContain('crs=EPSG%3A3857');
    expect(wms.wmsParams.crs).toBe('EPSG:3857');
    expect((map.wasmMap as any).configure_tile_layer).toHaveBeenCalled();
    const args = (map.wasmMap as any).configure_tile_layer.mock.calls.at(-1);
    expect(args[0]).toEqual(['a', 'b', 'c']);
    expect(args[1]).toBe(2);
    expect(args[2]).toBe(19);
    expect(args[3]).toBe(256);
  });

  test('setParams with array subdomains passes them through', () => {
    const map = makeMap();
    (map.wasmMap as any).remove_tile_layer = jest.fn();
    (map.wasmMap as any).configure_tile_layer = jest.fn();

    const wms = new WMSTileLayer('https://example.com/wms', {
      subdomains: ['q', 'r'],
    });
    wms.addTo(map);
    wms.setParams({});
    const args = (map.wasmMap as any).configure_tile_layer.mock.calls.at(-1);
    expect(args[0]).toEqual(['q', 'r']);
    // Defaults for unset numeric options.
    expect(args[1]).toBe(0);
    expect(args[2]).toBe(18);
    expect(args[3]).toBe(256);
  });

  test('setParams skips wasm plumbing when no zoom/subdomain options set', () => {
    const map = makeMap();
    (map.wasmMap as any).remove_tile_layer = jest.fn();
    (map.wasmMap as any).configure_tile_layer = jest.fn();

    const wms = new WMSTileLayer('https://example.com/wms', {});
    wms.addTo(map);
    wms.setParams({ layers: 'z' });
    expect(wms.wasmTileLayer.urlTemplate).toContain('layers=z');
    // addTo already plumbed default options exactly once; setParams must NOT
    // re-run configure_tile_layer without subdomains/maxZoom options.
    expect((map.wasmMap as any).configure_tile_layer).toHaveBeenCalledTimes(1);
    expect((map.wasmMap as any).remove_tile_layer).toHaveBeenCalled();
  });
});

describe('GridLayer (lines 3927-4033, incl. 3959, 4010-4012)', () => {
  class TestGrid extends GridLayer {
    created: any[];
    constructor(options: any = {}) {
      super(options);
      this.created = [];
    }
    createTile(coords: any) {
      this.created.push(coords);
      const d = document.createElement('div');
      d.className = 'test-tile';
      d.dataset.key = `${coords.z}/${coords.x}/${coords.y}`;
      return d;
    }
  }

  test('addTo appends a positioned container and creates tiles for the viewport', () => {
    const map = makeMap();
    const grid = new TestGrid({ className: 'my-grid' });
    const ret = grid.addTo(map);

    expect(ret).toBe(grid);
    const c = grid._container as HTMLElement;
    expect(c).toBeTruthy();
    expect(c.className).toBe('rustyleaf-grid-layer my-grid');
    expect(c.parentNode).toBe(map.containerElement);
    expect(c.style.position).toBe('absolute');
    expect(grid.created.length).toBeGreaterThan(0);
    expect(c.querySelectorAll('.test-tile').length).toBe(grid.created.length);
    // Tiles are absolutely positioned within the container.
    const firstTile = c.querySelector('.test-tile') as HTMLElement;
    expect(firstTile.style.left).toMatch(/px$/);
    expect(firstTile.style.top).toMatch(/px$/);
  });

  test('fixes a static-positioned map container (line 3959)', () => {
    const map = makeMap();
    map.containerElement.style.position = 'static';
    new TestGrid().addTo(map);
    expect(map.containerElement.style.position).toBe('relative');
  });

  test('_notifyLayerAdd fires on the map', () => {
    const map = makeMap();
    const notify = jest.spyOn(map as any, '_notifyLayerAdd');
    new TestGrid().addTo(map);
    expect(notify).toHaveBeenCalled();
    notify.mockRestore();
  });

  test('createTile returning null is tolerated (tile skipped)', () => {
    const map = makeMap();
    class NullGrid extends GridLayer {
      createTile() {
        return null;
      }
    }
    const grid = new NullGrid();
    grid.addTo(map);
    expect(grid._container.querySelectorAll('*').length).toBe(0);
    expect(Object.keys(grid._tiles).length).toBe(0);
  });

  test('stale tiles are pruned when the viewport moves away (4008-4013)', () => {
    const map = makeMap();
    const grid = new TestGrid({ tileSize: 64 });
    grid.addTo(map);

    // Force tiles at a far-away zoom so the next update can't want them.
    grid._tiles = {};
    grid._container.innerHTML = '';
    const staleKey = '1/0/0';
    const staleTile = document.createElement('div');
    staleTile.className = 'test-tile';
    grid._container.appendChild(staleTile);
    grid._tiles[staleKey] = staleTile;

    grid._update();

    expect(grid._tiles[staleKey]).toBeUndefined();
    // The stale tile was actually detached from the DOM.
    expect(staleTile.parentNode).toBeNull();
    // Fresh tiles for the current viewport were (re)created.
    expect(Object.keys(grid._tiles).length).toBeGreaterThan(0);
    expect(
      Object.keys(grid._tiles).some((k) => k !== staleKey)
    ).toBe(true);
  });

  test('remove() detaches the container, clears tiles, unwinds listeners', () => {
    const map = makeMap();
    const offSpy = jest.spyOn(map, 'off');
    const notifyRemove = jest.spyOn(map as any, '_notifyLayerRemove');

    const grid = new TestGrid();
    grid.addTo(map);
    const onViewChange = grid._onViewChange;
    const c = grid._container;
    grid.remove();

    expect(c.parentNode).toBeNull();
    expect(grid._tiles).toEqual({});
    expect(offSpy).toHaveBeenCalledWith('move', onViewChange);
    expect(offSpy).toHaveBeenCalledWith('zoom', onViewChange);
    expect(offSpy).toHaveBeenCalledWith('resize', onViewChange);
    expect(grid._onViewChange).toBeNull();
    expect(notifyRemove).toHaveBeenCalledWith(grid);

    offSpy.mockRestore();
    notifyRemove.mockRestore();
  });
});

describe('Handler plugin surface (lines 4039-4067) + map.addHandler (247-252)', () => {
  class LoggingHandler extends Handler {
    hooks: string[];
    constructor(map: any) {
      super(map);
      this.hooks = [];
    }
    addHooks() {
      this.hooks.push('add');
    }
    removeHooks() {
      this.hooks.push('remove');
    }
  }

  test('enable/disable lifecycle calls hooks exactly once per transition', () => {
    const map = makeMap();
    const h = new LoggingHandler(map);
    expect(h.enabled()).toBe(false);

    h.enable();
    expect(h.enabled()).toBe(true);
    expect(h.hooks).toEqual(['add']);

    h.enable(); // idempotent
    expect(h.hooks).toEqual(['add']);
    expect(h.enabled()).toBe(true);

    h.disable();
    expect(h.enabled()).toBe(false);
    expect(h.hooks).toEqual(['add', 'remove']);

    h.disable(); // idempotent
    expect(h.hooks).toEqual(['add', 'remove']);
  });

  test('enable/disable return this for chaining', () => {
    const map = makeMap();
    const h = new Handler(map);
    expect(h.enable()).toBe(h);
    expect(h.disable()).toBe(h);
  });

  test('base Handler hook defaults are safe no-ops', () => {
    const h = new Handler(makeMap());
    expect(() => {
      h.addHooks();
      h.removeHooks();
    }).not.toThrow();
  });

  test('map.addHandler exposes the handler and honours auto-enable options', () => {
    const map = makeMap({ wobble: true });
    map.addHandler('wobble', LoggingHandler);
    expect(map.wobble).toBeInstanceOf(LoggingHandler);
    expect(map.wobble._map).toBe(map);
    expect(map.wobble.enabled()).toBe(true);
    expect(map.wobble.hooks).toEqual(['add']);

    const quiet = makeMap(); // no matching option → registered but disabled
    quiet.addHandler('wobble', LoggingHandler);
    expect(quiet.wobble.enabled()).toBe(false);
    expect(quiet.wobble.hooks).toEqual([]);
  });
});

describe('Util helpers (lines 4069-4144, incl. 4073-4076, 4093-4112, 4123)', () => {
  test('extend copies from multiple sources, later wins (4073-4076)', () => {
    const dest = { a: 1, keep: true } as any;
    const out = Util.extend(dest, { a: 2, b: 3 }, { b: 4, c: 5 });
    expect(out).toBe(dest);
    expect(dest).toEqual({ a: 2, b: 4, c: 5, keep: true });
    expect(Util.extend({}, {} as any)).toEqual({});
  });

  test('stamp assigns stable unique ids, hidden from enumeration', () => {
    const a: any = {};
    const b: any = {};
    const idA = Util.stamp(a);
    expect(Util.stamp(a)).toBe(idA);
    expect(Util.stamp(b)).not.toBe(idA);
    expect(Object.keys(a)).not.toContain('_rustyleaf_id');
    expect(a._rustyleaf_id).toBe(idA);
  });

  test('throttle: leading call immediate, trailing call replayed after window (4093-4112)', async () => {
    // Real short timers — this jsdom environment cannot install jest fake
    // timers (read-only window.performance).
    const fn = jest.fn();
    const throttled = Util.throttle(fn, 25);

    throttled('first');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('first');

    // Locked: arguments are parked, not dropped.
    throttled('second');
    throttled('third'); // overwrites pending args (latest wins)
    expect(fn).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 60));
    // Trailing edge replays the last pending args through the wrapper.
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('third');
  });

  test('throttle binds the supplied context on the immediate call', () => {
    const ctx = { marker: 'ctx-value' };
    let seenThis: any = null;
    const fn = function (this: any) { // eslint-disable-line @typescript-eslint/no-this-alias
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      seenThis = this;
    };
    const throttled = Util.throttle(fn, 50, ctx);
    throttled();
    expect(seenThis).toBe(ctx);
  });

  test('wrapNum handles includeMax and negative ranges', () => {
    expect(Util.wrapNum(180, [-180, 180], true)).toBe(180);
    expect(Util.wrapNum(180, [-180, 180])).toBe(-180);
    expect(Util.wrapNum(-190, [-180, 180])).toBe(170);
    expect(Util.wrapNum(190, [-180, 180])).toBe(-170);
    expect(Util.wrapNum(0, [-180, 180])).toBe(0);
  });

  test('falseFn returns literal false (4123)', () => {
    expect(Util.falseFn()).toBe(false);
  });

  test('formatNum rounds with default 6 digits or explicit precision', () => {
    expect(Util.formatNum(1.23456789)).toBe(1.234568);
    expect(Util.formatNum(1.23456, 2)).toBe(1.23);
    expect(Util.formatNum(10.0000004)).toBe(10);
  });

  test('setOptions merges onto existing options and returns the new object', () => {
    const obj: any = { options: { a: 1, b: 1 } };
    const merged = Util.setOptions(obj, { b: 2, c: 3 });
    expect(merged).toBe(obj.options);
    expect(obj.options).toEqual({ a: 1, b: 2, c: 3 });
  });

  test('template substitutes values, supports functions and spaced braces', () => {
    expect(Util.template('{z}/{x}/{y}', { z: 3, x: 7, y: 9 })).toBe('3/7/9');
    // The regex's character class is greedy over spaces, so only LEADING
    // spaces before the key are tolerated ('{ z}' works, '{ z }' does not —
    // the key would capture as 'z ').
    expect(Util.template('{ z}/{x}', { z: 1, x: 2 })).toBe('1/2');
    expect(
      Util.template('{n}', { m: 'via-function', n: (d: any) => 'fn-' + d.m })
    ).toBe('fn-via-function');
  });

  test('template throws on missing variables', () => {
    expect(() => Util.template('{missing}', {})).toThrow(
      'No value provided for variable {missing}'
    );
  });
});
