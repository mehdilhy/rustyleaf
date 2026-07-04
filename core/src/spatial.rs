use rstar::{RTree, RTreeObject, AABB};
use crate::layers::point::PointLayer;
use crate::layers::line::LineLayer;
use crate::layers::polygon::PolygonLayer;
use crate::projection::Viewport;

#[derive(Clone, Debug)]
pub(crate) struct SpatialFeature {
    pub(crate) id: u32,
    pub(crate) bounds: AABB<[f64; 2]>,
    pub(crate) meta: serde_json::Value,
}

impl RTreeObject for SpatialFeature {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        self.bounds
    }
}

pub fn rebuild_spatial_index(
    point_layers: &[PointLayer],
    line_layers: &[LineLayer],
    polygon_layers: &[PolygonLayer],
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
                };

                new_index.insert(feature);
                feature_id += 1;
            }
        }
    }

    // Index polygon features (centroid-based hits for now)
    for (layer_idx, layer) in polygon_layers.iter().enumerate() {
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
    let tolerance = 0.001; // degrees
    let (lat, lng) = screen_to_latlng(viewport, x, y);

    let search_bounds = AABB::from_corners(
        [lng - tolerance, lat - tolerance],
        [lng + tolerance, lat + tolerance]
    );

    for feature in index.locate_in_envelope(&search_bounds) {
        return Some(feature.meta.clone());
    }

    None
}
