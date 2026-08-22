use std::cell::{Cell, RefCell};
use crate::OwnedBuffer;

pub struct PointLayer {
    pub(crate) points: Vec<PointFeature>,
    pub(crate) visible: bool,
    // GPU-resident vertex data: normalized Web-Mercator coords + size + color,
    // uploaded once and reused across frames (projection happens in the shader).
    pub(crate) vertex_buffer: RefCell<Option<OwnedBuffer>>,
    pub(crate) vertex_count: Cell<usize>,
    // Set when `points` changes so the render pass re-uploads the GPU buffer.
    pub(crate) gpu_dirty: Cell<bool>,
    // Normalized-mercator bounding box of the uploaded points and their mean
    // footprint (size² px). Used by the render pass to bound overdraw: when
    // the layer collapses to a small screen area at low zoom, only a fair
    // random sample is drawn (vertices are uploaded pre-shuffled).
    pub(crate) norm_min: Cell<(f32, f32)>,
    pub(crate) norm_max: Cell<(f32, f32)>,
    pub(crate) avg_point_area: Cell<f32>,
}

impl PointLayer {
    pub(crate) fn new() -> Self {
        Self {
            points: Vec::new(),
            visible: true,
            vertex_buffer: RefCell::new(None),
            vertex_count: Cell::new(0),
            gpu_dirty: Cell::new(true),
            norm_min: Cell::new((0.0, 0.0)),
            norm_max: Cell::new((1.0, 1.0)),
            avg_point_area: Cell::new(25.0),
        }
    }
}

#[derive(Clone)]
pub struct PointFeature {
    pub(crate) lat: f64,
    pub(crate) lng: f64,
    pub(crate) size: f32,
    pub(crate) color: [f32; 4],
    pub(crate) meta: serde_json::Value,
}
