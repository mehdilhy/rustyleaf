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
    this.canvas.id = 'rustyleaf-map-canvas';
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
  }

  setView(latlng, zoom) {
    validateLatLng(latlng);
    this._center = latlng; this._zoom = zoom;
    this.wasmMap.set_view(latlng[0], latlng[1], zoom);
    return this;
  }
  getCenter() { return this._center; }
  getZoom() { return this._zoom; }
  zoomIn() { this._zoom = Math.min(18, this._zoom + 1); this.wasmMap.zoom_in(); return this; }
  zoomOut() { this._zoom = Math.max(1, this._zoom - 1); this.wasmMap.zoom_out(); return this; }
  panBy(dx, dy) { this.wasmMap.pan(dx, dy); return this; }
  getBounds() { return [[48.8, 2.2], [48.9, 2.5]]; }
  fitBounds(bounds) { return this; }
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
    this.wasmTileLayer = new wasm.TileLayerApi();
  }
  addTo(map) { this.wasmTileLayer.add_to(map.wasmMap); return this; }
  remove() { return this; }
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
    var layerIndex = map.wasmMap.add_point_layer();
    map.wasmMap.add_points(layerIndex, this.points);
    return this;
  }
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }
  remove() { return this; }
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
    var layerIndex = map.wasmMap.add_line_layer();
    map.wasmMap.add_lines(layerIndex, this.lines);
    this.map = map;
    return this;
  }
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }
  remove() { return this; }
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
    var layerIndex = map.wasmMap.add_polygon_layer();
    map.wasmMap.add_polygons(layerIndex, this.polygons);
    this.map = map;
    return this;
  }
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }
  remove() { return this; }
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
    this.map = map;
    map.wasmMap.add_geojson_layer();
    if (typeof map._geojsonLayerCount !== 'number') {
      map._geojsonLayerCount = 0;
    }
    this.layerIndex = map._geojsonLayerCount;
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
      var geojsonString = typeof this.geojson === 'string'
        ? this.geojson
        : JSON.stringify(this.geojson);
      map.wasmMap.load_geojson(this.layerIndex, geojsonString);
      this.updateStyle();
    }

    return this;
  }

  // Event handlers
  on(event, callback) {
    if (event === 'click') this.clickCallback = callback;
    else if (event === 'hover') this.hoverCallback = callback;
    return this;
  }

  // Remove layer from map
  remove() {
    if (this.map) {
      this.map = null;
    }
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
    return this;
  }
  close() {
    if (!this.isOpen) return this;
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.isOpen = false;
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

// ---------- Exports ----------

module.exports = {
  Map: Map, TileLayer: TileLayer, PointLayer: PointLayer, LineLayer: LineLayer,
  PolygonLayer: PolygonLayer, GeoJSONLayer: GeoJSONLayer, Popup: Popup,
  checkWebGLSupport: checkWebGLSupport
};
