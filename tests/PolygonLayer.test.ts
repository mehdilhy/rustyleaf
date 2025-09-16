/**
 * PolygonLayer unit tests
 */

import { PolygonLayer } from '../src/rustyleaf-api.js';

describe('PolygonLayer', () => {
  describe('Constructor', () => {
    test('should create polygon layer with default properties', () => {
      const polygonLayer = new PolygonLayer();
      
      expect(polygonLayer).toBeInstanceOf(PolygonLayer);
      expect(polygonLayer.polygons).toEqual([]);
    });
  });

  describe('add method', () => {
    test('should add single polygon with default values', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7128, lng: -74.0060 }
          ]
        ]
      };
      
      const result = polygonLayer.add([polygon]);
      
      expect(result).toBe(polygonLayer); // Method chaining
      expect(polygonLayer.polygons).toHaveLength(1);
      expect(polygonLayer.polygons[0]).toEqual({
        rings: [
          [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7128, lng: -74.0060 }
          ]
        ],
        color: '#ff0000',
        meta: null
      });
    });

    test('should add multiple polygons', () => {
      const polygonLayer = new PolygonLayer();
      const polygons = [
        {
          rings: [
            [
              { lat: 40.7128, lng: -74.0060 },
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.6892, lng: -74.0445 },
              { lat: 40.7128, lng: -74.0060 }
            ]
          ]
        },
        {
          rings: [
            [
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.7749, lng: -73.9851 },
              { lat: 40.7749, lng: -73.9751 },
              { lat: 40.7589, lng: -73.9851 }
            ]
          ]
        }
      ];
      
      const result = polygonLayer.add(polygons);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons).toHaveLength(2);
    });

    test('should add polygons with custom properties', () => {
      const polygonLayer = new PolygonLayer();
      const polygons = [
        {
          rings: [
            [
              { lat: 40.7128, lng: -74.0060 },
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.6892, lng: -74.0445 },
              { lat: 40.7128, lng: -74.0060 }
            ]
          ],
          color: '#00ff00',
          meta: { name: 'Central Park' }
        },
        {
          rings: [
            [
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.7749, lng: -73.9851 },
              { lat: 40.7749, lng: -73.9751 },
              { lat: 40.7589, lng: -73.9851 }
            ]
          ],
          color: '#0000ff',
          meta: { name: 'Times Square' }
        }
      ];
      
      polygonLayer.add(polygons);
      
      expect(polygonLayer.polygons[0]).toEqual({
        rings: [
          [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7128, lng: -74.0060 }
          ]
        ],
        color: '#00ff00',
        meta: { name: 'Central Park' }
      });
    });

    test('should handle polygon with holes (multiple rings)', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          // Exterior ring
          [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7128, lng: -74.0060 }
          ],
          // Interior ring (hole)
          [
            { lat: 40.7200, lng: -74.0000 },
            { lat: 40.7300, lng: -74.0000 },
            { lat: 40.7300, lng: -73.9900 },
            { lat: 40.7200, lng: -74.0000 }
          ]
        ]
      };
      
      const result = polygonLayer.add([polygon]);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons).toHaveLength(1);
      expect(polygonLayer.polygons[0].rings).toHaveLength(2);
    });

    test('should handle single coordinate polygon', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          [
            { lat: 40.7128, lng: -74.0060 }
          ]
        ]
      };
      
      const result = polygonLayer.add([polygon]);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons).toHaveLength(1);
      expect(polygonLayer.polygons[0].rings).toHaveLength(1);
    });

    test('should handle empty rings array', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: []
      };
      
      const result = polygonLayer.add([polygon]);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons).toHaveLength(1);
      expect(polygonLayer.polygons[0].rings).toHaveLength(0);
    });

    test('should handle empty polygons array', () => {
      const polygonLayer = new PolygonLayer();
      
      const result = polygonLayer.add([]);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons).toHaveLength(0);
    });
  });

  describe('clear method', () => {
    test('should clear all polygons', () => {
      const polygonLayer = new PolygonLayer();
      const polygons = [
        {
          rings: [
            [
              { lat: 40.7128, lng: -74.0060 },
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.6892, lng: -74.0445 },
              { lat: 40.7128, lng: -74.0060 }
            ]
          ]
        }
      ];
      
      polygonLayer.add(polygons);
      expect(polygonLayer.polygons).toHaveLength(1);
      
      const result = polygonLayer.clear();
      
      expect(result).toBe(polygonLayer); // Method chaining
      expect(polygonLayer.polygons).toHaveLength(0);
    });

    test('should handle clear on empty layer', () => {
      const polygonLayer = new PolygonLayer();
      
      const result = polygonLayer.clear();
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons).toHaveLength(0);
    });

    test('should handle multiple clear calls', () => {
      const polygonLayer = new PolygonLayer();
      const polygons = [
        {
          rings: [
            [
              { lat: 40.7128, lng: -74.0060 },
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.6892, lng: -74.0445 },
              { lat: 40.7128, lng: -74.0060 }
            ]
          ]
        }
      ];
      
      polygonLayer.add(polygons);
      polygonLayer.clear();
      
      const result = polygonLayer.clear();
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons).toHaveLength(0);
    });
  });

  describe('on method', () => {
    test('should register click event handler', () => {
      const polygonLayer = new PolygonLayer();
      const callback = jest.fn();
      
      const result = polygonLayer.on('click', callback);
      
      expect(result).toBe(polygonLayer); // Method chaining
      expect(polygonLayer.clickCallback).toBe(callback);
    });

    test('should register hover event handler', () => {
      const polygonLayer = new PolygonLayer();
      const callback = jest.fn();
      
      const result = polygonLayer.on('hover', callback);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.hoverCallback).toBe(callback);
    });

    test('should handle unsupported event types', () => {
      const polygonLayer = new PolygonLayer();
      const callback = jest.fn();
      
      expect(() => {
        polygonLayer.on('unsupported' as any, callback);
      }).not.toThrow();
    });

    test('should handle null/undefined callback', () => {
      const polygonLayer = new PolygonLayer();
      
      expect(() => {
        polygonLayer.on('click', null as any);
      }).not.toThrow();
      
      expect(() => {
        polygonLayer.on('hover', undefined as any);
      }).not.toThrow();
    });

    test('should support multiple event handlers', () => {
      const polygonLayer = new PolygonLayer();
      const clickCallback = jest.fn();
      const hoverCallback = jest.fn();
      
      polygonLayer.on('click', clickCallback);
      polygonLayer.on('hover', hoverCallback);
      
      expect(polygonLayer.clickCallback).toBe(clickCallback);
      expect(polygonLayer.hoverCallback).toBe(hoverCallback);
    });
  });

  describe('addTo method', () => {
    test('should add layer to map', () => {
      const polygonLayer = new PolygonLayer();
      const polygons = [
        {
          rings: [
            [
              { lat: 40.7128, lng: -74.0060 },
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.6892, lng: -74.0445 },
              { lat: 40.7128, lng: -74.0060 }
            ]
          ]
        }
      ];
      polygonLayer.add(polygons);
      
      const mockMap = {
        wasmMap: {
          add_polygon_layer: jest.fn(() => 0),
          add_polygons: jest.fn()
        }
      };
      
      const result = polygonLayer.addTo(mockMap as any);
      
      expect(result).toBe(polygonLayer); // Method chaining
      expect(mockMap.wasmMap.add_polygon_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.add_polygons).toHaveBeenCalled();
      expect(polygonLayer.map).toBe(mockMap);
    });

    test('should handle empty polygons when adding to map', () => {
      const polygonLayer = new PolygonLayer();
      const mockMap = {
        wasmMap: {
          add_polygon_layer: jest.fn(() => 0),
          add_polygons: jest.fn()
        }
      };
      
      const result = polygonLayer.addTo(mockMap as any);
      
      expect(result).toBe(polygonLayer);
      expect(mockMap.wasmMap.add_polygon_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.add_polygons).toHaveBeenCalledWith(expect.any(Number), []);
    });

    test('should handle map without wasmMap property', () => {
      const polygonLayer = new PolygonLayer();
      const mockMap = {};
      
      expect(() => {
        polygonLayer.addTo(mockMap as any);
      }).toThrow("Cannot read properties of undefined (reading 'add_polygon_layer')");
    });
  });

  describe('remove method', () => {
    test('should return this for method chaining', () => {
      const polygonLayer = new PolygonLayer();
      
      const result = polygonLayer.remove();
      
      expect(result).toBe(polygonLayer);
    });

    test('should handle multiple remove calls', () => {
      const polygonLayer = new PolygonLayer();
      
      polygonLayer.remove();
      const result = polygonLayer.remove();
      
      expect(result).toBe(polygonLayer);
    });
  });

  describe('Data validation', () => {
    test('should handle invalid coordinate values', () => {
      const polygonLayer = new PolygonLayer();
      const invalidPolygons = [
        {
          rings: [
            [
              { lat: null, lng: -74.0060 },
              { lat: 40.7128, lng: undefined },
              { lat: 'invalid', lng: -74.0060 },
              { lat: 40.7128, lng: 'invalid' }
            ]
          ]
        }
      ];
      
      expect(() => {
        polygonLayer.add(invalidPolygons);
      }).not.toThrow();
    });

    test('should handle invalid color values', () => {
      const polygonLayer = new PolygonLayer();
      const invalidPolygons = [
        {
          rings: [
            [
              { lat: 40.7128, lng: -74.0060 },
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.6892, lng: -74.0445 },
              { lat: 40.7128, lng: -74.0060 }
            ]
          ],
          color: null
        },
        {
          rings: [
            [
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.7749, lng: -73.9851 },
              { lat: 40.7749, lng: -73.9751 },
              { lat: 40.7589, lng: -73.9851 }
            ]
          ],
          color: 12345
        }
      ];
      
      invalidPolygons.forEach(polygon => {
        expect(() => {
          polygonLayer.add([polygon as any]);
        }).not.toThrow();
      });
    });

    test('should handle missing rings property', () => {
      const polygonLayer = new PolygonLayer();
      const invalidPolygons = [
        {},
        { rings: null },
        { rings: undefined }
      ];
      
      invalidPolygons.forEach(polygon => {
        expect(() => {
          polygonLayer.add([polygon as any]);
        }).toThrow(/Cannot read properties of (null|undefined) \(reading 'map'\)/);
      });
    });

    test('should handle invalid ring data', () => {
      const polygonLayer = new PolygonLayer();
      const invalidPolygons = [
        {
          rings: [
            null,
            undefined,
            'invalid',
            12345
          ]
        }
      ];
      
      expect(() => {
        polygonLayer.add(invalidPolygons);
      }).toThrow(/Cannot read properties of (null|undefined) \(reading 'map'\)/);
    });
  });

  describe('Complex geometries', () => {
    test('should handle polygons with many coordinates', () => {
      const polygonLayer = new PolygonLayer();
      const coords = [];
      for (let i = 0; i < 100; i++) {
        coords.push({
          lat: 40.7128 + (i * 0.001),
          lng: -74.0060 + (i * 0.001)
        });
      }
      coords.push(coords[0]); // Close the polygon
      
      const polygon = { rings: [coords] };
      
      const result = polygonLayer.add([polygon]);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons[0].rings[0]).toHaveLength(101);
    });

    test('should handle polygons with duplicate coordinates', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7128, lng: -74.0060 }
          ]
        ]
      };
      
      const result = polygonLayer.add([polygon]);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons[0].rings[0]).toHaveLength(7);
    });

    test('should handle complex multi-ring polygons', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          // Exterior ring
          [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7128, lng: -74.0060 }
          ],
          // Hole 1
          [
            { lat: 40.7200, lng: -74.0000 },
            { lat: 40.7300, lng: -74.0000 },
            { lat: 40.7300, lng: -73.9900 },
            { lat: 40.7200, lng: -74.0000 }
          ],
          // Hole 2
          [
            { lat: 40.7000, lng: -73.9950 },
            { lat: 40.7100, lng: -73.9950 },
            { lat: 40.7100, lng: -73.9850 },
            { lat: 40.7000, lng: -73.9950 }
          ]
        ]
      };
      
      const result = polygonLayer.add([polygon]);
      
      expect(result).toBe(polygonLayer);
      expect(polygonLayer.polygons[0].rings).toHaveLength(3);
    });
  });

  describe('Method chaining', () => {
    test('should support method chaining for multiple operations', () => {
      const polygonLayer = new PolygonLayer();
      const polygons = [
        {
          rings: [
            [
              { lat: 40.7128, lng: -74.0060 },
              { lat: 40.7589, lng: -73.9851 },
              { lat: 40.6892, lng: -74.0445 },
              { lat: 40.7128, lng: -74.0060 }
            ]
          ]
        }
      ];
      const mockMap = {
        wasmMap: {
          add_polygon_layer: jest.fn(() => 0),
          add_polygons: jest.fn()
        }
      };
      
      const result = polygonLayer
        .add(polygons)
        .on('click', jest.fn())
        .addTo(mockMap as any)
        .clear();
      
      expect(result).toBe(polygonLayer);
    });
  });

  describe('Edge cases', () => {
    test('should handle very large coordinate values', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          [
            { lat: 90, lng: 180 },
            { lat: -90, lng: 180 },
            { lat: -90, lng: -180 },
            { lat: 90, lng: -180 },
            { lat: 90, lng: 180 }
          ]
        ]
      };
      
      expect(() => {
        polygonLayer.add([polygon]);
      }).not.toThrow();
    });

    test('should handle polygons with minimal coordinates', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          [
            { lat: 0, lng: 0 },
            { lat: 0.000001, lng: 0.000001 },
            { lat: 0, lng: 0.000001 },
            { lat: 0, lng: 0 }
          ]
        ]
      };
      
      expect(() => {
        polygonLayer.add([polygon]);
      }).not.toThrow();
    });

    test('should handle adding same polygon multiple times', () => {
      const polygonLayer = new PolygonLayer();
      const polygon = {
        rings: [
          [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7589, lng: -73.9851 },
            { lat: 40.6892, lng: -74.0445 },
            { lat: 40.7128, lng: -74.0060 }
          ]
        ]
      };
      
      polygonLayer.add([polygon]);
      polygonLayer.add([polygon]);
      
      expect(polygonLayer.polygons).toHaveLength(2);
      expect(polygonLayer.polygons[0]).toEqual(polygonLayer.polygons[1]);
    });
  });
});