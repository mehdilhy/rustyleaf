# Performance

Rustyleaf's pitch is simple: **keep the Leaflet API, render datasets that DOM
maps can't.** The benchmark is reproducible and ships in the repo — these
numbers are not marketing.

## The headline number

Point rendering is **GPU-resident**: geometry is uploaded once as
zoom-independent normalized-mercator coordinates and projected in the vertex
shader (`u_origin` / `u_world_scale`), instead of re-projecting and
re-uploading every point on the CPU each frame.

**1,000,000 points render at a locked 60fps** (was ~11fps before the GPU-resident
change).

## How it compares

Measured on the in-repo benchmark harness (same data, same hardware; your
numbers will vary):

| Scenario | Rustyleaf | Leaflet (canvas) | MapLibre GL |
| --- | --- | --- | --- |
| 100k points | 60fps | ~3× slower | ties |
| 1M points | 60fps | ~37× slower | ran out of memory* |

\* In the test environment MapLibre GL exhausted memory at 1M points. Rustyleaf
still rendered. Rustyleaf ties MapLibre on render FPS while setting up ~3×
faster.

> This measures **point-rendering throughput only**, not features or ecosystem,
> where Leaflet and MapLibre are far more mature. Run the benchmark yourself
> before drawing conclusions for your workload.

## The fragment-work budget

A naive GPU point layer issues a blended fragment write for *every* point, every
frame. Pan a 1M-point dataset out to a world view and the on-screen footprint
collapses to a few pixels — yet every point still draws, serializing the
raster-operation stage into single-digit fps.

Rustyleaf caps total per-frame fragment work to a budget derived from a layer's
on-screen footprint:

- Once a layer's screen area is small, only a **bounded, deterministically-shuffled
  sample** of its (pre-uploaded, unmodified) vertex buffer is drawn — a *fair
  random subset*, not a truncation.
- At full-viewport coverage the budget exceeds the point count, so **every point
  draws**.
- Result: zoomed out, 1M points now render at 60fps (previously the slowest
  view).

## Line/polygon residency

Line and polygon layers also keep their vertex data in per-layer GPU caches
(uploaded once, reused across frames). Heavy combined scenes (thousands of
lines/polygons alongside a large point layer) still cost more than points
alone.

## Bundle size

| Artifact | Raw | Gzipped |
| --- | --- | --- |
| WASM core | 1.5 MB | ~500 KB |
| JS wrapper | 55 KB | 18 KB |

Reducing WASM size (currently `opt-level = "z"` + LTO; `wasm-opt` pending) is an
active work item.

## Reproduce it

```bash
npm run build
node e2e/serve.mjs          # serves the demo + benchmark
# open http://localhost:3333/benchmark/
```

The benchmark harness and methodology live in
[`benchmark/`](https://github.com/mehdilhy/rustyleaf/tree/main/benchmark).
