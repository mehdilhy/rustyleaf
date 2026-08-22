# Issue drafts for launch

Paste these into GitHub Issues before announcing 0.0.1. Suggested labels are in
brackets. Delete this file once the issues exist.

---

## 1. Honor `line.width` using triangle-strip lines [enhancement]

WebGL2 `lineWidth` is effectively fixed at 1.0, so `LineFeature.width` is
stored but never applied (`core/src/layers/line.rs`). Implement thick lines by
expanding each segment into a triangle strip (two triangles per segment) in
`core/src/render/lines.rs`. Milestone: 0.2.0.

## 2. Enforce TileLayer min/max zoom during tile loading [good first issue]

`TileLayer.max_zoom` / `min_zoom` exist in `core/src/tiles.rs` but are never
consulted (`#[allow(dead_code)]` marks the spot). Clamp the tile-request zoom
in `TileLoader::load_visible_tiles` and stop requesting tiles beyond the
layer's range.

## 3. Trigger keyboard events from the core [good first issue]

`EventSystem` has `keydown`/`keyup` callback registration and the JS API maps
the events, but nothing in the Rust core ever fires them. Wire
`on_key_down` / `on_key_up` (see `core/src/lib.rs` input handlers) to
`trigger_event(&self.events.keydown_callbacks, ...)` with a Leaflet-style
event object.

## 4. `layer.remove()` should actually remove the layer [enhancement]

All layer types have a `remove()` stub that returns `this` without detaching
anything. Needs a WASM-side `remove_*_layer(index)` plus index bookkeeping in
the JS wrapper (indices shift or need tombstones — design first, small RFC in
the issue thread welcome).

## 5. `PointLayer.setData()` to replace points without stacking layers [enhancement]

Today the only way to replace a layer's points is reaching into
`map.wasmMap.add_points(index, pts)` (see `demo/index.html` for the
workaround). Expose a proper `setData(points)` on `PointLayer` (and the other
layer types) that replaces the WASM layer's contents in place.

## 6. GPU-resident standalone line/polygon layers [performance]

Points are now GPU-resident (uploaded once, projected in the vertex shader —
1M points at 60fps). The standalone line and polygon render passes
(`core/src/render/lines.rs`, `render/polygons.rs`) still recompute screen
positions on the CPU and re-upload every frame. Apply the same pattern points
now use: upload normalized coords once, project via `u_origin`/`u_world_scale`,
re-upload only when the layer's data changes (a `gpu_dirty` flag). The point
layer (`layers/point.rs` + `render/points.rs`) is the reference implementation.

## 7. Replace regex-based streaming GeoJSON parser [enhancement]

`parse_geojson_chunk` in `core/src/lib.rs` extracts features from partial
JSON with a regex + brace counting. It breaks on exotic (deeply nested,
minified, escaped-brace) input. Replace with an incremental JSON parser or a
state machine over the byte stream.

## 8. Canvas2D fallback renderer [help wanted]

WebGL2-only today. Detection for WebGL1/none exists (`checkWebGLSupport`),
but there is no fallback rendering path. A minimal Canvas2D renderer (tiles +
points) would make the library usable in restricted environments. Large
effort; coordinate on the issue before starting.

## 9. Mobile touch gestures [enhancement]

No touch handling: pinch-zoom and touch-pan don't work. Needs `touchstart` /
`touchmove` / `touchend` listeners in the JS wrapper feeding the existing
pan/zoom/momentum plumbing.

## 10. Run `wasm-opt` in the release build [good first issue]

`core/Cargo.toml` sets `wasm-opt = false` (historic Windows workaround). The
WASM is 1.5 MB raw / ~500 KB gzip. Enable `wasm-opt -Oz` (via wasm-pack or a
CI step) and record the size delta in the PR.
