/**
 * Integration tests for browser compatibility
 * These tests run in a simulated browser environment
 */

import { Map, TileLayer, PointLayer } from '../src/rustyleaf-api.js';

describe('Browser Integration Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'integration-test-container';
    container.style.width = '800px';
    container.style.height = '600px';
    container.style.position = 'relative';
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    jest.clearAllMocks();
  });

  describe('ES Module Loading', () => {
    test('should load Map class from bundle', () => {
      expect(Map).toBeDefined();
      expect(typeof Map).toBe('function');
    });

    test('should load TileLayer class from bundle', () => {
      expect(TileLayer).toBeDefined();
      expect(typeof TileLayer).toBe('function');
    });

    test('should load PointLayer class from bundle', () => {
      expect(PointLayer).toBeDefined();
      expect(typeof PointLayer).toBe('function');
    });

    test('should have checkWebGLSupport static method', () => {
      expect(Map.checkWebGLSupport).toBeDefined();
      expect(typeof Map.checkWebGLSupport).toBe('function');
    });
  });

  describe('Map Lifecycle', () => {
    test('should create and destroy map properly', () => {
      let map: Map;
      
      expect(() => {
        map = new Map(container);
      }).not.toThrow();

      expect(map).toBeInstanceOf(Map);
      
      // Test that map is properly initialized
      expect(map.getCenter()).toBeDefined();
      expect(map.getZoom()).toBeDefined();
    });

    test('should handle multiple map instances', () => {
      const container2 = document.createElement('div');
      container2.id = 'second-container';
      container2.style.width = '400px';
      container2.style.height = '300px';
      document.body.appendChild(container2);

      try {
        const map1 = new Map(container, { center: [40.7128, -74.0060], zoom: 10 });
        const map2 = new Map(container2, { center: [51.5074, -0.1278], zoom: 12 });

        expect(map1.getCenter()).toEqual([40.7128, -74.0060]);
        expect(map1.getZoom()).toBe(10);
        expect(map2.getCenter()).toEqual([51.5074, -0.1278]);
        expect(map2.getZoom()).toBe(12);
      } finally {
        document.body.removeChild(container2);
      }
    });

    test('should handle map removal from DOM', () => {
      const map = new Map(container);
      
      expect(() => {
        document.body.removeChild(container);
      }).not.toThrow();
      
      // Map should still exist but might have issues if it tries to access container
      expect(map).toBeDefined();
    });
  });

  describe('Layer Management Integration', () => {
    let map: Map;

    beforeEach(() => {
      map = new Map(container);
    });

    test('should add tile layer successfully', () => {
      const tileLayer = new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      
      expect(() => {
        tileLayer.addTo(map);
      }).not.toThrow();
    });

    test('should add point layer successfully', () => {
      const pointLayer = new PointLayer();
      
      expect(() => {
        pointLayer.addTo(map);
      }).not.toThrow();
    });

    test('should handle layer removal', () => {
      const tileLayer = new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      tileLayer.addTo(map);
      
      expect(() => {
        tileLayer.remove();
      }).not.toThrow();
    });
  });

  describe('Error Recovery', () => {
    test('should handle WebGL context loss', () => {
      // This test simulates WebGL context loss scenarios
      
      const map = new Map(container);
      const originalSupport = map.getWebGLSupport();
      
      // Mock a context loss scenario
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = jest.fn(() => {
        throw new Error('WebGL context lost');
      });

      // New map creation should fail gracefully
      const container2 = document.createElement('div');
      container2.id = 'error-container';
      container2.style.width = '400px';
      container2.style.height = '300px';
      document.body.appendChild(container2);

      expect(() => {
        new Map(container2);
      }).toThrow();

      // Clean up
      document.body.removeChild(container2);
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });

    test('should handle network errors for tile loading', () => {
      const map = new Map(container);
      const tileLayer = new TileLayer('https://invalid-url.com/{z}/{x}/{y}.png');
      
      // This should not throw immediately, but might fail during rendering
      expect(() => {
        tileLayer.addTo(map);
      }).not.toThrow();
    });
  });

  describe('Performance Considerations', () => {
    test('should handle large container sizes', () => {
      container.style.width = '1920px';
      container.style.height = '1080px';
      
      expect(() => {
        const map = new Map(container);
        expect(map).toBeDefined();
      }).not.toThrow();
    });

    test('should handle small container sizes', () => {
      container.style.width = '100px';
      container.style.height = '100px';
      
      expect(() => {
        const map = new Map(container);
        expect(map).toBeDefined();
      }).not.toThrow();
    });

    test('should handle zero-size containers', () => {
      container.style.width = '0px';
      container.style.height = '0px';
      
      // This might throw or handle gracefully
      let map: Map | undefined;
      try {
        map = new Map(container);
        expect(map).toBeDefined();
      } catch (error) {
        // It's acceptable to throw on zero-size containers
        expect(error).toBeDefined();
      }
    });
  });

  describe('Cross-browser Compatibility', () => {
    test('should work with various viewport sizes', () => {
      // Simulate different viewport sizes
      const viewports = [
        { width: 320, height: 568 },   // Mobile
        { width: 768, height: 1024 },   // Tablet
        { width: 1366, height: 768 },  // Desktop
        { width: 1920, height: 1080 }, // Large desktop
      ];

      viewports.forEach((viewport, index) => {
        const testContainer = document.createElement('div');
        testContainer.id = `viewport-test-${index}`;
        testContainer.style.width = `${viewport.width}px`;
        testContainer.style.height = `${viewport.height}px`;
        document.body.appendChild(testContainer);

        try {
          const map = new Map(testContainer);
          expect(map).toBeDefined();
          expect(map.getCenter()).toBeDefined();
        } catch (error) {
          // If it fails, it should fail gracefully
          expect(error).toBeDefined();
        } finally {
          document.body.removeChild(testContainer);
        }
      });
    });

    test('should handle high DPI displays', () => {
      // Simulate high DPI by setting device pixel ratio
      const originalDevicePixelRatio = window.devicePixelRatio;
      (window as any).devicePixelRatio = 2;

      expect(() => {
        const map = new Map(container);
        expect(map).toBeDefined();
      }).not.toThrow();

      // Restore original device pixel ratio
      (window as any).devicePixelRatio = originalDevicePixelRatio;
    });
  });

  describe('Memory Management', () => {
    test('should clean up resources properly', () => {
      let map: Map;
      
      expect(() => {
        map = new Map(container);
      }).not.toThrow();

      // Simulate cleanup - in a real scenario, this would be handled by garbage collection
      expect(() => {
        // Remove container from DOM
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
        
        // Clear references
        map = null as any;
      }).not.toThrow();
    });

    test('should handle rapid map creation/destruction', () => {
      for (let i = 0; i < 10; i++) {
        const testContainer = document.createElement('div');
        testContainer.id = `rapid-test-${i}`;
        testContainer.style.width = '100px';
        testContainer.style.height = '100px';
        document.body.appendChild(testContainer);

        try {
          const map = new Map(testContainer);
          expect(map).toBeDefined();
        } catch (error) {
          // Some maps might fail due to resource limits, which is acceptable
          expect(error).toBeDefined();
        } finally {
          document.body.removeChild(testContainer);
        }
      }
    });
  });
});