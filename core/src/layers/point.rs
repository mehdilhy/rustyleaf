#[derive(Clone)]
pub struct PointLayer {
    pub(crate) points: Vec<PointFeature>,
    pub(crate) visible: bool,
}

#[derive(Clone)]
pub struct PointFeature {
    pub(crate) lat: f64,
    pub(crate) lng: f64,
    pub(crate) size: f32,
    pub(crate) color: [f32; 4],
    pub(crate) meta: serde_json::Value,
}
