use std::collections::BTreeMap;
use std::sync::Arc;
use wasm_bindgen::JsValue;
use crate::layers::point::PointLayer;
use crate::layers::line::LineLayer;
use crate::layers::polygon::PolygonLayer;
use crate::layers::geojson::GeoJSONLayer;
use crate::projection::{Viewport, clamp_zoom};

/// Axis-aligned bounding box in [lng, lat] degrees.
///
/// Replaces rstar's `AABB`: hit-test queries are tiny cursor boxes and the
/// old code already linear-scanned every envelope-intersecting candidate, so
/// the R-tree only narrowed candidates — a uniform grid does that equally
/// well at a fraction of the binary size.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Bounds {
    pub(crate) min_lng: f64,
    pub(crate) min_lat: f64,
    pub(crate) max_lng: f64,
    pub(crate) max_lat: f64,
}

impl Bounds {
    /// Corners as [lng, lat] pairs (same argument shape the rstar call sites used).
    pub(crate) fn from_corners(min: [f64; 2], max: [f64; 2]) -> Bounds {
        Bounds {
            min_lng: min[0],
            min_lat: min[1],
            max_lng: max[0],
            max_lat: max[1],
        }
    }

    /// Inclusive intersection (touching counts as a hit), matching the old
    /// `locate_in_envelope_intersecting` semantics.
    fn intersects(&self, other: &Bounds) -> bool {
        self.min_lng <= other.max_lng
            && self.max_lng >= other.min_lng
            && self.min_lat <= other.max_lat
            && self.max_lat >= other.min_lat
    }
}

/// Uniform-grid spatial index for hit-testing.
///
/// Features are bucketed into 1° lat/lng cells (plus an always-scanned
/// overflow list for world-spanning envelopes such as antimeridian
/// polygons). Queries collect intersecting candidates, sort them by
/// insertion order, and run the same polygon-refinement logic as before, so
/// results are deterministic and stable across builds. Ties between several
/// matching features resolve to the earliest-added one; polygons still take
/// precedence over points/lines via the immediate-return refinement below.
pub(crate) struct SpatialIndex {
    features: Vec<SpatialFeature>,
    cells: BTreeMap<(i32, i32), Vec<usize>>,
    overflow: Vec<usize>,
}

/// Grid cell size in degrees.
const GRID_CELL_DEG: f64 = 1.0;
/// Features spanning more than this many cells live in the overflow list
/// instead of exploding the cell map (a full-world envelope is 64k cells).
const MAX_CELLS_PER_FEATURE: i64 = 512;

impl SpatialIndex {
    pub(crate) fn new() -> Self {
        SpatialIndex {
            features: Vec::new(),
            cells: BTreeMap::new(),
            overflow: Vec::new(),
        }
    }

    fn insert(&mut self, feature: SpatialFeature) {
        let idx = self.features.len();
        let b = &feature.bounds;
        let min_cx = (b.min_lng / GRID_CELL_DEG).floor() as i32;
        let max_cx = (b.max_lng / GRID_CELL_DEG).floor() as i32;
        let min_cy = (b.min_lat / GRID_CELL_DEG).floor() as i32;
        let max_cy = (b.max_lat / GRID_CELL_DEG).floor() as i32;
        // i64 math: saturating `as` casts on non-finite input cannot overflow here.
        let span =
            (max_cx as i64 - min_cx as i64 + 1) * (max_cy as i64 - min_cy as i64 + 1);
        if span > MAX_CELLS_PER_FEATURE || span <= 0 {
            self.overflow.push(idx);
        } else {
            for cx in min_cx..=max_cx {
                for cy in min_cy..=max_cy {
                    self.cells.entry((cx, cy)).or_default().push(idx);
                }
            }
        }
        self.features.push(feature);
    }

    /// Indices of features whose bounds intersect `q`, deduplicated and
    /// sorted by insertion order for deterministic dispatch.
    fn query_ids(&self, q: &Bounds) -> Vec<usize> {
        let mut ids: Vec<usize> = Vec::new();
        for &i in &self.overflow {
            if self.features[i].bounds.intersects(q) {
                ids.push(i);
            }
        }
        // Query boxes are cursor-sized (a few screen pixels); the ranges
        // below stay tiny. `hit_test` guards finiteness before calling.
        let min_cx = (q.min_lng / GRID_CELL_DEG).floor() as i32;
        let max_cx = (q.max_lng / GRID_CELL_DEG).floor() as i32;
        let min_cy = (q.min_lat / GRID_CELL_DEG).floor() as i32;
        let max_cy = (q.max_lat / GRID_CELL_DEG).floor() as i32;
        for cx in min_cx..=max_cx {
            for cy in min_cy..=max_cy {
                if let Some(bucket) = self.cells.get(&(cx, cy)) {
                    for &i in bucket {
                        if self.features[i].bounds.intersects(q) {
                            ids.push(i);
                        }
                    }
                }
            }
        }
        ids.sort_unstable();
        ids.dedup();
        ids
    }
}

/// One indexable unit (a point, a line segment, or a polygon bbox+ring).
///
/// The hit payload is stored as typed fields and only serialized when
/// a hit is actually returned. Every indexable shares its feature's
/// `original_meta` as a cheap JS handle — a Natural Earth-class dataset has
/// ~100k line segments per GeoJSON layer, and deep-cloning a 168-key
/// properties object per segment cost ~0.3GB of allocations and minutes of
/// main-thread time on the first hover.
#[derive(Clone, Debug)]
pub(crate) struct SpatialFeature {
    pub(crate) bounds: Bounds,
    pub(crate) layer_type: &'static str,
    pub(crate) layer_index: usize,
    pub(crate) feature_index: usize,
    // Present for line features: which segment of the line was indexed.
    pub(crate) segment_index: Option<usize>,
    // Shared, not cloned: the feature's own meta/properties object.
    pub(crate) original_meta: JsValue,
    // When present, the feature is an area (polygon): a cursor only "hits"
    // it when point-in-ring passes — not merely by touching its bbox.
    pub(crate) ring: Option<Arc<Vec<[f64; 2]>>>,
    // Interior holes (R-13): a hit requires in_outer && !in_any_hole.
    // `None` for points/lines and for hole-less polygons.
    pub(crate) holes: Option<Arc<Vec<Vec<[f64; 2]>>>>,
}

impl SpatialFeature {
    /// The hit payload consumed by the JS dispatcher — same shape as before:
    /// `{ layer_type, layer_index, feature_index[, segment_index], original_meta }`.
    /// Built as a live JS object (no serde); `original_meta` is snapshotted
    /// per hit so callers can mutate the payload without corrupting the
    /// indexed properties — same as the old per-hit clone.
    fn meta_json(&self) -> JsValue {
        let obj = js_sys::Object::new();
        let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("layer_type"), &JsValue::from_str(self.layer_type));
        let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("layer_index"), &JsValue::from_f64(self.layer_index as f64));
        let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("feature_index"), &JsValue::from_f64(self.feature_index as f64));
        if let Some(seg) = self.segment_index {
            let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("segment_index"), &JsValue::from_f64(seg as f64));
        }
        let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("original_meta"), &crate::snapshot_js_value(&self.original_meta));
        obj.into()
    }
}

/// Ray-casting point-in-polygon on the [lat, lng] plane.
fn point_in_ring(lat: f64, lng: f64, ring: &[[f64; 2]]) -> bool {
    let n = ring.len();
    if n < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let yi = ring[i][0];
        let xi = ring[i][1];
        let yj = ring[j][0];
        let xj = ring[j][1];
        let intersects = (yi > lat) != (yj > lat)
            && lng < (xj - xi) * (lat - yi) / (yj - yi + f64::EPSILON) + xi;
        if intersects {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Bounding box for a ring with antimeridian handling (R-14).
/// Returns (min_lat, max_lat, min_lng, max_lng). When `max_lng - min_lng > 180`
/// the ring crosses ±180°: the raw span would cover ~360° and pollute the
/// R-tree, so the envelope conservatively spans the full [-180, 180] longitude
/// range and hit-testing tries lng ± 360° shifts (see `hit_test`).
pub(crate) fn ring_bbox(ring: &[[f64; 2]]) -> (f64, f64, f64, f64) {
    let min_lat = ring.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
    let max_lat = ring.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
    let raw_min_lng = ring.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
    let raw_max_lng = ring.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
    if raw_max_lng - raw_min_lng > 180.0 {
        (min_lat, max_lat, -180.0, 180.0)
    } else {
        (min_lat, max_lat, raw_min_lng, raw_max_lng)
    }
}

/// Hole-aware point-in-polygon (R-13 + R-14): true when inside the outer ring
/// and not inside any hole. For antimeridian-crossing rings (envelope wider
/// than 180°) the lng-shifted equivalents are also tested.
fn point_in_polygon_with_holes(lat: f64, lng: f64, outer: &[[f64; 2]], holes: Option<&Vec<Vec<[f64; 2]>>>) -> bool {
    let crosses = {
        let raw_min = outer.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
        let raw_max = outer.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
        raw_max - raw_min > 180.0
    };
    let in_outer = if crosses {
        point_in_ring(lat, lng, outer)
            || point_in_ring(lat, lng + 360.0, outer)
            || point_in_ring(lat, lng - 360.0, outer)
    } else {
        point_in_ring(lat, lng, outer)
    };
    if !in_outer {
        return false;
    }
    if let Some(holes) = holes {
        for hole in holes {
            let in_hole = if crosses {
                point_in_ring(lat, lng, hole)
                    || point_in_ring(lat, lng + 360.0, hole)
                    || point_in_ring(lat, lng - 360.0, hole)
            } else {
                point_in_ring(lat, lng, hole)
            };
            if in_hole {
                return false;
            }
        }
    }
    true
}

#[allow(clippy::too_many_arguments)]
pub fn rebuild_spatial_index(
    point_layers: &[PointLayer],
    line_layers: &[LineLayer],
    polygon_layers: &[PolygonLayer],
    geojson_layers: &[GeoJSONLayer],
    index: &mut SpatialIndex,
    dirty: &mut bool,
) {
    if !*dirty {
        return;
    }

    let mut features: Vec<SpatialFeature> = Vec::new();
    let tolerance = 0.001; // degrees — ~111m at equator

    // Hidden layers are neither drawn nor hit-testable (issue #17).
    // Index point features
    for (layer_idx, layer) in point_layers.iter().enumerate() {
        if !layer.visible {
            continue;
        }
        for (point_idx, point) in layer.points.iter().enumerate() {
            let bounds = Bounds::from_corners(
                [point.lng - tolerance, point.lat - tolerance],
                [point.lng + tolerance, point.lat + tolerance]
            );

            features.push(SpatialFeature {
                bounds,
                layer_type: "point",
                layer_index: layer_idx,
                feature_index: point_idx,
                segment_index: None,
                original_meta: point.meta.clone(),
                ring: None,
                holes: None,
            });
        }
    }

    // Index line features (simplified - index line segments)
    for (layer_idx, layer) in line_layers.iter().enumerate() {
        if !layer.visible {
            continue;
        }
        for (line_idx, line) in layer.lines.iter().enumerate() {
            // One shared meta per line — segments must not deep-clone it.
            let meta = line.meta.clone();
            // Index each line segment with tolerance
            for i in 0..line.points.len().saturating_sub(1) {
                let start = line.points[i];
                let end = line.points[i + 1];

                let min_x = start[1].min(end[1]) - tolerance;
                let max_x = start[1].max(end[1]) + tolerance;
                let min_y = start[0].min(end[0]) - tolerance;
                let max_y = start[0].max(end[0]) + tolerance;

                let bounds = Bounds::from_corners([min_x, min_y], [max_x, max_y]);

                    features.push(SpatialFeature {
                    bounds,
                    layer_type: "line",
                    layer_index: layer_idx,
                    feature_index: line_idx,
                    segment_index: Some(i),
                    original_meta: meta.clone(),
                    ring: None,
                    holes: None,
                });
            }
        }
    }

    // Index polygon features: full bbox envelope plus the outer ring so
    // hit_test can run a point-in-polygon refinement (Leaflet-like interior
    // clicks) instead of the old centroid-only approximation.
    for (layer_idx, layer) in polygon_layers.iter().enumerate() {
        if !layer.visible {
            continue;
        }
        for (poly_idx, poly) in layer.polygons.iter().enumerate() {
            if let Some(ring) = poly.rings.first() {
                if ring.len() >= 3 {
                    let (min_lat, max_lat, min_lng, max_lng) = ring_bbox(ring);
                    let bounds = Bounds::from_corners(
                        [min_lng - tolerance, min_lat - tolerance],
                        [max_lng + tolerance, max_lat + tolerance]
                    );
                    let holes = if poly.rings.len() > 1 {
                        Some(Arc::new(poly.rings[1..].to_vec()))
                    } else {
                        None
                    };
                    features.push(SpatialFeature {
                        bounds,
                        layer_type: "polygon",
                        layer_index: layer_idx,
                        feature_index: poly_idx,
                        segment_index: None,
                        original_meta: poly.meta.clone(),
                        ring: Some(Arc::new(ring.clone())),
                        holes,
                    });
                }
            }
        }
    }

    // Index GeoJSON layer features (cached_points / cached_lines carry each
    // feature's `properties` as meta, including any injected `__rl_fid` from
    // onEachFeature). Polygons are only hit-testable via their outline —
    // cached_polygon_triangles has no per-feature metadata after
    // triangulation, so interior clicks don't hit-test yet.
    for (layer_idx, layer) in geojson_layers.iter().enumerate() {
        if !layer.visible {
            continue;
        }
        for (point_idx, point) in layer.cached_points.iter().enumerate() {
            let bounds = Bounds::from_corners(
                [point.lng - tolerance, point.lat - tolerance],
                [point.lng + tolerance, point.lat + tolerance]
            );
            features.push(SpatialFeature {
                bounds,
                layer_type: "geojson-point",
                layer_index: layer_idx,
                feature_index: point_idx,
                segment_index: None,
                original_meta: point.meta.clone(),
                ring: None,
                holes: None,
            });
        }

        for (line_idx, line) in layer.cached_lines.iter().enumerate() {
            // One shared meta per line feature — ~100k segments on a
            // world-class dataset each used to deep-clone the properties.
            let meta = line.meta.clone();
            for i in 0..line.points.len().saturating_sub(1) {
                let start = line.points[i];
                let end = line.points[i + 1];
                let min_x = start[1].min(end[1]) - tolerance;
                let max_x = start[1].max(end[1]) + tolerance;
                let min_y = start[0].min(end[0]) - tolerance;
                let max_y = start[0].max(end[0]) + tolerance;
                let bounds = Bounds::from_corners([min_x, min_y], [max_x, max_y]);
                features.push(SpatialFeature {
                    bounds,
                    layer_type: "geojson-line",
                    layer_index: layer_idx,
                    feature_index: line_idx,
                    segment_index: Some(i),
                    original_meta: meta.clone(),
                    ring: None,
                    holes: None,
                });
            }
        }

        // Polygon interiors: bbox envelope + point-in-ring refinement.
        for (poly_idx, hit) in layer.cached_polygon_hits.iter().enumerate() {
            if hit.outer_ring.len() < 3 {
                continue;
            }
            let (min_lat, max_lat, min_lng, max_lng) = ring_bbox(&hit.outer_ring);
            let bounds = Bounds::from_corners(
                [min_lng - tolerance, min_lat - tolerance],
                [max_lng + tolerance, max_lat + tolerance]
            );
            let holes = if hit.holes.is_empty() {
                None
            } else {
                Some(Arc::new(hit.holes.clone()))
            };
            features.push(SpatialFeature {
                bounds,
                layer_type: "geojson-polygon",
                layer_index: layer_idx,
                feature_index: poly_idx,
                segment_index: None,
                original_meta: hit.meta.clone(),
                ring: Some(Arc::new(hit.outer_ring.clone())),
                holes,
            });
        }
    }

    // Single pass into the grid: inserting ~100k features one by one is
    // cheap here (hash-free BTree cells, no node splitting), unlike the old
    // sequential R-tree inserts that motivated bulk_load.
    let mut next = SpatialIndex::new();
    for feature in features {
        next.insert(feature);
    }
    *index = next;
    *dirty = false;
}

fn screen_to_latlng(viewport: &Viewport, x: f64, y: f64) -> (f64, f64) {
    let zoom = clamp_zoom(viewport.zoom);
    let center_pixel = viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, zoom);
    let point_x = x - (viewport.width as f64 / 2.0) + center_pixel.0;
    let point_y = y - (viewport.height as f64 / 2.0) + center_pixel.1;
    viewport.pixel_to_lat_lng(point_x, point_y, zoom)
}

pub fn hit_test(
    viewport: &Viewport,
    index: &SpatialIndex,
    x: f64, y: f64,
) -> Option<JsValue> {
    // Zoom-aware tolerance: a fixed degree tolerance is sub-pixel at low zoom
    // (world view) and city-sized at high zoom. Express it in screen pixels
    // instead — a ~6px hit radius feels right at every zoom level.
    const HIT_RADIUS_PX: f64 = 6.0;
    let world_pixels = viewport.tile_size as f64 * (1u64 << clamp_zoom(viewport.zoom)) as f64;
    let deg_per_px = 360.0 / world_pixels;
    let tolerance = HIT_RADIUS_PX * deg_per_px;
    let (lat, lng) = screen_to_latlng(viewport, x, y);
    // Non-finite cursor projections cannot hit anything; bail before the
    // grid math (whose saturating casts would otherwise span the key space).
    if !lat.is_finite() || !lng.is_finite() || !tolerance.is_finite() {
        return None;
    }

    // Latitude-correct tolerance (R-27): a screen pixel spans 1/cos(lat) more
    // longitude than latitude. Clamp the cos factor so polar queries don't
    // blow up to the whole world.
    let lat_cos = lat.to_radians().cos().abs().max(0.2);
    let lng_tolerance = tolerance / lat_cos;

    let search_bounds = Bounds::from_corners(
        [lng - lng_tolerance, lat - tolerance],
        [lng + lng_tolerance, lat + tolerance]
    );

    // Intersection, not containment: a feature counts as hit when its bounds
    // overlap the cursor's tolerance box (containment would require a
    // pixel-perfect hit on the feature's center).
    //
    // Area features (polygons) additionally require the point-in-ring test to
    // pass, so clicking NEAR but outside a polygon doesn't match it — and a
    // polygon's bbox never shadows a point/line underneath it.
    //
    // Candidate ids arrive sorted by insertion order, so overlapping
    // same-kind features resolve deterministically (earliest-added wins
    // the fallback).
    let mut fallback = None;
    for i in index.query_ids(&search_bounds) {
        let feature = &index.features[i];
        match &feature.ring {
            None => {
                if fallback.is_none() {
                    fallback = Some(feature);
                }
            }
            Some(ring) => {
                let holes = feature.holes.as_deref();
                if point_in_polygon_with_holes(lat, lng, ring, holes) {
                    return Some(feature.meta_json());
                }
            }
        }
    }

    fallback.map(|feature| feature.meta_json())
}
