// Jest setup file for Rustyleaf tests

// Extend global interface for test utilities
// eslint-disable-next-line no-var -- `var` is required syntax in ambient declarations
declare global {
  /* eslint-disable no-var */
  var createMockMap: () => any;
  var createMockTileLayer: () => any;
  var createMockPointLayer: () => any;
  /* eslint-enable no-var */
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
  // wasmMock is loaded via moduleNameMapper, not direct require
  try {
    const mockWasmModule = require('./__mocks__/wasmMock');
    if (mockWasmModule && mockWasmModule.resetMockState) {
      mockWasmModule.resetMockState();
    }
  } catch (e) {
    // wasmMock uses ESM exports — skip reset if require fails
  }
});

afterAll(() => {
  console.error = originalError;
});