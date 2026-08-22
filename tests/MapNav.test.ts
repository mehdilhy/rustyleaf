/**
 * Map navigation test suite (TDD — RED then GREEN)
 *
 * Map navigation / state features:
 * flyTo, flyToBounds, setMaxBounds/getMaxBounds (with clamping), invalidateSize,
 * locate/stopLocate.
 *
 * Run with: npm test -- MapNav.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { Map } = RustyleafAPI as any;

describe('Map navigation feature', () => {
  function makeMap() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const map = new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
    jest.spyOn(map, 'setView');
    jest.spyOn(map, 'fitBounds');
    jest.spyOn(map.wasmMap, 'resize');
    return map;
  }

  describe('flyTo', () => {
    test('is a function and returns this', () => {
      const map = makeMap();
      expect(typeof map.flyTo).toBe('function');
      expect(map.flyTo([40, -70])).toBe(map);
    });

    test('eventually calls setView', (done) => {
      const map = makeMap();
      map.flyTo([40, -70], { duration: 60 });
      setTimeout(() => {
        expect(map.setView).toHaveBeenCalled();
        done();
      }, 300);
    });

    test('accepts a zoom option', (done) => {
      const map = makeMap();
      map.flyTo([40, -70], { zoom: 14, duration: 40 });
      setTimeout(() => {
        const last = map.setView.mock.calls[map.setView.mock.calls.length - 1];
        expect(last[1]).toBeGreaterThan(12);
        done();
      }, 300);
    });
  });

  describe('flyToBounds', () => {
    test('returns this and calls fitBounds', () => {
      const map = makeMap();
      const bounds = [[48.8, 2.2], [48.9, 2.5]];
      expect(map.flyToBounds(bounds)).toBe(map);
      expect(map.fitBounds).toHaveBeenCalledWith(bounds);
    });
  });

  describe('maxBounds', () => {
    test('setMaxBounds stores and getMaxBounds returns it', () => {
      const map = makeMap();
      const b = [[48.8, 2.2], [48.9, 2.5]];
      expect(map.setMaxBounds(b)).toBe(map);
      expect(map.getMaxBounds()).toEqual(b);
    });

    test('setView clamps center inside maxBounds', () => {
      const map = makeMap();
      map.setMaxBounds([[48.8, 2.2], [48.9, 2.5]]);
      map.setView([60, 2.3], 12); // lat 60 is outside
      const c = map.getCenter();
      expect(c[0]).toBeLessThanOrEqual(48.9);
      expect(c[0]).toBeGreaterThanOrEqual(48.8);
    });

    test('setView leaves valid centers untouched', () => {
      const map = makeMap();
      map.setMaxBounds([[48.8, 2.2], [48.9, 2.5]]);
      map.setView([48.85, 2.3], 12);
      const c = map.getCenter();
      expect(c[0]).toBeCloseTo(48.85, 5);
    });
  });

  describe('invalidateSize', () => {
    test('returns this and calls wasm resize', () => {
      const map = makeMap();
      expect(map.invalidateSize()).toBe(map);
      expect(map.wasmMap.resize).toHaveBeenCalled();
    });
  });

  describe('locate', () => {
    test('returns this and does not throw when geolocation is unavailable', () => {
      const map = makeMap();
      expect(() => map.locate()).not.toThrow();
      expect(map.locate()).toBe(map);
    });

    test('stopLocate returns this', () => {
      const map = makeMap();
      expect(map.stopLocate()).toBe(map);
    });
  });
});
