# Changelog

All notable changes to this project will be documented in this file.

## 0.0.1 - 2026-07-05

First published release (pre-alpha). The engine is functional but under active
development — expect API churn and missing features.

### What works
- WebGL2 rendering pipeline with tile basemaps
- Point / line / polygon layers and a GeoJSON layer with GPU-cached geometry
- GeoJSON parsing and polygon triangulation (Lyon for GeoJSON polygons)
- Hit-testing via R-tree spatial index, rebuilt only when data changes
- Momentum-based panning and scroll-zoom
- Attribution control (rendered when a `TileLayer` passes `attribution`)
- 251 Jest unit tests; Playwright e2e suite (visual regression, GL leak
  detection, instance isolation, idle CPU, memory soak, FPS benchmark)

### Fixed in this release
- **Point/line/polygon layers never rendered without a GeoJSON layer** — the
  standalone render passes never set the `u_matrix` projection uniform; it was
  only ever set (on the shared programs) by the GeoJSON pass. All passes now
  set it explicitly.
- **Double WASM instantiation in the bundle** — webpack's async-wasm module and
  the manual loader raced, producing two instances with disjoint memories
  (layer data silently vanished). The bundle now instantiates exactly one
  instance; the `.wasm` is emitted as a stable-named asset next to the bundle.
- **Tile texture leak** — tile textures are now RAII-wrapped (`OwnedTexture`);
  tile-load closures are keyed and released once their tile completes.
- **`window.rustyleafGeoJSONData` global + polling removed** —
  `GeoJSONLayer.loadFromUrl()` is now a plain `fetch` with progress callbacks
  and `AbortSignal` support; the WASM XHR path is gone.
- **Point color/meta ignored by `Map.add_points`** — per-point `color` is now
  parsed and object `meta` is preserved (previously always default blue, meta
  dropped unless it was a JSON string).
- **Stack overflow on large layers** — `layer.add()` no longer spreads the
  input array into `push()` (1M points overflowed the call stack).
- **~2× faster large-layer uploads** — vertex buffers are bulk-copied into the
  `Float32Array` instead of filled element-by-element.
- **`PointLayer.clear()` crash** — referenced an undefined global.

### Performance
- **GPU-resident point layers.** Point geometry is uploaded to the GPU once as
  zoom-independent normalized-mercator coordinates and projected in the vertex
  shader (`u_origin` / `u_world_scale`), instead of re-projecting and
  re-uploading every point on the CPU each frame. **1,000,000 points now render
  at a locked 60fps (was ~11fps).** See [`benchmark/`](benchmark/) for the
  reproducible Rustyleaf-vs-Leaflet-vs-MapLibre harness and results.

### Architecture / hygiene
- `RustyleafError` typed error enum used throughout the crate
- RAII WebGL handle wrappers (textures, buffers, VAOs, programs)
- Per-instance texture handles — multiple maps on one page are safe
- `lib.rs` decomposed into `projection`, `tiles`, `spatial`, `events`,
  `input`, `layers/`, `gl/`, `render/` modules
- `cargo clippy -D warnings` clean; ESLint 0 errors; duplicated dead
  triangulation/render code removed
- Unused `geojson`/`geo-types` dependencies dropped; `wasm-bindgen-test`
  moved to dev-dependencies
- npm tarball fixed (wasm-pack's generated `dist/.gitignore` was silently
  excluding `dist/` from the package) and verified by installing into a fresh
  project; `postinstall` no longer downloads a Playwright browser on every
  consumer install

### Known limitations
- WebGL2 required; no Canvas2D/WebGL1 rendering fallback
- Line width stored but not applied (WebGL2 lineWidth limitation)
- No mobile touch input yet — pan/zoom is desktop-only
- Streaming GeoJSON parser is regex-assisted and fragile on exotic input
- Standalone line/polygon layers still rebuild vertex data on the CPU each
  frame (points and GeoJSON layers are GPU-cached; these are next)
- Normalized-coordinate precision degrades at very high zoom (z≈18+)

## Pre-history - 2025-09-11
- Initial experiment: WebGL2 tile and point rendering, basic WASM bindings
