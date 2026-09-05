# FAQ & Limitations

Rustyleaf is a **compatibility preview (v0.0.8)**. The API is still evolving
until 0.1.0. This page collects the current gaps and gotchas in one place.

## Does it require WebGL2?

Yes. There is **no Canvas2D or WebGL1 fallback**. Detection exists
(`Map.checkWebGLSupport()` / `map.getWebGLSupport()`), but rendering does not.
Anything without WebGL2 is unsupported.

## Which coordinate systems are supported?

**Spherical Mercator only** (EPSG:3857). No custom CRS (EPSG:4326/3395,
`SimpleCRS`). Latitude does not wrap at the poles.

## Why don't my GeoJSON lines honor `width`?

Line width is honored for `LineLayer`, but **GeoJSON-styled lines still render
at 1px**. GPU-resident line width for GeoJSON is on the roadmap.

## Why don't my polygon clicks register?

Polygon **interiors aren't hit-testable in GeoJSON layers yet** — only their
outline (via the cached outline line) is. `PointLayer` / `LineLayer` /
`PolygonLayer` (non-GeoJSON) hit-test normally. Triangulated polygon geometry
has no per-feature metadata attached yet.

## How does `layer.remove()` handle GPU memory?

`remove()` releases the layer's GPU buffers (the JS-side data stays, so
`addTo()` re-uploads and re-shows it). `map.destroy()` frees everything else.

## Why do I get a re-entrancy error inside an event callback?

Calling map methods **synchronously** inside a raw wasm event callback
(`move`, `zoom`, `click`, …) throws a re-entrancy error. **Defer with
`queueMicrotask`** — the built-in layers already do this.

## What touch gestures are supported?

Touch covers **one-finger pan with momentum, two-finger pinch zoom,
double-tap zoom, and long-press for the context menu**.

## The streaming GeoJSON parser misbehaves

The streaming parser is **regex-assisted** and can misbehave on exotic input
(e.g. unusual whitespace, nested structures). A proper incremental parser is on
the roadmap.

## Large line/polygon scenes are slower than points

Line and polygon layers now keep their vertex data in GPU caches too, but heavy
combined scenes (thousands of lines/polygons alongside a large point layer)
still cost more than points alone.

## Is this a drop-in Leaflet replacement?

Not yet. The API is deliberately Leaflet-*shaped* and TDD'd against the real
runtime, but many Leaflet features (vector tiles, custom CRS, Canvas fallback,
full plugin ecosystem) are missing or planned. Treat it as a high-performance
complement for point/geometry-heavy maps.

## How do I report a bug or request a feature?

Use the [issue tracker](https://github.com/mehdilhy/rustyleaf/issues). For bugs,
include minimal reproduction steps, environment info, and any error messages.
