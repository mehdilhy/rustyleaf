#[derive(Clone)]
pub struct LineFeature {
    pub(crate) points: Vec<[f64; 2]>,
    pub(crate) color: [f32; 4],
    #[allow(dead_code)] // WebGL2 lineWidth is fixed at 1.0; kept until triangle-strip lines land
    pub(crate) width: f32,
    pub(crate) meta: serde_json::Value,
}

#[derive(Clone)]
pub struct LineLayer {
    pub(crate) lines: Vec<LineFeature>,
    pub(crate) visible: bool,
}
