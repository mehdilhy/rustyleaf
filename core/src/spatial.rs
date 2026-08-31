use rstar::{RTree, RTreeObject, AABB};
use crate::layers::point::PointLayer;
use crate::layers::line::LineLayer;
use crate::layers::polygon::PolygonLayer;
use crate::layers::geojson::GeoJSONLayer;
use crate::projection::Viewport;

#[derive(Clone, Debug)]
pub(crate) struct SpatialFeature {
    #[allow(dead_code)] // reserved for stable feature identity across index rebuilds
    pub(crate) id: u32,
    pub(crate) bounds: AABB<[f64; 2]>,
    pub(crate) meta: serde_json::Value,
    // When present, the feature is an area (polygon): a cursor only "hits"
    // it when point-in-ring passes — not merely by touching its bbox.
    pub(crate) ring: Option<Vec<[f64; 2]>>,
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

    let mut new_index = RTree::new();
    let mut feature_id = 0;
    let tolerance = 0.001; // degrees — ~111m at equator

    // Index point features
    for (layer_idx, layer) in point_layers.iter().enumerate() {
        for (point_idx, point) in layer.points.iter().enumerate() {
            let bounds = AABB::from_corners(
                [point.lng - tolerance, point.lat - tolerance],
                [point.lng + tolerance, point.lat + tolerance]
            );

            let mut meta = serde_json::json!({});
            meta["layer_type"] = "point".into();
            meta["layer_index"] = layer_idx.into();
            meta["feature_index"] = point_idx.into();
            meta["original_meta"] = point.meta.clone();

            let feature = SpatialFeature {
                id: feature_id,
                bounds,
                meta,
                ring: None,
            };

            new_index.insert(feature);
            feature_id += 1;
        }
    }

    // Index line features (simplified - index line segments)
    for (layer_idx, layer) in line_layers.iter().enumerate() {
        for (line_idx, line) in layer.lines.iter().enumerate() {
            // Index each line segment with tolerance
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

                let feature = SpatialFeature {
                    id: feature_id,
                    bounds,
                    meta,
                    ring: None,
                };

                new_index.insert(feature);
                feature_id += 1;
            }
        }
    }

    // Index polygon features: full bbox envelope plus the outer ring so
    // hit_test can run a point-in-polygon refinement (Leaflet-like interior
    // clicks) instead of the old centroid-only approximation.
    for (layer_idx, layer) in polygon_layers.iter().enumerate() {
        for (poly_idx, poly) in layer.polygons.iter().enumerate() {
            if let Some(ring) = poly.rings.first() {
                if ring.len() >= 3 {
                    let min_lat = ring.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
                    let max_lat = ring.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
                    let min_lng = ring.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
                    let max_lng = ring.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
                    let bounds = AABB::from_corners(
                        [min_lng - tolerance, min_lat - tolerance],
                        [max_lng + tolerance, max_lat + tolerance]
                    );
                    let mut meta = serde_json::json!({});
                    meta["layer_type"] = "polygon".into();
                    meta["layer_index"] = layer_idx.into();
                    meta["feature_index"] = poly_idx.into();
                    meta["original_meta"] = poly.meta.clone();
                    new_index.insert(SpatialFeature {
                        id: feature_id,
                        bounds,
                        meta,
                        ring: Some(ring.clone()),
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
        for (point_idx, point) in layer.cached_points.iter().enumerate() {
            let bounds = AABB::from_corners(
                [point.lng - tolerance, point.lat - tolerance],
                [point.lng + tolerance, point.lat + tolerance]
            );
            let mut meta = serde_json::json!({});
            meta["layer_type"] = "geojson-point".into();
            meta["layer_index"] = layer_idx.into();
            meta["feature_index"] = point_idx.into();
            meta["original_meta"] = point.meta.clone();
            new_index.insert(SpatialFeature { id: feature_id, bounds, meta, ring: None });
            feature_id += 1;
        }

        for (line_idx, line) in layer.cached_lines.iter().enumerate() {
            for i in 0..line.points.len().saturating_sub(1) {
                let start = line.points[i];
                let end = line.points[i + 1];
                let min_x = start[1].min(end[1]) - tolerance;
                let max_x = start[1].max(end[1]) + tolerance;
                let min_y = start[0].min(end[0]) - tolerance;
                let max_y = start[0].max(end[0]) + tolerance;
                let bounds = AABB::from_corners([min_x, min_y], [max_x, max_y]);
                let mut meta = serde_json::json!({});
                meta["layer_type"] = "geojson-line".into();
                meta["layer_index"] = layer_idx.into();
                meta["feature_index"] = line_idx.into();
                meta["segment_index"] = i.into();
                meta["original_meta"] = line.meta.clone();
                new_index.insert(SpatialFeature { id: feature_id, bounds, meta, ring: None });
                feature_id += 1;
            }
        }

        // Polygon interiors: bbox envelope + point-in-ring refinement.
        for (poly_idx, hit) in layer.cached_polygon_hits.iter().enumerate() {
            if hit.outer_ring.len() < 3 {
                continue;
            }
            let min_lat = hit.outer_ring.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
            let max_lat = hit.outer_ring.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
            let min_lng = hit.outer_ring.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
            let max_lng = hit.outer_ring.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
            let bounds = AABB::from_corners(
                [min_lng - tolerance, min_lat - tolerance],
                [max_lng + tolerance, max_lat + tolerance]
            );
            let mut meta = serde_json::json!({});
            meta["layer_type"] = "geojson-polygon".into();
            meta["layer_index"] = layer_idx.into();
            meta["feature_index"] = poly_idx.into();
            meta["original_meta"] = hit.meta.clone();
            new_index.insert(SpatialFeature {
                id: feature_id,
                bounds,
                meta,
                ring: Some(hit.outer_ring.clone()),
            });
            feature_id += 1;
        }
    }

    *index = new_index;
    *dirty = false;
}

fn screen_to_latlng(viewport: &Viewport, x: f64, y: f64) -> (f64, f64) {
    let zoom = viewport.zoom.round() as u32;
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
    let world_pixels = viewport.tile_size as f64 * (1u64 << viewport.zoom.round() as u32) as f64;
    let deg_per_px = 360.0 / world_pixels;
    let tolerance = HIT_RADIUS_PX * deg_per_px;
    let (lat, lng) = screen_to_latlng(viewport, x, y);

    let search_bounds = AABB::from_corners(
        [lng - tolerance, lat - tolerance],
        [lng + tolerance, lat + tolerance]
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
                if point_in_ring(lat, lng, ring) {
                    return Some(feature.meta.clone());
                }
            }
        }
    }

    fallback.map(|feature| feature.meta.clone())
}
