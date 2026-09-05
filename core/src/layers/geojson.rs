use std::cell::{RefCell, Cell};
use crate::OwnedBuffer;
use super::point::PointFeature;
use super::line::LineFeature;

#[derive(Clone)]
pub struct GeoJSONLayer {
    pub(crate) features: Vec<GeoJSONFeature>,
    pub(crate) visible: bool,
    pub(crate) style: GeoJSONStyle,
    pub(crate) cached_points: Vec<PointFeature>,
    pub(crate) cached_lines: Vec<LineFeature>,
    pub(crate) cached_polygon_triangles: Vec<[f64; 2]>,
    // Outer rings + metadata kept aside from triangulation so polygon
    // INTERIORS are hit-testable (point-in-polygon refinement in the
    // spatial index), matching Leaflet's behavior.
    pub(crate) cached_polygon_hits: Vec<PolygonHit>,
    pub(crate) pending_chunk: String,
    // Feature count at the last render-cache rebuild — throttles how often
    // streaming re-triangulates/re-uploads (O(n) each) during ingestion.
    pub(crate) last_rebuilt_len: usize,
    // Wall-clock (ms) of the last render-cache rebuild — prevents
    // back-to-back O(n) rebuilds from starving the render thread.
    pub(crate) last_rebuilt_at_ms: f64,
    pub(crate) polygon_vertex_buffer: RefCell<Option<OwnedBuffer>>,
    pub(crate) polygon_vertex_count: Cell<usize>,
    pub(crate) line_vertex_buffer: RefCell<Option<OwnedBuffer>>,
    pub(crate) line_vertex_count: Cell<usize>,
}

/// Hit-test record for a GeoJSON polygon: outer ring plus the feature's
/// properties (including any injected `__rl_fid`).
#[derive(Clone)]
pub struct PolygonHit {
    pub outer_ring: Vec<[f64; 2]>, // [lat, lng] pairs
    pub meta: serde_json::Value,
}

#[derive(Clone)]
pub struct GeoJSONFeature {
    pub(crate) geometry: GeoJSONGeometry,
    pub(crate) properties: serde_json::Value,
    #[allow(dead_code)] // GeoJSON feature id, kept for future feature lookup API
    pub(crate) id: Option<String>,
}

#[derive(Clone)]
pub enum GeoJSONGeometry {
    Point { coordinates: [f64; 2] },
    MultiPoint { coordinates: Vec<[f64; 2]> },
    LineString { coordinates: Vec<[f64; 2]> },
    MultiLineString { coordinates: Vec<Vec<[f64; 2]>> },
    Polygon { coordinates: Vec<Vec<[f64; 2]>> },
    MultiPolygon { coordinates: Vec<Vec<Vec<[f64; 2]>>> },
}

#[derive(Clone)]
pub struct GeoJSONStyle {
    pub(crate) point_color: [f32; 4],
    pub(crate) point_size: f32,
    pub(crate) line_color: [f32; 4],
    pub(crate) line_width: f32,
    pub(crate) polygon_color: [f32; 4],
}

impl Default for GeoJSONStyle {
    fn default() -> Self {
        Self {
            point_color: [0.0, 0.5, 1.0, 1.0],
            point_size: 5.0,
            line_color: [1.0, 0.0, 0.0, 1.0],
            line_width: 2.0,
            polygon_color: [0.0, 1.0, 0.0, 0.5],
        }
    }
}
