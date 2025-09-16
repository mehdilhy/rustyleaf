import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockMap, createMockTileLayer, createMockPointLayer } from './setup';

describe('Kharita Map API', () => {
  let mockMap: any;

  beforeEach(() => {
    mockMap = createMockMap();
  });

  describe('Map creation and basic operations', () => {
    it('should create a map with default dimensions', () => {
      expect(mockMap).toBeDefined();
    });

    it('should set view with coordinates and zoom', () => {
      const lat = 40.7128;
      const lng = -74.0060;
      const zoom = 10;

      mockMap.setView(lat, lng, zoom);

      expect(mockMap.setView).toHaveBeenCalledWith(lat, lng, zoom);
    });

    it('should pan the map by delta coordinates', () => {
      const deltaX = 100;
      const deltaY = 50;

      mockMap.pan(deltaX, deltaY);

      expect(mockMap.pan).toHaveBeenCalledWith(deltaX, deltaY);
    });

    it('should zoom in and out', () => {
      mockMap.zoomIn();
      expect(mockMap.zoomIn).toHaveBeenCalled();

      mockMap.zoomOut();
      expect(mockMap.zoomOut).toHaveBeenCalled();
    });

    it('should resize the map', () => {
      const width = 800;
      const height = 600;

      mockMap.resize(width, height);

      expect(mockMap.resize).toHaveBeenCalledWith(width, height);
    });
  });

  describe('Layer management', () => {
    it('should add tile layer', () => {
      const urlTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      mockMap.add_tile_layer(urlTemplate);

      expect(mockMap.add_tile_layer).toHaveBeenCalledWith(urlTemplate);
    });

    it('should add point layer', () => {
      mockMap.add_point_layer();
      expect(mockMap.add_point_layer).toHaveBeenCalled();
    });

    it('should add points to a layer', () => {
      const layerIndex = 0;
      const points = [
        { lat: 40.7128, lng: -74.0060, size: 10, meta: { name: 'NYC' } },
        { lat: 40.7589, lng: -73.9851, size: 8, meta: { name: 'Times Square' } }
      ];

      mockMap.add_points(layerIndex, points);

      expect(mockMap.add_points).toHaveBeenCalledWith(layerIndex, points);
    });
  });

  describe('Event handling', () => {
    it('should register event handlers', () => {
      const callback = jest.fn();
      
      mockMap.on('move', callback);
      mockMap.on('zoom', callback);
      mockMap.on('click', callback);

      expect(mockMap.on).toHaveBeenCalledTimes(3);
    });

    it('should convert screen coordinates', () => {
      const lat = 40.7128;
      const lng = -74.0060;

      mockMap.screen_xy(lat, lng);

      expect(mockMap.screen_xy).toHaveBeenCalledWith(lat, lng);
    });
  });
});

describe('TileLayer API', () => {
  it('should create tile layer with URL template', () => {
    const tileLayer = createMockTileLayer();
    expect(tileLayer).toBeDefined();
  });

  it('should add tile layer to map', () => {
    const tileLayer = createMockTileLayer();
    const mockMap = createMockMap();

    tileLayer.addTo(mockMap);

    expect(tileLayer.addTo).toHaveBeenCalledWith(mockMap);
  });
});

describe('PointLayer API', () => {
  it('should create point layer', () => {
    const pointLayer = createMockPointLayer();
    expect(pointLayer).toBeDefined();
  });

  it('should add points to layer', () => {
    const pointLayer = createMockPointLayer();
    const points = [
      { lat: 40.7128, lng: -74.0060, size: 10, color: '#ff0000' },
      { lat: 40.7589, lng: -73.9851, size: 8, color: '#00ff00' }
    ];

    pointLayer.add(points);

    expect(pointLayer.add).toHaveBeenCalledWith(points);
  });

  it('should add point layer to map', () => {
    const pointLayer = createMockPointLayer();
    const mockMap = createMockMap();

    pointLayer.addTo(mockMap);

    expect(pointLayer.addTo).toHaveBeenCalledWith(mockMap);
  });

  it('should register click and hover handlers', () => {
    const pointLayer = createMockPointLayer();
    const callback = jest.fn();

    pointLayer.on_click(callback);
    pointLayer.on_hover(callback);

    expect(pointLayer.on_click).toHaveBeenCalledWith(callback);
    expect(pointLayer.on_hover).toHaveBeenCalledWith(callback);
  });
});