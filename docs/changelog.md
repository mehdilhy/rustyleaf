# Changelog

All notable changes are documented in
[`CHANGELOG.md`](https://github.com/mehdilhy/rustyleaf/blob/main/CHANGELOG.md).
Highlights from the published pre-alpha release are below.

## 0.0.8 — compatibility preview

- Added Leaflet-compatible `Point`, `Bounds`, `LatLng`, and `LatLngBounds` value
  objects that remain array-compatible with existing Rustyleaf tuples.
- Added the common `L.*` factory functions, `CRS`/`Projection`, `DomUtil`,
  `DomEvent`, and expanded `Util` plugin helpers.
- Added map pixel/coordinate helpers, panes, tile URL/lifecycle methods,
  vector-layer editing/style APIs, GeoJSON aliases and inspection methods.
- Added a VitePress navigation shell and a [20-use-case compatibility
  checklist](/use-cases).
- Added 20 parity scenarios; the Jest suite now covers 823 tests.

## 0.0.1 — 2026-07-05 (pre-alpha)

First published release. Functional but under active development — expect API
churn.

### What works

- WebGL2 rendering pipeline with tile basemaps
- Point / line / polygon layers and a GeoJSON layer with GPU-cached geometry
- GeoJSON parsing + polygon triangulation (Lyon); R-tree hit-testing
- Momentum panning and scroll-zoom
- Attribution control (rendered when a `TileLayer` passes `attribution`)
- Full Leaflet-style API surface, all TDD'd against the real runtime:
  - `Marker` / `Icon` / `DivIcon` as GPU sprites, with popups, tooltips, drag,
    opacity/z-index
  - `Tooltip`, `ZoomControl`, `AttributionControl`, `ScaleControl`,
    `LayersControl`
  - `Circle` / `CircleMarker` / `Rectangle`
  - `LayerGroup` / `FeatureGroup`
  - `flyTo` / `flyToBounds`, `setMaxBounds`, `invalidateSize`, `locate`
  - GeoJSON `filter` / `pointToLayer` / `onEachFeature`
  - Extended events, input (keyboard, box zoom, touch), ground overlays,
    `WMSTileLayer`, `GridLayer`, thick lines, `Handler` + `Util`
- 405 Jest unit tests; Playwright e2e suite (visual regression, GL leak
  detection, instance isolation, idle CPU, memory soak, FPS, kitchen-sink)
- Live demos under `demo/`

### Key fixes in this release

- **Point/line/polygon layers never rendered without a GeoJSON layer** — the
  standalone render passes never set the `u_matrix` projection uniform.
- **Double WASM instantiation in the bundle** — two instances with disjoint
  memories; now exactly one, with a stable-named `.wasm` asset.
- **Tile texture leak** — RAII `OwnedTexture` wrappers.
- **`window.rustyleafGeoJSONData` global + polling removed** — `loadFromUrl` is
  now a plain `fetch` with progress + `AbortSignal`.
- **Stack overflow on large layers** — `add()` no longer spreads the input
  array into `push()` (1M points overflowed the stack).
- **All layers of a kind collapsed into wasm index 0** — layer constructors now
  return the new layer's index.
- **`layer.remove()` was a stub** — now hides the layer in the wasm core (makes
  `LayersControl` toggling work).
- **Standalone polygons never rendered without a GeoJSON layer** — `u_origin` /
  `u_world_scale` not set, and ear-clipping assumed CCW winding; both fixed
  (shoelace normalization, drop closing vertices).
- **Multiple maps rendered into the first canvas** — unique per-instance canvas
  ids.
- **Feature clicks never reached JS** — hit-test path now fires callbacks;
  `click` carries a `feature` payload.
- **1M points dropped to ~14fps when zoomed out** — fragment-work budget fix
  (deterministic sample when footprint collapses).
- **GeoJSON `onEachFeature` click/hover couldn't fire in the real engine** —
  cached features weren't in the R-tree, and the dispatcher read the wrong meta
  field; hardened with `layer_index` gating.
- **`Popup` autopan crashed** — called an unimplemented `panTo`; now `flyTo`,
  and measurement runs after the element is appended.

### Performance

- **GPU-resident point layers** — upload once, project in the vertex shader.
  **1,000,000 points now render at a locked 60fps (was ~11fps).**

### Known limitations (0.0.1)

WebGL2 required; Spherical Mercator only; `LineLayer` honors width (GeoJSON
lines still 1px); touch covers pan + pinch only; regex streaming GeoJSON parser
is fragile; standalone line/polygon layers still rebuild per frame; normalized
coordinate precision degrades at very high zoom (z≈18+).
