use wasm_bindgen::JsValue;

#[derive(Debug, Clone)]
pub enum RustyleafError {
    WebGlUnavailable(String),
    ShaderCompilation { shader_type: String, log: String },
    ShaderLink(String),
    TextureCreation(String),
    BufferCreation(String),
    InvalidCoordinate { lat: f64, lng: f64 },
    GeoJsonParse(String),
    DomError(String),
    LayerOutOfBounds { index: usize, len: usize },
    CanvasInit(String),
    ResourceError(String),
}

impl From<RustyleafError> for JsValue {
    fn from(e: RustyleafError) -> JsValue {
        JsValue::from_str(&format!("{:?}", e))
    }
}
