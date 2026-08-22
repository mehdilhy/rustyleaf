// Jest-compatible mock for src/rustyleaf-api.js
// The real file uses import.meta.url + top-level await which aren't supported in jest's CommonJS mode.
// This shim provides the same API surface against the WASM mock.

const wasm = require('./wasmMock.js');

// ---------- WebGL detection (mirrors src/rustyleaf-api.js checkWebGLSupport) ----------

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true }) || canvas.getContext('webgl', { preserveDrawingBuffer: true }) || canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });

    if (!gl) {
      return {
        supported: false,
        level: 'none',
        webgl2: false,
        webgl1: false,
        renderer: 'unknown',
        maxTextureSize: 0,
        extensions: [],
        error: 'WebGL not available'
      };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const isWebGL2 = !!canvas.getContext('webgl2', { preserveDrawingBuffer: true });

    return {
      supported: true,
      level: isWebGL2 ? 'full' : 'limited',
      webgl2: isWebGL2,
      webgl1: !isWebGL2,
      renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      extensions: gl.getSupportedExtensions() || [],
      error: null
    };
  } catch (error) {
    return {
      supported: false,
      level: 'unknown',
      webgl2: false,
      webgl1: false,
      renderer: 'unknown',
      maxTextureSize: 0,
      extensions: [],
      error: error.message
    };
  }
}

function validateLatLng(latlng) {
  if (!Array.isArray(latlng) || latlng.length !== 2 ||
      typeof latlng[0] !== 'number' || typeof latlng[1] !== 'number' ||
      !isFinite(latlng[0]) || !isFinite(latlng[1])) {
    throw new Error('Invalid center coordinates: expected [lat, lng] numbers');
  }
}

// ---------- Map ----------

class Map {
  constructor(container, options = {}) {
    // Resolve container (id string or element), like the real API
    if (typeof container === 'string') {
      this.containerElement = document.getElementById(container);
    } else {
      this.containerElement = container;
    }
    if (!this.containerElement || typeof this.containerElement.appendChild !== 'function') {
      throw new Error('Invalid container: expected element or element id');
    }

    if (options.center !== undefined) validateLatLng(options.center);
    if (options.zoom !== undefined && (typeof options.zoom !== 'number' || !isFinite(options.zoom))) {
      throw new Error('Invalid zoom level: expected number');
    }

    // WebGL support gate, mirroring the real constructor
    this.webglSupport = checkWebGLSupport();
    if (!this.webglSupport.supported) {
      throw new Error('WebGL not supported');
    }
    if (this.webglSupport.level === 'limited') {
      console.warn('Rustyleaf: WebGL2 not available, falling back to WebGL1. Some features may be limited.');
    }

    this._container = this.containerElement;
    this._options = options;
    const rect = this.containerElement.getBoundingClientRect();
    this.width = Math.round(rect.width) || 800;
    this.height = Math.round(rect.height) || 600;
    this.canvas = document.createElement('canvas');
    Map._instanceCounter = (Map._instanceCounter || 0) + 1;
    this.canvas.id = 'rustyleaf-map-canvas-' + Map._instanceCounter;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.containerElement.appendChild(this.canvas);
    this._canvas = this.canvas;
    this._canvasId = this.canvas.id;
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

    this._attachedLayers = new Set();
    var self = this;
    setTimeout(function () {
      if (!self._loadFired) {
        self._loadFired = true;
        self._fireLocalEvent('load', { type: 'load', target: self });
      }
    }, 0);
  }

  // Debounced burst events (movestart/moveend, zoomstart/zoomend), mirroring
  // the real API's _setupDerivedEvents over the wasm move/zoom streams.
  _burstEvent(kind) {
    var self = this;
    var state = this['_burst_' + kind] = this['_burst_' + kind] || { active: false, timer: null };
    if (!state.active) {
      state.active = true;
      this._fireLocalEvent(kind + 'start', { type: kind + 'start' });
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      state.active = false;
      self._fireLocalEvent(kind + 'end', { type: kind + 'end' });
    }, 150);
  }

  addHandler(name, HandlerClass) {
    const handler = new HandlerClass(this);
    this[name] = handler;
    if (this._options && this._options[name]) handler.enable();
    return this;
  }
  addLayer(layer) { layer.addTo(this); return this; }
  removeLayer(layer) { layer.remove(); return this; }
  hasLayer(layer) { return !!(this._attachedLayers && this._attachedLayers.has(layer)); }
  _notifyLayerAdd(layer) {
    if (!this._attachedLayers) this._attachedLayers = new Set();
    if (!this._attachedLayers.has(layer)) {
      this._attachedLayers.add(layer);
      this._fireLocalEvent('layeradd', { type: 'layeradd', layer: layer });
    }
  }
  _notifyLayerRemove(layer) {
    if (this._attachedLayers && this._attachedLayers.delete(layer)) {
      this._fireLocalEvent('layerremove', { type: 'layerremove', layer: layer });
    }
  }

  setView(latlng, zoom) {
    validateLatLng(latlng);
    latlng = this._clampToMaxBounds(latlng);
    var zoomChanged = zoom !== this._zoom;
    this._center = latlng; this._zoom = zoom;
    this.wasmMap.set_view(latlng[0], latlng[1], zoom);
    this._burstEvent('move');
    if (zoomChanged) this._burstEvent('zoom');
    return this;
  }
  getCenter() { return this._center; }
  getZoom() { return this._zoom; }
  zoomIn() { this._zoom = Math.min(18, this._zoom + 1); this.wasmMap.zoom_in(); this._burstEvent('zoom'); return this; }
  zoomOut() { this._zoom = Math.max(1, this._zoom - 1); this.wasmMap.zoom_out(); this._burstEvent('zoom'); return this; }
  panBy(dx, dy) { this.wasmMap.pan(dx, dy); this._burstEvent('move'); return this; }
  getBounds() { return [[48.8, 2.2], [48.9, 2.5]]; }
  fitBounds(bounds) { return this; }
  flyTo(latlng, options) {
    validateLatLng(latlng);
    var opts = options || {};
    var duration = opts.duration !== undefined ? opts.duration : 400;
    var from = this.getCenter();
    var fromZoom = this.getZoom();
    var targetZoom = opts.zoom !== undefined ? opts.zoom : fromZoom;
    if (this._flyTimer) { clearInterval(this._flyTimer); this._flyTimer = null; }
    if (duration <= 0) return this.setView(latlng, targetZoom);
    var start = Date.now();
    var self = this;
    this._flyTimer = setInterval(function () {
      var t = Math.min(1, (Date.now() - start) / duration);
      var ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      self.setView(
        [from[0] + (latlng[0] - from[0]) * ease, from[1] + (latlng[1] - from[1]) * ease],
        fromZoom + (targetZoom - fromZoom) * ease
      );
      if (t >= 1) { clearInterval(self._flyTimer); self._flyTimer = null; }
    }, 16);
    return this;
  }
  flyToBounds(bounds, options) { this.fitBounds(bounds); return this; }
  setMaxBounds(bounds) {
    this._maxBounds = bounds || null;
    if (this._maxBounds) this.setView(this._center, this._zoom);
    return this;
  }
  getMaxBounds() { return this._maxBounds || null; }
  _clampToMaxBounds(latlng) {
    if (!this._maxBounds) return latlng;
    var sw = this._maxBounds[0], ne = this._maxBounds[1];
    var minLat = Math.min(sw[0], ne[0]), maxLat = Math.max(sw[0], ne[0]);
    var minLng = Math.min(sw[1], ne[1]), maxLng = Math.max(sw[1], ne[1]);
    return [
      Math.min(Math.max(latlng[0], minLat), maxLat),
      Math.min(Math.max(latlng[1], minLng), maxLng)
    ];
  }
  invalidateSize() { this._handleResize(); return this; }
  locate(options) {
    var opts = options || {};
    var geo = (typeof navigator !== 'undefined' && navigator.geolocation) ? navigator.geolocation : null;
    if (!geo) {
      this._fireLocalEvent('locationerror', { code: 0, message: 'Geolocation is not available' });
      return this;
    }
    var self = this;
    var onSuccess = function (pos) {
      var latlng = [pos.coords.latitude, pos.coords.longitude];
      if (opts.setView) {
        var zoom = opts.maxZoom !== undefined ? Math.min(self.getZoom(), opts.maxZoom) : self.getZoom();
        self.setView(latlng, zoom);
      }
      self._fireLocalEvent('locationfound', { latlng: latlng, accuracy: pos.coords.accuracy });
    };
    var onError = function (err) {
      self._fireLocalEvent('locationerror', { code: err.code, message: err.message });
    };
    var geoOptions = {
      enableHighAccuracy: !!opts.enableHighAccuracy,
      timeout: opts.timeout !== undefined ? opts.timeout : 10000,
      maximumAge: opts.maximumAge || 0
    };
    if (opts.watch) this._locateWatchId = geo.watchPosition(onSuccess, onError, geoOptions);
    else geo.getCurrentPosition(onSuccess, onError, geoOptions);
    return this;
  }
  stopLocate() {
    if (this._locateWatchId !== undefined && this._locateWatchId !== null) {
      var geo = (typeof navigator !== 'undefined' && navigator.geolocation) ? navigator.geolocation : null;
      if (geo) geo.clearWatch(this._locateWatchId);
      this._locateWatchId = null;
    }
    return this;
  }
  _fireLocalEvent(event, data) {
    var handlers = this._events[event] || [];
    handlers.forEach(function (h) { try { h(data); } catch (e) { /* user callback error */ } });
  }
  setMinZoom(minZoom) { this.wasmMap.set_min_zoom(minZoom); return this; }
  setMaxZoom(maxZoom) { this.wasmMap.set_max_zoom(maxZoom); return this; }
  project(latlng) {
    // Web Mercator world-pixel projection at the current zoom
    const scale = 256 * Math.pow(2, this._zoom);
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, latlng[0]));
    const x = (latlng[1] + 180) / 360 * scale;
    const latRad = clampedLat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI) / 2 * scale;
    return { x: x, y: y };
  }
  unproject(point) {
    const scale = 256 * Math.pow(2, this._zoom);
    const lng = point.x / scale * 360 - 180;
    const n = Math.PI * (1 - 2 * point.y / scale);
    const lat = 180 / Math.PI * Math.atan(Math.sinh(n));
    return [lat, lng];
  }
  getWebGLSupport() { return this.webglSupport; }
  resize(w, h) { if (this.wasmMap) this.wasmMap.resize(w, h); }
  _handleResize() {
    const rect = this.containerElement.getBoundingClientRect();
    this.width = Math.round(rect.width) || this.width;
    this.height = Math.round(rect.height) || this.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.resize(this.width, this.height);
    this._fireLocalEvent('resize', { type: 'resize', newSize: [this.width, this.height] });
  }
  remove() { return this; }
  destroy() { return this.remove(); }

  on(event, callback) {
    this._events[event] = this._events[event] || [];
    this._events[event].push(callback);
    var method = event === 'move' ? 'on_move' : event === 'zoom' ? 'on_zoom' : event === 'click' ? 'on_click' :
      event === 'hover' ? 'on_hover' : event === 'mousedown' ? 'on_mouse_down' : event === 'mouseup' ? 'on_mouse_up' :
      event === 'contextmenu' ? 'on_contextmenu' : event === 'keydown' ? 'on_key_down' : event === 'keyup' ? 'on_key_up' :
      event === 'dragend' ? 'on_dragend' : null;
    if (method && this.wasmMap[method]) this.wasmMap[method](callback);
    return this;
  }

  off(event, callback) {
    if (this._events[event]) this._events[event] = this._events[event].filter(function(cb) { return cb !== callback; });
    return this;
  }
}

Map.checkWebGLSupport = checkWebGLSupport;

// ---------- TileLayer ----------

class TileLayer {
  constructor(urlTemplate, options) {
    this._url = urlTemplate;
    this.options = options !== undefined ? options : {};
    this.wasmTileLayer = new wasm.TileLayerApi(urlTemplate);
  }
  addTo(map) {
    this.wasmTileLayer.add_to(map.wasmMap);
    this._map = map;
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }
  remove() {
    if (this._map && this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
    return this;
  }
}

// ---------- PointLayer ----------

class PointLayer {
  constructor(options) {
    this._options = options || {};
    // Tests can override the WASM constructor via global.WasmPointLayer
    var Ctor = (typeof global !== 'undefined' && global.WasmPointLayer) ? global.WasmPointLayer : wasm.PointLayerApi;
    this.wasmPointLayer = new Ctor();
    this.points = [];
  }
  add(points) {
    var self = this;
    var pointsData = points.map(function(p) {
      return {
        lat: p.lat,
        lng: p.lng,
        size: p.size || 5,
        color: p.color || '#ff0000',
        meta: p.meta || null
      };
    });
    // Errors from the WASM layer propagate to the caller, like the real API
    this.wasmPointLayer.add(pointsData);
    self.points.push.apply(self.points, points);
    return this;
  }
  clear() { this.points = []; this.wasmPointLayer = new wasm.PointLayerApi(); return this; }
  addTo(map) {
    if (this._map === map && this._layerIndex !== undefined) {
      map.wasmMap.set_point_layer_visible(this._layerIndex, true);
      if (map._notifyLayerAdd) map._notifyLayerAdd(this);
      return this;
    }
    this._map = map;
    this._layerIndex = map.wasmMap.add_point_layer();
    map.wasmMap.add_points(this._layerIndex, this.points);
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }
  remove() {
    if (this._map && this._layerIndex !== undefined) {
      this._map.wasmMap.set_point_layer_visible(this._layerIndex, false);
      if (this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
    }
    return this;
  }
}

// ---------- LineLayer ----------

class LineLayer {
  constructor(options) {
    this._options = options || {};
    this.lines = [];
  }
  add(lines) {
    var self = this;
    var linesData = lines.map(function(line) {
      return {
        coords: line.coords.map(function(coord) { return { lat: coord.lat, lng: coord.lng }; }),
        color: line.color || '#ff0000',
        width: line.width || 2,
        meta: line.meta || null
      };
    });
    self.lines.push.apply(self.lines, linesData);
    return this;
  }
  clear() { this.lines = []; return this; }
  addTo(map) {
    if (this.map === map && this._layerIndex !== undefined) {
      map.wasmMap.set_line_layer_visible(this._layerIndex, true);
      if (map._notifyLayerAdd) map._notifyLayerAdd(this);
      return this;
    }
    this.map = map;
    this._layerIndex = map.wasmMap.add_line_layer();
    map.wasmMap.add_lines(this._layerIndex, this.lines);
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }
  remove() {
    if (this.map && this._layerIndex !== undefined) {
      this.map.wasmMap.set_line_layer_visible(this._layerIndex, false);
      if (this.map._notifyLayerRemove) this.map._notifyLayerRemove(this);
    }
    return this;
  }
}

// ---------- PolygonLayer ----------

class PolygonLayer {
  constructor(options) {
    this._options = options || {};
    this.polygons = [];
  }
  add(polygons) {
    var self = this;
    var polygonsData = polygons.map(function(polygon) {
      return {
        rings: polygon.rings.map(function(ring) {
          return ring.map(function(coord) { return { lat: coord.lat, lng: coord.lng }; });
        }),
        color: polygon.color || '#ff0000',
        meta: polygon.meta || null
      };
    });
    self.polygons.push.apply(self.polygons, polygonsData);
    return this;
  }
  clear() { this.polygons = []; return this; }
  addTo(map) {
    if (this.map === map && this._layerIndex !== undefined) {
      map.wasmMap.set_polygon_layer_visible(this._layerIndex, true);
      if (map._notifyLayerAdd) map._notifyLayerAdd(this);
      return this;
    }
    this.map = map;
    this._layerIndex = map.wasmMap.add_polygon_layer();
    map.wasmMap.add_polygons(this._layerIndex, this.polygons);
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }
  remove() {
    if (this.map && this._layerIndex !== undefined) {
      this.map.wasmMap.set_polygon_layer_visible(this._layerIndex, false);
      if (this.map._notifyLayerRemove) this.map._notifyLayerRemove(this);
    }
    return this;
  }
}

// ---------- GeoJSONLayer ----------

class GeoJSONLayer {
  constructor(geojson, options) {
    this.geojson = geojson || null;
    this.options = Object.assign({
      pointColor: '#0080ff',
      pointSize: 5,
      lineColor: '#ff0000',
      lineWidth: 2,
      polygonColor: '#00ff0080'
    }, options || {});
    this.map = null;
    this.layerIndex = undefined;
    this.dataLoaded = false;
    this._pendingGeoJSONText = null;
    this._pendingTimer = null;
    this._featureLayers = [];
    this._featureHandles = [];
    this._mountedFeatureLayerCount = 0;
    this._optionsApplied = false;
    this._clickDispatcherAttached = false;
    this._openTooltip = null;
    this._openTooltipFid = undefined;
  }

  _applyFeatureOptions(geojson) {
    var filter = this.options.filter, onEachFeature = this.options.onEachFeature, pointToLayer = this.options.pointToLayer;
    if (!filter && !onEachFeature && !pointToLayer) return geojson;
    if (this._optionsApplied) return this._processedGeoJSON || geojson;
    var features;
    if (geojson && geojson.type === 'FeatureCollection') features = geojson.features || [];
    else if (geojson && geojson.type === 'Feature') features = [geojson];
    else if (geojson && geojson.type) features = [{ type: 'Feature', geometry: geojson, properties: {} }];
    else features = [];
    var kept = [];
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      if (filter && !filter(feature)) continue;
      var geomType = feature.geometry && feature.geometry.type;
      if (pointToLayer && (geomType === 'Point' || geomType === 'MultiPoint')) {
        var coordsList = geomType === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        var firstLayer = null;
        for (var j = 0; j < coordsList.length; j++) {
          var c = coordsList[j];
          var layer = pointToLayer(feature, [c[1], c[0]]);
          if (layer) {
            this._featureLayers.push(layer);
            if (!firstLayer) firstLayer = layer;
          }
        }
        if (onEachFeature) onEachFeature(feature, firstLayer || this._makeFeatureHandle(feature));
        continue;
      }
      if (onEachFeature) {
        feature.properties = feature.properties || {};
        feature.properties.__rl_fid = this._featureHandles.length;
        var handle = this._makeFeatureHandle(feature);
        this._featureHandles.push(handle);
        onEachFeature(feature, handle);
      }
      kept.push(feature);
    }
    this._optionsApplied = true;
    this._processedGeoJSON = { type: 'FeatureCollection', features: kept };
    return this._processedGeoJSON;
  }

  _makeFeatureHandle(feature) {
    var handle = { feature: feature, _events: {} };
    handle.on = function (event, callback) {
      (handle._events[event] = handle._events[event] || []).push(callback);
      return handle;
    };
    handle.off = function (event, callback) {
      if (handle._events[event]) handle._events[event] = handle._events[event].filter(function (cb) { return cb !== callback; });
      return handle;
    };
    handle.bindPopup = function (content) { handle._popupContent = content; return handle; };
    handle.bindTooltip = function (content) { handle._tooltipContent = content; return handle; };
    return handle;
  }

  _mountFeatureExtras(map) {
    while (this._mountedFeatureLayerCount < this._featureLayers.length) {
      this._featureLayers[this._mountedFeatureLayerCount++].addTo(map);
    }
    if (!this._clickDispatcherAttached && this._featureHandles.length > 0) {
      this._clickDispatcherAttached = true;
      var self = this;
      map.on('click', function (e) { deferCallback(function () { self._dispatchFeatureEvent(e, 'click'); }); });
      map.on('hover', function (e) { deferCallback(function () { self._dispatchFeatureEvent(e, 'hover'); }); });
    }
  }

  _dispatchFeatureEvent(e, kind) {
    var props = e && e.feature;
    var isOwnHit = props && typeof props.layer_type === 'string' &&
      props.layer_type.indexOf('geojson') === 0 && props.layer_index === this.layerIndex;
    var fid = isOwnHit && props.original_meta ? props.original_meta.__rl_fid : undefined;
    if (kind === 'hover' && this._openTooltip && fid !== this._openTooltipFid) {
      this._openTooltip.close();
      this._openTooltip = null;
      this._openTooltipFid = undefined;
    }
    if (fid === undefined || fid === null) return;
    var handle = this._featureHandles[fid];
    if (!handle) return;
    var event = Object.assign({}, e, { feature: handle.feature });
    (handle._events[kind] || []).forEach(function (cb) {
      try { cb(event); } catch (err) { console.error(err); }
    });
    if (kind === 'click' && handle._popupContent) {
      new Popup().setLatLng(e.latlng).setContent(handle._popupContent).setSource(this).openOn(this.map);
    }
    if (kind === 'hover' && handle._tooltipContent && !this._openTooltip) {
      this._openTooltip = new Tooltip({ content: handle._tooltipContent }).setLatLng(e.latlng).openOn(this.map);
      this._openTooltipFid = fid;
    }
  }

  // Load GeoJSON data
  loadData(geojson) {
    if (this.dataLoaded) return this;

    var jsonObject = null;
    var jsonText = null;

    if (typeof geojson === 'string') {
      jsonText = geojson;
      try { jsonObject = JSON.parse(geojson); } catch (e) {}
    } else {
      jsonObject = geojson;
      try { jsonText = JSON.stringify(geojson); } catch (e) { jsonText = null; }
    }

    this.geojson = jsonObject;
    this.dataLoaded = true;

    if (jsonObject) {
      var processed = this._applyFeatureOptions(jsonObject);
      if (processed !== jsonObject) {
        try { jsonText = JSON.stringify(processed); } catch (e) { jsonText = null; }
      }
      if (this.map) this._mountFeatureExtras(this.map);
    }

    if (jsonText) {
      if (this.map && this.layerIndex !== undefined) {
        this.map.wasmMap.load_geojson(this.layerIndex, jsonText);
        this.updateStyle();
        this._pendingGeoJSONText = null;
      } else {
        this._pendingGeoJSONText = jsonText;
      }
    }

    return this;
  }

  // Load GeoJSON from URL
  loadUrl(url) {
    var self = this;
    return fetch(url)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP error! status: ' + response.status);
        }
        return response.json();
      })
      .then(function(data) {
        self.loadData(data);
        return self;
      });
  }

  // Load GeoJSON from URL with streaming support
  loadUrlStreaming(url, options) {
    var self = this;
    var opts = options || {};
    var chunkSize = opts.chunkSize || 1024 * 1024;
    var progressCallback = opts.progressCallback || null;
    var completeCallback = opts.completeCallback || null;
    var errorCallback = opts.errorCallback || null;

    return new Promise(function(resolve, reject) {
      fetch(url)
        .then(function(response) {
          if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
          }

          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var totalBytes = 0;
          var loadedBytes = 0;

          var contentLength = response.headers.get('Content-Length');
          var totalSize = contentLength ? parseInt(contentLength) : null;

          var readChunk = function() {
            reader.read()
              .then(function(result) {
                if (result.done) {
                  if (buffer.trim()) {
                    self.processChunk(buffer, true);
                  }
                  if (completeCallback) {
                    completeCallback({
                      totalFeatures: self.getFeatureCount(),
                      totalBytes: totalBytes,
                      loadedBytes: loadedBytes
                    });
                  }
                  resolve(self);
                  return;
                }

                var chunk = decoder.decode(result.value, { stream: true });
                buffer += chunk;
                loadedBytes += result.value.length;
                totalBytes += result.value.length;

                self.processStreamingBuffer(buffer, false);

                if (progressCallback && totalSize) {
                  progressCallback({
                    loaded: loadedBytes,
                    total: totalSize,
                    percentage: Math.round((loadedBytes / totalSize) * 100),
                    featureCount: self.getFeatureCount()
                  });
                }

                if (buffer.length > chunkSize * 2) {
                  buffer = buffer.slice(-chunkSize);
                }

                readChunk();
              })
              .catch(function(error) {
                if (errorCallback) errorCallback(error);
                reject(error);
              });
          };

          readChunk();
        })
        .catch(function(error) {
          if (errorCallback) errorCallback(error);
          reject(error);
        });
    });
  }

  // Process streaming buffer for GeoJSON chunks
  processStreamingBuffer(buffer, isFinal) {
    var processed = 0;
    var self = this;

    while (true) {
      var endIndex = this.findCompleteJsonEnd(buffer);
      if (endIndex === -1) break;

      var jsonStr = buffer.substring(0, endIndex + 1);
      this.processChunk(jsonStr, false);

      buffer = buffer.substring(endIndex + 1);
      processed++;
    }

    return { processed: processed, remaining: buffer };
  }

  // Find the end of a complete JSON object
  findCompleteJsonEnd(str) {
    var braceCount = 0;
    var inString = false;
    var escape = false;

    for (var i = 0; i < str.length; i++) {
      var char = str[i];

      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) return i;
      }
    }

    return -1;
  }

  // Process a single chunk of GeoJSON data
  processChunk(chunk, isFinal) {
    if (this.map && this.layerIndex !== undefined) {
      try {
        this.map.wasmMap.load_geojson_chunk(this.layerIndex, chunk, isFinal);
      } catch (error) {
        console.warn('Failed to process GeoJSON chunk:', error);
      }
    }
  }

  // Get current feature count
  getFeatureCount() {
    if (this.map && this.layerIndex !== undefined) {
      try {
        return this.map.wasmMap.get_geojson_feature_count(this.layerIndex);
      } catch (error) {
        return 0;
      }
    }
    return 0;
  }

  // Set style options
  setStyle(style) {
    Object.assign(this.options, style);
    if (this.map) {
      this.updateStyle();
    }
    return this;
  }

  // Update style on the map
  updateStyle() {
    if (this.map && this.layerIndex !== undefined) {
      var styleData = {
        pointColor: this.options.pointColor,
        pointSize: this.options.pointSize,
        lineColor: this.options.lineColor,
        lineWidth: this.options.lineWidth,
        polygonColor: this.options.polygonColor
      };
      this.map.wasmMap.set_geojson_style(this.layerIndex, styleData);
    }
  }

  // Add layer to map
  addTo(map) {
    if (this.map === map && this.layerIndex !== undefined) {
      map.wasmMap.set_geojson_layer_visible(this.layerIndex, true);
      for (var i = 0; i < this._featureLayers.length; i++) this._featureLayers[i].addTo(map);
      if (map._notifyLayerAdd) map._notifyLayerAdd(this);
      return this;
    }
    this.map = map;
    this.layerIndex = map.wasmMap.add_geojson_layer();
    if (typeof map._geojsonLayerCount !== 'number') {
      map._geojsonLayerCount = 0;
    }
    map._geojsonLayerCount += 1;

    if (this._pendingGeoJSONText) {
      try {
        map.wasmMap.load_geojson(this.layerIndex, this._pendingGeoJSONText);
        this.updateStyle();
      } finally {
        this._pendingGeoJSONText = null;
        if (this._pendingTimer) {
          clearInterval(this._pendingTimer);
          this._pendingTimer = null;
        }
      }
    } else if (this.geojson) {
      var dataObject = this.geojson;
      if (typeof dataObject === 'string') {
        try { dataObject = JSON.parse(dataObject); } catch (e) { dataObject = null; }
      }
      if (dataObject) {
        var processed = this._applyFeatureOptions(dataObject);
        map.wasmMap.load_geojson(this.layerIndex, JSON.stringify(processed));
      } else {
        map.wasmMap.load_geojson(this.layerIndex, this.geojson);
      }
      this.updateStyle();
    }

    this._mountFeatureExtras(map);
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }

  // Event handlers
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }

  // Hide the layer (the map reference is kept so addTo can re-show it)
  remove() {
    if (this.map && this.layerIndex !== undefined) {
      this.map.wasmMap.set_geojson_layer_visible(this.layerIndex, false);
      if (this.map._notifyLayerRemove) this.map._notifyLayerRemove(this);
    }
    for (var i = 0; i < this._featureLayers.length; i++) this._featureLayers[i].remove();
    return this;
  }

  // Get feature bounds
  getBounds() {
    if (!this.geojson) return null;

    var minLng = Infinity, minLat = Infinity;
    var maxLng = -Infinity, maxLat = -Infinity;

    var extractCoordinates = function(geometry) {
      switch (geometry.type) {
        case 'Point': return [geometry.coordinates];
        case 'MultiPoint': return geometry.coordinates;
        case 'LineString': return geometry.coordinates;
        case 'MultiLineString': return geometry.coordinates.flat();
        case 'Polygon': return geometry.coordinates.flat();
        case 'MultiPolygon': return geometry.coordinates.flat().flat();
        default: return [];
      }
    };

    var processFeature = function(feature) {
      var coords = extractCoordinates(feature.geometry);
      coords.forEach(function(coord) {
        var lng = coord[0], lat = coord[1];
        if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
          minLng = Math.min(minLng, lng);
          minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng);
          maxLat = Math.max(maxLat, lat);
        }
      });
    };

    if (this.geojson.type === 'FeatureCollection' && Array.isArray(this.geojson.features)) {
      this.geojson.features.forEach(processFeature);
    } else if (this.geojson.type === 'Feature' && this.geojson.geometry) {
      processFeature(this.geojson);
    } else if (this.geojson.type && this.geojson.coordinates) {
      processFeature({ geometry: this.geojson });
    }

    if (minLng === Infinity) return null;

    return [
      [minLat, minLng],
      [maxLat, maxLng]
    ];
  }

  // Get features in current view
  getFeaturesInBounds(bounds) {
    return [];
  }

  // Get features in current view bounds
  getFeaturesInBounds(bounds) {
    return this.geojson ? (this.geojson.features || [this.geojson]) : [];
  }

  // Clear layer data
  clear() {
    this.geojson = null;
    if (this.map && this.layerIndex !== undefined) {
      try {
        this.map.wasmMap.clear_geojson_layer(this.layerIndex);
      } catch (error) {
        console.warn('Failed to clear GeoJSON layer:', error);
      }
    }
    return this;
  }

  // Add individual GeoJSON feature
  addFeature(feature) {
    if (!this.map || this.layerIndex === undefined) return this;
    try {
      var featureStr = typeof feature === 'string' ? feature : JSON.stringify(feature);
      this.processChunk(featureStr, false);
    } catch (error) {
      console.warn('Failed to add feature:', error);
    }
    return this;
  }

  // Add multiple GeoJSON features
  addFeatures(features) {
    var self = this;
    features.forEach(function(feature) { self.addFeature(feature); });
    return this;
  }

  // Set data-driven styling based on properties
  setStyleFunction(styleFn) {
    this.styleFunction = styleFn;
    if (this.map && this.layerIndex !== undefined) {
      this.updateStyle();
    }
    return this;
  }

  // Load GeoJSON from a File object
  loadFile(file, options) {
    var self = this;
    var opts = options || {};
    var chunkSize = opts.chunkSize || 1024 * 1024;
    var progressCallback = opts.progressCallback || null;
    var completeCallback = opts.completeCallback || null;
    var errorCallback = opts.errorCallback || null;

    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      var offset = 0;

      var readChunk = function() {
        var slice = file.slice(offset, offset + chunkSize);
        reader.readAsText(slice);
      };

      reader.onload = function(e) {
        var chunk = e.target.result;
        offset += chunk.length;
        self.processChunk(chunk, offset >= file.size);

        if (progressCallback) {
          progressCallback({
            loaded: offset,
            total: file.size,
            percentage: Math.round((offset / file.size) * 100),
            featureCount: self.getFeatureCount()
          });
        }

        if (offset < file.size) {
          readChunk();
        } else {
          if (completeCallback) {
            completeCallback({
              totalFeatures: self.getFeatureCount(),
              totalBytes: file.size,
              loadedBytes: offset
            });
          }
          resolve(self);
        }
      };

      reader.onerror = function() {
        var error = new Error('Failed to read file');
        if (errorCallback) errorCallback(error);
        reject(error);
      };

      readChunk();
    });
  }
}

// ---------- Popup ----------

class Popup {
  constructor(options) {
    var opts = options || {};
    this.options = Object.assign({
      maxWidth: 300,
      minWidth: 50,
      maxHeight: null,
      autoPan: true,
      autoPanPaddingTopLeft: [20, 20],
      autoPanPaddingBottomRight: [20, 20],
      autoPanPadding: [5, 5],
      keepInView: false,
      closeButton: true,
      autoClose: true,
      className: ''
    }, opts);
    this.element = null;
    this.latlng = null;
    this.map = null;
    this.content = '';
    this.isOpen = false;
    this._source = null;
    this._timeout = null;
    this.contentWrapper = null;
  }
  setLatLng(latlng) {
    this.latlng = latlng;
    if (this.isOpen && this.map) this._updatePosition();
    return this;
  }
  setContent(html) {
    this.content = html;
    if (this.element) this._updateContent();
    return this;
  }
  setSource(layer) { this._source = layer; return this; }
  openOn(map) {
    if (this.isOpen && this.map === map) return this;
    if (this.isOpen) this.close();
    if (!map || !map.containerElement) return this;
    this.map = map;
    this._initLayout();
    this._updateContent();
    this._updatePosition();
    try {
      map.containerElement.appendChild(this.element);
      this.isOpen = true;
    } catch (e) { return this; }
    if (map._fireLocalEvent) map._fireLocalEvent('popupopen', { type: 'popupopen', popup: this });
    return this;
  }
  close() {
    if (!this.isOpen) return this;
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.isOpen = false;
    if (this.map && this.map._fireLocalEvent) this.map._fireLocalEvent('popupclose', { type: 'popupclose', popup: this });
    this.map = null;
    return this;
  }
  toggle(map) {
    if (this.isOpen) { this.close(); } else { this.openOn(map); }
    return this;
  }
  isOpenPopup() { return this.isOpen; }
  update() {
    if (!this.isOpen || !this.map) return this;
    this._updateLayout();
    this._updateContent();
    this._updatePosition();
    return this;
  }
  bringToFront() {
    if (this.element) {
      var parent = this.element.parentNode;
      if (parent) parent.appendChild(this.element);
    }
    return this;
  }
  bringToBack() {
    if (this.element) {
      var parent = this.element.parentNode;
      if (parent && parent.firstChild) {
        parent.insertBefore(this.element, parent.firstChild);
      }
    }
    return this;
  }
  bindTo(layer, content) {
    var self = this;
    layer.on('click', function(e) {
      if (e.latlng) {
        self.setLatLng(e.latlng)
          .setContent(content)
          .setSource(layer)
          .openOn(layer.map || self.map);
      }
    });
    return this;
  }
  _initLayout() {
    this.element = document.createElement('div');
    this.element.className = 'rustyleaf-popup';
    this.contentWrapper = document.createElement('div');
    this.contentWrapper.className = 'rustyleaf-popup-content-wrapper';
    this.element.appendChild(this.contentWrapper);
  }
  _updateLayout() {}
  _updateContent() {
    if (!this.contentWrapper) return;
    if (typeof this.content === 'string') {
      this.contentWrapper.innerHTML = this.content;
    } else if (this.content instanceof HTMLElement) {
      this.contentWrapper.innerHTML = '';
      this.contentWrapper.appendChild(this.content);
    }
  }
  _updatePosition() {}
}

// ---------- Icon / DivIcon ----------

class Icon {
  constructor(options) {
    this.options = Object.assign({}, options);
    if (!this.options.iconUrl && !(this instanceof DivIcon)) {
      throw new Error('Icon requires an iconUrl option');
    }
  }
}

Icon.Default = class extends Icon {
  constructor() {
    super({
      iconUrl: 'marker-icon.png',
      iconRetinaUrl: 'marker-icon-2x.png',
      shadowUrl: 'marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
      className: 'rustyleaf-div-icon-default'
    });
  }
};

class DivIcon extends Icon {
  constructor(options) {
    super(Object.assign({ iconUrl: 'divicon' }, options));
  }
}

// ---------- Marker ----------

function validateLatLng(latlng) {
  if (!Array.isArray(latlng) || latlng.length !== 2 ||
      typeof latlng[0] !== 'number' || typeof latlng[1] !== 'number' ||
      !isFinite(latlng[0]) || !isFinite(latlng[1])) {
    throw new Error('Invalid latlng: expected [lat, lng] numbers');
  }
}

class Marker {
  constructor(latlng, options) {
    validateLatLng(latlng);
    this._latlng = [latlng[0], latlng[1]];
    this._options = options || {};
    this._opacity = this._options.opacity !== undefined ? this._options.opacity : 1;
    this._zIndexOffset = this._options.zIndexOffset !== undefined ? this._options.zIndexOffset : 0;
    this._draggable = !!this._options.draggable;
    this._icon = this._options.icon || new Icon.Default();
    this._color = parseMarkerColor(this._options.color);
    this._size = this._options.size !== undefined ? this._options.size : 14;
    this._events = {};
    this._map = null;
    this._id = null;
    this._popupOpen = false;
    this._tooltipOpen = false;
  }

  getLatLng() { return [this._latlng[0], this._latlng[1]]; }

  setLatLng(latlng) {
    validateLatLng(latlng);
    this._latlng = [latlng[0], latlng[1]];
    if (this._map && this._id !== null) {
      this._map.wasmMap.update_marker(this._id, latlng[0], latlng[1]);
    }
    return this;
  }

  getIcon() { return this._icon; }
  setIcon(icon) { this._icon = icon; return this; }

  getOpacity() { return this._opacity; }
  setOpacity(o) {
    if (o < 0) o = 0;
    if (o > 1) o = 1;
    this._opacity = o;
    this._applyStyle();
    return this;
  }

  getZIndexOffset() { return this._zIndexOffset; }
  setZIndexOffset(o) { this._zIndexOffset = o; this._applyStyle(); return this; }

  isDraggable() { return this._draggable; }
  setDraggable(d) { this._draggable = !!d; return this; }

  on(event, cb) {
    (this._events[event] = this._events[event] || []).push(cb);
    return this;
  }
  off(event, cb) {
    if (this._events[event]) {
      this._events[event] = this._events[event].filter(function(h) { return h !== cb; });
    }
    return this;
  }
  fire(event, data) {
    (this._events[event] || []).forEach(function(h) { h(data); });
    return this;
  }

  _applyStyle() {
    if (this._map && this._id !== null) {
      var c = this._color;
      this._map.wasmMap.set_marker_style(this._id, this._size, c[0], c[1], c[2], this._opacity, this._zIndexOffset);
    }
  }

  addTo(map) {
    this._map = map;
    this._id = map.wasmMap.add_marker();
    map.wasmMap.update_marker(this._id, this._latlng[0], this._latlng[1]);
    this._applyStyle();
    map.wasmMap.set_marker_visible(this._id, true);
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    this.fire('add', { target: this });
    return this;
  }

  remove() {
    if (this._map && this._id !== null) {
      this._map.wasmMap.remove_marker(this._id);
      if (this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
      this._map = null;
      this._id = null;
      this.fire('remove', { target: this });
    }
    return this;
  }

  // Markers are GPU sprites, so there is no DOM element to return.
  getElement() { return null; }

  bindPopup(content) {
    if (content && content instanceof Popup) this._popup = content;
    else this._popupContent = content;
    return this;
  }
  getPopupContent() { return this._popupContent; }
  getPopup() { return this._popup; }
  openPopup() {
    this._popupOpen = true;
    if (this._popup) {
      this._popup.setLatLng(this._latlng);
      if (this._map) this._popup.openOn(this._map);
    }
    return this;
  }
  closePopup() {
    this._popupOpen = false;
    if (this._popup) this._popup.close();
    return this;
  }
  isPopupOpen() { return this._popupOpen; }

  bindTooltip(content) {
    if (content && content instanceof Popup) this._tooltip = content;
    else this._tooltipContent = content;
    return this;
  }
  getTooltipContent() { return this._tooltipContent; }
  openTooltip() { this._tooltipOpen = true; return this; }
  closeTooltip() { this._tooltipOpen = false; return this; }
  isTooltipOpen() { return this._tooltipOpen; }
}

function parseMarkerColor(hex) {
  if (typeof hex !== 'string') return [0.878, 0.224, 0.243];
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return [0.878, 0.224, 0.243];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ];
}

// ---------- Tooltip (lightweight DOM overlay) ----------

class Tooltip {
  constructor(options) {
    var opts = options || {};
    this.options = Object.assign({
      direction: 'auto',
      opacity: 0.9,
      className: '',
      sticky: false,
      offset: [0, 0]
    }, opts);
    this.content = opts.content !== undefined ? opts.content : '';
    this.latlng = null;
    this.map = null;
    this.element = null;
    this._isOpen = false;
  }
  setContent(html) { this.content = html; if (this.element) this._updateContent(); return this; }
  getTooltipContent() { return this.content; }
  setLatLng(latlng) { this.latlng = latlng; if (this._isOpen && this.map) this._updatePosition(); return this; }
  getLatLng() { return this.latlng; }
  openOn(map) {
    if (!map || !map.containerElement) return this;
    this.map = map;
    this._initLayout();
    this._updateContent();
    this._updatePosition();
    map.containerElement.appendChild(this.element);
    this._isOpen = true;
    if (map._fireLocalEvent) map._fireLocalEvent('tooltipopen', { type: 'tooltipopen', tooltip: this });
    return this;
  }
  close() {
    if (!this._isOpen) return this;
    if (this.element && this.element.parentNode) this.element.parentNode.removeChild(this.element);
    this._isOpen = false;
    if (this.map && this.map._fireLocalEvent) this.map._fireLocalEvent('tooltipclose', { type: 'tooltipclose', tooltip: this });
    this.map = null;
    return this;
  }
  isOpenTooltip() { return this._isOpen; }
  isOpen() { return this._isOpen; }
  getElement() { return this._isOpen ? this.element : null; }
  _initLayout() {
    this.element = document.createElement('div');
    this.element.className = 'rustyleaf-tooltip' + (this.options.className ? ' ' + this.options.className : '');
    Object.assign(this.element.style, {
      position: 'absolute',
      background: 'rgba(255,255,255,0.95)',
      border: '1px solid #aaa',
      borderRadius: '4px',
      padding: '4px 8px',
      fontSize: '12px',
      zIndex: '1100',
      pointerEvents: 'auto',
      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      transform: 'translate(-50%, -120%)'
    });
  }
  _updateContent() {
    if (!this.element) return;
    if (typeof this.content === 'string') this.element.innerHTML = this.content;
    else if (this.content instanceof HTMLElement) { this.element.innerHTML = ''; this.element.appendChild(this.content); }
  }
  _updatePosition() {
    if (!this.map || !this.latlng || !this.element) return;
    if (!this.map.wasmMap || typeof this.map.wasmMap.screen_xy !== 'function') return;
    var xy = this.map.wasmMap.screen_xy(this.latlng[0], this.latlng[1]);
    if (!xy) return;
    this.element.style.left = xy[0] + 'px';
    this.element.style.top = xy[1] + 'px';
  }
}

// ---------- Controls (DOM overlays) ----------

function cornerStyle(pos) {
  switch (pos) {
    case 'topright': return { top: '10px', right: '10px' };
    case 'bottomleft': return { bottom: '10px', left: '10px' };
    case 'bottomright': return { bottom: '10px', right: '10px' };
    case 'topleft':
    default: return { top: '10px', left: '10px' };
  }
}

class Control {
  constructor(options) {
    this.options = Object.assign({ position: 'topleft' }, options || {});
    this._map = null;
    this._container = null;
  }
  getPosition() { return this.options.position; }
  setPosition(position) { this.options.position = position; return this; }
  onAdd(map) { return document.createElement('div'); }
  onRemove(map) { return this; }
  addTo(map) {
    this._map = map;
    this._container = this.onAdd(map);
    if (this._container && map.containerElement) {
      Object.assign(this._container.style, { position: 'absolute', zIndex: '1000' }, cornerStyle(this.options.position));
      map.containerElement.appendChild(this._container);
    }
    return this;
  }
  remove() {
    if (this._container && this._container.parentNode) this._container.parentNode.removeChild(this._container);
    this._container = null;
    this._map = null;
    return this;
  }
  getContainer() { return this._container; }
}

class ZoomControl extends Control {
  constructor(options) {
    super(Object.assign({ position: 'topleft' }, options || {}));
  }
  onAdd(map) {
    var el = document.createElement('div');
    el.className = 'rustyleaf-zoom-control';
    el.style.cssText = 'display:flex;flex-direction:column;';
    var plus = document.createElement('button');
    plus.textContent = '+';
    var minus = document.createElement('button');
    minus.textContent = '−';
    [plus, minus].forEach(function (b) {
      b.style.cssText = 'width:30px;height:30px;font-size:18px;cursor:pointer;border:1px solid #ccc;background:#fff;';
    });
    plus.addEventListener('click', function () { map.zoomIn(); });
    minus.addEventListener('click', function () { map.zoomOut(); });
    el.appendChild(plus);
    el.appendChild(minus);
    return el;
  }
}

class AttributionControl extends Control {
  constructor(options) {
    super(Object.assign({ position: 'bottomright', prefix: 'Rustyleaf' }, options || {}));
    this._attributions = [];
    this._prefix = this.options.prefix;
  }
  onAdd(map) {
    var el = document.createElement('div');
    el.className = 'rustyleaf-attribution';
    Object.assign(el.style, {
      background: 'rgba(255,255,255,0.8)',
      font: '11px/1.4 sans-serif',
      padding: '0 5px',
      maxWidth: '60%',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis'
    });
    if (window.getComputedStyle(map.containerElement).position === 'static') {
      map.containerElement.style.position = 'relative';
    }
    map.attributionControl = this;
    this._container = el;
    this._update();
    return el;
  }
  addAttribution(text) {
    if (text && this._attributions.indexOf(text) === -1) {
      this._attributions.push(text);
      this._update();
    }
    return this;
  }
  getAttributions() { return this._attributions.slice(); }
  setPrefix(prefix) { this._prefix = prefix; this._update(); return this; }
  getPrefix() { return this._prefix; }
  _update() {
    if (!this._container) return;
    var parts = [];
    if (this._prefix) parts.push(this._prefix);
    parts.push.apply(parts, this._attributions);
    this._container.innerHTML = parts.join(' | ');
  }
}

class ScaleControl extends Control {
  constructor(options) {
    super(Object.assign({ position: 'bottomleft', maxWidth: 100, imperial: true, metric: true }, options || {}));
  }
  onAdd(map) {
    var el = document.createElement('div');
    el.className = 'rustyleaf-scale-control';
    Object.assign(el.style, {
      background: 'rgba(255,255,255,0.8)',
      font: '11px/1.4 sans-serif',
      padding: '2px 5px',
      border: '1px solid #999',
      borderTop: 'none'
    });
    this._containerEl = el;
    this._update(map);
    if (typeof map.on === 'function') {
      map.on('move', function () { this._update(map); }.bind(this));
      map.on('zoom', function () { this._update(map); }.bind(this));
    }
    return el;
  }
  _update(map) {
    if (!this._containerEl || !map) return;
    var zoom = typeof map.getZoom === 'function' ? map.getZoom() : 12;
    var center = typeof map.getCenter === 'function' ? map.getCenter() : [0, 0];
    var latRad = center[0] * Math.PI / 180;
    var mpp = 156543.03392 * Math.cos(latRad) / Math.pow(2, zoom);
    var maxPx = this.options.maxWidth || 100;
    var meters = mpp * maxPx;
    var label;
    if (meters >= 1000) label = (meters / 1000).toFixed(meters >= 10000 ? 0 : 1) + ' km';
    else label = Math.round(meters) + ' m';
    this._containerEl.textContent = label;
    this._containerEl.style.width = maxPx + 'px';
  }
}

class LayersControl extends Control {
  constructor(baseLayers, overlays, options) {
    super(Object.assign({ position: 'topright' }, options || {}));
    this._entries = [];
    var self = this;
    if (baseLayers) Object.keys(baseLayers).forEach(function (n) { self.addBaseLayer(baseLayers[n], n); });
    if (overlays) Object.keys(overlays).forEach(function (n) { self.addOverlay(overlays[n], n); });
  }
  addBaseLayer(layer, name) {
    this._entries.push({ layer: layer, name: name, overlay: false });
    this._refresh();
    return this;
  }
  addOverlay(layer, name) {
    this._entries.push({ layer: layer, name: name, overlay: true });
    this._refresh();
    return this;
  }
  removeLayer(layer) {
    this._entries = this._entries.filter(function (e) { return e.layer !== layer; });
    this._refresh();
    return this;
  }
  onAdd(map) {
    var el = document.createElement('div');
    el.className = 'rustyleaf-layers-control';
    Object.assign(el.style, {
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '4px',
      padding: '6px 8px',
      font: '12px/1.5 sans-serif'
    });
    this._container = el;
    this._refresh();
    return el;
  }
  _refresh() {
    if (!this._container) return;
    var el = this._container;
    el.innerHTML = '';
    var self = this;
    this._entries.forEach(function (entry) {
      var label = document.createElement('label');
      label.style.display = 'block';
      var input = document.createElement('input');
      input.type = entry.overlay ? 'checkbox' : 'radio';
      if (!entry.overlay) input.name = 'rustyleaf-base-layer';
      input.checked = true;
      input.addEventListener('change', function () {
        var m = self._map;
        if (!m) return;
        if (entry.overlay) {
          if (input.checked) entry.layer.addTo(m);
          else entry.layer.remove();
        } else {
          self._entries.forEach(function (other) {
            if (!other.overlay && other !== entry) other.layer.remove();
          });
          entry.layer.addTo(m);
        }
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + entry.name));
      el.appendChild(label);
    });
  }
}

// ---------- Vector shapes (Circle / CircleMarker / Rectangle) ----------

var METERS_PER_DEG_LAT = 111320;

class Shape {
  constructor(options) {
    this.options = options || {};
    this._layer = null;
    this._pendingEvents = [];
  }
  on(event, callback) {
    if (this._layer) this._layer.on(event, callback);
    else this._pendingEvents.push([event, callback]);
    return this;
  }
  remove() {
    if (this._layer) this._layer.remove();
    return this;
  }
  _attach(layer, map) {
    this._layer = layer;
    this._attachedMap = map;
    layer.addTo(map);
    for (var i = 0; i < this._pendingEvents.length; i++) {
      layer.on(this._pendingEvents[i][0], this._pendingEvents[i][1]);
    }
    this._pendingEvents = [];
  }
  _reattached(map) {
    if (this._layer && this._attachedMap === map) {
      this._layer.addTo(map);
      return true;
    }
    return false;
  }

  // Rebuild the underlying layer after a geometry change (setRadius,
  // setBounds, setLatLng). The old wasm layer is hidden and a fresh one is
  // uploaded; cheap for single shapes.
  redraw() {
    if (this._layer && this._attachedMap) {
      var map = this._attachedMap;
      this._layer.remove();
      this._layer = null;
      this._attachedMap = null;
      this.addTo(map);
    }
    return this;
  }
}

class Circle extends Shape {
  constructor(latlng, options) {
    super(options);
    this._latlng = [latlng[0], latlng[1]];
    this._radius = this.options.radius !== undefined ? this.options.radius : 10;
  }
  getLatLng() { return [this._latlng[0], this._latlng[1]]; }
  setLatLng(latlng) { this._latlng = [latlng[0], latlng[1]]; return this; }
  getRadius() { return this._radius; }
  setRadius(radius) { this._radius = radius; return this; }
  _delta() {
    var dLat = this._radius / METERS_PER_DEG_LAT;
    var dLng = this._radius / (METERS_PER_DEG_LAT * Math.cos(this._latlng[0] * Math.PI / 180));
    return [dLat, dLng];
  }
  _ring(segments) {
    segments = segments || 64;
    var lat = this._latlng[0], lng = this._latlng[1];
    var d = this._delta();
    var ring = [];
    for (var i = 0; i < segments; i++) {
      var theta = (i / segments) * 2 * Math.PI;
      ring.push({ lat: lat + d[0] * Math.sin(theta), lng: lng + d[1] * Math.cos(theta) });
    }
    return ring;
  }
  getBounds() {
    var lat = this._latlng[0], lng = this._latlng[1];
    var d = this._delta();
    return [[lat - d[0], lng - d[1]], [lat + d[0], lng + d[1]]];
  }
  addTo(map) {
    if (this._reattached(map)) return this;
    var layer = new PolygonLayer();
    layer.add([{
      rings: [this._ring()],
      color: this.options.fillColor || this.options.color || '#3388ff66',
      meta: this.options.meta || null
    }]);
    this._attach(layer, map);
    return this;
  }
}

class CircleMarker extends Shape {
  constructor(latlng, options) {
    super(options);
    this._latlng = [latlng[0], latlng[1]];
    this._radius = this.options.radius !== undefined ? this.options.radius : 10;
  }
  getLatLng() { return [this._latlng[0], this._latlng[1]]; }
  setLatLng(latlng) { this._latlng = [latlng[0], latlng[1]]; return this; }
  getRadius() { return this._radius; }
  setRadius(radius) { this._radius = radius; return this; }
  addTo(map) {
    if (this._reattached(map)) return this;
    var layer = new PointLayer();
    layer.add([{
      lat: this._latlng[0],
      lng: this._latlng[1],
      size: this._radius * 2,
      color: this.options.fillColor || this.options.color || '#3388ff',
      meta: this.options.meta || null
    }]);
    this._attach(layer, map);
    return this;
  }
}

class Rectangle extends Shape {
  constructor(bounds, options) {
    super(options);
    this.setBounds(bounds);
  }
  getBounds() {
    return [[this._bounds[0][0], this._bounds[0][1]], [this._bounds[1][0], this._bounds[1][1]]];
  }
  setBounds(bounds) {
    this._bounds = [[bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]];
    return this;
  }
  addTo(map) {
    if (this._reattached(map)) return this;
    var south = this._bounds[0][0], west = this._bounds[0][1];
    var north = this._bounds[1][0], east = this._bounds[1][1];
    var layer = new PolygonLayer();
    layer.add([{
      rings: [[
        { lat: south, lng: west },
        { lat: south, lng: east },
        { lat: north, lng: east },
        { lat: north, lng: west }
      ]],
      color: this.options.fillColor || this.options.color || '#3388ff66',
      meta: this.options.meta || null
    }]);
    this._attach(layer, map);
    return this;
  }
}

// ---------- Layer grouping (LayerGroup / FeatureGroup) ----------

class LayerGroup {
  constructor(layers) {
    this._layers = layers ? layers.slice() : [];
    this._map = null;
  }
  getLayers() { return this._layers.slice(); }
  hasLayer(layer) { return this._layers.indexOf(layer) !== -1; }
  addLayer(layer) {
    if (!this.hasLayer(layer)) {
      this._layers.push(layer);
      if (this._map) layer.addTo(this._map);
    }
    return this;
  }
  removeLayer(layer) {
    if (this.hasLayer(layer)) {
      this._layers = this._layers.filter(function (l) { return l !== layer; });
      if (this._map) layer.remove();
    }
    return this;
  }
  clearLayers() {
    if (this._map) {
      this._layers.forEach(function (layer) { layer.remove(); });
    }
    this._layers = [];
    return this;
  }
  eachLayer(fn, context) {
    this._layers.slice().forEach(function (layer) { fn.call(context, layer); });
    return this;
  }
  addTo(map) {
    this._map = map;
    this._layers.forEach(function (layer) { layer.addTo(map); });
    return this;
  }
  remove() {
    this._layers.forEach(function (layer) { layer.remove(); });
    this._map = null;
    return this;
  }
}

class FeatureGroup extends LayerGroup {
  on(event, callback) {
    this._layers.forEach(function (layer) {
      if (typeof layer.on === 'function') layer.on(event, callback);
    });
    return this;
  }
  getBounds() {
    var out = null;
    this._layers.forEach(function (layer) {
      if (typeof layer.getBounds !== 'function') return;
      var b = layer.getBounds();
      if (!b) return;
      out = out
        ? [
          [Math.min(out[0][0], b[0][0]), Math.min(out[0][1], b[0][1])],
          [Math.max(out[1][0], b[1][0]), Math.max(out[1][1], b[1][1])]
        ]
        : [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
    });
    return out;
  }
}

// WASM event callbacks are dispatched synchronously while the Rust map is
// mutably borrowed; calling back into the map from such a callback throws
// ("recursive use of an object"). Defer re-entrant work to a microtask.
function deferCallback(fn) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else setTimeout(fn, 0);
}

// ---------- Ground overlays (ImageOverlay / VideoOverlay / SVGOverlay) ----------

// DOM element pinned to LatLngBounds, repositioned on move/zoom/resize via
// the wasm screen_xy projection.
class ImageOverlay {
  constructor(url, bounds, options = {}) {
    this._url = url;
    this.options = options;
    this._element = null;
    this._map = null;
    this._onViewChange = null;
    this.setBounds(bounds);
  }

  getBounds() {
    return [[this._bounds[0][0], this._bounds[0][1]], [this._bounds[1][0], this._bounds[1][1]]];
  }

  setBounds(bounds) {
    this._bounds = [[bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]];
    this._updatePosition();
    return this;
  }

  setUrl(url) {
    this._url = url;
    if (this._element) this._element.setAttribute('src', url);
    return this;
  }

  setOpacity(opacity) {
    this.options.opacity = opacity;
    if (this._element) this._element.style.opacity = String(opacity);
    return this;
  }

  getElement() {
    return this._element;
  }

  _createElement() {
    const img = document.createElement('img');
    img.className = 'rustyleaf-image-overlay';
    img.setAttribute('src', this._url);
    if (this.options.alt) img.alt = this.options.alt;
    return img;
  }

  addTo(map) {
    this._map = map;
    if (!this._element) this._element = this._createElement();
    const el = this._element;
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: this.options.interactive ? 'auto' : 'none',
      zIndex: '400',
    });
    if (this.options.opacity !== undefined) el.style.opacity = String(this.options.opacity);
    if (this.options.className) el.classList.add(this.options.className);
    if (window.getComputedStyle(map.containerElement).position === 'static') {
      map.containerElement.style.position = 'relative';
    }
    map.containerElement.appendChild(el);
    this._updatePosition();
    if (!this._onViewChange) {
      this._onViewChange = () => deferCallback(() => this._updatePosition());
      map.on('move', this._onViewChange);
      map.on('zoom', this._onViewChange);
      map.on('resize', this._onViewChange);
    }
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }

  _updatePosition() {
    if (!this._map || !this._element) return;
    const wasm = this._map.wasmMap;
    if (!wasm || typeof wasm.screen_xy !== 'function') return;
    const [[south, west], [north, east]] = this._bounds;
    const nw = wasm.screen_xy(north, west);
    const se = wasm.screen_xy(south, east);
    if (!nw || !se) return;
    // canvas px → CSS px (the canvas may be display-scaled)
    const rect = this._map.canvas.getBoundingClientRect();
    const rx = (rect.width && this._map.canvas.width) ? rect.width / this._map.canvas.width : 1;
    const ry = (rect.height && this._map.canvas.height) ? rect.height / this._map.canvas.height : 1;
    const px = (v) => Math.round(v * 100) / 100 + 'px';
    this._element.style.left = px(nw[0] * rx);
    this._element.style.top = px(nw[1] * ry);
    this._element.style.width = px(Math.max(0, (se[0] - nw[0]) * rx));
    this._element.style.height = px(Math.max(0, (se[1] - nw[1]) * ry));
  }

  remove() {
    if (this._element && this._element.parentNode) {
      this._element.parentNode.removeChild(this._element);
    }
    if (this._map) {
      if (this._onViewChange) {
        this._map.off('move', this._onViewChange);
        this._map.off('zoom', this._onViewChange);
        this._map.off('resize', this._onViewChange);
        this._onViewChange = null;
      }
      if (this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
    }
    return this;
  }

  bringToFront() {
    if (this._element && this._element.parentNode) this._element.parentNode.appendChild(this._element);
    return this;
  }

  bringToBack() {
    const parent = this._element && this._element.parentNode;
    if (parent && parent.firstChild) parent.insertBefore(this._element, parent.firstChild);
    return this;
  }
}

class VideoOverlay extends ImageOverlay {
  _createElement() {
    const video = document.createElement('video');
    video.className = 'rustyleaf-video-overlay';
    video.src = this._url;
    video.muted = this.options.muted !== false;
    video.loop = this.options.loop !== false;
    video.autoplay = this.options.autoplay !== false;
    video.playsInline = true;
    return video;
  }

  setUrl(url) {
    this._url = url;
    if (this._element) this._element.src = url;
    return this;
  }
}

class SVGOverlay extends ImageOverlay {
  constructor(svgElement, bounds, options = {}) {
    super('', bounds, options);
    svgElement.classList.add('rustyleaf-svg-overlay');
    this._element = svgElement;
  }

  _createElement() {
    return this._element;
  }

  setUrl() {
    return this;
  }
}


// ---------- WMS tiles ----------

// TileLayer whose template is a WMS GetMap request; the per-tile bbox is
// substituted by the Rust tile loader via the {bbox-epsg-3857} token.
class WMSTileLayer extends TileLayer {
  constructor(baseUrl, options = {}) {
    const params = {
      service: 'WMS',
      request: 'GetMap',
      layers: options.layers || '',
      styles: options.styles || '',
      format: options.format || 'image/png',
      transparent: options.transparent ? 'true' : 'false',
      version: options.version || '1.1.1',
      width: options.tileSize || 256,
      height: options.tileSize || 256,
    };
    params[params.version === '1.3.0' ? 'crs' : 'srs'] = 'EPSG:3857';
    const sep = baseUrl.includes('?') ? '&' : '?';
    const query = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    super(`${baseUrl}${sep}${query}&bbox={bbox-epsg-3857}`, options);
    this.wmsParams = params;
  }
}

// ---------- GridLayer (programmable DOM tiles) ----------

// Leaflet-style GridLayer: subclass and override createTile(coords) to return
// a DOM element per tile. Tiles are DOM overlays (not GPU textures).
class GridLayer {
  constructor(options = {}) {
    this.options = Object.assign({ tileSize: 256, className: '' }, options);
    this._map = null;
    this._container = null;
    this._tiles = {};
    this._onViewChange = null;
  }

  // Override in subclasses. Return a DOM element for the given {z, x, y}.
  createTile(coords) { // eslint-disable-line no-unused-vars
    return document.createElement('div');
  }

  addTo(map) {
    this._map = map;
    if (!this._container) {
      const c = document.createElement('div');
      c.className = 'rustyleaf-grid-layer' + (this.options.className ? ' ' + this.options.className : '');
      Object.assign(c.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: '350',
      });
      this._container = c;
    }
    if (window.getComputedStyle(map.containerElement).position === 'static') {
      map.containerElement.style.position = 'relative';
    }
    map.containerElement.appendChild(this._container);
    this._update();
    if (!this._onViewChange) {
      this._onViewChange = () => deferCallback(() => this._update());
      map.on('move', this._onViewChange);
      map.on('zoom', this._onViewChange);
      map.on('resize', this._onViewChange);
    }
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }

  _update() {
    if (!this._map || !this._container) return;
    const zoom = Math.round(this._map.getZoom());
    const center = this._map.getCenter();
    const size = this.options.tileSize;
    const scale = size * Math.pow(2, zoom);
    const cx = (center[1] + 180) / 360 * scale;
    const latRad = center[0] * Math.PI / 180;
    const cy = (1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI) / 2 * scale;
    const w = this._map.width || 800;
    const h = this._map.height || 600;
    const topLeftX = cx - w / 2;
    const topLeftY = cy - h / 2;
    const maxTiles = Math.pow(2, zoom);
    const wanted = {};

    for (let tx = Math.floor(topLeftX / size); tx <= Math.floor((topLeftX + w) / size); tx++) {
      for (let ty = Math.floor(topLeftY / size); ty <= Math.floor((topLeftY + h) / size); ty++) {
        if (ty < 0 || ty >= maxTiles) continue;
        const wrappedX = ((tx % maxTiles) + maxTiles) % maxTiles;
        const key = `${zoom}/${tx}/${ty}`;
        wanted[key] = true;
        let tile = this._tiles[key];
        if (!tile) {
          tile = this.createTile({ z: zoom, x: wrappedX, y: ty });
          if (!tile) continue;
          Object.assign(tile.style, { position: 'absolute', width: size + 'px', height: size + 'px' });
          this._tiles[key] = tile;
          this._container.appendChild(tile);
        }
        tile.style.left = Math.round(tx * size - topLeftX) + 'px';
        tile.style.top = Math.round(ty * size - topLeftY) + 'px';
      }
    }

    for (const key of Object.keys(this._tiles)) {
      if (!wanted[key]) {
        const tile = this._tiles[key];
        if (tile.parentNode) tile.parentNode.removeChild(tile);
        delete this._tiles[key];
      }
    }
  }

  remove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._tiles = {};
    if (this._map) {
      if (this._onViewChange) {
        this._map.off('move', this._onViewChange);
        this._map.off('zoom', this._onViewChange);
        this._map.off('resize', this._onViewChange);
        this._onViewChange = null;
      }
      if (this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
    }
    return this;
  }
}

// ---------- Plugin surface (Handler base + Util helpers) ----------

// Leaflet-style Handler: subclass with addHooks/removeHooks, register via
// map.addHandler(name, HandlerClass).
class Handler {
  constructor(map) {
    this._map = map;
    this._enabled = false;
  }

  enable() {
    if (!this._enabled) {
      this._enabled = true;
      this.addHooks();
    }
    return this;
  }

  disable() {
    if (this._enabled) {
      this._enabled = false;
      this.removeHooks();
    }
    return this;
  }

  enabled() {
    return this._enabled;
  }

  addHooks() {}
  removeHooks() {}
}

const Util = {
  _lastId: 0,

  extend(dest, ...sources) {
    for (const src of sources) {
      for (const key in src) dest[key] = src[key];
    }
    return dest;
  },

  stamp(obj) {
    if (!obj._rustyleaf_id) {
      Util._lastId += 1;
      Object.defineProperty(obj, '_rustyleaf_id', {
        value: Util._lastId,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
    return obj._rustyleaf_id;
  },

  throttle(fn, time, context) {
    let lock = false;
    let pendingArgs = null;
    const later = () => {
      lock = false;
      if (pendingArgs) {
        const args = pendingArgs;
        pendingArgs = null;
        wrapped.apply(context, args);
      }
    };
    function wrapped(...args) {
      if (lock) {
        pendingArgs = args;
      } else {
        fn.apply(context, args);
        lock = true;
        setTimeout(later, time);
      }
    }
    return wrapped;
  },

  wrapNum(x, range, includeMax) {
    const max = range[1];
    const min = range[0];
    const d = max - min;
    return x === max && includeMax ? x : ((x - min) % d + d) % d + min;
  },

  falseFn() {
    return false;
  },

  formatNum(num, digits) {
    const pow = Math.pow(10, digits === undefined ? 6 : digits);
    return Math.round(num * pow) / pow;
  },

  setOptions(obj, options) {
    obj.options = Object.assign({}, obj.options, options);
    return obj.options;
  },

  template(str, data) {
    return str.replace(/\{ *([\w_ -]+) *\}/g, (match, key) => {
      let value = data[key];
      if (value === undefined) throw new Error('No value provided for variable ' + match);
      if (typeof value === 'function') value = value(data);
      return value;
    });
  },
};


// ---------- Exports ----------

module.exports = {
  Map: Map, TileLayer: TileLayer, PointLayer: PointLayer, LineLayer: LineLayer,
  PolygonLayer: PolygonLayer, GeoJSONLayer: GeoJSONLayer, Popup: Popup,
  Marker: Marker, Icon: Icon, DivIcon: DivIcon, Tooltip: Tooltip,
  Control: Control, ZoomControl: ZoomControl, AttributionControl: AttributionControl, ScaleControl: ScaleControl,
  LayersControl: LayersControl,
  Circle: Circle, CircleMarker: CircleMarker, Rectangle: Rectangle,
  LayerGroup: LayerGroup, FeatureGroup: FeatureGroup,
  ImageOverlay: ImageOverlay, VideoOverlay: VideoOverlay, SVGOverlay: SVGOverlay,
  WMSTileLayer: WMSTileLayer, GridLayer: GridLayer, Handler: Handler, Util: Util,
  checkWebGLSupport: checkWebGLSupport
};
