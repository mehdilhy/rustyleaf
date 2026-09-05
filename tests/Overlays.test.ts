/**
 * Ground overlays test suite (TDD — RED then GREEN)
 *
 * ImageOverlay / VideoOverlay / SVGOverlay — DOM
 * elements pinned to LatLngBounds, repositioned on every map move/zoom via
 * the wasm screen_xy projection.
 *
 * Run with: npm test -- Overlays.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';
import * as wasmMock from './__mocks__/wasmMock';
const { ImageOverlay, VideoOverlay, SVGOverlay, Map } = RustyleafAPI as any;

const bounds = [[48.8, 2.2], [48.9, 2.5]]; // [[south, west], [north, east]]

function makeMap() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const map = new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
  // deterministic projection for assertions: screen = (lng*100, -lat*10+600)
  jest.spyOn(map.wasmMap, 'screen_xy').mockImplementation(
    (lat: number, lng: number) => [lng * 100, -lat * 10 + 600]
  );
  return map;
}

describe('ImageOverlay', () => {
  test('stores url and bounds', () => {
    const o = new ImageOverlay('/img.png', bounds);
    expect(o.getBounds()).toEqual(bounds);
  });

  test('addTo appends a positioned <img> to the map container', () => {
    const map = makeMap();
    const o = new ImageOverlay('/img.png', bounds, { opacity: 0.5, alt: 'ground' });
    expect(o.addTo(map)).toBe(o);
    const img = map.containerElement.querySelector('img.rustyleaf-image-overlay');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/img.png');
    expect(img.alt).toBe('ground');
    expect(img.style.position).toBe('absolute');
    expect(img.style.opacity).toBe('0.5');
    // NW corner (48.9, 2.2) → x=220, y=111; SE (48.8, 2.5) → x=250, y=112
    expect(img.style.left).toBe('220px');
    expect(img.style.top).toBe('111px');
    expect(img.style.width).toBe('30px');
    expect(img.style.height).toBe('1px');
  });

  test('repositions on map move', async () => {
    const map = makeMap();
    new ImageOverlay('/img.png', bounds).addTo(map);
    const img = map.containerElement.querySelector('img.rustyleaf-image-overlay');
    map.wasmMap.screen_xy.mockImplementation((lat: number, lng: number) => [lng * 100 + 50, -lat * 10 + 600]);
    wasmMock.fire(map.wasmMap.ptr, 'move', { type: 'move' });
    await new Promise((r) => setTimeout(r, 0)); // reposition is deferred a microtask
    expect(img.style.left).toBe('270px');
  });

  test('setUrl / setOpacity / setBounds update the element', () => {
    const map = makeMap();
    const o = new ImageOverlay('/img.png', bounds).addTo(map);
    const img = map.containerElement.querySelector('img.rustyleaf-image-overlay');
    expect(o.setUrl('/other.png')).toBe(o);
    expect(img.getAttribute('src')).toBe('/other.png');
    expect(o.setOpacity(0.25)).toBe(o);
    expect(img.style.opacity).toBe('0.25');
    expect(o.setBounds([[48.8, 2.2], [49.0, 2.5]])).toBe(o);
    expect(img.style.top).toBe('110px'); // new north 49.0 → y=110
  });

  test('remove detaches and addTo re-attaches', () => {
    const map = makeMap();
    const o = new ImageOverlay('/img.png', bounds).addTo(map);
    expect(o.remove()).toBe(o);
    expect(map.containerElement.querySelector('img.rustyleaf-image-overlay')).toBeNull();
    o.addTo(map);
    expect(map.containerElement.querySelector('img.rustyleaf-image-overlay')).not.toBeNull();
  });
});

describe('VideoOverlay', () => {
  test('addTo appends a muted/looping/autoplaying <video>', () => {
    const map = makeMap();
    const o = new VideoOverlay('/clip.mp4', bounds).addTo(map);
    const video = map.containerElement.querySelector('video.rustyleaf-video-overlay');
    expect(video).not.toBeNull();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(o.getElement()).toBe(video);
  });
});

describe('SVGOverlay', () => {
  test('addTo positions a provided SVG element', () => {
    const map = makeMap();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const o = new SVGOverlay(svg, bounds).addTo(map);
    expect(svg.parentNode).toBe(map.containerElement);
    expect(svg.style.position).toBe('absolute');
    expect(svg.style.left).toBe('220px');
    expect(o.getElement()).toBe(svg);
  });
});
