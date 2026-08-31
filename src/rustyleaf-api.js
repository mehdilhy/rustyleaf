// JavaScript wrapper for Rustyleaf WASM library
// Provides Leaflet-style API as specified in specs.md

// Import low-level WASM bindings and module namespace; we'll initialize manually via fetch
import { RustyleafMap, TileLayerApi, PointLayerApi } from '../dist/rustyleaf_core_bg.js';
import * as __rustyleaf_wasm_bg from '../dist/rustyleaf_core_bg.js';

// True when the WASM instance is already wired into the bg glue module.
// Webpack (asyncWebAssembly) instantiates the wasm before this module evaluates,
// so the manual fetch below is only needed when loading these sources as plain ESM.
/* istanbul ignore next -- runs once at module evaluation; not reachable from tests */
function __rustyleafWasmAlreadyInitialized() {
  try {
    const probe = new RustyleafMap(1, 1);
    if (typeof probe.free === 'function') probe.free();
    return true;
  } catch (e) {
    return false;
  }
}

// Ensure WASM is initialized before any usage
let __rustyleaf_wasm_ready_promise;
/* istanbul ignore next -- module-evaluation bootstrap; not reachable from tests */
async function __ensureRustyleafWasmReady() {
  if (!__rustyleaf_wasm_ready_promise) {
    __rustyleaf_wasm_ready_promise = (async () => {
      if (__rustyleafWasmAlreadyInitialized()) {
        return;
      }
      // Fetch and instantiate the wasm. The `new URL(..., import.meta.url)`
      // literal lets bundlers (webpack asset/resource, Vite) track and emit the
      // .wasm file as an asset resolved relative to the deployed bundle.
      const wasmUrl = new URL('../dist/rustyleaf_core_bg.wasm', import.meta.url);
      let lastError = null;
      try {
        const resp = await fetch(wasmUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${wasmUrl}`);
        let instance;
        if (WebAssembly.instantiateStreaming) {
          ({ instance } = await WebAssembly.instantiateStreaming(resp, { './rustyleaf_core_bg.js': __rustyleaf_wasm_bg }));
        } else {
          const bytes = await resp.arrayBuffer();
          ({ instance } = await WebAssembly.instantiate(bytes, { './rustyleaf_core_bg.js': __rustyleaf_wasm_bg }));
        }
        __rustyleaf_wasm_bg.__wbg_set_wasm(instance.exports);
        if (instance.exports && typeof instance.exports.__wbindgen_start === 'function') {
          instance.exports.__wbindgen_start();
        }
        return;
      } catch (e) {
        lastError = e;
      }
      console.error('Failed to initialize Rustyleaf WASM:', lastError);
      throw lastError;
    })();
  }
  return __rustyleaf_wasm_ready_promise;
}

// Block module evaluation until WASM is ready
await __ensureRustyleafWasmReady();

// WebGL support check utility
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

// Map class with Leaflet-style API
class Map {
  constructor(container, options = {}) {
    // Handle container parameter
    if (typeof container === 'string') {
      this.containerElement = document.getElementById(container);
    } else {
      this.containerElement = container;
    }

    // Get container dimensions
    const rect = this.containerElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    // Create canvas element. The id must be unique per instance: the WASM
    // core looks the canvas up by id, so a shared id makes every map render
    // into the first canvas in the document.
    this.canvas = document.createElement('canvas');
    Map._instanceCounter = (Map._instanceCounter || 0) + 1;
    this.canvas.id = `rustyleaf-map-canvas-${Map._instanceCounter}`;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    // Replace container content with canvas
    this.containerElement.innerHTML = '';
    this.containerElement.appendChild(this.canvas);

    // Context loss recovery
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      console.warn('Rustyleaf: WebGL context lost. Attempting recovery...');
      if (this.wasmMap && this.wasmMap.handle_context_lost) {
        this.wasmMap.handle_context_lost();
      }
      this._needsRestore = true;
      this._stopRenderLoop();
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.log('Rustyleaf: WebGL context restored. Reinitializing...');
      if (this.wasmMap && this.wasmMap.handle_context_restored) {
        this.wasmMap.init_canvas(this.canvas.id);
        this.wasmMap.handle_context_restored();
      }
      this._needsRestore = false;
      this._startRenderLoop();
    });

    // Check WebGL compatibility before initializing
    const webglSupport = checkWebGLSupport();
    this.webglSupport = webglSupport;

    if (!webglSupport.supported) {
      console.error('Rustyleaf: WebGL not supported. Map cannot be initialized.', webglSupport);
      this.containerElement.innerHTML = `
        <div style="padding: 20px; text-align: center; background: #ffebee; color: #c62828; border-radius: 4px;">
          <h3>⚠️ WebGL Not Supported</h3>
          <p>Rustyleaf requires WebGL to function. Please use a modern browser with WebGL enabled.</p>
          <p><small>Support level: ${webglSupport.level}</small></p>
          ${webglSupport.error ? `<p><small>Error: ${webglSupport.error}</small></p>` : ''}
        </div>
      `;
      throw new Error('WebGL not supported');
    }

    if (webglSupport.level === 'limited') {
      console.warn('Rustyleaf: WebGL2 not available, falling back to WebGL1. Some features may be limited.');
    }

    // Initialize WASM map
    this.wasmMap = new RustyleafMap(this.width, this.height);
    try {
      this.wasmMap.init_canvas(this.canvas.id);
    } catch (error) {
      console.error('Rustyleaf: Failed to initialize WebGL context:', error);
      this.containerElement.innerHTML = `
        <div style="padding: 20px; text-align: center; background: #ffebee; color: #c62828; border-radius: 4px;">
          <h3>⚠️ WebGL Initialization Failed</h3>
          <p>Failed to initialize WebGL context: ${error.message}</p>
          <p>Please check your browser settings and ensure WebGL is enabled.</p>
        </div>
      `;
      throw error;
    }

    // Set initial view
    const center = options.center || [48.8566, 2.3522]; // Paris by default
    const zoom = options.zoom || 12;

    // Validate center coordinates
    if (!Array.isArray(center) || center.length !== 2 ||
        typeof center[0] !== 'number' || typeof center[1] !== 'number' ||
        isNaN(center[0]) || isNaN(center[1]) ||
        center[0] < -90 || center[0] > 90 ||
        center[1] < -180 || center[1] > 180) {
      throw new Error('Invalid center coordinates: must be [lat, lng] with lat ∈ [-90, 90] and lng ∈ [-180, 180]');
    }

    // Validate zoom level
    if (typeof zoom !== 'number' || isNaN(zoom) || zoom < 0 || zoom > 24) {
      throw new Error('Invalid zoom level: must be a number between 0 and 24');
    }

    this.wasmMap.set_view(center[0], center[1], zoom);

    // Set up event handlers
    this._setupEventHandlers();

    // Derived Leaflet-style events (movestart/moveend, zoomstart/zoomend)
    this._setupDerivedEvents();

    // Marker interactivity (click/hover/mouseover/mouseout + popup auto-open)
    this._markerRegistry = [];
    this._hoveredMarker = null;
    this._setupMarkerInteractivity();

    // Start render loop
    this._startRenderLoop();

    // Track GeoJSON layer indices locally since WASM add_geojson_layer doesn't return an index
    this._geojsonLayerCount = 0;

    // DOM-overlay UI controls (zoom/attribution/scale/etc.)
    this._controls = [];

    // Layers currently attached to this map (drives layeradd/layerremove)
    this._attachedLayers = new Set();

    // Constructor options, kept for handlers/plugins (map.addHandler)
    this.options = options;
  }

  // Leaflet-style plugin hook: instantiates HandlerClass(map), exposes it as
  // map[name], and enables it when the constructor option of the same name
  // is truthy.
  addHandler(name, HandlerClass) {
    const handler = new HandlerClass(this);
    this[name] = handler;
    if (this.options && this.options[name]) handler.enable();
    return this;
  }

  // Synthesize movestart/moveend and zoomstart/zoomend around the core's
  // continuous move/zoom streams: the first event in a burst fires *start,
  // and *end fires once the stream has been quiet for 150ms.
  _setupDerivedEvents() {
    const burst = (startEvent, endEvent) => {
      let active = false;
      let timer = null;
      return (e) => {
        if (!active) {
          active = true;
          deferCallback(() => this._fireLocalEvent(startEvent, e));
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          active = false;
          this._fireLocalEvent(endEvent, e);
        }, 150);
      };
    };
    this.wasmMap.on_move(burst('movestart', 'moveend'));
    this.wasmMap.on_zoom(burst('zoomstart', 'zoomend'));
  }

  // ---- Leaflet-style layer management (fires layeradd/layerremove) ----

  addLayer(layer) {
    layer.addTo(this);
    return this;
  }

  removeLayer(layer) {
    layer.remove();
    return this;
  }

  hasLayer(layer) {
    return !!(this._attachedLayers && this._attachedLayers.has(layer));
  }

  // Called by layers from addTo/remove. Deduplicated, so re-showing an
  // already-attached layer does not re-fire layeradd.
  _notifyLayerAdd(layer) {
    if (!this._attachedLayers) this._attachedLayers = new Set();
    if (!this._attachedLayers.has(layer)) {
      this._attachedLayers.add(layer);
      this._fireLocalEvent('layeradd', { type: 'layeradd', layer });
    }
  }

  _notifyLayerRemove(layer) {
    if (this._attachedLayers && this._attachedLayers.delete(layer)) {
      this._fireLocalEvent('layerremove', { type: 'layerremove', layer });
    }
  }

  setView(latlng, zoom) {
    // Validate center coordinates
    if (!Array.isArray(latlng) || latlng.length !== 2 ||
        typeof latlng[0] !== 'number' || typeof latlng[1] !== 'number' ||
        isNaN(latlng[0]) || isNaN(latlng[1]) ||
        latlng[0] < -90 || latlng[0] > 90 ||
        latlng[1] < -180 || latlng[1] > 180) {
      throw new Error('Invalid center coordinates: must be [lat, lng] with lat ∈ [-90, 90] and lng ∈ [-180, 180]');
    }

    // Validate zoom level
    if (typeof zoom !== 'number' || isNaN(zoom) || zoom < 0 || zoom > 24) {
      throw new Error('Invalid zoom level: must be a number between 0 and 24');
    }

    latlng = this._clampToMaxBounds(latlng);
    this.wasmMap.set_view(latlng[0], latlng[1], zoom);
    return this;
  }
  
  // Leaflet signature: panBy(offset) where offset is a Point/[x, y] array.
  // (dx, dy) as two numbers is also accepted for convenience.
  panBy(dxOrOffset, dy) {
    let dx = dxOrOffset;
    if (Array.isArray(dxOrOffset) || (dxOrOffset && typeof dxOrOffset === 'object' && 'x' in dxOrOffset)) {
      dx = dxOrOffset.x !== undefined ? dxOrOffset.x : dxOrOffset[0];
      dy = dxOrOffset.y !== undefined ? dxOrOffset.y : dxOrOffset[1];
    }
    this.wasmMap.pan(Number(dx) || 0, Number(dy) || 0);
    return this;
  }
  
  zoomIn(delta) {
    const n = Math.max(1, Math.round(delta === undefined ? 1 : delta));
    for (let i = 0; i < n; i++) this.wasmMap.zoom_in();
    return this;
  }

  zoomOut(delta) {
    const n = Math.max(1, Math.round(delta === undefined ? 1 : delta));
    for (let i = 0; i < n; i++) this.wasmMap.zoom_out();
    return this;
  }

  // Leaflet-style setters -------------------------------------------------

  setZoom(zoom) {
    return this.setView(this.getCenter(), zoom);
  }

  panTo(center) {
    return this.setView(center, this.getZoom());
  }

  // Great-circle distance in meters (haversine, R = 6371000 like Leaflet).
  distance(latlng1, latlng2) {
    const rad = Math.PI / 180;
    const dLat = (latlng2[0] - latlng1[0]) * rad;
    const dLng = (latlng2[1] - latlng1[1]) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(latlng1[0] * rad) * Math.cos(latlng2[0] * rad)
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  containerPointToLatLng(point) {
    const p = Array.isArray(point) ? point : [point.x, point.y];
    return this.unproject(p);
  }

  latLngToContainerPoint(latlng) {
    const p = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
    return this.project(p);
  }

  closePopup() {
    if (this._activePopup && typeof this._activePopup.close === 'function') {
      this._activePopup.close();
    }
    return this;
  }

  closeTooltip() {
    if (this._activeTooltip && typeof this._activeTooltip.close === 'function') {
      this._activeTooltip.close();
    }
    return this;
  }

  eachLayer(fn) {
    if (this._attachedLayers) {
      for (const layer of Array.from(this._attachedLayers)) fn(layer);
    }
    return this;
  }

  
  // Get WebGL support information
  getWebGLSupport() {
    return this.webglSupport;
  }
  
  getCenter() {
    const center = this.wasmMap.get_center();
    return [center[0], center[1]];
  }
  
  getZoom() {
    return this.wasmMap.get_zoom();
  }
  
  setMinZoom(minZoom) {
    this.wasmMap.set_min_zoom(minZoom);
    return this;
  }
  
  setMaxZoom(maxZoom) {
    this.wasmMap.set_max_zoom(maxZoom);
    return this;
  }
  
  getBounds() {
    const bounds = this.wasmMap.get_bounds();
    return [
      [bounds[0], bounds[1]], // Southwest
      [bounds[2], bounds[3]]  // Northeast
    ];
  }
  
  fitBounds(bounds) {
    // Convert bounds array to flat array for WASM
    const flatBounds = [
      bounds[0][0], bounds[0][1], // sw_lat, sw_lng
      bounds[1][0], bounds[1][1]  // ne_lat, ne_lng
    ];
    this.wasmMap.fit_bounds(flatBounds);
    return this;
  }

  // Animated pan+zoom to a target view. Leaflet signature:
  // flyTo(latlng, zoom?, options?) — a numeric second arg is the target zoom;
  // an options object as the second arg is also accepted (rustyleaf legacy).
  flyTo(latlng, zoomOrOptions, options = {}) {
    let opts;
    if (typeof zoomOrOptions === 'number') {
      opts = { zoom: zoomOrOptions, ...options };
    } else if (zoomOrOptions && typeof zoomOrOptions === 'object') {
      opts = zoomOrOptions;
    } else {
      opts = {};
    }
    const duration = opts.duration !== undefined ? opts.duration : 400;
    const from = this.getCenter();
    const fromZoom = this.getZoom();
    const targetZoom = opts.zoom !== undefined ? opts.zoom : fromZoom;
    if (this._flyTimer) {
      clearInterval(this._flyTimer);
      this._flyTimer = null;
    }
    if (duration <= 0) return this.setView(latlng, targetZoom);
    const start = Date.now();
    this._flyTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.setView(
        [from[0] + (latlng[0] - from[0]) * ease, from[1] + (latlng[1] - from[1]) * ease],
        fromZoom + (targetZoom - fromZoom) * ease
      );
      if (t >= 1) {
        clearInterval(this._flyTimer);
        this._flyTimer = null;
      }
    }, 16);
    return this;
  }

  flyToBounds(bounds, options) {
    this.fitBounds(bounds);
    return this;
  }

  setMaxBounds(bounds) {
    this._maxBounds = bounds || null;
    if (this._maxBounds) this.setView(this.getCenter(), this.getZoom());
    return this;
  }

  getMaxBounds() {
    return this._maxBounds || null;
  }

  _clampToMaxBounds(latlng) {
    if (!this._maxBounds) return latlng;
    const sw = this._maxBounds[0], ne = this._maxBounds[1];
    const minLat = Math.min(sw[0], ne[0]), maxLat = Math.max(sw[0], ne[0]);
    const minLng = Math.min(sw[1], ne[1]), maxLng = Math.max(sw[1], ne[1]);
    return [
      Math.min(Math.max(latlng[0], minLat), maxLat),
      Math.min(Math.max(latlng[1], minLng), maxLng)
    ];
  }

  // Re-read the container size and resize the WASM viewport (Leaflet-style invalidateSize).
  invalidateSize() {
    this._handleResize();
    return this;
  }

  // Browser geolocation. Fires 'locationfound' / 'locationerror' (registered via map.on).
  locate(options = {}) {
    const geo = (typeof navigator !== 'undefined' && navigator.geolocation) ? navigator.geolocation : null;
    if (!geo) {
      this._fireLocalEvent('locationerror', { code: 0, message: 'Geolocation is not available' });
      return this;
    }
    const onSuccess = (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      if (options.setView) {
        const zoom = options.maxZoom !== undefined ? Math.min(this.getZoom(), options.maxZoom) : this.getZoom();
        this.setView(latlng, zoom);
      }
      this._fireLocalEvent('locationfound', { latlng, accuracy: pos.coords.accuracy });
    };
    const onError = (err) => {
      this._fireLocalEvent('locationerror', { code: err.code, message: err.message });
    };
    const geoOptions = {
      enableHighAccuracy: !!options.enableHighAccuracy,
      timeout: options.timeout !== undefined ? options.timeout : 10000,
      maximumAge: options.maximumAge || 0
    };
    if (options.watch) this._locateWatchId = geo.watchPosition(onSuccess, onError, geoOptions);
    else geo.getCurrentPosition(onSuccess, onError, geoOptions);
    return this;
  }

  stopLocate() {
    if (this._locateWatchId !== undefined && this._locateWatchId !== null) {
      const geo = (typeof navigator !== 'undefined' && navigator.geolocation) ? navigator.geolocation : null;
      if (geo) geo.clearWatch(this._locateWatchId);
      this._locateWatchId = null;
    }
    return this;
  }

  _fireLocalEvent(event, data) {
    const handlers = (this._localEvents && this._localEvents[event]) || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (e) {
        console.error(`Rustyleaf: error in '${event}' handler:`, e);
      }
    }
  }

  project(latlng) {
    const point = this.wasmMap.project(latlng);
    return [point[0], point[1]];
  }
  
  unproject(point) {
    const latlng = this.wasmMap.unproject(point);
    return [latlng[0], latlng[1]];
  }
  
  static _WASM_EVENT_MAP = {
    'move': 'on_move',
    'zoom': 'on_zoom',
    'click': 'on_click',
    'hover': 'on_hover',
    'mousedown': 'on_mouse_down',
    'mouseup': 'on_mouse_up',
    'contextmenu': 'on_contextmenu',
    'keydown': 'on_key_down',
    'keyup': 'on_key_up',
    'dragend': 'on_dragend'
  };

  static _WASM_OFF_MAP = {
    'move': 'off_move',
    'zoom': 'off_zoom',
    'click': 'off_click',
    'hover': 'off_hover',
    'mousedown': 'off_mouse_down',
    'mouseup': 'off_mouse_up',
    'contextmenu': 'off_contextmenu',
    'keydown': 'off_key_down',
    'keyup': 'off_key_up',
    'dragend': 'off_dragend'
  };

  _listenerEntry(event, callback) {
    if (!this._listeners || !this._listeners[event]) return null;
    return this._listeners[event].find((e) => e.callback === callback) || null;
  }

  on(event, callback, context) {
    if (typeof callback !== 'function') return this;
    this._listeners = this._listeners || {};
    this._localEvents = this._localEvents || {};

    const wasmMethod = Map._WASM_EVENT_MAP[event];
    const isWasmEvent = wasmMethod && typeof this.wasmMap[wasmMethod] === 'function';

    if (isWasmEvent) {
      // WASM events fire while the Rust map is mutably borrowed; any handler
      // that calls back into the map would hit a RefCell borrow conflict and
      // abort the callback chain. Defer every wasm-event listener to a
      // microtask so handlers can safely use the map API (Leaflet handlers
      // stay synchronous — only the dispatch boundary is async here).
      const wrapped = (ev) => deferCallback(() => callback.apply(context || this, [ev]));
      (this._listeners[event] = this._listeners[event] || []).push({ callback, wrapped });
      this.wasmMap[wasmMethod](wrapped);
    } else {
      const wrapped = (ev) => callback.apply(context || this, [ev]);
      (this._listeners[event] = this._listeners[event] || []).push({ callback, wrapped });
      // JS-side events (e.g. 'locationfound', 'resize', 'load', 'drag*')
      this._localEvents[event] = this._localEvents[event] || [];
      this._localEvents[event].push(wrapped);
    }
    return this;
  }

  once(event, callback, context) {
    if (typeof callback !== 'function') return this;
    // Wasm-event dispatch is deferred (microtask), so two events can queue
    // two invocations before the first one unregisters — guard with a flag.
    let done = false;
    let wrapper;
    wrapper = (ev) => {
      if (done) return undefined;
      done = true;
      this.off(event, wrapper);
      return callback.apply(context || this, [ev]);
    };
    return this.on(event, wrapper);
  }

  off(event, callback) {
    const offMethod = Map._WASM_OFF_MAP[event];
    const hasWasm = offMethod && typeof this.wasmMap[offMethod] === 'function';
    this._listeners = this._listeners || {};
    this._localEvents = this._localEvents || {};

    if (typeof callback === 'function') {
      const entry = this._listenerEntry(event, callback);
      const target = entry ? entry.wrapped : callback;
      if (hasWasm) this.wasmMap[offMethod](target);
      if (this._localEvents[event]) {
        this._localEvents[event] = this._localEvents[event].filter((cb) => cb !== target);
      }
      if (entry) {
        this._listeners[event] = this._listeners[event].filter((e) => e !== entry);
      }
    } else {
      // Leaflet semantics: off(type) removes ALL listeners for that type.
      if (this._listeners[event]) {
        if (hasWasm) {
          for (const entry of this._listeners[event]) {
            this.wasmMap[offMethod](entry.wrapped);
          }
        }
        this._listeners[event] = [];
      }
      this._localEvents[event] = [];
    }
    return this;
  }

  _setupEventHandlers() {
    let isDragging = false;
    let dragStartX, dragStartY;
    let hasDragged = false;

    // Set initial cursor style
    this.canvas.style.cursor = 'grab';

    // Prevent text selection during drag
    const preventSelection = (e) => {
      if (isDragging) {
        e.preventDefault();
        return false;
      }
    };

    // Add global mouse event listeners for better drag handling
    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        if (!hasDragged) this._fireLocalEvent('dragstart', { type: 'dragstart' });
        else this._fireLocalEvent('drag', { type: 'drag' });
        hasDragged = true;
        // Convert screen coordinates to canvas coordinates (accounting for scaling)
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        this.wasmMap.on_mouse_move(canvasX, canvasY);
      }
    };

    const handleGlobalMouseUp = (e) => {
      if (isDragging) {
        isDragging = false;
        this.canvas.style.cursor = 'grab';
        document.removeEventListener('selectstart', preventSelection);
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);

        // Convert screen coordinates to canvas coordinates (accounting for scaling)
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        // Always trigger mouse up with proper coordinates
        this.wasmMap.handle_mouse_up(canvasX, canvasY);
      }
    };

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && e.shiftKey) { // Shift-drag = box zoom
        e.preventDefault();
        this._startBoxZoom(e);
        return;
      }
      if (e.button === 0) { // Left mouse button only
        // Convert screen coordinates to canvas coordinates (accounting for scaling)
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        dragStartX = (e.clientX - rect.left) * scaleX;
        dragStartY = (e.clientY - rect.top) * scaleY;

        // Draggable markers take precedence over map panning.
        const hitMarker = this._topmostMarkerAt(dragStartX, dragStartY);
        if (hitMarker && typeof hitMarker.isDraggable === 'function' && hitMarker.isDraggable()) {
          this.canvas.style.cursor = 'move';
          document.addEventListener('selectstart', preventSelection);
          hitMarker.fire('dragstart', { type: 'dragstart', target: hitMarker, latlng: hitMarker.getLatLng() });
          const markerMove = (ev) => {
            const r2 = this.canvas.getBoundingClientRect();
            const cx2 = (ev.clientX - r2.left) * (this.canvas.width / r2.width);
            const cy2 = (ev.clientY - r2.top) * (this.canvas.height / r2.height);
            const ll = this.containerPointToLatLng([cx2, cy2]);
            if (ll && isFinite(ll[0]) && isFinite(ll[1])) {
              hitMarker.setLatLng(ll);
              hitMarker.fire('drag', { type: 'drag', target: hitMarker, latlng: ll });
            }
          };
          const markerUp = () => {
            document.removeEventListener('mousemove', markerMove);
            document.removeEventListener('mouseup', markerUp);
            this.canvas.style.cursor = 'grab';
            hitMarker.fire('dragend', { type: 'dragend', target: hitMarker, latlng: hitMarker.getLatLng() });
          };
          document.addEventListener('mousemove', markerMove);
          document.addEventListener('mouseup', markerUp);
          return;
        }

        isDragging = true;
        hasDragged = false;
        this.canvas.style.cursor = 'move';

        // Prevent text selection during drag
        document.addEventListener('selectstart', preventSelection);

        // Add global listeners for smooth dragging
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);

        this.wasmMap.handle_mouse_down(dragStartX, dragStartY);
      }
    });

    // Hover cursor feedback
    this.canvas.addEventListener('mouseenter', () => {
      if (!isDragging) {
        this.canvas.style.cursor = 'grab';
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (!isDragging) {
        this.canvas.style.cursor = 'default';
      }
    });

    // Hover hit-testing (throttled to one hit-test per frame)
    let hoverPending = false;
    this.canvas.addEventListener('mousemove', (e) => {
      if (isDragging || hoverPending || !this.wasmMap.handle_mouse_hover) return;
      hoverPending = true;
      requestAnimationFrame(() => {
        hoverPending = false;
        if (isDragging || this._destroyed) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        this._updateMarkerHover(canvasX, canvasY);
        this.wasmMap.handle_mouse_hover(canvasX, canvasY);
      });
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wasmMap.on_wheel(e.deltaY, e.clientX, e.clientY);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.wasmMap.handle_contextmenu(e.clientX, e.clientY);
    });

    this._resizeHandler = () => {
      this._handleResize();
    };
    window.addEventListener('resize', this._resizeHandler);

    this._setupKeyboardHandlers();
    this._setupTouchHandlers();
  }

  // --- Marker interactivity ---
  // Markers are GPU sprites with no DOM node, so hit-testing runs here in the
  // wrapper: clicks reuse the map-level click event, hovers use mousemove.

  _registerMarker(marker) {
    this._markerRegistry.push(marker);
  }

  _unregisterMarker(marker) {
    const i = this._markerRegistry.indexOf(marker);
    if (i !== -1) this._markerRegistry.splice(i, 1);
    if (this._hoveredMarker === marker) this._hoveredMarker = null;
  }

  _topmostMarkerAt(x, y) {
    let best = null;
    for (let i = this._markerRegistry.length - 1; i >= 0; i--) {
      const m = this._markerRegistry[i];
      if (!m || !m.getLatLng) continue;
      if ((m.getOpacity !== undefined ? m.getOpacity() : 1) <= 0.01) continue;
      const [lat, lng] = m.getLatLng();
      const sp = this.wasmMap.screen_xy(lat, lng);
      const dx = x - sp[0];
      const dy = y - sp[1];
      const radius = Math.max((m._size || 14) / 2 + 4, 10);
      if (dx * dx + dy * dy <= radius * radius) {
        if (!best || (m.getZIndexOffset ? m.getZIndexOffset() : 0) > (best.getZIndexOffset ? best.getZIndexOffset() : 0)) {
          best = m;
        }
      }
    }
    return best;
  }

  _setupMarkerInteractivity() {
    this.on('click', (e) => {
      const cp = e && e.containerPoint;
      if (!cp || cp.length < 2) return;
      const marker = this._topmostMarkerAt(cp[0], cp[1]);
      if (!marker) return;
      marker.fire('click', { type: 'click', latlng: e.latlng, containerPoint: cp, target: marker });
      // Leaflet default: a bound popup opens when its marker is clicked —
      // and must survive this same click's autoClose pass.
      if ((marker._popup || marker._popupContent) && !marker.isPopupOpen()) {
        marker.openPopup();
        const popup = marker.getPopup();
        if (popup) popup._skipAutoCloseOnce = true;
      }
    });
  }

  _updateMarkerHover(x, y) {
    const marker = this._topmostMarkerAt(x, y);
    if (marker === this._hoveredMarker) return;
    if (this._hoveredMarker) {
      this._hoveredMarker.fire('mouseout', { type: 'mouseout', target: this._hoveredMarker });
    }
    if (marker) {
      marker.fire('mouseover', { type: 'mouseover', target: marker });
    }
    this._hoveredMarker = marker;
  }

  // Arrow keys pan, +/- zoom (canvas is focusable; click it first)
  _setupKeyboardHandlers() {
    this.canvas.tabIndex = 0;
    this.canvas.style.outline = 'none';
    const PAN_PX = 60;
    this.canvas.addEventListener('keydown', (e) => {
      switch (e.key) {
      case 'ArrowUp': this.panBy(0, -PAN_PX); break;
      case 'ArrowDown': this.panBy(0, PAN_PX); break;
      case 'ArrowLeft': this.panBy(-PAN_PX, 0); break;
      case 'ArrowRight': this.panBy(PAN_PX, 0); break;
      case '+': case '=': this.zoomIn(); break;
      case '-': case '_': this.zoomOut(); break;
      default: return;
      }
      e.preventDefault();
    });
  }

  // One-finger pan reuses the wasm mouse-drag pipeline (incl. momentum);
  // two-finger pinch reuses the wheel-zoom pipeline anchored at the midpoint.
  // Double-tap zooms in one level at the tap point; tap-hold (~500ms) fires
  // the contextmenu pipeline, mirroring Leaflet's mobile gesture handling.
  _setupTouchHandlers() {
    let touchMode = null; // 'pan' | 'pinch'
    let lastDist = 0;

    // Double-tap + long-press state
    let tapStart = null;      // { x, y, time } of current one-finger touch
    let lastTap = null;       // { x, y, time } of previous completed quick tap
    let longPressTimer = null;
    let longPressFired = false;
    const LONG_PRESS_MS = 500;
    const DOUBLE_TAP_MS = 300;
    const MOVE_SLOP_PX = 12;   // CSS px before a press counts as a drag
    const TAP_MAX_MS = 250;    // quicker than this = tap, not long press

    const canvasPoint = (t) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return [(t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY];
    };
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    // Helpers for double-tap / long-press
    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };
    // CSS-pixel distance between two touch positions (for tap-move slop)
    const cssPoint = (t) => {
      const rect = this.canvas.getBoundingClientRect();
      return [t.clientX - rect.left, t.clientY - rect.top];
    };

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchMode = 'pan';
        longPressFired = false;
        const [x, y] = canvasPoint(e.touches[0]);
        this.wasmMap.handle_mouse_down(x, y);

        // Arm long-press contextmenu (cancelled by movement, pinch, or lift)
        const t = e.touches[0];
        tapStart = { x: t.clientX, y: t.clientY, time: performance.now() };
        clearLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (touchMode !== 'pan' || this._destroyed) return;
          longPressFired = true;
          const [cx, cy] = canvasPoint(t);
          this.wasmMap.handle_contextmenu(cx, cy);
        }, LONG_PRESS_MS);
      } else if (e.touches.length === 2) {
        clearLongPress();
        if (touchMode === 'pan') {
          const [x, y] = canvasPoint(e.touches[0]);
          this.wasmMap.handle_mouse_up(x, y);
        }
        touchMode = 'pinch';
        lastDist = dist(e.touches[0], e.touches[1]);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (touchMode === 'pan' && e.touches.length === 1) {
        // Cancel long-press once the finger moves beyond the tap slop
        if (longPressTimer !== null && tapStart) {
          const [sx, sy] = cssPoint(e.touches[0]);
          if (Math.hypot(sx - tapStart.x, sy - tapStart.y) > MOVE_SLOP_PX) {
            clearLongPress();
          }
        }
        const [x, y] = canvasPoint(e.touches[0]);
        this.wasmMap.on_mouse_move(x, y);
      } else if (touchMode === 'pinch' && e.touches.length === 2) {
        const d = dist(e.touches[0], e.touches[1]);
        if (lastDist > 0 && d > 0) {
          // Map the scale ratio onto the wheel-zoom pipeline: spread = zoom in
          const deltaY = -(d / lastDist - 1) * 600;
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          this.wasmMap.on_wheel(deltaY, midX, midY);
        }
        lastDist = d;
      }
    }, { passive: false });

    const endTouch = (e) => {
      e.preventDefault();
      if (touchMode === 'pan' && e.changedTouches.length > 0) {
        const [x, y] = canvasPoint(e.changedTouches[0]);
        this.wasmMap.handle_mouse_up(x, y);

        // Double-tap detection on a quick tap that stayed within slop
        if (e.type === 'touchend') {
          clearLongPress();
          const t = e.changedTouches[0];
          const now = performance.now();
          const [sx, sy] = cssPoint(t);
          if (!longPressFired && tapStart &&
              Math.hypot(sx - tapStart.x, sy - tapStart.y) <= MOVE_SLOP_PX &&
              now - tapStart.time <= TAP_MAX_MS) {
            if (lastTap &&
                now - lastTap.time <= DOUBLE_TAP_MS &&
                Math.hypot(sx - lastTap.x, sy - lastTap.y) <= MOVE_SLOP_PX) {
              // Double tap → zoom in one level at the tap point
              this.wasmMap.on_wheel(-1, x, y);
              lastTap = null;
            } else {
              lastTap = { x: sx, y: sy, time: now };
            }
          } else {
            lastTap = null;
          }
        }
      }
      if (e.touches.length === 0) {
        touchMode = null;
        tapStart = null;
      }
      else if (e.touches.length === 1) {
        // dropped from pinch back to one finger — restart pan
        touchMode = 'pan';
        longPressFired = false;
        const [x, y] = canvasPoint(e.touches[0]);
        this.wasmMap.handle_mouse_down(x, y);

        // Re-arm long-press for the restarted pan
        const t = e.touches[0];
        tapStart = { x: t.clientX, y: t.clientY, time: performance.now() };
        clearLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (touchMode !== 'pan' || this._destroyed) return;
          longPressFired = true;
          const [cx, cy] = canvasPoint(t);
          this.wasmMap.handle_contextmenu(cx, cy);
        }, LONG_PRESS_MS);
      }
    };
    this.canvas.addEventListener('touchend', endTouch, { passive: false });
    this.canvas.addEventListener('touchcancel', endTouch, { passive: false });
  }

  // Shift-drag rectangle → fitBounds (Leaflet box zoom)
  _startBoxZoom(e) {
    const startX = e.clientX;
    const startY = e.clientY;
    if (window.getComputedStyle(this.containerElement).position === 'static') {
      this.containerElement.style.position = 'relative';
    }
    const box = document.createElement('div');
    box.className = 'rustyleaf-boxzoom';
    Object.assign(box.style, {
      position: 'absolute',
      border: '2px dashed #3388ff',
      background: 'rgba(51,136,255,0.15)',
      zIndex: '999',
      pointerEvents: 'none',
    });
    this.containerElement.appendChild(box);
    const containerRect = this.containerElement.getBoundingClientRect();

    const update = (ev) => {
      box.style.left = (Math.min(startX, ev.clientX) - containerRect.left) + 'px';
      box.style.top = (Math.min(startY, ev.clientY) - containerRect.top) + 'px';
      box.style.width = Math.abs(ev.clientX - startX) + 'px';
      box.style.height = Math.abs(ev.clientY - startY) + 'px';
    };
    const finish = (ev) => {
      document.removeEventListener('mousemove', update);
      document.removeEventListener('mouseup', finish);
      box.remove();
      if (Math.abs(ev.clientX - startX) < 10 || Math.abs(ev.clientY - startY) < 10) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const c1 = this.unproject([(startX - rect.left) * scaleX, (startY - rect.top) * scaleY]);
      const c2 = this.unproject([(ev.clientX - rect.left) * scaleX, (ev.clientY - rect.top) * scaleY]);
      this.fitBounds([
        [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1])],
        [Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1])],
      ]);
      this._fireLocalEvent('boxzoomend', { type: 'boxzoomend' });
    };
    document.addEventListener('mousemove', update);
    document.addEventListener('mouseup', finish);
  }

  _handleResize() {
    const rect = this.containerElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.wasmMap.resize(this.width, this.height);
    this._fireLocalEvent('resize', { type: 'resize', newSize: [this.width, this.height] });
  }

  _startRenderLoop() {
    if (this._needsRestore) return;
    const render = () => {
      if (this._destroyed || this._needsRestore) return;
      this.wasmMap.render(this.canvas.id);
      if (!this._loadFired) {
        this._loadFired = true;
        this._fireLocalEvent('load', { type: 'load', target: this });
      }
      this._rafId = requestAnimationFrame(render);
    };
    // First frame via rAF so same-tick 'load' listeners are registered in time
    this._rafId = requestAnimationFrame(render);
  }

  _stopRenderLoop() {
    if (this._rafId !== undefined) {
      cancelAnimationFrame(this._rafId);
      this._rafId = undefined;
    }
  }

  // Release the WebGL context, GPU resources, and event listeners.
  // Leaflet-compatible name; also exposed as destroy().
  remove() {
    if (this._destroyed) return this;
    this._destroyed = true;

    if (this._rafId !== undefined) {
      cancelAnimationFrame(this._rafId);
      this._rafId = undefined;
    }

    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    if (this.wasmMap && typeof this.wasmMap.destroy === 'function') {
      this.wasmMap.destroy();
    }

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }

    return this;
  }

  destroy() {
    return this.remove();
  }

  // --- Control registry ---

  addControl(control) {
    if (!this._controls) this._controls = [];
    this._controls.push(control);
    return control.addTo(this);
  }

  removeControl(control) {
    if (this._controls) {
      this._controls = this._controls.filter((c) => c !== control);
    }
    return control.remove();
  }
}

// Static method to check WebGL support before creating a map
Map.checkWebGLSupport = checkWebGLSupport;

// TileLayer with Leaflet-style API
class TileLayer {
  constructor(urlTemplate, options = {}) {
    this.wasmTileLayer = new TileLayerApi(urlTemplate);
    this.options = options;
  }

  addTo(map) {
    if (!map || !map.wasmMap) return this;
    this.wasmTileLayer.add_to(map.wasmMap);
    // Plumb Leaflet-style options into the Rust tile loader.
    if (typeof map.wasmMap.configure_tile_layer === 'function') {
      try {
        const subs = this.options.subdomains !== undefined
          ? (Array.isArray(this.options.subdomains) ? this.options.subdomains : String(this.options.subdomains).split(''))
          : ['a', 'b', 'c'];
        const minZ = typeof this.options.minZoom === 'number' ? this.options.minZoom : 0;
        const maxZ = typeof this.options.maxZoom === 'number' ? this.options.maxZoom : 18;
        const ts = typeof this.options.tileSize === 'number' ? this.options.tileSize : 256;
        map.wasmMap.configure_tile_layer(subs, minZ, maxZ, ts);
      } catch (e) {
        console.warn('TileLayer: failed to apply options:', e);
      }
    }
    if (this.options.attribution && map.containerElement) {
      let attrib = map.containerElement.querySelector('.rustyleaf-attribution');
      if (!attrib) {
        attrib = document.createElement('div');
        attrib.className = 'rustyleaf-attribution';
        attrib.style.cssText = 'position:absolute;bottom:0;right:0;z-index:10;background:rgba(255,255,255,0.8);font:11px/1.4 sans-serif;padding:0 5px;';
        if (window.getComputedStyle(map.containerElement).position === 'static') {
          map.containerElement.style.position = 'relative';
        }
        map.containerElement.appendChild(attrib);
      }
      const parts = attrib.innerHTML ? attrib.innerHTML.split(' | ') : [];
      if (!parts.includes(this.options.attribution)) {
        parts.push(this.options.attribution);
        attrib.innerHTML = parts.join(' | ');
      }
      this._attributionElement = attrib;
    }
    this._map = map;
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }

  remove() {
    if (this._map) {
      // Actually detach the tile layer in the WASM core — otherwise tiles
      // keep rendering after remove() (Leaflet fires 'remove' here too).
      if (this._map.wasmMap && typeof this._map.wasmMap.remove_tile_layer === 'function') {
        this._map.wasmMap.remove_tile_layer();
      }
      if (this._attributionElement && this.options.attribution) {
        const parts = this._attributionElement.innerHTML.split(' | ')
          .filter((p) => p !== this.options.attribution);
        this._attributionElement.innerHTML = parts.join(' | ');
        this._attributionElement = null;
      }
      if (this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
      this._map = null;
    }
    return this;
  }
}

// PointLayer with Leaflet-style API
class PointLayer {
  constructor() {
    // Check if WASM is available, otherwise use mock
    if (typeof WasmPointLayer !== 'undefined') {
      this.wasmPointLayer = new WasmPointLayer();
    } else {
      // Fallback to using PointLayerApi directly
      this.wasmPointLayer = new PointLayerApi();
    }
    this.points = [];
  }
  
  add(points) {
    // Convert points to expected format
    const pointsData = points.map(p => ({
      lat: p.lat,
      lng: p.lng,
      size: p.size || 5,
      color: p.color || '#ff0000',
      meta: p.meta || null
    }));
    
    this.wasmPointLayer.add(pointsData);
    // Avoid spread — it overflows the call stack for very large arrays (1M+ points)
    for (const p of points) this.points.push(p);
    return this;
  }
  
  clear() {
    this.points = [];
    // Reset WASM layer
    this.wasmPointLayer = new PointLayerApi();
    return this;
  }
  
  on(event, callback) {
    if (event === 'click') {
      this.wasmPointLayer.on_click(callback);
    } else if (event === 'hover') {
      this.wasmPointLayer.on_hover(callback);
    }
    return this;
  }
  
  addTo(map) {
    if (this._map === map && this._layerIndex !== undefined) {
      // Already on this map (possibly hidden by remove()) — just re-show it.
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

  remove() {
    if (this._map && this._layerIndex !== undefined) {
      this._map.wasmMap.set_point_layer_visible(this._layerIndex, false);
      // Release the GPU buffer now — re-add re-uploads automatically.
      if (typeof this._map.wasmMap.free_point_layer_gpu === 'function') {
        try { this._map.wasmMap.free_point_layer_gpu(this._layerIndex); } catch (e) { /* stale index */ }
      }
      if (this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
    }
    return this;
  }
}

// LineLayer with Leaflet-style API
class LineLayer {
  constructor() {
    this.lines = [];
  }
  
  add(lines) {
    // Convert lines to expected format
    const linesData = lines.map(line => ({
      coords: line.coords.map(coord => ({
        lat: coord.lat,
        lng: coord.lng
      })),
      color: line.color || '#ff0000',
      width: line.width || 2,
      meta: line.meta || null
    }));
    
    for (const l of linesData) this.lines.push(l);
    return this;
  }
  
  clear() {
    this.lines = [];
    return this;
  }
  
  on(event, callback) {
    if (event === 'click') {
      // Store callback for later use
      this.clickCallback = callback;
    } else if (event === 'hover') {
      // Store callback for later use
      this.hoverCallback = callback;
    }
    return this;
  }
  
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

  remove() {
    if (this.map && this._layerIndex !== undefined) {
      this.map.wasmMap.set_line_layer_visible(this._layerIndex, false);
      if (typeof this.map.wasmMap.free_line_layer_gpu === 'function') {
        try { this.map.wasmMap.free_line_layer_gpu(this._layerIndex); } catch (e) { /* stale index */ }
      }
      if (this.map._notifyLayerRemove) this.map._notifyLayerRemove(this);
    }
    return this;
  }
}

// Enhanced Popup class with proper anchoring and auto-panning
class Popup {
  constructor(options = {}) {
    this.options = {
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
      className: '',
      ...options
    };
    
    this.element = null;
    this.latlng = null;
    this.map = null;
    this.content = '';
    this.isOpen = false;
    this._source = null; // Layer that opened this popup
    this._timeout = null;
  }
  
  setLatLng(latlng) {
    this.latlng = latlng;
    if (this.isOpen && this.map) {
      this._updatePosition();
    }
    return this;
  }
  
  setContent(html) {
    this.content = html;
    if (this.element) {
      this._updateContent();
    }
    return this;
  }
  
  setSource(layer) {
    this._source = layer;
    return this;
  }
  
  openOn(map) {
    if (this.isOpen && this.map === map) {
      return this;
    }

    if (this.isOpen) {
      this.close();
    }

    // Validate map object
    if (!map || !map.containerElement) {
      console.warn('Popup: Invalid map object provided');
      return this;
    }

    this.map = map;
    this._initLayout();
    this._updateContent();

    // Append before measuring position: _updatePosition/_handleAutoPan use
    // getBoundingClientRect(), which reads all-zero on a detached element —
    // that previously made autopan miscalculate on every open (and crash,
    // see below) instead of only when the popup would go off-screen.
    try {
      map.containerElement.appendChild(this.element);
      this.isOpen = true;
    } catch (error) {
      console.warn('Popup: Failed to append popup to map container:', error);
      return this;
    }

    this._updatePosition();
    this._handleAutoPan();

    // Add close button if enabled
    if (this.options.closeButton) {
      this._addCloseButton();
    }

    // Add event listeners
    this._addEventListeners();

    // Track the active popup so Map.closePopup() works (Leaflet parity).
    if (map) map._activePopup = this;

    if (map._fireLocalEvent) map._fireLocalEvent('popupopen', { type: 'popupopen', popup: this });
    return this;
  }

  close() {
    if (!this.isOpen) {
      return this;
    }
    
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    
    this._removeEventListeners();
    this.isOpen = false;
    if (this.map && this.map._activePopup === this) this.map._activePopup = null;
    if (this.map && this.map._fireLocalEvent) this.map._fireLocalEvent('popupclose', { type: 'popupclose', popup: this });
    this.map = null;
    
    return this;
  }
  
  toggle(map) {
    if (this.isOpen) {
      this.close();
    } else {
      this.openOn(map);
    }
    return this;
  }
  
  update() {
    if (!this.isOpen || !this.map) {
      return this;
    }
    
    this._updateLayout();
    this._updateContent();
    this._updatePosition();
    return this;
  }
  
  isOpenPopup() {
    return this.isOpen;
  }
  
  bringToFront() {
    if (this.element) {
      const popupContainer = this.element.parentNode;
      if (popupContainer) {
        popupContainer.appendChild(this.element);
      }
    }
    return this;
  }
  
  bringToBack() {
    if (this.element) {
      const popupContainer = this.element.parentNode;
      if (popupContainer && popupContainer.firstChild) {
        popupContainer.insertBefore(this.element, popupContainer.firstChild);
      }
    }
    return this;
  }
  
  // Private methods
  _initLayout() {
    this.element = document.createElement('div');
    this.element.className = 'rustyleaf-popup' + (this.options.className ? ' ' + this.options.className : '');
    
    // Base styles
    Object.assign(this.element.style, {
      position: 'absolute',
      background: 'white',
      padding: '12px 16px',
      borderRadius: '6px',
      boxShadow: '0 3px 14px rgba(0,0,0,0.25)',
      zIndex: '1000',
      minWidth: this.options.minWidth + 'px',
      maxWidth: this.options.maxWidth + 'px',
      boxSizing: 'border-box',
      transform: 'translate(-50%, -100%)', // Center popup above point
      pointerEvents: 'auto'
    });
    
    // Add tooltip arrow
    this._createTip();
    
    // Content wrapper
    this.contentWrapper = document.createElement('div');
    this.contentWrapper.className = 'rustyleaf-popup-content-wrapper';
    this.contentWrapper.style.maxHeight = this.options.maxHeight ? this.options.maxHeight + 'px' : '';
    this.contentWrapper.style.overflowY = this.options.maxHeight ? 'auto' : 'visible';
    
    this.element.appendChild(this.contentWrapper);
  }
  
  _createTip() {
    this.tip = document.createElement('div');
    this.tip.className = 'rustyleaf-popup-tip';
    Object.assign(this.tip.style, {
      position: 'absolute',
      width: '0',
      height: '0',
      borderLeft: '8px solid transparent',
      borderRight: '8px solid transparent',
      borderTop: '8px solid white',
      bottom: '-8px',
      left: '50%',
      marginLeft: '-8px',
      pointerEvents: 'none'
    });
    
    this.element.appendChild(this.tip);
  }

  _updateLayout() {
    // Layout update logic - placeholder for now
    if (!this.element) return;

    // Ensure proper sizing and positioning
    this.element.style.display = 'block';
  }

  _updateContent() {
    if (!this.contentWrapper) return;
    
    if (typeof this.content === 'string') {
      this.contentWrapper.innerHTML = this.content;
    } else if (this.content instanceof HTMLElement) {
      this.contentWrapper.innerHTML = '';
      this.contentWrapper.appendChild(this.content);
    }
  }
  
  _updatePosition() {
    if (!this.map || !this.latlng) return;
    
    const xy = this.map.wasmMap.screen_xy(this.latlng[0], this.latlng[1]);
    
    // Apply transform for centering above the point
    this.element.style.left = xy[0] + 'px';
    this.element.style.top = xy[1] + 'px';
    
    // Adjust position to keep popup in viewport
    this._adjustForViewport(xy[0], xy[1]);
  }
  
  _adjustForViewport(x, y) {
    if (!this.element) return;
    
    const rect = this.element.getBoundingClientRect();
    const containerRect = this.map.containerElement.getBoundingClientRect();
    
    let offsetX = 0;
    let offsetY = 0;
    
    // Check if popup goes outside container
    if (rect.left < containerRect.left) {
      offsetX = containerRect.left - rect.left;
    } else if (rect.right > containerRect.right) {
      offsetX = containerRect.right - rect.right;
    }
    
    if (rect.top < containerRect.top) {
      offsetY = containerRect.top - rect.top;
    } else if (rect.bottom > containerRect.bottom) {
      offsetY = containerRect.bottom - rect.bottom;
    }
    
    // Apply offset with transform
    if (offsetX !== 0 || offsetY !== 0) {
      this.element.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-100% + ${offsetY}px))`;
    }
  }
  
  _handleAutoPan() {
    if (!this.options.autoPan || !this.map || !this.latlng) return;
    
    const xy = this.map.wasmMap.screen_xy(this.latlng[0], this.latlng[1]);
    const containerRect = this.map.containerElement.getBoundingClientRect();
    const popupRect = this.element.getBoundingClientRect();
    
    // Calculate required pan
    const panLeft = Math.max(0, containerRect.left - popupRect.left + this.options.autoPanPadding[0]);
    const panRight = Math.max(0, popupRect.right - containerRect.right + this.options.autoPanPadding[0]);
    const panTop = Math.max(0, containerRect.top - popupRect.top + this.options.autoPanPadding[1]);
    const panBottom = Math.max(0, popupRect.bottom - containerRect.bottom + this.options.autoPanPadding[1]);
    
    if (panLeft !== 0 || panRight !== 0 || panTop !== 0 || panBottom !== 0) {
      // Convert screen offset to lat/lng offset
      const center = this.map.getCenter();
      const centerScreen = this.map.wasmMap.screen_xy(center[0], center[1]);
      
      const deltaX = (panRight - panLeft) / 2;
      const deltaY = (panBottom - panTop) / 2;
      
      const newCenterScreen = [centerScreen[0] + deltaX, centerScreen[1] + deltaY];
      const newCenter = this.map.unproject(newCenterScreen);

      // Animate the pan (Map has no panTo — flyTo at the current zoom does the same thing)
      this.map.flyTo(newCenter, { duration: 250 });
    }
  }
  
  _addCloseButton() {
    const closeBtn = document.createElement('a');
    closeBtn.className = 'rustyleaf-popup-close-button';
    closeBtn.innerHTML = '×';
    closeBtn.href = '#';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      width: 18px;
      height: 18px;
      font-size: 18px;
      font-weight: bold;
      text-decoration: none;
      color: #666;
      text-align: center;
      line-height: 18px;
      border-radius: 50%;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    
    closeBtn.addEventListener('mouseover', () => {
      closeBtn.style.background = '#f0f0f0';
      closeBtn.style.color = '#333';
    });
    
    closeBtn.addEventListener('mouseout', () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = '#666';
    });
    
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    });
    
    this.element.appendChild(closeBtn);
  }
  
  _addEventListeners() {
    // Bind handlers ONCE — re-creating .bind(this) refs per open leaks
    // listeners that off() can never match.
    if (!this._boundFns) {
      this._boundFns = {
        resize: this._handleResize.bind(this),
        move: this._updatePosition.bind(this),
        zoom: this._updatePosition.bind(this)
      };
    }
    if (this.options.autoClose && !this._autoCloseBound) {
      this._autoCloseBound = true;
      // Register OUTSIDE any wasm event dispatch — openOn() typically runs
      // inside a click handler, and registering a wasm listener there trips
      // the re-entrancy guard.
      deferCallback(() => {
        if (this._autoCloseBound && this.map && typeof this.map.on === 'function') {
          this.map.on('click', this._onMapClick, this);
        }
      });
    }

    // Handle window resize (DOM listener — always safe)
    window.addEventListener('resize', this._boundFns.resize);

    // Track map move/zoom to update position — deferred for the same reason.
    deferCallback(() => {
      if (this.map && this._boundFns && typeof this.map.on === 'function') {
        this.map.on('move', this._boundFns.move);
        this.map.on('zoom', this._boundFns.zoom);
      }
    });
  }

  _removeEventListeners() {
    if (this._autoCloseBound && this.map) {
      this.map.off('click', this._onMapClick);
      this._autoCloseBound = false;
    }

    if (this._boundFns) {
      window.removeEventListener('resize', this._boundFns.resize);
      if (this.map) {
        this.map.off('move', this._boundFns.move);
        this.map.off('zoom', this._boundFns.zoom);
      }
    }
  }

  _onMapClick(e) {
    // Don't close if clicking on the popup itself or its source
    if (this.element && e && e.target && this.element.contains(e.target)) return;
    if (this._source && e && e.target === this._source.getElement) return;
    // A marker just opened us during this same click — don't immediately close.
    if (this._skipAutoCloseOnce) {
      this._skipAutoCloseOnce = false;
      return;
    }

    this.close();
  }
  
  _handleResize() {
    if (this.isOpen && this.map) {
      this._updatePosition();
    }
  }
  
  // Convenience method for binding to features
  bindTo(layer, content) {
    layer.on('click', (e) => {
      if (e.latlng) {
        this.setLatLng(e.latlng)
          .setContent(content)
          .setSource(layer)
          .openOn(layer.map || this.map);
      }
    });
    
    return this;
  }
}

// PolygonLayer with Leaflet-style API  
class PolygonLayer {
  constructor() {
    this.polygons = [];
  }
  
  add(polygons) {
    // Convert polygons to expected format
    const polygonsData = polygons.map(polygon => ({
      rings: polygon.rings.map(ring => 
        ring.map(coord => ({ lat: coord.lat, lng: coord.lng }))
      ),
      color: polygon.color || '#ff0000',
      meta: polygon.meta || null
    }));
    
    for (const pg of polygonsData) this.polygons.push(pg);
    return this;
  }
  
  clear() {
    this.polygons = [];
    return this;
  }
  
  on(event, callback) {
    if (event === 'click') {
      // Store callback for later use
      this.clickCallback = callback;
    } else if (event === 'hover') {
      // Store callback for later use
      this.hoverCallback = callback;
    }
    return this;
  }
  
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

  remove() {
    if (this.map && this._layerIndex !== undefined) {
      this.map.wasmMap.set_polygon_layer_visible(this._layerIndex, false);
      if (typeof this.map.wasmMap.free_polygon_layer_gpu === 'function') {
        try { this.map.wasmMap.free_polygon_layer_gpu(this._layerIndex); } catch (e) { /* stale index */ }
      }
      if (this.map._notifyLayerRemove) this.map._notifyLayerRemove(this);
    }
    return this;
  }
}

// ---------- Vector shapes (Circle / CircleMarker / Rectangle) ----------

const METERS_PER_DEG_LAT = 111320;

// Base for shapes rendered through an internal point/polygon layer.
class Shape {
  constructor(options = {}) {
    this.options = options;
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
    for (const [event, callback] of this._pendingEvents) layer.on(event, callback);
    this._pendingEvents = [];
  }

  // Re-adding to the same map re-shows the existing layer instead of
  // duplicating the GPU data. Returns true when handled.
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
      const map = this._attachedMap;
      this._layer.remove();
      this._layer = null;
      this._attachedMap = null;
      this.addTo(map);
    }
    return this;
  }
}

// Circle with a geodesic radius in meters, tessellated into a polygon ring.
class Circle extends Shape {
  constructor(latlng, options = {}) {
    super(options);
    this._latlng = [latlng[0], latlng[1]];
    this._radius = options.radius !== undefined ? options.radius : 10;
  }

  getLatLng() { return [this._latlng[0], this._latlng[1]]; }
  setLatLng(latlng) { this._latlng = [latlng[0], latlng[1]]; return this.redraw(); }
  getRadius() { return this._radius; }
  setRadius(radius) { this._radius = radius; return this.redraw(); }

  _delta() {
    const dLat = this._radius / METERS_PER_DEG_LAT;
    const dLng = this._radius / (METERS_PER_DEG_LAT * Math.cos(this._latlng[0] * Math.PI / 180));
    return [dLat, dLng];
  }

  _ring(segments = 64) {
    const [lat, lng] = this._latlng;
    const [dLat, dLng] = this._delta();
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      ring.push({ lat: lat + dLat * Math.sin(theta), lng: lng + dLng * Math.cos(theta) });
    }
    return ring;
  }

  getBounds() {
    const [lat, lng] = this._latlng;
    const [dLat, dLng] = this._delta();
    return [[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]];
  }

  addTo(map) {
    if (this._reattached(map)) return this;
    const layer = new PolygonLayer();
    layer.add([{
      rings: [this._ring()],
      color: this.options.fillColor || this.options.color || '#3388ff66',
      meta: this.options.meta || null
    }]);
    this._attach(layer, map);
    return this;
  }
}

// Circle with a fixed screen radius in pixels, rendered as a GPU point.
class CircleMarker extends Shape {
  constructor(latlng, options = {}) {
    super(options);
    this._latlng = [latlng[0], latlng[1]];
    this._radius = options.radius !== undefined ? options.radius : 10;
  }

  getLatLng() { return [this._latlng[0], this._latlng[1]]; }
  setLatLng(latlng) { this._latlng = [latlng[0], latlng[1]]; return this.redraw(); }
  getRadius() { return this._radius; }
  setRadius(radius) { this._radius = radius; return this.redraw(); }

  addTo(map) {
    if (this._reattached(map)) return this;
    const layer = new PointLayer();
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

// Axis-aligned rectangle from LatLngBounds, rendered as a polygon.
class Rectangle extends Shape {
  constructor(bounds, options = {}) {
    super(options);
    this.setBounds(bounds);
  }

  getBounds() {
    return [[this._bounds[0][0], this._bounds[0][1]], [this._bounds[1][0], this._bounds[1][1]]];
  }

  setBounds(bounds) {
    this._bounds = [[bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]];
    return this.redraw();
  }

  addTo(map) {
    if (this._reattached(map)) return this;
    const [[south, west], [north, east]] = this._bounds;
    const layer = new PolygonLayer();
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
      this._layers = this._layers.filter((l) => l !== layer);
      if (this._map) layer.remove();
    }
    return this;
  }

  clearLayers() {
    if (this._map) {
      for (const layer of this._layers) layer.remove();
    }
    this._layers = [];
    return this;
  }

  eachLayer(fn, context) {
    for (const layer of this._layers.slice()) fn.call(context, layer);
    return this;
  }

  addTo(map) {
    this._map = map;
    for (const layer of this._layers) layer.addTo(map);
    return this;
  }

  remove() {
    for (const layer of this._layers) layer.remove();
    this._map = null;
    return this;
  }
}

// LayerGroup with combined bounds and events delegated to every child.
class FeatureGroup extends LayerGroup {
  on(event, callback) {
    // Remember the binding so layers added later receive it too.
    this._groupBindings = this._groupBindings || [];
    const existing = this._groupBindings.find((b) => b.event === event && b.callback === callback);
    if (!existing) this._groupBindings.push({ event, callback });
    for (const layer of this._layers) {
      if (typeof layer.on === 'function') layer.on(event, callback);
    }
    return this;
  }

  off(event, callback) {
    if (this._groupBindings) {
      this._groupBindings = typeof callback === 'function'
        ? this._groupBindings.filter((b) => !(b.event === event && b.callback === callback))
        : this._groupBindings.filter((b) => b.event !== event);
    }
    for (const layer of this._layers) {
      if (typeof layer.off === 'function') layer.off(event, callback);
    }
    return this;
  }

  addLayer(layer) {
    super.addLayer(layer);
    // Apply previously-bound group listeners to late-added children.
    if (this._groupBindings && typeof layer.on === 'function') {
      for (const { event, callback } of this._groupBindings) {
        layer.on(event, callback);
      }
    }
    return this;
  }

  getBounds() {
    let out = null;
    for (const layer of this._layers) {
      if (typeof layer.getBounds !== 'function') continue;
      const b = layer.getBounds();
      if (!b) continue;
      out = out
        ? [
          [Math.min(out[0][0], b[0][0]), Math.min(out[0][1], b[0][1])],
          [Math.max(out[1][0], b[1][0]), Math.max(out[1][1], b[1][1])]
        ]
        : [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
    }
    return out;
  }
}

// WASM event callbacks are dispatched synchronously while the Rust map is
// mutably borrowed; calling back into the map from such a callback throws
// ("recursive use of an object"). Defer re-entrant work to a microtask.
function deferCallback(fn) {
  /* istanbul ignore else -- setTimeout fallback only runs in engines without queueMicrotask */
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

// GeoJSONLayer with Leaflet-style API
class GeoJSONLayer {
  constructor(geojson = null, options = {}) {
    this.geojson = geojson;
    this.options = {
      pointColor: options.pointColor || '#0080ff',
      pointSize: options.pointSize || 5,
      lineColor: options.lineColor || '#ff0000',
      lineWidth: options.lineWidth || 2,
      polygonColor: options.polygonColor || '#00ff0080',
      ...options
    };
    this.map = null;
    this._pendingGeoJSONText = null;
    this._pendingTimer = null;
    // Leaflet-style options state: filter / pointToLayer / onEachFeature
    this._featureLayers = [];        // layers returned by pointToLayer
    this._featureHandles = [];       // per-feature handles for onEachFeature
    this._mountedFeatureLayerCount = 0;
    this._optionsApplied = false;
    this._clickDispatcherAttached = false;
    this._layerEvents = {};          // layer-level click/hover listeners
    this._openTooltip = null;
    this._openTooltipFid = undefined;
  }

  // Apply filter / pointToLayer / onEachFeature before data reaches the wasm
  // core. Point features consumed by pointToLayer are excluded from the wasm
  // payload (the returned layers render them); onEachFeature features get an
  // internal __rl_fid property so wasm hit-test events can be dispatched back
  // to their handles. Streaming loads (loadUrlStreaming/loadFile/processChunk)
  // bypass these options.
  _applyFeatureOptions(geojson) {
    const { filter, onEachFeature, pointToLayer } = this.options;
    if (!filter && !onEachFeature && !pointToLayer) return geojson;
    if (this._optionsApplied) return this._processedGeoJSON || geojson;

    let features;
    if (geojson && geojson.type === 'FeatureCollection') features = geojson.features || [];
    else if (geojson && geojson.type === 'Feature') features = [geojson];
    else if (geojson && geojson.type) features = [{ type: 'Feature', geometry: geojson, properties: {} }];
    else features = [];

    const kept = [];
    for (const feature of features) {
      if (filter && !filter(feature)) continue;
      const geomType = feature.geometry && feature.geometry.type;
      if (pointToLayer && (geomType === 'Point' || geomType === 'MultiPoint')) {
        const coordsList = geomType === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        let firstLayer = null;
        for (const c of coordsList) {
          const layer = pointToLayer(feature, [c[1], c[0]]);
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
        const handle = this._makeFeatureHandle(feature);
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
    return {
      feature,
      _events: {},
      on(event, callback) {
        (this._events[event] = this._events[event] || []).push(callback);
        return this;
      },
      off(event, callback) {
        if (this._events[event]) this._events[event] = this._events[event].filter((cb) => cb !== callback);
        return this;
      },
      bindPopup(content) { this._popupContent = content; return this; },
      bindTooltip(content) { this._tooltipContent = content; return this; },
    };
  }

  // Add any not-yet-mounted pointToLayer layers and attach the feature-event
  // dispatcher (wasm click/hover events carry e.feature from the hit-test).
  _mountFeatureExtras(map) {
    while (this._mountedFeatureLayerCount < this._featureLayers.length) {
      this._featureLayers[this._mountedFeatureLayerCount++].addTo(map);
    }
    if (!this._clickDispatcherAttached && this.map) {
      this._clickDispatcherAttached = true;
      // Attach whenever the layer is on a map — feature handles AND
      // layer-level click/hover listeners both dispatch through here.
      this.map.on('click', (e) => deferCallback(() => this._dispatchFeatureEvent(e, 'click')));
      this.map.on('hover', (e) => deferCallback(() => this._dispatchFeatureEvent(e, 'hover')));
    }
  }

  _dispatchFeatureEvent(e, kind) {
    // Hit-test meta from the wasm core is wrapped as
    // { layer_type, layer_index, feature_index, original_meta }. Only react
    // to hits on THIS layer (layer_index matches) — otherwise, with two+
    // GeoJSONLayers on one map, feature ids collide and a click on layer A's
    // feature 0 would also fire layer B's feature 0 handler.
    const props = e && e.feature;
    const isOwnHit = props && typeof props.layer_type === 'string' &&
      props.layer_type.indexOf('geojson') === 0 && props.layer_index === this.layerIndex;
    const fid = isOwnHit && props.original_meta ? props.original_meta.__rl_fid : undefined;
    if (kind === 'hover' && this._openTooltip && fid !== this._openTooltipFid) {
      this._openTooltip.close();
      this._openTooltip = null;
      this._openTooltipFid = undefined;
    }
    if (fid === undefined || fid === null) {
      // No per-feature handle hit — still deliver layer-level listeners.
      // Normalize the payload shape: consumers expect e.feature.properties,
      // so wrap the raw hit meta like the feature-handle path does.
      if ((this._layerEvents[kind] || []).length > 0) {
        const normalizedFeature = props && props.original_meta !== undefined && props.original_meta !== null
          ? { geometry: null, properties: props.original_meta }
          : null;
        const layerEvent = Object.assign({}, e, { type: kind, target: this, feature: normalizedFeature });
        for (const cb of this._layerEvents[kind]) {
          try {
            cb(layerEvent);
          } catch (err) {
            console.error(`Rustyleaf: error in GeoJSONLayer '${kind}' handler:`, err);
          }
        }
      }
      return;
    }
    const handle = this._featureHandles[fid];
    if (!handle) return;
    const event = Object.assign({}, e, { feature: handle.feature });
    for (const cb of handle._events[kind] || []) {
      try {
        cb(event);
      } catch (err) {
        console.error(`Rustyleaf: error in feature '${kind}' handler:`, err);
      }
    }
    if (kind === 'click' && handle._popupContent) {
      new Popup().setLatLng(e.latlng).setContent(handle._popupContent).setSource(this).openOn(this.map);
    }
    if (kind === 'hover' && handle._tooltipContent && !this._openTooltip) {
      this._openTooltip = new Tooltip({ content: handle._tooltipContent }).setLatLng(e.latlng).openOn(this.map);
      this._openTooltipFid = fid;
    }
    // Layer-level listeners always see feature hits too.
    if ((this._layerEvents[kind] || []).length > 0) {
      const layerEvent = Object.assign({}, e, { type: kind, target: this, feature: handle.feature });
      for (const cb of this._layerEvents[kind]) {
        try {
          cb(layerEvent);
        } catch (err) {
          console.error(`Rustyleaf: error in GeoJSONLayer '${kind}' handler:`, err);
        }
      }
    }
  }

  // Load GeoJSON data
  loadData(geojson) {
    // Re-loading with new data replaces the old dataset (Leaflet-style);
    // an identical no-op call is skipped.
    if (this.dataLoaded && this.geojson === geojson) {
      return this;
    }
    if (this.dataLoaded) {
      // Reset per-load state so filter/onEachFeature/pointToLayer re-apply.
      if (this.map && this.layerIndex !== undefined && typeof this.map.wasmMap.clear_geojson_layer === 'function') {
        try { this.map.wasmMap.clear_geojson_layer(this.layerIndex); } catch (e) { /* layer may be gone */ }
      }
      // Detach previously mounted pointToLayer layers so they don't linger
      // rendered on the map alongside the new dataset's layers.
      if (this.map) {
        for (const layer of this._featureLayers) {
          try { layer.remove(); } catch (e) { /* already gone */ }
        }
      }
      this._featureLayers = [];
      this._featureHandles = [];
      this._mountedFeatureLayerCount = 0;
      this._optionsApplied = false;
      this.dataLoaded = false;
    }

    // Normalize input: keep an object for API helpers and a string for WASM
    let jsonObject = null;
    let jsonText = null;

    if (typeof geojson === 'string') {
      jsonText = geojson;
      try {
        jsonObject = JSON.parse(geojson);
      } catch (e) {
        console.warn('GeoJSONLayer: Invalid JSON string provided to loadData');
      }
    } else {
      jsonObject = geojson;
      try {
        jsonText = JSON.stringify(geojson);
      } catch (e) {
        jsonText = null;
      }
    }

    this.geojson = jsonObject;
    this.dataLoaded = true; // Mark as loaded

    // Apply filter / pointToLayer / onEachFeature before handing to WASM
    if (jsonObject) {
      const processed = this._applyFeatureOptions(jsonObject);
      if (processed !== jsonObject) {
        try {
          jsonText = JSON.stringify(processed);
        } catch (e) {
          jsonText = null;
        }
      }
      if (this.map) this._mountFeatureExtras(this.map);
    }

    // If layer is already on map, trigger parsing immediately; otherwise defer
    if (jsonText) {
      if (this.map && this.layerIndex !== undefined) {
        console.log('GeoJSONLayer: Data loaded, triggering immediate parsing');
        this.map.wasmMap.load_geojson(this.layerIndex, jsonText);
        this.updateStyle();
        this._pendingGeoJSONText = null;
      } else {
        console.log('GeoJSONLayer: Data stored but layer not yet on map');
        this._pendingGeoJSONText = jsonText;
        // Retry applying once layer is added
        if (!this._pendingTimer) {
          this._pendingTimer = setInterval(() => {
            if (this.map && this.layerIndex !== undefined && this._pendingGeoJSONText) {
              try {
                this.map.wasmMap.load_geojson(this.layerIndex, this._pendingGeoJSONText);
                this.updateStyle();
              } finally {
                this._pendingGeoJSONText = null;
                clearInterval(this._pendingTimer);
                this._pendingTimer = null;
              }
            }
          }, 100);
        }
      }
    }

    return this;
  }

  // Load GeoJSON from URL
  loadUrl(url) {
    return fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        // Ensure data is parsed into WASM and stored locally
        this.loadData(data);
        return this;
      });
  }

  // Load GeoJSON from URL with streaming support for large files
  loadUrlStreaming(url, options = {}) {
    const {
      chunkSize = 1024 * 1024, // 1MB chunks
      progressCallback = null,
      completeCallback = null,
      errorCallback = null
    } = options;

    return new Promise((resolve, reject) => {
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let totalBytes = 0;
          let loadedBytes = 0;
          
          // Get total size if available
          const contentLength = response.headers.get('Content-Length');
          const totalSize = contentLength ? parseInt(contentLength) : null;
          
          const readChunk = () => {
            reader.read()
              .then(({ done, value }) => {
                if (done) {
                  // Process final buffer
                  if (buffer.trim()) {
                    this.processChunk(buffer, true);
                  }
                  
                  if (completeCallback) {
                    completeCallback({
                      totalFeatures: this.getFeatureCount(),
                      totalBytes,
                      loadedBytes
                    });
                  }
                  
                  resolve(this);
                  return;
                }
                
                // Decode chunk and add to buffer
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                loadedBytes += value.length;
                totalBytes += value.length;
                
                // Process complete JSON objects from buffer
                this.processStreamingBuffer(buffer, false);
                
                // Report progress
                if (progressCallback && totalSize) {
                  progressCallback({
                    loaded: loadedBytes,
                    total: totalSize,
                    percentage: Math.round((loadedBytes / totalSize) * 100),
                    featureCount: this.getFeatureCount()
                  });
                }
                
                // Clear buffer to prevent memory buildup
                if (buffer.length > chunkSize * 2) {
                  buffer = buffer.slice(-chunkSize);
                }
                
                readChunk();
              })
              .catch(error => {
                if (errorCallback) {
                  errorCallback(error);
                }
                reject(error);
              });
          };
          
          readChunk();
        })
        .catch(error => {
          if (errorCallback) {
            errorCallback(error);
          }
          reject(error);
        });
    });
  }

  // Process streaming buffer for GeoJSON chunks
  processStreamingBuffer(buffer, isFinal) {
    // Try to find and process complete JSON objects
    let processed = 0;
    
    // Look for complete JSON objects (ending with })
    for (;;) {
      const endIndex = this.findCompleteJsonEnd(buffer);
      if (endIndex === -1) break;
      
      const jsonStr = buffer.substring(0, endIndex + 1);
      this.processChunk(jsonStr, false);
      
      buffer = buffer.substring(endIndex + 1);
      processed++;
    }
    
    return { processed, remaining: buffer };
  }

  // Find the end of a complete JSON object
  findCompleteJsonEnd(str) {
    let braceCount = 0;
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      
      if (escape) {
        escape = false;
        continue;
      }
      
      if (char === '\\') {
        escape = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return i; // Found complete object
        }
      }
    }
    
    return -1; // No complete object found
  }

  // Process a single chunk of GeoJSON data
  processChunk(chunk, isFinal) {
    if (this.map && this.layerIndex !== undefined) {
      // Keep a client-side copy so query APIs (getFeaturesInBounds/getBounds)
      // work for streamed layers too.
      this._streamedText = (this._streamedText || '') + chunk;
      if (isFinal && !this.geojson && this._streamedText) {
        try {
          this.geojson = JSON.parse(this._streamedText);
          this.dataLoaded = true;
        } catch (e) { /* partial/NDJSON streams stay query-less */ }
      }
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
      const styleData = {
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
      // Already on this map (possibly hidden by remove()) — just re-show it.
      map.wasmMap.set_geojson_layer_visible(this.layerIndex, true);
      for (const layer of this._featureLayers) layer.addTo(map);
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
      console.log('GeoJSONLayer: Applying deferred data after adding to map');
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
      let dataObject = this.geojson;
      if (typeof dataObject === 'string') {
        try {
          dataObject = JSON.parse(dataObject);
        } catch (e) {
          dataObject = null;
        }
      }
      if (dataObject) {
        const processed = this._applyFeatureOptions(dataObject);
        map.wasmMap.load_geojson(this.layerIndex, JSON.stringify(processed));
      } else {
        // Unparseable string — pass through and let the wasm parser report it
        map.wasmMap.load_geojson(this.layerIndex, this.geojson);
      }
      this.updateStyle();
    }

    this._mountFeatureExtras(map);
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    return this;
  }

  // Event handlers — layer-level click/hover, dispatched from the wasm
  // hit-test pipeline via _dispatchFeatureEvent.
  on(event, callback) {
    if (typeof callback !== 'function') return this;
    (this._layerEvents[event] = this._layerEvents[event] || []).push(callback);
    // Legacy shape kept for tests/introspection: single-callback accessors.
    if (event === 'click') this.clickCallback = callback;
    if (event === 'hover') this.hoverCallback = callback;
    return this;
  }

  off(event, callback) {
    if (!this._layerEvents[event]) return this;
    if (typeof callback === 'function') {
      this._layerEvents[event] = this._layerEvents[event].filter((cb) => cb !== callback);
    } else {
      delete this._layerEvents[event];
    }
    return this;
  }

  // Hide the layer (the map reference is kept so addTo can re-show it)
  remove() {
    if (this.map && this.layerIndex !== undefined) {
      this.map.wasmMap.set_geojson_layer_visible(this.layerIndex, false);
      if (typeof this.map.wasmMap.free_geojson_layer_gpu === 'function') {
        try { this.map.wasmMap.free_geojson_layer_gpu(this.layerIndex); } catch (e) { /* stale index */ }
      }
      if (this.map._notifyLayerRemove) this.map._notifyLayerRemove(this);
    }
    for (const layer of this._featureLayers) layer.remove();
    return this;
  }

  // Get feature bounds
  getBounds() {
    if (!this.geojson) return null;
    
    // Calculate bounds from GeoJSON features
    let minLng = Infinity, minLat = Infinity;
    let maxLng = -Infinity, maxLat = -Infinity;
    
    const extractCoordinates = (geometry) => {
      switch (geometry.type) {
      case 'Point':
        return [geometry.coordinates];
      case 'MultiPoint':
        return geometry.coordinates;
      case 'LineString':
        return geometry.coordinates;
      case 'MultiLineString':
        return geometry.coordinates.flat();
      case 'Polygon':
        return geometry.coordinates.flat();
      case 'MultiPolygon':
        return geometry.coordinates.flat().flat();
      default:
        return [];
      }
    };

    const processFeature = (feature) => {
      const coords = extractCoordinates(feature.geometry);
      coords.forEach(([lng, lat]) => {
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
      // Direct geometry
      processFeature({ geometry: this.geojson });
    }

    if (minLng === Infinity) return null;
    
    return [
      [minLat, minLng], // Southwest
      [maxLat, maxLng]  // Northeast
    ];
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

  // Load GeoJSON from a File object (for file uploads)
  loadFile(file, options = {}) {
    const {
      chunkSize = 1024 * 1024, // 1MB chunks
      progressCallback = null,
      completeCallback = null,
      errorCallback = null
    } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      let offset = 0;
      
      const readChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsText(slice);
      };
      
      reader.onload = (e) => {
        const chunk = e.target.result;
        offset += chunk.length;
        
        // Process chunk
        this.processChunk(chunk, offset >= file.size);
        
        // Report progress
        if (progressCallback) {
          progressCallback({
            loaded: offset,
            total: file.size,
            percentage: Math.round((offset / file.size) * 100),
            featureCount: this.getFeatureCount()
          });
        }
        
        if (offset < file.size) {
          readChunk();
        } else {
          if (completeCallback) {
            completeCallback({
              totalFeatures: this.getFeatureCount(),
              totalBytes: file.size,
              loadedBytes: offset
            });
          }
          resolve(this);
        }
      };
      
      reader.onerror = () => {
        const error = new Error('Failed to read file');
        if (errorCallback) {
          errorCallback(error);
        }
        reject(error);
      };
      
      readChunk();
    });
  }

  // Load GeoJSON from a URL, then parse/triangulate it in the WASM core
  async loadFromUrl(url, options = {}) {
    const {
      progressCallback = null,
      completeCallback = null,
      errorCallback = null,
      signal = null
    } = options;

    try {
      const response = await fetch(url, signal ? { signal } : undefined);
      if (!response.ok) {
        throw new Error(`Failed to fetch GeoJSON: HTTP ${response.status} ${response.statusText}`);
      }

      const contentLength = Number(response.headers.get('content-length')) || 0;
      let text;
      if (progressCallback && response.body) {
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          progressCallback({
            loaded,
            total: contentLength,
            percentage: contentLength ? Math.round((loaded / contentLength) * 100) : 0
          });
        }
        const buffer = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
        text = new TextDecoder().decode(buffer);
      } else {
        text = await response.text();
      }

      this.loadData(text);

      if (completeCallback) {
        completeCallback({
          totalFeatures: this.getFeatureCount(),
          totalBytes: text.length
        });
      }
      return this;
    } catch (error) {
      if (errorCallback) {
        errorCallback({ error, message: 'Failed to load GeoJSON from URL' });
      }
      throw error;
    }
  }

  // Add individual GeoJSON feature
  addFeature(feature) {
    if (!this.map || this.layerIndex === undefined) {
      return this;
    }
    
    try {
      const featureStr = typeof feature === 'string' ? feature : JSON.stringify(feature);
      this.processChunk(featureStr, false);
    } catch (error) {
      console.warn('Failed to add feature:', error);
    }
    
    return this;
  }

  // Add multiple GeoJSON features
  addFeatures(features) {
    features.forEach(feature => this.addFeature(feature));
    return this;
  }

  // Get features intersecting [ [s,lat],[n,lat] ] bounds (Leaflet LatLngBounds shape)
  getFeaturesInBounds(bounds) {
    const features = this.geojson
      ? (this.geojson.type === 'FeatureCollection' ? this.geojson.features : this.geojson.type === 'Feature' ? [this.geojson] : [])
      : [];
    if (!bounds || !Array.isArray(bounds)) return features.slice();
    const south = Math.min(bounds[0][0], bounds[1][0]);
    const north = Math.max(bounds[0][0], bounds[1][0]);
    const west = Math.min(bounds[0][1], bounds[1][1]);
    const east = Math.max(bounds[0][1], bounds[1][1]);
    const coordIn = ([lng, lat]) => lat >= south && lat <= north && lng >= west && lng <= east;
    const anyCoord = (coords) => {
      if (!Array.isArray(coords)) return false;
      if (typeof coords[0] === 'number') return coordIn(coords);
      return coords.some(anyCoord);
    };
    return features.filter((f) => f && f.geometry && anyCoord(f.geometry.coordinates));
  }

  // Set data-driven styling based on properties
  setStyleFunction(styleFn) {
    this.styleFunction = styleFn;
    if (this.map && this.layerIndex !== undefined) {
      this.updateStyle();
    }
    return this;
  }
}

// Icon with Leaflet-style API
class Icon {
  constructor(options = {}) {
    this.options = { ...options };
    if (!this.options.iconUrl && !(this instanceof DivIcon)) {
      throw new Error('Icon requires an iconUrl option');
    }
  }
}

// Default icon (Leaflet-compatible image-based marker)
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

// DivIcon — HTML-based icon
class DivIcon extends Icon {
  constructor(options = {}) {
    super({ ...options, iconUrl: options.iconUrl || 'divicon' });
    // Leaflet parity: DivIcon renders `html` (string or HTMLElement) as a
    // DOM overlay marker instead of a GPU sprite.
    this.options.html = options.html !== undefined ? options.html : '';
  }
}

// Parse a #rrggbb / #rgb hex string into normalized [r, g, b] in [0, 1].
function parseMarkerColor(hex) {
  if (typeof hex !== 'string') return [0.878, 0.224, 0.243]; // default red
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return [0.878, 0.224, 0.243];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

// Marker with Leaflet-style API.
// Markers are rendered on the GPU inside the Rust/WASM core (as round sprites
// via the shared point program), so the JS layer only manages state and
// forwards it to the WASM map. Popups/tooltips remain DOM overlays.
class Marker {
  constructor(latlng, options = {}) {
    if (!Array.isArray(latlng) || latlng.length !== 2 ||
        typeof latlng[0] !== 'number' || typeof latlng[1] !== 'number' ||
        isNaN(latlng[0]) || isNaN(latlng[1])) {
      throw new Error('Invalid latlng: expected [lat, lng] numbers');
    }
    this._latlng = [latlng[0], latlng[1]];
    this._options = options;
    this._opacity = options.opacity !== undefined ? options.opacity : 1;
    this._zIndexOffset = options.zIndexOffset !== undefined ? options.zIndexOffset : 0;
    this._draggable = !!options.draggable;
    this._icon = options.icon || new Icon.Default();
    this._color = parseMarkerColor(options.color);
    this._size = options.size !== undefined ? options.size : 14;
    this._events = {};
    this._map = null;
    this._id = null;
  }

  getLatLng() {
    return [this._latlng[0], this._latlng[1]];
  }

  setLatLng(latlng) {
    if (!Array.isArray(latlng) || latlng.length !== 2 ||
        typeof latlng[0] !== 'number' || typeof latlng[1] !== 'number' ||
        isNaN(latlng[0]) || isNaN(latlng[1]) ||
        !isFinite(latlng[0]) || !isFinite(latlng[1])) {
      throw new Error('Invalid latlng: expected [lat, lng] numbers');
    }
    this._latlng = [latlng[0], latlng[1]];
    if (this._map && this._id !== null) {
      this._map.wasmMap.update_marker(this._id, latlng[0], latlng[1]);
    }
    this._updateDomPosition();
    return this;
  }

  getIcon() {
    return this._icon;
  }

  setIcon(icon) {
    this._icon = icon;
    return this;
  }

  getOpacity() {
    return this._opacity;
  }

  setOpacity(o) {
    if (o < 0) o = 0;
    if (o > 1) o = 1;
    this._opacity = o;
    this._applyStyle();
    return this;
  }

  getZIndexOffset() {
    return this._zIndexOffset;
  }

  setZIndexOffset(o) {
    this._zIndexOffset = o;
    this._applyStyle();
    return this;
  }

  isDraggable() {
    return this._draggable;
  }

  setDraggable(d) {
    this._draggable = !!d;
    return this;
  }

  on(event, callback) {
    (this._events[event] = this._events[event] || []).push(callback);
    return this;
  }

  off(event, callback) {
    if (!this._events[event]) return this;
    if (typeof callback === 'function') {
      this._events[event] = this._events[event].filter((h) => h !== callback);
    } else {
      // Leaflet semantics: no callback removes all listeners for the event.
      delete this._events[event];
    }
    return this;
  }

  once(event, callback) {
    if (typeof callback !== 'function') return this;
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }

  fire(event, data) {
    (this._events[event] || []).forEach((h) => h(data));
    return this;
  }

  // Push current style (size/color/opacity/z) to the WASM core.
  _applyStyle() {
    if (this._map && this._id !== null) {
      const [r, g, b] = this._color;
      this._map.wasmMap.set_marker_style(
        this._id, this._size, r, g, b, this._opacity, this._zIndexOffset
      );
    }
  }

  addTo(map) {
    this._map = map;
    if (this._icon instanceof DivIcon && typeof map.containerElement !== 'undefined') {
      return this._mountDomOverlay(map);
    }
    this._id = map.wasmMap.add_marker();
    map.wasmMap.update_marker(this._id, this._latlng[0], this._latlng[1]);
    this._applyStyle();
    map.wasmMap.set_marker_visible(this._id, true);
    if (map._registerMarker) map._registerMarker(this);
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    this.fire('add', { type: 'add', target: this });
    return this;
  }

  // DivIcon markers render as tracked DOM overlays with native events.
  _mountDomOverlay(map) {
    const el = document.createElement('div');
    el.className = 'rustyleaf-marker-overlay'
      + (this._icon.options.className ? ' ' + this._icon.options.className : '');
    el.style.cssText = 'position:absolute;z-index:700;pointer-events:auto;';
    const html = this._icon.options.html;
    if (typeof html === 'string') el.innerHTML = html;
    else if (html instanceof HTMLElement) el.appendChild(html);
    if (this._opacity < 1) el.style.opacity = String(this._opacity);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fire('click', { type: 'click', latlng: this.getLatLng(), target: this, originalEvent: e });
      if ((this._popup || this._popupContent) && !this.isPopupOpen()) {
        this.openPopup();
        const p = this.getPopup();
        if (p) p._skipAutoCloseOnce = true;
      }
    });
    el.addEventListener('mouseover', () => this.fire('mouseover', { type: 'mouseover', target: this }));
    el.addEventListener('mouseout', () => this.fire('mouseout', { type: 'mouseout', target: this }));
    map.containerElement.appendChild(el);
    this._domElement = el;

    if (!this._boundFns) {
      this._boundFns = { reposition: () => this._updateDomPosition() };
    }
    deferCallback(() => {
      if (this._map && this._domElement && typeof this._map.on === 'function') {
        this._map.on('move', this._boundFns.reposition);
        this._map.on('zoom', this._boundFns.reposition);
      }
    });
    this._updateDomPosition();
    if (map._notifyLayerAdd) map._notifyLayerAdd(this);
    this.fire('add', { type: 'add', target: this });
    return this;
  }

  _updateDomPosition() {
    if (!this._domElement || !this._map || !this._map.project) return;
    const xy = this._map.project(this._latlng);
    const anchor = (this._icon && this._icon.options.iconAnchor) || null;
    const size = (this._icon && this._icon.options.iconSize) || null;
    let tx = '-50%', ty = '-50%';
    if (anchor && size) {
      tx = anchor[0] === 0 ? '0%' : `${-(anchor[0] / size[0]) * 100}%`;
      ty = anchor[1] === 0 ? '0%' : `${-(anchor[1] / size[1]) * 100}%`;
    }
    this._domElement.style.left = xy[0] + 'px';
    this._domElement.style.top = xy[1] + 'px';
    this._domElement.style.transform = `translate(${tx}, ${ty})`;
  }

  remove() {
    if (this._map) {
      this.closePopup();
      this.closeTooltip();
      if (this._domElement) {
        if (this._domElement.parentNode) this._domElement.parentNode.removeChild(this._domElement);
        this._domElement = null;
        if (this._boundFns && typeof this._map.off === 'function') {
          this._map.off('move', this._boundFns.reposition);
          this._map.off('zoom', this._boundFns.reposition);
        }
      } else if (this._id !== null) {
        this._map.wasmMap.remove_marker(this._id);
        if (this._map._unregisterMarker) this._map._unregisterMarker(this);
      }
      if (this._map._notifyLayerRemove) this._map._notifyLayerRemove(this);
      this._map = null;
      this._id = null;
      this.fire('remove', { type: 'remove', target: this });
    }
    return this;
  }

  // Markers are GPU sprites, so there is no DOM element to return.
  getElement() {
    return null;
  }

  bindPopup(content) {
    if (content && content instanceof Popup) this._popup = content;
    else this._popupContent = content;
    return this;
  }

  getPopupContent() {
    return this._popupContent;
  }

  getPopup() {
    return this._popup;
  }

  openPopup() {
    this._popupOpen = true;
    if (!this._map) return this;
    if (this._popup) {
      this._popup.setLatLng(this._latlng);
      this._popup.openOn(this._map);
    } else if (this._popupContent !== undefined) {
      // String/DOM content bound via bindPopup(content) — wrap lazily.
      this._popup = new Popup({ content: this._popupContent });
      this._popup.setLatLng(this._latlng);
      this._popup.openOn(this._map);
    }
    return this;
  }

  closePopup() {
    this._popupOpen = false;
    if (this._popup) this._popup.close();
    return this;
  }

  isPopupOpen() {
    return this._popupOpen;
  }

  bindTooltip(content) {
    if (content && content instanceof Popup) this._tooltip = content;
    else this._tooltipContent = content;
    return this;
  }

  getTooltipContent() {
    return this._tooltipContent;
  }

  openTooltip() {
    this._tooltipOpen = true;
    if (!this._map) return this;
    if (this._tooltip && typeof this._tooltip.openOn === 'function') {
      this._tooltip.setLatLng(this._latlng);
      this._tooltip.openOn(this._map);
    } else if (this._tooltipContent !== undefined) {
      // String/DOM content bound via bindTooltip(content) — wrap lazily.
      if (!this._boundTooltip || !(this._boundTooltip instanceof Tooltip)) {
        this._boundTooltip = new Tooltip({ content: this._tooltipContent });
      }
      this._boundTooltip.setLatLng(this._latlng);
      this._boundTooltip.openOn(this._map);
    }
    return this;
  }

  closeTooltip() {
    this._tooltipOpen = false;
    if (this._tooltip && typeof this._tooltip.close === 'function') this._tooltip.close();
    if (this._boundTooltip) {
      if (typeof this._boundTooltip.close === 'function') this._boundTooltip.close();
      this._boundTooltip = null;
    }
    return this;
  }

  isTooltipOpen() {
    return this._tooltipOpen;
  }
}

// Tooltip — a lightweight DOM overlay (like Popup but smaller), anchored to a
// latlng or a layer. Renders above the canvas and tracks the map each frame via
// the render loop (the same pattern as Popup).
class Tooltip {
  constructor(options = {}) {
    this.options = Object.assign({
      direction: 'auto',
      opacity: 0.9,
      className: '',
      sticky: false,
      offset: [0, 0]
    }, options);
    this.content = options.content !== undefined ? options.content : '';
    this.latlng = null;
    this.map = null;
    this.element = null;
    this._isOpen = false;
  }

  setContent(html) {
    this.content = html;
    if (this.element) this._updateContent();
    return this;
  }

  getTooltipContent() {
    return this.content;
  }

  setLatLng(latlng) {
    this.latlng = latlng;
    if (this._isOpen && this.map) this._updatePosition();
    return this;
  }

  getLatLng() {
    return this.latlng;
  }

  openOn(map) {
    if (!map || !map.containerElement) return this;
    this.map = map;
    this._initLayout();
    this._updateContent();
    this._updatePosition();
    map.containerElement.appendChild(this.element);
    this._isOpen = true;
    // Stay anchored to the latlng while the user pans/zooms. Registration is
    // deferred: openOn often runs inside a wasm event handler.
    if (typeof map.on === 'function') {
      if (!this._boundFns) {
        this._boundFns = {
          move: () => { if (this._isOpen && this.map) this._updatePosition(); },
          zoom: () => { if (this._isOpen && this.map) this._updatePosition(); }
        };
      }
      deferCallback(() => {
        if (this._isOpen && this.map && typeof this.map.on === 'function') {
          this.map.on('move', this._boundFns.move);
          this.map.on('zoom', this._boundFns.zoom);
        }
      });
    }
    if (map) map._activeTooltip = this;
    if (map._fireLocalEvent) map._fireLocalEvent('tooltipopen', { type: 'tooltipopen', tooltip: this });
    return this;
  }

  close() {
    if (!this._isOpen) return this;
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this._isOpen = false;
    if (this.map && this._boundFns && typeof this.map.off === 'function') {
      this.map.off('move', this._boundFns.move);
      this.map.off('zoom', this._boundFns.zoom);
    }
    if (this.map && this.map._activeTooltip === this) this.map._activeTooltip = null;
    if (this.map && this.map._fireLocalEvent) this.map._fireLocalEvent('tooltipclose', { type: 'tooltipclose', tooltip: this });
    this.map = null;
    return this;
  }

  isOpenTooltip() {
    return this._isOpen;
  }

  isOpen() {
    return this._isOpen;
  }

  getElement() {
    return this._isOpen ? this.element : null;
  }

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
    if (typeof this.content === 'string') {
      this.element.innerHTML = this.content;
    } else if (this.content instanceof HTMLElement) {
      this.element.innerHTML = '';
      this.element.appendChild(this.content);
    }
  }

  _updatePosition() {
    if (!this.map || !this.latlng || !this.element) return;
    const xy = this.map.wasmMap.screen_xy(this.latlng[0], this.latlng[1]);
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
  constructor(options = {}) {
    this.options = Object.assign({ position: 'topleft' }, options);
    this._map = null;
    this._container = null;
  }

  getPosition() {
    return this.options.position;
  }

  setPosition(position) {
    this.options.position = position;
    return this;
  }

  // Subclasses override this to build and return their DOM element.
  onAdd(map) {
    return document.createElement('div');
  }

  onRemove(map) {
    return this;
  }

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
    if (this._map && typeof this.onRemove === 'function') {
      this.onRemove(this._map);
    }
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this._map = null;
    return this;
  }

  getContainer() {
    return this._container;
  }
}

class ZoomControl extends Control {
  constructor(options = {}) {
    super(Object.assign({ position: 'topleft' }, options));
  }

  onAdd(map) {
    const el = document.createElement('div');
    el.className = 'rustyleaf-zoom-control';
    el.style.cssText = 'display:flex;flex-direction:column;';
    const plus = document.createElement('button');
    plus.textContent = '+';
    const minus = document.createElement('button');
    minus.textContent = '−';
    [plus, minus].forEach((b) => {
      b.style.cssText = 'width:30px;height:30px;font-size:18px;cursor:pointer;border:1px solid #ccc;background:#fff;';
    });
    plus.addEventListener('click', () => map.zoomIn());
    minus.addEventListener('click', () => map.zoomOut());
    el.appendChild(plus);
    el.appendChild(minus);
    return el;
  }
}

class AttributionControl extends Control {
  constructor(options = {}) {
    super(Object.assign({ position: 'bottomright', prefix: 'Rustyleaf' }, options));
    this._attributions = [];
    this._prefix = this.options.prefix;
  }

  onAdd(map) {
    const el = document.createElement('div');
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

  getAttributions() {
    return this._attributions.slice();
  }

  setPrefix(prefix) {
    this._prefix = prefix;
    this._update();
    return this;
  }

  getPrefix() {
    return this._prefix;
  }

  _update() {
    if (!this._container) return;
    const parts = [];
    if (this._prefix) parts.push(this._prefix);
    parts.push.apply(parts, this._attributions);
    this._container.innerHTML = parts.join(' | ');
  }
}

class ScaleControl extends Control {
  constructor(options = {}) {
    super(Object.assign({ position: 'bottomleft', maxWidth: 100, imperial: true, metric: true }, options));
  }

  onAdd(map) {
    const el = document.createElement('div');
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
      this._viewHandlers = {
        move: () => this._update(map),
        zoom: () => this._update(map)
      };
      map.on('move', this._viewHandlers.move);
      map.on('zoom', this._viewHandlers.zoom);
    }
    return el;
  }

  onRemove(map) {
    if (this._viewHandlers && typeof map.off === 'function') {
      map.off('move', this._viewHandlers.move);
      map.off('zoom', this._viewHandlers.zoom);
      this._viewHandlers = null;
    }
    return this;
  }

  _update(map) {
    if (!this._containerEl || !map) return;
    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 12;
    const center = typeof map.getCenter === 'function' ? map.getCenter() : [0, 0];
    const latRad = center[0] * Math.PI / 180;
    const mpp = 156543.03392 * Math.cos(latRad) / Math.pow(2, zoom);
    const maxPx = this.options.maxWidth || 100;
    const meters = mpp * maxPx;
    const parts = [];
    // Leaflet rounds the scale to a "nice" number so the bar width matches
    // the label exactly; render metric and/or imperial per options.
    const niceNumber = (v) => {
      const pow = Math.pow(10, Math.floor(Math.log10(v)));
      const d = v / pow;
      const nice = d >= 5 ? 5 : d >= 2 ? 2 : 1;
      return nice * pow;
    };
    if (this.options.metric !== false) {
      let mLabel;
      if (meters >= 1000) {
        const km = niceNumber(meters / 1000);
        mLabel = km + ' km';
        parts.push({ text: mLabel, width: Math.round(km * 1000 / mpp) });
      } else {
        const m = niceNumber(Math.max(1, meters));
        mLabel = m + ' m';
        parts.push({ text: mLabel, width: Math.round(m / mpp) });
      }
    }
    if (this.options.imperial) {
      const feet = meters * 3.280839895;
      if (feet >= 5280) {
        const mi = niceNumber(feet / 5280);
        // miles → meters (÷3.28084 ft/m converts mi→m via ft) → pixels
        parts.push({ text: mi + ' mi', width: Math.max(1, Math.round(mi * 5280 / (mpp * 3.280839895))) });
      } else {
        const ft = niceNumber(Math.max(1, feet));
        parts.push({ text: ft + ' ft', width: Math.max(1, Math.round(ft / (mpp * 3.280839895))) });
      }
    }
    if (parts.length === 0) {
      // Match Leaflet: with both disabled nothing sensible renders — keep metric.
      parts.push({ text: Math.round(meters) + ' m', width: maxPx });
    }
    this._containerEl.innerHTML = '';
    for (const part of parts) {
      const seg = document.createElement('div');
      seg.style.cssText = `border:1px solid #777;border-top:none;box-sizing:border-box;height:4px;margin-top:2px;width:${part.width}px;overflow:hidden;`;
      seg.textContent = part.text;
      seg.style.height = 'auto';
      seg.style.border = 'none';
      const lineEl = document.createElement('div');
      lineEl.style.cssText = `border:1px solid #777;border-top:none;box-sizing:border-box;height:4px;width:${part.width}px;`;
      const labelEl = document.createElement('span');
      labelEl.textContent = part.text;
      this._containerEl.appendChild(labelEl);
      this._containerEl.appendChild(lineEl);
    }
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
    this._baseUrl = baseUrl;
  }

  // Leaflet parity: update WMS request parameters and reload tiles.
  setParams(params) {
    Object.assign(this.wmsParams, params);
    const p = this.wmsParams;
    p[p.version === '1.3.0' ? 'crs' : 'srs'] = 'EPSG:3857';
    const sep = this._baseUrl.includes('?') ? '&' : '?';
    const query = Object.entries(p)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const newUrl = `${this._baseUrl}${sep}${query}&bbox={bbox-epsg-3857}`;
    if (this._map && this._map.wasmMap && typeof this._map.wasmMap.add_tile_layer === 'function') {
      // Replace the layer in the Rust core with the updated template.
      if (typeof this._map.wasmMap.remove_tile_layer === 'function') {
        this._map.wasmMap.remove_tile_layer();
      }
      this.wasmTileLayer = new TileLayerApi(newUrl);
      this.wasmTileLayer.add_to(this._map.wasmMap);
      if (this.options.subdomains !== undefined || typeof this.options.maxZoom === 'number') {
        const subs = Array.isArray(this.options.subdomains)
          ? this.options.subdomains
          : String(this.options.subdomains || 'abc').split('');
        this._map.wasmMap.configure_tile_layer(
          subs,
          typeof this.options.minZoom === 'number' ? this.options.minZoom : 0,
          typeof this.options.maxZoom === 'number' ? this.options.maxZoom : 18,
          typeof this.options.tileSize === 'number' ? this.options.tileSize : 256
        );
      }
    } else if (this.wasmTileLayer && typeof this.wasmTileLayer.url_template !== 'undefined') {
      this.wasmTileLayer.url_template = newUrl;
    }
    return this;
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

// Leaflet-style layers control: checkboxes for overlays, radios for base layers.
class LayersControl extends Control {
  constructor(baseLayers, overlays, options = {}) {
    super(Object.assign({ position: 'topright' }, options));
    this._entries = [];
    if (baseLayers) {
      for (const name of Object.keys(baseLayers)) this.addBaseLayer(baseLayers[name], name);
    }
    if (overlays) {
      for (const name of Object.keys(overlays)) this.addOverlay(overlays[name], name);
    }
  }

  addBaseLayer(layer, name) {
    this._entries.push({ layer, name, overlay: false });
    this._refresh();
    return this;
  }

  addOverlay(layer, name) {
    this._entries.push({ layer, name, overlay: true });
    this._refresh();
    return this;
  }

  removeLayer(layer) {
    this._entries = this._entries.filter((e) => e.layer !== layer);
    this._refresh();
    return this;
  }

  onAdd(map) {
    const el = document.createElement('div');
    el.className = 'rustyleaf-layers-control';
    Object.assign(el.style, {
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '4px',
      padding: '6px 8px',
      font: '12px/1.5 sans-serif',
      boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
    });
    this._container = el;
    this._refresh();
    return el;
  }

  _refresh() {
    if (!this._container) return;
    const el = this._container;
    el.innerHTML = '';
    for (const entry of this._entries) {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.cursor = 'pointer';
      const input = document.createElement('input');
      input.type = entry.overlay ? 'checkbox' : 'radio';
      if (!entry.overlay) input.name = 'rustyleaf-base-layer';
      input.checked = true;
      input.addEventListener('change', () => {
        const map = this._map;
        if (!map) return;
        if (entry.overlay) {
          if (input.checked) entry.layer.addTo(map);
          else entry.layer.remove();
        } else {
          for (const other of this._entries) {
            if (!other.overlay && other !== entry) other.layer.remove();
          }
          entry.layer.addTo(map);
        }
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + entry.name));
      el.appendChild(label);
    }
  }
}

// Export classes
export { Map, TileLayer, PointLayer, LineLayer, PolygonLayer, GeoJSONLayer, Popup, Marker, Icon, DivIcon, Tooltip, Control, ZoomControl, AttributionControl, ScaleControl, LayersControl, Circle, CircleMarker, Rectangle, LayerGroup, FeatureGroup, ImageOverlay, VideoOverlay, SVGOverlay, WMSTileLayer, GridLayer, Handler, Util };

// Default export for compatibility
export default { Map, TileLayer, PointLayer, LineLayer, PolygonLayer, GeoJSONLayer, Popup, Marker, Icon, DivIcon, Tooltip, Control, ZoomControl, AttributionControl, ScaleControl, LayersControl, Circle, CircleMarker, Rectangle, LayerGroup, FeatureGroup, ImageOverlay, VideoOverlay, SVGOverlay, WMSTileLayer, GridLayer, Handler, Util };