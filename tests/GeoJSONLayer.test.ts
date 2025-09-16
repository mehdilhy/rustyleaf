/**
 * GeoJSONLayer unit tests
 */

import { GeoJSONLayer } from '../src/rustyleaf-api.js';

// Mock fetch API for URL loading tests
global.fetch = jest.fn();

describe('GeoJSONLayer', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    (fetch as jest.Mock).mockClear();
  });

  describe('Constructor', () => {
    test('should create GeoJSON layer with default properties', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      expect(geojsonLayer).toBeInstanceOf(GeoJSONLayer);
      expect(geojsonLayer.geojson).toBeNull();
      expect(geojsonLayer.options).toEqual({
        pointColor: '#0080ff',
        pointSize: 5,
        lineColor: '#ff0000',
        lineWidth: 2,
        polygonColor: '#00ff0080'
      });
      expect(geojsonLayer.map).toBeNull();
    });

    test('should create GeoJSON layer with GeoJSON data', () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-74.0060, 40.7128]
            },
            properties: {
              name: 'New York'
            }
          }
        ]
      };
      
      const geojsonLayer = new GeoJSONLayer(geojson);
      
      expect(geojsonLayer.geojson).toBe(geojson);
    });

    test('should create GeoJSON layer with custom options', () => {
      const options = {
        pointColor: '#ff0000',
        pointSize: 10,
        lineColor: '#00ff00',
        lineWidth: 4,
        polygonColor: '#0000ff80',
        customOption: 'custom-value'
      };
      
      const geojsonLayer = new GeoJSONLayer(null, options);
      
      expect(geojsonLayer.options).toEqual({
        pointColor: '#ff0000',
        pointSize: 10,
        lineColor: '#00ff00',
        lineWidth: 4,
        polygonColor: '#0000ff80',
        customOption: 'custom-value'
      });
    });

    test('should merge GeoJSON data with custom options', () => {
      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [-74.0060, 40.7128]
        }
      };
      
      const options = {
        pointColor: '#ff0000',
        pointSize: 8
      };
      
      const geojsonLayer = new GeoJSONLayer(geojson, options);
      
      expect(geojsonLayer.geojson).toBe(geojson);
      expect(geojsonLayer.options.pointColor).toBe('#ff0000');
      expect(geojsonLayer.options.pointSize).toBe(8);
      expect(geojsonLayer.options.lineWidth).toBe(2); // Default value
    });
  });

  describe('loadData method', () => {
    test('should load GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer();
      const geojson = {
        type: 'FeatureCollection',
        features: []
      };
      
      const result = geojsonLayer.loadData(geojson);
      
      expect(result).toBe(geojsonLayer); // Method chaining
      expect(geojsonLayer.geojson).toBe(geojson);
    });

    test('should handle null/undefined GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      expect(() => {
        geojsonLayer.loadData(null as any);
      }).not.toThrow();
      
      expect(() => {
        geojsonLayer.loadData(undefined as any);
      }).not.toThrow();
    });

    test('should handle string GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer();
      const geojsonString = '{"type":"FeatureCollection","features":[]}';
      
      const result = geojsonLayer.loadData(geojsonString);
      
      expect(result).toBe(geojsonLayer);
      expect(geojsonLayer.geojson).toBe(geojsonString);
    });

    test('should replace existing GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] }
      });
      
      const newGeojson = {
        type: 'FeatureCollection',
        features: []
      };
      
      geojsonLayer.loadData(newGeojson);
      
      expect(geojsonLayer.geojson).toBe(newGeojson);
    });
  });

  describe('loadUrl method', () => {
    test('should load GeoJSON from URL successfully', async () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockResponse = {
        type: 'FeatureCollection',
        features: []
      };
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });
      
      const result = await geojsonLayer.loadUrl('https://example.com/data.geojson');
      
      expect(result).toBe(geojsonLayer);
      expect(geojsonLayer.geojson).toBe(mockResponse);
      expect(fetch).toHaveBeenCalledWith('https://example.com/data.geojson');
    });

    test('should handle network errors', async () => {
      const geojsonLayer = new GeoJSONLayer();
      const networkError = new Error('Network error');
      
      (fetch as jest.Mock).mockRejectedValueOnce(networkError);
      
      await expect(geojsonLayer.loadUrl('https://example.com/data.geojson'))
        .rejects.toThrow('Network error');
    });

    test('should handle HTTP errors', async () => {
      const geojsonLayer = new GeoJSONLayer();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });
      
      await expect(geojsonLayer.loadUrl('https://example.com/data.geojson'))
        .rejects.toThrow('HTTP error! status: 404');
    });

    test('should handle invalid JSON response', async () => {
      const geojsonLayer = new GeoJSONLayer();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      });
      
      await expect(geojsonLayer.loadUrl('https://example.com/data.geojson'))
        .rejects.toThrow('Invalid JSON');
    });
  });

  describe('loadUrlStreaming method', () => {
    test('should load GeoJSON from URL with streaming', async () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockResponse = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-74.0060, 40.7128]
            }
          }
        ]
      };
      
      // Mock streaming response
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode(JSON.stringify(mockResponse)) 
          })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };
      
      const mockResponseStream = {
        ok: true,
        body: {
          getReader: () => mockReader
        },
        headers: {
          get: () => '1000' // Content-Length
        }
      };
      
      (fetch as jest.Mock).mockResolvedValueOnce(mockResponseStream);
      
      // Mock processChunk method to avoid WASM calls
      geojsonLayer.processChunk = jest.fn();
      geojsonLayer.getFeatureCount = jest.fn().mockReturnValue(1);
      
      const result = await geojsonLayer.loadUrlStreaming('https://example.com/large.geojson');
      
      expect(result).toBe(geojsonLayer);
      expect(fetch).toHaveBeenCalledWith('https://example.com/large.geojson');
    });

    test('should handle streaming with progress callback', async () => {
      const geojsonLayer = new GeoJSONLayer();
      const progressCallback = jest.fn();
      const completeCallback = jest.fn();
      
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('{"type":"FeatureCollection"}') 
          })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };
      
      const mockResponseStream = {
        ok: true,
        body: {
          getReader: () => mockReader
        },
        headers: {
          get: () => '1000'
        }
      };
      
      (fetch as jest.Mock).mockResolvedValueOnce(mockResponseStream);
      geojsonLayer.processChunk = jest.fn();
      geojsonLayer.getFeatureCount = jest.fn().mockReturnValue(1);
      
      await geojsonLayer.loadUrlStreaming('https://example.com/large.geojson', {
        progressCallback,
        completeCallback
      });
      
      expect(progressCallback).toHaveBeenCalledWith({
        loaded: expect.any(Number),
        total: 1000,
        percentage: expect.any(Number),
        featureCount: 1
      });
      
      expect(completeCallback).toHaveBeenCalledWith({
        totalFeatures: 1,
        totalBytes: expect.any(Number),
        loadedBytes: expect.any(Number)
      });
    });

    test('should handle streaming errors', async () => {
      const geojsonLayer = new GeoJSONLayer();
      const errorCallback = jest.fn();
      const networkError = new Error('Streaming error');
      
      (fetch as jest.Mock).mockRejectedValueOnce(networkError);
      
      await expect(geojsonLayer.loadUrlStreaming('https://example.com/large.geojson', {
        errorCallback
      })).rejects.toThrow('Streaming error');
      
      expect(errorCallback).toHaveBeenCalledWith(networkError);
    });
  });

  describe('processStreamingBuffer method', () => {
    test('should process complete JSON objects from buffer', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      // Mock processChunk to avoid WASM calls
      geojsonLayer.processChunk = jest.fn();
      
      const buffer = '{"type":"Feature"}\n{"type":"FeatureCollection"}';
      const result = geojsonLayer.processStreamingBuffer(buffer, false);
      
      expect(result.processed).toBe(2);
      expect(geojsonLayer.processChunk).toHaveBeenCalledTimes(2);
    });

    test('should handle incomplete JSON objects', () => {
      const geojsonLayer = new GeoJSONLayer();
      geojsonLayer.processChunk = jest.fn();
      
      const buffer = '{"type":"Feature"'; // Incomplete JSON
      const result = geojsonLayer.processStreamingBuffer(buffer, false);
      
      expect(result.processed).toBe(0);
      expect(result.remaining).toBe(buffer);
      expect(geojsonLayer.processChunk).not.toHaveBeenCalled();
    });

    test('should handle final buffer processing', () => {
      const geojsonLayer = new GeoJSONLayer();
      geojsonLayer.processChunk = jest.fn();
      
      const buffer = '{"type":"Feature"}';
      const result = geojsonLayer.processStreamingBuffer(buffer, true);
      
      expect(result.processed).toBe(1);
      expect(geojsonLayer.processChunk).toHaveBeenCalledWith(buffer, false);
    });
  });

  describe('findCompleteJsonEnd method', () => {
    test('should find end of complete JSON object', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      const jsonStr = '{"type":"Feature","geometry":{"type":"Point","coordinates":[0,0]}}';
      const endIndex = geojsonLayer.findCompleteJsonEnd(jsonStr);
      
      expect(endIndex).toBe(jsonStr.length - 1);
    });

    test('should return -1 for incomplete JSON', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      const incompleteJson = '{"type":"Feature","geometry":{"type":"Point"';
      const endIndex = geojsonLayer.findCompleteJsonEnd(incompleteJson);
      
      expect(endIndex).toBe(-1);
    });

    test('should handle nested objects and strings', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      const jsonStr = '{"type":"Feature","properties":{"name":"Test {value}"},"geometry":{}}';
      const endIndex = geojsonLayer.findCompleteJsonEnd(jsonStr);
      
      expect(endIndex).toBe(jsonStr.length - 1);
    });
  });

  describe('processChunk method', () => {
    test('should process chunk when map is available', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          load_geojson_chunk: jest.fn()
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      const chunk = '{"type":"Feature"}';
      
      expect(() => {
        geojsonLayer.processChunk(chunk, false);
      }).not.toThrow();
      
      expect(mockMap.wasmMap.load_geojson_chunk).toHaveBeenCalledWith(0, chunk, false);
    });

    test('should handle processing errors gracefully', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          load_geojson_chunk: jest.fn().mockImplementation(() => {
            throw new Error('Processing error');
          })
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      expect(() => {
        geojsonLayer.processChunk('invalid', false);
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to process GeoJSON chunk:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    test('should not process when map is not available', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      expect(() => {
        geojsonLayer.processChunk('{"type":"Feature"}', false);
      }).not.toThrow();
    });
  });

  describe('getFeatureCount method', () => {
    test('should return feature count from map', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          get_geojson_feature_count: jest.fn().mockReturnValue(42)
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      const count = geojsonLayer.getFeatureCount();
      
      expect(count).toBe(42);
      expect(mockMap.wasmMap.get_geojson_feature_count).toHaveBeenCalledWith(0);
    });

    test('should handle WASM errors gracefully', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          get_geojson_feature_count: jest.fn().mockImplementation(() => {
            throw new Error('WASM error');
          })
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      const count = geojsonLayer.getFeatureCount();
      
      expect(count).toBe(0);
    });

    test('should return 0 when map is not available', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      const count = geojsonLayer.getFeatureCount();
      
      expect(count).toBe(0);
    });
  });

  describe('setStyle method', () => {
    test('should set style options', () => {
      const geojsonLayer = new GeoJSONLayer();
      const style = {
        pointColor: '#ff0000',
        pointSize: 10,
        lineColor: '#00ff00'
      };
      
      const result = geojsonLayer.setStyle(style);
      
      expect(result).toBe(geojsonLayer); // Method chaining
      expect(geojsonLayer.options.pointColor).toBe('#ff0000');
      expect(geojsonLayer.options.pointSize).toBe(10);
      expect(geojsonLayer.options.lineColor).toBe('#00ff00');
      expect(geojsonLayer.options.lineWidth).toBe(2); // Unchanged
    });

    test('should update style on map when available', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          set_geojson_style: jest.fn()
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      // Mock updateStyle method
      geojsonLayer.updateStyle = jest.fn();
      
      geojsonLayer.setStyle({ pointColor: '#ff0000' });
      
      expect(geojsonLayer.updateStyle).toHaveBeenCalled();
    });
  });

  describe('updateStyle method', () => {
    test('should update style on map', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          set_geojson_style: jest.fn()
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      geojsonLayer.updateStyle();
      
      expect(mockMap.wasmMap.set_geojson_style).toHaveBeenCalledWith(0, {
        pointColor: '#0080ff',
        pointSize: 5,
        lineColor: '#ff0000',
        lineWidth: 2,
        polygonColor: '#00ff0080'
      });
    });

    test('should not update when map is not available', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      expect(() => {
        geojsonLayer.updateStyle();
      }).not.toThrow();
    });
  });

  describe('addTo method', () => {
    test('should add layer to map with GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer({
        type: 'FeatureCollection',
        features: []
      });
      
      const mockMap = {
        wasmMap: {
          add_geojson_layer: jest.fn(() => 0),
          load_geojson: jest.fn(),
          set_geojson_style: jest.fn(),
          clear_geojson_layer: jest.fn()
        }
      };
      
      const result = geojsonLayer.addTo(mockMap as any);
      
      expect(result).toBe(geojsonLayer); // Method chaining
      expect(geojsonLayer.map).toBe(mockMap);
      expect(geojsonLayer.layerIndex).toBe(0);
      expect(mockMap.wasmMap.add_geojson_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.load_geojson).toHaveBeenCalledWith(0, JSON.stringify(geojsonLayer.geojson));
      expect(mockMap.wasmMap.set_geojson_style).toHaveBeenCalled();
    });

    test('should add layer to map without GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      const mockMap = {
        wasmMap: {
          add_geojson_layer: jest.fn(() => 1),
          load_geojson: jest.fn()
        }
      };
      
      const result = geojsonLayer.addTo(mockMap as any);
      
      expect(result).toBe(geojsonLayer);
      expect(geojsonLayer.map).toBe(mockMap);
      expect(geojsonLayer.layerIndex).toBe(1);
      expect(mockMap.wasmMap.add_geojson_layer).toHaveBeenCalled();
      expect(mockMap.wasmMap.load_geojson).not.toHaveBeenCalled();
    });

    test('should handle string GeoJSON data', () => {
      const geojsonString = '{"type":"FeatureCollection","features":[]}';
      const geojsonLayer = new GeoJSONLayer(geojsonString);
      
      const mockMap = {
        wasmMap: {
          add_geojson_layer: jest.fn(() => 0),
          load_geojson: jest.fn(),
          set_geojson_style: jest.fn()
        }
      };
      
      geojsonLayer.addTo(mockMap as any);
      
      expect(mockMap.wasmMap.load_geojson).toHaveBeenCalledWith(0, geojsonString);
    });

    test('should handle map without wasmMap property', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {};
      
      expect(() => {
        geojsonLayer.addTo(mockMap as any);
      }).toThrow("Cannot read properties of undefined (reading 'add_geojson_layer')");
    });
  });

  describe('on method', () => {
    test('should register click event handler', () => {
      const geojsonLayer = new GeoJSONLayer();
      const callback = jest.fn();
      
      const result = geojsonLayer.on('click', callback);
      
      expect(result).toBe(geojsonLayer); // Method chaining
      expect(geojsonLayer.clickCallback).toBe(callback);
    });

    test('should register hover event handler', () => {
      const geojsonLayer = new GeoJSONLayer();
      const callback = jest.fn();
      
      const result = geojsonLayer.on('hover', callback);
      
      expect(result).toBe(geojsonLayer);
      expect(geojsonLayer.hoverCallback).toBe(callback);
    });

    test('should handle unsupported event types', () => {
      const geojsonLayer = new GeoJSONLayer();
      const callback = jest.fn();
      
      expect(() => {
        geojsonLayer.on('unsupported' as any, callback);
      }).not.toThrow();
    });

    test('should handle null/undefined callback', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      expect(() => {
        geojsonLayer.on('click', null as any);
      }).not.toThrow();
      
      expect(() => {
        geojsonLayer.on('hover', undefined as any);
      }).not.toThrow();
    });
  });

  describe('remove method', () => {
    test('should remove layer from map', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {};
      geojsonLayer.map = mockMap;
      
      const result = geojsonLayer.remove();
      
      expect(result).toBe(geojsonLayer); // Method chaining
      expect(geojsonLayer.map).toBeNull();
    });

    test('should handle remove when not on map', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      const result = geojsonLayer.remove();
      
      expect(result).toBe(geojsonLayer);
      expect(geojsonLayer.map).toBeNull();
    });
  });

  describe('getBounds method', () => {
    test('should calculate bounds for FeatureCollection', () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-74.0060, 40.7128]
            }
          },
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-73.9851, 40.7589]
            }
          }
        ]
      };
      
      const geojsonLayer = new GeoJSONLayer(geojson);
      const bounds = geojsonLayer.getBounds();
      
      expect(bounds).toEqual([
        [40.7128, -74.0060], // Southwest
        [40.7589, -73.9851]  // Northeast
      ]);
    });

    test('should calculate bounds for single Feature', () => {
      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-74.0060, 40.7128],
            [-73.9851, 40.7589],
            [-74.0445, 40.6892]
          ]
        }
      };
      
      const geojsonLayer = new GeoJSONLayer(geojson);
      const bounds = geojsonLayer.getBounds();
      
      expect(bounds).toEqual([
        [40.6892, -74.0445], // Southwest
        [40.7589, -73.9851]  // Northeast
      ]);
    });

    test('should handle direct geometry', () => {
      const geojson = {
        type: 'Point',
        coordinates: [-74.0060, 40.7128]
      };
      
      const geojsonLayer = new GeoJSONLayer(geojson);
      const bounds = geojsonLayer.getBounds();
      
      expect(bounds).toEqual([
        [40.7128, -74.0060], // Southwest
        [40.7128, -74.0060]  // Northeast (same point)
      ]);
    });

    test('should return null for empty GeoJSON', () => {
      const geojsonLayer = new GeoJSONLayer();
      const bounds = geojsonLayer.getBounds();
      
      expect(bounds).toBeNull();
    });

    test('should return null for FeatureCollection with no coordinates', () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: []
            }
          }
        ]
      };
      
      const geojsonLayer = new GeoJSONLayer(geojson);
      const bounds = geojsonLayer.getBounds();
      
      expect(bounds).toBeNull();
    });

    test('should handle different geometry types', () => {
      const testCases = [
        {
          type: 'MultiPoint',
          coordinates: [[-74.0060, 40.7128], [-73.9851, 40.7589]]
        },
        {
          type: 'MultiLineString',
          coordinates: [
            [[-74.0060, 40.7128], [-73.9851, 40.7589]],
            [[-74.0445, 40.6892], [-74.0087, 40.7061]]
          ]
        },
        {
          type: 'Polygon',
          coordinates: [[
            [-74.0060, 40.7128], [-73.9851, 40.7589],
            [-74.0445, 40.6892], [-74.0060, 40.7128]
          ]]
        },
        {
          type: 'MultiPolygon',
          coordinates: [[
            [[-74.0060, 40.7128], [-73.9851, 40.7589],
             [-74.0445, 40.6892], [-74.0060, 40.7128]]
          ]]
        }
      ];
      
      testCases.forEach(geometry => {
        const geojsonLayer = new GeoJSONLayer(geometry);
        const bounds = geojsonLayer.getBounds();
        
        expect(bounds).not.toBeNull();
        expect(Array.isArray(bounds)).toBe(true);
        expect(bounds).toHaveLength(2);
      });
    });
  });

  describe('getFeaturesInBounds method', () => {
    test('should return empty array (placeholder implementation)', () => {
      const geojsonLayer = new GeoJSONLayer();
      const bounds = [[40.7, -74.1], [40.8, -73.9]];
      
      const features = geojsonLayer.getFeaturesInBounds(bounds);
      
      expect(features).toEqual([]);
    });
  });

  describe('clear method', () => {
    test('should clear GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer({
        type: 'FeatureCollection',
        features: []
      });
      
      const result = geojsonLayer.clear();
      
      expect(result).toBe(geojsonLayer); // Method chaining
      expect(geojsonLayer.geojson).toBeNull();
    });

    test('should clear WASM layer when on map', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          clear_geojson_layer: jest.fn()
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      geojsonLayer.clear();
      
      expect(mockMap.wasmMap.clear_geojson_layer).toHaveBeenCalledWith(0);
      
      consoleSpy.mockRestore();
    });

    test('should handle WASM clearing errors gracefully', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          clear_geojson_layer: jest.fn().mockImplementation(() => {
            throw new Error('Clearing error');
          })
        }
      };
      geojsonLayer.map = mockMap;
      geojsonLayer.layerIndex = 0;
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      expect(() => {
        geojsonLayer.clear();
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to clear GeoJSON layer:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    test('should handle multiple clear calls', () => {
      const geojsonLayer = new GeoJSONLayer({
        type: 'FeatureCollection',
        features: []
      });
      
      geojsonLayer.clear();
      const result = geojsonLayer.clear();
      
      expect(result).toBe(geojsonLayer);
      expect(geojsonLayer.geojson).toBeNull();
    });
  });

  describe('Method chaining', () => {
    test('should support extensive method chaining', () => {
      const geojsonLayer = new GeoJSONLayer();
      const mockMap = {
        wasmMap: {
          add_geojson_layer: jest.fn(() => 0),
          load_geojson: jest.fn(),
          set_geojson_style: jest.fn(),
          clear_geojson_layer: jest.fn()
        }
      };
      
      const result = geojsonLayer
        .loadData({ type: 'FeatureCollection', features: [] })
        .setStyle({ pointColor: '#ff0000' })
        .on('click', jest.fn())
        .addTo(mockMap as any)
        .clear();
      
      expect(result).toBe(geojsonLayer);
    });
  });

  describe('Edge cases', () => {
    test('should handle malformed GeoJSON gracefully', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      // Test with invalid GeoJSON structures
      const invalidGeojsons = [
        null,
        undefined,
        {},
        { type: 'InvalidType' },
        { type: 'FeatureCollection' }, // Missing features
        { type: 'Feature' }, // Missing geometry
        { type: 'Feature', geometry: {} } // Missing coordinates
      ];
      
      invalidGeojsons.forEach(geojson => {
        expect(() => {
          geojsonLayer.loadData(geojson as any);
        }).not.toThrow();
        
        // getBounds should handle invalid data gracefully
        expect(() => {
          geojsonLayer.getBounds();
        }).not.toThrow();
      });
    });

    test('should handle very large GeoJSON data', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      // Create a large feature collection
      const features = [];
      for (let i = 0; i < 1000; i++) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Math.random() * 360 - 180, Math.random() * 180 - 90]
          }
        });
      }
      
      const largeGeojson = {
        type: 'FeatureCollection',
        features
      };
      
      expect(() => {
        geojsonLayer.loadData(largeGeojson);
        geojsonLayer.getBounds();
      }).not.toThrow();
    });

    test('should handle GeoJSON with complex nested properties', () => {
      const geojsonLayer = new GeoJSONLayer();
      
      const complexGeojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-74.0060, 40.7128]
            },
            properties: {
              name: 'Test Feature',
              metadata: {
                created: '2023-01-01',
                tags: ['important', 'verified'],
                nested: {
                  level1: {
                    level2: {
                      value: 'deep'
                    }
                  }
                }
              }
            }
          }
        ]
      };
      
      expect(() => {
        geojsonLayer.loadData(complexGeojson);
        geojsonLayer.getBounds();
      }).not.toThrow();
    });
  });
});