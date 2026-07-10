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
- Leaflet-style API surface (all TDD'd against the real API):
  - `Marker` / `Icon` / `DivIcon` rendered as GPU sprites in the Rust core,
    with popups, tooltips, drag events, opacity/z-index
  - `Tooltip` lightweight hover overlays
  - UI controls: `ZoomControl`, `AttributionControl`, `ScaleControl`, and
    `LayersControl` (checkbox overlays + radio base layers) on a `Control` base
  - Vector shapes: `Circle` (geodesic, meters), `CircleMarker` (pixel radius,
    GPU point), `Rectangle` (from bounds)
  - `LayerGroup` / `FeatureGroup` (bulk add/remove, union `getBounds`,
    delegated events)
  - Map navigation: `flyTo` / `flyToBounds` (eased animation), `setMaxBounds`
    with `setView` clamping, `invalidateSize`, `locate`/`stopLocate` with
    `locationfound`/`locationerror` events
  - GeoJSON `filter` / `pointToLayer` / `onEachFeature` (per-feature popups,
    tooltips, click/hover handlers dispatched from the wasm hit-test)
  - Extended events: `movestart/moveend`, `zoomstart/zoomend`,
    `dragstart/drag`, `layeradd/layerremove` (+ `map.addLayer/removeLayer/
    hasLayer`), `popupopen/close`, `tooltipopen/close`, `boxzoomend`,
    `resize`, `load`
  - Input: keyboard navigation (arrows pan, +/- zoom), box zoom (shift-drag),
    touch gestures (one-finger pan with momentum, pinch zoom) — all verified
    in-browser with Playwright
  - `ImageOverlay` / `VideoOverlay` / `SVGOverlay` ground overlays
  - `WMSTileLayer` (the Rust tile loader substitutes a per-tile EPSG:3857
    bbox via `{bbox-epsg-3857}`) and a DOM-tile `GridLayer` (`createTile`)
  - Thick lines: `LineLayer` segments are tessellated into screen-space quads
    so `width` is honored (GeoJSON-styled lines still 1px)
  - Plugin surface: `Handler` base + `map.addHandler` + `Util` helpers
- 405 Jest unit tests; Playwright e2e suite (visual regression, GL leak
  detection, instance isolation, idle CPU, memory soak, FPS benchmark, and a
  kitchen-sink test that puts every feature — including a 1,000,000-point
  layer — on one map and stress-tests functionality plus fps under load)
- Live demo pages under [`demo/`](demo/): points/perf, GPU markers, shapes &
  layer groups, interactions & events, overlays & tiles

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
- **All layers of a kind collapsed into wasm index 0** — `add_point_layer` /
  `add_line_layer` / `add_polygon_layer` / `add_geojson_layer` returned
  nothing, and the JS wrapper's `undefined` was coerced to index 0, so a
  second layer of the same kind overwrote the first. They now return the new
  layer's index. Verified in-browser: two point layers render independently.
- **`layer.remove()` was a stub** — it now hides the layer in the wasm core
  (new `set_*_layer_visible` methods; every render pass already honored the
  flag), and `addTo()` on the same map re-shows it instead of duplicating the
  GPU data. This is what makes `LayersControl` toggling actually work.
- **Standalone polygons never rendered without a GeoJSON layer** — two causes:
  the polygon pass never set `u_origin`/`u_world_scale` (which default to 0,
  collapsing every vertex — they were only set by the GeoJSON pass sharing the
  program, hiding the bug in fixtures), and the ear-clipping triangulator
  assumed counterclockwise winding, silently producing zero triangles for
  clockwise rings. Both fixed; winding is now normalized via the shoelace
  formula and GeoJSON-style closing vertices are dropped.
- **Multiple maps rendered into the first canvas on the page** — every map
  used the same canvas id (`rustyleaf-map-canvas`) and the wasm core looks the
  canvas up by id; ids are now unique per instance (the old two-maps e2e
  baseline had actually captured the leak).
- **Per-frame `console.log` spam removed from the GeoJSON render path** (7
  logs per frame at 60fps).
- **Feature clicks never reached JS** — the wasm hit-test path logged to the
  console instead of firing callbacks; map `click` events now carry a
  `feature` payload, and a new hover hit-test path fires `hover` events.
- **Hit-testing required a pixel-perfect hit** — the R-tree query used
  envelope containment instead of intersection.
- **Re-entrant wasm callbacks** — layers that call back into the map from a
  wasm-dispatched event (overlays repositioning via `screen_xy`, feature
  popups) now defer to a microtask; synchronous re-entry throws
  wasm-bindgen's "recursive use of an object" and was silently swallowed.
- **GeoJSON styles set after data load were ignored** — the render cache
  bakes style into cached features and `set_geojson_style` never rebuilt it,
  so the normal `addTo()` order (load, then style) always rendered defaults.
- **"closure invoked recursively or after being dropped" on tile loads** —
  in-flight tile images could fire onload/onerror after their wasm closure
  was dropped (cache cleanup, destroy, context loss). Handlers are now
  detached from the image before any closure is dropped, and duplicate
  in-flight loads for the same tile are skipped.
- **The world didn't repeat at low zoom — panning past ±180° showed a gray
  void** (Leaflet tiles the world infinitely; rustyleaf didn't). The tile
  loader, render pass, and cache-eviction key set now wrap tile x
  horizontally (`((x % worldTiles) + worldTiles) % worldTiles`) while
  rendering at the unwrapped screen position; latitude does not wrap.
- **1,000,000-point layers dropped to ~14fps when zoomed out enough for the
  whole dataset to collapse into a few screen pixels** — every point still
  issued a blended fragment write, serializing the ROP on overlapping
  geometry that contributed nothing visually. Point layers now cap total
  fragment work to a budget derived from their on-screen footprint: once a
  layer's screen area is small, only a bounded, deterministically-shuffled
  sample of its (pre-uploaded, unmodified) vertex buffer is drawn — a fair
  random subset, not a truncation. At full-viewport coverage, the budget
  exceeds the point count and every point still draws. Verified in-browser:
  zoomed out, 1M points now render at 60fps (previously the slowest view).
- **GeoJSON `onEachFeature` click/hover handlers could never fire in the real
  engine** — two compounding bugs, invisible to Jest because the unit tests
  simulated the click event by hand instead of going through the real
  hit-test: (1) `GeoJSONLayer`'s cached points/lines were never added to the
  R-tree spatial index used by `hit_test` (only raw `PointLayer`/`LineLayer`/
  `PolygonLayer` features were indexed), so a hit could never land on a
  GeoJSON feature at all; (2) even simulated correctly, the JS dispatcher
  read `feature.__rl_fid` but the wasm hit-test wraps meta as
  `{layer_type, layer_index, feature_index, original_meta}` — the real path
  is `feature.original_meta.__rl_fid`. Also hardened: dispatch is now gated
  on `layer_index` matching, so two `GeoJSONLayer`s on one map with
  colliding feature ids no longer cross-fire each other's handlers. Polygon
  *interiors* still aren't hit-testable (only their outline, via the cached
  outline line) — triangulated polygon geometry has no per-feature metadata
  to attach yet.
- **`Popup` autopan crashed and silently dropped the popup** — `_handleAutoPan`
  called `map.panTo(...)`, a method that was never implemented (only `panBy`/
  `setView`/`flyTo` exist); the uncaught exception aborted `openOn()` before
  the popup element was ever appended to the DOM. Fixed to call `flyTo`.
  Also fixed a second bug in the same path: position/autopan measurement ran
  *before* the popup element was appended to the document, so
  `getBoundingClientRect()` always read a zero-sized detached rect — autopan
  math was computed against garbage on every open, not just when the popup
  actually overflowed the viewport. `openOn()` now appends first, then
  measures.

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
- Spherical Mercator only — no custom CRS
- Line width honored for `LineLayer`; GeoJSON-styled lines still 1px
- Touch covers pan + pinch; no tap-hold or double-tap zoom
- Streaming GeoJSON parser is regex-assisted and fragile on exotic input
- Standalone line/polygon layers still rebuild vertex data on the CPU each
  frame (points and GeoJSON layers are GPU-cached; these are next)
- Normalized-coordinate precision degrades at very high zoom (z≈18+)

## Pre-history - 2025-09-11
- Initial experiment: WebGL2 tile and point rendering, basic WASM bindings
