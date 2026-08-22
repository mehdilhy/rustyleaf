# Rustyleaf Roadmap

The guiding thesis: **keep the Leaflet-style API, scale to datasets that
DOM-based maps can't handle.** Performance claims ship only with reproducible
benchmarks.

## 0.0.x — credibility (current)

- [x] Deterministic GL resource cleanup (RAII wrappers, leak-detection e2e)
- [x] Single WASM instantiation in every load path
- [x] All layer types render independently (u_matrix fix)
- [x] Green CI: clippy `-D warnings`, 405 unit tests, e2e suite
- [x] Published benchmark page: Rustyleaf vs Leaflet vs MapLibre GL, same data,
      same hardware, methodology + code in-repo ([`benchmark/`](benchmark/))
- [x] GPU-resident point layers — 60fps at 1M points (see benchmark)
- [ ] GitHub Pages demo + benchmark deployed from CI (workflow added; enable Pages)

## 0.1.0 — performance that backs the pitch

- [x] **GPU-resident point layers** — upload once, project in the vertex
      shader. 1M points now render at a locked 60fps (was 11fps).
- [x] Same treatment for standalone line/polygon layers — GPU-cached with
      per-layer buffers freed on `remove()` (points and GeoJSON layers cache too)
- [ ] Raise the FPS ratchet in `e2e/tests/00-fps-benchmark.spec.ts` as each
      fix lands (4 → 20 → 40 → 50)
- [ ] `wasm-opt` in the release pipeline; target < 1 MB raw WASM
- [ ] Replace the regex streaming GeoJSON parser with an incremental parser

## 0.2.0 — API completeness

- [x] `layer.remove()` frees the layer's GPU buffers (`layer.setData()` /
      true data detach still open)
- [x] Touch/mobile gestures (pan, pinch zoom, double-tap zoom, long-press
      context menu)
- [ ] Layer z-ordering
- [ ] Thick lines via triangle strips (`width` finally honored)
- [ ] Keyboard events wired from the Rust core (`keydown`/`keyup` currently
      registered but never triggered)
- [x] Touch/mobile gestures (pan, pinch zoom, double-tap zoom, long-press
      context menu)
- [ ] Marker icons / image sprites for points

## Later / help wanted

- [ ] Vector tile (MVT) support
- [ ] Canvas2D fallback renderer for non-WebGL2 environments
- [ ] Plugin interface compatible with common Leaflet plugin patterns
- [ ] Worker-thread parsing for huge GeoJSON files

Issues labeled `good first issue` are cut from this list — see the issue
tracker.
