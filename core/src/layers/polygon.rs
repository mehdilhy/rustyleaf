use std::cell::{Cell, RefCell};
use wasm_bindgen::JsValue;
use crate::OwnedBuffer;

#[derive(Clone)]
pub struct PolygonFeature {
    pub(crate) rings: Vec<Vec<[f64; 2]>>,
    pub(crate) color: [f32; 4],
    pub(crate) meta: JsValue,
}

#[derive(Clone)]
pub struct PolygonLayer {
    pub(crate) polygons: Vec<PolygonFeature>,
    pub(crate) visible: bool,
    // GPU-resident triangulated vertex data in normalized world coords,
    // rebuilt once per data change (ear clipping is O(n^2) — never per frame).
    pub(crate) vertex_buffer: RefCell<Option<OwnedBuffer>>,
    pub(crate) vertex_count: Cell<usize>,
    pub(crate) gpu_dirty: Cell<bool>,
}

impl PolygonLayer {
    pub(crate) fn new() -> Self {
        Self {
            polygons: Vec::new(),
            visible: true,
            vertex_buffer: RefCell::new(None),
            vertex_count: Cell::new(0),
            gpu_dirty: Cell::new(true),
        }
    }
}
