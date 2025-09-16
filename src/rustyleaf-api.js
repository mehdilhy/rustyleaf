// JavaScript wrapper for Rustyleaf WASM library
// Provides Leaflet-style API as specified in specs.md

// Import low-level WASM bindings and module namespace; we'll initialize manually via fetch
import { RustyleafMap, TileLayerApi, PointLayerApi } from '../dist/rustyleaf_core_bg.js';
import * as __rustyleaf_wasm_bg from '../dist/rustyleaf_core_bg.js';

// Ensure WASM is initialized before any usage
let __rustyleaf_wasm_ready_promise;
async function __ensureRustyleafWasmReady() {
  if (!__rustyleaf_wasm_ready_promise) {
    __rustyleaf_wasm_ready_promise = (async () => {
      const wasmUrl = new URL('../dist/rustyleaf_core_bg.wasm', import.meta.url);
      try {
        if (WebAssembly.instantiateStreaming) {
          const resp = await fetch(wasmUrl);
          const { instance } = await WebAssembly.instantiateStreaming(resp, { "./rustyleaf_core_bg.js": __rustyleaf_wasm_bg });
          __rustyleaf_wasm_bg.__wbg_set_wasm(instance.exports);
          if (instance.exports && typeof instance.exports.__wbindgen_start === 'function') {
            instance.exports.__wbindgen_start();
          }
        } else {
          const bytes = await fetch(wasmUrl).then(r => r.arrayBuffer());
          const { instance } = await WebAssembly.instantiate(bytes, { "./rustyleaf_core_bg.js": __rustyleaf_wasm_bg });
          __rustyleaf_wasm_bg.__wbg_set_wasm(instance.exports);
          if (instance.exports && typeof instance.exports.__wbindgen_start === 'function') {
            instance.exports.__wbindgen_start();
          }
        }
      } catch (e) {
        console.error('Failed to initialize Rustyleaf WASM:', e);
        throw e;
      }
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
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
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
    const isWebGL2 = !!canvas.getContext('webgl2');
    
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

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'rustyleaf-map-canvas';
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    // Replace container content with canvas
    this.containerElement.innerHTML = '';
    this.containerElement.appendChild(this.canvas);

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

    // Start render loop
    this._startRenderLoop();

    // Track GeoJSON layer indices locally since WASM add_geojson_layer doesn't return an index
    this._geojsonLayerCount = 0;
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

    this.wasmMap.set_view(latlng[0], latlng[1], zoom);
    return this;
  }
  
  panBy(dx, dy) {
    this.wasmMap.pan(dx, dy);
    return this;
  }
  
  zoomIn() {
    this.wasmMap.zoom_in();
    return this;
  }
  
  zoomOut() {
    this.wasmMap.zoom_out();
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
  
  project(latlng) {
    const point = this.wasmMap.project(latlng);
    return [point[0], point[1]];
  }
  
  unproject(point) {
    const latlng = this.wasmMap.unproject(point);
    return [latlng[0], latlng[1]];
  }
  
  on(event, callback) {
    const eventMap = {
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
    
    const wasmMethod = eventMap[event];
    if (wasmMethod) {
      this.wasmMap[wasmMethod](callback);
    }
    return this;
  }

  off(event, callback) {
    const eventMap = {
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
    
    const wasmMethod = eventMap[event];
    if (wasmMethod) {
      this.wasmMap[wasmMethod](callback);
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
      if (e.button === 0) { // Left mouse button only
        isDragging = true;
        hasDragged = false;
        // Convert screen coordinates to canvas coordinates (accounting for scaling)
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        dragStartX = (e.clientX - rect.left) * scaleX;
        dragStartY = (e.clientY - rect.top) * scaleY;
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

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wasmMap.on_wheel(e.deltaY, e.clientX, e.clientY);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.wasmMap.handle_contextmenu(e.clientX, e.clientY);
    });

    window.addEventListener('resize', () => {
      this._handleResize();
    });
  }
  
  _handleResize() {
    const rect = this.containerElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.wasmMap.resize(this.width, this.height);
  }
  
  _startRenderLoop() {
    const render = () => {
      this.wasmMap.render(this.canvas.id);
      requestAnimationFrame(render);
    };
    render();
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
    this.wasmTileLayer.add_to(map.wasmMap);
    return this;
  }
  
  remove() {
    // Implementation for removing layer
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
    this.points.push(...points);
    return this;
  }
  
  clear() {
    this.points = [];
    // Reset WASM layer
    this.wasmPointLayer = new WasmPointLayer();
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
    const layerIndex = map.wasmMap.add_point_layer();
    map.wasmMap.add_points(layerIndex, this.points);
    return this;
  }
  
  remove() {
    // Implementation for removing layer
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
    
    this.lines.push(...linesData);
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
    const layerIndex = map.wasmMap.add_line_layer();
    map.wasmMap.add_lines(layerIndex, this.lines);
    this.map = map;
    return this;
  }
  
  remove() {
    // Implementation for removing layer
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
    this._updatePosition();
    this._handleAutoPan();

    try {
      map.containerElement.appendChild(this.element);
      this.isOpen = true;
    } catch (error) {
      console.warn('Popup: Failed to append popup to map container:', error);
      return this;
    }
    
    // Add close button if enabled
    if (this.options.closeButton) {
      this._addCloseButton();
    }
    
    // Add event listeners
    this._addEventListeners();
    
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
      
      // Animate the pan
      this.map.panTo(newCenter, { animate: true, duration: 0.25 });
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
    if (this.options.autoClose) {
      // Close popup when clicking on the map
      this.map.on('click', this._onMapClick, this);
    }
    
    // Handle window resize
    window.addEventListener('resize', this._handleResize.bind(this));
    
    // Handle map move/zoom to update position
    this.map.on('move', this._updatePosition.bind(this));
    this.map.on('zoom', this._updatePosition.bind(this));
  }
  
  _removeEventListeners() {
    if (this.options.autoClose && this.map) {
      this.map.off('click', this._onMapClick, this);
    }
    
    window.removeEventListener('resize', this._handleResize.bind(this));
    
    if (this.map) {
      this.map.off('move', this._updatePosition.bind(this));
      this.map.off('zoom', this._updatePosition.bind(this));
    }
  }
  
  _onMapClick(e) {
    // Don't close if clicking on the popup itself or its source
    if (this.element && this.element.contains(e.target)) return;
    if (this._source && e.target === this._source.getElement) return;
    
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
    
    this.polygons.push(...polygonsData);
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
    const layerIndex = map.wasmMap.add_polygon_layer();
    map.wasmMap.add_polygons(layerIndex, this.polygons);
    this.map = map;
    return this;
  }
  
  remove() {
    // Implementation for removing layer
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
  }

  // Load GeoJSON data
  loadData(geojson) {
    // Prevent loading the same data multiple times
    if (this.dataLoaded) {
      console.log('GeoJSONLayer: Data already loaded, skipping');
      return this;
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
    while (true) {
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
    this.map = map;
    // WASM method does not return index; track index on the Map instance
    map.wasmMap.add_geojson_layer();
    if (typeof map._geojsonLayerCount !== 'number') {
      map._geojsonLayerCount = 0;
    }
    this.layerIndex = map._geojsonLayerCount;
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
      console.log('GeoJSONLayer: Adding to map with existing data');
      const geojsonString = typeof this.geojson === 'string'
        ? this.geojson
        : JSON.stringify(this.geojson);
      map.wasmMap.load_geojson(this.layerIndex, geojsonString);
      this.updateStyle();
    } else {
      console.log('GeoJSONLayer: Adding to map but no data yet');
    }

    return this;
  }

  // Event handlers
  on(event, callback) {
    if (event === 'click') {
      this.clickCallback = callback;
    } else if (event === 'hover') {
      this.hoverCallback = callback;
    }
    return this;
  }

  // Remove layer from map
  remove() {
    if (this.map) {
      // Implementation for removing layer
      this.map = null;
    }
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

  // Get features in current view
  getFeaturesInBounds(bounds) {
    // Implementation for spatial filtering
    return [];
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

  // Load GeoJSON from URL using Rust-based processing
  loadFromUrl(url, options = {}) {
    const {
      progressCallback = null,
      completeCallback = null,
      errorCallback = null
    } = options;

    return new Promise((resolve, reject) => {
      try {
        // Use Rust-based URL loading
        this.map.wasmMap.load_geojson_from_url(this.layerIndex, url);

        // Poll for the data to be available with timeout
        const startTime = Date.now();
        const TIMEOUT_MS = 30000; // 30 second timeout
        const state = { done: false };

        const checkForData = () => {
          // Check for timeout
          if (Date.now() - startTime > TIMEOUT_MS) {
            // Clean up potential memory leak on timeout
            delete window.rustyleafGeoJSONData;
            if (!state.done) {
              reject(new Error('GeoJSON loading timed out after 30 seconds'));
            }
            return;
          }

          if (window.rustyleafGeoJSONData) {
            try {
              if (state.done) return;
              state.done = true;
              // Get the data length before cleanup
              const dataLength = window.rustyleafGeoJSONData.length;

              // Load the actual GeoJSON data into the layer using Rust processing
              this.loadData(window.rustyleafGeoJSONData);

              // Clean up the global variable immediately after use
              delete window.rustyleafGeoJSONData;

              if (completeCallback) {
                completeCallback({
                  totalFeatures: this.getFeatureCount(),
                  totalBytes: dataLength
                });
              }

              resolve(this);
            } catch (error) {
              if (errorCallback) {
                errorCallback({
                  error: error,
                  message: 'Failed to process loaded GeoJSON data'
                });
              }
              reject(error);
            }
          } else {
            // Check again in 100ms
            setTimeout(checkForData, 100);
          }
        };

        // Start checking for data after a short delay
        setTimeout(checkForData, 100);

        // Start a JS fetch fallback in parallel (works when WASM XHR is blocked)
        fetch(url)
          .then(resp => {
            if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
            return resp.text();
          })
          .then(text => {
            if (state.done) return; // Rust path already completed
            state.done = true;
            this.loadData(text);
            if (completeCallback) {
              completeCallback({
                totalFeatures: this.getFeatureCount(),
                totalBytes: text.length
              });
            }
            resolve(this);
          })
          .catch(err => {
            // Silently ignore if Rust path succeeds; surface only if both fail via timeout
            if (errorCallback) {
              // Provide progress-style error without rejecting immediately
              errorCallback({ error: err, message: 'Fetch fallback failed (will rely on WASM XHR)' });
            }
          });

      } catch (error) {
        if (errorCallback) {
          errorCallback({
            error: error,
            message: 'Failed to load GeoJSON from URL'
          });
        }
        reject(error);
      }
    });
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

  // Get features in current view bounds
  getFeaturesInBounds(bounds) {
    // This would require spatial indexing implementation
    // For now, return all features
    return this.geojson ? (this.geojson.features || [this.geojson]) : [];
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

// Export classes
export { Map, TileLayer, PointLayer, LineLayer, PolygonLayer, GeoJSONLayer, Popup };

// Default export for compatibility
export default { Map, TileLayer, PointLayer, LineLayer, PolygonLayer, GeoJSONLayer, Popup };