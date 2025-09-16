/**
 * Popup unit tests
 */

import { Popup } from '../src/rustyleaf-api.js';

describe('Popup', () => {
  describe('Constructor', () => {
    test('should create popup with default options', () => {
      const popup = new Popup();
      
      expect(popup).toBeInstanceOf(Popup);
      expect(popup.options.maxWidth).toBe(300);
      expect(popup.options.minWidth).toBe(50);
      expect(popup.options.autoPan).toBe(true);
      expect(popup.options.closeButton).toBe(true);
      expect(popup.element).toBeNull();
      expect(popup.latlng).toBeNull();
      expect(popup.map).toBeNull();
      expect(popup.content).toBe('');
      expect(popup.isOpen).toBe(false);
    });

    test('should create popup with custom options', () => {
      const options = {
        maxWidth: 400,
        minWidth: 100,
        maxHeight: 200,
        autoPan: false,
        closeButton: false,
        className: 'custom-popup'
      };
      const popup = new Popup(options);
      
      expect(popup.options.maxWidth).toBe(400);
      expect(popup.options.minWidth).toBe(100);
      expect(popup.options.maxHeight).toBe(200);
      expect(popup.options.autoPan).toBe(false);
      expect(popup.options.closeButton).toBe(false);
      expect(popup.options.className).toBe('custom-popup');
    });

    test('should merge custom options with defaults', () => {
      const options = {
        maxWidth: 500,
        customOption: 'custom-value'
      };
      const popup = new Popup(options);
      
      expect(popup.options.maxWidth).toBe(500);
      expect(popup.options.minWidth).toBe(50); // Default value
      expect(popup.options.customOption).toBe('custom-value');
    });
  });

  describe('setLatLng method', () => {
    test('should set latitude and longitude', () => {
      const popup = new Popup();
      const latlng = [40.7128, -74.0060];
      
      const result = popup.setLatLng(latlng as any);
      
      expect(result).toBe(popup); // Method chaining
      expect(popup.latlng).toEqual(latlng);
    });

    test('should update position when popup is open', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div')
      };
      popup.map = mockMap as any;
      popup.isOpen = true;
      popup.element = document.createElement('div');
      
      const originalUpdatePosition = popup._updatePosition;
      popup._updatePosition = jest.fn();
      
      popup.setLatLng([40.7589, -73.9851] as any);
      
      expect(popup._updatePosition).toHaveBeenCalled();
      
      // Restore original method
      popup._updatePosition = originalUpdatePosition;
    });

    test('should handle invalid coordinates', () => {
      const popup = new Popup();
      
      expect(() => {
        popup.setLatLng(['invalid', 'coordinates'] as any);
      }).not.toThrow();
      
      expect(() => {
        popup.setLatLng(null as any);
      }).not.toThrow();
    });
  });

  describe('setContent method', () => {
    test('should set string content', () => {
      const popup = new Popup();
      const content = '<h3>Hello World</h3><p>This is a popup</p>';
      
      const result = popup.setContent(content);
      
      expect(result).toBe(popup);
      expect(popup.content).toBe(content);
    });

    test('should set HTMLElement content', () => {
      const popup = new Popup();
      const content = document.createElement('div');
      content.innerHTML = '<h3>Hello World</h3>';
      
      const result = popup.setContent(content);
      
      expect(result).toBe(popup);
      expect(popup.content).toBe(content);
    });

    test('should update content when popup is open', () => {
      const popup = new Popup();
      popup.element = document.createElement('div');
      popup.contentWrapper = document.createElement('div');
      popup.element.appendChild(popup.contentWrapper);
      
      const originalUpdateContent = popup._updateContent;
      popup._updateContent = jest.fn();
      
      popup.setContent('New content');
      
      expect(popup._updateContent).toHaveBeenCalled();
      
      // Restore original method
      popup._updateContent = originalUpdateContent;
    });

    test('should handle null/undefined content', () => {
      const popup = new Popup();
      
      expect(() => {
        popup.setContent(null as any);
      }).not.toThrow();
      
      expect(() => {
        popup.setContent(undefined as any);
      }).not.toThrow();
    });
  });

  describe('setSource method', () => {
    test('should set source layer', () => {
      const popup = new Popup();
      const mockLayer = {};
      
      const result = popup.setSource(mockLayer as any);
      
      expect(result).toBe(popup);
      expect(popup._source).toBe(mockLayer);
    });
  });

  describe('openOn method', () => {
    test('should open popup on map', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      
      const result = popup.openOn(mockMap as any);
      
      expect(result).toBe(popup);
      expect(popup.map).toBe(mockMap);
      expect(popup.isOpen).toBe(true);
      expect(popup.element).toBeTruthy();
      expect(mockMap.containerElement.contains(popup.element)).toBe(true);
    });

    test('should close existing popup if open on different map', () => {
      const popup = new Popup();
      const mockMap1 = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      const mockMap2 = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      popup.openOn(mockMap1 as any);
      
      expect(popup.isOpen).toBe(true);
      expect(popup.map).toBe(mockMap1);
      
      popup.openOn(mockMap2 as any);
      
      expect(popup.isOpen).toBe(true);
      expect(popup.map).toBe(mockMap2);
    });

    test('should not reopen if already open on same map', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      popup.openOn(mockMap as any);
      
      const elementBefore = popup.element;
      
      popup.openOn(mockMap as any);
      
      expect(popup.element).toBe(elementBefore);
    });
  });

  describe('close method', () => {
    test('should close popup', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      popup.openOn(mockMap as any);
      
      expect(popup.isOpen).toBe(true);
      
      const result = popup.close();
      
      expect(result).toBe(popup);
      expect(popup.isOpen).toBe(false);
      expect(popup.map).toBeNull();
      expect(mockMap.containerElement.contains(popup.element)).toBe(false);
    });

    test('should handle close when popup is not open', () => {
      const popup = new Popup();
      
      const result = popup.close();
      
      expect(result).toBe(popup);
      expect(popup.isOpen).toBe(false);
    });
  });

  describe('toggle method', () => {
    test('should open popup when closed', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      
      const result = popup.toggle(mockMap as any);
      
      expect(result).toBe(popup);
      expect(popup.isOpen).toBe(true);
    });

    test('should close popup when open', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      popup.openOn(mockMap as any);
      
      expect(popup.isOpen).toBe(true);
      
      const result = popup.toggle(mockMap as any);
      
      expect(result).toBe(popup);
      expect(popup.isOpen).toBe(false);
    });
  });

  describe('update method', () => {
    test('should update popup when open', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      popup.openOn(mockMap as any);
      
      const originalUpdateLayout = popup._updateLayout;
      const originalUpdateContent = popup._updateContent;
      const originalUpdatePosition = popup._updatePosition;
      
      popup._updateLayout = jest.fn();
      popup._updateContent = jest.fn();
      popup._updatePosition = jest.fn();
      
      const result = popup.update();
      
      expect(result).toBe(popup);
      expect(popup._updateLayout).toHaveBeenCalled();
      expect(popup._updateContent).toHaveBeenCalled();
      expect(popup._updatePosition).toHaveBeenCalled();
      
      // Restore original methods
      popup._updateLayout = originalUpdateLayout;
      popup._updateContent = originalUpdateContent;
      popup._updatePosition = originalUpdatePosition;
    });

    test('should not update when popup is closed', () => {
      const popup = new Popup();
      
      const originalUpdateLayout = popup._updateLayout;
      popup._updateLayout = jest.fn();
      
      const result = popup.update();
      
      expect(result).toBe(popup);
      expect(popup._updateLayout).not.toHaveBeenCalled();
      
      // Restore original method
      popup._updateLayout = originalUpdateLayout;
    });
  });

  describe('isOpenPopup method', () => {
    test('should return true when popup is open', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      
      popup.setLatLng([40.7128, -74.0060] as any);
      popup.setContent('Test content');
      popup.openOn(mockMap as any);
      
      expect(popup.isOpenPopup()).toBe(true);
    });

    test('should return false when popup is closed', () => {
      const popup = new Popup();
      
      expect(popup.isOpenPopup()).toBe(false);
    });
  });

  describe('bringToFront and bringToBack methods', () => {
    test('should bring popup to front', () => {
      const popup = new Popup();
      popup.element = document.createElement('div');
      const container = document.createElement('div');
      container.appendChild(popup.element);
      
      const result = popup.bringToFront();
      
      expect(result).toBe(popup);
      expect(container.lastChild).toBe(popup.element);
    });

    test('should bring popup to back', () => {
      const popup = new Popup();
      popup.element = document.createElement('div');
      const container = document.createElement('div');
      const otherElement = document.createElement('div');
      container.appendChild(otherElement);
      container.appendChild(popup.element);
      
      const result = popup.bringToBack();
      
      expect(result).toBe(popup);
      expect(container.firstChild).toBe(popup.element);
    });

    test('should handle when element is not in container', () => {
      const popup = new Popup();
      popup.element = document.createElement('div');
      
      expect(() => {
        popup.bringToFront();
      }).not.toThrow();
      
      expect(() => {
        popup.bringToBack();
      }).not.toThrow();
    });
  });

  describe('bindTo method', () => {
    test('should bind popup to layer click event', () => {
      const popup = new Popup();
      const mockLayer = {
        map: { containerElement: document.createElement('div') },
        on: jest.fn()
      };
      
      popup.bindTo(mockLayer as any, 'Bound content');
      
      expect(mockLayer.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    test('should set popup content and source when binding', () => {
      const popup = new Popup();
      const mockLayer = {
        map: {
          containerElement: document.createElement('div'),
          wasmMap: {
            screen_xy: jest.fn(() => [400, 300])
          },
          getCenter: jest.fn(() => [40.7128, -74.0060]),
          project: jest.fn(() => [400, 300]),
          unproject: jest.fn(() => [40.7128, -74.0060]),
          panTo: jest.fn(),
          on: jest.fn(),
          off: jest.fn()
        },
        on: jest.fn((event, callback) => {
          // Simulate click event
          callback({ latlng: [40.7128, -74.0060] });
        })
      };
      
      popup.bindTo(mockLayer as any, 'Bound content');
      
      expect(popup.content).toBe('Bound content');
      expect(popup._source).toBe(mockLayer);
    });
  });

  describe('Error handling', () => {
    test('should handle invalid map object', () => {
      const popup = new Popup();
      
      expect(() => {
        popup.openOn(null as any);
      }).not.toThrow();
      
      expect(() => {
        popup.openOn({} as any);
      }).not.toThrow();
    });

    test('should handle DOM manipulation errors', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: {
          appendChild: jest.fn(() => {
            throw new Error('DOM error');
          })
        }
      };
      
      expect(() => {
        popup.openOn(mockMap as any);
      }).not.toThrow();
    });
  });

  describe('Method chaining', () => {
    test('should support extensive method chaining', () => {
      const popup = new Popup();
      const mockMap = {
        containerElement: document.createElement('div'),
        wasmMap: {
          screen_xy: jest.fn(() => [400, 300])
        },
        getCenter: jest.fn(() => [40.7128, -74.0060]),
        project: jest.fn(() => [400, 300]),
        unproject: jest.fn(() => [40.7128, -74.0060]),
        panTo: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      };
      const mockLayer = {};
      
      const result = popup
        .setLatLng([40.7128, -74.0060] as any)
        .setContent('Test content')
        .setSource(mockLayer as any)
        .openOn(mockMap as any)
        .update()
        .close();
      
      expect(result).toBe(popup);
    });
  });
});