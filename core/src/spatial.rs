use std::sync::Arc;
use rstar::{RTree, RTreeObject, AABB};
use crate::layers::point::PointLayer;
use crate::layers::line::LineLayer;
use crate::layers::polygon::PolygonLayer;
use crate::layers::geojson::GeoJSONLayer;
use crate::projection::{Viewport, clamp_zoom};

/// One indexable unit (a point, a line segment, or a polygon bbox+ring).
///
/// The hit payload is stored as typed fields and only serialized to JSON when
/// a hit is actually returned. Every indexable shares its feature's
/// `original_meta` via `Arc` — a Natural Earth-class dataset has ~100k line
/// segments per GeoJSON layer, and deep-cloning a 168-key properties object
/// per segment cost ~0.3GB of allocations and minutes of main-thread time on
/// the first hover.
#[derive(Clone, Debug)]
pub(crate) struct SpatialFeature {
    #[allow(dead_code)] // reserved for stable feature identity across index rebuilds
    pub(crate) id: u32,
    pub(crate) bounds: AABB<[f64; 2]>,
    pub(crate) layer_type: &'static str,
    pub(crate) layer_index: usize,
    pub(crate) feature_index: usize,
    // Present for line features: which segment of the line was indexed.
    pub(crate) segment_index: Option<usize>,
    // Shared, not cloned: the feature's own meta/properties object.
    pub(crate) original_meta: Arc<serde_json::Value>,
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
    fn meta_json(&self) -> serde_json::Value {
        let mut meta = serde_json::Map::new();
        meta.insert("layer_type".into(), self.layer_type.into());
        meta.insert("layer_index".into(), self.layer_index.into());
        meta.insert("feature_index".into(), self.feature_index.into());
        if let Some(seg) = self.segment_index {
            meta.insert("segment_index".into(), seg.into());
        }
        meta.insert("original_meta".into(), (*self.original_meta).clone());
        serde_json::Value::Object(meta)
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

impl RTreeObject for SpatialFeature {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        self.bounds
    }
}

#[allow(clippy::too_many_arguments)]
pub fn rebuild_spatial_index(
    point_layers: &[PointLayer],
    line_layers: &[LineLayer],
    polygon_layers: &[PolygonLayer],
    geojson_layers: &[GeoJSONLayer],
    index: &mut RTree<SpatialFeature>,
    dirty: &mut bool,
) {
    if !*dirty {
        return;
    }

    let mut features: Vec<SpatialFeature> = Vec::new();
    let mut feature_id: u32 = 0;
    let tolerance = 0.001; // degrees — ~111m at equator

    // Hidden layers are neither drawn nor hit-testable (issue #17).
    // Index point features
    for (layer_idx, layer) in point_layers.iter().enumerate() {
        if !layer.visible {
            continue;
        }
        for (point_idx, point) in layer.points.iter().enumerate() {
            let bounds = AABB::from_corners(
                [point.lng - tolerance, point.lat - tolerance],
                [point.lng + tolerance, point.lat + tolerance]
            );

            features.push(SpatialFeature {
                id: feature_id,
                bounds,
                layer_type: "point",
                layer_index: layer_idx,
                feature_index: point_idx,
                segment_index: None,
                original_meta: Arc::new(point.meta.clone()),
                ring: None,
                holes: None,
            });
            feature_id += 1;
        }
    }

    // Index line features (simplified - index line segments)
    for (layer_idx, layer) in line_layers.iter().enumerate() {
        if !layer.visible {
            continue;
        }
        for (line_idx, line) in layer.lines.iter().enumerate() {
            // One shared meta per line — segments must not deep-clone it.
            let meta = Arc::new(line.meta.clone());
            // Index each line segment with tolerance
            for i in 0..line.points.len().saturating_sub(1) {
                let start = line.points[i];
                let end = line.points[i + 1];

                let min_x = start[1].min(end[1]) - tolerance;
                let max_x = start[1].max(end[1]) + tolerance;
                let min_y = start[0].min(end[0]) - tolerance;
                let max_y = start[0].max(end[0]) + tolerance;

                let bounds = AABB::from_corners([min_x, min_y], [max_x, max_y]);

                features.push(SpatialFeature {
                    id: feature_id,
                    bounds,
                    layer_type: "line",
                    layer_index: layer_idx,
                    feature_index: line_idx,
                    segment_index: Some(i),
                    original_meta: Arc::clone(&meta),
                    ring: None,
                    holes: None,
                });
                feature_id += 1;
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
                    let bounds = AABB::from_corners(
                        [min_lng - tolerance, min_lat - tolerance],
                        [max_lng + tolerance, max_lat + tolerance]
                    );
                    let holes = if poly.rings.len() > 1 {
                        Some(Arc::new(poly.rings[1..].to_vec()))
                    } else {
                        None
                    };
                    features.push(SpatialFeature {
                        id: feature_id,
                        bounds,
                        layer_type: "polygon",
                        layer_index: layer_idx,
                        feature_index: poly_idx,
                        segment_index: None,
                        original_meta: Arc::new(poly.meta.clone()),
                        ring: Some(Arc::new(ring.clone())),
                        holes,
                    });
                    feature_id += 1;
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
            let bounds = AABB::from_corners(
                [point.lng - tolerance, point.lat - tolerance],
                [point.lng + tolerance, point.lat + tolerance]
            );
            features.push(SpatialFeature {
                id: feature_id,
                bounds,
                layer_type: "geojson-point",
                layer_index: layer_idx,
                feature_index: point_idx,
                segment_index: None,
                original_meta: Arc::new(point.meta.clone()),
                ring: None,
                holes: None,
            });
            feature_id += 1;
        }

        for (line_idx, line) in layer.cached_lines.iter().enumerate() {
            // One shared meta per line feature — ~100k segments on a
            // world-class dataset each used to deep-clone the properties.
            let meta = Arc::new(line.meta.clone());
            for i in 0..line.points.len().saturating_sub(1) {
                let start = line.points[i];
                let end = line.points[i + 1];
                let min_x = start[1].min(end[1]) - tolerance;
                let max_x = start[1].max(end[1]) + tolerance;
                let min_y = start[0].min(end[0]) - tolerance;
                let max_y = start[0].max(end[0]) + tolerance;
                let bounds = AABB::from_corners([min_x, min_y], [max_x, max_y]);
                features.push(SpatialFeature {
                    id: feature_id,
                    bounds,
                    layer_type: "geojson-line",
                    layer_index: layer_idx,
                    feature_index: line_idx,
                    segment_index: Some(i),
                    original_meta: Arc::clone(&meta),
                    ring: None,
                    holes: None,
                });
                feature_id += 1;
            }
        }

        // Polygon interiors: bbox envelope + point-in-ring refinement.
        for (poly_idx, hit) in layer.cached_polygon_hits.iter().enumerate() {
            if hit.outer_ring.len() < 3 {
                continue;
            }
            let (min_lat, max_lat, min_lng, max_lng) = ring_bbox(&hit.outer_ring);
            let bounds = AABB::from_corners(
                [min_lng - tolerance, min_lat - tolerance],
                [max_lng + tolerance, max_lat + tolerance]
            );
            let holes = if hit.holes.is_empty() {
                None
            } else {
                Some(Arc::new(hit.holes.clone()))
            };
            features.push(SpatialFeature {
                id: feature_id,
                bounds,
                layer_type: "geojson-polygon",
                layer_index: layer_idx,
                feature_index: poly_idx,
                segment_index: None,
                original_meta: Arc::new(hit.meta.clone()),
                ring: Some(Arc::new(hit.outer_ring.clone())),
                holes,
            });
            feature_id += 1;
        }
    }

    // Bulk-load once: sequential `insert()` over ~100k features cost minutes
    // (pathological node splitting under allocator churn); `bulk_load` is
    // orders of magnitude faster and produces a better-packed tree.
    *index = RTree::bulk_load(features);
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
    index: &RTree<SpatialFeature>,
    x: f64, y: f64,
) -> Option<serde_json::Value> {
    // Zoom-aware tolerance: a fixed degree tolerance is sub-pixel at low zoom
    // (world view) and city-sized at high zoom. Express it in screen pixels
    // instead — a ~6px hit radius feels right at every zoom level.
    const HIT_RADIUS_PX: f64 = 6.0;
    let world_pixels = viewport.tile_size as f64 * (1u64 << clamp_zoom(viewport.zoom)) as f64;
    let deg_per_px = 360.0 / world_pixels;
    let tolerance = HIT_RADIUS_PX * deg_per_px;
    let (lat, lng) = screen_to_latlng(viewport, x, y);

    // Latitude-correct tolerance (R-27): a screen pixel spans 1/cos(lat) more
    // longitude than latitude. Clamp the cos factor so polar queries don't
    // blow up to the whole world.
    let lat_cos = lat.to_radians().cos().abs().max(0.2);
    let lng_tolerance = tolerance / lat_cos;

    let search_bounds = AABB::from_corners(
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
    let candidates: Vec<&SpatialFeature> = index
        .locate_in_envelope_intersecting(&search_bounds)
        .collect();

    let mut fallback = None;
    for feature in candidates {
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
