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
export const rustyleafmap_pan = jest.fn();
export const rustyleafmap_zoom_in = jest.fn((ptr) => {
  const state = getMapState(ptr);
  state.zoom += 1;
});
export const rustyleafmap_zoom_out = jest.fn((ptr) => {
  const state = getMapState(ptr);
  state.zoom -= 1;
});
export const rustyleafmap_set_min_zoom = jest.fn();
export const rustyleafmap_set_max_zoom = jest.fn();
export const rustyleafmap_get_bounds = jest.fn(() => [48.8, 2.3, 48.9, 2.4]);
export const rustyleafmap_fit_bounds = jest.fn();
export const rustyleafmap_project = jest.fn(() => [400, 300]);
export const rustyleafmap_unproject = jest.fn(() => [48.8566, 2.3522]);
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
export const rustyleafmap_screen_xy = jest.fn(() => [400, 300]);
export const rustyleafmap_add_tile_layer = jest.fn(() => 0);
export const rustyleafmap_add_point_layer = jest.fn(() => 0);
export const rustyleafmap_add_line_layer = jest.fn(() => 0);
export const rustyleafmap_add_polygon_layer = jest.fn(() => 0);
export const rustyleafmap_add_geojson_layer = jest.fn(() => 0);
export const rustyleafmap_add_points = jest.fn();
export const rustyleafmap_add_lines = jest.fn();
export const rustyleafmap_add_polygons = jest.fn();
export const rustyleafmap_load_geojson = jest.fn();
export const rustyleafmap_load_geojson_chunk = jest.fn();
export const rustyleafmap_set_geojson_style = jest.fn();
export const rustyleafmap_get_geojson_feature_count = jest.fn(() => 0);
export const rustyleafmap_clear_geojson_layer = jest.fn();

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

  // Add clear_geojson_layer method
  clear_geojson_layer(layerIndex) {
    rustyleafmap_clear_geojson_layer(this.ptr, layerIndex);
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

  on_move(callback) {
    rustyleafmap_on_move(this.ptr, callback);
  }

  on_zoom(callback) {
    rustyleafmap_on_zoom(this.ptr, callback);
  }

  on_click(callback) {
    rustyleafmap_on_click(this.ptr, callback);
  }

  on_hover(callback) {
    rustyleafmap_on_hover(this.ptr, callback);
  }

  on_mouse_down(callback) {
    rustyleafmap_on_mouse_down(this.ptr, callback);
  }

  on_mouse_up(callback) {
    rustyleafmap_on_mouse_up(this.ptr, callback);
  }

  on_contextmenu(callback) {
    rustyleafmap_on_contextmenu(this.ptr, callback);
  }

  on_key_down(callback) {
    rustyleafmap_on_key_down(this.ptr, callback);
  }

  on_key_up(callback) {
    rustyleafmap_on_key_up(this.ptr, callback);
  }

  off_move(callback) {
    rustyleafmap_off_move(this.ptr, callback);
  }

  off_zoom(callback) {
    rustyleafmap_off_zoom(this.ptr, callback);
  }

  off_click(callback) {
    rustyleafmap_off_click(this.ptr, callback);
  }

  off_hover(callback) {
    rustyleafmap_off_hover(this.ptr, callback);
  }

  off_mouse_down(callback) {
    rustyleafmap_off_mouse_down(this.ptr, callback);
  }

  off_mouse_up(callback) {
    rustyleafmap_off_mouse_up(this.ptr, callback);
  }

  off_contextmenu(callback) {
    rustyleafmap_off_contextmenu(this.ptr, callback);
  }

  off_key_down(callback) {
    rustyleafmap_off_key_down(this.ptr, callback);
  }

  off_key_up(callback) {
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

  add_points(layerIndex, points) {
    rustyleafmap_add_points(this.ptr, layerIndex, points);
  }

  add_lines(layerIndex, lines) {
    rustyleafmap_add_lines(this.ptr, layerIndex, lines);
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
  rustyleafmap_screen_xy,
  rustyleafmap_add_tile_layer,
  rustyleafmap_add_point_layer,
  rustyleafmap_add_line_layer,
  rustyleafmap_add_polygon_layer,
  rustyleafmap_add_geojson_layer,
  rustyleafmap_add_points,
  rustyleafmap_add_lines,
  rustyleafmap_add_polygons,
  rustyleafmap_load_geojson,
  rustyleafmap_load_geojson_chunk,
  rustyleafmap_set_geojson_style,
  rustyleafmap_get_geojson_feature_count,
  rustyleafmap_clear_geojson_layer,
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