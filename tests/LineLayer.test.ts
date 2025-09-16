/**
 * LineLayer unit tests
 */

import { LineLayer } from '../src/rustyleaf-api.js';

describe('LineLayer', () => {
  describe('Constructor', () => {
    test('should create line layer with default properties', () => {
      const lineLayer = new LineLayer();
      
      expect(lineLayer).toBeInstanceOf(LineLayer);
      expect(lineLayer.lines).toEqual([]);
    });
  });

  describe('add method', () => {
    test('should add single line with default values', () => {
      const lineLayer = new LineLayer();
      const line = {
        coords: [
          { lat: 40.7128, lng: -74.0060 },
          { lat: 40.7589, lng: -73.9851 }
        ]
      };
      
      const result = lineLayer.add([line]);
      
      expect(result).toBe(lineLayer); // Method chaining
      expect(lineLayer.lines).toHaveLength(1);
      expect(lineLayer.lines[0]).toEqual({
        coords: [
          { lat: 40.7128, lng: -74.0060 },
          { lat: 40.7589, lng: -73.9851 }
        ],
        color: '#ff0000',
        width: 2,
        meta: null
      });
    });

    test('should add multiple lines', () => {
      const lineLayer = new LineLayer();
      const lines = [
        {
          coords: [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 }
          ]
        },
        {
          coords: [
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7061, lng: -74.0087 }
          ]
        }
      ];
      
      const result = lineLayer.add(lines);
      
      expect(result).toBe(lineLayer);
      expect(lineLayer.lines).toHaveLength(2);
    });

    test('should add lines with custom properties', () => {
      const lineLayer = new LineLayer();
      const lines = [
        {
          coords: [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 }
          ],
          color: '#00ff00',
          width: 4,
          meta: { name: 'Line 1' }
        },
        {
          coords: [
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7061, lng: -74.0087 }
          ],
          color: '#0000ff',
          width: 3,
          meta: { name: 'Line 2' }
        }
      ];
      
      lineLayer.add(lines);
      
      expect(lineLayer.lines[0]).toEqual({
        coords: [
          { lat: 40.7128, lng: -74.0060 },
          { lat: 40.7589, lng: -73.9851 }
        ],
        color: '#00ff00',
        width: 4,
        meta: { name: 'Line 1' }
      });
    });

    test('should handle single coordinate line', () => {
      const lineLayer = new LineLayer();
      const line = {
        coords: [
          { lat: 40.7128, lng: -74.0060 }
        ]
      };
      
      const result = lineLayer.add([line]);
      
      expect(result).toBe(lineLayer);
      expect(lineLayer.lines).toHaveLength(1);
      expect(lineLayer.lines[0].coords).toHaveLength(1);
    });

    test('should handle empty coords array', () => {
      const lineLayer = new LineLayer();
      const line = {
        coords: []
      };
      
      const result = lineLayer.add([line]);
      
      expect(result).toBe(lineLayer);
      expect(lineLayer.lines).toHaveLength(1);
      expect(lineLayer.lines[0].coords).toHaveLength(0);
    });
  });

  describe('clear method', () => {
    test('should clear all lines', () => {
      const lineLayer = new LineLayer();
      const lines = [
        {
          coords: [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 }
          ]
        }
      ];
      
      lineLayer.add(lines);
      expect(lineLayer.lines).toHaveLength(1);
      
      const result = lineLayer.clear();
      
      expect(result).toBe(lineLayer); // Method chaining
      expect(lineLayer.lines).toHaveLength(0);
    });

    test('should handle clear on empty layer', () => {
      const lineLayer = new LineLayer();
      
      const result = lineLayer.clear();
      
      expect(result).toBe(lineLayer);
      expect(lineLayer.lines).toHaveLength(0);
    });
  });

  describe('on method', () => {
    test('should register click event handler', () => {
      const lineLayer = new LineLayer();
      const callback = jest.fn();
      
      const result = lineLayer.on('click', callback);
      
      expect(result).toBe(lineLayer); // Method chaining
      expect(lineLayer.clickCallback).toBe(callback);
    });

    test('should register hover event handler', () => {
      const lineLayer = new LineLayer();
      const callback = jest.fn();
      
      const result = lineLayer.on('hover', callback);
      
      expect(result).toBe(lineLayer);
      expect(lineLayer.hoverCallback).toBe(callback);
    });

    test('should handle unsupported event types', () => {
      const lineLayer = new LineLayer();
      const callback = jest.fn();
      
      expect(() => {
        lineLayer.on('unsupported' as any, callback);
      }).not.toThrow();
    });

    test('should handle null/undefined callback', () => {
      const lineLayer = new LineLayer();
      
      expect(() => {
        lineLayer.on('click', null as any);
      }).not.toThrow();
      
      expect(() => {
        lineLayer.on('hover', undefined as any);
      }).not.toThrow();
    });
  });

  describe('addTo method', () => {
    test('should add layer to map', () => {
      const lineLayer = new LineLayer();
      const lines = [
        {
          coords: [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 }
          ]
        }
      ];
      lineLayer.add(lines);
      
      const mockMap = {
        wasmMap: {
          add_line_layer: jest.fn(() => 0),
          add_lines: jest.fn()
        }
      };
      
      const result = lineLayer.addTo(mockMap as any);
      
      expect(result).toBe(lineLayer); // Method chaining
      expect(mockMap.wasmMap.add_line_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.add_lines).toHaveBeenCalled();
      expect(lineLayer.map).toBe(mockMap);
    });

    test('should handle empty lines when adding to map', () => {
      const lineLayer = new LineLayer();
      const mockMap = {
        wasmMap: {
          add_line_layer: jest.fn(() => 0),
          add_lines: jest.fn()
        }
      };
      
      const result = lineLayer.addTo(mockMap as any);
      
      expect(result).toBe(lineLayer);
      expect(mockMap.wasmMap.add_line_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.add_lines).toHaveBeenCalledWith(expect.any(Number), []);
    });

    test('should handle map without wasmMap property', () => {
      const lineLayer = new LineLayer();
      const mockMap = {};
      
      expect(() => {
        lineLayer.addTo(mockMap as any);
      }).toThrow("Cannot read properties of undefined (reading 'add_line_layer')");
    });
  });

  describe('remove method', () => {
    test('should return this for method chaining', () => {
      const lineLayer = new LineLayer();
      
      const result = lineLayer.remove();
      
      expect(result).toBe(lineLayer);
    });
  });

  describe('Data validation', () => {
    test('should handle invalid coordinate values', () => {
      const lineLayer = new LineLayer();
      const invalidLines = [
        {
          coords: [
            { lat: null, lng: -74.0060 },
            { lat: 40.7128, lng: undefined }
          ]
        },
        {
          coords: [
            { lat: 'invalid', lng: -74.0060 },
            { lat: 40.7128, lng: 'invalid' }
          ]
        }
      ];
      
      invalidLines.forEach(line => {
        expect(() => {
          lineLayer.add([line as any]);
        }).not.toThrow();
      });
    });

    test('should handle invalid color and width values', () => {
      const lineLayer = new LineLayer();
      const invalidLines = [
        {
          coords: [{ lat: 40.7128, lng: -74.0060 }],
          color: null,
          width: 'invalid'
        },
        {
          coords: [{ lat: 40.7128, lng: -74.0060 }],
          color: 12345,
          width: -2
        }
      ];
      
      invalidLines.forEach(line => {
        expect(() => {
          lineLayer.add([line as any]);
        }).not.toThrow();
      });
    });

    test('should handle missing coords property', () => {
      const lineLayer = new LineLayer();
      const invalidLines = [
        {},
        { coords: null },
        { coords: undefined }
      ];
      
      invalidLines.forEach(line => {
        expect(() => {
          lineLayer.add([line as any]);
        }).toThrow(/Cannot read properties of (null|undefined) \(reading 'map'\)/);
      });
    });
  });

  describe('Complex geometries', () => {
    test('should handle lines with many coordinates', () => {
      const lineLayer = new LineLayer();
      const coords = [];
      for (let i = 0; i < 100; i++) {
        coords.push({
          lat: 40.7128 + (i * 0.001),
          lng: -74.0060 + (i * 0.001)
        });
      }
      
      const line = { coords };
      
      const result = lineLayer.add([line]);
      
      expect(result).toBe(lineLayer);
      expect(lineLayer.lines[0].coords).toHaveLength(100);
    });

    test('should handle lines with duplicate coordinates', () => {
      const lineLayer = new LineLayer();
      const line = {
        coords: [
          { lat: 40.7128, lng: -74.0060 },
          { lat: 40.7128, lng: -74.0060 },
          { lat: 40.7589, lng: -73.9851 },
          { lat: 40.7589, lng: -73.9851 }
        ]
      };
      
      const result = lineLayer.add([line]);
      
      expect(result).toBe(lineLayer);
      expect(lineLayer.lines[0].coords).toHaveLength(4);
    });
  });

  describe('Method chaining', () => {
    test('should support method chaining for multiple operations', () => {
      const lineLayer = new LineLayer();
      const lines = [
        {
          coords: [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 }
          ]
        }
      ];
      const mockMap = {
        wasmMap: {
          add_line_layer: jest.fn(() => 0),
          add_lines: jest.fn()
        }
      };
      
      const result = lineLayer
        .add(lines)
        .on('click', jest.fn())
        .addTo(mockMap as any)
        .clear();
      
      expect(result).toBe(lineLayer);
    });
  });
});