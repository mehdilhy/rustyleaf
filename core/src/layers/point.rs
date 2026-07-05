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
}

impl PointLayer {
    pub(crate) fn new() -> Self {
        Self {
            points: Vec::new(),
            visible: true,
            vertex_buffer: RefCell::new(None),
            vertex_count: Cell::new(0),
            gpu_dirty: Cell::new(true),
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
