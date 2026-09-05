/**
 * Real-source unit tests for uncovered region D:
 *   - src/rustyleaf-api.js lines ~3323-3474
 *     - Marker._mountDomOverlay / _updateDomPosition / remove (DOM-overlay branch)
 *     - Marker bindPopup/openPopup/closePopup/isPopupOpen
 *     - Marker bindTooltip/openTooltip/closeTooltip/isTooltipOpen
 *   - Tooltip class (~3487-3614): constructor defaults, setContent/setLatLng,
 *     openOn/close, element creation with className option, anchoring via
 *     wasm screen_xy, move/zoom rebinding, error paths.
 *
 * Run: npx jest --config jest.real.config.js tests-real/PopupsTooltips.real.test.ts
 */

import { Map, Marker, Popup, Tooltip, DivIcon } from '../src/rustyleaf-api.js';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeMockMap() {
  return {
    containerElement: document.createElement('div'),
    wasmMap: { screen_xy: jest.fn(() => [400, 300]) },
    getCenter: jest.fn(() => [48.8566, 2.3522]),
    project: jest.fn(() => [400, 300]),
    unproject: jest.fn(() => [48.8566, 2.3522]),
    panTo: jest.fn(),
    flyTo: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    _fireLocalEvent: jest.fn(),
  };
}

function makeRealMap(): any {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Map(el, { center: [48.8566, 2.3522], zoom: 12 });
}

describe('Tooltip (real source)', () => {
  describe('Constructor', () => {
    test('defaults', () => {
      const t = new Tooltip();
      expect(t).toBeInstanceOf(Tooltip);
      expect(t.options.direction).toBe('auto');
      expect(t.options.opacity).toBe(0.9);
      expect(t.options.className).toBe('');
      expect(t.options.sticky).toBe(false);
      expect(t.options.offset).toEqual([0, 0]);
      expect(t.content).toBe('');
      expect(t.latlng).toBeNull();
      expect(t.map).toBeNull();
      expect(t.element).toBeNull();
      expect(t.isOpenTooltip()).toBe(false);
      expect(t.isOpen()).toBe(false);
      expect(t.getElement()).toBeNull();
    });

    test('custom options merge over defaults and content is picked up', () => {
      const t = new Tooltip({ direction: 'top', className: 'my-tip', sticky: true, offset: [5, -5], content: 'hello' });
      expect(t.options.direction).toBe('top');
      expect(t.options.className).toBe('my-tip');
      expect(t.options.sticky).toBe(true);
      expect(t.options.offset).toEqual([5, -5]);
      expect(t.options.opacity).toBe(0.9); // untouched default
      expect(t.content).toBe('hello');
      expect(t.getTooltipContent()).toBe('hello');
    });
  });

  describe('setContent / setLatLng', () => {
    test('setContent stores content and returns this; updates live element', () => {
      const t = new Tooltip({ content: 'first' });
      const map = makeMockMap();
      t.setLatLng([10, 20]);
      t.openOn(map as any);

      const res = t.setContent('<b>second</b>');
      expect(res).toBe(t);
      expect(t.getTooltipContent()).toBe('<b>second</b>');
      expect(t.element!.innerHTML).toBe('<b>second</b>');
    });

    test('setContent before open does not touch any element', () => {
      const t = new Tooltip();
      expect(t.setContent('x')).toBe(t);
      expect(t.element).toBeNull();
    });

    test('HTMLElement content is appended into the tooltip element', () => {
      const child = document.createElement('span');
      child.textContent = 'dom child';
      const t = new Tooltip({ content: child as any });
      const map = makeMockMap();
      t.openOn(map as any);
      expect(t.element!.querySelector('span')!.textContent).toBe('dom child');
    });

    test('setLatLng stores latlng, returns this, repositions while open', () => {
      const t = new Tooltip();
      const spy = jest.spyOn(t as any, '_updatePosition');
      const res = t.setLatLng([1, 2]);
      expect(res).toBe(t);
      expect(t.getLatLng()).toEqual([1, 2]);
      // Not open yet -> no reposition
      expect(spy).not.toHaveBeenCalled();

      const map = makeMockMap();
      t.openOn(map as any);
      spy.mockClear();
      t.setLatLng([3, 4]);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('openOn', () => {
    test('creates element, appends to container, anchors via screen_xy', () => {
      const t = new Tooltip({ content: 'tip text', className: 'fancy-tip' });
      const map = makeMockMap();

      const res = t.setLatLng([48.85, 2.35]).openOn(map as any);

      expect(res).toBe(t);
      expect(t.isOpenTooltip()).toBe(true);
      expect(t.isOpen()).toBe(true);
      expect(t.map).toBe(map);
      expect(t.element).not.toBeNull();
      expect(map.containerElement.contains(t.element!)).toBe(true);
      // Element creation with className option
      expect(t.element!.className).toBe('rustyleaf-tooltip fancy-tip');
      expect(t.element!.innerHTML).toBe('tip text');
      // Position anchored through the wasm projection
      expect(map.wasmMap.screen_xy).toHaveBeenCalledWith(48.85, 2.35);
      expect(t.element!.style.left).toBe('400px');
      expect(t.element!.style.top).toBe('300px');
      // Active-tooltip bookkeeping + local event
      expect((map as any)._activeTooltip).toBe(t);
      expect(map._fireLocalEvent).toHaveBeenCalledWith(
        'tooltipopen',
        expect.objectContaining({ type: 'tooltipopen', tooltip: t })
      );
      // getElement only works while open
      expect(t.getElement()).toBe(t.element);
    });

    test('registers deferred move/zoom listeners which reposition the tip', async () => {
      const t = new Tooltip({ content: 'x' }).setLatLng([1, 1]);
      const map = makeMockMap();
      t.openOn(map as any);
      const callsBefore = (map.wasmMap.screen_xy as jest.Mock).mock.calls.length;

      await flush(); // deferCallback -> queueMicrotask

      expect(map.on).toHaveBeenCalledWith('move', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('zoom', expect.any(Function));

      // Simulate a map move: the registered handler must reposition.
      const moveHandler = map.on.mock.calls.find((c: any[]) => c[0] === 'move')[1];
      moveHandler();
      expect((map.wasmMap.screen_xy as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
    });

    test('no-ops for null map or map without containerElement', () => {
      const t = new Tooltip({ content: 'x' });
      expect(t.openOn(null as any)).toBe(t);
      expect(t.isOpenTooltip()).toBe(false);
      expect(t.element).toBeNull();

      expect(t.openOn({} as any)).toBe(t);
      expect(t.isOpenTooltip()).toBe(false);
      expect(t.map).toBeNull();
    });

    test('_updatePosition is a safe no-op without latlng/map/element', () => {
      const t = new Tooltip();
      expect(() => (t as any)._updatePosition()).not.toThrow();

      const map = makeMockMap();
      (map.wasmMap.screen_xy as jest.Mock).mockReturnValueOnce(null as any);
      t.setLatLng([5, 5]).openOn(map as any);
      // screen_xy returned null -> position left untouched, no throw
      expect(t.element!.style.left).toBe('');
    });
  });

  describe('close', () => {
    test('removes element, unbinds listeners, clears state and fires tooltipclose', async () => {
      const t = new Tooltip({ content: 'bye' }).setLatLng([2, 3]);
      const map = makeMockMap();
      t.openOn(map as any);
      await flush();

      const el = t.element!;
      expect(map.containerElement.contains(el)).toBe(true);

      const res = t.close();

      expect(res).toBe(t);
      expect(t.isOpenTooltip()).toBe(false);
      expect(t.getElement()).toBeNull();
      expect(t.map).toBeNull();
      expect(map.containerElement.contains(el)).toBe(false);
      expect(map.off).toHaveBeenCalledWith('move', expect.any(Function));
      expect(map.off).toHaveBeenCalledWith('zoom', expect.any(Function));
      expect((map as any)._activeTooltip).toBeNull();
      expect(map._fireLocalEvent).toHaveBeenCalledWith(
        'tooltipclose',
        expect.objectContaining({ type: 'tooltipclose', tooltip: t })
      );
    });

    test('closing an already-closed tooltip is a harmless no-op', () => {
      const t = new Tooltip();
      expect(t.close()).toBe(t);
      expect(t.isOpenTooltip()).toBe(false);
    });

    test('works even when the map lacks on/off/_fireLocalEvent', () => {
      const t = new Tooltip({ content: 'plain' }).setLatLng([0, 0]);
      const bareMap: any = { containerElement: document.createElement('div'), wasmMap: { screen_xy: () => [1, 2] } };
      t.openOn(bareMap);
      expect(t.isOpenTooltip()).toBe(true);
      expect(t.close()).toBe(t);
      expect(t.isOpenTooltip()).toBe(false);
    });
  });

  describe('marker popup integration', () => {
    let map: any;
    beforeEach(() => { map = makeRealMap(); });
    afterEach(() => { if (map.remove) map.remove(); });

    test('bindPopup with a Popup instance reuses it and opens at marker latlng', () => {
      const popup = new Popup({ content: 'instance popup' });
      const marker = new Marker([48.8566, 2.3522]);
      expect(marker.bindPopup(popup)).toBe(marker);
      expect(marker.getPopup()).toBe(popup);

      marker.addTo(map);
      expect(marker.openPopup()).toBe(marker);
      expect(marker.isPopupOpen()).toBe(true);
      expect(popup.isOpen).toBe(true);
      expect(popup.latlng).toEqual([48.8566, 2.3522]);
      expect(map.containerElement.contains(popup.element)).toBe(true);

      expect(marker.closePopup()).toBe(marker);
      expect(marker.isPopupOpen()).toBe(false);
      expect(popup.isOpen).toBe(false);
      expect(map.containerElement.contains(popup.element)).toBe(false);
    });

    test('bindPopup with string content lazily wraps into a Popup on openPopup', () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(marker.bindPopup('lazy content')).toBe(marker);
      expect(marker.getPopupContent()).toBe('lazy content');
      expect(marker.getPopup()).toBeUndefined();

      marker.addTo(map);
      marker.openPopup();

      expect(marker.isPopupOpen()).toBe(true);
      // NOTE (real-source quirk): the lazy wrap is `new Popup({content})`, so the
      // string lives under options.content (the Popup body renders empty).
      expect(marker.getPopup()).toBeInstanceOf(Popup);
      expect(marker.getPopup().options.content).toBe('lazy content');
      expect(marker.getPopup().isOpen).toBe(true);

      marker.closePopup();
      expect(marker.isPopupOpen()).toBe(false);
    });

    test('openPopup/closePopup without a map only flips the flag safely', () => {
      const marker = new Marker([10, 20]).bindPopup('no map yet');
      expect(() => marker.openPopup()).not.toThrow();
      expect(marker.isPopupOpen()).toBe(true); // flag set even before addTo

      const unbound = new Marker([10, 20]); // nothing bound at all
      expect(() => unbound.openPopup()).not.toThrow();
      expect(() => unbound.closePopup()).not.toThrow();
    });

    test('bindTooltip with string content lazily wraps into a Tooltip on openTooltip', async () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(marker.bindTooltip('hover me')).toBe(marker);
      expect(marker.getTooltipContent()).toBe('hover me');

      marker.addTo(map);
      // Spy on the real Map's event API; the tooltip registration is deferred.
      const onSpy = jest.spyOn(map, 'on');

      expect(marker.openTooltip()).toBe(marker);
      expect(marker.isTooltipOpen()).toBe(true);

      await flush(); // deferCallback -> queueMicrotask

      expect(onSpy).toHaveBeenCalledWith('move', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('zoom', expect.any(Function));

      const bound: any = (marker as any)._boundTooltip;
      expect(bound).toBeInstanceOf(Tooltip);
      expect(bound.latlng).toEqual([48.8566, 2.3522]);
      expect(map.containerElement.contains(bound.element)).toBe(true);
      expect(bound.element.innerHTML).toBe('hover me');

      expect(marker.closeTooltip()).toBe(marker);
      expect(marker.isTooltipOpen()).toBe(false);
      expect(bound.isOpenTooltip()).toBe(false);
      expect((marker as any)._boundTooltip).toBeNull();
    });

    test('repeated openTooltip cycles create a fresh tooltip each time', () => {
      const marker = new Marker([48.8566, 2.3522]).bindTooltip('cycle').addTo(map);

      marker.openTooltip();
      const first: any = (marker as any)._boundTooltip;
      expect(first.isOpenTooltip()).toBe(true);

      marker.closeTooltip();
      marker.openTooltip();
      const second: any = (marker as any)._boundTooltip;
      expect(second).not.toBe(first);
      expect(second.isOpenTooltip()).toBe(true);
      expect(map.containerElement.contains(second.element)).toBe(true);
    });

    test('bindTooltip with a Popup instance routes through _tooltip.openOn directly', () => {
      const tip = new Popup({ content: 'tip via popup' });
      const marker = new Marker([1, 2]);
      marker.bindTooltip(tip);
      marker.addTo(map);

      marker.openTooltip();
      // Popup instance branch: reused as-is, anchored at the marker latlng.
      expect(marker.getTooltipContent()).toBeUndefined();
      expect((marker as any)._tooltip).toBe(tip);
      expect(tip.isOpen).toBe(true);
      expect(tip.latlng).toEqual([1, 2]);
      expect(map.containerElement.contains(tip.element)).toBe(true);

      marker.closeTooltip();
      expect(tip.isOpen).toBe(false);
    });

    test('openTooltip/closeTooltip without a map only flip the flag safely', () => {
      const marker = new Marker([10, 20]).bindTooltip('no map');
      expect(() => marker.openTooltip()).not.toThrow();
      expect(marker.isTooltipOpen()).toBe(true);

      const plain = new Marker([10, 20]);
      expect(() => plain.openTooltip()).not.toThrow();
      expect(() => plain.closeTooltip()).not.toThrow();
      expect(plain.isTooltipOpen()).toBe(false);
    });
  });

  describe('DivIcon marker DOM overlays (lines ~3323-3373)', () => {
    let map: any;
    beforeEach(() => { map = makeRealMap(); });
    afterEach(() => { if (map.remove) map.remove(); });

    test('overlay element created with className, html string, and opacity', () => {
      const icon = new DivIcon({ html: '<em>pin</em>', className: 'custom-pin' });
      const marker = new Marker([48.8566, 2.3522], { icon, opacity: 0.5 });
      marker.addTo(map);

      const el: HTMLElement = (marker as any)._domElement;
      expect(el).toBeTruthy();
      expect(el.className).toContain('rustyleaf-marker-overlay');
      expect(el.className).toContain('custom-pin');
      expect(el.innerHTML).toBe('<em>pin</em>');
      expect(el.style.opacity).toBe('0.5');
      expect(map.containerElement.contains(el)).toBe(true);
      expect(marker.getElement()).toBeNull(); // GPU markers return null; overlay tracked separately

      // Positioned via map.project
      expect(el.style.left).not.toBe('');
      expect(el.style.transform).toContain('translate');
    });

    test('HTMLElement html option is appended as a child node', () => {
      const node = document.createElement('strong');
      node.id = 'overlay-child';
      const marker = new Marker([48.8566, 2.3522], { icon: new DivIcon({ html: node as any }) });
      marker.addTo(map);
      expect((marker as any)._domElement.querySelector('#overlay-child')).not.toBeNull();
    });

    test('opacity 1 leaves style untouched; anchor math uses iconAnchor/iconSize', () => {
      const icon = new DivIcon({
        html: 'a',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });
      const marker = new Marker([48.8566, 2.3522], { icon }).addTo(map);
      const el: HTMLElement = (marker as any)._domElement;
      expect(el.style.opacity).toBe('');

      marker.setLatLng([48.85, 2.36]); // exercises _updateDomPosition with anchor math
      expect(el.style.transform).toBe('translate(-48%, -100%)'); // -(12/25)*100%, -(41/41)*100%
    });

    test('clicking the overlay fires marker click and auto-opens bound popup once', async () => {
      const onClick = jest.fn();
      const marker = new Marker([48.8566, 2.3522], {
        icon: new DivIcon({ html: 'x' }),
      });
      marker.on('click', onClick);
      marker.bindPopup('from click').addTo(map);

      const el: HTMLElement = (marker as any)._domElement;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ type: 'click', target: marker }));
      expect(marker.isPopupOpen()).toBe(true);
      expect((marker.getPopup() as any)._skipAutoCloseOnce).toBe(true);

      marker.closePopup();
      // Second click reopens (still not open at dispatch time)
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(marker.isPopupOpen()).toBe(true);
    });

    test('click without bound popup still fires the click event', () => {
      const onClick = jest.fn();
      const marker = new Marker([48.8566, 2.3522], { icon: new DivIcon({ html: 'y' }) });
      marker.on('click', onClick);
      marker.addTo(map);

      ((marker as any)._domElement as HTMLElement)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(onClick).toHaveBeenCalled();
      expect(marker.isPopupOpen()).toBeFalsy();
    });

    test('mouseover/mouseout events are forwarded', () => {
      const over = jest.fn();
      const out = jest.fn();
      const marker = new Marker([48.8566, 2.3522], { icon: new DivIcon({ html: 'z' }) });
      marker.on('mouseover', over).on('mouseout', out);
      marker.addTo(map);

      const el: HTMLElement = (marker as any)._domElement;
      el.dispatchEvent(new MouseEvent('mouseover'));
      el.dispatchEvent(new MouseEvent('mouseout'));
      expect(over).toHaveBeenCalledWith(expect.objectContaining({ type: 'mouseover', target: marker }));
      expect(out).toHaveBeenCalledWith(expect.objectContaining({ type: 'mouseout', target: marker }));
    });

    test('remove() tears down the overlay, closes popup/tooltip and unbinds map handlers', async () => {
      const removed = jest.fn();
      const marker = new Marker([48.8566, 2.3522], { icon: new DivIcon({ html: 'rm' }) });
      marker.on('remove', removed);
      marker.bindPopup('p').bindTooltip('t').addTo(map);
      marker.openPopup();
      marker.openTooltip();
      await flush(); // let deferred map.on registrations land

      const el: HTMLElement = (marker as any)._domElement;
      const offSpy = jest.spyOn(map, 'off');

      expect(marker.remove()).toBe(marker);
      expect(removed).toHaveBeenCalledWith(expect.objectContaining({ type: 'remove', target: marker }));
      expect((marker as any)._domElement).toBeNull();
      expect(map.containerElement.contains(el)).toBe(false);
      expect(marker.isPopupOpen()).toBe(false);
      expect(marker.isTooltipOpen()).toBe(false);
      expect(offSpy).toHaveBeenCalledWith('move', expect.any(Function));
      expect(offSpy).toHaveBeenCalledWith('zoom', expect.any(Function));
      expect(marker.getPopup().isOpen).toBe(false);
    });

    test('default-icon marker uses the wasm sprite path, not a DOM overlay', () => {
      const marker = new Marker([48.8566, 2.3522]); // Icon.Default -> GPU sprite
      marker.addTo(map);
      expect((marker as any)._domElement).toBeUndefined();
      expect((marker as any)._id).not.toBeNull();
      expect(map.wasmMap.add_marker).toBeDefined();

      marker.remove();
      expect((marker as any)._id).toBeNull();
    });
  });
});
