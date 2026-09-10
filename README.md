<p align="center">
  <img src="assets/logo.png" alt="Rustyleaf Logo" width="150">
</p>

<h1 align="center">Rustyleaf</h1>

<p align="center">
  <strong>A Leaflet-style map API with a Rust + WebAssembly + WebGL2 rendering core.</strong><br>
  The familiar Leaflet developer experience, rendering datasets that make DOM-based maps fall over.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rustyleaf"><img src="https://img.shields.io/npm/v/rustyleaf" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/webgl2-required-important" alt="WebGL2 required">
  <img src="https://img.shields.io/badge/tests-826%20passing-brightgreen" alt="tests passing">
</p>

> **Compatibility preview (v0.0.11).** Intentionally API-compatible with common
> Leaflet workflows while the renderer and plugin surface mature. Needs WebGL2
> (Chrome/Edge 90+, Firefox 90+, Safari 15.4+).

## Why Rustyleaf?

Leaflet's API is beloved, but its DOM/Canvas renderer struggles past a few thousand features. WebGL engines scale, but with a different mental model. Rustyleaf does both:

- **Leaflet-shaped API** — `new Map('map')`, `layer.addTo(map)`, `map.on('click', ...)`, plus `LatLng`, `LatLngBounds`, `Point`, `Bounds` value objects and factories.
- **Rust/WASM core** — GeoJSON parsing, polygon triangulation (earcut), and spatial indexing run in compiled Rust, not the JS main thread.
- **WebGL2 rendering** — tiles, points, lines, and polygons on the GPU. Points upload once and project in the vertex shader (**60fps at 1,000,000 points** in the [reproducible benchmark](benchmark/)); geometry is triangulated once, cached in GPU buffers, and reused across frames.

## What works today

- XYZ raster tiles (OSM-compatible templates, subdomains, cache with eviction), **WMS layers**, and programmable **`GridLayer`** DOM tiles
- Point, line, and polygon layers with per-feature color/size/metadata; GPU-expanded line widths; GPU-sprite **markers** (`Icon`/`DivIcon`), popups, tooltips, dragging
- GeoJSON: object, string, URL, `File`, or streamed chunks; styling; `filter` / `pointToLayer` / `onEachFeature`
- Pan, scroll-zoom, momentum dragging, box zoom, keyboard, touch gestures
- Click/hover hit-testing (polygons use point-in-polygon with holes), Leaflet-style events, HTML popups with auto-pan
- Shapes (`Circle`, `CircleMarker`, `Rectangle`), groups (`LayerGroup`, `FeatureGroup`), ground overlays, controls (zoom/attribution/scale/layers), `flyTo`, `setMaxBounds`, `locate()`
- TypeScript definitions matching the runtime API; RAII-managed GL resources

## Known limitations (v0.0.11)

- **WebGL2 required**, no Canvas2D/WebGL1 fallback. Spherical Mercator only.
- No vector tiles. GeoJSON lines draw 1px (width ignored).
- API unstable until 0.1.0.

## Install

```bash
npm install rustyleaf
```

ES module bundle + async-loaded WASM. Works with Vite, Webpack 5, and other bundlers supporting async WebAssembly. No runtime dependencies.

## Quick start

```javascript
import { Map, TileLayer, PointLayer } from 'rustyleaf';

const map = new Map('map', { center: [48.8566, 2.3522], zoom: 12 });

// Raster tiles — attribution required by the OSM tile usage policy
new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const points = new PointLayer();
points.add(Array.from({ length: 100_000 }, () => ({
  lat: 48.8 + Math.random() * 0.2,
  lng: 2.2 + Math.random() * 0.3,
  size: 4,
  color: '#e0393e',
})));
points.addTo(map);

map.on('click', (e) => console.log('clicked', e.latlng));
```

## API overview

Full surface in [`types/rustyleaf.d.ts`](types/rustyleaf.d.ts).

| Class | Purpose | Key methods |
|---|---|---|
| `Map` | Container, viewport, events | `setView`, `panBy`, `zoomIn/Out`, `fitBounds`, `project/unproject`, `on/off`, `destroy` |
| `TileLayer` | XYZ raster tiles | `addTo`, `remove` |
| `PointLayer` / `LineLayer` / `PolygonLayer` | GPU layers | `add`, `clear`, `on(...)` |
| `GeoJSONLayer` | GeoJSON with streaming | `loadData`, `loadFromUrl`, `loadFile`, `setStyle`, `getBounds` |
| `Marker` / shapes / groups / controls | Overlays & UI | see type definitions |

## Development

Prerequisites: Rust (stable) + `wasm32-unknown-unknown` target, `wasm-pack`, Node.js 18+.

```bash
npm install
npm run build        # wasm-pack + webpack production build
npm test             # Jest unit + parity tests (826 tests)
npm run test:e2e     # visual regression, GL leak detection, soak, FPS, kitchen sink
```

## License

[MIT](LICENSE)

## Acknowledgments

Standing on the shoulders of [Leaflet](https://leafletjs.com/), [MapLibre GL JS](https://maplibre.org/), [earcut](https://github.com/mapbox/earcut), and the Rust/WASM ecosystem.
