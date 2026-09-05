# Introduction

Rustyleaf is a map visualization library with a **Leaflet-style API** and a
**Rust + WebAssembly + WebGL2** rendering core. The goal is narrow but sharp:
keep the Leaflet developer experience you already know, and make it fast enough
for datasets that DOM-based maps can't handle.

## What makes it different

- **Leaflet-shaped API** — `new Map('map')`, `layer.addTo(map)`,
  `map.on('click', ...)`. The surface is TDD'd against the real runtime, so what
  you read here is what you get.
- **Rust/WASM core** — GeoJSON parsing, polygon tessellation (via
  [Lyon](https://github.com/nical/lyon)), and R-tree spatial indexing run in
  compiled Rust, off the JS main thread.
- **WebGL2 rendering** — tiles, points, lines, and polygons are drawn on the
  GPU. GeoJSON geometry is triangulated once and cached in GPU buffers, then
  reused across frames.
- **GPU-resident points** — point geometry is uploaded once as
  zoom-independent normalized-mercator coordinates and projected in the vertex
  shader, instead of re-projecting and re-uploading every point each frame. This
  is what holds **60fps at 1,000,000 points**.

## What it is not

Rustyleaf is a **Leaflet-compatible workflow layer**, not a promise that every
Leaflet plugin will work unchanged. In v0.0.8, tuple inputs remain valid while
`LatLng`, `LatLngBounds`, `Point`, `Bounds`, and factory functions expose the
methods Leaflet applications commonly use. The WebGL2 renderer and plugin
ecosystem still have explicit gaps; see [FAQ & Limitations](/faq).

## Browser support

| Browser | Status |
| --- | --- |
| Chrome / Edge 90+ | ✅ tested (CI runs Chromium) |
| Firefox 90+ | ✅ expected (WebGL2 since 51) |
| Safari 15.4+ | ⚠️ untested — WebGL2 is available; reports welcome |
| Anything without WebGL2 | ❌ not supported |

## The 60-second mental model

```js
import { Map, TileLayer, PointLayer } from 'rustyleaf'

// 1. Create a map in a container (by id or element)
const map = new Map('map', { center: [48.8566, 2.3522], zoom: 12 })

// 2. Add a base layer
new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

// 3. Add data layers the same way
const points = new PointLayer()
points.add([{ lat: 48.85, lng: 2.35, size: 4, color: '#e0393e' }])
points.addTo(map)

// 4. React to events
map.on('click', (e) => console.log('clicked', e.latlng))
```

That's the whole shape of the API. The rest of this guide fills in the layers,
controls, events, and navigation that build on it.
