# ARCHITECTURE.md — Rustyleaf Constitution

> **Read this before writing a single line of code.**
> Every AI agent and human contributor MUST understand this document.
> It is the contract that keeps the codebase alive.

---

## 1. Why This Document Exists

Rustyleaf v0.0.1 generated ~4,000 lines of Rust and ~1,650 lines of JS, plus
210 tests that passed against mocks of the engine they were supposed to test.
The project stalled because **typing speed was never the bottleneck** —
architecture decisions, feedback loops, and correctness were.

This document defines:
- **Invariants** that cannot be violated without explicit review
- **Module boundaries** that keep parallel agents from colliding
- **Ownership rules** that prevent the memory leaks that killed v0.0.1
- **A migration plan** from the current monolith to the target architecture

If you are an AI agent: treat the invariants as compiler errors. If your
proposed change violates one, stop and ask. If your change is within
invariants, proceed and let the e2e test harness verify correctness.

---

## 2. Current-State Audit (Verified)

These are the load-bearing flaws in the v0.0.1 codebase. Each is confirmed
against source with line numbers.

### 2.1 Thread-Local Globals (`lib.rs:83-86`)

```rust
thread_local! {
    static TILE_TEXTURES: RefCell<HashMap<String, WebGlTexture>> = ...;
    static SPATIAL_INDEX: RefCell<RTree<SpatialFeature>> = ...;
}
```

**Problem:** All map instances share the same texture cache and spatial index.
Two maps on the same page corrupt each other's state. There is no way to
clean up textures when a map is destroyed. The spatial index for map A
gets overwritten when map B renders.

**Fix:** Move both into `RustyleafMap` as owned fields.

### 2.2 Closure::forget() Leaks (`lib.rs:1427, 1447, 2223`)

```rust
image.set_onload(Some(onload_closure.as_ref().unchecked_ref()));
onload_closure.forget();  // <-- leaks: closure is never reclaimed
```

**Problem:** Every tile load creates two `Closure::wrap` allocations and
forgets them into the JS heap. Over 10 minutes of panning at 3 tiles/frame,
this leaks thousands of closures. This is the classic wasm-bindgen leak.

**Fix:** Store closures in a `Vec<Closure>` on the map (or on a `TileLoader`
struct). Drop them when the tile is evicted or the map is destroyed.

### 2.3 GPU Memory Leak — No `delete_texture` (`lib.rs:526-542`)

```rust
for key in keys_to_remove {
    textures.remove(&key);  // <-- HashMap entry removed, GPU texture never freed
}
```

**Problem:** `cleanup_old_tiles()` evicts textures from the HashMap but never
calls `context.delete_texture(&texture)`. Each evicted tile leaks a GPU
texture object. The 20-tile cache cap means this churns through textures
rapidly during panning.

**Fix:** Call `delete_texture` before removing from the HashMap. Better:
wrap textures in an RAII type whose `Drop` impl calls `delete_texture`.

### 2.4 Spatial Index Rebuilt Every Frame (`lib.rs:906`)

```rust
fn render(&mut self, ...) {
    ...
    self.update_spatial_index();  // <-- rebuilds entire R-tree, every frame
    ...
}
```

**Problem:** `update_spatial_index()` iterates every point and line segment
in every layer, computes screen coordinates, builds AABBs, and inserts into
a fresh R-tree — every single frame, 60 times per second. With 10,000
features, this is pure waste: the index only needs to change when data
changes or when the viewport moves (screen coordinates shift).

**Fix:** Mark the index dirty on data change and viewport change. Rebuild
only when dirty. For viewport changes, recompute screen coordinates lazily
during hit-testing instead of pre-indexing in screen space.

### 2.5 `unwrap()` in Production Code (`lib.rs:1377`)

```rust
let image = HtmlImageElement::new().unwrap();
```

**Problem:** `unwrap()` panics in WASM, which aborts the entire module.
There is no recovery. A single failed DOM call kills the map.

**Fix:** Return `Result`. Use a typed error enum. No `unwrap()` or `expect()`
outside `#[cfg(test)]`.

### 2.6 Monolithic Source File (`lib.rs` — 3,742 lines)

**Problem:** One file contains projection math, WebGL shaders, tile loading,
four layer types, GeoJSON parsing, polygon triangulation, spatial indexing,
input handling, momentum physics, event system, color parsing, and WASM
bindings. No human or AI agent can hold this in working memory. Parallel
agents working on the same file will collide.

**Fix:** Decompose into modules with clear boundaries (see Section 4).

### 2.7 Mock-Based Tests (~210 tests, all against mocks)

**Problem:** Every Jest test runs in jsdom against a 466-line WASM mock.
The tests validate that the JS wrapper calls the right mock functions with
the right arguments. They do not validate that the Rust engine renders
anything, that tiles load, that polygons triangulate, or that memory is
safe. Green tests coexisted with a broken product.

**Fix:** The Playwright e2e harness (Section 6) provides real-browser
feedback. Mock-based unit tests are still useful for JS wrapper logic but
must not be the only signal.

### 2.8 Aspirational Type Definitions (`types/rustyleaf.d.ts` — 573 lines)

**Problem:** The `.d.ts` declares ~80% more API than the JS implementation
provides. Consumers get type errors for methods that don't exist. The types
describe a future engine, not the current one.

**Fix:** The `.d.ts` must match the actual JS exports exactly. New types
are added when the implementation lands, not before.

---

## 3. Invariants

These are non-negotiable. Violating them requires a written justification
in the PR description and explicit approval.

### INV-1: No Thread-Local Globals

All mutable state lives inside `RustyleafMap` or structs it owns. No
`thread_local!`, no `static mut`, no lazy statics for mutable state.

### INV-2: Every GL Resource Has an Owner That Deletes It

Every `WebGlTexture`, `WebGlBuffer`, `WebGlVertexArrayObject`,
`WebGlProgram`, and `WebGlShader` is wrapped in an RAII struct whose
`Drop` implementation calls the corresponding `delete_*()` method.

```rust
struct OwnedTexture {
    gl: WebGl2RenderingContext,
    texture: WebGlTexture,
}

impl Drop for OwnedTexture {
    fn drop(&mut self) {
        self.gl.delete_texture(Some(&self.texture));
    }
}
```

### INV-3: No `Closure::forget()`

Closures passed to JS event handlers are stored in a `Vec<Closure<...>>`
on the owning struct. They are dropped when the handler is removed
(`off_*`) or when the struct is dropped. `forget()` is banned.

### INV-4: No `unwrap()` Outside Tests

All fallible operations return `Result<T, RustyleafError>`. The only
`unwrap()` / `expect()` calls live in `#[cfg(test)]` modules.

### INV-5: Spatial Index Updates On Data Change, Not Per Frame

The spatial index is marked dirty when layers are added, removed, or
modified. It is rebuilt only when dirty, not on every render call.
Viewport changes do not invalidate the index (hit-testing recomputes
screen coordinates lazily).

### INV-6: Layer Methods Return Typed Handles

`add_point_layer()` returns `LayerHandle<PointLayer>`, not `()`.
Handles enable removal, reordering, and z-index management.

### INV-7: Error Handling via Typed Enum

```rust
pub enum RustyleafError {
    WebGlUnavailable(String),
    ShaderCompilation { shader_type: String, log: String },
    TextureCreation(String),
    InvalidCoordinate { lat: f64, lng: f64 },
    GeoJsonParse(String),
    DomError(String),
    // ...
}
```

WASM methods return `Result<T, JsValue>` where the `JsValue` is constructed
from the typed enum (via `serde_wasm_bindgen`). No string-only errors.

### INV-8: Module Files Stay Under 400 Lines

When a module exceeds 400 lines, split it. Large implementations go in
submodules. The `mod.rs` re-exports the public API.

### INV-9: `.d.ts` Matches Implementation

The TypeScript declarations must exactly reflect the JS exports. No
aspirational types. New API surface is typed when it ships.

### INV-10: E2E Tests Must Pass Before Merge

Every PR must pass:
- Visual regression (screenshot pixel-diff)
- Memory soak (heap plateaus over N minutes of pan/zoom)
- FPS benchmark (avg >= threshold on the 5.5MB dataset)

Mock-based Jest tests are supplementary, not gating.

---

## 4. Target Module Structure

```
core/src/
├── lib.rs                  # Crate root: wasm-bindgen entry, re-exports
├── error.rs                # RustyleafError enum, Result alias
├── map.rs                  # RustyleafMap struct + public WASM API
│
├── projection.rs           # Web Mercator: lat/lng <-> pixel, screen coords
├── color.rs                # Color parsing: hex, named, -> [f32; 4]
│
├── gl/                     # WebGL infrastructure
│   ├── mod.rs              # WebGlState: context + programs + VAOs + buffers
│   ├── shaders.rs          # GLSL source strings, program definitions
│   └── resources.rs        # RAII wrappers: OwnedTexture, OwnedBuffer, OwnedVAO
│
├── tiles/                  # Tile management
│   ├── mod.rs              # TileLayer, TileCoord, Tile struct
│   └── cache.rs            # Texture cache: LRU eviction with delete_texture on drop
│
├── layers/                 # Vector overlay layers
│   ├── mod.rs              # LayerHandle<T>, LayerType enum, LayerManager
│   ├── point.rs            # PointLayer, PointFeature
│   ├── line.rs             # LineLayer, LineFeature
│   ├── polygon.rs          # PolygonLayer, PolygonFeature, ear-clipping
│   └── geojson.rs          # GeoJSONLayer, parsing, lyon tessellation, caching
│
├── spatial/                # Spatial indexing
│   ├── mod.rs              # SpatialIndex trait
│   └── rtree.rs            # R-tree impl, dirty-flag rebuilds
│
├── render/                 # Rendering pipeline
│   ├── mod.rs              # Render orchestration (the per-frame pipeline)
│   ├── tiles.rs            # Tile quad rendering (TRIANGLE_STRIP)
│   ├── points.rs           # Point rendering (POINTS + circular fragment)
│   ├── lines.rs            # Line rendering (LINES)
│   └── polygons.rs         # Polygon rendering (TRIANGLES)
│
├── input/                  # Input handling
│   ├── mod.rs              # MouseState, keyboard state, event dispatch
│   └── momentum.rs         # Drag momentum physics
│
├── events.rs               # Event system: callback storage, on/off registration
├── map.rs                  # RustyleafMap struct + public WASM API
├── error.rs                # RustyleafError enum, Result alias
└── api/                    # Standalone WASM API classes
    ├── mod.rs
    ├── tile_layer.rs       # TileLayerApi
    └── point_layer.rs      # PointLayerApi
```

### Module Responsibilities

| Module | Owns | Does NOT do |
|---|---|---|
| `projection` | Web Mercator math, screen conversion | WebGL, DOM, events |
| `color` | Color string → `[f32; 4]` | Anything else |
| `gl/resources` | RAII wrappers for GL objects | Shader logic, rendering |
| `gl/shaders` | GLSL source, program creation | Drawing |
| `gl/mod` | GL context, program/buffer state | Resource lifecycle (delegates to `resources`) |
| `tiles/cache` | Texture LRU cache with GPU cleanup | Image loading, rendering |
| `tiles/mod` | Tile loading lifecycle (HTMLImageElement) | Texture caching (delegates to `cache`) |
| `layers/*` | Feature data structs, layer containers | Rendering (delegates to `render/*`) |
| `layers/geojson` | GeoJSON parsing, tessellation, caching | Drawing |
| `spatial` | R-tree, dirty-flag rebuilds | Screen coordinate computation |
| `render/*` | Per-frame draw calls | Data mutation, input handling |
| `input/*` | Mouse/keyboard state, momentum | Rendering, DOM manipulation |
| `events` | Callback registration/dispatch | What callbacks do |
| `map` | Orchestrates everything, public API | Implementation details (delegates) |
| `error` | Error types | Anything |

---

## 5. Ownership Rules

### Who owns what

```
RustyleafMap
├── gl_state: WebGlState
│   ├── context: WebGl2RenderingContext
│   ├── programs: ShaderPrograms (4 owned WebGlProgram)
│   ├── vaos: [OwnedVAO; 4]          ← Drop calls delete_vertex_array
│   └── buffers: [OwnedBuffer; 4]    ← Drop calls delete_buffer
├── tile_cache: TileCache
│   └── textures: LruCache<String, OwnedTexture>  ← Drop calls delete_texture
├── layers: LayerManager
│   ├── point_layers: Vec<PointLayer>
│   ├── line_layers: Vec<LineLayer>
│   ├── polygon_layers: Vec<PolygonLayer>
│   └── geojson_layers: Vec<GeoJSONLayer>
│       └── each has: polygon_buffer: Option<OwnedBuffer>  ← Drop calls delete_buffer
├── spatial_index: SpatialIndex        ← dirty flag, rebuild on demand
├── event_system: EventSystem
│   └── closures: Vec<Closure<...>>   ← Drop unregisters from JS
├── input_state: InputState
│   ├── mouse: MouseState
│   └── momentum: MomentumState
└── tile_loader: TileLoader
    └── closures: Vec<Closure<...>>   ← onload/onerror stored, not forgotten
```

### Lifecycle

1. **Map creation:** `RustyleafMap::new()` allocates structs but no GL resources.
2. **Canvas init:** `init_canvas()` creates GL context, compiles shaders, creates VAOs/buffers.
3. **Layer add:** `add_*_layer()` pushes a layer, marks spatial index dirty.
4. **Layer remove:** `remove_layer(handle)` drops the layer, frees its GPU buffers, marks index dirty.
5. **Map destruction:** `Drop` for `RustyleafMap` frees all GL resources via RAII. No manual cleanup needed.

---

## 6. E2E Test Harness (The Feedback Loop)

Located in `e2e/`. This is the gate that prevents mock-theater.

### Test Types

| Test | What It Verifies | Gate |
|---|---|---|
| **Visual regression** | Screenshot pixel-diff per feature | Baseline must match within 2% pixel tolerance |
| **Memory soak** | Heap + WASM memory over 60s of pan/zoom | Last 30% of samples: slope < 1 MB/min |
| **FPS benchmark** | Frame times on 5.5MB GeoJSON | avg >= 30 FPS (tighten to 60 over time) |

### Running

```bash
# First run: install Playwright browsers and build WASM
npm install
npm run build:wasm

# Create visual baselines (run once, or after intentional visual changes)
npm run test:e2e:update

# Run all e2e tests
npm run test:e2e

# Run specific tests
npm run test:e2e:visual   # Visual regression only
npm run test:e2e:soak     # Memory soak only
npm run test:e2e:fps      # FPS benchmark only
```

### What the Harness Gives Agents

Before this harness, agents iterated toward "tests pass in jsdom." After:
agents iterate toward "the map renders correctly in a real browser, at
acceptable FPS, without leaking memory." The screenshot diff gives them
eyes. The memory soak gives them a lie detector. The FPS benchmark gives
them a budget.

### Baseline Measurements (2026-07-04)

Measured in headless Chromium on the 5.5MB `arrondissements.geojson`
fixture. These are the **pre-fix baseline** — every architecture fix
must improve or not regress these numbers.

| Metric | Value | Test |
|---|---|---|
| **Visual regression** | 7/7 passing | Points, lines, polygons, geojson, canvas, two-maps A/B |
| **API surface honesty** | 4/4 passing | Map, TileLayer, GeoJSONLayer, Popup methods verified |
| **Instance isolation (JS level)** | 3/3 passing | Separate canvases, wrapper isolation, independent render |
| **GL resource balance** | 55 textures created, **0 deleted** | INV-2 confirmed: `deleteTexture` never called |
| **GL buffer balance** | 4 buffers created, **0 deleted** | INV-2 confirmed: `deleteBuffer` never called |
| **Avg FPS (pan/zoom)** | 3.0 FPS | 31 frames in 10s — per-frame R-tree rebuild + Lyon tessellation |
| **Idle frame wall-time** | 16.63 ms | Within 60fps budget in headless (INV-5 fix would drop this ~100×) |
| **Memory trend (60s soak)** | ~50-90 MB/min (variable) | Heap grows during pan/zoom, GC causes wild swings |
| **WASM memory** | untracked | `wasm_bindgen::memory()` not exposed — 5-line fix |

These confirm the architectural flaws listed in Section 2:
- **INV-1/INV-2 violation**: `TILE_TEXTURES` thread-local never calls `delete_texture` → GPU textures leak → browser GC chains → JS heap grows
- **INV-3 violation**: `Closure::forget()` on every tile load → closures accumulate → JS heap grows
- **INV-5 violation**: Per-frame spatial index rebuild → ~2 FPS instead of 60

Every architectural fix in Phase 2 addresses a specific number in this table.
Closure leak fixes directly reduce the 8.95 MB/min growth. R-tree fix
directly improves the 1.9 FPS average.

---

## 7. Migration Plan

### Phase 0: Foundation (YOU — ~1 week)

- [x] Write this document
- [x] Build the e2e test harness (Playwright + memory soak + FPS benchmark)
- [x] Capture initial baselines (screenshots, memory curve, FPS numbers)
- [x] Document the current broken state: what renders, what doesn't, what leaks

**Deliverable:** `ARCHITECTURE.md` + `e2e/` directory + baseline measurements.
These two things turn subagents from a liability into a workforce.

### Phase 1: Mechanical Decomposition (Agents — serial)

Split `lib.rs` into the module structure from Section 4. **Behavior-preserving.**
The e2e screenshots must stay identical before and after.

Rules for this phase:
- One module extraction per PR
- Each PR must pass e2e visual tests (screenshots unchanged)
- No logic changes — only moving code and adjusting imports
- Agent context: the target module + the current lib.rs section being moved

### Phase 2: Architecture Fixes (Agents — parallel)

One agent per module, addressing the invariants:

| Agent | Module | Task |
|---|---|---|
| A | `gl/resources.rs` | RAII wrappers for all GL objects (INV-2) |
| B | `tiles/cache.rs` | Move TILE_TEXTURES into TileCache, add delete_texture on eviction (INV-1, INV-2) |
| C | `tiles/mod.rs` | Store closures instead of forget() (INV-3) |
| D | `spatial/rtree.rs` | Dirty-flag rebuilds instead of per-frame (INV-5) |
| E | `layers/mod.rs` | LayerHandle return type (INV-6) |
| F | `error.rs` | Typed error enum, remove unwrap() (INV-4, INV-7) |
| G | `events.rs` | Closure storage instead of forget() (INV-3) |

Each PR must pass: e2e visual tests + memory soak (slope improved or flat) +
FPS benchmark (no regression).

### Phase 3: Features (Agents — parallel, same gate)

Vector tiles, mobile touch, Canvas2D fallback, etc. Same e2e gate.
Each feature gets its own fixture page and visual baseline.

---

## 8. Agent Guidelines

When assigning work to an AI subagent:

1. **Give them this document** as context. They must understand the invariants.
2. **Give them the specific module** they're working on, not the whole codebase.
3. **Give them the e2e test command** they must pass: `npm run test:e2e`
4. **Review the architecture**, not the syntax. If you can't explain the merged
   code, don't merge it.
5. **One invariant per PR.** Don't let an agent "fix everything" in one shot.
6. **Serial for structural changes** (Phase 1). Parallel for independent fixes
   (Phase 2). Never parallel on the same file.

### The Human Rule (AI-adjusted)

> You personally review and understand every merged line.
>
> The moment the codebase contains code you couldn't explain, you've
> recreated the conditions of the first failure — you'll hit a bug in
> code you don't know, feel like a stranger in your own repo, and quit
> again.

---

## 9. Adoption Strategy

The engine competes with MapLibre GL's decade of maturity. Agents can't
make anyone use it. The strategy:

1. **Niche-first demo:** "Fastest massive-point-and-polygon rendering of
   real French open data." The 5.5MB arrondissements file is the benchmark.
2. **Blog post:** Performance comparison vs. MapLibre on the same dataset.
3. **The engine is the long game.** The narrow story is the wedge.

The e2e harness produces the numbers for the blog post. The architecture
fixes produce the engine that can back up the claims.
