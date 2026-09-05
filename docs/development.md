# Development

How to build, test, and contribute to Rustyleaf, plus the roadmap.

## Prerequisites

- **Rust** (stable) with the `wasm32-unknown-unknown` target
- **wasm-pack** — `cargo install wasm-pack`
- **Node.js** 18+

## Setup

```bash
git clone https://github.com/mehdilhy/rustyleaf.git
cd rustyleaf
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm install
```

## Build & test

```bash
npm run build          # wasm-pack + webpack production build
npm test               # Jest unit + parity tests (823 tests)
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
cargo clippy --manifest-path core/Cargo.toml --target wasm32-unknown-unknown -- -D warnings

npm run setup:e2e     # one-time: install Playwright Chromium
npm run test:e2e      # visual regression, GL leak detection, memory soak, FPS, kitchen sink
```

The e2e suite is the interesting part: screenshot-based visual regression, WebGL
resource-leak detection, multi-instance isolation, idle-CPU checks, a memory
soak test, and a kitchen-sink stress test (`e2e/tests/kitchen-sink.spec.ts`)
that puts every public feature — markers, shapes, groups, controls, overlays,
WMS/grid tiles, GeoJSON with `onEachFeature`, keyboard/touch/box-zoom input, and
a 1,000,000-point layer — on one map and asserts both correctness and fps under
combined load, all run in CI.

## Project layout

| Path | Purpose |
| --- | --- |
| `core/` | Rust/WASM crate (projection, tiles, spatial, events, input, layers, gl, render) |
| `src/` | JS/TS wrapper (`rustyleaf-api.js`) over the wasm core |
| `types/rustyleaf.d.ts` | Hand-trimmed, accurate TypeScript definitions |
| `demo/` | Live demo pages |
| `benchmark/` | Reproducible perf harness |
| `e2e/` | Playwright test suite |
| `tests/` | Jest unit tests |

## Contributing

Contributions are very welcome — the project is young enough that a single PR
can meaningfully shape it.

1. Fork and clone; add upstream: `git remote add upstream https://github.com/mehdilhy/rustyleaf.git`
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes with tests; follow code style:
   - **Rust:** `cargo fmt`, `cargo clippy` clean
   - **JS/TS:** ESLint + Prettier, JSDoc on public APIs
4. Verify locally: `npm run lint && npm run typecheck && npm test`
5. Commit with clear messages, push to your fork, open a PR.

See [CONTRIBUTING.md](https://github.com/mehdilhy/rustyleaf/blob/main/CONTRIBUTING.md)
and issues labeled `good first issue`.

## Roadmap

The guiding thesis: **keep the Leaflet-style API, scale to datasets that
DOM-based maps can't handle.** Performance claims ship only with reproducible
benchmarks.

### 0.0.x — credibility (current)

- [x] Deterministic GL resource cleanup (RAII wrappers, leak-detection e2e)
- [x] Single WASM instantiation in every load path
- [x] All layer types render independently (u_matrix fix)
- [x] Green CI: clippy `-D warnings`, unit + parity tests, e2e suite
- [x] Published benchmark: Rustyleaf vs Leaflet vs MapLibre GL
- [x] GPU-resident point layers — 60fps at 1M points
- [ ] GitHub Pages demo + benchmark deployed from CI

### 0.1.0 — performance that backs the pitch

- [x] GPU-resident point layers
- [x] GPU-cached line/polygon layers (buffers freed on `remove()`)
- [ ] Raise the FPS ratchet in `e2e/tests/00-fps-benchmark.spec.ts` as fixes land
- [ ] `wasm-opt` in the release pipeline; target < 1 MB raw WASM
- [ ] Replace the regex streaming GeoJSON parser with an incremental parser

### 0.2.0 — API completeness

- [x] `layer.remove()` frees the layer's GPU buffers (`layer.setData()` still open)
- [x] Touch/mobile gestures (pan, pinch zoom, double-tap zoom, long-press context menu)
- [ ] Layer z-ordering
- [ ] Thick lines via triangle strips (`width` finally honored everywhere)
- [ ] Keyboard events wired from the Rust core
- [x] Touch/mobile gestures (pan, pinch zoom, double-tap zoom, long-press context menu)
- [ ] Marker icons / image sprites for points

### Later / help wanted

- [ ] Vector tile (MVT) support
- [ ] Canvas2D fallback renderer for non-WebGL2 environments
- [ ] Plugin interface compatible with common Leaflet plugin patterns
- [ ] Worker-thread parsing for huge GeoJSON files

## License

Rustyleaf is [MIT](https://github.com/mehdilhy/rustyleaf/blob/main/LICENSE).
By contributing, you agree your contributions are licensed under MIT.
