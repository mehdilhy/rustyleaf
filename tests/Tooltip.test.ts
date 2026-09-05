/**
 * Tooltip test suite (TDD — RED then GREEN)
 *
 * Tooltip is a lightweight DOM overlay (like Popup but smaller), anchored to a
 * latlng or a layer. Complements the existing Popup.
 *
 * Run with: npm test -- Tooltip.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { Tooltip, Marker, Icon } = RustyleafAPI as any;

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
    wasmMap: {
      screen_xy: jest.fn(() => [400, 300]),
      add_marker: jest.fn(() => 0),
      update_marker: jest.fn(),
      set_marker_style: jest.fn(),
      set_marker_visible: jest.fn(),
      remove_marker: jest.fn(),
    },
  };
}

describe('Tooltip feature', () => {
  describe('Exports', () => {
    test('Tooltip is exported as a constructor', () => {
      expect(typeof Tooltip).toBe('function');
    });
  });

  describe('Constructor & content', () => {
    test('creates a tooltip', () => {
      const t = new Tooltip();
      expect(t).toBeInstanceOf(Tooltip);
    });

    test('stores content option', () => {
      const t = new Tooltip({ content: 'Hello' });
      expect(t.getTooltipContent && t.getTooltipContent()).toBe('Hello');
    });

    test('setContent updates and returns this', () => {
      const t = new Tooltip();
      expect(t.setContent('Hi')).toBe(t);
      expect(t.getTooltipContent()).toBe('Hi');
    });

    test('setLatLng stores position and returns this', () => {
      const t = new Tooltip({ content: 'x' });
      expect(t.setLatLng([48.8, 2.3])).toBe(t);
      expect(t.getLatLng()).toEqual([48.8, 2.3]);
    });
  });

  describe('open / close', () => {
    test('openOn sets open state and returns this', () => {
      const t = new Tooltip({ content: 'Hi' });
      const map = createMockMap();
      expect(t.openOn(map)).toBe(t);
      expect(t.isOpen()).toBe(true);
    });

    test('close clears open state and returns this', () => {
      const t = new Tooltip({ content: 'Hi' });
      const map = createMockMap();
      t.openOn(map);
      expect(t.close()).toBe(t);
      expect(t.isOpen()).toBe(false);
    });

    test('getElement returns the DOM node once open', () => {
      const t = new Tooltip({ content: 'Hi' });
      const map = createMockMap();
      t.openOn(map);
      const el = t.getElement();
      expect(el).not.toBeNull();
      expect(el instanceof HTMLElement).toBe(true);
    });

    test('getElement returns null before opening', () => {
      const t = new Tooltip({ content: 'Hi' });
      expect(t.getElement()).toBeNull();
    });
  });

  describe('Binding to a marker', () => {
    test('bindTooltip stores content and returns this', () => {
      const marker = new Marker([48.8566, 2.3522], { icon: new Icon({ iconUrl: 'x.png' }) });
      new Tooltip({ content: 'tip' });
      expect(marker.bindTooltip('tip')).toBe(marker);
      expect(marker.getTooltipContent()).toBe('tip');
    });

    test('marker.openTooltip opens at the marker position', () => {
      const marker = new Marker([48.8566, 2.3522], { icon: new Icon({ iconUrl: 'x.png' }) });
      const map = createMockMap();
      marker.addTo(map);
      marker.openTooltip();
      expect(marker.isTooltipOpen()).toBe(true);
    });

    test('marker.closeTooltip closes', () => {
      const marker = new Marker([48.8566, 2.3522], { icon: new Icon({ iconUrl: 'x.png' }) });
      const map = createMockMap();
      marker.addTo(map);
      marker.openTooltip();
      marker.closeTooltip();
      expect(marker.isTooltipOpen()).toBe(false);
    });
  });
});
