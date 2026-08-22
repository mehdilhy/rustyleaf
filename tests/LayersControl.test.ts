/**
 * LayersControl test suite (TDD — RED then GREEN)
 *
 * LayersControl — a DOM control that toggles overlay and
 * base layers on/off. Built on the Control base class.
 *
 * Run with: npm test -- LayersControl.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { LayersControl, PointLayer, Map } = RustyleafAPI as any;

describe('LayersControl feature', () => {
  function makeMap() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
  }

  test('is exported as a constructor', () => {
    expect(typeof LayersControl).toBe('function');
  });

  test('addOverlay / addBaseLayer return this', () => {
    const lc = new LayersControl();
    const layer = new PointLayer();
    expect(lc.addOverlay(layer, 'Points')).toBe(lc);
    expect(lc.addBaseLayer(layer, 'Base')).toBe(lc);
  });

  test('addTo creates a container and returns this', () => {
    const lc = new LayersControl();
    const map = makeMap();
    expect(lc.addTo(map)).toBe(lc);
    expect(lc.getContainer()).not.toBeNull();
  });

  test('renders a checkbox per overlay', () => {
    const lc = new LayersControl();
    const map = makeMap();
    lc.addOverlay(new PointLayer(), 'Points');
    lc.addOverlay(new PointLayer(), 'More');
    lc.addTo(map);
    const boxes = lc.getContainer().querySelectorAll('input[type=checkbox]');
    expect(boxes.length).toBe(2);
  });

  test('unchecking an overlay calls layer.remove()', () => {
    const lc = new LayersControl();
    const map = makeMap();
    const layer = new PointLayer();
    jest.spyOn(layer, 'remove');
    lc.addOverlay(layer, 'Points');
    lc.addTo(map);
    const box = lc.getContainer().querySelector('input[type=checkbox]');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(layer.remove).toHaveBeenCalled();
  });

  test('checking an overlay calls layer.addTo(map)', () => {
    const lc = new LayersControl();
    const map = makeMap();
    const layer = new PointLayer();
    layer.remove(); // start hidden
    jest.spyOn(layer, 'addTo');
    lc.addOverlay(layer, 'Points');
    lc.addTo(map);
    const box = lc.getContainer().querySelector('input[type=checkbox]');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(layer.addTo).toHaveBeenCalledWith(map);
  });

  test('remove detaches the control', () => {
    const lc = new LayersControl();
    const map = makeMap();
    lc.addTo(map);
    const el = lc.getContainer();
    expect(lc.remove()).toBe(lc);
    expect(el.parentNode).toBeNull();
  });
});
