// Mock WASM module for testing
export const memory = new WebAssembly.Memory({ initial: 17, maximum: 16384 });

// Mock WASM functions
export const __wbindgen_object_drop_ref = jest.fn();
export const __wbindgen_string_new = jest.fn();
export const __wbindgen_throw = jest.fn();
export const __wbindgen_realloc = jest.fn();
export const __wbindgen_malloc = jest.fn();
let nextPtr = 1;
export const rustyleafmap_new = jest.fn(() => nextPtr++);
export const rustyleafmap_init_canvas = jest.fn(() => [0, 0]);
export const rustyleafmap_render = jest.fn(() => [0, 0]);

// Mock state per map instance
const mapStates = new Map();

// Get or create state for a map instance
const getMapState = (ptr) => {
  if (!mapStates.has(ptr)) {
    mapStates.set(ptr, {
      zoom: 12,
      center: [48.8566, 2.3522]
    });
  }
  return mapStates.get(ptr);
};

// Reset mock state for test isolation
export const resetMockState = () => {
  mapStates.clear();
  nextPtr = 1;
  eventCallbacks.clear();
};

// Per-map registered event callbacks (ptr -> {event: [callbacks]}), so tests
// can drive wasm-side events: wasmMock.fire(ptr, 'move', {...}).
const eventCallbacks = new Map();

export const fire = (ptr, event, payload) => {
  const cbs = (eventCallbacks.get(ptr) || {})[event] || [];
  for (const cb of [...cbs]) cb(payload);
};


export const rustyleafmap_set_view = jest.fn((ptr, lat, lng, zoom) => {
  const state = getMapState(ptr);
  state.center = [lat, lng];
  state.zoom = zoom;
});

export const rustyleafmap_get_center = jest.fn((ptr) => {
  const state = getMapState(ptr);
  return [...state.center];
});
export const rustyleafmap_get_zoom = jest.fn((ptr) => {
  const state = getMapState(ptr);
  return state.zoom;
});
export const rustyleafmap_pan = jest.fn((ptr) => fire(ptr, 'move', { type: 'move' }));
export const rustyleafmap_zoom_in = jest.fn((ptr) => {
  const state = getMapState(ptr);
  state.zoom += 1;
  fire(ptr, 'zoom', { type: 'zoom' });
});
export const rustyleafmap_zoom_out = jest.fn((ptr) => {
  const state = getMapState(ptr);
  state.zoom -= 1;
  fire(ptr, 'zoom', { type: 'zoom' });
});
export const rustyleafmap_set_min_zoom = jest.fn();
export const rustyleafmap_set_max_zoom = jest.fn();
export const rustyleafmap_get_bounds = jest.fn((ptr) => {
  const state = getMapState(ptr);
  const [lat, lng] = state.center;
  // Derive bounds from the map center while preserving the legacy output
  // ([48.8, 2.3, 48.9, 2.4]) for the default center [48.8566, 2.3522].
  return [lat - 0.0566, lng - 0.0522, lat + 0.0434, lng + 0.0478];
});
export const rustyleafmap_fit_bounds = jest.fn();
const _num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const _latLngOf = (latlng) => {
  if (Array.isArray(latlng)) return { lat: _num(latlng[0]), lng: _num(latlng[1]) };
  if (latlng && typeof latlng === 'object') return { lat: _num(latlng.lat ?? latlng[0]), lng: _num(latlng.lng ?? latlng[1]) };
  return { lat: undefined, lng: undefined };
};
const _pointOf = (pt) => {
  if (Array.isArray(pt)) return { x: _num(pt[0]), y: _num(pt[1]) };
  if (pt && typeof pt === 'object') return { x: _num(pt.x ?? pt[0]), y: _num(pt.y ?? pt[1]) };
  return { x: undefined, y: undefined };
};
// Deterministic linear mapping shared by project/screen_xy and inverted by
// unproject (C-18: outputs derive from inputs so coordinate-order and
// projection-plumbing bugs are catchable, instead of every input returning a
// constant). The mapping is relative to the default test center so nearby
// Paris fixtures still project within a few px of the legacy [400, 300].
// Legacy outputs are preserved exactly for the historically-pinned inputs.
const _REF_LAT = 48.8566;
const _REF_LNG = 2.3522;
const _REF_X = 400;
const _REF_Y = 300;
const _PX_PER_DEG = 100;
const _projectXY = (lat, lng) => [_REF_X + (lng - _REF_LNG) * _PX_PER_DEG, _REF_Y - (lat - _REF_LAT) * _PX_PER_DEG];
const _unprojectXY = (x, y) => [_REF_LAT + (_REF_Y - y) / _PX_PER_DEG, _REF_LNG + (x - _REF_X) / _PX_PER_DEG];
export const rustyleafmap_project = jest.fn((ptr, latlng) => {
  const { lat, lng } = _latLngOf(latlng);
  if (lat === 48.8 && lng === 2.3) return [400, 300];
  if (lat === undefined || lng === undefined) return [400, 300];
  return _projectXY(lat, lng);
});
export const rustyleafmap_unproject = jest.fn((ptr, pt) => {
  const { x, y } = _pointOf(pt);
  if (x === undefined || y === undefined) return [48.8566, 2.3522];
  return _unprojectXY(x, y);
});
export const rustyleafmap_on_move = jest.fn();
export const rustyleafmap_on_zoom = jest.fn();
export const rustyleafmap_on_click = jest.fn();
export const rustyleafmap_on_hover = jest.fn();
export const rustyleafmap_on_mouse_down = jest.fn();
export const rustyleafmap_on_mouse_up = jest.fn();
export const rustyleafmap_on_contextmenu = jest.fn();
export const rustyleafmap_on_key_down = jest.fn();
export const rustyleafmap_on_key_up = jest.fn();
export const rustyleafmap_off_move = jest.fn();
export const rustyleafmap_off_zoom = jest.fn();
export const rustyleafmap_off_click = jest.fn();
export const rustyleafmap_off_hover = jest.fn();
export const rustyleafmap_off_mouse_down = jest.fn();
export const rustyleafmap_off_mouse_up = jest.fn();
export const rustyleafmap_off_contextmenu = jest.fn();
export const rustyleafmap_off_key_down = jest.fn();
export const rustyleafmap_off_key_up = jest.fn();
export const rustyleafmap_handle_mouse_down = jest.fn();
export const rustyleafmap_handle_mouse_up = jest.fn();
export const rustyleafmap_on_mouse_move = jest.fn();
export const rustyleafmap_on_wheel = jest.fn();
export const rustyleafmap_handle_contextmenu = jest.fn();
export const rustyleafmap_resize = jest.fn();
export const rustyleafmap_screen_xy = jest.fn((ptr, lat, lng) => {
  // Accept both (lat, lng) numbers and ([lat, lng]/object) forms.
  let la = _num(lat);
  let ln = _num(lng);
  if (la === undefined || ln === undefined) {
    const parsed = _latLngOf(lat);
    if (parsed.lat !== undefined && parsed.lng !== undefined) {
      la = parsed.lat;
      ln = parsed.lng;
    }
  }
  if (la === 48.8 && ln === 2.3) return [400, 300];
  if (la === undefined || ln === undefined) return [400, 300];
  return _projectXY(la, ln);
});
export const rustyleafmap_add_tile_layer = jest.fn(() => 0);
// add_*_layer return the new layer's index, like the real wasm core
const nextLayerIndex = (ptr, kind) => {
  const state = getMapState(ptr);
  state[kind] = state[kind] || 0;
  return state[kind]++;
};
export const rustyleafmap_add_point_layer = jest.fn((ptr) => nextLayerIndex(ptr, 'pointLayers'));
export const rustyleafmap_add_line_layer = jest.fn((ptr) => nextLayerIndex(ptr, 'lineLayers'));
export const rustyleafmap_add_polygon_layer = jest.fn((ptr) => nextLayerIndex(ptr, 'polygonLayers'));
export const rustyleafmap_add_geojson_layer = jest.fn((ptr) => nextLayerIndex(ptr, 'geojsonLayers'));
export const rustyleafmap_set_point_layer_visible = jest.fn();
export const rustyleafmap_set_line_layer_visible = jest.fn();
export const rustyleafmap_set_polygon_layer_visible = jest.fn();
export const rustyleafmap_set_geojson_layer_visible = jest.fn();
export const rustyleafmap_add_points = jest.fn();
export const rustyleafmap_append_points = jest.fn();
export const rustyleafmap_add_points_packed = jest.fn();
export const rustyleafmap_append_points_packed = jest.fn();
export const rustyleafmap_reserve_points_packed = jest.fn();
export const rustyleafmap_clear_points = jest.fn();
export const rustyleafmap_add_lines = jest.fn();
export const rustyleafmap_clear_lines = jest.fn();
export const rustyleafmap_add_polygons = jest.fn();
export const rustyleafmap_load_geojson = jest.fn();
export const rustyleafmap_load_geojson_chunk = jest.fn();
export const rustyleafmap_set_geojson_style = jest.fn();
export const rustyleafmap_get_geojson_feature_count = jest.fn(() => 0);
export const rustyleafmap_clear_geojson_layer = jest.fn();

// Marker API mocks (markers are GPU-rendered in the Rust core).
// Return incrementing per-map ids like the real core's dense slot ids
// (and like nextLayerIndex above), so multi-marker tests don't collide on 0.
export const rustyleafmap_add_marker = jest.fn((ptr) => nextLayerIndex(ptr, 'markers'));
export const rustyleafmap_update_marker = jest.fn();
export const rustyleafmap_set_marker_style = jest.fn();
export const rustyleafmap_set_marker_visible = jest.fn();
export const rustyleafmap_remove_marker = jest.fn();
export const rustyleafmap_get_marker_latlng = jest.fn(() => [0, 0]);

// Layer API mocks
export const tilelayerapi_new = jest.fn(() => 1);
export const tilelayerapi_add_to = jest.fn(() => [0, 0]);
export const pointlayerapi_new = jest.fn(() => 1);
export const pointlayerapi_add = jest.fn();
export const pointlayerapi_clear = jest.fn();
export const pointlayerapi_on_click = jest.fn();
export const pointlayerapi_on_hover = jest.fn();

// Cleanup functions
export const __wbg_rustyleafmap_free = jest.fn();
export const __wbg_tilelayerapi_free = jest.fn();
export const __wbg_pointlayerapi_free = jest.fn();
export const __wbg_webglsupportinfo_free = jest.fn();

// Export maps
export const __wbindgen_export_2 = new Map();
export const __wbindgen_export_5 = new Map();

// Other functions
export const __externref_table_dealloc = jest.fn();
export const __wbindgen_start = jest.fn();

// Mock WASM module classes
export class RustyleafMap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ptr = rustyleafmap_new(width, height);
  }

  init_canvas(canvasId) {
    return rustyleafmap_init_canvas(this.ptr, canvasId);
  }

  render(canvasId) {
    return rustyleafmap_render(this.ptr, canvasId);
  }

  set_view(lat, lng, zoom) {
    rustyleafmap_set_view(this.ptr, lat, lng, zoom);
  }

  get_center() {
    return rustyleafmap_get_center(this.ptr);
  }

  get_zoom() {
    return rustyleafmap_get_zoom(this.ptr);
  }

  pan(dx, dy) {
    rustyleafmap_pan(this.ptr, dx, dy);
  }

  zoom_in() {
    rustyleafmap_zoom_in(this.ptr);
  }

  zoom_out() {
    rustyleafmap_zoom_out(this.ptr);
  }

  set_min_zoom(minZoom) {
    rustyleafmap_set_min_zoom(this.ptr, minZoom);
  }

  set_max_zoom(maxZoom) {
    rustyleafmap_set_max_zoom(this.ptr, maxZoom);
  }

  get_bounds() {
    return rustyleafmap_get_bounds(this.ptr);
  }

  fit_bounds(bounds) {
    rustyleafmap_fit_bounds(this.ptr, bounds);
  }

  project(latlng) {
    return rustyleafmap_project(this.ptr, latlng);
  }

  unproject(point) {
    return rustyleafmap_unproject(this.ptr, point);
  }

  screen_xy(lat, lng) {
    return rustyleafmap_screen_xy(this.ptr, lat, lng);
  }

  _registerEvent(event, callback) {
    const per = eventCallbacks.get(this.ptr) || {};
    (per[event] = per[event] || []).push(callback);
    eventCallbacks.set(this.ptr, per);
  }

  _unregisterEvent(event, callback) {
    const per = eventCallbacks.get(this.ptr);
    if (!per || !per[event]) return;
    if (typeof callback === 'function') {
      per[event] = per[event].filter((cb) => cb !== callback);
    } else {
      per[event] = [];
    }
    eventCallbacks.set(this.ptr, per);
  }

  on_move(callback) {
    this._registerEvent('move', callback);
    rustyleafmap_on_move(this.ptr, callback);
  }

  on_zoom(callback) {
    this._registerEvent('zoom', callback);
    rustyleafmap_on_zoom(this.ptr, callback);
  }

  on_click(callback) {
    this._registerEvent('click', callback);
    rustyleafmap_on_click(this.ptr, callback);
  }

  on_hover(callback) {
    this._registerEvent('hover', callback);
    rustyleafmap_on_hover(this.ptr, callback);
  }

  on_mouse_down(callback) {
    this._registerEvent('mousedown', callback);
    rustyleafmap_on_mouse_down(this.ptr, callback);
  }

  on_mouse_up(callback) {
    this._registerEvent('mouseup', callback);
    rustyleafmap_on_mouse_up(this.ptr, callback);
  }

  on_contextmenu(callback) {
    this._registerEvent('contextmenu', callback);
    rustyleafmap_on_contextmenu(this.ptr, callback);
  }

  on_key_down(callback) {
    this._registerEvent('keydown', callback);
    rustyleafmap_on_key_down(this.ptr, callback);
  }

  on_key_up(callback) {
    this._registerEvent('keyup', callback);
    rustyleafmap_on_key_up(this.ptr, callback);
  }

  off_move(callback) {
    this._unregisterEvent('move', callback);
    rustyleafmap_off_move(this.ptr, callback);
  }

  off_zoom(callback) {
    this._unregisterEvent('zoom', callback);
    rustyleafmap_off_zoom(this.ptr, callback);
  }

  off_click(callback) {
    this._unregisterEvent('click', callback);
    rustyleafmap_off_click(this.ptr, callback);
  }

  off_hover(callback) {
    this._unregisterEvent('hover', callback);
    rustyleafmap_off_hover(this.ptr, callback);
  }

  off_mouse_down(callback) {
    this._unregisterEvent('mousedown', callback);
    rustyleafmap_off_mouse_down(this.ptr, callback);
  }

  off_mouse_up(callback) {
    this._unregisterEvent('mouseup', callback);
    rustyleafmap_off_mouse_up(this.ptr, callback);
  }

  off_contextmenu(callback) {
    this._unregisterEvent('contextmenu', callback);
    rustyleafmap_off_contextmenu(this.ptr, callback);
  }

  off_key_down(callback) {
    this._unregisterEvent('keydown', callback);
    rustyleafmap_off_key_down(this.ptr, callback);
  }

  off_key_up(callback) {
    this._unregisterEvent('keyup', callback);
    rustyleafmap_off_key_up(this.ptr, callback);
  }

  handle_mouse_down(x, y) {
    rustyleafmap_handle_mouse_down(this.ptr, x, y);
  }

  handle_mouse_up(x, y) {
    rustyleafmap_handle_mouse_up(this.ptr, x, y);
  }

  on_mouse_move(x, y) {
    rustyleafmap_on_mouse_move(this.ptr, x, y);
  }

  on_wheel(deltaY, x, y) {
    rustyleafmap_on_wheel(this.ptr, deltaY, x, y);
  }

  handle_contextmenu(x, y) {
    rustyleafmap_handle_contextmenu(this.ptr, x, y);
  }

  resize(width, height) {
    rustyleafmap_resize(this.ptr, width, height);
  }

  add_tile_layer() {
    return rustyleafmap_add_tile_layer(this.ptr);
  }

  add_point_layer() {
    return rustyleafmap_add_point_layer(this.ptr);
  }

  add_line_layer() {
    return rustyleafmap_add_line_layer(this.ptr);
  }

  add_polygon_layer() {
    return rustyleafmap_add_polygon_layer(this.ptr);
  }

  add_geojson_layer() {
    return rustyleafmap_add_geojson_layer(this.ptr);
  }

  set_point_layer_visible(layerIndex, visible) {
    rustyleafmap_set_point_layer_visible(this.ptr, layerIndex, visible);
  }

  set_line_layer_visible(layerIndex, visible) {
    rustyleafmap_set_line_layer_visible(this.ptr, layerIndex, visible);
  }

  set_polygon_layer_visible(layerIndex, visible) {
    rustyleafmap_set_polygon_layer_visible(this.ptr, layerIndex, visible);
  }

  set_geojson_layer_visible(layerIndex, visible) {
    rustyleafmap_set_geojson_layer_visible(this.ptr, layerIndex, visible);
  }

  add_points(layerIndex, points) {
    rustyleafmap_add_points(this.ptr, layerIndex, points);
  }

  append_points(layerIndex, points) {
    rustyleafmap_append_points(this.ptr, layerIndex, points);
  }

  add_points_packed(layerIndex, points) {
    rustyleafmap_add_points_packed(this.ptr, layerIndex, points);
  }

  append_points_packed(layerIndex, points) {
    rustyleafmap_append_points_packed(this.ptr, layerIndex, points);
  }

  reserve_points_packed(layerIndex, totalPoints) {
    rustyleafmap_reserve_points_packed(this.ptr, layerIndex, totalPoints);
  }

  clear_points(layerIndex) {
    rustyleafmap_clear_points(this.ptr, layerIndex);
  }

  add_lines(layerIndex, lines) {
    rustyleafmap_add_lines(this.ptr, layerIndex, lines);
  }

  append_lines(layerIndex, lines) {
    rustyleafmap_add_lines(this.ptr, layerIndex, lines);
  }

  clear_lines(layerIndex) {
    rustyleafmap_clear_lines(this.ptr, layerIndex);
  }

  add_polygons(layerIndex, polygons) {
    rustyleafmap_add_polygons(this.ptr, layerIndex, polygons);
  }

  load_geojson(layerIndex, geojson) {
    rustyleafmap_load_geojson(this.ptr, layerIndex, geojson);
  }

  load_geojson_chunk(layerIndex, chunk, isFinal) {
    rustyleafmap_load_geojson_chunk(this.ptr, layerIndex, chunk, isFinal);
  }

  set_geojson_style(layerIndex, style) {
    rustyleafmap_set_geojson_style(this.ptr, layerIndex, style);
  }

  get_geojson_feature_count(layerIndex) {
    return rustyleafmap_get_geojson_feature_count(this.ptr, layerIndex);
  }

  clear_geojson_layer(layerIndex) {
    rustyleafmap_clear_geojson_layer(this.ptr, layerIndex);
  }

  add_marker() {
    return rustyleafmap_add_marker(this.ptr);
  }

  update_marker(id, lat, lng) {
    rustyleafmap_update_marker(this.ptr, id, lat, lng);
  }

  set_marker_style(id, size, r, g, b, a, z) {
    rustyleafmap_set_marker_style(this.ptr, id, size, r, g, b, a, z);
  }

  set_marker_visible(id, visible) {
    rustyleafmap_set_marker_visible(this.ptr, id, visible);
  }

  remove_marker(id) {
    rustyleafmap_remove_marker(this.ptr, id);
  }

  get_marker_latlng(id) {
    return rustyleafmap_get_marker_latlng(this.ptr, id);
  }
}

export class TileLayerApi {
  constructor(urlTemplate) {
    this.urlTemplate = urlTemplate;
    this.ptr = tilelayerapi_new(urlTemplate);
  }

  add_to(map) {
    return tilelayerapi_add_to(this.ptr, map);
  }
}

// Stand-in for the real TileLayerApi's wasm tile-loader plumbing: the JS side
// probes configure_tile_layer before calling it, so expose a jest.fn().
TileLayerApi.prototype.configure_tile_layer = jest.fn();

export class PointLayerApi {
  constructor() {
    this.ptr = pointlayerapi_new();
  }

  add(points) {
    pointlayerapi_add(this.ptr, points);
  }

  clear() {
    pointlayerapi_clear(this.ptr);
  }

  on_click(callback) {
    pointlayerapi_on_click(this.ptr, callback);
  }

  on_hover(callback) {
    pointlayerapi_on_hover(this.ptr, callback);
  }
}

// Alias for WasmPointLayer to match source code expectations
export const WasmPointLayer = PointLayerApi;

// Default export for module compatibility
export default {
  memory,
  __wbindgen_object_drop_ref,
  __wbindgen_string_new,
  __wbindgen_throw,
  __wbindgen_realloc,
  __wbindgen_malloc,
  resetMockState,
  rustyleafmap_new,
  rustyleafmap_init_canvas,
  rustyleafmap_render,
  rustyleafmap_set_view,
  rustyleafmap_get_center,
  rustyleafmap_get_zoom,
  rustyleafmap_pan,
  rustyleafmap_zoom_in,
  rustyleafmap_zoom_out,
  rustyleafmap_set_min_zoom,
  rustyleafmap_set_max_zoom,
  rustyleafmap_get_bounds,
  rustyleafmap_fit_bounds,
  rustyleafmap_project,
  rustyleafmap_unproject,
  rustyleafmap_screen_xy,
  rustyleafmap_on_move,
  rustyleafmap_on_zoom,
  rustyleafmap_on_click,
  rustyleafmap_on_hover,
  rustyleafmap_on_mouse_down,
  rustyleafmap_on_mouse_up,
  rustyleafmap_on_contextmenu,
  rustyleafmap_on_key_down,
  rustyleafmap_on_key_up,
  rustyleafmap_off_move,
  rustyleafmap_off_zoom,
  rustyleafmap_off_click,
  rustyleafmap_off_hover,
  rustyleafmap_off_mouse_down,
  rustyleafmap_off_mouse_up,
  rustyleafmap_off_contextmenu,
  rustyleafmap_off_key_down,
  rustyleafmap_off_key_up,
  rustyleafmap_handle_mouse_down,
  rustyleafmap_handle_mouse_up,
  rustyleafmap_on_mouse_move,
  rustyleafmap_on_wheel,
  rustyleafmap_handle_contextmenu,
  rustyleafmap_resize,
  rustyleafmap_add_tile_layer,
  rustyleafmap_add_point_layer,
  rustyleafmap_add_line_layer,
  rustyleafmap_add_polygon_layer,
  rustyleafmap_add_geojson_layer,
  rustyleafmap_set_point_layer_visible,
  rustyleafmap_set_line_layer_visible,
  rustyleafmap_set_polygon_layer_visible,
  rustyleafmap_set_geojson_layer_visible,
  rustyleafmap_add_points,
  rustyleafmap_append_points,
  rustyleafmap_add_points_packed,
  rustyleafmap_append_points_packed,
  rustyleafmap_reserve_points_packed,
  rustyleafmap_clear_points,
  rustyleafmap_add_lines,
  rustyleafmap_clear_lines,
  rustyleafmap_add_polygons,
  rustyleafmap_load_geojson,
  rustyleafmap_load_geojson_chunk,
  rustyleafmap_set_geojson_style,
  rustyleafmap_get_geojson_feature_count,
  rustyleafmap_clear_geojson_layer,
  rustyleafmap_add_marker,
  rustyleafmap_update_marker,
  rustyleafmap_set_marker_style,
  rustyleafmap_set_marker_visible,
  rustyleafmap_remove_marker,
  rustyleafmap_get_marker_latlng,
  tilelayerapi_new,
  tilelayerapi_add_to,
  pointlayerapi_new,
  pointlayerapi_add,
  pointlayerapi_clear,
  pointlayerapi_on_click,
  pointlayerapi_on_hover,
  __wbg_rustyleafmap_free,
  __wbg_tilelayerapi_free,
  __wbg_pointlayerapi_free,
  __wbg_webglsupportinfo_free,
  __wbindgen_export_2,
  __wbindgen_export_5,
  __externref_table_dealloc,
  __wbindgen_start,
  RustyleafMap,
  TileLayerApi,
  PointLayerApi,
  WasmPointLayer: PointLayerApi
};
