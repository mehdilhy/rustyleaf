# SPATIAL_INDEX_REFACTOR.md — Fix 1: Geographic-Coordinate R-Tree

> **Hand this to a Phase 2 agent.** The agent must:
> 1. Read `ARCHITECTURE.md` invariants first
> 2. Make these exact changes
> 3. Verify: `npm run test:e2e:visual` passes (screenshots identical)
> 4. Verify: `npm run test:e2e:fps` improves FPS by ≥2× (from 3.0 → ≥6.0)
> 5. Do NOT touch anything outside the files listed below

## Problem

Every frame, `update_spatial_index()` rebuilds the entire R-tree from scratch
using SCREEN coordinates (`lib.rs:906` called from `render()`). This is an
O(N log N) operation 60× per second. The index exists only for hit-testing,
which fires at most a few times per second on click. The per-frame rebuild
is the #1 cause of the 3.0 FPS on a 5.5MB GeoJSON file.

Additionally, the index lives in a `thread_local!` global (`lib.rs:85`),
violating INV-1 (all state must live inside `RustyleafMap`).

## Root Cause Trace

```
render()                          lib.rs:871
  → update_spatial_index()        lib.rs:906  ← called EVERY FRAME
    → iterates all point layers   lib.rs:3301
    → iterates all line layers    lib.rs:3329
    → lat_lng_to_screen()         lib.rs:1268  ← per-feature projection
    → AABB::from_corners()         lib.rs:3307  ← 3px tolerance in screen space
    → SPATIAL_INDEX = new_index   lib.rs:3369  ← replaces thread_local

hit_test(x, y)                   lib.rs:3374
  → AABB in screen space          lib.rs:3378  ← 3px radius
  → SPATIAL_INDEX query           lib.rs:3382
```

The index stores screen-space AABBs, so it MUST be rebuilt on every pan/zoom.
The fix: store geographic-coordinate AABBs and convert query points.

## Changes (6 files, ~200 lines total)

### 1. `core/src/lib.rs` — Remove per-frame rebuild

**Line 906-906:** Delete `self.update_spatial_index();` from `render()`.

```rust
// BEFORE (line 903-906):
        context.viewport(0, 0, self.width as i32, self.height as i32);
        self.update_spatial_index();
        self.render_tiles(&context)?;

// AFTER:
        context.viewport(0, 0, self.width as i32, self.height as i32);
        self.render_tiles(&context)?;
```

### 2. Add fields to `RustyleafMap`

Add after `polygon_layers: Vec<PolygonLayer>,` (approximately line 323):

```rust
    spatial_index: RTree<SpatialFeature>,
    spatial_index_dirty: bool,
```

### 3. Initialize new fields in `RustyleafMap::new()`

After `polygon_layers: Vec::new(),`:

```rust
            spatial_index: RTree::new(),
            spatial_index_dirty: true,
```

### 4. Rewrite `update_spatial_index()`

The new version builds the index in geographic [lng, lat] coordinates.
The tolerance in degrees (0.001° ≈ 111m) is independent of zoom level and
provides ~0.4px precision at zoom 18.

Replace the entire function body (lines 3296-3372):

```rust
    fn rebuild_spatial_index(&mut self) {
        if !self.spatial_index_dirty {
            return;
        }

        let mut new_index = RTree::new();
        let mut feature_id = 0;
        let tolerance = 0.001; // degrees — zoom-independent, ~111m at equator

        // Add point features
        for (layer_idx, layer) in self.point_layers.iter().enumerate() {
            for (point_idx, point) in layer.points.iter().enumerate() {
                let (lng, lat) = (point.lng, point.lat);
                let bounds = AABB::from_corners(
                    [lng - tolerance, lat - tolerance],
                    [lng + tolerance, lat + tolerance]
                );
                let mut meta = serde_json::json!({});
                meta["layer_type"] = "point".into();
                meta["layer_index"] = layer_idx.into();
                meta["feature_index"] = point_idx.into();
                meta["original_meta"] = point.meta.clone();
                new_index.insert(SpatialFeature { id: feature_id, bounds, meta });
                feature_id += 1;
            }
        }

        // Add line segment features
        for (layer_idx, layer) in self.line_layers.iter().enumerate() {
            for (line_idx, line) in layer.lines.iter().enumerate() {
                for i in 0..line.points.len().saturating_sub(1) {
                    let start = line.points[i];
                    let end = line.points[i + 1];
                    let min_x = start[1].min(end[1]) - tolerance;
                    let max_x = start[1].max(end[1]) + tolerance;
                    let min_y = start[0].min(end[0]) - tolerance;
                    let max_y = start[0].max(end[0]) + tolerance;
                    let bounds = AABB::from_corners([min_x, min_y], [max_x, max_y]);
                    let mut meta = serde_json::json!({});
                    meta["layer_type"] = "line".into();
                    meta["layer_index"] = layer_idx.into();
                    meta["feature_index"] = line_idx.into();
                    meta["segment_index"] = i.into();
                    meta["original_meta"] = line.meta.clone();
                    new_index.insert(SpatialFeature { id: feature_id, bounds, meta });
                    feature_id += 1;
                }
            }
        }

        // Add polygon features (as centroid-based hits for now)
        for (layer_idx, layer) in self.polygon_layers.iter().enumerate() {
            for (poly_idx, poly) in layer.polygons.iter().enumerate() {
                if let Some(ring) = poly.rings.first() {
                    if ring.len() >= 3 {
                        let (sum_lat, sum_lng) = ring.iter()
                            .fold((0.0, 0.0), |(sy, sx), p| (sy + p[0], sx + p[1]));
                        let n = ring.len() as f64;
                        let (lat, lng) = (sum_lat / n, sum_lng / n);
                        let bounds = AABB::from_corners(
                            [lng - tolerance, lat - tolerance],
                            [lng + tolerance, lat + tolerance]
                        );
                        let mut meta = serde_json::json!({});
                        meta["layer_type"] = "polygon".into();
                        meta["layer_index"] = layer_idx.into();
                        meta["feature_index"] = poly_idx.into();
                        meta["original_meta"] = poly.meta.clone();
                        new_index.insert(SpatialFeature { id: feature_id, bounds, meta });
                        feature_id += 1;
                    }
                }
            }
        }

        self.spatial_index = new_index;
        self.spatial_index_dirty = false;
    }
```

### 5. Rewrite `hit_test()`

Replace the function body (lines 3374-3389). Convert screen click → latlng,
then query in geographic space.

```rust
    fn hit_test(&self, x: f64, y: f64) -> Option<serde_json::Value> {
        let tolerance = 0.001; // degrees
        let point_array = Array::new();
        point_array.push(&JsValue::from_f64(x));
        point_array.push(&JsValue::from_f64(y));
        let latlng = self.unproject(&point_array);
        if latlng.length() != 2 {
            return None;
        }
        let lat = latlng.get(0).as_f64().unwrap_or(0.0);
        let lng = latlng.get(1).as_f64().unwrap_or(0.0);

        let search_bounds = AABB::from_corners(
            [lng - tolerance, lat - tolerance],
            [lng + tolerance, lat + tolerance]
        );

        let results: Vec<SpatialFeature> = self.spatial_index
            .locate_in_envelope(&search_bounds)
            .cloned()
            .collect();

        for feature in results {
            return Some(feature.meta.clone());
        }
        None
    }
```

### 6. Mark index dirty on data change

Add `self.spatial_index_dirty = true;` to every layer mutation method.
Find and modify these methods:

- `add_points()` (around line 1989): after `layer.points.extend(new_points);`
- `add_lines()` (around line 2035): after `layer.lines.extend(new_lines);`
- `add_polygons()` (around line 2095): after `layer.polygons.extend(new_polygons);`
- `load_geojson()` (around line 2166): after the features are parsed and added to the geojson layer
- `clear_geojson_layer()` (around line 2247): after clearing data

Each insertion: `self.spatial_index_dirty = true;`

### 7. Rebuild index on first hit-test after dirty

In `handle_mouse_up()`, before calling `hit_test()`:

```rust
// Rebuild spatial index if dirty (data changed)
if self.spatial_index_dirty {
    self.rebuild_spatial_index();
}
if let Some(hit_info) = self.hit_test(canvas_x, canvas_y) {
```

### 8. Remove thread_local! SPATIAL_INDEX

**Lines 83-86:** Remove the `SPATIAL_INDEX` from `thread_local!`:

```rust
// BEFORE:
thread_local! {
    static TILE_TEXTURES: RefCell<HashMap<String, WebGlTexture>> = RefCell::new(HashMap::new());
    static SPATIAL_INDEX: RefCell<RTree<SpatialFeature>> = RefCell::new(RTree::new());
}

// AFTER:
thread_local! {
    static TILE_TEXTURES: RefCell<HashMap<String, WebGlTexture>> = RefCell::new(HashMap::new());
}
```

### 9. Remove old `update_spatial_index` signature

The old function on line 3296 should be renamed/removed. The agent should
either rename it to `rebuild_spatial_index` (if keeping the same location)
or delete it and place the new version nearby.

### 10. Update Rust tests

The `core/src/tests.rs` uses a `Map` struct mirror. If the tests reference
`SPATIAL_INDEX` or the old signature, update them to match.

## Verification

```bash
# Must pass — screenshots identical to before (no visual change)
npm run test:e2e:visual

# Must FPS improve by ≥2× (from 3.0 FPS → ≥6.0 FPS)
npm run test:e2e:fps

# After confirming improvement, update the FPS ratchet floor:
# In e2e/tests/fps-benchmark.spec.ts, change FPS_MINIMUM from 3 to 6
```

## What NOT to touch

- Do NOT modify `render_tiles()`, `render_points()`, `render_lines()`, `render_polygons()`, `render_geojson()`
- Do NOT modify the `Tile` struct, `TileCoord`, or any tile-related code
- Do NOT modify the WASM-bindgen public API (method signatures must stay identical)
- Do NOT modify any JS/TypeScript files
- Do NOT introduce new dependencies to `Cargo.toml`

## Agent Checklist

- [ ] `update_spatial_index()` line removed from `render()`
- [ ] `spatial_index` and `spatial_index_dirty` fields added to `RustyleafMap`
- [ ] `rebuild_spatial_index()` uses geographic [lng, lat] coordinates
- [ ] `hit_test()` converts screen click → latlng, queries in geographic space
- [ ] `SPATIAL_INDEX` removed from `thread_local!`
- [ ] All `add_*` methods set `spatial_index_dirty = true`
- [ ] `handle_mouse_up()` calls `rebuild_spatial_index()` if dirty
- [ ] `cargo build --target wasm32-unknown-unknown` succeeds
- [ ] `wasm-pack build --target bundler --release --out-dir ../dist` succeeds
- [ ] `npm run test:e2e:visual` — 7/7 pass
- [ ] `npm run test:e2e:fps` — FPS ≥ 6.0
