/**
 * PointLayer unit tests
 */

import { PointLayer } from '../src/rustyleaf-api.js';

describe('PointLayer', () => {
  describe('Constructor', () => {
    test('should create point layer with default properties', () => {
      const pointLayer = new PointLayer();
      
      expect(pointLayer).toBeInstanceOf(PointLayer);
      expect(pointLayer.points).toEqual([]);
      expect(pointLayer.wasmPointLayer).toBeDefined();
    });
  });

  describe('add method', () => {
    test('should add single point with default values', () => {
      const pointLayer = new PointLayer();
      const point = { lat: 40.7128, lng: -74.0060 };
      
      const result = pointLayer.add([point]);
      
      expect(result).toBe(pointLayer); // Method chaining
      expect(pointLayer.points).toHaveLength(1);
      expect(pointLayer.points[0]).toEqual(point); // Should store original point
    });

    test('should add multiple points', () => {
      const pointLayer = new PointLayer();
      const points = [
        { lat: 40.7128, lng: -74.0060 },
        { lat: 40.7589, lng: -73.9851 },
        { lat: 40.6892, lng: -74.0445 }
      ];
      
      const result = pointLayer.add(points);
      
      expect(result).toBe(pointLayer);
      expect(pointLayer.points).toHaveLength(3);
    });

    test('should add points with custom properties', () => {
      const pointLayer = new PointLayer();
      const points = [
        { lat: 40.7128, lng: -74.0060, size: 10, color: '#00ff00', meta: { name: 'NYC' } },
        { lat: 40.7589, lng: -73.9851, size: 8, color: '#0000ff', meta: { name: 'Times Square' } }
      ];
      
      pointLayer.add(points);
      
      expect(pointLayer.points[0]).toEqual({
        lat: 40.7128,
        lng: -74.0060,
        size: 10,
        color: '#00ff00',
        meta: { name: 'NYC' }
      });
    });

    test('should handle empty points array', () => {
      const pointLayer = new PointLayer();
      
      const result = pointLayer.add([]);
      
      expect(result).toBe(pointLayer);
      expect(pointLayer.points).toHaveLength(0);
    });

    test('should handle null/undefined points', () => {
      const pointLayer = new PointLayer();
      
      expect(() => {
        pointLayer.add(null as any);
      }).toThrow("Cannot read properties of null (reading 'map')");
      
      expect(() => {
        pointLayer.add(undefined as any);
      }).toThrow("Cannot read properties of undefined (reading 'map')");
    });
  });

  describe('clear method', () => {
    test('should clear all points', () => {
      const pointLayer = new PointLayer();
      const points = [
        { lat: 40.7128, lng: -74.0060 },
        { lat: 40.7589, lng: -73.9851 }
      ];
      
      pointLayer.add(points);
      expect(pointLayer.points).toHaveLength(2);
      
      const result = pointLayer.clear();
      
      expect(result).toBe(pointLayer); // Method chaining
      expect(pointLayer.points).toHaveLength(0);
    });

    test('should handle clear on empty layer', () => {
      const pointLayer = new PointLayer();
      
      const result = pointLayer.clear();
      
      expect(result).toBe(pointLayer);
      expect(pointLayer.points).toHaveLength(0);
    });

    test('should handle multiple clear calls', () => {
      const pointLayer = new PointLayer();
      const points = [{ lat: 40.7128, lng: -74.0060 }];
      
      pointLayer.add(points);
      pointLayer.clear();
      pointLayer.clear();
      
      expect(pointLayer.points).toHaveLength(0);
    });
  });

  describe('on method', () => {
    test('should register click event handler', () => {
      const pointLayer = new PointLayer();
      const callback = jest.fn();
      
      const result = pointLayer.on('click', callback);
      
      expect(result).toBe(pointLayer); // Method chaining
    });

    test('should register hover event handler', () => {
      const pointLayer = new PointLayer();
      const callback = jest.fn();
      
      const result = pointLayer.on('hover', callback);
      
      expect(result).toBe(pointLayer);
    });

    test('should handle unsupported event types', () => {
      const pointLayer = new PointLayer();
      const callback = jest.fn();
      
      expect(() => {
        pointLayer.on('unsupported' as any, callback);
      }).not.toThrow();
    });

    test('should handle null/undefined callback', () => {
      const pointLayer = new PointLayer();
      
      expect(() => {
        pointLayer.on('click', null as any);
      }).not.toThrow();
      
      expect(() => {
        pointLayer.on('hover', undefined as any);
      }).not.toThrow();
    });
  });

  describe('addTo method', () => {
    test('should add layer to map', () => {
      const pointLayer = new PointLayer();
      const points = [{ lat: 40.7128, lng: -74.0060 }];
      pointLayer.add(points);
      
      const mockMap = {
        wasmMap: {
          add_point_layer: jest.fn(() => 0),
          add_points: jest.fn()
        }
      };
      
      const result = pointLayer.addTo(mockMap as any);
      
      expect(result).toBe(pointLayer); // Method chaining
      expect(mockMap.wasmMap.add_point_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.add_points).toHaveBeenCalled();
    });

    test('should handle empty points when adding to map', () => {
      const pointLayer = new PointLayer();
      const mockMap = {
        wasmMap: {
          add_point_layer: jest.fn(() => 0),
          add_points: jest.fn()
        }
      };
      
      const result = pointLayer.addTo(mockMap as any);
      
      expect(result).toBe(pointLayer);
      expect(mockMap.wasmMap.add_point_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.add_points).toHaveBeenCalledWith(expect.any(Number), []);
    });

    test('should handle map without wasmMap property', () => {
      const pointLayer = new PointLayer();
      const mockMap = {};
      
      expect(() => {
        pointLayer.addTo(mockMap as any);
      }).toThrow("Cannot read properties of undefined (reading 'add_point_layer')");
    });
  });

  describe('remove method', () => {
    test('should return this for method chaining', () => {
      const pointLayer = new PointLayer();
      
      const result = pointLayer.remove();
      
      expect(result).toBe(pointLayer);
    });

    test('should handle multiple remove calls', () => {
      const pointLayer = new PointLayer();
      
      expect(() => {
        pointLayer.remove();
        pointLayer.remove();
      }).not.toThrow();
    });
  });

  describe('Data validation', () => {
    test('should handle invalid coordinate values', () => {
      const pointLayer = new PointLayer();
      const invalidPoints = [
        { lat: null, lng: -74.0060 },
        { lat: 40.7128, lng: undefined },
        { lat: 'invalid', lng: -74.0060 },
        { lat: 40.7128, lng: 'invalid' },
        { lat: Infinity, lng: -74.0060 },
        { lat: 40.7128, lng: NaN }
      ];
      
      invalidPoints.forEach(point => {
        expect(() => {
          pointLayer.add([point as any]);
        }).not.toThrow();
      });
    });

    test('should handle invalid size and color values', () => {
      const pointLayer = new PointLayer();
      const invalidPoints = [
        { lat: 40.7128, lng: -74.0060, size: 'invalid' },
        { lat: 40.7128, lng: -74.0060, color: null },
        { lat: 40.7128, lng: -74.0060, size: -5 },
        { lat: 40.7128, lng: -74.0060, color: 12345 }
      ];
      
      invalidPoints.forEach(point => {
        expect(() => {
          pointLayer.add([point as any]);
        }).not.toThrow();
      });
    });
  });

  describe('Method chaining', () => {
    test('should support method chaining for multiple operations', () => {
      const pointLayer = new PointLayer();
      const points = [{ lat: 40.7128, lng: -74.0060 }];
      const mockMap = {
        wasmMap: {
          add_point_layer: jest.fn(() => 0),
          add_points: jest.fn()
        }
      };
      
      const result = pointLayer
        .add(points)
        .on('click', jest.fn())
        .addTo(mockMap as any)
        .clear();
      
      expect(result).toBe(pointLayer);
    });
  });

  describe('WASM integration', () => {
    test('should handle WASM layer errors gracefully', () => {
      const originalWasmPointLayer = global.WasmPointLayer;
      
      // Mock WASM error
      global.WasmPointLayer = jest.fn(() => {
        throw new Error('WASM layer creation failed');
      });
      
      expect(() => {
        new PointLayer();
      }).toThrow('WASM layer creation failed');
      
      // Restore original
      global.WasmPointLayer = originalWasmPointLayer;
    });

    test('should handle WASM method call errors', () => {
      const pointLayer = new PointLayer();
      const points = [{ lat: 40.7128, lng: -74.0060 }];
      
      // Mock WASM method error
      const originalAdd = pointLayer.wasmPointLayer.add;
      pointLayer.wasmPointLayer.add = jest.fn(() => {
        throw new Error('WASM add failed');
      });
      
      expect(() => {
        pointLayer.add(points);
      }).toThrow('WASM add failed');
      
      // Restore original
      pointLayer.wasmPointLayer.add = originalAdd;
    });
  });
});