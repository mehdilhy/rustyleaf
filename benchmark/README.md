# Rustyleaf benchmark

An interactive, reproducible benchmark comparing **point-rendering throughput**
of Rustyleaf against [Leaflet](https://leafletjs.com/) (canvas renderer) and
[MapLibre GL JS](https://maplibre.org/).

Open [`index.html`](index.html) (served over HTTP, so the WASM can load) and
click **Run all** or **Full sweep**. Leaflet and MapLibre load from CDN;
Rustyleaf loads from `../dist/`, so run `npm run build` first.

```bash
npm run build
node e2e/serve.mjs          # serves the repo at http://localhost:3333
# open http://localhost:3333/benchmark/
```

## What it measures

Rendering throughput only — **not** features, ecosystem, plugins, or vector
tiles, where MapLibre and Leaflet are far more mature. See the on-page
methodology for the full setup. In short: identical seeded point sets, no
basemap, 800×500 viewport, a scripted continuous pan at zoom 11, 1s warmup +
5s measurement, FPS = 1000 / mean(frame interval).

Because `requestAnimationFrame` is capped at the display refresh rate (usually
60), libraries that comfortably hold 60 tie on average FPS and separate on
**setup time**, **p95 / worst frame time**, and **whether they survive at all**
at high counts.

## Results snapshot

Measured on the author's machine — **Windows, Chrome 149, discrete GPU**,
2026-07-05. Numbers are hardware-specific; run it yourself.

| Points | Rustyleaf | Leaflet (canvas) | MapLibre GL |
|--------|-----------|------------------|-------------|
| 10,000 | 60 fps · setup 70 ms | 60 fps · 13 ms | 60 fps · 365 ms |
| 100,000 | 60 fps · 304 ms | 20 fps · 124 ms | 60 fps · 820 ms |
| 500,000 | 60 fps · **1.4 s** | 4 fps · 2.9 s | 60 fps · 4.3 s |
| 1,000,000 | 60 fps · **2.9 s** | 1.6 fps · 12.8 s | **crashed (OOM)** |

(FPS = average during scripted pan; setup = time to build the layer and first
render. MapLibre reliably ran the tab out of memory at 1M points in this
environment while building its GeoJSON source; it may succeed on machines with
more RAM but is memory-heavy at that scale.)

### Honest read

- **vs Leaflet:** Rustyleaf is dramatically faster past ~10k points — 3× at
  100k, ~15× at 500k, ~37× at 1M. This is the core pitch: the Leaflet-style
  API without Leaflet's DOM/canvas ceiling.
- **vs MapLibre:** the two now **tie on render FPS** (both pinned at the 60 fps
  rAF cap at every count MapLibre survives). Rustyleaf's edge is elsewhere:
  **~3× faster layer setup** (500k: 1.4 s vs 4.3 s) and it **keeps rendering at
  1M points** where MapLibre OOM'd here. Frame-time headroom is comparable
  (worst frames ~20 ms vs ~30 ms at 500k).
- We do **not** claim to out-render MapLibre — it is a mature, full-featured
  engine and this benchmark only exercises flat point rendering. The honest
  summary is *"matches MapLibre on point-rendering throughput, sets up faster,
  and degrades more gracefully at extreme counts."*

### Before the GPU-resident optimization

For context, before points were made GPU-resident (v0.0.1 dev, points were
re-projected on the CPU and re-uploaded every frame):

| Points | Rustyleaf before | Rustyleaf after |
|--------|------------------|-----------------|
| 100,000 | 52.6 fps | 60 fps |
| 500,000 | 20.4 fps | 60 fps |
| 1,000,000 | 11.1 fps | 60 fps |

The fix: upload each layer's points to the GPU once as zoom-independent
normalized-mercator coordinates and project them in the vertex shader via
`u_origin` / `u_world_scale` uniforms (the same model MapLibre uses), so
panning and zooming touch no vertex data on the CPU.

## Caveats / fairness notes

- **Leaflet** uses `L.canvas()` + `L.circleMarker` — the fastest *honest*
  Leaflet approach (SVG is slower). Markers are inserted in async chunks with a
  25 s setup budget; beyond that a run is recorded as a setup timeout.
- **MapLibre** uses a GeoJSON source + a `circle` layer on a blank style.
- **Rustyleaf** uses `PointLayer.add()`.
- All three render filled 3px circles, same color, no stroke, no basemap.
- Coordinate precision: Rustyleaf stores normalized f32 coords, which are
  accurate at the tested zooms but lose precision at very high zoom (z≈18+) —
  the same limitation the line/polygon layers have today. Tile-local
  coordinates are future work.

Use **Export JSON** on the page to save a full run (including your user agent)
for the record.
