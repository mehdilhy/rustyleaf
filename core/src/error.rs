use wasm_bindgen::JsValue;

#[derive(Debug, Clone)]
pub enum RustyleafError {
    WebGlUnavailable(String),
    ShaderCompilation { shader_type: String, log: String },
    ShaderLink(String),
    TextureCreation(String),
    BufferCreation(String),
    VaoCreation(String),
    ProgramCreation(String),
    InvalidCoordinate { lat: f64, lng: f64 },
    GeoJsonParse(String),
    DomError(String),
    LayerOutOfBounds { index: usize, len: usize },
    CanvasInit(String),
    ResourceError(String),
    EventConstruction(String),
    RequestError(String),
}

impl std::fmt::Display for RustyleafError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WebGlUnavailable(msg) => write!(f, "WebGL unavailable: {msg}"),
            Self::ShaderCompilation { shader_type, log } => write!(f, "Shader compilation error ({shader_type}): {log}"),
            Self::ShaderLink(msg) => write!(f, "Shader link error: {msg}"),
            Self::TextureCreation(msg) => write!(f, "Texture creation error: {msg}"),
            Self::BufferCreation(msg) => write!(f, "Buffer creation error: {msg}"),
            Self::VaoCreation(msg) => write!(f, "VAO creation error: {msg}"),
            Self::ProgramCreation(msg) => write!(f, "Program creation error: {msg}"),
            Self::InvalidCoordinate { lat, lng } => write!(f, "Invalid coordinate: lat={lat}, lng={lng}"),
            Self::GeoJsonParse(msg) => write!(f, "GeoJSON parse error: {msg}"),
            Self::DomError(msg) => write!(f, "DOM error: {msg}"),
            Self::LayerOutOfBounds { index, len } => write!(f, "Layer index out of bounds: index={index}, len={len}"),
            Self::CanvasInit(msg) => write!(f, "Canvas init error: {msg}"),
            Self::ResourceError(msg) => write!(f, "Resource error: {msg}"),
            Self::EventConstruction(msg) => write!(f, "Event construction error: {msg}"),
            Self::RequestError(msg) => write!(f, "Request error: {msg}"),
        }
    }
}

impl From<RustyleafError> for JsValue {
    fn from(e: RustyleafError) -> JsValue {
        JsValue::from_str(&e.to_string())
    }
}
