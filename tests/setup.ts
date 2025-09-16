// Jest setup file for Rustyleaf tests

// Create comprehensive WASM module mock before any imports
const mockWasmModule = require('./__mocks__/wasmMock');

// Mock the WASM bundle file directly
jest.mock('../dist/rustyleaf_core_bg.js', () => ({
  __wbg_set_wasm: jest.fn(),
  memory: mockWasmModule.memory,
  __wbindgen_object_drop_ref: mockWasmModule.__wbindgen_object_drop_ref,
  __wbindgen_string_new: mockWasmModule.__wbindgen_string_new,
  __wbindgen_throw: mockWasmModule.__wbindgen_throw,
  __wbindgen_realloc: mockWasmModule.__wbindgen_realloc,
  __wbindgen_malloc: mockWasmModule.__wbindgen_malloc,
  rustyleafmap_new: mockWasmModule.rustyleafmap_new,
  rustyleafmap_init_canvas: mockWasmModule.rustyleafmap_init_canvas,
  rustyleafmap_render: mockWasmModule.rustyleafmap_render,
  rustyleafmap_set_view: mockWasmModule.rustyleafmap_set_view,
  rustyleafmap_get_center: mockWasmModule.rustyleafmap_get_center,
  rustyleafmap_get_zoom: mockWasmModule.rustyleafmap_get_zoom,
  rustyleafmap_pan: mockWasmModule.rustyleafmap_pan,
  rustyleafmap_zoom_in: mockWasmModule.rustyleafmap_zoom_in,
  rustyleafmap_zoom_out: mockWasmModule.rustyleafmap_zoom_out,
  rustyleafmap_set_min_zoom: mockWasmModule.rustyleafmap_set_min_zoom,
  rustyleafmap_set_max_zoom: mockWasmModule.rustyleafmap_set_max_zoom,
  rustyleafmap_get_bounds: mockWasmModule.rustyleafmap_get_bounds,
  rustyleafmap_fit_bounds: mockWasmModule.rustyleafmap_fit_bounds,
  rustyleafmap_project: mockWasmModule.rustyleafmap_project,
  rustyleafmap_unproject: mockWasmModule.rustyleafmap_unproject,
  rustyleafmap_screen_xy: mockWasmModule.rustyleafmap_screen_xy,
  rustyleafmap_resize: mockWasmModule.rustyleafmap_resize,
  rustyleafmap_add_tile_layer: mockWasmModule.rustyleafmap_add_tile_layer,
  rustyleafmap_add_point_layer: mockWasmModule.rustyleafmap_add_point_layer,
  rustyleafmap_add_line_layer: mockWasmModule.rustyleafmap_add_line_layer,
  rustyleafmap_add_polygon_layer: mockWasmModule.rustyleafmap_add_polygon_layer,
  rustyleafmap_add_geojson_layer: mockWasmModule.rustyleafmap_add_geojson_layer,
  rustyleafmap_add_points: mockWasmModule.rustyleafmap_add_points,
  rustyleafmap_add_lines: mockWasmModule.rustyleafmap_add_lines,
  rustyleafmap_add_polygons: mockWasmModule.rustyleafmap_add_polygons,
  tilelayerapi_new: mockWasmModule.tilelayerapi_new,
  tilelayerapi_add_to: mockWasmModule.tilelayerapi_add_to,
  pointlayerapi_new: mockWasmModule.pointlayerapi_new,
  pointlayerapi_add: mockWasmModule.pointlayerapi_add,
  pointlayerapi_clear: mockWasmModule.pointlayerapi_clear,
  pointlayerapi_on_click: mockWasmModule.pointlayerapi_on_click,
  pointlayerapi_on_hover: mockWasmModule.pointlayerapi_on_hover,
  RustyleafMap: mockWasmModule.RustyleafMap,
  TileLayerApi: mockWasmModule.TileLayerApi,
  PointLayerApi: mockWasmModule.PointLayerApi,
  WasmPointLayer: mockWasmModule.PointLayerApi,
  wasm: {
    __wbindgen_malloc: mockWasmModule.__wbindgen_malloc,
    __wbindgen_realloc: mockWasmModule.__wbindgen_realloc,
    __wbindgen_object_drop_ref: mockWasmModule.__wbindgen_object_drop_ref,
    __wbindgen_string_new: mockWasmModule.__wbindgen_string_new,
    __wbindgen_throw: mockWasmModule.__wbindgen_throw,
    tilelayerapi_new: mockWasmModule.tilelayerapi_new,
    memory: mockWasmModule.memory
  }
}), { virtual: true });

// Extend global interface for test utilities
declare global {
  var createMockMap: () => any;
  var createMockTileLayer: () => any;
  var createMockPointLayer: () => any;
}

// Mock WebGL context for tests
const mockWebGLContext = {
  clear: jest.fn(),
  clearColor: jest.fn(),
  viewport: jest.fn(),
  createShader: jest.fn(),
  shaderSource: jest.fn(),
  compileShader: jest.fn(),
  getShaderParameter: jest.fn(() => true),
  createProgram: jest.fn(),
  attachShader: jest.fn(),
  linkProgram: jest.fn(),
  getProgramParameter: jest.fn(() => true),
  useProgram: jest.fn(),
  createBuffer: jest.fn(),
  bindBuffer: jest.fn(),
  bufferData: jest.fn(),
  enableVertexAttribArray: jest.fn(),
  vertexAttribPointer: jest.fn(),
  drawArrays: jest.fn(),
  getExtension: jest.fn((name) => {
    if (name === 'WEBGL_debug_renderer_info') {
      return { UNMASKED_RENDERER_WEBGL: 0x9246 };
    }
    return null;
  }),
  getParameter: jest.fn((param) => {
    if (param === 0x9246) return 'Mock WebGL Renderer';
    if (param === 0x0D33) return 8192; // MAX_TEXTURE_SIZE
    return 0;
  }),
  getSupportedExtensions: jest.fn(() => [
    'WEBGL_debug_renderer_info',
    'WEBGL_lose_context',
    'OES_texture_float',
    'OES_element_index_uint'
  ]),
  createTexture: jest.fn(),
  bindTexture: jest.fn(),
  texParameteri: jest.fn(),
  texImage2D: jest.fn(),
  createVertexArray: jest.fn(() => ({})),
  bindVertexArray: jest.fn(),
  getUniformLocation: jest.fn(() => ({})),
  uniformMatrix4fv: jest.fn(),
};

// Make WasmPointLayer available globally for tests
global.WasmPointLayer = require('./__mocks__/wasmMock').PointLayerApi;

// Add TextEncoder for streaming tests
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Mock HTMLCanvasElement with proper WebGL support
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: jest.fn(function(contextType) {
    if (contextType === 'webgl2' || contextType === 'webgl' || contextType === 'experimental-webgl') {
      return mockWebGLContext;
    }
    return null;
  }),
});

// Mock getBoundingClientRect for containers
Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  value: jest.fn(() => ({
    width: 800,
    height: 600,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600
  })),
});

// Mock window.performance
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
  },
});

// Global test utilities
const createMockMap = () => {
  const mockMap = {
    setView: jest.fn(),
    pan: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    add_tile_layer: jest.fn(),
    add_point_layer: jest.fn(),
    add_points: jest.fn(),
    render: jest.fn(),
    on: jest.fn(),
    resize: jest.fn(),
    screen_xy: jest.fn(),
  };
  return mockMap;
};

const createMockTileLayer = () => ({
  addTo: jest.fn(),
  remove: jest.fn(),
});

const createMockPointLayer = () => ({
  add: jest.fn(),
  clear: jest.fn(),
  addTo: jest.fn(),
  remove: jest.fn(),
  on: jest.fn(),
  on_click: jest.fn(),
  on_hover: jest.fn(),
});

// Make functions available globally and for export
global.createMockMap = createMockMap;
global.createMockTileLayer = createMockTileLayer;
global.createMockPointLayer = createMockPointLayer;

// Export for other test files
export { createMockMap, createMockTileLayer, createMockPointLayer };

// Test timeout for async operations
jest.setTimeout(10000);

// Console error suppression for tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn((...args) => {
    // Only show critical errors, suppress expected WebGL/WASM warnings
    if (!args.some(arg =>
      typeof arg === 'string' && (
        arg.includes('WebGL') ||
        arg.includes('WASM') ||
        arg.includes('rustyleaf')
      )
    )) {
      originalError(...args);
    }
  });
});

// Reset mock state before each test for isolation
beforeEach(() => {
  const mockWasmModule = require('./__mocks__/wasmMock');
  if (mockWasmModule.resetMockState) {
    mockWasmModule.resetMockState();
  }
});

afterAll(() => {
  console.error = originalError;
});