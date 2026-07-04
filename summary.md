# Rustyleaf — Project Summary

> **Version:** 0.0.1-pre-alpha | **License:** MIT | **Author:** Mehdi | **Date:** 2025-09-11

---

## 1. Project Overview

**Rustyleaf** is a high-performance, Rust-powered map visualization engine that runs in the browser via **WebAssembly + WebGL2**. It provides a Leaflet.js-compatible JavaScript API, with all heavy computation — tile rendering, polygon triangulation, spatial indexing, hit-testing, GeoJSON parsing — performed in Rust compiled to WASM. The project is explicitly **experimental/pre-alpha** and not intended for production use.

| Attribute | Value |
|---|---|
| **NPM Package** | `rustyleaf` v0.0.1 |
| **Rust Crate** | `rustyleaf-core` v0.0.1 |
| **Repository** | https://github.com/mehdilhy/rustyleaf |
| **License** | MIT |
| **Status** | Pre-alpha / experimental |

---

## 2. Architecture & Tech Stack

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────┐
│                  Browser DOM                  │
│  ┌──────────────────────────────────────────┐ │
│  │         JavaScript/TypeScript API        │ │
│  │  (src/rustyleaf-api.js — 1,626 lines)    │ │
│  │  Map, TileLayer, PointLayer, LineLayer,  │ │
│  │  PolygonLayer, GeoJSONLayer, Popup       │ │
│  └──────────────┬───────────────────────────┘ │
│                 │ wasm-bindgen interop        │
│  ┌──────────────▼───────────────────────────┐ │
│  │     Rust WASM Core (core/src/lib.rs)     │ │
│  │     RustyleafMap, WebGL2 rendering,      │ │
│  │     spatial indexing, polygon tessel.,   │ │
│  │     GeoJSON parser, event system         │ │
│  └──────────────┬───────────────────────────┘ │
│                 │ WebGL2 API                  │
│  ┌──────────────▼───────────────────────────┐ │
│  │         GPU (via <canvas> WebGL2)        │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Rust core** | Rust 2021 | Single monolithic 3,742-line `lib.rs` |
| **WASM compilation** | wasm-pack + wasm-bindgen | Target: bundler; profile: LTO + opt-level=z |
| **JS bundler** | Webpack 5 | asyncWebAssembly + ESM output module |
| **Type safety** | TypeScript 5.x | Hand-written .d.ts (573 lines) |
| **Testing** | Jest 29 + ts-jest | jsdom environment, comprehensive WASM mocks |
| **Linting** | ESLint 8 + Prettier 3 | TypeScript-aware rules |
| **WebGL** | WebGL2 API | 4 custom GLSL shader programs |

---

## 3. Directory Structure

```
rustyleaf/
├── Cargo.toml                    # Rust workspace root (members: ["core"])
├── package.json                  # NPM package (main: dist/rustyleaf.bundle.js)
├── package-types.json            # Sub-package: @rustyleaf/types
├── tsconfig.json                 # TypeScript strict mode, ES2020 target
├── webpack.config.js             # Webpack 5 + async WASM + ESM output
├── jest.config.js                # Jest 29 + ts-jest + jsdom
├── .eslintrc.json                # ESLint (TypeScript + ES2021)
├── .prettierrc                   # Prettier (single quotes, 2-space)
├── README.md                     # Project documentation
├── CHANGELOG.md                  # v0.0.1 release notes
├── CONTRIBUTING.md               # Contributor guidelines
├── CODE_OF_CONDUCT.md            # Contributor Covenant v2.1
├── SECURITY.md                   # Vulnerability reporting
├── LICENSE                       # MIT License
│
├── core/                         # ── RUST CORE (WASM) ──
│   ├── Cargo.toml                # crate: rustyleaf-core v0.0.1
│   └── src/
│       ├── lib.rs                # Main implementation (3,742 lines)
│       └── tests.rs              # WASM unit tests (258 lines)
│
├── src/                          # ── JAVASCRIPT API ──
│   ├── index.js                  # Entry point — re-exports API
│   └── rustyleaf-api.js          # Leaflet-style wrapper (1,626 lines)
│
├── types/
│   └── rustyleaf.d.ts            # TypeScript declarations (573 lines)
│
├── tests/                        # ── JEST TESTS ──
│   ├── setup.ts                  # WASM/WebGL/DOM mocks (223 lines)
│   ├── __mocks__/
│   │   ├── wasmMock.js           # Full WASM mock (466 lines)
│   │   ├── styleMock.js
│   │   └── fileMock.js
│   ├── Map.test.ts               # Map init, methods, events, errors
│   ├── api.test.ts               # Low-level WASM API mocks
│   ├── TileLayer.test.ts         # Tile layer tests
│   ├── PointLayer.test.ts        # Point layer tests
│   ├── LineLayer.test.ts         # Line layer tests
│   ├── PolygonLayer.test.ts      # Polygon layer tests
│   ├── GeoJSONLayer.test.ts      # GeoJSON layer tests (most extensive)
│   ├── Popup.test.ts             # Popup lifecycle tests
│   ├── WebGL.test.ts             # WebGL detection tests
│   └── Integration.test.ts       # Cross-browser, lifecycle tests
│
├── examples/
│   └── geojson-test.html         # Demo with Paris GeoJSON data
│
├── geojson/
│   └── arrondissements.geojson   # 5.5 MB French arrondissements data
│
├── scripts/
│   ├── benchmark-runner.js       # Benchmark server + report generation
│   └── performance-validator.js  # Static perf analysis of build artifacts
│
└── assets/
    └── logo.png
```

---

## 4. Rust Core (`rustyleaf-core`)

### 4.1 Dependencies

| Crate | Version | Purpose |
|---|---|---|
| `wasm-bindgen` | 0.2 | JS/Rust interop |
| `js-sys` / `web-sys` | 0.3 | Browser Web APIs (WebGL2, DOM, events, XHR) |
| `serde` / `serde_json` | 1.0 | JSON serialization/parsing |
| `serde-wasm-bindgen` | 0.6 | JsValue ↔ serde conversion |
| `rstar` | 0.11 | R-tree spatial indexing for hit-testing |
| `geojson` / `geo-types` | 0.24 / 0.7 | GeoJSON types (declared, not directly imported) |
| `regex` | 1.0 | Pattern matching in streaming GeoJSON parser |
| `lyon_tessellation` / `lyon_path` | 1.0 | High-quality polygon triangulation |

### 4.2 Key Types

#### WASM-Exported Types (`#[wasm_bindgen]`)

| Type | Purpose |
|---|---|
| **`RustyleafMap`** | Central map engine — viewport, tiles, layers, events, rendering |
| **`WebGlSupportInfo`** | WebGL capability detection (webgl2, webgl1, renderer, extensions) |
| **`TileLayerApi`** | Standalone tile layer with URL template |
| **`PointLayerApi`** | Standalone point layer with click/hover callbacks |
| **`PointLayer` / `PointFeature`** | Point data container (lat, lng, size, color, metadata) |
| **`LineLayer` / `LineFeature`** | Polyline data container (points array, color, width) |
| **`PolygonLayer` / `PolygonFeature`** | Polygon data container (rings, color) |
| **`GeoJSONLayer` / `GeoJSONFeature`** | GeoJSON layer with preprocessed caches |
| **`GeoJSONGeometry`** | Enum: Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon |
| **`GeoJSONStyle`** | Point/line/polygon styling with `Default` impl |

#### Internal (Private) Types

| Type | Purpose |
|---|---|
| `TileCoord` | Tile identifier: x, y, z |
| `Tile` | Tile state: coord, optional WebGL texture, loading flag |
| `SpatialFeature` | R-tree entry: id, AABB bounds, JSON metadata |
| `ShaderPrograms` | Four compiled WebGL shader programs |
| `WebGlState` | GL context + all programs, VAOs, and buffers |
| `MouseState` | Drag tracking: is_dragging, last_xy, button state |

### 4.3 Public API Methods (RustyleafMap)

#### Construction & Rendering
`new(width, height)`, `init_canvas(canvas_id)`, `set_view(lat, lng, zoom)`, `render(canvas_id)`, `resize(w, h)`

#### Navigation
`pan(dx, dy)`, `zoom_in()`, `zoom_out()`, `on_wheel(delta_y, x, y)`

#### Coordinate Conversion
`screen_xy(lat, lng)`, `project(latlng)`, `unproject(point)`, `get_center()`, `get_zoom()`, `get_bounds()`, `fit_bounds(bounds)`

#### Layer Management
`add_tile_layer(url)`, `add_point_layer()`, `add_points(index, data)`, `add_line_layer()`, `add_lines(index, data)`, `add_polygon_layer()`, `add_polygons(index, data)`, `add_geojson_layer()`, `load_geojson(index, json)`, `load_geojson_from_url(index, url)`, `load_geojson_chunk(index, chunk, is_final)`, `clear_geojson_layer(index)`, `get_geojson_feature_count(index)`, `set_geojson_style(index, style)`

#### Input & Events
`handle_mouse_down(x, y)`, `on_mouse_move(x, y)`, `handle_mouse_up(x, y)`, `handle_contextmenu(x, y)`, 10 `on_*`/`off_*` event registration pairs (move, zoom, click, hover, mousedown, mouseup, contextmenu, keydown, keyup, dragend)

### 4.4 Rendering Pipeline (Per Frame)

```
1. apply_momentum()           → Google Maps-style inertia (0.95 friction)
2. clear()                    → Light gray background
3. update_spatial_index()     → Rebuild R-tree for hit-testing
4. render_tiles()             → Textured quads via WebGL TRIANGLE_STRIP
5. render_points()            → WebGL POINTS with circular fragment shader
6. render_lines()             → WebGL LINES (segment pairs)
7. render_polygons()          → Ear-clipped TRIANGLES
8. render_geojson()           → Cached points/lines/triangulated polygons
```

### 4.5 WebGL Shader Programs (Inline GLSL)

| Program | Geometry | Features |
|---|---|---|
| **Tile** | TRIANGLE_STRIP (4 verts) | Textured quad, u_matrix projection |
| **Point** | POINTS | Circular clipping via `length(gl_PointCoord - 0.5)`, variable size & color |
| **Line** | LINES (2 verts each) | Position + color passthrough |
| **Polygon** | TRIANGLES | Position + color passthrough |

### 4.6 Key Algorithms

| Algorithm | Details |
|---|---|
| **Web Mercator projection** | `lat_lng_to_pixel()` / `pixel_to_lat_lng()`; tile_size=256; lat clamped to ±85.05° |
| **Tile loading** | HTMLImageElement with CORS; texture cached in `TILE_TEXTURES` thread-local HashMap; max 20 tiles cached, max 3 loaded per frame |
| **Momentum dragging** | Weighted avg smoothing (0.7), friction 0.95/frame, min threshold 2 px/s, max cap 2000 px/s |
| **Polygon triangulation** | Two paths: (1) simple ear-clipping for user layers, (2) **Lyon tessellation** (tolerance 0.05) for GeoJSON polygons with holes |
| **Spatial hit-testing** | R-tree rebuilt per frame; 3px tolerance AABB; returns first matching feature's metadata |
| **Streaming GeoJSON** | Regex-based feature extraction from partial JSON; brace-counting for complete object detection; JSONL fallback |
| **Viewport culling** | Pre-filters cached GeoJSON triangles by viewport bounds (+50px margin) |
| **Color parsing** | `#RRGGBB`, `#RRGGBBAA`, `#RGB`, `#RGBA`, + named colors |

---

## 5. JavaScript/TypeScript API Layer

### 5.1 Exported Classes

| Class | File | Purpose |
|---|---|---|
| **`Map`** | `src/rustyleaf-api.js` | Main map container; creates `<canvas>`, initializes WASM, starts rAF render loop |
| **`TileLayer`** | `src/rustyleaf-api.js` | Raster tile layer wrapping `TileLayerApi` |
| **`PointLayer`** | `src/rustyleaf-api.js` | Point rendering wrapping `PointLayerApi` |
| **`LineLayer`** | `src/rustyleaf-api.js` | Polyline rendering |
| **`PolygonLayer`** | `src/rustyleaf-api.js` | Polygon rendering |
| **`GeoJSONLayer`** | `src/rustyleaf-api.js` | Most feature-rich: streaming, file loading, URL loading, caching |
| **`Popup`** | `src/rustyleaf-api.js` | HTML popup with auto-pan, close button, arrow tip |

### 5.2 GeoJSONLayer Features

- `loadData(geojson)` — Parse GeoJSON object or string
- `loadUrl(url)` — Fetch GeoJSON via standard HTTP
- `loadUrlStreaming(url)` — ReadableStream chunked processing with progress callbacks
- `loadFile(file)` — FileReader with chunked `file.slice()` reads
- `loadFromUrl(url)` — WASM-level XHR + parallel `fetch()` fallback
- `processChunk(chunk, isFinal)` — Forward chunks to WASM `load_geojson_chunk()`
- Deferred data: retry polling if data loaded before `addTo(map)`
- `getBounds()` — Client-side bounding box computation over all geometry types
- Streaming JSON parser: brace-counting for incomplete chunk handling

### 5.3 Event System

Leaflet-compatible event names mapped to WASM callbacks:

| JS Event | WASM Method |
|---|---|
| `move` | `on_move` / `off_move` |
| `zoom` | `on_zoom` / `off_zoom` |
| `click` | `on_click` / `off_click` |
| `hover` | `on_hover` / `off_hover` |
| `mousedown` | `on_mouse_down` / `off_mouse_down` |
| `mouseup` | `on_mouse_up` / `off_mouse_up` |
| `contextmenu` | `on_contextmenu` / `off_contextmenu` |
| `keydown` | `on_key_down` / `off_key_down` |
| `keyup` | `on_key_up` / `off_key_up` |
| `dragend` | `on_dragend` / `off_dragend` |

Event objects are Leaflet-compatible: `type`, `target`, `sourceTarget`, `center`, `zoom`, `bounds`, `latlng`, `containerPoint`, `layerPoint`.

### 5.4 TypeScript Declarations (`types/rustyleaf.d.ts`)

573 lines of type declarations — **aspirational, not fully implemented**. Declares ~80% more API surface than the JS implementation. Includes:
- Core types: `LatLng`, `LatLngBounds`, `Point`
- Options interfaces: `MapOptions`, `TileLayerOptions`, `PointLayerOptions`, `LineLayerOptions`, `PolygonLayerOptions`, `GeoJSONLayerOptions`, `GeoJSONStreamingOptions`, `PopupOptions`
- Event interfaces: `MapEvent`, `MoveEvent`, `ZoomEvent`, `ClickEvent`, `MouseEvent`, `KeyboardEvent`
- Feature interfaces: `PointFeature`, `LineFeature`, `PolygonFeature`, `HitInfo`
- Namespaces (not implemented): `CRS`, `Browser`, `DomEvent`, `DomUtil`
- Utility functions (not implemented): `latLng()`, `latLngBounds()`, `point()`, etc.

---

## 6. Build Pipeline

### 6.1 npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `build` | `wasm-pack build` + `webpack --mode production` | Full production build |
| `dev` | `wasm-pack build` + `webpack --mode development --watch` | Dev with hot rebuild |
| `build:wasm` | `cd core && wasm-pack build --target bundler --release --out-dir ../dist` | Compile Rust to WASM |
| `test` | `jest` | Run all tests |
| `test:watch` | `jest --watch` | Watch mode |
| `test:coverage` | `jest --coverage` | Coverage report |
| `lint` | `eslint . --ext .ts,.js` | Lint |
| `format` | `prettier --write .` | Format |
| `typecheck` | `tsc --noEmit` | TypeScript type checking |
| `bench` | `node benchmarks/run.js` | Benchmark suite |

### 6.2 Build Flow

```
[core/src/lib.rs]  ──wasm-pack──▶  [dist/rustyleaf_core_bg.wasm]
                                    [dist/rustyleaf_core_bg.js]
                                    [dist/rustyleaf_core.js]
                                              │
[src/index.js]  ────────────────────webpack───┤
[src/rustyleaf-api.js]  ──────────────────────┤
                                              ▼
                                   [dist/rustyleaf.bundle.js]  ← Published to npm
```

### 6.3 Build Optimization
- **Rust:** `lto = true`, `opt-level = "z"` (minimize WASM binary size)
- **Webpack:** `asyncWebAssembly` experiment, `outputModule: true`, performance hints disabled

---

## 7. Test Infrastructure

### 7.1 Overview

| Metric | Value |
|---|---|
| **Test runner** | Jest 29 + ts-jest |
| **Environment** | jsdom (simulated browser DOM) |
| **Test files** | 10 `.test.ts` files + 1 `.test.ts` API mock test |
| **Total test cases** | ~210+ |
| **Timeout** | 30 seconds |
| **Coverage output** | text, lcov, html → `coverage/` |

### 7.2 Mock Infrastructure

- **WASM mock** (`tests/__mocks__/wasmMock.js`, 466 lines): Full `RustyleafMap`, `TileLayerApi`, `PointLayerApi` mock classes with `jest.fn()` spies on all methods. Maintains per-instance state via `mapStates` Map.
- **WebGL mock**: 70+ mock functions for context methods (createShader, compileShader, createProgram, drawArrays, etc.)
- **DOM mock**: `getBoundingClientRect` returns 800×600, `TextEncoder`/`TextDecoder` polyfills
- **Test helpers**: `createMockMap()`, `createMockTileLayer()`, `createMockPointLayer()`

### 7.3 Test Coverage by Area

| Test File | Test Cases | Coverage |
|---|---|---|
| **Map.test.ts** | 22 | Constructor, methods, events, layers, errors, DOM |
| **GeoJSONLayer.test.ts** | 40 | Loading, streaming, chunk parsing, styling, bounds, errors |
| **PolygonLayer.test.ts** | 30 | Add, clear, validation, hole rings, complex geometries |
| **LineLayer.test.ts** | 26 | Add, clear, validation, coordinate variants |
| **TileLayer.test.ts** | 25 | URL templates, options, error handling |
| **Popup.test.ts** | 24 | Lifecycle, open/close/toggle, bind, update |
| **PointLayer.test.ts** | 20 | Add, clear, validation, method chaining |
| **Integration.test.ts** | 19 | Lifecycle, multi-map, viewports, memory |
| **WebGL.test.ts** | 16 | Detection, support levels, fallback paths |
| **api.test.ts** | 11 | WASM method calls via mocks |

### 7.4 Rust Tests (`core/src/tests.rs`)

11 `#[wasm_bindgen_test]` tests covering: map creation, tile coordinates, lat/lng ↔ pixel conversion, spatial features, point features, projection matrices, tile/point layer creation, zoom limits, and color parsing.

### 7.5 Known Test Gaps

- No end-to-end tests with real browser/WASM
- No visual regression tests
- No performance/benchmark tests
- `#[cfg(test)]` module in `lib.rs` is declared but empty
- `geojson` and `geo-types` crates declared in Cargo.toml but not directly used

---

## 8. Examples & GeoJSON Data

### 8.1 Example: `examples/geojson-test.html`

Single 260-line demo page:
- Fullscreen map centered on Eastern France (46.0°N, 5.5°E, zoom 8)
- OSM tile basemap + 185 embedded sample features (Paris landmarks)
- Async loads 5.5 MB `arrondissements.geojson` via `geojsonLayer.loadUrl()`
- Color style animation after 3 seconds
- Click event handler logging to debug panel

### 8.2 GeoJSON Fixture: `geojson/arrondissements.geojson`

- **Size:** 5,739,022 bytes (5.5 MB), single line
- **Content:** FeatureCollection of Polygon features — French department administrative arrondissements
- **Coordinates:** Eastern France region (~45°N, ~5°E)

---

## 9. Documentation

| File | Content |
|---|---|
| **README.md** | Project overview, architecture, quick start, API examples |
| **CHANGELOG.md** | v0.0.1: Initial release with WebGL2 tile/point rendering |
| **CONTRIBUTING.md** | Fork/clone workflow, prerequisites (Rust, wasm-pack, Node 18+), dev commands, code style, PR checklist |
| **CODE_OF_CONDUCT.md** | Contributor Covenant v2.1, 4-tier enforcement |
| **SECURITY.md** | Pre-alpha warning, reporting email (mehdilhy@gmail.com), known weaknesses: minimal validation, no sanitization, memory issues |
| **LICENSE** | MIT, Copyright (c) 2025 Rustyleaf contributors |

---

## 10. Known Issues & Limitations

From `SECURITY.md`, `README.md`, and code patterns:

1. **Pre-alpha status** — API unstable, not for production
2. **Memory leaks** — Known issue, under investigation
3. **Limited error handling** — Many validation paths silently accept invalid input
4. **Minimal input validation** — No sanitization of user-provided data
5. **No layer removal tracking** — `add_geojson_layer()` doesn't return an index; JS manually counts layers
6. **Single monolithic file** — `lib.rs` is 3,742 lines; no module decomposition
7. **Thread-local globals** — `TILE_TEXTURES` and `SPATIAL_INDEX` shared across all map instances
8. **Tile cache capped at 20** — May cause visible tile flashing on rapid panning
9. **Ear-clipping triangulation** — Simple implementation, does not handle self-intersecting or complex polygons (falls back to Lyon for GeoJSON)
10. **No Canvas2D fallback** — WebGL2 required; WebGL1 fallback limited
11. **Dev dependencies only** — Zero runtime npm dependencies, but requires WASM build step
12. **Incomplete TypeScript types** — Declared API surface ~80% larger than implementation
13. **Experimental webpack config** — Uses `asyncWebAssembly` and `outputModule` experiments

---

## 11. Summary Statistics

| Metric | Value |
|---|---|
| **Total source files** | 21 (2 Rust + 2 JS + 1 TS defs + 10 tests + 4 config + 2 scripts + 1 HTML) |
| **Rust code** | 4,000 lines (lib.rs 3,742 + tests.rs 258) |
| **JavaScript code** | 1,650 lines (rustyleaf-api.js 1,626 + index.js 24) |
| **TypeScript definitions** | 573 lines |
| **Test code** | ~4,990 lines (10 test files + setup + mocks) |
| **Mock/utility code** | ~940 lines (wasmMock.js 466 + setup.ts 223 + other mocks) |
| **Total test cases** | ~210+ |
| **GeoJSON fixture** | 5.5 MB |
| **Rust dependencies** | 13 crates |
| **JS dev dependencies** | 13 packages |
| **JS runtime dependencies** | 0 |
| **Shader programs** | 4 (inline GLSL) |
| **WASM-exposed methods** | 50+ |

---

## 12. Build Commands Quick Reference

```bash
# Prerequisites
cargo install wasm-pack
npm install

# Full build (Rust → WASM → Webpack bundle)
npm run build

# Development mode with watch
npm run dev

# Run tests
npm test
npm run test:coverage

# Lint & format
npm run lint
npm run format
npm run typecheck
```

---

*Generated by automated codebase analysis on 2026-07-04.*
