// Jest-compatible mock for src/rustyleaf-api.js
// The real file uses import.meta.url + top-level await which aren't supported in jest's CommonJS mode.
// This shim provides the same API surface against the WASM mock.

const wasm = require('./wasmMock.js');

class Map {
  constructor(container, options = {}) {
    this._container = container;
    this._options = options;
    this._canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this._canvasId = 'rustyleaf-map-canvas';
    this._pointLayers = [];
    this._lineLayers = [];
    this._polygonLayers = [];
    this._geojsonLayerCount = 0;
    this._events = {};
    this._center = options.center || [48.8566, 2.3522];
    this._zoom = options.zoom || 12;

    const ptr = wasm.rustyleafmap_new();
    this.wasmMap = new wasm.RustyleafMap(ptr);
    this.wasmMap.set_view(this._center[0], this._center[1], this._zoom);
  }

  setView(latlng, zoom) { this._center = latlng; this._zoom = zoom; this.wasmMap.set_view(latlng[0], latlng[1], zoom); return this; }
  getCenter() { return this._center; }
  getZoom() { return this._zoom; }
  zoomIn() { this._zoom = Math.min(18, this._zoom + 1); this.wasmMap.zoom_in(); return this; }
  zoomOut() { this._zoom = Math.max(1, this._zoom - 1); this.wasmMap.zoom_out(); return this; }
  panBy(dx, dy) { this.wasmMap.pan(dx, dy); return this; }
  getBounds() { return [[48.8, 2.2], [48.9, 2.5]]; }
  fitBounds(bounds) { return this; }
  project(latlng) { return { x: 0, y: 0 }; }
  unproject(point) { return [48.85, 2.35]; }
  getWebGLSupport() { return { supported: true, level: 'full', webgl2: true }; }
  resize(w, h) { if (this.wasmMap) this.wasmMap.resize(w, h); }

  on(event, callback) {
    this._events[event] = this._events[event] || [];
    this._events[event].push(callback);
    const method = event === 'move' ? 'on_move' : event === 'zoom' ? 'on_zoom' : event === 'click' ? 'on_click' :
      event === 'hover' ? 'on_hover' : event === 'mousedown' ? 'on_mouse_down' : event === 'mouseup' ? 'on_mouse_up' :
      event === 'contextmenu' ? 'on_contextmenu' : event === 'keydown' ? 'on_key_down' : event === 'keyup' ? 'on_key_up' :
      event === 'dragend' ? 'on_dragend' : null;
    if (method && this.wasmMap[method]) this.wasmMap[method](callback);
    return this;
  }

  off(event, callback) {
    if (this._events[event]) this._events[event] = this._events[event].filter(cb => cb !== callback);
    return this;
  }
}

class TileLayer {
  constructor(urlTemplate, options = {}) {
    this._url = urlTemplate;
    this._options = options;
    this.wasmTileLayer = new wasm.TileLayerApi();
  }
  addTo(map) { if (map && map.wasmMap) { map.wasmMap.add_tile_layer(this._url); if (this.wasmTileLayer) this.wasmTileLayer.add_to(map.wasmMap); } return this; }
  remove() { return this; }
}

class PointLayer {
  constructor(options = {}) {
    this._options = options;
    this._points = [];
    this.wasmPointLayer = new wasm.PointLayerApi();
  }
  add(points) { this._points.push(...(Array.isArray(points) ? points : [points])); return this; }
  clear() { this._points = []; return this; }
  addTo(map) {
    if (map && map.wasmMap) {
      map.wasmMap.add_point_layer();
      if (this._points.length > 0) {
        map.wasmMap.add_points(map._pointLayers.length, this._points);
      }
      map._pointLayers.push(this);
    }
    return this;
  }
  on(event, callback) { return this; }
  remove() { return this; }
}

class LineLayer {
  constructor(options = {}) {
    this._options = options;
    this._lines = [];
  }
  add(lines) { this._lines.push(...(Array.isArray(lines) ? lines : [lines])); return this; }
  clear() { this._lines = []; return this; }
  addTo(map) {
    if (map && map.wasmMap) {
      map.wasmMap.add_line_layer();
      if (this._lines.length > 0) {
        map.wasmMap.add_lines(map._lineLayers.length, this._lines);
      }
      map._lineLayers.push(this);
    }
    return this;
  }
  on(event, callback) { return this; }
  remove() { return this; }
}

class PolygonLayer {
  constructor(options = {}) {
    this._options = options;
    this._polygons = [];
  }
  add(polygons) { this._polygons.push(...(Array.isArray(polygons) ? polygons : [polygons])); return this; }
  clear() { this._polygons = []; return this; }
  addTo(map) {
    if (map && map.wasmMap) {
      map.wasmMap.add_polygon_layer();
      if (this._polygons.length > 0) {
        map.wasmMap.add_polygons(map._polygonLayers.length, this._polygons);
      }
      map._polygonLayers.push(this);
    }
    return this;
  }
  on(event, callback) { return this; }
  remove() { return this; }
}

class GeoJSONLayer {
  constructor(data, options = {}) {
    this._data = data;
    this._options = options;
    this._features = [];
  }
  loadData(data) { this._data = data; return Promise.resolve(); }
  loadUrl(url) { return Promise.resolve(); }
  loadUrlStreaming(url, opts) { return Promise.resolve(); }
  clear() { this._data = null; return this; }
  addTo(map) {
    if (map && map.wasmMap) {
      map.wasmMap.add_geojson_layer();
      map._geojsonLayerCount++;
      if (this._data) map.wasmMap.load_geojson(map._geojsonLayerCount - 1, JSON.stringify(this._data));
    }
    return this;
  }
  setStyle(style) { Object.assign(this._options, style); return this; }
  getBounds() { return null; }
  getFeatureCount() { return 0; }
  on(event, callback) { return this; }
  remove() { return this; }
}

class Popup {
  constructor(options = {}) {
    this._options = options;
    this._latlng = [0, 0];
    this._content = '';
    this._open = false;
  }
  setLatLng(latlng) { this._latlng = latlng; return this; }
  setContent(content) { this._content = content; return this; }
  openOn(map) { this._open = true; return this; }
  close() { this._open = false; return this; }
  toggle() { this._open = !this._open; return this; }
  isOpenPopup() { return this._open; }
  update() { return this; }
  bringToFront() { return this; }
  bringToBack() { return this; }
}

module.exports = {
  Map, TileLayer, PointLayer, LineLayer, PolygonLayer, GeoJSONLayer, Popup
};
