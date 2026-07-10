/**
 * Control test suite (TDD — RED then GREEN)
 *
 * UI controls: base Control plus ZoomControl, AttributionControl, ScaleControl.
 * These are DOM overlays inside the map container. Complements the
 * marker/overlay work.
 *
 * Run with: npm test -- Control.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { Control, ZoomControl, AttributionControl, ScaleControl } = RustyleafAPI as any;

function createMockMap() {
  return {
    setView: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    getZoom: jest.fn(() => 12),
    getCenter: jest.fn(() => [48.8566, 2.3522]),
    project: jest.fn((ll) => [ll[1] * 1000, ll[0] * 1000]),
    unproject: jest.fn((p) => [p[1] / 1000, p[0] / 1000]),
    containerElement: document.createElement('div'),
    wasmMap: { screen_xy: jest.fn(() => [400, 300]) },
    addControl: jest.fn(function (c) { return c.addTo(this); }),
    removeControl: jest.fn(function (c) { return c.remove(); }),
  };
}

describe('Control feature', () => {
  describe('Exports', () => {
    test('Control / ZoomControl / AttributionControl / ScaleControl exported', () => {
      expect(typeof Control).toBe('function');
      expect(typeof ZoomControl).toBe('function');
      expect(typeof AttributionControl).toBe('function');
      expect(typeof ScaleControl).toBe('function');
    });
  });

  describe('Control base', () => {
    test('default position is topleft', () => {
      const c = new Control();
      expect(c.getPosition()).toBe('topleft');
    });

    test('setPosition updates and returns this', () => {
      const c = new Control();
      expect(c.setPosition('bottomright')).toBe(c);
      expect(c.getPosition()).toBe('bottomright');
    });

    test('addTo creates a container element and returns this', () => {
      const c = new Control();
      const map = createMockMap();
      expect(c.addTo(map)).toBe(c);
      expect(c.getContainer()).not.toBeNull();
      expect(c.getContainer() instanceof HTMLElement).toBe(true);
    });

    test('remove detaches and returns this', () => {
      const c = new Control();
      const map = createMockMap();
      c.addTo(map);
      const el = c.getContainer();
      expect(c.remove()).toBe(c);
      expect(el.parentNode).toBeNull();
    });
  });

  describe('ZoomControl', () => {
    test('creates + and - buttons', () => {
      const z = new ZoomControl();
      const map = createMockMap();
      z.addTo(map);
      const el = z.getContainer();
      const buttons = el.querySelectorAll('button');
      expect(buttons.length).toBe(2);
    });

    test('+ button calls map.zoomIn()', () => {
      const z = new ZoomControl();
      const map = createMockMap();
      z.addTo(map);
      const plus = z.getContainer().querySelector('button');
      plus.click();
      expect(map.zoomIn).toHaveBeenCalled();
    });

    test('- button calls map.zoomOut()', () => {
      const z = new ZoomControl();
      const map = createMockMap();
      z.addTo(map);
      const minus = z.getContainer().querySelectorAll('button')[1];
      minus.click();
      expect(map.zoomOut).toHaveBeenCalled();
    });
  });

  describe('AttributionControl', () => {
    test('addTo creates a container', () => {
      const a = new AttributionControl();
      const map = createMockMap();
      a.addTo(map);
      expect(a.getContainer()).not.toBeNull();
    });

    test('addAttribution stores text and returns this', () => {
      const a = new AttributionControl();
      const map = createMockMap();
      a.addTo(map);
      expect(a.addAttribution('© OSM')).toBe(a);
      expect(a.getAttributions().includes('© OSM')).toBe(true);
    });

    test('setPrefix updates prefix and returns this', () => {
      const a = new AttributionControl({ prefix: 'Leaflet' });
      expect(a.setPrefix('Rustyleaf')).toBe(a);
      expect(a.getPrefix()).toBe('Rustyleaf');
    });
  });

  describe('ScaleControl', () => {
    test('addTo creates a container', () => {
      const s = new ScaleControl();
      const map = createMockMap();
      s.addTo(map);
      expect(s.getContainer()).not.toBeNull();
    });

    test('updates scale text on add', () => {
      const s = new ScaleControl();
      const map = createMockMap();
      s.addTo(map);
      const el = s.getContainer();
      expect(el.textContent && el.textContent.length > 0).toBe(true);
    });

    test('calls map.on to subscribe to move/zoom', () => {
      const s = new ScaleControl();
      const map = createMockMap();
      s.addTo(map);
      expect(map.on).toHaveBeenCalled();
    });
  });

  describe('Map.addControl / removeControl', () => {
    test('addControl adds and returns this', () => {
      const map = createMockMap();
      const c = new Control();
      expect(map.addControl(c)).toBe(c); // mock delegates to c.addTo(map)
      expect(c.getContainer()).not.toBeNull();
    });
  });
});
