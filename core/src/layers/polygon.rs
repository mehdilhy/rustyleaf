#[derive(Clone)]
pub struct PolygonFeature {
    pub(crate) rings: Vec<Vec<[f64; 2]>>,
    pub(crate) color: [f32; 4],
    pub(crate) meta: serde_json::Value,
}

#[derive(Clone)]
pub struct PolygonLayer {
    pub(crate) polygons: Vec<PolygonFeature>,
    pub(crate) visible: bool,
}
