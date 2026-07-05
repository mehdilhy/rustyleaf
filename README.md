<p align="center">
  <img src="assets/logo.png" alt="Rustyleaf Logo" width="150">
</p>

<h1 align="center">Rustyleaf</h1>

<p align="center">
  <strong>A Leaflet-style map API with a Rust + WebAssembly + WebGL2 rendering core.</strong><br>
  Built for one thing: keeping the familiar Leaflet developer experience while rendering datasets that make DOM-based maps fall over.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rustyleaf"><img src="https://img.shields.io/npm/v/rustyleaf" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange" alt="pre-alpha">
</p>

> ⚠️ **Pre-alpha (v0.0.1).** The API will change without notice and this is not production-ready. It is, however, honestly documented: everything listed below works today and is covered by unit and end-to-end tests.

---

## Why Rustyleaf?

Leaflet's API is beloved, but its DOM/Canvas renderer struggles past a few thousand features. WebGL map engines (MapLibre GL, deck.gl) scale, but with a different mental model. Rustyleaf is an experiment in having both:

- **Leaflet-shaped API** — `new Map('map')`, `layer.addTo(map)`, `map.on('click', ...)`.
- **Rust/WASM core** — GeoJSON parsing, polygon tessellation (Lyon), and R-tree spatial indexing run in compiled Rust, not the JS main thread.
- **WebGL2 rendering** — tiles, points, lines, and polygons drawn on the GPU; GeoJSON geometry is triangulated once, cached in GPU buffers, and reused across frames.

**Performance:** point rendering is GPU-resident (upload once, project in the
vertex shader), so it holds **60fps at 1,000,000 points** in the
[reproducible benchmark](benchmark/). Against Leaflet's canvas renderer that's
~3× faster at 100k and ~37× at 1M; against MapLibre GL it ties on render FPS
while setting up ~3× faster and still rendering at 1M points (where MapLibre ran
out of memory in the test environment). Numbers are hardware-specific — run the
benchmark yourself. This measures point-rendering throughput only, not features
or ecosystem, where Leaflet and MapLibre are far more mature.

## What works today

- XYZ raster tiles (OpenStreetMap-compatible URL templates, subdomain rotation, tile cache with eviction)
- Point, line, and polygon layers with per-feature color/size/metadata
- GeoJSON layer: load from object, string, URL, `File`, or streamed chunks; styling options; GPU-cached geometry
- Pan, scroll-zoom, momentum ("kinetic") dragging
- Click / hover hit-testing via an R-tree spatial index (rebuilt only when data changes)
- Leaflet-style events: `move`, `zoom`, `click`, `hover`, `mousedown`, `mouseup`, `contextmenu`, `dragend`, `keydown`, `keyup`
- HTML popups with auto-pan
- TypeScript definitions matching the actual runtime API
- RAII-managed WebGL resources (textures, buffers, VAOs, programs are freed deterministically; verified by GL leak-detection e2e tests)

## Known limitations (v0.0.1)

- **WebGL2 required.** No Canvas2D or WebGL1 rendering fallback (detection exists; rendering does not).
- Line width is stored but not applied (WebGL2 `lineWidth` is effectively 1.0; triangle-based thick lines are on the [roadmap](ROADMAP.md)).
- No touch/mobile gesture support yet.
- No plugin system, no marker icons, no vector tiles.
- The streaming GeoJSON parser is regex-assisted and can misbehave on exotic input.
- API is unstable until 0.1.0.

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge 90+ | ✅ tested (CI runs Chromium) |
| Firefox 90+ | ✅ expected (WebGL2 since 51) |
| Safari 15.4+ | ⚠️ untested — WebGL2 is available; reports welcome |
| Anything without WebGL2 | ❌ not supported |

## Bundle size

| Artifact | Raw | Gzipped |
|---|---|---|
| WASM core | 1.5 MB | ~500 KB |
| JS wrapper | 55 KB | 18 KB |

Reducing WASM size (currently built with `opt-level = "z"` + LTO, `wasm-opt` pending) is an active work item.

## Install

```bash
npm install rustyleaf
```

The package ships an ES module bundle with the WASM inlined via async loading. It works out of the box with Vite, Webpack 5, and other bundlers that support async WebAssembly. No runtime dependencies.

## Quick start

```javascript
import { Map, TileLayer, PointLayer, GeoJSONLayer } from 'rustyleaf';

const map = new Map('map', {
  center: [48.8566, 2.3522], // [lat, lng]
  zoom: 12,
});

// Raster tiles — attribution is required by the OSM tile usage policy
new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// 100k points? Go ahead.
const points = new PointLayer();
points.add(
  Array.from({ length: 100_000 }, () => ({
    lat: 48.8 + Math.random() * 0.2,
    lng: 2.2 + Math.random() * 0.3,
    size: 4,
    color: '#e0393e',
  }))
);
points.addTo(map);

// GeoJSON from a URL, parsed and triangulated in Rust
const geojson = new GeoJSONLayer(null, { polygonColor: '#3388ff80' });
geojson.addTo(map);
await geojson.loadFromUrl('/data/regions.geojson');

map.on('click', (e) => console.log('clicked', e.latlng));
```

If you use raster tiles from OpenStreetMap, follow their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) — heavy production use requires your own tile provider.

## API overview

The full, accurate surface lives in [`types/rustyleaf.d.ts`](types/rustyleaf.d.ts) — it is deliberately trimmed to what actually exists.

| Class | Purpose | Key methods |
|---|---|---|
| `Map` | Container, viewport, events | `setView`, `panBy`, `zoomIn/Out`, `fitBounds`, `project/unproject`, `on/off`, `destroy` |
| `TileLayer` | XYZ raster tiles | `addTo`, `remove` |
| `PointLayer` | GPU point rendering | `add(points)`, `clear`, `on('click'\|'hover')` |
| `LineLayer` | Polylines | `add(lines)`, `clear`, `on(...)` |
| `PolygonLayer` | Filled polygons | `add(polygons)`, `clear`, `on(...)` |
| `GeoJSONLayer` | GeoJSON with streaming | `loadData`, `loadFromUrl`, `loadFile`, `setStyle`, `getBounds` |
| `Popup` | HTML popups | `setLatLng`, `setContent`, `openOn`, `close` |

## Development

Prerequisites: Rust (stable) with the `wasm32-unknown-unknown` target, `wasm-pack`, Node.js 18+.

```bash
git clone https://github.com/mehdilhy/rustyleaf.git
cd rustyleaf
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm install

npm run build        # wasm-pack + webpack production build
npm test             # Jest unit tests (251 tests)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
cargo clippy --manifest-path core/Cargo.toml --target wasm32-unknown-unknown -- -D warnings

npm run setup:e2e    # one-time: install Playwright Chromium
npm run test:e2e     # visual regression, GL leak detection, memory soak, FPS
```

The e2e suite is the interesting part: screenshot-based visual regression, WebGL resource-leak detection, multi-instance isolation, idle-CPU checks, and a memory soak test all run in CI.

## Contributing

Contributions are very welcome — this project is young enough that a single PR can meaningfully shape it. See [CONTRIBUTING.md](CONTRIBUTING.md), the [ROADMAP](ROADMAP.md), and issues labeled `good first issue`.

## License

[MIT](LICENSE)

## Acknowledgments

Standing on the shoulders of [Leaflet](https://leafletjs.com/), [MapLibre GL JS](https://maplibre.org/), [Lyon](https://github.com/nical/lyon), [rstar](https://github.com/stoeoef/rstar), and the Rust/WASM ecosystem.
