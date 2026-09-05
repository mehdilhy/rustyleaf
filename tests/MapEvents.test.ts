/**
 * Extended event set test suite (TDD — RED then GREEN)
 *
 * Extended map events:
 * movestart/moveend, zoomstart/zoomend (debounce-synthesized around the core
 * move/zoom streams), layeradd/layerremove (with Map.addLayer/removeLayer/
 * hasLayer), popupopen/popupclose, tooltipopen/tooltipclose, resize, load.
 *
 * Run with: npm test -- MapEvents.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
const { Map, PointLayer, Popup, Tooltip } = RustyleafAPI as any;

function makeMap() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

describe('Extended map events', () => {
  test('movestart and moveend fire around movement', (done) => {
    const map = makeMap();
    const order: string[] = [];
    map.on('movestart', () => order.push('movestart'));
    map.on('moveend', () => order.push('moveend'));
    map.panBy(10, 10);
    map.panBy(5, 5); // still one movement burst
    setTimeout(() => {
      expect(order).toEqual(['movestart', 'moveend']);
      done();
    }, 400);
  });

  test('zoomstart and zoomend fire around zooming', (done) => {
    const map = makeMap();
    const order: string[] = [];
    map.on('zoomstart', () => order.push('zoomstart'));
    map.on('zoomend', () => order.push('zoomend'));
    map.zoomIn();
    setTimeout(() => {
      expect(order).toEqual(['zoomstart', 'zoomend']);
      done();
    }, 400);
  });

  test('layeradd fires when a layer is added (via layer.addTo)', () => {
    const map = makeMap();
    const added: any[] = [];
    map.on('layeradd', (e: any) => added.push(e.layer));
    const layer = new PointLayer();
    layer.addTo(map);
    expect(added).toEqual([layer]);
  });

  test('map.addLayer / removeLayer / hasLayer with layerremove event', () => {
    const map = makeMap();
    const events: string[] = [];
    map.on('layeradd', () => events.push('add'));
    map.on('layerremove', () => events.push('remove'));
    const layer = new PointLayer();
    expect(map.addLayer(layer)).toBe(map);
    expect(map.hasLayer(layer)).toBe(true);
    expect(map.removeLayer(layer)).toBe(map);
    expect(map.hasLayer(layer)).toBe(false);
    expect(events).toEqual(['add', 'remove']);
  });

  test('re-adding the same layer does not double-fire layeradd', () => {
    const map = makeMap();
    let count = 0;
    map.on('layeradd', () => count++);
    const layer = new PointLayer();
    layer.addTo(map);
    layer.addTo(map);
    expect(count).toBe(1);
  });

  test('popupopen / popupclose fire on the map', () => {
    const map = makeMap();
    const events: string[] = [];
    map.on('popupopen', (e: any) => events.push('open:' + (e.popup ? 'p' : '?')));
    map.on('popupclose', () => events.push('close'));
    const popup = new Popup().setLatLng([48.85, 2.35]).setContent('hi');
    popup.openOn(map);
    popup.close();
    expect(events).toEqual(['open:p', 'close']);
  });

  test('tooltipopen / tooltipclose fire on the map', () => {
    const map = makeMap();
    const events: string[] = [];
    map.on('tooltipopen', () => events.push('open'));
    map.on('tooltipclose', () => events.push('close'));
    const tip = new Tooltip({ content: 'tip' }).setLatLng([48.85, 2.35]);
    tip.openOn(map);
    tip.close();
    expect(events).toEqual(['open', 'close']);
  });

  test('resize fires on invalidateSize', () => {
    const map = makeMap();
    let fired = 0;
    map.on('resize', () => fired++);
    map.invalidateSize();
    expect(fired).toBe(1);
  });

  test('load fires once after initialization', (done) => {
    const map = makeMap();
    let fired = 0;
    map.on('load', () => fired++);
    setTimeout(() => {
      expect(fired).toBe(1);
      done();
    }, 100);
  });

  test('off() unregisters extended-event handlers', (done) => {
    const map = makeMap();
    let fired = 0;
    const cb = () => fired++;
    map.on('moveend', cb);
    map.off('moveend', cb);
    map.panBy(10, 10);
    setTimeout(() => {
      expect(fired).toBe(0);
      done();
    }, 400);
  });
});
