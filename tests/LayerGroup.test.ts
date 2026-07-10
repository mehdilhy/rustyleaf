/**
 * LayerGroup / FeatureGroup test suite (TDD — RED then GREEN)
 *
 * Layer grouping: LayerGroup for bulk addTo/remove,
 * FeatureGroup adds combined getBounds and delegated events.
 *
 * Run with: npm test -- LayerGroup.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { LayerGroup, FeatureGroup, PointLayer, Rectangle, Map } = RustyleafAPI as any;

describe('Layer grouping', () => {
  function makeMap() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
  }

  describe('LayerGroup', () => {
    test('is exported; constructor accepts an initial array of layers', () => {
      const a = new PointLayer();
      const b = new PointLayer();
      const group = new LayerGroup([a, b]);
      expect(group.getLayers()).toEqual([a, b]);
    });

    test('addLayer / removeLayer / hasLayer', () => {
      const group = new LayerGroup();
      const layer = new PointLayer();
      expect(group.hasLayer(layer)).toBe(false);
      expect(group.addLayer(layer)).toBe(group);
      expect(group.hasLayer(layer)).toBe(true);
      expect(group.removeLayer(layer)).toBe(group);
      expect(group.hasLayer(layer)).toBe(false);
    });

    test('clearLayers empties the group', () => {
      const group = new LayerGroup([new PointLayer(), new PointLayer()]);
      expect(group.clearLayers()).toBe(group);
      expect(group.getLayers()).toEqual([]);
    });

    test('eachLayer visits every layer', () => {
      const a = new PointLayer();
      const b = new PointLayer();
      const group = new LayerGroup([a, b]);
      const seen: any[] = [];
      group.eachLayer((l: any) => seen.push(l));
      expect(seen).toEqual([a, b]);
    });

    test('addTo(map) adds every child to the map', () => {
      const map = makeMap();
      const a = new PointLayer();
      const b = new PointLayer();
      jest.spyOn(a, 'addTo');
      jest.spyOn(b, 'addTo');
      const group = new LayerGroup([a, b]);
      expect(group.addTo(map)).toBe(group);
      expect(a.addTo).toHaveBeenCalledWith(map);
      expect(b.addTo).toHaveBeenCalledWith(map);
    });

    test('addLayer after addTo immediately adds the child to the map', () => {
      const map = makeMap();
      const group = new LayerGroup().addTo(map);
      const late = new PointLayer();
      jest.spyOn(late, 'addTo');
      group.addLayer(late);
      expect(late.addTo).toHaveBeenCalledWith(map);
    });

    test('remove() removes every child', () => {
      const map = makeMap();
      const a = new PointLayer();
      jest.spyOn(a, 'remove');
      const group = new LayerGroup([a]).addTo(map);
      expect(group.remove()).toBe(group);
      expect(a.remove).toHaveBeenCalled();
    });
  });

  describe('FeatureGroup', () => {
    test('is a LayerGroup', () => {
      expect(new FeatureGroup()).toBeInstanceOf(LayerGroup);
    });

    test('getBounds unions child bounds', () => {
      const r1 = new Rectangle([[48.8, 2.2], [48.9, 2.5]]);
      const r2 = new Rectangle([[40.0, -71.0], [41.0, -70.0]]);
      const fg = new FeatureGroup([r1, r2]);
      expect(fg.getBounds()).toEqual([[40.0, -71.0], [48.9, 2.5]]);
    });

    test('getBounds returns null when no child has bounds', () => {
      const fg = new FeatureGroup([new PointLayer()]);
      expect(fg.getBounds()).toBeNull();
    });

    test('on() delegates to every child and returns this', () => {
      const a = new PointLayer();
      const b = new PointLayer();
      jest.spyOn(a, 'on');
      jest.spyOn(b, 'on');
      const fg = new FeatureGroup([a, b]);
      const cb = () => {};
      expect(fg.on('click', cb)).toBe(fg);
      expect(a.on).toHaveBeenCalledWith('click', cb);
      expect(b.on).toHaveBeenCalledWith('click', cb);
    });
  });
});
