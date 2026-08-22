use std::cell::{Cell, RefCell};
use crate::OwnedBuffer;

#[derive(Clone)]
pub struct LineFeature {
    pub(crate) points: Vec<[f64; 2]>,
    pub(crate) color: [f32; 4],
    pub(crate) width: f32,
    pub(crate) meta: serde_json::Value,
}

#[derive(Clone)]
pub struct LineLayer {
    pub(crate) lines: Vec<LineFeature>,
    pub(crate) visible: bool,
    // GPU-resident instance data (normalized segment coords + width + color),
    // uploaded once per data change; expansion happens in the vertex shader
    // so pan/zoom never rebuilds vertices on the CPU.
    pub(crate) vertex_buffer: RefCell<Option<OwnedBuffer>>,
    pub(crate) instance_count: Cell<usize>,
    pub(crate) gpu_dirty: Cell<bool>,
}

impl LineLayer {
    pub(crate) fn new() -> Self {
        Self {
            lines: Vec::new(),
            visible: true,
            vertex_buffer: RefCell::new(None),
            instance_count: Cell::new(0),
            gpu_dirty: Cell::new(true),
        }
    }
}
