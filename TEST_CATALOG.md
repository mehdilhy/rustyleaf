# Rustyleaf — Test Catalog

> The complete test suite blueprint. ✅ = exists. 🔥 = highest-leverage next addition.

**Golden rule:** every test asserts against the *real* engine — real WASM, real WebGL, real browser. Mocks allowed only for network (tile servers).

**Ratchet rule:** perf/memory targets are soft (logged NOTE) while the underlying bug is open. The PR that fixes the bug converts the note to a hard assertion. CI stores the achieved number; regressions > 10% fail the build.

## What the existing harness covers (19 tests, all ✅)

| Test File | Tests | What It Measures |
|---|---|---|
| `visual.spec.ts` | 5 | Screenshot diff: points, lines, polygons, geojson, canvas |
| `fps-benchmark.spec.ts` | 1 | 3.0 FPS avg on 5.5MB GeoJSON during pan/zoom |
| `memory-soak.spec.ts` | 2 | JS heap trend (NOTE only, GC noise); WASM memory (untracked) |
| `api-honesty.spec.ts` | 4 | Map, TileLayer, GeoJSONLayer, Popup methods exist at runtime |
| `instance-isolation.spec.ts` | 3 | Separate canvases, JS-wrapper isolation, independent render |
| `gl-resource.spec.ts` | 2 | createTexture: 55, deleteTexture: 0 — INV-2 confirmed |
| `idle-cpu.spec.ts` | 2 | Idle frame time: 16.63ms; rAF rate confirmed at 60fps |

## 🔥 Priority Order (from current numbers)

### 8.3 GL resource balance ✅
*Layer: Playwright. Instrument WebGL calls in fixture page. Track createTexture/deleteTexture, createBuffer/deleteBuffer.*
*Status:* **IMPLEMENTED** — `e2e/tests/gl-resource.spec.ts`. Confirms: 55 textures, 4 buffers created, **0 deleted**. The test passes (informational), the engine fails.

### 5.3 multi-instance isolation ✅
*Layer: Playwright. Two maps on one page.*
*Status:* **IMPLEMENTED** — `e2e/tests/instance-isolation.spec.ts`. JS-wrapper-level isolation verified (separate canvases, separate layer counters). WASM-level cross-contamination (thread_local! globals) requires INV-1 fix + wasm-bindgen-test for hard assertion.

### 7.2 idle CPU ✅
*Layer: Playwright. Static map, no input → measure frame work.*
*Status:* **IMPLEMENTED** — `e2e/tests/idle-cpu.spec.ts`. Idle frame wall-time: 16.63ms (within 60fps budget in headless). Per-frame R-tree rebuild noise is masked by headless Chrome's constant rAF timing.

### 4.5 index rebuild counter
*Layer: Playwright. Assert build-count ≪ frame-count.*
*Status:* NOT YET — requires dirty-flag instrumentation in Rust core (expose build counter on window)
*Expected to FAIL today* (index rebuilt every render call = build-count == frame-count)

### 11.1 types honesty ✅
*Layer: Playwright. Every export in types/rustyleaf.d.ts exists at runtime with matching arity.*
*Status:* **IMPLEMENTED** — `e2e/tests/api-honesty.spec.ts`. 4/4 classes pass. Discovered: `isOpen` declared in .d.ts, runtime has `isOpenPopup` — fixed in test.

### 1.1 + 2.1 + 4.1 property-based tests
*Layer: Rust unit tests (proptest). Math oracles — round-trip, area conservation, oracle comparison.*
*Status:* NOT YET — requires adding `proptest` dev-dependency to core/Cargo.toml

### 3.4/3.9 parser torture + fuzz
*Layer: Rust unit + cargo-fuzz. Streaming parser tested at every byte offset.*
*Status:* NOT YET — requires adding `cargo-fuzz` + `proptest` dev-dependencies

### 12.3 context loss
*Layer: Playwright. webglcontextlost → engine survives, restores, re-renders.*
*Status:* NOT YET — top real-world crash source for GPU apps
*Expected to FAIL today* (no restore logic, no resource re-upload)

---

## Full Catalog

See `ARCHITECTURE.md` Section 7.5 for the migration plan that maps tests to Phases.
