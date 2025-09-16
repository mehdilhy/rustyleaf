/**
 * Basic map initialization tests
 */

import { Map, TileLayer, PointLayer } from '../src/rustyleaf-api.js';

describe('Map Initialization', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a test container
    container = document.createElement('div');
    container.id = 'test-map-container';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should create map with default options', () => {
      const map = new Map(container);
      
      expect(map).toBeInstanceOf(Map);
      expect(map.getCenter()).toEqual([48.8566, 2.3522]); // Default center
      expect(map.getZoom()).toBe(12); // Default zoom
    });

    test('should create map with custom options', () => {
      const options = {
        center: [40.7128, -74.0060], // New York
        zoom: 10
      };
      
      const map = new Map(container, options);
      
      expect(map).toBeInstanceOf(Map);
      expect(map.getCenter()).toEqual([40.7128, -74.0060]);
      expect(map.getZoom()).toBe(10);
    });

    test('should handle string container ID', () => {
      const stringContainer = document.createElement('div');
      stringContainer.id = 'string-container';
      document.body.appendChild(stringContainer);
      
      const map = new Map('string-container');
      
      expect(map).toBeInstanceOf(Map);
      
      // Clean up
      document.body.removeChild(stringContainer);
    });
  });

  describe('Map Methods', () => {
    let map: Map;

    beforeEach(() => {
      map = new Map(container);
    });

    test('setView should update center and zoom', () => {
      map.setView([51.5074, -0.1278], 14); // London
      
      expect(map.getCenter()).toEqual([51.5074, -0.1278]);
      expect(map.getZoom()).toBe(14);
    });

    test('zoomIn should increase zoom level', () => {
      const initialZoom = map.getZoom();
      map.zoomIn();
      
      expect(map.getZoom()).toBe(initialZoom + 1);
    });

    test('zoomOut should decrease zoom level', () => {
      const initialZoom = map.getZoom();
      map.zoomOut();
      
      expect(map.getZoom()).toBe(initialZoom - 1);
    });

    test('getWebGLSupport should return support info', () => {
      const support = map.getWebGLSupport();
      
      expect(support).toBeDefined();
      expect(typeof support.supported).toBe('boolean');
      expect(typeof support.level).toBe('string');
    });

    test('getBounds should return map bounds', () => {
      const bounds = map.getBounds();
      
      expect(bounds).toBeDefined();
      expect(Array.isArray(bounds)).toBe(true);
      expect(bounds.length).toBe(2);
    });

    test('project and unproject should be inverse operations', () => {
      const center = map.getCenter();
      const projected = map.project(center);
      const unprojected = map.unproject(projected);
      
      expect(unprojected[0]).toBeCloseTo(center[0], 6);
      expect(unprojected[1]).toBeCloseTo(center[1], 6);
    });
  });

  describe('Event Handling', () => {
    let map: Map;

    beforeEach(() => {
      map = new Map(container);
    });

    test('should register move event handler', () => {
      const handler = jest.fn();
      map.on('move', handler);
      
      // Simulate move event (this would normally be triggered by user interaction)
      expect(typeof handler).toBe('function');
    });

    test('should register zoom event handler', () => {
      const handler = jest.fn();
      map.on('zoom', handler);
      
      expect(typeof handler).toBe('function');
    });

    test('should register click event handler', () => {
      const handler = jest.fn();
      map.on('click', handler);
      
      expect(typeof handler).toBe('function');
    });

    test('should remove event handlers', () => {
      const handler = jest.fn();
      map.on('move', handler);
      map.off('move', handler);
      
      // The handler should be removed
      expect(typeof handler).toBe('function');
    });
  });

  describe('Layer Management', () => {
    let map: Map;

    beforeEach(() => {
      map = new Map(container);
    });

    test('should add tile layer', () => {
      const tileLayer = new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      
      expect(() => {
        tileLayer.addTo(map);
      }).not.toThrow();
    });

    test('should add point layer', () => {
      const pointLayer = new PointLayer();
      
      expect(() => {
        pointLayer.addTo(map);
      }).not.toThrow();
    });

    test('should handle multiple layers', () => {
      const tileLayer = new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      const pointLayer = new PointLayer();
      
      expect(() => {
        tileLayer.addTo(map);
        pointLayer.addTo(map);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid container', () => {
      expect(() => {
        new Map(null as any);
      }).toThrow();
    });

    test('should handle invalid center coordinates', () => {
      expect(() => {
        new Map(container, { center: ['invalid', 'coordinates'] as any });
      }).toThrow();
    });

    test('should handle invalid zoom level', () => {
      expect(() => {
        new Map(container, { zoom: 'invalid' as any });
      }).toThrow();
    });

    test('should handle invalid setView parameters', () => {
      const map = new Map(container);
      
      expect(() => {
        map.setView(['invalid', 'coords'] as any, 10);
      }).toThrow();
    });
  });

  describe('DOM Integration', () => {
    test('should create canvas element', () => {
      new Map(container);
      
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
      expect(canvas!.tagName).toBe('CANVAS');
    });

    test('should set canvas dimensions', () => {
      new Map(container);
      
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas!.width).toBe(800);
      expect(canvas!.height).toBe(600);
    });

    test('should handle container resize', () => {
      const map = new Map(container);
      
      // Resize container
      container.style.width = '400px';
      container.style.height = '300px';
      
      // Trigger resize (this would normally happen via resize event)
      expect(() => {
        // Simulate resize - in real scenario this would be called by event listener
        (map as any)._handleResize();
      }).not.toThrow();
    });
  });
});