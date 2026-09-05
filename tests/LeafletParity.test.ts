import {
  Bounds,
  CRS,
  DomEvent,
  DomUtil,
  FeatureGroup,
  GeoJSONLayer,
  LatLng,
  LatLngBounds,
  LineLayer,
  Map,
  Marker,
  Point,
  PointLayer,
  PolygonLayer,
  TileLayer,
  Util,
  circle,
  circleMarker,
  featureGroup,
  geoJSON,
  latLng,
  latLngBounds,
  layerGroup,
  map as mapFactory,
  marker,
  point,
  rectangle,
  tileLayer,
} from '../src/rustyleaf-api.js';

const makeMap = (options: any = {}) => {
  const container = document.createElement('div');
  container.style.width = '800px';
  container.style.height = '600px';
  document.body.appendChild(container);
  const value = new Map(container, options);
  return { map: value, container };
};

const pointFeature = (lat = 48.85, lng = 2.35) => ({ lat, lng, size: 6, color: '#2a9d8f' });
const featureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: 1, kind: 'city' }, geometry: { type: 'Point', coordinates: [2.35, 48.85] } },
    { type: 'Feature', properties: { id: 2, kind: 'park' }, geometry: { type: 'LineString', coordinates: [[2.3, 48.8], [2.4, 48.9]] } },
  ],
};

describe('Leaflet compatibility use cases', () => {
  const maps: Array<{ map: Map; container: HTMLElement }> = [];

  afterEach(() => {
    for (const { map, container } of maps.splice(0)) {
      map.remove();
      container.remove();
    }
  });

  test('1. Point value objects retain tuple access and vector operations', () => {
    const value = new Point(3, 4);
    expect(Array.isArray(value)).toBe(true);
    expect(value.distanceTo([0, 0])).toBe(5);
    expect(value.add([1, 2]).toArray()).toEqual([4, 6]);
    value.x = 8;
    expect(value[0]).toBe(8);
  });

  test('2. Bounds computes size, center, containment, and padding', () => {
    const value = new Bounds([10, 20], [30, 50]);
    expect(value.getSize().toArray()).toEqual([20, 30]);
    expect(value.getCenter().toArray()).toEqual([20, 35]);
    expect(value.contains([20, 30])).toBe(true);
    expect(value.pad(0.1).toArray()).toEqual([[8, 17], [32, 53]]);
  });

  test('3. LatLng handles distance, objects, and longitude wrapping', () => {
    const paris = latLng(48.8566, 2.3522);
    expect(paris).toEqual([48.8566, 2.3522]);
    expect(paris.equals({ lat: 48.8566, lng: 2.3522 })).toBe(true);
    expect(paris.distanceTo([48.8566, 3.3522])).toBeGreaterThan(70_000);
    expect(new LatLng(0, 190).wrap().lng).toBe(-170);
  });

  test('4. LatLngBounds supports corners, queries, and GeoJSON bbox output', () => {
    const value = new LatLngBounds([[48, 2], [49, 3]]);
    value.extend([50, 1]);
    expect(value.getSouthWest().toArray()).toEqual([48, 1]);
    expect(value.getNorthEast().toArray()).toEqual([50, 3]);
    expect(value.contains([49, 2])).toBe(true);
    expect(value.intersects([[49.5, 0], [51, 2]])).toBe(true);
    expect(value.toBBox()).toBe('1,48,3,50');
  });

  test('5. Factories create the same objects as class constructors', () => {
    expect(point(1, 2)).toBeInstanceOf(Point);
    expect(latLng(1, 2)).toBeInstanceOf(LatLng);
    expect(latLngBounds([[0, 0], [1, 1]])).toBeInstanceOf(LatLngBounds);
    expect(marker([1, 2])).toBeInstanceOf(Marker);
    expect(tileLayer('/{z}/{x}/{y}.png')).toBeInstanceOf(TileLayer);
    expect(circle([1, 2])).toBeInstanceOf(Object);
  });

  test('6. Map exposes Leaflet viewport size and pixel bounds', () => {
    const created = makeMap({ center: [0, 0], zoom: 3 });
    maps.push(created);
    const { map } = created;
    expect(map.getSize().toArray()).toEqual([800, 600]);
    expect(map.getPixelBounds()).toBeInstanceOf(Bounds);
    expect(map.getPixelWorldBounds().getSize().x).toBe(2048);
  });

  test('7. Map converts container points, latlngs, and mouse events', () => {
    const created = makeMap();
    maps.push(created);
    const { map } = created;
    expect(map.containerPointToLatLng([400, 300])).toEqual([48.8566, 2.3522]);
    expect(map.latLngToContainerPoint({ lat: 48.8, lng: 2.3 })).toEqual([400, 300]);
    const event = new MouseEvent('mousemove', { clientX: 400, clientY: 300 });
    expect(map.mouseEventToLatLng(event)).toEqual([48.8566, 2.3522]);
  });

  test('8. Map zoom scale helpers are inverse and bounds zoom is clamped', () => {
    const created = makeMap({ zoom: 8, minZoom: 2, maxZoom: 16 });
    maps.push(created);
    const { map } = created;
    expect(map.getZoomScale(10)).toBe(4);
    expect(map.getScaleZoom(4, 8)).toBe(10);
    expect(map.getBoundsZoom([[48.8, 2.2], [48.9, 2.5]])).toBeGreaterThanOrEqual(2);
    expect(map.getBoundsZoom([[48.8, 2.2], [48.9, 2.5]])).toBeLessThanOrEqual(16);
  });

  test('9. Map panes are stable, stacked, and parentable', () => {
    const created = makeMap();
    maps.push(created);
    const { map, container } = created;
    const overlay = map.getPane('overlayPane');
    expect(map.getPane('overlayPane')).toBe(overlay);
    expect(overlay.parentNode).toBe(container);
    const custom = map.createPane('labels', 'overlayPane');
    expect(custom.parentNode).toBe(overlay);
    expect(map.getPanes().popupPane).toBeInstanceOf(HTMLElement);
  });

  test('10. Map constructor attaches initial layers and tracks membership', () => {
    const points = new PointLayer();
    points.add([pointFeature()]);
    const created = makeMap({ layers: [points] });
    maps.push(created);
    expect(created.map.hasLayer(points)).toBe(true);
    created.map.removeLayer(points);
    expect(created.map.hasLayer(points)).toBe(false);
  });

  test('11. TileLayer expands XYZ, retina, subdomain, and custom tokens', () => {
    const layer = new TileLayer('https://{s}.example/{z}/{x}/{y}{r}/{foo}.png', {
      subdomains: ['a', 'b'], detectRetina: true, foo: 'city',
    });
    expect(layer.getTileUrl({ x: 1, y: 2, z: 5 })).toBe('https://b.example/5/1/2@2x/city.png');
  });

  test('12. TileLayer lifecycle exposes opacity, z-index, and redraw hooks', () => {
    const created = makeMap();
    maps.push(created);
    const { map } = created;
    const layer = tileLayer('/{z}/{x}/{y}.png', { opacity: 0.5, zIndex: 3 });
    layer.addTo(map).setOpacity(0.7).setZIndex(9);
    expect(layer.getOpacity()).toBe(0.7);
    expect(layer.getContainer()).toBe(map.canvas);
    expect(layer.getAttribution()).toBeUndefined();
    layer.remove();
  });

  test('13. LineLayer accepts Leaflet coordinate arrays and exposes bounds/style', () => {
    const layer = new LineLayer({ color: '#123456', weight: 4 });
    layer.setLatLngs([[48, 2], [49, 3]]).setStyle({ color: '#abcdef' });
    expect(layer.getLatLngs()[0][1]).toEqual([49, 3]);
    expect(layer.getBounds().toBBox()).toBe('2,48,3,49');
    expect(layer.getStyle().color).toBe('#abcdef');
  });

  test('14. PolygonLayer accepts rings, styles, and returns aggregate bounds', () => {
    const layer = new PolygonLayer({ fillColor: '#00ff00' });
    layer.add([[[48, 2], [48, 3], [49, 3], [48, 2]]]);
    expect(layer.getLatLngs()[0][0][0]).toEqual([48, 2]);
    layer.setStyle({ fillColor: '#ff0000' });
    expect(layer.getStyle().fillColor).toBe('#ff0000');
    expect(layer.getBounds().contains([48.5, 2.5])).toBe(true);
  });

  test('15. Vector shapes accept object coordinates and style updates', () => {
    const c = circle({ lat: 48.85, lng: 2.35 }, { radius: 100, color: '#111' });
    const cm = circleMarker([48.85, 2.35], { radius: 8 });
    const r = rectangle([[48, 2], [49, 3]]);
    expect(c.getLatLng().lat).toBe(48.85);
    expect(cm.getBounds().contains([48.85, 2.35])).toBe(true);
    expect(r.getBounds().toBBox()).toBe('2,48,3,49');
    c.setStyle({ fillColor: '#abc' });
    expect(c.getStyle().fillColor).toBe('#abc');
  });

  test('16. LayerGroup and FeatureGroup compose layers and aggregate bounds', () => {
    const points = new PointLayer();
    points.add([pointFeature()]);
    const group = layerGroup([points]);
    expect(group.hasLayer(points)).toBe(true);
    expect(group.invoke('setStyle', { color: '#fff' })).toBe(group);
    const featureGroupValue = featureGroup([rectangle([[48, 2], [49, 3]])]);
    expect(featureGroupValue).toBeInstanceOf(FeatureGroup);
    expect(featureGroupValue.getBounds().toBBox()).toBe('2,48,3,49');
  });

  test('17. GeoJSON addData, bounds, serialization, and feature reset are chainable', () => {
    const layer = geoJSON(null);
    expect(layer.addData(featureCollection)).toBe(layer);
    expect(layer.getBounds().toBBox()).toBe('2.3,48.8,2.4,48.9');
    expect(layer.toGeoJSON()).toEqual(featureCollection);
    const handle: any = { setStyle: jest.fn(), resetStyle: jest.fn() };
    layer.resetStyle(handle);
    expect(handle.resetStyle).toHaveBeenCalled();
  });

  test('18. GeoJSON filter, style, and pointToLayer hooks run before WASM upload', () => {
    const markerLayers: Marker[] = [];
    const layer = new GeoJSONLayer(featureCollection, {
      filter: (feature: any) => feature.properties.kind === 'city',
      style: (feature: any) => ({ color: feature.properties.kind === 'city' ? '#f00' : '#000' }),
      pointToLayer: (feature: any, latlng: any) => {
        const value = new Marker(latlng);
        markerLayers.push(value);
        return value;
      },
    });
    const created = makeMap();
    maps.push(created);
    layer.addTo(created.map);
    expect(markerLayers).toHaveLength(1);
    expect(layer.getLayers()).toContain(markerLayers[0]);
  });

  test('19. GeoJSON streaming preserves split buffers and parses the final object', async () => {
    const originalFetch = global.fetch;
    const text = JSON.stringify(featureCollection);
    const encoded = new TextEncoder().encode(text);
    let index = 0;
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => String(encoded.length) },
      body: { getReader: () => ({ read: async () => {
        if (index >= encoded.length) return { done: true };
        const value = encoded.slice(index, index + 7);
        index += value.length;
        return { done: false, value };
      } }) },
    })) as any;
    const created = makeMap();
    maps.push(created);
    try {
      const layer = new GeoJSONLayer(null);
      await layer.addTo(created.map).loadUrlStreaming('/features.geojson');
      expect(layer.toGeoJSON()).toEqual(featureCollection);
      expect(layer._streamedText).toBe(text);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('20. Util and DOM helpers provide plugin-safe behavior', () => {
    const object: any = {};
    const id = Util.stamp(object);
    expect(Util.stamp(object)).toBe(id);
    expect(object._leaflet_id).toBe(id);
    expect(Util.splitWords('one two')).toEqual(['one', 'two']);
    expect(Util.getParamString({ a: 1, b: 'x' }, '/tiles')).toBe('?a=1&b=x');
    const host = document.createElement('div');
    const child = DomUtil.create('button', 'test', host);
    const context = { count: 0 };
    const handler = function () { this.count += 1; };
    DomEvent.on(child, 'click', handler, context);
    child.dispatchEvent(new MouseEvent('click'));
    DomEvent.off(child, 'click', handler, context);
    child.dispatchEvent(new MouseEvent('click'));
    expect(context.count).toBe(1);
    expect(CRS.EPSG3857.code).toBe('EPSG:3857');
    const factoryContainer = document.createElement('div');
    const factoryMap = mapFactory(factoryContainer);
    maps.push({ map: factoryMap, container: factoryContainer });
    expect(factoryMap).toBeInstanceOf(Map);
  });
});
