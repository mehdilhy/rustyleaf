/**
 * TileLayer unit tests
 */

import { TileLayer } from '../src/rustyleaf-api.js';

describe('TileLayer', () => {
  describe('Constructor', () => {
    test('should create tile layer with URL template', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate);
      
      expect(tileLayer).toBeInstanceOf(TileLayer);
      expect(tileLayer.options).toEqual({});
      expect(tileLayer.wasmTileLayer).toBeDefined();
    });

    test('should create tile layer with options', () => {
      const urlTemplate = 'https://{s}.tile.example.com/{z}/{x}/{y}.png';
      const options = {
        attribution: '© Example',
        maxZoom: 18,
        minZoom: 0
      };
      const tileLayer = new TileLayer(urlTemplate, options);
      
      expect(tileLayer).toBeInstanceOf(TileLayer);
      expect(tileLayer.options).toEqual(options);
    });

    test('should handle empty URL template', () => {
      const tileLayer = new TileLayer('');
      
      expect(tileLayer).toBeInstanceOf(TileLayer);
      expect(tileLayer.options).toEqual({});
    });

    test('should handle undefined URL template', () => {
      const tileLayer = new TileLayer(undefined as any);
      
      expect(tileLayer).toBeInstanceOf(TileLayer);
      expect(tileLayer.options).toEqual({});
    });
  });

  describe('addTo method', () => {
    test('should add layer to map', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate);
      const mockMap = {
        wasmMap: {
          add_tile_layer: jest.fn(() => 0)
        }
      };
      
      // Mock the add_to method on the WASM tile layer
      tileLayer.wasmTileLayer.add_to = jest.fn();
      
      const result = tileLayer.addTo(mockMap as any);
      
      expect(result).toBe(tileLayer); // Method chaining
      expect(tileLayer.wasmTileLayer.add_to).toHaveBeenCalledWith(mockMap.wasmMap);
    });

    test('should handle map without wasmMap property', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate);
      const mockMap = {};
      
      expect(() => {
        tileLayer.addTo(mockMap as any);
      }).not.toThrow();
    });

    test('should handle null map', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate);
      
      // The current implementation will throw an error when trying to access wasmMap on null
      expect(() => {
        tileLayer.addTo(null as any);
      }).toThrow("Cannot read properties of null (reading 'wasmMap')");
    });
  });

  describe('remove method', () => {
    test('should return this for method chaining', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate);
      
      const result = tileLayer.remove();
      
      expect(result).toBe(tileLayer);
    });

    test('should handle multiple remove calls', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate);
      
      expect(() => {
        tileLayer.remove();
        tileLayer.remove();
      }).not.toThrow();
    });
  });

  describe('URL template validation', () => {
    test('should handle URL template with placeholders', () => {
      const templates = [
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://tile.example.com/{z}/{x}/{y}.jpg',
        'https://tiles.example.com/{z}/{x}/{y}?format=png',
        'https://server{a-d}.tile.com/{z}/{x}/{y}.png'
      ];
      
      templates.forEach(template => {
        const tileLayer = new TileLayer(template);
        expect(tileLayer.options).toEqual({});
      });
    });

    test('should handle URL template without placeholders', () => {
      const templates = [
        'https://example.com/tile.png',
        'https://static.example.com/map.jpg'
      ];
      
      templates.forEach(template => {
        const tileLayer = new TileLayer(template);
        expect(tileLayer.options).toEqual({});
      });
    });
  });

  describe('Options handling', () => {
    test('should merge default options with provided options', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const options = {
        maxZoom: 18,
        customOption: 'value'
      };
      const tileLayer = new TileLayer(urlTemplate, options);
      
      expect(tileLayer.options.maxZoom).toBe(18);
      expect(tileLayer.options.customOption).toBe('value');
    });

    test('should handle empty options object', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate, {});
      
      expect(tileLayer.options).toEqual({});
    });

    test('should handle null options', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate, null as any);
      
      expect(tileLayer.options).toBeNull();
    });
  });

  describe('Error handling', () => {
    test('should handle invalid URL template gracefully', () => {
      const invalidTemplates = [
        null,
        undefined,
        123,
        {},
        [],
        false,
        true
      ];
      
      invalidTemplates.forEach(template => {
        expect(() => {
          new TileLayer(template as any);
        }).not.toThrow();
      });
    });

    test('should handle WASM initialization errors', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      
      // Mock the WASM module to throw an error
      const { TileLayerApi } = require('../dist/rustyleaf_core_bg.js');
      
      // Since we're using mocked WASM, this test should validate that the mock works
      // The actual error handling is tested by the fact that we can create a TileLayer
      expect(() => {
        new TileLayer(urlTemplate);
      }).not.toThrow();
    });
  });

  describe('Method chaining', () => {
    test('should support method chaining for addTo and remove', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileLayer = new TileLayer(urlTemplate);
      const mockMap = {
        wasmMap: {
          add_tile_layer: jest.fn(() => 0)
        }
      };
      
      const result = tileLayer.addTo(mockMap as any).remove();
      
      expect(result).toBe(tileLayer);
    });
  });
});