/**
 * Marker feature test suite (TDD — RED phase)
 *
 * Markers (with Icon / DivIcon) are NOT yet implemented in rustyleaf.
 * These tests define the desired API and
 * currently FAIL. They are written to pass once the feature lands, mirroring
 * rustyleaf's existing API conventions (chainable methods, `addTo`/`remove`,
 * `on`/`off` events) and Leaflet's Marker surface.
 *
 * Run with: npm test -- Marker.test.ts
 */

import * as RustyleafAPI from '../src/rustyleaf-api.js';

// rustyleaf does not export these yet — they are `undefined` until implemented.
// Casting avoids a TS compile error so the suite runs and fails at runtime (red).
const { Marker, Icon, DivIcon } = RustyleafAPI as any;

// Local helpers (mirrors createMockMap in setup.ts but adds marker hooks)
function createMockMap() {
  return {
    setView: jest.fn(),
    pan: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    add_tile_layer: jest.fn(),
    add_point_layer: jest.fn(),
    add_points: jest.fn(),
    render: jest.fn(),
    on: jest.fn(),
    resize: jest.fn(),
    screen_xy: jest.fn(),
    containerElement: document.createElement('div'),
    _markers: [] as any[],
    wasmMap: {
      add_marker: jest.fn(() => 0),
      update_marker: jest.fn(),
      set_marker_style: jest.fn(),
      set_marker_visible: jest.fn(),
      remove_marker: jest.fn(),
      get_marker_latlng: jest.fn(() => [0, 0]),
    },
  };
}

describe('Marker feature', () => {
  // ---- Presence / export guards (the literal "assert it is false" checks) ----

  describe('Exports', () => {
    test('Marker is exported as a constructor', () => {
      expect(typeof Marker).toBe('function');
    });
    test('Icon is exported as a constructor', () => {
      expect(typeof Icon).toBe('function');
    });
    test('DivIcon is exported as a constructor', () => {
      expect(typeof DivIcon).toBe('function');
    });
    test('Icon.Default (default icon) is available', () => {
      expect(Icon && typeof Icon.Default).toBe('function');
    });
  });

  // ---- Constructor ----

  describe('Marker constructor', () => {
    test('creates a marker from [lat, lng]', () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(marker).toBeInstanceOf(Marker);
    });

    test('throws on invalid latlng', () => {
      expect(() => new Marker(null as any)).toThrow();
      expect(() => new Marker([NaN, 2.3522] as any)).toThrow();
      expect(() => new Marker([48.8] as any)).toThrow();
    });

    test('stores the initial latlng', () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(marker.getLatLng()).toEqual([48.8566, 2.3522]);
    });

    test('defaults to the default icon when no icon option given', () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(marker.getIcon()).toBeDefined();
      expect(marker.getIcon()).toBeInstanceOf(Icon);
    });

    test('accepts a custom Icon via options', () => {
      const icon = new Icon({ iconUrl: 'pin.png', iconSize: [24, 36] });
      const marker = new Marker([48.8566, 2.3522], { icon });
      expect(marker.getIcon()).toBe(icon);
    });

    test('accepts a custom DivIcon via options', () => {
      const icon = new DivIcon({ html: '<b>X</b>', className: 'my-pin' });
      const marker = new Marker([48.8566, 2.3522], { icon });
      expect(marker.getIcon()).toBe(icon);
    });

    test('reads draggable option', () => {
      const marker = new Marker([48.8566, 2.3522], { draggable: true });
      expect(marker.isDraggable()).toBe(true);
    });

    test('reads opacity option', () => {
      const marker = new Marker([48.8566, 2.3522], { opacity: 0.5 });
      expect(marker.getOpacity()).toBe(0.5);
    });

    test('reads zIndexOffset option', () => {
      const marker = new Marker([48.8566, 2.3522], { zIndexOffset: 100 });
      expect(marker.getZIndexOffset()).toBe(100);
    });
  });

  // ---- Position ----

  describe('setLatLng / getLatLng', () => {
    test('setLatLng updates position and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const result = marker.setLatLng([40.7128, -74.006]);
      expect(result).toBe(marker);
      expect(marker.getLatLng()).toEqual([40.7128, -74.006]);
    });

    test('setLatLng throws on invalid coordinates', () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(() => marker.setLatLng([Infinity, 2.3522] as any)).toThrow();
    });
  });

  // ---- Icon ----

  describe('setIcon / getIcon', () => {
    test('setIcon replaces the icon and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const icon = new Icon({ iconUrl: 'other.png', iconSize: [32, 32] });
      const result = marker.setIcon(icon);
      expect(result).toBe(marker);
      expect(marker.getIcon()).toBe(icon);
    });
  });

  // ---- Appearance ----

  describe('opacity', () => {
    test('setOpacity updates and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const result = marker.setOpacity(0.3);
      expect(result).toBe(marker);
      expect(marker.getOpacity()).toBe(0.3);
    });

    test('clamps opacity to [0, 1]', () => {
      const marker = new Marker([48.8566, 2.3522]);
      marker.setOpacity(2);
      expect(marker.getOpacity()).toBeLessThanOrEqual(1);
      marker.setOpacity(-1);
      expect(marker.getOpacity()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('zIndexOffset', () => {
    test('setZIndexOffset updates and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const result = marker.setZIndexOffset(50);
      expect(result).toBe(marker);
      expect(marker.getZIndexOffset()).toBe(50);
    });
  });

  // ---- Dragging ----

  describe('dragging', () => {
    test('setDraggable toggles and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const result = marker.setDraggable(true);
      expect(result).toBe(marker);
      expect(marker.isDraggable()).toBe(true);
    });

    test('emits dragstart/drag/dragend when draggable', () => {
      const marker = new Marker([48.8566, 2.3522], { draggable: true });
      const onStart = jest.fn();
      const onDrag = jest.fn();
      const onEnd = jest.fn();
      marker.on('dragstart', onStart);
      marker.on('drag', onDrag);
      marker.on('dragend', onEnd);

      marker.fire('dragstart');
      marker.fire('drag');
      marker.fire('dragend');

      expect(onStart).toHaveBeenCalled();
      expect(onDrag).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
    });
  });

  // ---- Map integration ----

  describe('addTo / remove', () => {
    test('addTo registers the marker on the map and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const map = createMockMap();
      const result = marker.addTo(map);
      expect(result).toBe(marker);
      expect(map.wasmMap.add_marker).toHaveBeenCalled();
      expect(marker._map).toBe(map);
    });

    test('remove detaches the marker and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const map = createMockMap();
      marker.addTo(map);
      const result = marker.remove();
      expect(result).toBe(marker);
      expect(map.wasmMap.remove_marker).toHaveBeenCalled();
      expect(marker._map).toBeNull();
    });

    test('remove is safe to call without a map', () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(() => marker.remove()).not.toThrow();
    });

    test('addTo then setLatLng updates the marker on the map', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const map = createMockMap();
      marker.addTo(map);
      marker.setLatLng([40.7128, -74.006]);
      expect(map.wasmMap.update_marker).toHaveBeenCalled();
    });
  });

  // ---- Events ----

  describe('events', () => {
    test('click event fires its handler', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const cb = jest.fn();
      marker.on('click', cb);
      marker.fire('click', { latlng: [48.8566, 2.3522] });
      expect(cb).toHaveBeenCalled();
    });

    test('mouseover / mouseout events fire', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const over = jest.fn();
      const out = jest.fn();
      marker.on('mouseover', over);
      marker.on('mouseout', out);
      marker.fire('mouseover');
      marker.fire('mouseout');
      expect(over).toHaveBeenCalled();
      expect(out).toHaveBeenCalled();
    });

    test('off removes a handler', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const cb = jest.fn();
      marker.on('click', cb);
      marker.off('click', cb);
      marker.fire('click');
      expect(cb).not.toHaveBeenCalled();
    });

    test('click event payload includes latlng', () => {
      const marker = new Marker([48.8566, 2.3522]);
      let received: any = null;
      marker.on('click', (e: any) => { received = e; });
      marker.fire('click', { latlng: [48.8566, 2.3522] });
      expect(received.latlng).toEqual([48.8566, 2.3522]);
    });
  });

  // ---- Popups & Tooltips ----

  describe('popup & tooltip binding', () => {
    test('bindPopup stores content and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const result = marker.bindPopup('Hello');
      expect(result).toBe(marker);
      expect(marker.getPopupContent()).toBe('Hello');
    });

    test('bindPopup with a Popup instance', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const Popup = (RustyleafAPI as any).Popup;
      const popup = new Popup();
      marker.bindPopup(popup);
      expect(marker.getPopup()).toBe(popup);
    });

    test('openPopup / closePopup toggle state', () => {
      const marker = new Marker([48.8566, 2.3522]);
      marker.bindPopup('Hi');
      expect(marker.openPopup()).toBe(marker);
      expect(marker.isPopupOpen()).toBe(true);
      expect(marker.closePopup()).toBe(marker);
      expect(marker.isPopupOpen()).toBe(false);
    });

    test('bindTooltip stores content and returns this', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const result = marker.bindTooltip('Tip');
      expect(result).toBe(marker);
      expect(marker.getTooltipContent()).toBe('Tip');
    });

    test('openTooltip / closeTooltip toggle state', () => {
      const marker = new Marker([48.8566, 2.3522]);
      marker.bindTooltip('Tip');
      marker.openTooltip();
      expect(marker.isTooltipOpen()).toBe(true);
      marker.closeTooltip();
      expect(marker.isTooltipOpen()).toBe(false);
    });
  });

  // ---- DOM element ----

  describe('DOM element', () => {
    test('getElement returns null (markers are GPU sprites, no DOM node)', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const map = createMockMap();
      marker.addTo(map);
      expect(marker.getElement()).toBeNull();
    });

    test('getElement returns null before being added to a map', () => {
      const marker = new Marker([48.8566, 2.3522]);
      expect(marker.getElement()).toBeNull();
    });
  });

  // ---- Method chaining ----

  describe('method chaining', () => {
    test('supports chained add/event/bind calls', () => {
      const marker = new Marker([48.8566, 2.3522]);
      const map = createMockMap();
      const result = marker
        .setLatLng([48.85, 2.35])
        .setOpacity(0.8)
        .bindPopup('Hi')
        .on('click', jest.fn())
        .addTo(map);
      expect(result).toBe(marker);
    });
  });
});

describe('Icon feature', () => {
  describe('Icon constructor', () => {
    test('creates an icon with required options', () => {
      const icon = new Icon({ iconUrl: 'pin.png' });
      expect(icon).toBeInstanceOf(Icon);
      expect(icon.options.iconUrl).toBe('pin.png');
    });

    test('throws when iconUrl is missing', () => {
      expect(() => new Icon({} as any)).toThrow();
    });

    test('stores size/anchor/popupAnchor options', () => {
      const icon = new Icon({
        iconUrl: 'pin.png',
        iconSize: [24, 36],
        iconAnchor: [12, 36],
        popupAnchor: [0, -36],
        className: 'my-icon',
      });
      expect(icon.options.iconSize).toEqual([24, 36]);
      expect(icon.options.iconAnchor).toEqual([12, 36]);
      expect(icon.options.popupAnchor).toEqual([0, -36]);
      expect(icon.options.className).toBe('my-icon');
    });

    test('supports shadow options', () => {
      const icon = new Icon({
        iconUrl: 'pin.png',
        shadowUrl: 'shadow.png',
        shadowSize: [40, 40],
        shadowAnchor: [20, 40],
      });
      expect(icon.options.shadowUrl).toBe('shadow.png');
      expect(icon.options.shadowSize).toEqual([40, 40]);
    });
  });

  describe('Icon.Default', () => {
    test('default icon has an iconUrl', () => {
      const icon = new Icon.Default();
      expect(icon).toBeInstanceOf(Icon);
      expect(typeof icon.options.iconUrl).toBe('string');
    });
  });
});

describe('DivIcon feature', () => {
  describe('DivIcon constructor', () => {
    test('creates a div icon with html', () => {
      const icon = new DivIcon({ html: '<b>X</b>', className: 'my-pin' });
      expect(icon).toBeInstanceOf(DivIcon);
      expect(icon.options.html).toBe('<b>X</b>');
      expect(icon.options.className).toBe('my-pin');
    });

    test('DivIcon is a subclass of Icon', () => {
      const icon = new DivIcon({ html: 'x' });
      expect(icon).toBeInstanceOf(Icon);
    });

    test('stores iconSize / iconAnchor', () => {
      const icon = new DivIcon({
        html: 'x',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        bgPos: [0, 0],
      });
      expect(icon.options.iconSize).toEqual([20, 20]);
      expect(icon.options.iconAnchor).toEqual([10, 10]);
      expect(icon.options.bgPos).toEqual([0, 0]);
    });
  });
});
