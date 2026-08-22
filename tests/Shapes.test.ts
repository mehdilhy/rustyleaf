/**
 * Vector shapes test suite (TDD — RED then GREEN)
 *
 * Circle, CircleMarker, Rectangle.
 * Circle = geodesic radius in meters, tessellated into a polygon ring.
 * CircleMarker = screen-radius in pixels, rendered as a GPU point.
 * Rectangle = axis-aligned polygon from LatLngBounds.
 *
 * Run with: npm test -- Shapes.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { Circle, CircleMarker, Rectangle, Map } = RustyleafAPI as any;

describe('Vector shapes', () => {
  function makeMap() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const map = new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
    jest.spyOn(map.wasmMap, 'add_polygons');
    jest.spyOn(map.wasmMap, 'add_points');
    return map;
  }

  describe('Circle', () => {
    test('is exported and stores latlng + radius (meters)', () => {
      const c = new Circle([48.8566, 2.3522], { radius: 500 });
      expect(c.getLatLng()).toEqual([48.8566, 2.3522]);
      expect(c.getRadius()).toBe(500);
    });

    test('radius defaults to 10 meters like Leaflet', () => {
      const c = new Circle([48.8566, 2.3522]);
      expect(c.getRadius()).toBe(10);
    });

    test('setLatLng / setRadius return this and update state', () => {
      const c = new Circle([48.8566, 2.3522], { radius: 500 });
      expect(c.setLatLng([40, -70])).toBe(c);
      expect(c.setRadius(1000)).toBe(c);
      expect(c.getLatLng()).toEqual([40, -70]);
      expect(c.getRadius()).toBe(1000);
    });

    test('addTo tessellates into a polygon ring', () => {
      const map = makeMap();
      const c = new Circle([48.8566, 2.3522], { radius: 500 });
      expect(c.addTo(map)).toBe(c);
      expect(map.wasmMap.add_polygons).toHaveBeenCalled();
      const polygons = map.wasmMap.add_polygons.mock.calls[0][1];
      expect(polygons.length).toBe(1);
      const ring = polygons[0].rings[0];
      expect(ring.length).toBeGreaterThanOrEqual(32);
      // every vertex is ~500m from the center (lat degrees: 500m ≈ 0.0045°)
      for (const v of ring) {
        expect(Math.abs(v.lat - 48.8566)).toBeLessThanOrEqual(0.0046);
      }
    });

    test('getBounds spans ~2x the radius in latitude', () => {
      const c = new Circle([48.8566, 2.3522], { radius: 500 });
      const b = c.getBounds();
      const latSpan = b[1][0] - b[0][0];
      expect(latSpan).toBeGreaterThan(0.0085); // 2 * 500m / 111320 ≈ 0.009°
      expect(latSpan).toBeLessThan(0.0095);
      expect(b[0][0]).toBeLessThan(48.8566);
      expect(b[1][0]).toBeGreaterThan(48.8566);
    });

    test('remove returns this', () => {
      const map = makeMap();
      const c = new Circle([48.8566, 2.3522], { radius: 500 }).addTo(map);
      expect(c.remove()).toBe(c);
    });
  });

  describe('CircleMarker', () => {
    test('is exported and stores latlng + radius (pixels, default 10)', () => {
      const cm = new CircleMarker([48.8566, 2.3522]);
      expect(cm.getLatLng()).toEqual([48.8566, 2.3522]);
      expect(cm.getRadius()).toBe(10);
    });

    test('addTo renders a GPU point sized 2x radius', () => {
      const map = makeMap();
      const cm = new CircleMarker([48.8566, 2.3522], { radius: 8, color: '#123456' });
      expect(cm.addTo(map)).toBe(cm);
      expect(map.wasmMap.add_points).toHaveBeenCalled();
      const points = map.wasmMap.add_points.mock.calls[0][1];
      expect(points.length).toBe(1);
      expect(points[0].size).toBe(16);
      expect(points[0].color).toBe('#123456');
    });

    test('setRadius / setLatLng return this and update state', () => {
      const cm = new CircleMarker([48.8566, 2.3522], { radius: 8 });
      expect(cm.setRadius(12)).toBe(cm);
      expect(cm.setLatLng([40, -70])).toBe(cm);
      expect(cm.getRadius()).toBe(12);
      expect(cm.getLatLng()).toEqual([40, -70]);
    });
  });

  describe('Rectangle', () => {
    const bounds = [[48.8, 2.2], [48.9, 2.5]];

    test('is exported and getBounds returns the bounds', () => {
      const r = new Rectangle(bounds);
      expect(r.getBounds()).toEqual(bounds);
    });

    test('setBounds returns this and updates bounds', () => {
      const r = new Rectangle(bounds);
      const next = [[40, -71], [41, -70]];
      expect(r.setBounds(next)).toBe(r);
      expect(r.getBounds()).toEqual(next);
    });

    test('addTo renders a closed 4-corner polygon ring', () => {
      const map = makeMap();
      const r = new Rectangle(bounds, { color: '#ff000080' });
      expect(r.addTo(map)).toBe(r);
      const polygons = map.wasmMap.add_polygons.mock.calls[0][1];
      const ring = polygons[0].rings[0];
      expect(ring.length).toBe(4);
      const lats = ring.map((v: any) => v.lat);
      const lngs = ring.map((v: any) => v.lng);
      expect(Math.min(...lats)).toBe(48.8);
      expect(Math.max(...lats)).toBe(48.9);
      expect(Math.min(...lngs)).toBe(2.2);
      expect(Math.max(...lngs)).toBe(2.5);
      expect(polygons[0].color).toBe('#ff000080');
    });
  });
});
