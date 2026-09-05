/**
 * Small, dependency-free value objects used by the Leaflet-compatible API.
 *
 * Rustyleaf keeps accepting the existing tuple forms (`[lat, lng]` and
 * `[[south, west], [north, east]]`). These array subclasses add Leaflet's
 * familiar methods without breaking code that indexes or compares tuples.
 */

const EARTH_RADIUS = 6371000;
const MAX_MERCATOR_LATITUDE = 85.0511287798;

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return number;
}

function defineCoordinateProperties(target, properties) {
  for (const [name, value] of Object.entries(properties)) {
    const internalName = `_${name}`;
    const coordinateIndex = name === 'x' || name === 'lat' ? 0 : name === 'y' || name === 'lng' ? 1 : name === 'alt' ? 2 : -1;
    Object.defineProperty(target, internalName, {
      configurable: true,
      enumerable: false,
      writable: true,
      value
    });
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: false,
      get: () => target[`_${name}`],
      set: (next) => {
        const numeric = finiteNumber(next, name);
        target[internalName] = numeric;
        if (coordinateIndex >= 0) target[coordinateIndex] = numeric;
      }
    });
  }
}

function asLatLng(value, lng, alt) {
  if (value instanceof LatLng) return value;
  if (Array.isArray(value)) return new LatLng(value[0], value[1], value[2]);
  if (value && typeof value === 'object' && value.lat !== undefined && value.lng !== undefined) {
    return new LatLng(value.lat, value.lng, value.alt);
  }
  if (lng !== undefined) return new LatLng(value, lng, alt);
  throw new TypeError('Expected a [lat, lng] tuple or {lat, lng} object');
}

function asPoint(value, y) {
  if (value instanceof Point) return value;
  if (Array.isArray(value)) return new Point(value[0], value[1]);
  if (value && typeof value === 'object' && value.x !== undefined && value.y !== undefined) {
    return new Point(value.x, value.y);
  }
  return new Point(value, y);
}

// Leaflet's public SphericalMercator projection uses meters. Plugin code
// calling CRS.EPSG3857.project should receive the familiar meter coordinates.
function sphericalMercatorProject(latlng) {
  const value = asLatLng(latlng);
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, value.lat));
  const radians = Math.PI / 180;
  const sin = Math.sin(latitude * radians);
  return new Point(EARTH_RADIUS * value.lng * radians,
    EARTH_RADIUS * Math.log((1 + sin) / (1 - sin)) / 2);
}

function sphericalMercatorUnproject(pointValue) {
  const value = asPoint(pointValue);
  const radians = 180 / Math.PI;
  return new LatLng((2 * Math.atan(Math.exp(value.y / EARTH_RADIUS)) - Math.PI / 2) * radians,
    value.x * radians / EARTH_RADIUS);
}

export class Point extends Array {
  constructor(x = 0, y = 0, round = false) {
    super();
    const nextX = finiteNumber(x, 'x');
    const nextY = finiteNumber(y, 'y');
    this.push(round ? Math.round(nextX) : nextX, round ? Math.round(nextY) : nextY);
    defineCoordinateProperties(this, { x: this[0], y: this[1] });
  }

  clone() { return new Point(this.x, this.y); }
  add(other) { const p = asPoint(other); return new Point(this.x + p.x, this.y + p.y); }
  subtract(other) { const p = asPoint(other); return new Point(this.x - p.x, this.y - p.y); }
  divideBy(value, round = false) { return new Point(this.x / value, this.y / value, round); }
  multiplyBy(value) { return new Point(this.x * value, this.y * value); }
  scaleBy(scale) { const p = asPoint(scale); return new Point(this.x * p.x, this.y * p.y); }
  unscaleBy(scale) { const p = asPoint(scale); return new Point(this.x / p.x, this.y / p.y); }
  round() { return new Point(Math.round(this.x), Math.round(this.y)); }
  floor() { return new Point(Math.floor(this.x), Math.floor(this.y)); }
  ceil() { return new Point(Math.ceil(this.x), Math.ceil(this.y)); }
  trunc() { return new Point(Math.trunc(this.x), Math.trunc(this.y)); }
  distanceTo(other) { const p = asPoint(other); return Math.hypot(this.x - p.x, this.y - p.y); }
  equals(other) { const p = asPoint(other); return this.x === p.x && this.y === p.y; }
  contains(other) {
    const p = asPoint(other);
    return Math.abs(p.x) <= Math.abs(this.x) && Math.abs(p.y) <= Math.abs(this.y);
  }
  toString() { return `Point(${this.x}, ${this.y})`; }
  toArray() { return [this.x, this.y]; }
}

export class Bounds extends Array {
  constructor(a, b) {
    super();
    Object.defineProperties(this, {
      _min: { configurable: true, enumerable: false, writable: true, value: null },
      _max: { configurable: true, enumerable: false, writable: true, value: null },
      min: { configurable: true, enumerable: false, get: () => this._min },
      max: { configurable: true, enumerable: false, get: () => this._max }
    });
    if (a !== undefined) this.extend(a);
    if (b !== undefined) this.extend(b);
    this._sync();
  }

  _sync() {
    this.length = 0;
    if (this._min && this._max) this.push(this._min.toArray(), this._max.toArray());
  }

  extend(value) {
    if (value === undefined || value === null) return this;
    if (value instanceof Bounds || (value && value.min && value.max)) {
      this.extend(value.min || value[0]);
      this.extend(value.max || value[1]);
      return this;
    }
    if (Array.isArray(value) && value.length === 2 && (Array.isArray(value[0]) || (value[0] && value[0].x !== undefined))) {
      this.extend(value[0]);
      this.extend(value[1]);
      return this;
    }
    const point = asPoint(value);
    if (!this._min) {
      this._min = point.clone();
      this._max = point.clone();
    } else {
      this._min = new Point(Math.min(this._min.x, point.x), Math.min(this._min.y, point.y));
      this._max = new Point(Math.max(this._max.x, point.x), Math.max(this._max.y, point.y));
    }
    this._sync();
    return this;
  }

  isValid() { return !!this._min && !!this._max; }
  getCenter(round = false) { return this.isValid() ? new Point((this._min.x + this._max.x) / 2, (this._min.y + this._max.y) / 2, round) : null; }
  getBottomLeft() { return this.isValid() ? new Point(this._min.x, this._max.y) : null; }
  getTopRight() { return this.isValid() ? new Point(this._max.x, this._min.y) : null; }
  getTopLeft() { return this.isValid() ? this._min.clone() : null; }
  getBottomRight() { return this.isValid() ? this._max.clone() : null; }
  getSize() { return this.isValid() ? this._max.subtract(this._min) : new Point(0, 0); }
  contains(value) {
    if (!this.isValid()) return false;
    if (value instanceof Bounds || (value && value.min && value.max)) {
      return this.contains(value.min || value[0]) && this.contains(value.max || value[1]);
    }
    if (Array.isArray(value) && value.length === 2 &&
      (Array.isArray(value[0]) || (value[0] && value[0].x !== undefined))) {
      return this.contains(value[0]) && this.contains(value[1]);
    }
    const point = asPoint(value);
    return point.x >= this._min.x && point.x <= this._max.x && point.y >= this._min.y && point.y <= this._max.y;
  }
  intersects(value) {
    if (!this.isValid()) return false;
    const other = value instanceof Bounds ? value : new Bounds(value);
    if (!other.isValid()) return false;
    return other._max.x >= this._min.x && other._min.x <= this._max.x
      && other._max.y >= this._min.y && other._min.y <= this._max.y;
  }
  overlaps(value) { return this.intersects(value); }
  pad(bufferRatio) {
    if (!this.isValid()) return new Bounds();
    const size = this.getSize();
    return new Bounds(
      new Point(this._min.x - size.x * bufferRatio, this._min.y - size.y * bufferRatio),
      new Point(this._max.x + size.x * bufferRatio, this._max.y + size.y * bufferRatio)
    );
  }
  equals(value) { const other = value instanceof Bounds ? value : new Bounds(value); return this.isValid() && other.isValid() && this._min.equals(other._min) && this._max.equals(other._max); }
  toArray() { return this.isValid() ? [this._min.toArray(), this._max.toArray()] : []; }
  toString() { return this.isValid() ? `Bounds(${this._min.toString()}, ${this._max.toString()})` : 'Bounds(INVALID)'; }
}

export class LatLng extends Array {
  constructor(lat, lng, alt) {
    super();
    const latitude = finiteNumber(lat, 'lat');
    const longitude = finiteNumber(lng, 'lng');
    this.push(latitude, longitude);
    if (alt !== undefined) this.push(finiteNumber(alt, 'alt'));
    defineCoordinateProperties(this, {
      lat: latitude,
      lng: longitude,
      alt: alt === undefined ? undefined : Number(alt)
    });
  }

  equals(other, maxMargin = 1e-9) {
    const point = asLatLng(other);
    return Math.max(Math.abs(this.lat - point.lat), Math.abs(this.lng - point.lng)) <= maxMargin
      && (this.alt === undefined || point.alt === undefined || Math.abs(this.alt - point.alt) <= maxMargin);
  }
  toArray() { return this.alt === undefined ? [this.lat, this.lng] : [this.lat, this.lng, this.alt]; }
  toBounds(size = 0) { return new LatLngBounds([this.lat - size, this.lng - size], [this.lat + size, this.lng + size]); }
  distanceTo(other) {
    const point = asLatLng(other);
    const rad = Math.PI / 180;
    const dLat = (point.lat - this.lat) * rad;
    const dLng = (point.lng - this.lng) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(this.lat * rad) * Math.cos(point.lat * rad) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  wrap() { return new LatLng(this.lat, wrapNum(this.lng, [-180, 180]), this.alt); }
  toString() { return `LatLng(${this.lat}, ${this.lng})`; }
}

export class LatLngBounds extends Array {
  constructor(southWest, northEast) {
    super();
    Object.defineProperties(this, {
      _southWest: { configurable: true, enumerable: false, writable: true, value: null },
      _northEast: { configurable: true, enumerable: false, writable: true, value: null },
      southWest: { configurable: true, enumerable: false, get: () => this._southWest },
      northEast: { configurable: true, enumerable: false, get: () => this._northEast }
    });
    if (southWest !== undefined) {
      if (northEast !== undefined) {
        this._southWest = asLatLng(southWest);
        this._northEast = asLatLng(northEast);
      } else if (Array.isArray(southWest) && southWest.length === 2 &&
        (Array.isArray(southWest[0]) || (southWest[0] && southWest[0].lat !== undefined))) {
        this._southWest = asLatLng(southWest[0]);
        this._northEast = asLatLng(southWest[1]);
      } else if (southWest instanceof LatLngBounds || (southWest && southWest._southWest)) {
        if (southWest._southWest && southWest._northEast) {
          this._southWest = asLatLng(southWest._southWest);
          this._northEast = asLatLng(southWest._northEast);
        }
      } else if (Array.isArray(southWest) && southWest.length >= 2 && typeof southWest[0] === 'number') {
        this.extend(southWest);
      } else if (Array.isArray(southWest)) {
        for (const value of southWest) this.extend(value);
      } else {
        this.extend(southWest);
      }
    }
    this._sync();
  }

  _sync() {
    this.length = 0;
    if (this._southWest && this._northEast) this.push(this._southWest.toArray(), this._northEast.toArray());
  }

  extend(value) {
    if (value === undefined || value === null) return this;
    if (value instanceof LatLngBounds || (value && value._southWest && value._northEast)) {
      this.extend(value._southWest);
      this.extend(value._northEast);
      return this;
    }
    if (Array.isArray(value) && value.length === 2 && (Array.isArray(value[0]) || (value[0] && value[0].lat !== undefined))) {
      this.extend(value[0]);
      this.extend(value[1]);
      return this;
    }
    const point = asLatLng(value);
    if (!this._southWest) {
      this._southWest = new LatLng(point.lat, point.lng, point.alt);
      this._northEast = new LatLng(point.lat, point.lng, point.alt);
    } else {
      this._southWest = new LatLng(Math.min(this._southWest.lat, point.lat), Math.min(this._southWest.lng, point.lng));
      this._northEast = new LatLng(Math.max(this._northEast.lat, point.lat), Math.max(this._northEast.lng, point.lng));
    }
    this._sync();
    return this;
  }

  isValid() { return !!this._southWest && !!this._northEast; }
  getCenter() { return this.isValid() ? new LatLng((this._southWest.lat + this._northEast.lat) / 2, (this._southWest.lng + this._northEast.lng) / 2) : null; }
  getSouthWest() { return this._southWest ? new LatLng(this._southWest.lat, this._southWest.lng, this._southWest.alt) : null; }
  getNorthEast() { return this._northEast ? new LatLng(this._northEast.lat, this._northEast.lng, this._northEast.alt) : null; }
  getNorthWest() { return this.isValid() ? new LatLng(this._northEast.lat, this._southWest.lng) : null; }
  getSouthEast() { return this.isValid() ? new LatLng(this._southWest.lat, this._northEast.lng) : null; }
  getWest() { return this._southWest ? this._southWest.lng : undefined; }
  getSouth() { return this._southWest ? this._southWest.lat : undefined; }
  getEast() { return this._northEast ? this._northEast.lng : undefined; }
  getNorth() { return this._northEast ? this._northEast.lat : undefined; }
  contains(value) {
    if (!this.isValid()) return false;
    if (value instanceof LatLngBounds || (value && value._southWest)) return this.contains(value._southWest) && this.contains(value._northEast);
    if (Array.isArray(value) && value.length === 2 &&
      (Array.isArray(value[0]) || (value[0] && value[0].lat !== undefined))) {
      return this.contains(value[0]) && this.contains(value[1]);
    }
    const point = asLatLng(value);
    return point.lat >= this.getSouth() && point.lat <= this.getNorth() && point.lng >= this.getWest() && point.lng <= this.getEast();
  }
  intersects(value) {
    if (!this.isValid()) return false;
    const other = value instanceof LatLngBounds ? value : new LatLngBounds(value);
    if (!other.isValid()) return false;
    return Math.max(this.getSouth(), other.getSouth()) <= Math.min(this.getNorth(), other.getNorth())
      && Math.max(this.getWest(), other.getWest()) <= Math.min(this.getEast(), other.getEast());
  }
  overlaps(value) { return this.intersects(value); }
  pad(bufferRatio) {
    if (!this.isValid()) return new LatLngBounds();
    const height = (this.getNorth() - this.getSouth()) * bufferRatio;
    const width = (this.getEast() - this.getWest()) * bufferRatio;
    return new LatLngBounds([this.getSouth() - height, this.getWest() - width], [this.getNorth() + height, this.getEast() + width]);
  }
  equals(value, maxMargin = 1e-9) { const other = value instanceof LatLngBounds ? value : new LatLngBounds(value); return this.isValid() && other.isValid() && this._southWest.equals(other._southWest, maxMargin) && this._northEast.equals(other._northEast, maxMargin); }
  toArray() { return this.isValid() ? [this._southWest.toArray(), this._northEast.toArray()] : []; }
  toBBox() { return this.isValid() ? [this.getWest(), this.getSouth(), this.getEast(), this.getNorth()].join(',') : ''; }
  toString() { return this.isValid() ? `LatLngBounds(${this._southWest.toString()}, ${this._northEast.toString()})` : 'LatLngBounds(INVALID)'; }
}

export class Transformation {
  constructor(a, b, c, d) {
    this._a = finiteNumber(a, 'a');
    this._b = finiteNumber(b, 'b');
    this._c = finiteNumber(c, 'c');
    this._d = finiteNumber(d, 'd');
  }
  transform(point, scale = 1) { const p = asPoint(point); return new Point(scale * (this._a * p.x + this._b), scale * (this._c * p.y + this._d)); }
  untransform(point, scale = 1) { const p = asPoint(point); return new Point((p.x / scale - this._b) / this._a, (p.y / scale - this._d) / this._c); }
}

export function wrapNum(value, range, includeMax = false) {
  const [min, max] = range;
  const d = max - min;
  return value === max && includeMax ? value : ((value - min) % d + d) % d + min;
}

export function latLng(lat, lng, alt) { return asLatLng(lat, lng, alt); }
export function latLngBounds(southWest, northEast) { return new LatLngBounds(southWest, northEast); }
export function point(x, y, round) {
  const value = asPoint(x, y);
  return round ? value.round() : value;
}
export function bounds(a, b) { return new Bounds(a, b); }

const earthCrs = {
  code: 'EPSG:3857',
  wrapLng: [-180, 180],
  wrapLat: [-MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE],
  R: EARTH_RADIUS,
  distance: (a, b) => asLatLng(a).distanceTo(b),
  scale: (zoom) => 256 * Math.pow(2, zoom),
  zoom: (scale) => Math.log(scale / 256) / Math.LN2,
  project: sphericalMercatorProject,
  unproject: sphericalMercatorUnproject,
  transformation: new Transformation(0.5 / Math.PI, 0.5, -0.5 / Math.PI, 0.5)
};

export const CRS = {
  Earth: earthCrs,
  EPSG3857: earthCrs,
  EPSG4326: {
    code: 'EPSG:4326',
    wrapLng: [-180, 180],
    distance: (a, b) => asLatLng(a).distanceTo(b),
    scale: (zoom) => 256 * Math.pow(2, zoom),
    zoom: (scale) => Math.log(scale / 256) / Math.LN2,
    project: (value) => { const p = asLatLng(value); return new Point(p.lng, p.lat); },
    unproject: (value) => { const p = asPoint(value); return new LatLng(p.y, p.x); }
  },
  Simple: {
    code: 'SR:ORG:68:4',
    scale: (zoom) => Math.pow(2, zoom),
    zoom: (scale) => Math.log(scale) / Math.LN2,
    project: (value) => { const p = asLatLng(value); return new Point(p.lng, p.lat); },
    unproject: (value) => { const p = asPoint(value); return new LatLng(p.y, p.x); }
  }
};

export const Projection = {
  LonLat: { project: CRS.EPSG4326.project, unproject: CRS.EPSG4326.unproject },
  SphericalMercator: { project: sphericalMercatorProject, unproject: sphericalMercatorUnproject },
  Mercator: { project: sphericalMercatorProject, unproject: sphericalMercatorUnproject }
};

export const Browser = {
  chrome: typeof navigator !== 'undefined' && /chrome|chromium/i.test(navigator.userAgent || ''),
  firefox: typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent || ''),
  safari: typeof navigator !== 'undefined' && /safari/i.test(navigator.userAgent || '') && !/chrome|chromium/i.test(navigator.userAgent || ''),
  touch: typeof window !== 'undefined' && ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)),
  retina: typeof window !== 'undefined' && window.devicePixelRatio > 1,
  webgl: typeof document !== 'undefined',
};

export const DomUtil = {
  create(tagName, className, container) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (container) container.appendChild(element);
    return element;
  },
  remove(element) { if (element && element.parentNode) element.parentNode.removeChild(element); },
  empty(element) { if (element) element.replaceChildren(); },
  hasClass(element, name) { return !!element && (` ${element.className || ''} `).indexOf(` ${name} `) !== -1; },
  addClass(element, name) { if (element) element.classList.add(...String(name).split(/\s+/).filter(Boolean)); },
  removeClass(element, name) { if (element) element.classList.remove(...String(name).split(/\s+/).filter(Boolean)); },
  setOpacity(element, opacity) { if (element) element.style.opacity = opacity; },
  setPosition(element, position) { if (element) { element.style.left = `${position.x}px`; element.style.top = `${position.y}px`; } },
  getPosition(element) { return element ? new Point(parseFloat(element.style.left) || 0, parseFloat(element.style.top) || 0) : new Point(); },
  toFront(element) { if (element && element.parentNode) element.parentNode.appendChild(element); },
  toBack(element) { if (element && element.parentNode) element.parentNode.insertBefore(element, element.parentNode.firstChild); },
  getStyle(element, name) { return element ? getComputedStyle(element)[name] : ''; }
};

const boundDomHandlers = new WeakMap();

function getBoundDomHandler(element, type, fn, context, create) {
  if (!context) return fn;
  let byType = boundDomHandlers.get(element);
  if (!byType && create) {
    byType = new Map();
    boundDomHandlers.set(element, byType);
  }
  if (!byType) return fn.bind(context);
  let byFunction = byType.get(type);
  if (!byFunction && create) {
    byFunction = new Map();
    byType.set(type, byFunction);
  }
  if (!byFunction) return fn.bind(context);
  if (!byFunction.has(fn)) byFunction.set(fn, fn.bind(context));
  return byFunction.get(fn);
}

export const DomEvent = {
  on(element, types, fn, context) {
    if (!element || typeof element.addEventListener !== 'function') return this;
    for (const type of String(types).trim().split(/\s+/)) element.addEventListener(type, getBoundDomHandler(element, type, fn, context, true));
    return this;
  },
  off(element, types, fn, context) {
    if (!element || typeof element.removeEventListener !== 'function') return this;
    for (const type of String(types).trim().split(/\s+/)) element.removeEventListener(type, getBoundDomHandler(element, type, fn, context, false));
    return this;
  },
  stopPropagation(event) { if (event) event.stopPropagation(); return this; },
  preventDefault(event) { if (event) event.preventDefault(); return this; },
  stop(event) { this.preventDefault(event); this.stopPropagation(event); return this; },
  disableClickPropagation(element) { for (const type of ['mousedown', 'touchstart', 'click', 'dblclick', 'contextmenu']) element.addEventListener(type, this.stopPropagation); return this; },
  disableScrollPropagation(element) { for (const type of ['wheel', 'mousewheel', 'touchmove']) element.addEventListener(type, this.stopPropagation); return this; },
  getMousePosition(event, container) { const rect = container.getBoundingClientRect(); return new Point(event.clientX - rect.left, event.clientY - rect.top); },
  getWheelDelta(event) { return (event.deltaY || -event.wheelDelta || 0) / 60; }
};
