use wasm_bindgen::prelude::*;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
use web_sys::{
    window, HtmlCanvasElement,
    WebGl2RenderingContext, WebGlProgram, WebGlShader, WebGlBuffer, WebGlTexture,
    WebGlUniformLocation, WebGlVertexArrayObject
};

// RAII WebGL resource wrappers — Drop calls the corresponding delete_*() on the GL context
// Uses Rc-backed inner so cloning (cheap ref-count increment) doesn't double-delete.

struct OwnedTextureInner {
    gl: WebGl2RenderingContext,
    texture: WebGlTexture,
}
impl Drop for OwnedTextureInner {
    fn drop(&mut self) { self.gl.delete_texture(Some(&self.texture)); }
}

#[derive(Clone)]
pub(crate) struct OwnedTexture {
    inner: Rc<OwnedTextureInner>,
}
impl OwnedTexture {
    pub fn new(gl: &WebGl2RenderingContext, texture: WebGlTexture) -> Self {
        Self { inner: Rc::new(OwnedTextureInner { gl: gl.clone(), texture }) }
    }
    pub fn inner(&self) -> &WebGlTexture { &self.inner.texture }
}

struct OwnedBufferInner {
    gl: WebGl2RenderingContext,
    buffer: WebGlBuffer,
}
impl Drop for OwnedBufferInner {
    fn drop(&mut self) { self.gl.delete_buffer(Some(&self.buffer)); }
}

#[derive(Clone)]
pub(crate) struct OwnedBuffer {
    inner: Rc<OwnedBufferInner>,
}
impl OwnedBuffer {
    pub fn new(gl: &WebGl2RenderingContext, buffer: WebGlBuffer) -> Self {
        Self { inner: Rc::new(OwnedBufferInner { gl: gl.clone(), buffer }) }
    }
    pub fn inner(&self) -> &WebGlBuffer { &self.inner.buffer }
}

struct OwnedVAOInner {
    gl: WebGl2RenderingContext,
    vao: WebGlVertexArrayObject,
}
impl Drop for OwnedVAOInner {
    fn drop(&mut self) { self.gl.delete_vertex_array(Some(&self.vao)); }
}

#[derive(Clone)]
pub(crate) struct OwnedVAO {
    inner: Rc<OwnedVAOInner>,
}
impl OwnedVAO {
    pub fn new(gl: &WebGl2RenderingContext, vao: WebGlVertexArrayObject) -> Self {
        Self { inner: Rc::new(OwnedVAOInner { gl: gl.clone(), vao }) }
    }
    pub fn inner(&self) -> &WebGlVertexArrayObject { &self.inner.vao }
}

struct OwnedProgramInner {
    gl: WebGl2RenderingContext,
    program: WebGlProgram,
    shaders: Vec<WebGlShader>,
}
impl Drop for OwnedProgramInner {
    fn drop(&mut self) {
        for shader in &self.shaders { self.gl.delete_shader(Some(shader)); }
        self.gl.delete_program(Some(&self.program));
    }
}

#[derive(Clone)]
pub(crate) struct OwnedProgram {
    inner: Rc<OwnedProgramInner>,
}
impl OwnedProgram {
    pub fn new(gl: &WebGl2RenderingContext, program: WebGlProgram, vertex: WebGlShader, fragment: WebGlShader) -> Self {
        Self { inner: Rc::new(OwnedProgramInner { gl: gl.clone(), program, shaders: vec![vertex, fragment] }) }
    }
    pub fn inner(&self) -> &WebGlProgram { &self.inner.program }
}


// Animation frame helpers
fn request_animation_frame(closure: &js_sys::Function) -> Result<i32, JsValue> {
    let window = window().ok_or_else(|| JsValue::from_str("Window not available"))?;
    window.request_animation_frame(closure)
        .map_err(|_| JsValue::from_str("Failed to request animation frame"))
}

fn cancel_animation_frame(handle: i32) -> Result<(), JsValue> {
    let window = window().ok_or_else(|| JsValue::from_str("Window not available"))?;
    let _ = window.cancel_animation_frame(handle);
    Ok(())
}
use std::cell::{RefCell, Cell};
use std::rc::Rc;
use js_sys::{Array, Float32Array};
use rstar::RTree;
use lyon_tessellation::{BuffersBuilder, FillOptions, FillTessellator, FillVertex, VertexBuffers};
use lyon_path::Path;

mod projection;
mod color;
mod tiles;
mod spatial;
mod error;
mod input;
use crate::projection::Viewport;
use crate::color::parse_color;
use crate::tiles::{TileCoord, TileLayer, TileLoader};
use crate::spatial::{SpatialFeature, rebuild_spatial_index, hit_test as spatial_hit_test};
use crate::input::MouseState;
use crate::input::momentum::{apply_drag, apply_momentum, start_momentum_animation};

// Coordinate and spatial data structures (TileCoord, Tile moved to crate::tiles, SpatialFeature moved to crate::spatial)
// MouseState moved to crate::input

// Shader programs for different rendering types — OwnedProgram owns its shaders
struct ShaderPrograms {
    tile_program: OwnedProgram,
    point_program: OwnedProgram,
    line_program: OwnedProgram,
    polygon_program: OwnedProgram,
}

// WebGL buffers and state
struct WebGlState {
    context: WebGl2RenderingContext,
    programs: ShaderPrograms,
    tile_vao: OwnedVAO,
    point_vao: OwnedVAO,
    line_vao: OwnedVAO,
    polygon_vao: OwnedVAO,
    tile_buffer: OwnedBuffer,
    point_buffer: OwnedBuffer,
    line_buffer: OwnedBuffer,
    polygon_buffer: OwnedBuffer,
    polygon_u_origin: Option<WebGlUniformLocation>,
    polygon_u_world_scale: Option<WebGlUniformLocation>,
    line_u_origin: Option<WebGlUniformLocation>,
    line_u_world_scale: Option<WebGlUniformLocation>,
}

// Event callback types
type EventCallback = Box<dyn FnMut(JsValue)>;

// MouseState moved to crate::input

// Layer types for the map (TileLayer moved to crate::tiles)

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

#[derive(Clone)]
pub struct LineFeature {
    pub(crate) points: Vec<[f64; 2]>, // [[lat, lng], ...]
    pub(crate) color: [f32; 4],
    pub(crate) width: f32,
    pub(crate) meta: serde_json::Value,
}

#[derive(Clone)]
pub struct LineLayer {
    pub(crate) lines: Vec<LineFeature>,
    pub(crate) visible: bool,
}

#[derive(Clone)]
pub struct PolygonFeature {
    pub(crate) rings: Vec<Vec<[f64; 2]>>, // Outer ring + holes: [[[lat, lng], ...], ...]
    pub(crate) color: [f32; 4],
    pub(crate) meta: serde_json::Value,
}

#[derive(Clone)]
pub struct PolygonLayer {
    pub(crate) polygons: Vec<PolygonFeature>,
    pub(crate) visible: bool,
}

#[derive(Clone)]
pub struct GeoJSONLayer {
    features: Vec<GeoJSONFeature>,
    visible: bool,
    style: GeoJSONStyle,
    // Cached, preprocessed primitives to avoid per-frame parsing/triangulation
    cached_points: Vec<PointFeature>,
    cached_lines: Vec<LineFeature>,
    // Flattened triangles in lat/lng coordinate pairs: [lat, lng, lat, lng, lat, lng, ...]
    cached_polygon_triangles: Vec<[f64; 2]>,
    // GPU buffer for normalized-world polygon vertices (uploaded once per data load)
    polygon_vertex_buffer: RefCell<Option<OwnedBuffer>>,
    polygon_vertex_count: Cell<usize>,
    // GPU buffer for normalized-world line vertices (uploaded once per data load)
    line_vertex_buffer: RefCell<Option<OwnedBuffer>>,
    line_vertex_count: Cell<usize>,
}

#[derive(Clone)]
pub struct GeoJSONFeature {
    geometry: GeoJSONGeometry,
    properties: serde_json::Value,
    id: Option<String>,
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
    point_color: [f32; 4],
    point_size: f32,
    line_color: [f32; 4],
    line_width: f32,
    polygon_color: [f32; 4],
}

impl Default for GeoJSONStyle {
    fn default() -> Self {
        Self {
            point_color: [0.0, 0.5, 1.0, 1.0],  // Blue
            point_size: 5.0,
            line_color: [1.0, 0.0, 0.0, 1.0],  // Red
            line_width: 2.0,
            polygon_color: [0.0, 1.0, 0.0, 0.5],  // Semi-transparent green
        }
    }
}

// WebGL support information for compatibility checking
#[wasm_bindgen]
pub struct WebGlSupportInfo {
    #[wasm_bindgen(skip)]
    pub extensions: Vec<String>,
    #[wasm_bindgen(skip)]
    pub renderer: Option<String>,
    #[wasm_bindgen(skip)]
    pub vendor: Option<String>,
    pub webgl2_available: bool,
    pub webgl1_fallback: bool,
    pub max_texture_size: i32,
}

#[wasm_bindgen]
impl WebGlSupportInfo {
    
    #[wasm_bindgen]
    pub fn is_supported(&self) -> bool {
        self.webgl2_available || self.webgl1_fallback
    }
    
    #[wasm_bindgen]
    pub fn get_support_level(&self) -> String {
        if self.webgl2_available {
            "full".to_string()
        } else if self.webgl1_fallback {
            "limited".to_string()
        } else {
            "none".to_string()
        }
    }
    
    #[wasm_bindgen]
    pub fn renderer(&self) -> String {
        self.renderer.clone().unwrap_or_else(|| "unknown".to_string())
    }
    
    #[wasm_bindgen]
    pub fn extensions(&self) -> String {
        self.extensions.join(", ")
    }
    
    #[wasm_bindgen]
    pub fn check_webgl_support() -> Result<WebGlSupportInfo, JsValue> {
        let window = window().ok_or_else(|| JsValue::from_str("Window not available"))?;
        let document = window.document().ok_or_else(|| JsValue::from_str("Document not available"))?;
        
        // Create a temporary canvas to test WebGL support
        let canvas = document
            .create_element("canvas")
            .map_err(|e| JsValue::from_str(&format!("Failed to create canvas: {:?}", e)))?
            .dyn_into::<HtmlCanvasElement>()
            .map_err(|_| JsValue::from_str("Failed to create canvas element"))?;
        
        let mut info = WebGlSupportInfo {
            webgl2_available: false,
            webgl1_fallback: false,
            extensions: Vec::new(),
            renderer: None,
            vendor: None,
            max_texture_size: 0,
        };
        
        // Test WebGL2 support
        if let Some(gl2_context) = canvas.get_context("webgl2").ok().flatten() {
            info.webgl2_available = true;
            if let Ok(gl2) = gl2_context.dyn_into::<WebGl2RenderingContext>() {
                // Get max texture size
                match gl2.get_parameter(WebGl2RenderingContext::MAX_TEXTURE_SIZE) {
                    Ok(max_size) => {
                        info.max_texture_size = max_size.as_f64().unwrap_or(2048.0) as i32;
                    },
                    Err(_) => {
                        info.max_texture_size = 2048; // Default value
                    }
                }
                
                // Check for required extensions
                let required_extensions = ["OES_texture_float"];
                for ext in required_extensions.iter() {
                    if gl2.get_extension(*ext).is_ok() {
                        info.extensions.push(ext.to_string());
                    }
                }
                
                // Get renderer info (if available)
                let renderer = gl2.get_parameter(WebGl2RenderingContext::RENDERER);
                info.renderer = renderer.ok().and_then(|r| r.as_string());
                
                let vendor = gl2.get_parameter(WebGl2RenderingContext::VENDOR);
                info.vendor = vendor.ok().and_then(|v| v.as_string());
            }
        } else {
            // Test WebGL1 fallback
            if canvas.get_context("webgl").is_ok() || canvas.get_context("experimental-webgl").is_ok() {
                info.webgl1_fallback = true;
            }
        }
        
        Ok(info)
    }
}

#[wasm_bindgen]
pub struct RustyleafMap {
    width: u32,
    height: u32,
    center_lat: f64,
    center_lng: f64,
    zoom: f64,
    canvas: Option<HtmlCanvasElement>,
    gl_state: Option<WebGlState>,
    tile_loader: TileLoader,
    tile_size: u32,
    tile_layer: Option<TileLayer>,
    point_layers: Vec<PointLayer>,
    line_layers: Vec<LineLayer>,
    polygon_layers: Vec<PolygonLayer>,
    geojson_layers: Vec<GeoJSONLayer>,
    spatial_index: RTree<SpatialFeature>,
    spatial_index_dirty: bool,
    mouse_state: MouseState,
    // Smooth dragging with momentum
    drag_velocity: (f64, f64),
    last_drag_time: f64,
    drag_accumulated_x: f64,
    drag_accumulated_y: f64,
    has_momentum: bool,
    animation_frame: Option<i32>,
    // Performance monitoring
    frame_count: u32,
    last_frame_time: f64,
    // Event callbacks - store as boxed functions to allow removal
    move_callbacks: Vec<Box<js_sys::Function>>,
    zoom_callbacks: Vec<Box<js_sys::Function>>,
    click_callbacks: Vec<Box<js_sys::Function>>,
    hover_callbacks: Vec<Box<js_sys::Function>>,
    mousedown_callbacks: Vec<Box<js_sys::Function>>,
    mouseup_callbacks: Vec<Box<js_sys::Function>>,
    contextmenu_callbacks: Vec<Box<js_sys::Function>>,
    keydown_callbacks: Vec<Box<js_sys::Function>>,
    keyup_callbacks: Vec<Box<js_sys::Function>>,
    dragend_callbacks: Vec<Box<js_sys::Function>>,
}

#[wasm_bindgen]
impl RustyleafMap {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> RustyleafMap {
        RustyleafMap {
            width,
            height,
            center_lat: 48.8566,  // Paris latitude
            center_lng: 2.3522,  // Paris longitude
            zoom: 2.0,
            canvas: None,
            gl_state: None,
            tile_loader: TileLoader::new(),
            tile_size: 256,
            tile_layer: None,
            point_layers: Vec::new(),
            line_layers: Vec::new(),
            polygon_layers: Vec::new(),
            geojson_layers: Vec::new(),
            spatial_index: RTree::new(),
            spatial_index_dirty: true,
            mouse_state: MouseState {
                is_dragging: false,
                last_x: 0.0,
                last_y: 0.0,
                button_down: false,
            },
            drag_velocity: (0.0, 0.0),
            last_drag_time: 0.0,
            drag_accumulated_x: 0.0,
            drag_accumulated_y: 0.0,
            has_momentum: false,
            animation_frame: None,
            frame_count: 0,
            last_frame_time: 0.0,
            // Event callbacks
            move_callbacks: Vec::new(),
            zoom_callbacks: Vec::new(),
            click_callbacks: Vec::new(),
            hover_callbacks: Vec::new(),
            mousedown_callbacks: Vec::new(),
            mouseup_callbacks: Vec::new(),
            contextmenu_callbacks: Vec::new(),
            keydown_callbacks: Vec::new(),
            keyup_callbacks: Vec::new(),
            dragend_callbacks: Vec::new(),
        }
    }

    fn viewport(&self) -> Viewport {
        Viewport {
            width: self.width,
            height: self.height,
            center_lat: self.center_lat,
            center_lng: self.center_lng,
            zoom: self.zoom,
            tile_size: self.tile_size,
        }
    }

    // Tile cache management — delegates to TileLoader
    fn cleanup_old_tiles(&mut self) {
        if let Some(ref gl_state) = self.gl_state {
            self.tile_loader
                .cleanup_old_tiles(&gl_state.context, &self.viewport());
        }
    }

    fn load_visible_tiles(&mut self) {
        if let Some(ref tile_layer) = self.tile_layer {
            if let Some(ref gl_state) = self.gl_state {
                self.tile_loader.load_visible_tiles(
                    &self.viewport(),
                    tile_layer,
                    &gl_state.context,
                    self.tile_size,
                );
            }
        }
    }

    fn load_tile(&mut self, coord: TileCoord) {
        if let Some(ref tile_layer) = self.tile_layer {
            if let Some(ref gl_state) = self.gl_state {
                self.tile_loader
                    .load_tile(coord, tile_layer, &gl_state.context);
            }
        }
    }

    pub fn set_view(&mut self, lat: f64, lng: f64, zoom: f64) {
        self.center_lat = lat;
        self.center_lng = lng;
        self.zoom = zoom;
        self.load_visible_tiles();
        self.schedule_render();

        // Trigger move event
        self.trigger_move_event();
    }

    fn schedule_render(&mut self) {
        // Schedule next render if needed
        // With the new drag system, this is mostly handled by the render loop
    }

    fn apply_drag(&mut self, delta_x: f64, delta_y: f64) {
        apply_drag(
            delta_x, delta_y,
            &mut self.drag_velocity,
            &mut self.drag_accumulated_x, &mut self.drag_accumulated_y,
            &mut self.last_drag_time,
            0.7,
            2000.0,
        );
    }
    
    fn meters_per_pixel(&self, zoom: u32) -> f64 {
        let circumference = 40075016.686; // Earth's circumference in meters
        let height = 1u32 << zoom;
        circumference / (height as f64 * self.tile_size as f64)
    }
    
    fn apply_momentum(&mut self) {
        apply_momentum(
            &mut self.center_lat, &mut self.center_lng,
            &mut self.drag_velocity,
            &mut self.drag_accumulated_x, &mut self.drag_accumulated_y,
            &mut self.has_momentum,
            &mut self.last_frame_time,
        );
        if self.drag_accumulated_x.abs() > 0.05 || self.drag_accumulated_y.abs() > 0.05 {
            self.pan(self.drag_accumulated_x, self.drag_accumulated_y);
        }
    }

    fn start_momentum_animation(&mut self) {
        start_momentum_animation(&self.drag_velocity, &mut self.has_momentum);
    }

    fn cleanup_gl_resources(&mut self) {
        // Delete tile textures (still raw, not RAII-wrapped)
        let mut textures = self.tile_loader.textures.borrow_mut();
        if let Some(ref gl_state) = self.gl_state {
            for (_key, texture) in textures.drain() {
                gl_state.context.delete_texture(Some(&texture));
            }
        }
        // Clear GeoJSON layer GPU buffers (triggers OwnedBuffer::Drop → delete_buffer)
        for layer in &self.geojson_layers {
            layer.polygon_vertex_buffer.borrow_mut().take();
            layer.line_vertex_buffer.borrow_mut().take();
        }
        // Dropping gl_state triggers OwnedVAO, OwnedBuffer, OwnedProgram Drop impls
        self.gl_state = None;
        self.canvas = None;
    }

    #[wasm_bindgen]
    pub fn destroy(&mut self) {
        self.cleanup_gl_resources();
    }

  
    pub fn init_canvas(&mut self, canvas_id: &str) -> Result<(), JsValue> {
        // Check WebGL compatibility first
        let webgl_info = WebGlSupportInfo::check_webgl_support()?;
        if !webgl_info.is_supported() {
            return Err(JsValue::from_str(&format!(
                "WebGL not supported. Support level: {}. Please use a modern browser with WebGL enabled.",
                webgl_info.get_support_level()
            )));
        }
        
        if !webgl_info.webgl2_available && webgl_info.webgl1_fallback {
            web_sys::console::warn_1(&JsValue::from_str(
                "⚠️ WebGL2 not available, falling back to WebGL1. Some features may be limited."
            ));
        }

        let window = window().ok_or_else(|| JsValue::from_str("Window not available"))?;
        let document = window.document().ok_or_else(|| JsValue::from_str("Document not available"))?;
        let canvas = document
            .get_element_by_id(canvas_id)
            .ok_or_else(|| JsValue::from_str(&format!("Canvas element with id '{}' not found", canvas_id)))?
            .dyn_into::<HtmlCanvasElement>()
            .map_err(|_| JsValue::from_str("Element is not a canvas"))?;

        canvas.set_width(self.width);
        canvas.set_height(self.height);

        let context = {
            let attrs = web_sys::WebGlContextAttributes::new();
            attrs.set_preserve_drawing_buffer(true);
            canvas
                .get_context_with_context_options("webgl2", &attrs.into())?
                .ok_or_else(|| JsValue::from_str("WebGL2 context not available"))?
                .dyn_into::<WebGl2RenderingContext>()
                .map_err(|_| JsValue::from_str("Failed to get WebGL2 context"))?
        };

        self.canvas = Some(canvas);
        self.initialize_webgl(context)?;

        Ok(())
    }

    fn initialize_webgl(&mut self, context: WebGl2RenderingContext) -> Result<(), JsValue> {
        // Enable extensions if needed
        context.get_extension("OES_texture_float")?;
        context.get_extension("WEBGL_debug_renderer_info")?;

        // Create shader programs
        let programs = self.create_shader_programs(&context)?;

        // Get u_origin uniform location for polygon shader
        let polygon_u_origin = context.get_uniform_location(programs.polygon_program.inner(), "u_origin");
        let polygon_u_world_scale = context.get_uniform_location(programs.polygon_program.inner(), "u_world_scale");

        let line_u_origin = context.get_uniform_location(programs.line_program.inner(), "u_origin");
        let line_u_world_scale = context.get_uniform_location(programs.line_program.inner(), "u_world_scale");

        // Create VAOs and buffers with error handling
        let tile_vao = context.create_vertex_array().ok_or_else(|| JsValue::from_str("Failed to create tile VAO"))?;
        let point_vao = context.create_vertex_array().ok_or_else(|| JsValue::from_str("Failed to create point VAO"))?;
        let line_vao = context.create_vertex_array().ok_or_else(|| JsValue::from_str("Failed to create line VAO"))?;
        let polygon_vao = context.create_vertex_array().ok_or_else(|| JsValue::from_str("Failed to create polygon VAO"))?;

        let tile_buffer = context.create_buffer().ok_or_else(|| JsValue::from_str("Failed to create tile buffer"))?;
        let point_buffer = context.create_buffer().ok_or_else(|| JsValue::from_str("Failed to create point buffer"))?;
        let line_buffer = context.create_buffer().ok_or_else(|| JsValue::from_str("Failed to create line buffer"))?;
        let polygon_buffer = context.create_buffer().ok_or_else(|| JsValue::from_str("Failed to create polygon buffer"))?;

        // Setup tile VAO with fixed attribute indices (matched via bind_attrib_location)
        context.bind_vertex_array(Some(&tile_vao));
        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&tile_buffer));
        let pos_loc: u32 = 0;
        let tex_loc: u32 = 1;
        context.enable_vertex_attrib_array(pos_loc);
        context.enable_vertex_attrib_array(tex_loc);
        context.vertex_attrib_pointer_with_i32(pos_loc, 2, WebGl2RenderingContext::FLOAT, false, 16, 0);
        context.vertex_attrib_pointer_with_i32(tex_loc, 2, WebGl2RenderingContext::FLOAT, false, 16, 8);

        // Setup point VAO with fixed attribute indices (matched via bind_attrib_location)
        context.bind_vertex_array(Some(&point_vao));
        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&point_buffer));
        context.enable_vertex_attrib_array(0); // a_position
        context.enable_vertex_attrib_array(1); // a_size
        context.enable_vertex_attrib_array(2); // a_color
        // stride = 28 bytes (7 floats: 2+1+4)
        context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, 28, 0);   // pos
        context.vertex_attrib_pointer_with_i32(1, 1, WebGl2RenderingContext::FLOAT, false, 28, 8);   // size
        context.vertex_attrib_pointer_with_i32(2, 4, WebGl2RenderingContext::FLOAT, false, 28, 12);  // color

        self.gl_state = Some(WebGlState {
            context: context.clone(),
            programs,
            tile_vao: OwnedVAO::new(&context, tile_vao),
            point_vao: OwnedVAO::new(&context, point_vao),
            line_vao: OwnedVAO::new(&context, line_vao),
            polygon_vao: OwnedVAO::new(&context, polygon_vao),
            tile_buffer: OwnedBuffer::new(&context, tile_buffer),
            point_buffer: OwnedBuffer::new(&context, point_buffer),
            line_buffer: OwnedBuffer::new(&context, line_buffer),
            polygon_buffer: OwnedBuffer::new(&context, polygon_buffer),
            polygon_u_origin,
            polygon_u_world_scale,
            line_u_origin,
            line_u_world_scale,
        });

        Ok(())
    }

    fn create_shader_programs(&self, context: &WebGl2RenderingContext) -> Result<ShaderPrograms, JsValue> {
        // Tile shader program with proper orthographic projection
        let tile_vertex_shader = self.create_shader(
            context,
            WebGl2RenderingContext::VERTEX_SHADER,
            r#"
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            uniform mat4 u_matrix;
            varying vec2 v_texCoord;

            void main() {
                vec4 position = u_matrix * vec4(a_position, 0.0, 1.0);
                gl_Position = position;
                v_texCoord = a_texCoord;
            }
            "#,
        )?;

        let tile_fragment_shader = self.create_shader(
            context,
            WebGl2RenderingContext::FRAGMENT_SHADER,
            r#"
            precision mediump float;
            uniform sampler2D u_texture;
            varying vec2 v_texCoord;

            void main() {
                gl_FragColor = texture2D(u_texture, v_texCoord);
            }
            "#,
        )?;

        let tile_program = self.create_program_with_bindings(
            context,
            &tile_vertex_shader,
            &tile_fragment_shader,
            &[(0, "a_position"), (1, "a_texCoord")],
        )?;

        // Point shader program
        let point_vertex_shader = self.create_shader(
            context,
            WebGl2RenderingContext::VERTEX_SHADER,
            r#"
            attribute vec2 a_position;
            attribute float a_size;
            attribute vec4 a_color;
            uniform mat4 u_matrix;
            varying vec4 v_color;

            void main() {
                gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
                gl_PointSize = a_size;
                v_color = a_color;
            }
            "#,
        )?;

        let point_fragment_shader = self.create_shader(
            context,
            WebGl2RenderingContext::FRAGMENT_SHADER,
            r#"
            precision mediump float;
            varying vec4 v_color;

            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                gl_FragColor = v_color;
            }
            "#,
        )?;

        let line_vertex_shader = self.create_shader(
            context,
            WebGl2RenderingContext::VERTEX_SHADER,
            r#"
            attribute vec2 a_position;
            attribute vec4 a_color;
            varying vec4 v_color;
            uniform mat4 u_matrix;
            uniform float u_world_scale;
            uniform vec2 u_origin;

            void main() {
                vec2 pixel_pos = a_position * u_world_scale;
                vec2 screen_pos = pixel_pos - u_origin;
                gl_Position = u_matrix * vec4(screen_pos, 0.0, 1.0);
                v_color = a_color;
            }
            "#,
        )?;

        let line_fragment_shader = self.create_shader(
            context,
            WebGl2RenderingContext::FRAGMENT_SHADER,
            r#"
            precision mediump float;
            varying vec4 v_color;

            void main() {
                gl_FragColor = v_color;
            }
            "#,
        )?;

        let point_program = self.create_program_with_bindings(
            context,
            &point_vertex_shader,
            &point_fragment_shader,
            &[(0, "a_position"), (1, "a_size"), (2, "a_color")],
        )?;

        // Line program
        let line_program = self.create_program_with_bindings(
            context,
            &line_vertex_shader,
            &line_fragment_shader,
            &[(0, "a_position"), (1, "a_color")],
        )?;

        // Polygon shader program
        let polygon_vertex_shader = self.create_shader(
            context,
            WebGl2RenderingContext::VERTEX_SHADER,
            r#"
            attribute vec2 a_position;
            attribute vec4 a_color;
            varying vec4 v_color;
            uniform mat4 u_matrix;
            uniform float u_world_scale;
            uniform vec2 u_origin;

            void main() {
                vec2 pixel_pos = a_position * u_world_scale;
                vec2 screen_pos = pixel_pos - u_origin;
                gl_Position = u_matrix * vec4(screen_pos, 0.0, 1.0);
                v_color = a_color;
            }
            "#,
        )?;

        let polygon_fragment_shader = self.create_shader(
            context,
            WebGl2RenderingContext::FRAGMENT_SHADER,
            r#"
            precision mediump float;
            varying vec4 v_color;

            void main() {
                gl_FragColor = v_color;
            }
            "#,
        )?;

        let polygon_program = self.create_program_with_bindings(
            context,
            &polygon_vertex_shader,
            &polygon_fragment_shader,
            &[(0, "a_position"), (1, "a_color")],
        )?;

        Ok(ShaderPrograms {
            tile_program: OwnedProgram::new(context, tile_program, tile_vertex_shader, tile_fragment_shader),
            point_program: OwnedProgram::new(context, point_program, point_vertex_shader, point_fragment_shader),
            line_program: OwnedProgram::new(context, line_program, line_vertex_shader, line_fragment_shader),
            polygon_program: OwnedProgram::new(context, polygon_program, polygon_vertex_shader, polygon_fragment_shader),
        })
    }

    fn create_shader(&self, context: &WebGl2RenderingContext, shader_type: u32, source: &str) -> Result<WebGlShader, JsValue> {
        let shader = context.create_shader(shader_type)
            .ok_or_else(|| JsValue::from_str("Failed to create shader"))?;
        context.shader_source(&shader, source);
        context.compile_shader(&shader);

        if !context.get_shader_parameter(&shader, WebGl2RenderingContext::COMPILE_STATUS).as_bool().unwrap_or(false) {
            let info = context.get_shader_info_log(&shader).unwrap_or_else(|| "Unknown error".to_string());
            return Err(JsValue::from_str(&format!("Shader compilation error: {}", info)));
        }

        Ok(shader)
    }

    fn create_program(&self, context: &WebGl2RenderingContext, vertex_shader: &WebGlShader, fragment_shader: &WebGlShader) -> Result<WebGlProgram, JsValue> {
        let program = context.create_program()
            .ok_or_else(|| JsValue::from_str("Failed to create program"))?;
        context.attach_shader(&program, vertex_shader);
        context.attach_shader(&program, fragment_shader);
        context.link_program(&program);

        if !context.get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS).as_bool().unwrap_or(false) {
            let info = context.get_program_info_log(&program).unwrap_or_else(|| "Unknown error".to_string());
            return Err(JsValue::from_str(&format!("Program linking error: {}", info)));
        }

        Ok(program)
    }

    fn create_program_with_bindings(&self, context: &WebGl2RenderingContext, vertex_shader: &WebGlShader, fragment_shader: &WebGlShader, bindings: &[(u32, &str)]) -> Result<WebGlProgram, JsValue> {
        let program = context.create_program()
            .ok_or_else(|| JsValue::from_str("Failed to create program"))?;
        context.attach_shader(&program, vertex_shader);
        context.attach_shader(&program, fragment_shader);
        // Bind attribute locations before linking
        for (index, name) in bindings {
            context.bind_attrib_location(&program, *index, name);
        }
        context.link_program(&program);

        if !context.get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS).as_bool().unwrap_or(false) {
            let info = context.get_program_info_log(&program).unwrap_or_else(|| "Unknown error".to_string());
            return Err(JsValue::from_str(&format!("Program linking error: {}", info)));
        }

        Ok(program)
    }

    pub fn render(&mut self, canvas_id: &str) -> Result<(), JsValue> {
        // Initialize canvas if not done yet
        if self.canvas.is_none() {
            self.init_canvas(canvas_id)?;
            // Now that GL is ready, trigger tile loading for the current view
            self.load_visible_tiles();
        }

        // Get context without borrowing self
        let context = if let Some(ref gl_state) = self.gl_state {
            gl_state.context.clone()
        } else {
            return Ok(());
        };

        // Apply momentum if active (stop conditions handled internally)
        if self.has_momentum {
            self.apply_momentum();
        }

        // Clear the canvas
        context.clear_color(0.9, 0.9, 0.9, 1.0); // Light gray background
        context.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);

        // Set viewport
        context.viewport(0, 0, self.width as i32, self.height as i32);

        // Render tiles, points, lines, polygons, and GeoJSON
        self.render_tiles(&context)?;
        self.render_points(&context)?;
        self.render_lines(&context)?;
        self.render_polygons(&context)?;
        self.render_geojson(&context)?;

        Ok(())
    }

    fn render_tiles(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.tile_layer.is_none() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            let tile_zoom = self.zoom.round() as u32;
            
            let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, tile_zoom);
            
            let start_x = center_pixel.0 - (self.width as f64 / 2.0);
            let start_y = center_pixel.1 - (self.height as f64 / 2.0);

            let start_tile_x = (start_x / self.tile_size as f64).floor() as i32;
            let start_tile_y = (start_y / self.tile_size as f64).floor() as i32;
            let tiles_x = (self.width as f64 / self.tile_size as f64).ceil() as i32 + 2;
            let tiles_y = (self.height as f64 / self.tile_size as f64).ceil() as i32 + 2;

            // Use tile shader program
            context.use_program(Some(gl_state.programs.tile_program.inner()));
            context.bind_vertex_array(Some(gl_state.tile_vao.inner()));

            // Set up projection matrix - orthographic projection for 2D tiles
            let projection_matrix = [
                2.0 / self.width as f32, 0.0, 0.0, 0.0,
                0.0, -2.0 / self.height as f32, 0.0, 0.0,
                0.0, 0.0, -1.0, 0.0,
                -1.0, 1.0, 0.0, 1.0,
            ];
            let u_matrix: Option<WebGlUniformLocation> = context.get_uniform_location(gl_state.programs.tile_program.inner(), "u_matrix");
            if let Some(loc) = u_matrix.as_ref() {
                context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
            }

            // Set up texture uniform
            let u_texture: Option<WebGlUniformLocation> = context.get_uniform_location(gl_state.programs.tile_program.inner(), "u_texture");
            if let Some(loc) = u_texture.as_ref() {
                context.uniform1i(Some(loc), 0); // Use texture unit 0
            }

            // Enable blending for transparent tiles
            context.enable(WebGl2RenderingContext::BLEND);
            context.blend_func(WebGl2RenderingContext::SRC_ALPHA, WebGl2RenderingContext::ONE_MINUS_SRC_ALPHA);

            let mut tiles_rendered = 0;
            let mut tiles_found = 0;
            let mut tiles_to_load = Vec::new();
            for i in 0..tiles_x {
                for j in 0..tiles_y {
                    let tile_x = start_tile_x + i;
                    let tile_y = start_tile_y + j;

                    if tile_x >= 0 && tile_y >= 0 && tile_x < (1 << tile_zoom) && tile_y < (1 << tile_zoom) {
                        let key = format!("{}/{}/{}", tile_zoom, tile_x, tile_y);
                        let pixel_x = (tile_x * self.tile_size as i32) as f64 - start_x;
                        let pixel_y = (tile_y * self.tile_size as i32) as f64 - start_y;

                        if let Some(texture) = self.tile_loader.textures.borrow().get(&key) {
                                tiles_found += 1;
                                
                                // Bind texture
                                context.active_texture(WebGl2RenderingContext::TEXTURE0);
                                context.bind_texture(WebGl2RenderingContext::TEXTURE_2D, Some(texture));

                                // Create quad vertices for this tile in pixel coordinates
                                let vertices = Float32Array::new_with_length(16);

                                // Pixel coordinates (0,0 at top-left)
                                let x0 = pixel_x as f32;
                                let y0 = pixel_y as f32;
                                let x1 = (pixel_x + self.tile_size as f64) as f32;
                                let y1 = (pixel_y + self.tile_size as f64) as f32;

                                // Top-left
                                vertices.set_index(0, x0);
                                vertices.set_index(1, y0);
                                vertices.set_index(2, 0.0);
                                vertices.set_index(3, 0.0);

                                // Bottom-left
                                vertices.set_index(4, x0);
                                vertices.set_index(5, y1);
                                vertices.set_index(6, 0.0);
                                vertices.set_index(7, 1.0);

                                // Top-right
                                vertices.set_index(8, x1);
                                vertices.set_index(9, y0);
                                vertices.set_index(10, 1.0);
                                vertices.set_index(11, 0.0);

                                // Bottom-right
                                vertices.set_index(12, x1);
                                vertices.set_index(13, y1);
                                vertices.set_index(14, 1.0);
                                vertices.set_index(15, 1.0);

                                context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.tile_buffer.inner()));
                                context.buffer_data_with_array_buffer_view(
                                    WebGl2RenderingContext::ARRAY_BUFFER,
                                    &vertices,
                                    WebGl2RenderingContext::DYNAMIC_DRAW,
                                );

                                // Draw the tile
                                context.draw_arrays(WebGl2RenderingContext::TRIANGLE_STRIP, 0, 4);
                                tiles_rendered += 1;
                            } else {
                                // Request tile if not yet in cache - force immediate load
                                let tile_coord = TileCoord { x: tile_x, y: tile_y, z: tile_zoom };
                                let should_load = !self.tile_loader.requested.contains(&key);
                                if should_load {
                                    tiles_to_load.push((key.clone(), tile_coord));
                                }
                            }
                        }
                    }
                }
            
            if tiles_rendered == 0 {
                // No tiles rendered - could indicate various issues
            }
            
            // Load tiles that were missing
            for (key, tile_coord) in tiles_to_load {
                self.tile_loader.requested.insert(key);
                self.load_tile(tile_coord);
            }
            
            // Disable blending when done
            context.disable(WebGl2RenderingContext::BLEND);
        }

        Ok(())
    }

    fn render_points(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.point_layers.is_empty() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            context.use_program(Some(gl_state.programs.point_program.inner()));
            context.bind_vertex_array(Some(gl_state.point_vao.inner()));

            for layer in &self.point_layers {
                if !layer.visible {
                    continue;
                }

                // Collect all point data
                let mut vertex_data = Vec::new();

                for point in layer.points.iter() {
                    let screen_pos = self.viewport().lat_lng_to_screen(point.lat, point.lng);
                    vertex_data.extend_from_slice(&[
                        screen_pos.0 as f32, screen_pos.1 as f32,
                        point.size,
                        point.color[0], point.color[1], point.color[2], point.color[3],
                    ]);
                }

                if !vertex_data.is_empty() {
                    let vertices = Float32Array::new_with_length(vertex_data.len() as u32);
                    for (i, &val) in vertex_data.iter().enumerate() {
                        vertices.set_index(i as u32, val);
                    }

                    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.point_buffer.inner()));
                    context.buffer_data_with_array_buffer_view(
                        WebGl2RenderingContext::ARRAY_BUFFER,
                        &vertices,
                        WebGl2RenderingContext::STATIC_DRAW,
                    );

                    // Draw points
                    context.draw_arrays(WebGl2RenderingContext::POINTS, 0, layer.points.len() as i32);
                }
            }
        }

        Ok(())
    }

    fn render_lines(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.line_layers.is_empty() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            context.use_program(Some(gl_state.programs.line_program.inner()));
            context.bind_vertex_array(Some(gl_state.line_vao.inner()));

            for layer in &self.line_layers {
                if !layer.visible {
                    continue;
                }

                // Collect all line segment data
                let mut vertex_data = Vec::new();

                for line in layer.lines.iter() {
                    // Convert line points to screen coordinates and create segments
                    for i in 0..line.points.len().saturating_sub(1) {
                        let start = line.points[i];
                        let end = line.points[i + 1];
                        
                        let start_screen = self.viewport().lat_lng_to_screen(start[0], start[1]);
                        let end_screen = self.viewport().lat_lng_to_screen(end[0], end[1]);
                        
                        // Create line segment with points and attributes
                        // Each segment gets both endpoints with the same color
                        vertex_data.extend_from_slice(&[
                            start_screen.0 as f32, start_screen.1 as f32,
                            line.color[0], line.color[1], line.color[2], line.color[3],
                            end_screen.0 as f32, end_screen.1 as f32,
                            line.color[0], line.color[1], line.color[2], line.color[3],
                        ]);
                    }
                }

                if !vertex_data.is_empty() {
                    let vertices = Float32Array::new_with_length(vertex_data.len() as u32);
                    for (i, &val) in vertex_data.iter().enumerate() {
                        vertices.set_index(i as u32, val);
                    }

                    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.line_buffer.inner()));
                    context.buffer_data_with_array_buffer_view(
                        WebGl2RenderingContext::ARRAY_BUFFER,
                        &vertices,
                        WebGl2RenderingContext::STATIC_DRAW,
                    );

                    // Set up attributes for line rendering
                    let stride = 6 * 4; // 6 floats per vertex * 4 bytes
                    
                    // Position attribute (vec2)
                    context.enable_vertex_attrib_array(0);
                    context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                    
                    // Color attribute (vec4)
                    context.enable_vertex_attrib_array(1);
                    context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

                    // Set u_origin and u_world_scale for line shader (screen coords, so identity transform)
                    if let Some(ref loc) = gl_state.line_u_origin {
                        context.uniform2f(Some(loc), 0.0, 0.0);
                    }
                    if let Some(ref loc) = gl_state.line_u_world_scale {
                        context.uniform1f(Some(loc), 1.0);
                    }

                    // Draw lines as line segments
                    let total_vertices = vertex_data.len() / 6; // 6 floats per vertex
                    context.draw_arrays(WebGl2RenderingContext::LINES, 0, total_vertices as i32);
                }
            }
        }

        Ok(())
    }

    fn render_polygons(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.polygon_layers.is_empty() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            context.use_program(Some(gl_state.programs.polygon_program.inner()));
            context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));

            for layer in &self.polygon_layers {
                if !layer.visible {
                    continue;
                }

                // Collect all polygon triangle data
                let mut vertex_data = Vec::new();

                for polygon in layer.polygons.iter() {
                    if polygon.rings.is_empty() {
                        continue;
                    }

                    // Process outer ring and holes
                    for ring in &polygon.rings {
                        if ring.len() < 3 {
                            continue;
                        }

                        // Triangulate the ring
                        let triangles = self.triangulate_polygon(ring);
                        
                        // Convert triangles to screen coordinates
                        for triangle in triangles.chunks(3) {
                            if triangle.len() == 3 {
                                for &[lat, lng] in triangle {
                                    let screen_pos = self.viewport().lat_lng_to_screen(lat, lng);
                                    vertex_data.extend_from_slice(&[
                                        screen_pos.0 as f32, screen_pos.1 as f32,
                                        polygon.color[0], polygon.color[1], polygon.color[2], polygon.color[3],
                                    ]);
                                }
                            }
                        }
                    }
                }

                if !vertex_data.is_empty() {
                    let vertices = Float32Array::new_with_length(vertex_data.len() as u32);
                    for (i, &val) in vertex_data.iter().enumerate() {
                        vertices.set_index(i as u32, val);
                    }

                    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.polygon_buffer.inner()));
                    context.buffer_data_with_array_buffer_view(
                        WebGl2RenderingContext::ARRAY_BUFFER,
                        &vertices,
                        WebGl2RenderingContext::STATIC_DRAW,
                    );

                    // Set up attributes for polygon rendering
                    let stride = 6 * 4; // 6 floats per vertex * 4 bytes
                    
                    // Position attribute (vec2)
                    context.enable_vertex_attrib_array(0);
                    context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                    
                    // Color attribute (vec4)
                    context.enable_vertex_attrib_array(1);
                    context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

                    // Draw polygons as triangles
                    let total_vertices = vertex_data.len() / 6; // 6 floats per vertex
                    context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices as i32);
                }
            }
        }

        Ok(())
    }

    fn create_projection_matrix(&self) -> [f32; 16] {
        // Orthographic projection that converts pixel coordinates into NDC
        // Matches the tile program's matrix so all layers share the same space
        let w = self.width as f32;
        let h = self.height as f32;
        [
            2.0 / w, 0.0,      0.0, 0.0,
            0.0,     -2.0 / h, 0.0, 0.0,
            0.0,      0.0,     -1.0, 0.0,
            -1.0,     1.0,      0.0, 1.0,
        ]
    }

    fn create_pixel_projection_matrix(&self) -> [f32; 16] {
        // Projection matrix for world-pixel coordinates (Web Mercator pixel space)
        // Subtracts the viewport origin so the vertex shader receives the same
        // coords regardless of pan position
        let w = self.width as f32;
        let h = self.height as f32;
        let zoom = self.zoom.round() as u32;
        let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
        let origin_x = center_pixel.0 - (self.width as f64 / 2.0);
        let origin_y = center_pixel.1 - (self.height as f64 / 2.0);
        [
            2.0 / w,       0.0,           0.0, 0.0,
            0.0,           -2.0 / h,      0.0, 0.0,
            0.0,            0.0,          -1.0, 0.0,
            -(2.0 * origin_x as f32 / w + 1.0),
            2.0 * origin_y as f32 / h + 1.0,
            0.0, 1.0,
        ]
    }

    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), JsValue> {
        self.width = width;
        self.height = height;
        if let Some(ref canvas) = self.canvas {
            canvas.set_width(width);
            canvas.set_height(height);
        }
        if let Some(ref gl_state) = self.gl_state {
            gl_state.context.viewport(0, 0, width as i32, height as i32);
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn screen_xy(&self, lat: f64, lng: f64) -> Array {
        self.viewport().screen_xy(lat, lng)
    }

    // removed stale canvas 2D debug renderer

    // Event handling methods (simplified)
    fn trigger_feature_click(&mut self, hit_info: serde_json::Value) {
        // Feature click event triggered with hit information
        // In a full implementation, this would call registered JavaScript callbacks
        web_sys::console::log_1(&JsValue::from_str(&format!("Feature clicked: {:?}", hit_info)));
    }

    // Public event registration methods
    #[wasm_bindgen]
    pub fn on_move(&mut self, callback: &js_sys::Function) {
        self.move_callbacks.push(Box::new(callback.clone()));
    }

    #[wasm_bindgen]
    pub fn on_zoom(&mut self, callback: &js_sys::Function) {
        self.zoom_callbacks.push(Box::new(callback.clone()));
    }

    #[wasm_bindgen]
    pub fn on_click(&mut self, callback: &js_sys::Function) {
        self.click_callbacks.push(Box::new(callback.clone()));
    }

    #[wasm_bindgen]
    pub fn on_hover(&mut self, callback: &js_sys::Function) {
        self.hover_callbacks.push(Box::new(callback.clone()));
    }

    // Event removal methods - remove all matching callbacks
    #[wasm_bindgen]
    pub fn off_move(&mut self, callback: &js_sys::Function) {
        self.move_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    #[wasm_bindgen]
    pub fn off_zoom(&mut self, callback: &js_sys::Function) {
        self.zoom_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    #[wasm_bindgen]
    pub fn off_click(&mut self, callback: &js_sys::Function) {
        self.click_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    #[wasm_bindgen]
    pub fn off_hover(&mut self, callback: &js_sys::Function) {
        self.hover_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    // Additional event registration methods
    #[wasm_bindgen]
    pub fn on_mouse_down(&mut self, callback: &js_sys::Function) {
        self.mousedown_callbacks.push(Box::new(callback.clone()));
    }

    #[wasm_bindgen]
    pub fn on_mouse_up(&mut self, callback: &js_sys::Function) {
        self.mouseup_callbacks.push(Box::new(callback.clone()));
    }

    #[wasm_bindgen]
    pub fn on_contextmenu(&mut self, callback: &js_sys::Function) {
        self.contextmenu_callbacks.push(Box::new(callback.clone()));
    }

    #[wasm_bindgen]
    pub fn on_key_down(&mut self, callback: &js_sys::Function) {
        self.keydown_callbacks.push(Box::new(callback.clone()));
    }

    #[wasm_bindgen]
    pub fn on_key_up(&mut self, callback: &js_sys::Function) {
        self.keyup_callbacks.push(Box::new(callback.clone()));
    }

    // Additional event removal methods
    #[wasm_bindgen]
    pub fn off_mouse_down(&mut self, callback: &js_sys::Function) {
        self.mousedown_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    #[wasm_bindgen]
    pub fn off_mouse_up(&mut self, callback: &js_sys::Function) {
        self.mouseup_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    #[wasm_bindgen]
    pub fn off_contextmenu(&mut self, callback: &js_sys::Function) {
        self.contextmenu_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    #[wasm_bindgen]
    pub fn off_key_down(&mut self, callback: &js_sys::Function) {
        self.keydown_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    #[wasm_bindgen]
    pub fn off_key_up(&mut self, callback: &js_sys::Function) {
        self.keyup_callbacks.retain(|cb| cb.as_ref() != callback);
    }

  #[wasm_bindgen]
    pub fn on_dragend(&mut self, callback: &js_sys::Function) {
        self.dragend_callbacks.push(Box::new(callback.clone()));
    }

  #[wasm_bindgen]
    pub fn off_dragend(&mut self, callback: &js_sys::Function) {
        self.dragend_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    // Event trigger methods
    fn trigger_move_event(&self) {
        if let Ok(event_obj) = self.create_map_event("move") {
            for callback in &self.move_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    fn trigger_zoom_event(&self) {
        if let Ok(event_obj) = self.create_map_event("zoom") {
            for callback in &self.zoom_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    fn trigger_click_event(&self, lat: f64, lng: f64, original_event: Option<&web_sys::MouseEvent>) {
        if let Ok(event_obj) = self.create_click_event(lat, lng, original_event) {
            for callback in &self.click_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    fn trigger_hover_event(&self, lat: f64, lng: f64, original_event: Option<&web_sys::MouseEvent>) {
        if let Ok(event_obj) = self.create_hover_event(lat, lng, original_event) {
            for callback in &self.hover_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    fn trigger_mousedown_event(&self, lat: f64, lng: f64, original_event: Option<&web_sys::MouseEvent>) {
        if let Ok(event_obj) = self.create_click_event(lat, lng, original_event) {
            for callback in &self.mousedown_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    fn trigger_mouseup_event(&self, lat: f64, lng: f64, original_event: Option<&web_sys::MouseEvent>) {
        if let Ok(event_obj) = self.create_click_event(lat, lng, original_event) {
            for callback in &self.mouseup_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    fn trigger_contextmenu_event(&self, lat: f64, lng: f64, original_event: Option<&web_sys::MouseEvent>) {
        if let Ok(event_obj) = self.create_click_event(lat, lng, original_event) {
            for callback in &self.contextmenu_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    fn trigger_dragend_event(&self) {
        if let Ok(event_obj) = self.create_map_event("dragend") {
            for callback in &self.dragend_callbacks {
                let _ = callback.call1(&JsValue::null(), &event_obj);
            }
        }
    }

    // Event object creation methods
    fn create_map_event(&self, event_type: &str) -> Result<JsValue, JsValue> {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str(event_type))
            .map_err(|e| JsValue::from_str(&format!("Failed to set event type: {:?}", e)))?;
        js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
            .map_err(|e| JsValue::from_str(&format!("Failed to set target: {:?}", e)))?;
        js_sys::Reflect::set(&obj, &JsValue::from_str("sourceTarget"), &JsValue::null())
            .map_err(|e| JsValue::from_str(&format!("Failed to set sourceTarget: {:?}", e)))?;
        
        // Add map state
        let center = self.get_center();
        js_sys::Reflect::set(&obj, &JsValue::from_str("center"), &center)
            .map_err(|e| JsValue::from_str(&format!("Failed to set center: {:?}", e)))?;
        
        let zoom = JsValue::from_f64(self.zoom);
        js_sys::Reflect::set(&obj, &JsValue::from_str("zoom"), &zoom)
            .map_err(|e| JsValue::from_str(&format!("Failed to set zoom: {:?}", e)))?;
        
        let bounds = self.get_bounds();
        js_sys::Reflect::set(&obj, &JsValue::from_str("bounds"), &bounds)
            .map_err(|e| JsValue::from_str(&format!("Failed to set bounds: {:?}", e)))?;
        
        Ok(obj.into())
    }

    fn create_click_event(&self, lat: f64, lng: f64, _original_event: Option<&web_sys::MouseEvent>) -> Result<JsValue, JsValue> {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str("click"))
            .map_err(|e| JsValue::from_str(&format!("Failed to set click type: {:?}", e)))?;
        js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
            .map_err(|e| JsValue::from_str(&format!("Failed to set click target: {:?}", e)))?;
        
        // Add latlng
        let latlng = Array::new();
        latlng.push(&JsValue::from_f64(lat));
        latlng.push(&JsValue::from_f64(lng));
        js_sys::Reflect::set(&obj, &JsValue::from_str("latlng"), &latlng)
            .map_err(|e| JsValue::from_str(&format!("Failed to set click latlng: {:?}", e)))?;
        
        // Add container point
        let point = self.project(&JsValue::from(latlng));
        js_sys::Reflect::set(&obj, &JsValue::from_str("containerPoint"), &point)
            .map_err(|e| JsValue::from_str(&format!("Failed to set click containerPoint: {:?}", e)))?;
        
        // Add layer point (same as container point for map-level events)
        js_sys::Reflect::set(&obj, &JsValue::from_str("layerPoint"), &point)
            .map_err(|e| JsValue::from_str(&format!("Failed to set click layerPoint: {:?}", e)))?;
        
        Ok(obj.into())
    }

    fn create_hover_event(&self, lat: f64, lng: f64, _original_event: Option<&web_sys::MouseEvent>) -> Result<JsValue, JsValue> {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str("hover"))
            .map_err(|e| JsValue::from_str(&format!("Failed to set hover type: {:?}", e)))?;
        js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
            .map_err(|e| JsValue::from_str(&format!("Failed to set hover target: {:?}", e)))?;
        
        // Add latlng
        let latlng = Array::new();
        latlng.push(&JsValue::from_f64(lat));
        latlng.push(&JsValue::from_f64(lng));
        js_sys::Reflect::set(&obj, &JsValue::from_str("latlng"), &latlng)
            .map_err(|e| JsValue::from_str(&format!("Failed to set hover latlng: {:?}", e)))?;
        
        Ok(obj.into())
    }

    // Public methods for JavaScript
    #[wasm_bindgen]
    pub fn pan(&mut self, delta_x: f64, delta_y: f64) {
        let zoom = self.zoom.round() as u32;
        let pixel_center = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);

        // Note: delta_x and delta_y are in screen pixels (standard web coordinates)
        // Positive delta_x means mouse moved right, so we want to show area to the left (west)
        // Positive delta_y means mouse moved down, so we want to show area above (north)
        // This is the standard behavior: dragging down shows what's above the current view
        let new_pixel_x = pixel_center.0 - delta_x;
        let new_pixel_y = pixel_center.1 - delta_y;

        let (new_lat, new_lng) = self.viewport().pixel_to_lat_lng(new_pixel_x, new_pixel_y, zoom);

        // Clamp coordinates to valid Web Mercator ranges
        // Latitude: -85.05112878 to 85.05112878 degrees (to avoid singularity at poles)
        let clamped_lat = new_lat.max(-85.05112878).min(85.05112878);
        // Longitude: -180 to 180 degrees (wrap around)
        let mut clamped_lng = new_lng;
        while clamped_lng > 180.0 {
            clamped_lng -= 360.0;
        }
        while clamped_lng < -180.0 {
            clamped_lng += 360.0;
        }

        // Only update if coordinates are valid (not NaN)
        if clamped_lat.is_finite() && clamped_lng.is_finite() {
            self.center_lat = clamped_lat;
            self.center_lng = clamped_lng;
            self.load_visible_tiles();
            self.trigger_move_event();
        }
    }

    #[wasm_bindgen]
    pub fn zoom_in(&mut self) {
        if self.zoom < 18.0 {
            self.zoom += 1.0;
            self.load_visible_tiles();
            self.trigger_zoom_event();
        }
    }

    #[wasm_bindgen]
    pub fn zoom_out(&mut self) {
        if self.zoom > 1.0 {
            self.zoom -= 1.0;
            self.load_visible_tiles();
            self.trigger_zoom_event();
        }
    }

    // Missing API methods for Leaflet compatibility
    #[wasm_bindgen]
    pub fn get_center(&self) -> Array {
        let arr = Array::new();
        arr.push(&JsValue::from_f64(self.center_lat));
        arr.push(&JsValue::from_f64(self.center_lng));
        arr
    }

    #[wasm_bindgen]
    pub fn get_zoom(&self) -> f64 {
        self.zoom
    }

    #[wasm_bindgen]
    pub fn set_min_zoom(&mut self, _min_zoom: f64) {
        // Store min zoom constraint (implementation would need zoom limit checking)
    }

    #[wasm_bindgen]
    pub fn set_max_zoom(&mut self, _max_zoom: f64) {
        // Store max zoom constraint (implementation would need zoom limit checking)
    }

    #[wasm_bindgen]
    pub fn get_bounds(&self) -> Array {
        // Calculate current visible bounds based on center, zoom, and viewport dimensions
        let zoom = self.zoom.round() as u32;
        let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
        
        let start_x = center_pixel.0 - (self.width as f64 / 2.0);
        let start_y = center_pixel.1 - (self.height as f64 / 2.0);
        let end_x = center_pixel.0 + (self.width as f64 / 2.0);
        let end_y = center_pixel.1 + (self.height as f64 / 2.0);
        
        let (sw_lat, sw_lng) = self.viewport().pixel_to_lat_lng(start_x, end_y, zoom);
        let (ne_lat, ne_lng) = self.viewport().pixel_to_lat_lng(end_x, start_y, zoom);
        
        let arr = Array::new();
        arr.push(&JsValue::from_f64(sw_lat));
        arr.push(&JsValue::from_f64(sw_lng));
        arr.push(&JsValue::from_f64(ne_lat));
        arr.push(&JsValue::from_f64(ne_lng));
        arr
    }

    #[wasm_bindgen]
    pub fn fit_bounds(&mut self, bounds_data: &JsValue) -> Result<(), JsValue> {
        // Validate input is an array
        let bounds_array = js_sys::Array::from(bounds_data);
        
        if bounds_array.length() != 4 {
            return Err(JsValue::from_str("Bounds must be an array of [sw_lat, sw_lng, ne_lat, ne_lng]"));
        }
        
        // Validate all elements are numbers and within valid coordinate ranges
        let sw_lat = bounds_array.get(0).as_f64().ok_or_else(|| JsValue::from_str("sw_lat must be a number"))?;
        let sw_lng = bounds_array.get(1).as_f64().ok_or_else(|| JsValue::from_str("sw_lng must be a number"))?;
        let ne_lat = bounds_array.get(2).as_f64().ok_or_else(|| JsValue::from_str("ne_lat must be a number"))?;
        let ne_lng = bounds_array.get(3).as_f64().ok_or_else(|| JsValue::from_str("ne_lng must be a number"))?;
        
        // Validate coordinate ranges
        if !(sw_lat >= -90.0 && sw_lat <= 90.0) {
            return Err(JsValue::from_str("sw_lat must be between -90 and 90"));
        }
        if !(sw_lng >= -180.0 && sw_lng <= 180.0) {
            return Err(JsValue::from_str("sw_lng must be between -180 and 180"));
        }
        if !(ne_lat >= -90.0 && ne_lat <= 90.0) {
            return Err(JsValue::from_str("ne_lat must be between -90 and 90"));
        }
        if !(ne_lng >= -180.0 && ne_lng <= 180.0) {
            return Err(JsValue::from_str("ne_lng must be between -180 and 180"));
        }
        
        // Validate that bounds are valid (ne > sw)
        if ne_lat <= sw_lat {
            return Err(JsValue::from_str("ne_lat must be greater than sw_lat"));
        }
        if ne_lng <= sw_lng {
            return Err(JsValue::from_str("ne_lng must be greater than sw_lng"));
        }
        
        // Calculate center of bounds
        let center_lat = (sw_lat + ne_lat) / 2.0;
        let center_lng = (sw_lng + ne_lng) / 2.0;
        
        // Calculate appropriate zoom level to fit bounds in viewport
        let zoom = self.calculate_fit_zoom(sw_lat, sw_lng, ne_lat, ne_lng);
        
        // Apply the new view
        self.set_view(center_lat, center_lng, zoom);
        
        Ok(())
    }

    fn calculate_fit_zoom(&self, sw_lat: f64, sw_lng: f64, ne_lat: f64, ne_lng: f64) -> f64 {
        let mut best_zoom = 1.0;
        
        // Calculate center of bounds
        let center_lat = (sw_lat + ne_lat) / 2.0;
        let center_lng = (sw_lng + ne_lng) / 2.0;
        
        // Binary search for the best zoom level
        for zoom in (1..=18).rev() {
            let bounds = self.get_view_bounds_at_zoom(center_lat, center_lng, zoom);
            
            if bounds[0] <= sw_lat && bounds[1] <= sw_lng && 
               bounds[2] >= ne_lat && bounds[3] >= ne_lng {
                best_zoom = zoom as f64;
                break;
            }
        }
        
        best_zoom
    }

    fn get_view_bounds_at_zoom(&self, center_lat: f64, center_lng: f64, zoom: u32) -> [f64; 4] {
        let center_pixel = self.viewport().lat_lng_to_pixel(center_lat, center_lng, zoom);
        
        let start_x = center_pixel.0 - (self.width as f64 / 2.0);
        let start_y = center_pixel.1 - (self.height as f64 / 2.0);
        let end_x = center_pixel.0 + (self.width as f64 / 2.0);
        let end_y = center_pixel.1 + (self.height as f64 / 2.0);
        
        let (sw_lat, sw_lng) = self.viewport().pixel_to_lat_lng(start_x, end_y, zoom);
        let (ne_lat, ne_lng) = self.viewport().pixel_to_lat_lng(end_x, start_y, zoom);
        
        [sw_lat, sw_lng, ne_lat, ne_lng]
    }

    #[wasm_bindgen]
    pub fn project(&self, latlng_data: &JsValue) -> Array {
        let latlng_array = js_sys::Array::from(latlng_data);
        
        if latlng_array.length() < 2 {
            return Array::new();
        }
        
        let lat = latlng_array.get(0).as_f64().unwrap_or(0.0);
        let lng = latlng_array.get(1).as_f64().unwrap_or(0.0);
        
        let zoom = self.zoom.round() as u32;
        let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
        let point_pixel = self.viewport().lat_lng_to_pixel(lat, lng, zoom);
        
        let screen_x = point_pixel.0 - center_pixel.0 + (self.width as f64 / 2.0);
        let screen_y = point_pixel.1 - center_pixel.1 + (self.height as f64 / 2.0);
        
        let arr = Array::new();
        arr.push(&JsValue::from_f64(screen_x));
        arr.push(&JsValue::from_f64(screen_y));
        arr
    }

    #[wasm_bindgen]
    pub fn unproject(&self, point_data: &JsValue) -> Array {
        let point_array = js_sys::Array::from(point_data);
        
        if point_array.length() < 2 {
            return Array::new();
        }
        
        let screen_x = point_array.get(0).as_f64().unwrap_or(0.0);
        let screen_y = point_array.get(1).as_f64().unwrap_or(0.0);
        
        let zoom = self.zoom.round() as u32;
        let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
        
        let point_x = screen_x - (self.width as f64 / 2.0) + center_pixel.0;
        let point_y = screen_y - (self.height as f64 / 2.0) + center_pixel.1;
        
        let (lat, lng) = self.viewport().pixel_to_lat_lng(point_x, point_y, zoom);
        
        let arr = Array::new();
        arr.push(&JsValue::from_f64(lat));
        arr.push(&JsValue::from_f64(lng));
        arr
    }

    // API methods for adding layers
    #[wasm_bindgen]
    pub fn add_tile_layer(&mut self, url_template: &str) -> Result<(), JsValue> {
        let tile_layer = TileLayer {
            url_template: url_template.to_string(),
            subdomains: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            max_zoom: 18,
            min_zoom: 0,
        };
        self.tile_layer = Some(tile_layer);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_point_layer(&mut self) {
        let point_layer = PointLayer {
            points: Vec::new(),
            visible: true,
        };
        self.point_layers.push(point_layer);
    }

    #[wasm_bindgen]
    pub fn add_points(&mut self, layer_index: usize, points_data: &JsValue) -> Result<(), JsValue> {
        if layer_index >= self.point_layers.len() {
            return Err(JsValue::from_str("Layer index out of bounds"));
        }

        let points_array = js_sys::Array::from(points_data);
        let mut points = Vec::new();

        for i in 0..points_array.length() {
            let point_obj = points_array.get(i);
            let lat = js_sys::Reflect::get(&point_obj, &JsValue::from_str("lat"))?
                .as_f64().unwrap_or(0.0);
            let lng = js_sys::Reflect::get(&point_obj, &JsValue::from_str("lng"))?
                .as_f64().unwrap_or(0.0);
            let size = js_sys::Reflect::get(&point_obj, &JsValue::from_str("size"))?
                .as_f64().unwrap_or(5.0) as f32;
            let meta = js_sys::Reflect::get(&point_obj, &JsValue::from_str("meta"))?
                .as_string().unwrap_or_else(|| "{}".to_string());

            let meta_json: serde_json::Value = serde_json::from_str(&meta)
                .unwrap_or(serde_json::json!({}));

            let point = PointFeature {
                lat,
                lng,
                size,
                color: [0.0, 0.5, 1.0, 1.0], // Default blue color
                meta: meta_json,
            };
            points.push(point);
        }

        self.point_layers[layer_index].points = points;
        self.spatial_index_dirty = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_line_layer(&mut self) {
        let line_layer = LineLayer {
            lines: Vec::new(),
            visible: true,
        };
        self.line_layers.push(line_layer);
    }

    #[wasm_bindgen]
    pub fn add_lines(&mut self, layer_index: usize, lines_data: &JsValue) -> Result<(), JsValue> {
        if layer_index >= self.line_layers.len() {
            return Err(JsValue::from_str("Line layer index out of bounds"));
        }

        let lines_array = js_sys::Array::from(lines_data);
        let mut lines = Vec::new();

        for i in 0..lines_array.length() {
            let line_obj = lines_array.get(i);
            let coords_array = js_sys::Reflect::get(&line_obj, &JsValue::from_str("coords"))?;
            let coords = js_sys::Array::from(&coords_array);
            
            let mut points = Vec::new();
            for j in 0..coords.length() {
                let coord_obj = coords.get(j);
                let lat = js_sys::Reflect::get(&coord_obj, &JsValue::from_str("lat"))?
                    .as_f64().unwrap_or(0.0);
                let lng = js_sys::Reflect::get(&coord_obj, &JsValue::from_str("lng"))?
                    .as_f64().unwrap_or(0.0);
                points.push([lat, lng]);
            }

            let color_str = js_sys::Reflect::get(&line_obj, &JsValue::from_str("color"))?
                .as_string().unwrap_or("#ff0000".to_string());
            let color = parse_color(&color_str);

            let width = js_sys::Reflect::get(&line_obj, &JsValue::from_str("width"))?
                .as_f64().unwrap_or(2.0) as f32;

            let meta = js_sys::Reflect::get(&line_obj, &JsValue::from_str("meta"))?;
            let meta_json = if meta.is_object() {
                serde_wasm_bindgen::from_value(meta)?
            } else {
                serde_json::json!({})
            };

            let line = LineFeature {
                points,
                color,
                width,
                meta: meta_json,
            };
            lines.push(line);
        }

        self.line_layers[layer_index].lines = lines;
        self.spatial_index_dirty = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_polygon_layer(&mut self) {
        let polygon_layer = PolygonLayer {
            polygons: Vec::new(),
            visible: true,
        };
        self.polygon_layers.push(polygon_layer);
    }

    #[wasm_bindgen]
    pub fn add_polygons(&mut self, layer_index: usize, polygons_data: &JsValue) -> Result<(), JsValue> {
        if layer_index >= self.polygon_layers.len() {
            return Err(JsValue::from_str("Polygon layer index out of bounds"));
        }

        let polygons_array = js_sys::Array::from(polygons_data);
        let mut polygons = Vec::new();

        for i in 0..polygons_array.length() {
            let polygon_obj = polygons_array.get(i);
            let rings_array = js_sys::Reflect::get(&polygon_obj, &JsValue::from_str("rings"))?;
            let rings = js_sys::Array::from(&rings_array);
            
            let mut polygon_rings = Vec::new();
            for j in 0..rings.length() {
                let ring_array = js_sys::Array::from(&rings.get(j));
                let mut ring_points = Vec::new();
                
                for k in 0..ring_array.length() {
                    let coord_obj = ring_array.get(k);
                    let lat = js_sys::Reflect::get(&coord_obj, &JsValue::from_str("lat"))?
                        .as_f64().unwrap_or(0.0);
                    let lng = js_sys::Reflect::get(&coord_obj, &JsValue::from_str("lng"))?
                        .as_f64().unwrap_or(0.0);
                    ring_points.push([lat, lng]);
                }
                
                if ring_points.len() >= 3 {
                    polygon_rings.push(ring_points);
                }
            }

            let color_str = js_sys::Reflect::get(&polygon_obj, &JsValue::from_str("color"))?
                .as_string().unwrap_or("#ff0000".to_string());
            let color = parse_color(&color_str);

            let meta = js_sys::Reflect::get(&polygon_obj, &JsValue::from_str("meta"))?;
            let meta_json = if meta.is_object() {
                serde_wasm_bindgen::from_value(meta)?
            } else {
                serde_json::json!({})
            };

            let polygon = PolygonFeature {
                rings: polygon_rings,
                color,
                meta: meta_json,
            };
            polygons.push(polygon);
        }

        self.polygon_layers[layer_index].polygons = polygons;
        self.spatial_index_dirty = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_geojson_layer(&mut self) {
        let geojson_layer = GeoJSONLayer {
            features: Vec::new(),
            visible: true,
            style: GeoJSONStyle::default(),
            cached_points: Vec::new(),
            cached_lines: Vec::new(),
            cached_polygon_triangles: Vec::new(),
            polygon_vertex_buffer: RefCell::new(None),
            polygon_vertex_count: Cell::new(0),
            line_vertex_buffer: RefCell::new(None),
            line_vertex_count: Cell::new(0),
        };
        self.geojson_layers.push(geojson_layer);
    }

    #[wasm_bindgen]
    pub fn load_geojson(&mut self, layer_index: usize, geojson_str: &str) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(JsValue::from_str("GeoJSON layer index out of bounds"));
        }

        // Parse GeoJSON string
        let features = self.parse_geojson_string(geojson_str)?;
        self.geojson_layers[layer_index].features = features;
        self.rebuild_geojson_cache(layer_index)?;
        self.spatial_index_dirty = true;

        Ok(())
    }

    #[wasm_bindgen]
    pub fn load_geojson_from_url(&mut self, layer_index: usize, url: &str) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(JsValue::from_str("GeoJSON layer index out of bounds"));
        }

        // Simple synchronous fetch using XMLHttpRequest for now
        let xhr = web_sys::XmlHttpRequest::new()
            .map_err(|e| JsValue::from_str(&format!("Failed to create XMLHttpRequest: {:?}", e)))?;

        // Configure the request
        xhr.open("GET", url).map_err(|e| JsValue::from_str(&format!("Failed to open request: {:?}", e)))?;
        xhr.set_response_type(web_sys::XmlHttpRequestResponseType::Text);

        // Create closure for onload event - we'll just log the success and let JS handle the actual loading
        let xhr_clone = xhr.clone();
        let onload = Closure::wrap(Box::new(move || {
            if xhr_clone.ready_state() == 4 {
                if let Ok(status) = xhr_clone.status() {
                    if status == 200 {
                        if let Some(geojson_str) = xhr_clone.response_text().ok().flatten() {
                            web_sys::console::log_1(&format!("Successfully fetched GeoJSON from URL: {} chars", geojson_str.len()).into());

                            // Store the fetched data in a global variable for JavaScript to access
                            if let Some(window) = web_sys::window() {
                                let _ = js_sys::Reflect::set(&window, &JsValue::from_str("rustyleafGeoJSONData"), &JsValue::from_str(&geojson_str));
                                // Notify JavaScript that data is ready using a timeout
                                web_sys::console::log_1(&"GeoJSON data stored in global variable, JS can now process it".into());
                            }
                        }
                    } else {
                        web_sys::console::log_1(&format!("Failed to fetch GeoJSON: HTTP {}", status).into());
                    }
                } else {
                    web_sys::console::log_1(&"Failed to fetch GeoJSON: Status error".into());
                }
            }
        }) as Box<dyn FnMut()>);

        // Set event handlers
        xhr.set_onload(Some(onload.as_ref().unchecked_ref()));
        xhr.set_onerror(Some(onload.as_ref().unchecked_ref()));
        self.tile_loader.closures.push(onload);

        // Send the request
        xhr.send().map_err(|e| JsValue::from_str(&format!("Failed to send request: {:?}", e)))?;

        Ok(())
    }

    #[wasm_bindgen]
    pub fn load_geojson_chunk(&mut self, layer_index: usize, chunk_str: &str, is_final: bool) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(JsValue::from_str("GeoJSON layer index out of bounds"));
        }

        // Parse chunk and accumulate features
        let chunk_features = self.parse_geojson_chunk(chunk_str, is_final)?;
        self.geojson_layers[layer_index].features.extend(chunk_features);
        // Rebuild cache for streaming too (could be optimized by incremental append)
        self.rebuild_geojson_cache(layer_index)?;
        self.spatial_index_dirty = true;

        Ok(())
    }

    #[wasm_bindgen]
    pub fn clear_geojson_layer(&mut self, layer_index: usize) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(JsValue::from_str("GeoJSON layer index out of bounds"));
        }

        self.geojson_layers[layer_index].features.clear();
        self.geojson_layers[layer_index].cached_points.clear();
        self.geojson_layers[layer_index].cached_lines.clear();
        self.geojson_layers[layer_index].cached_polygon_triangles.clear();
        self.geojson_layers[layer_index].polygon_vertex_buffer.borrow_mut().take();
        self.geojson_layers[layer_index].line_vertex_buffer.borrow_mut().take();
        self.geojson_layers[layer_index].polygon_vertex_count = Cell::new(0);
        self.geojson_layers[layer_index].line_vertex_count = Cell::new(0);
        self.spatial_index_dirty = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_geojson_feature_count(&mut self, layer_index: usize) -> Result<usize, JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(JsValue::from_str("GeoJSON layer index out of bounds"));
        }

        Ok(self.geojson_layers[layer_index].features.len())
    }

    #[wasm_bindgen]
    pub fn set_geojson_style(&mut self, layer_index: usize, style_data: &JsValue) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(JsValue::from_str("GeoJSON layer index out of bounds"));
        }

        // Convert JsValue to serde_json::Value for easier manipulation
        let style_value: serde_json::Value = serde_wasm_bindgen::from_value(style_data.clone())?;
        
        if let Some(style_obj) = style_value.as_object() {
            let mut style = self.geojson_layers[layer_index].style.clone();

            if let Some(point_color) = style_obj.get("pointColor").and_then(|c| c.as_str()) {
                style.point_color = parse_color(point_color);
            }
            if let Some(point_size) = style_obj.get("pointSize").and_then(|s| s.as_f64()) {
                style.point_size = point_size as f32;
            }
            if let Some(line_color) = style_obj.get("lineColor").and_then(|c| c.as_str()) {
                style.line_color = parse_color(line_color);
            }
            if let Some(line_width) = style_obj.get("lineWidth").and_then(|w| w.as_f64()) {
                style.line_width = line_width as f32;
            }
            if let Some(polygon_color) = style_obj.get("polygonColor").and_then(|c| c.as_str()) {
                style.polygon_color = parse_color(polygon_color);
            }

            self.geojson_layers[layer_index].style = style;
        }

        Ok(())
    }

    // Mouse interaction methods
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, canvas_x: f64, canvas_y: f64) {
        self.mouse_state.button_down = true;
        self.mouse_state.last_x = canvas_x;
        self.mouse_state.last_y = canvas_y;
        self.mouse_state.is_dragging = false;

        // Reset drag velocity and accumulated movement
        self.drag_velocity = (0.0, 0.0);
        self.drag_accumulated_x = 0.0;
        self.drag_accumulated_y = 0.0;
        self.has_momentum = false; // Stop any ongoing momentum
        self.last_drag_time = js_sys::Date::now();

        // Convert canvas coordinates to lat/lng and trigger mousedown event
        let point_array = Array::new();
        point_array.push(&JsValue::from_f64(canvas_x));
        point_array.push(&JsValue::from_f64(canvas_y));
        let latlng = self.unproject(&point_array.into());
        if latlng.length() == 2 {
            let lat = latlng.get(0).as_f64().unwrap_or(0.0);
            let lng = latlng.get(1).as_f64().unwrap_or(0.0);
            self.trigger_mousedown_event(lat, lng, None);
        }
    }

    #[wasm_bindgen]
    pub fn on_mouse_move(&mut self, canvas_x: f64, canvas_y: f64) {
        if self.mouse_state.button_down {
            if !self.mouse_state.is_dragging {
                self.mouse_state.is_dragging = true;
            }

            let delta_x = canvas_x - self.mouse_state.last_x;
            let delta_y = canvas_y - self.mouse_state.last_y;

            // Apply drag velocity tracking and momentum accumulation
            apply_drag(
                delta_x, delta_y,
                &mut self.drag_velocity,
                &mut self.drag_accumulated_x, &mut self.drag_accumulated_y,
                &mut self.last_drag_time,
                0.7,
                2000.0,
            );

            // Apply drag immediately for smooth response using precise pixel-based panning
            self.pan(delta_x, delta_y);

            self.mouse_state.last_x = canvas_x;
            self.mouse_state.last_y = canvas_y;
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, canvas_x: f64, canvas_y: f64) {
        if self.mouse_state.button_down {
            self.mouse_state.button_down = false;
            if self.mouse_state.is_dragging {
                self.mouse_state.is_dragging = false;

                // Trigger dragend event
                self.trigger_dragend_event();

                // Apply momentum if there's significant velocity
                let velocity_magnitude = (self.drag_velocity.0 * self.drag_velocity.0 + self.drag_velocity.1 * self.drag_velocity.1).sqrt();
                if velocity_magnitude > 30.0 { // Lower threshold for more responsive momentum
                    // Start momentum animation
                    self.start_momentum_animation();
                } else {
                    // Stop any remaining momentum
                    self.drag_velocity = (0.0, 0.0);
                }
            } else {
                // Mouse click (no drag) - perform hit-testing
                if self.spatial_index_dirty {
                    self.rebuild_spatial_index();
                }
                if let Some(hit_info) = self.hit_test(canvas_x, canvas_y) {
                    self.trigger_feature_click(hit_info);
                } else {
                    // Convert canvas coordinates to lat/lng for map-level click
                    let point_array = Array::new();
                    point_array.push(&JsValue::from_f64(canvas_x));
                    point_array.push(&JsValue::from_f64(canvas_y));
                    let latlng = self.unproject(&point_array.into());
                    if latlng.length() == 2 {
                        let lat = latlng.get(0).as_f64().unwrap_or(0.0);
                        let lng = latlng.get(1).as_f64().unwrap_or(0.0);
                        self.trigger_click_event(lat, lng, None);
                    }
                }
            }

            // Convert canvas coordinates to lat/lng and trigger mouseup event
            let point_array = Array::new();
            point_array.push(&JsValue::from_f64(canvas_x));
            point_array.push(&JsValue::from_f64(canvas_y));
            let latlng = self.unproject(&point_array.into());
            if latlng.length() == 2 {
                let lat = latlng.get(0).as_f64().unwrap_or(0.0);
                let lng = latlng.get(1).as_f64().unwrap_or(0.0);
                self.trigger_mouseup_event(lat, lng, None);
            }
        }
    }

    #[wasm_bindgen]
    pub fn handle_contextmenu(&mut self, canvas_x: f64, canvas_y: f64) {
        // Convert canvas coordinates to lat/lng and trigger contextmenu event
        let point_array = Array::new();
        point_array.push(&JsValue::from_f64(canvas_x));
        point_array.push(&JsValue::from_f64(canvas_y));
        let latlng = self.unproject(&point_array.into());
        if latlng.length() == 2 {
            let lat = latlng.get(0).as_f64().unwrap_or(0.0);
            let lng = latlng.get(1).as_f64().unwrap_or(0.0);
            self.trigger_contextmenu_event(lat, lng, None);
        }
    }

    #[wasm_bindgen]
    pub fn on_wheel(&mut self, delta_y: f64, _canvas_x: f64, _canvas_y: f64) {
        // Zoom based on wheel direction
        if delta_y > 0.0 {
            self.zoom_out();
        } else {
            self.zoom_in();
        }
    }

    // GeoJSON rendering and conversion methods
    fn render_geojson(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.geojson_layers.is_empty() {
            return Ok(());
        }

        // For each GeoJSON layer, convert features to internal layer types and render
        for geojson_layer in &self.geojson_layers {
            if !geojson_layer.visible {
                continue;
            }

            // Fast path: if caches are populated, render them directly
            if !(geojson_layer.cached_points.is_empty()
                && geojson_layer.cached_lines.is_empty()
                && geojson_layer.cached_polygon_triangles.is_empty()) {
                if !geojson_layer.cached_polygon_triangles.is_empty() {
                    // Try GPU buffer fast path first when available
                    let has_gpu_buffer = self.geojson_layers.iter()
                        .any(|l| l.visible && l.polygon_vertex_buffer.borrow().is_some());
                    if has_gpu_buffer {
                        self.render_geojson_polygons(context, &[])?;
                    } else {
                        self.render_geojson_polygon_triangles(context, &geojson_layer.cached_polygon_triangles, geojson_layer.style.polygon_color)?;
                    }
                }
                if !geojson_layer.cached_lines.is_empty() {
                    // Try GPU buffer fast path first when available
                    let has_line_gpu_buffer = self.geojson_layers.iter()
                        .any(|l| l.visible && l.line_vertex_buffer.borrow().is_some());
                    if has_line_gpu_buffer {
                        self.render_geojson_lines(context, &[])?;
                    } else {
                        self.render_geojson_lines(context, &geojson_layer.cached_lines)?;
                    }
                }
                if !geojson_layer.cached_points.is_empty() {
                    self.render_geojson_points(context, &geojson_layer.cached_points)?;
                }
                continue;
            }

            // Convert GeoJSON features to internal point, line, and polygon features
            let mut point_features = Vec::new();
            let mut line_features = Vec::new();
            let mut polygon_features = Vec::new();

            if !geojson_layer.features.is_empty() {
            web_sys::console::log_2(&"Processing GeoJSON features:".into(), &geojson_layer.features.len().into());
        }

            for feature in &geojson_layer.features {
                let style = &geojson_layer.style;
                
                match &feature.geometry {
                    GeoJSONGeometry::Point { coordinates } => {
                        let point_feature = PointFeature {
                            lat: coordinates[1],  // GeoJSON is [lng, lat]
                            lng: coordinates[0],
                            size: style.point_size,
                            color: style.point_color,
                            meta: feature.properties.clone(),
                        };
                        point_features.push(point_feature);
                    },
                    GeoJSONGeometry::MultiPoint { coordinates } => {
                        for coord in coordinates {
                            let point_feature = PointFeature {
                                lat: coord[1],  // GeoJSON is [lng, lat]
                                lng: coord[0],
                                size: style.point_size,
                                color: style.point_color,
                                meta: feature.properties.clone(),
                            };
                            point_features.push(point_feature);
                        }
                    },
                    GeoJSONGeometry::LineString { coordinates } => {
                        let line_points: Vec<[f64; 2]> = coordinates.iter()
                            .map(|coord| [coord[1], coord[0]])  // Convert [lng, lat] to [lat, lng]
                            .collect();
                        
                        if line_points.len() >= 2 {
                            let line_feature = LineFeature {
                                points: line_points,
                                color: style.line_color,
                                width: style.line_width,
                                meta: feature.properties.clone(),
                            };
                            line_features.push(line_feature);
                        }
                    },
                    GeoJSONGeometry::MultiLineString { coordinates } => {
                        for line_coords in coordinates {
                            let line_points: Vec<[f64; 2]> = line_coords.iter()
                                .map(|coord| [coord[1], coord[0]])  // Convert [lng, lat] to [lat, lng]
                                .collect();
                            
                            if line_points.len() >= 2 {
                                let line_feature = LineFeature {
                                    points: line_points,
                                    color: style.line_color,
                                    width: style.line_width,
                                    meta: feature.properties.clone(),
                                };
                                line_features.push(line_feature);
                            }
                        }
                    },
                    GeoJSONGeometry::Polygon { coordinates } => {
                        let polygon_rings: Vec<Vec<[f64; 2]>> = coordinates.iter()
                            .map(|ring| ring.iter()
                                .map(|coord| [coord[1], coord[0]])  // Convert [lng, lat] to [lat, lng]
                                .collect())
                            .collect();

                        if !polygon_rings.is_empty() && polygon_rings[0].len() >= 3 {
                            let polygon_feature = PolygonFeature {
                                rings: polygon_rings,
                                color: style.polygon_color,
                                meta: feature.properties.clone(),
                            };
                            polygon_features.push(polygon_feature);
                        }
                    },
                    GeoJSONGeometry::MultiPolygon { coordinates } => {
                        web_sys::console::log_1(&"Found MultiPolygon geometry".into());
                        for polygon_coords in coordinates {
                            let polygon_rings: Vec<Vec<[f64; 2]>> = polygon_coords.iter()
                                .map(|ring| ring.iter()
                                    .map(|coord| [coord[1], coord[0]])  // Convert [lng, lat] to [lat, lng]
                                    .collect())
                                .collect();
                            
                            if !polygon_rings.is_empty() && polygon_rings[0].len() >= 3 {
                                let polygon_feature = PolygonFeature {
                                    rings: polygon_rings,
                                    color: style.polygon_color,
                                    meta: feature.properties.clone(),
                                };
                                polygon_features.push(polygon_feature);
                            }
                        }
                    },
                }
            }

            // Render converted features: polygons first, outlines second
            web_sys::console::log_2(&"Final polygon features count:".into(), &polygon_features.len().into());

            if !polygon_features.is_empty() {
                self.render_geojson_polygons(context, &polygon_features)?;
            } else {
                web_sys::console::log_1(&"No polygon features to render".into());
            }

            if !line_features.is_empty() {
                self.render_geojson_lines(context, &line_features)?;
            }

            if !point_features.is_empty() {
                self.render_geojson_points(context, &point_features)?;
            }
        }

        Ok(())
    }

    fn render_geojson_points(&self, context: &WebGl2RenderingContext, points: &[PointFeature]) -> Result<(), JsValue> {
        if let Some(ref gl_state) = self.gl_state {
            context.use_program(Some(gl_state.programs.point_program.inner()));
            context.bind_vertex_array(Some(gl_state.point_vao.inner()));

            // Collect all point data
            let mut vertex_data = Vec::new();

            for point in points {
                let screen_pos = self.viewport().lat_lng_to_screen(point.lat, point.lng);
                vertex_data.extend_from_slice(&[
                    screen_pos.0 as f32, screen_pos.1 as f32,
                    point.size,
                    point.color[0], point.color[1], point.color[2], point.color[3],
                ]);
            }

            if !vertex_data.is_empty() {
                let vertices = Float32Array::new_with_length(vertex_data.len() as u32);
                for (i, &val) in vertex_data.iter().enumerate() {
                    vertices.set_index(i as u32, val);
                }

                context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.point_buffer.inner()));
                context.buffer_data_with_array_buffer_view(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    &vertices,
                    WebGl2RenderingContext::STATIC_DRAW,
                );

                // Set up attributes: position(2), size(1), color(4)
                let stride = 7 * 4; // 7 floats * 4 bytes
                context.enable_vertex_attrib_array(0);
                context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                context.enable_vertex_attrib_array(1);
                context.vertex_attrib_pointer_with_i32(1, 1, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);
                context.enable_vertex_attrib_array(2);
                context.vertex_attrib_pointer_with_i32(2, 4, WebGl2RenderingContext::FLOAT, false, stride, 3 * 4);

                // Projection matrix uniform
                let projection_matrix = self.create_projection_matrix();
                let u_matrix_loc = context.get_uniform_location(gl_state.programs.point_program.inner(), "u_matrix");
                if let Some(loc) = u_matrix_loc.as_ref() {
                    context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
                }

                context.draw_arrays(WebGl2RenderingContext::POINTS, 0, points.len() as i32);
            }
        }

        Ok(())
    }

    fn render_geojson_lines(&self, context: &WebGl2RenderingContext, lines: &[LineFeature]) -> Result<(), JsValue> {
        if let Some(ref gl_state) = self.gl_state {
            context.use_program(Some(gl_state.programs.line_program.inner()));
            context.bind_vertex_array(Some(gl_state.line_vao.inner()));

            // Render from cached GPU buffer if available
            if let Some(buffer) = self.geojson_layers.iter().find(|l| l.visible && l.line_vertex_buffer.borrow().is_some()).and_then(|l| l.line_vertex_buffer.borrow().clone()) {
                context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));
                let stride = 6 * 4; // pos(2) + color(4)
                context.enable_vertex_attrib_array(0);
                context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                context.enable_vertex_attrib_array(1);
                context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

                let projection_matrix = self.create_projection_matrix();
                let u_matrix_loc = context.get_uniform_location(gl_state.programs.line_program.inner(), "u_matrix");
                if let Some(loc) = u_matrix_loc.as_ref() {
                    context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
                }

                if let Some(ref loc) = gl_state.line_u_origin {
                    let zoom = self.zoom.round() as u32;
                    let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
                    let origin_x = center_pixel.0 - (self.width as f64 / 2.0);
                    let origin_y = center_pixel.1 - (self.height as f64 / 2.0);
                    context.uniform2f(Some(loc), origin_x as f32, origin_y as f32);
                }
                if let Some(ref loc) = gl_state.line_u_world_scale {
                    let zoom = self.zoom.round() as u32;
                    let world_scale = self.tile_size as f32 * (1u32 << zoom) as f32;
                    context.uniform1f(Some(loc), world_scale);
                }

                if let Some(layer) = self.geojson_layers.iter().find(|l| l.visible && l.line_vertex_buffer.borrow().is_some()) {
                    let total_vertices = layer.line_vertex_count.get() as i32;
                    if total_vertices > 0 { context.draw_arrays(WebGl2RenderingContext::LINES, 0, total_vertices); return Ok(()); }
                }
            }

            // Collect all line segment data using normalized [0..1] world coords
            let mut vertex_data = Vec::new();

            for line in lines {
                for i in 0..line.points.len().saturating_sub(1) {
                    let start = line.points[i];
                    let end = line.points[i + 1];
                    
                    let (sx, sy) = self.viewport().lat_lng_to_normalized(start[0], start[1]);
                    let (ex, ey) = self.viewport().lat_lng_to_normalized(end[0], end[1]);
                    
                    vertex_data.extend_from_slice(&[
                        sx as f32, sy as f32,
                        line.color[0], line.color[1], line.color[2], line.color[3],
                        ex as f32, ey as f32,
                        line.color[0], line.color[1], line.color[2], line.color[3],
                    ]);
                }
            }

            if !vertex_data.is_empty() {
                let vertices = Float32Array::new_with_length(vertex_data.len() as u32);
                for (i, &val) in vertex_data.iter().enumerate() {
                    vertices.set_index(i as u32, val);
                }

                context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.line_buffer.inner()));
                context.buffer_data_with_array_buffer_view(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    &vertices,
                    WebGl2RenderingContext::STATIC_DRAW,
                );

                // Set up attributes for line rendering
                let stride = 6 * 4; // 6 floats per vertex * 4 bytes
                
                context.enable_vertex_attrib_array(0);
                context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                
                context.enable_vertex_attrib_array(1);
                context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

                // Projection matrix uniform
                let projection_matrix = self.create_projection_matrix();
                let u_matrix_loc = context.get_uniform_location(gl_state.programs.line_program.inner(), "u_matrix");
                if let Some(loc) = u_matrix_loc.as_ref() {
                    context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
                }

                // Set u_origin and u_world_scale for pixel-coord subtraction in vertex shader
                if let Some(ref loc) = gl_state.line_u_origin {
                    let zoom = self.zoom.round() as u32;
                    let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
                    let origin_x = center_pixel.0 - (self.width as f64 / 2.0);
                    let origin_y = center_pixel.1 - (self.height as f64 / 2.0);
                    context.uniform2f(Some(loc), origin_x as f32, origin_y as f32);
                }
                if let Some(ref loc) = gl_state.line_u_world_scale {
                    let zoom = self.zoom.round() as u32;
                    let world_scale = self.tile_size as f32 * (1u32 << zoom) as f32;
                    context.uniform1f(Some(loc), world_scale);
                }

                let total_vertices = vertex_data.len() / 6;
                context.draw_arrays(WebGl2RenderingContext::LINES, 0, total_vertices as i32);
            }
        }

        Ok(())
    }

    fn render_geojson_polygons(&self, context: &WebGl2RenderingContext, polygons: &[PolygonFeature]) -> Result<(), JsValue> {
        web_sys::console::log_2(&"Rendering polygons count:".into(), &polygons.len().into());

        if let Some(ref gl_state) = self.gl_state {
            context.use_program(Some(gl_state.programs.polygon_program.inner()));
            context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));

            // Render from cached GPU buffer if available
            if let Some(buffer) = self.geojson_layers.iter().find(|l| l.visible && !l.cached_polygon_triangles.is_empty()).and_then(|l| l.polygon_vertex_buffer.borrow().clone()) {
                context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));
                let stride = 6 * 4; // pos(2) + color(4)
                context.enable_vertex_attrib_array(0);
                context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                context.enable_vertex_attrib_array(1);
                context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

                let projection_matrix = self.create_projection_matrix();
                let u_matrix_loc = context.get_uniform_location(gl_state.programs.polygon_program.inner(), "u_matrix");
                if let Some(loc) = u_matrix_loc.as_ref() {
                    context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
                }

                // Set u_origin for pixel-coord subtraction in vertex shader
                if let Some(ref loc) = gl_state.polygon_u_origin {
                    let zoom = self.zoom.round() as u32;
                    let center_pixel = self.viewport().lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
                    let origin_x = center_pixel.0 - (self.width as f64 / 2.0);
                    let origin_y = center_pixel.1 - (self.height as f64 / 2.0);
                    context.uniform2f(Some(loc), origin_x as f32, origin_y as f32);
                }
                // Set u_world_scale for normalized-to-pixel conversion
                if let Some(ref loc) = gl_state.polygon_u_world_scale {
                    let zoom = self.zoom.round() as u32;
                    let world_scale = self.tile_size as f32 * (1u32 << zoom) as f32;
                    context.uniform1f(Some(loc), world_scale);
                }

                // Find count from the same layer
                if let Some(layer) = self.geojson_layers.iter().find(|l| l.visible && l.polygon_vertex_buffer.borrow().is_some()) {
                    let total_vertices = layer.polygon_vertex_count.get() as i32;
                    if total_vertices > 0 { context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices); return Ok(()); }
                }
            }

            // Collect all polygon triangle data with memory limits
            let mut vertex_data = Vec::new();
            const MAX_VERTICES: usize = 1000000; // Safety limit: 1M vertices = ~6MB

            for polygon in polygons {
                if polygon.rings.is_empty() {
                    continue;
                }

                // Process outer ring and holes
                for ring in &polygon.rings {
                    if ring.len() < 3 {
                        continue;
                    }

                    // Skip very complex rings to prevent memory issues
                    if ring.len() > 1000 {
                        continue;
                    }

                    // Triangulate the ring
                    let triangles = self.triangulate_polygon(ring);

                    // Convert triangles to screen coordinates
                    for triangle in triangles.chunks(3) {
                        if triangle.len() == 3 {
                            for &[lat, lng] in triangle {
                                let screen_pos = self.viewport().lat_lng_to_screen(lat, lng);
                                vertex_data.extend_from_slice(&[
                                    screen_pos.0 as f32, screen_pos.1 as f32,
                                    polygon.color[0], polygon.color[1], polygon.color[2], polygon.color[3],
                                ]);

                                // Safety check to prevent memory explosion
                                if vertex_data.len() > MAX_VERTICES * 6 {
                                    break;
                                }
                            }
                        }
                    }

                    // Break if we hit the vertex limit
                    if vertex_data.len() > MAX_VERTICES * 6 {
                        break;
                    }
                }

                // Break if we hit the vertex limit
                if vertex_data.len() > MAX_VERTICES * 6 {
                    break;
                }
            }

            if !vertex_data.is_empty() {
                let vertices = Float32Array::new_with_length(vertex_data.len() as u32);
                for (i, &val) in vertex_data.iter().enumerate() {
                    vertices.set_index(i as u32, val);
                }

                context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.polygon_buffer.inner()));
                context.buffer_data_with_array_buffer_view(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    &vertices,
                    WebGl2RenderingContext::STATIC_DRAW,
                );

                // Set up attributes for polygon rendering
                let stride = 6 * 4; // 6 floats per vertex * 4 bytes
                
                context.enable_vertex_attrib_array(0);
                context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                
                context.enable_vertex_attrib_array(1);
                context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

                // Set up the projection matrix uniform
                let projection_matrix = self.create_projection_matrix();
                let u_matrix_loc = context.get_uniform_location(gl_state.programs.polygon_program.inner(), "u_matrix");
                if let Some(loc) = u_matrix_loc.as_ref() {
                    context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
                }

                // Set u_origin for pixel-coord subtraction in vertex shader
                // Slow path: vertices are already in screen coords, use identity
                if let Some(ref loc) = gl_state.polygon_u_origin {
                    context.uniform2f(Some(loc), 0.0, 0.0);
                }
                // Set u_world_scale: screen coords don't need scaling
                if let Some(ref loc) = gl_state.polygon_u_world_scale {
                    context.uniform1f(Some(loc), 1.0);
                }

                let total_vertices = vertex_data.len() / 6;
                web_sys::console::log_2(&"Drawing triangles:".into(), &total_vertices.into());
                context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices as i32);
            } else {
                web_sys::console::log_1(&"No vertex data to render".into());
            }
        } else {
            web_sys::console::log_1(&"No GL state available for polygon rendering".into());
        }

        Ok(())
    }

    fn render_geojson_polygon_triangles(&self, context: &WebGl2RenderingContext, triangles: &[[f64; 2]], color: [f32; 4]) -> Result<(), JsValue> {
        if let Some(ref gl_state) = self.gl_state {
            context.use_program(Some(gl_state.programs.polygon_program.inner()));
            context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));

            // Viewport culling in lat/lng space
            let visible = self.cull_triangles_to_view(triangles);

            let mut vertex_data = Vec::with_capacity(visible.len() * 6);
            for &[lat, lng] in visible.iter() {
                let screen_pos = self.viewport().lat_lng_to_screen(lat, lng);
                vertex_data.extend_from_slice(&[
                    screen_pos.0 as f32, screen_pos.1 as f32,
                    color[0], color[1], color[2], color[3],
                ]);
            }

            if !vertex_data.is_empty() {
                let vertices = Float32Array::new_with_length(vertex_data.len() as u32);
                for (i, &val) in vertex_data.iter().enumerate() {
                    vertices.set_index(i as u32, val);
                }

                context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.polygon_buffer.inner()));
                context.buffer_data_with_array_buffer_view(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    &vertices,
                    WebGl2RenderingContext::DYNAMIC_DRAW,
                );

                let stride = 6 * 4;
                context.enable_vertex_attrib_array(0);
                context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
                context.enable_vertex_attrib_array(1);
                context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

                // Projection
                let projection_matrix = self.create_projection_matrix();
                let u_matrix_loc = context.get_uniform_location(gl_state.programs.polygon_program.inner(), "u_matrix");
                if let Some(loc) = u_matrix_loc.as_ref() {
                    context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
                }

                // Set u_origin for pixel-coord subtraction in vertex shader
                // Slow path: vertices are already in screen coords, use identity
                if let Some(ref loc) = gl_state.polygon_u_origin {
                    context.uniform2f(Some(loc), 0.0, 0.0);
                }
                // Set u_world_scale: screen coords don't need scaling
                if let Some(ref loc) = gl_state.polygon_u_world_scale {
                    context.uniform1f(Some(loc), 1.0);
                }

                let total_vertices = vertex_data.len() / 6;
                context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices as i32);
            }
        }
        Ok(())
    }

    // GeoJSON processing methods
    fn parse_geojson_string(&self, geojson_str: &str) -> Result<Vec<GeoJSONFeature>, JsValue> {
        web_sys::console::log_2(&"Parsing GeoJSON string length:".into(), &geojson_str.len().into());

        // Parse GeoJSON string using serde_json
        let geojson_value: serde_json::Value = serde_json::from_str(geojson_str)
            .map_err(|e| {
                web_sys::console::log_2(&"GeoJSON parse error:".into(), &e.to_string().into());
                JsValue::from_str(&format!("Failed to parse GeoJSON: {}", e))
            })?;

        web_sys::console::log_1(&"GeoJSON parsed successfully, now processing features".into());
        self.parse_geojson_value(&geojson_value)
    }

    fn parse_geojson_value(&self, geojson_value: &serde_json::Value) -> Result<Vec<GeoJSONFeature>, JsValue> {
        let mut features = Vec::new();

        match geojson_value {
            serde_json::Value::Object(obj) => {
                let geojson_type = obj.get("type")
                    .and_then(|t| t.as_str())
                    .ok_or_else(|| JsValue::from_str("GeoJSON missing 'type' field"))?;

                match geojson_type {
                    "FeatureCollection" => {
                        web_sys::console::log_1(&"Found FeatureCollection".into());
                        if let Some(features_array) = obj.get("features").and_then(|f| f.as_array()) {
                            web_sys::console::log_2(&"Features array length:".into(), &features_array.len().into());
                            for (index, feature_value) in features_array.iter().enumerate() {
                                match self.parse_geojson_feature(feature_value) {
                                    Ok(feature) => {
                                        features.push(feature);
                                        if index < 5 { // Log first 5 features
                                            web_sys::console::log_2(&"Successfully parsed feature".into(), &index.into());
                                        }
                                    },
                                    Err(e) => {
                                        web_sys::console::log_3(&"Failed to parse feature".into(), &index.into(), &e);
                                    }
                                }
                            }
                        } else {
                            web_sys::console::log_1(&"No features array found in FeatureCollection".into());
                        }
                    },
                    "Feature" => {
                        if let Ok(feature) = self.parse_geojson_feature(geojson_value) {
                            features.push(feature);
                        }
                    },
                    _ => {
                        // Direct geometry (Point, LineString, etc.)
                        if let Ok(geometry) = self.parse_geojson_geometry(geojson_value) {
                            let feature = GeoJSONFeature {
                                geometry,
                                properties: serde_json::json!({}),
                                id: None,
                            };
                            features.push(feature);
                        }
                    },
                }
            },
            _ => return Err(JsValue::from_str("GeoJSON must be an object")),
        }

        web_sys::console::log_2(&"Total features parsed:".into(), &features.len().into());
        Ok(features)
    }

    fn parse_geojson_feature(&self, feature_value: &serde_json::Value) -> Result<GeoJSONFeature, JsValue> {
        let obj = feature_value.as_object()
            .ok_or_else(|| JsValue::from_str("Feature must be an object"))?;

        let geometry = obj.get("geometry")
            .ok_or_else(|| JsValue::from_str("Feature missing 'geometry' field"))?;
        let geometry = self.parse_geojson_geometry(geometry)?;

        let properties = obj.get("properties")
            .and_then(|p| p.as_object())
            .map(|p| serde_json::Value::Object(p.clone()))
            .unwrap_or_else(|| serde_json::json!({}));

        let id = obj.get("id")
            .and_then(|id| {
                if id.is_string() {
                    id.as_str().map(|s| s.to_string())
                } else if id.is_number() {
                    id.as_u64().map(|n| n.to_string())
                } else {
                    None
                }
            });

        Ok(GeoJSONFeature {
            geometry,
            properties,
            id,
        })
    }

    fn parse_geojson_geometry(&self, geometry_value: &serde_json::Value) -> Result<GeoJSONGeometry, JsValue> {
        let obj = geometry_value.as_object()
            .ok_or_else(|| JsValue::from_str("Geometry must be an object"))?;

        let geometry_type = obj.get("type")
            .and_then(|t| t.as_str())
            .ok_or_else(|| JsValue::from_str("Geometry missing 'type' field"))?;

        let coordinates = obj.get("coordinates")
            .ok_or_else(|| JsValue::from_str("Geometry missing 'coordinates' field"))?;

        match geometry_type {
            "Point" => {
                let coords = self.parse_point_coordinates(coordinates)?;
                Ok(GeoJSONGeometry::Point { coordinates: coords })
            },
            "MultiPoint" => {
                let coords = self.parse_multi_point_coordinates(coordinates)?;
                Ok(GeoJSONGeometry::MultiPoint { coordinates: coords })
            },
            "LineString" => {
                let coords = self.parse_line_string_coordinates(coordinates)?;
                Ok(GeoJSONGeometry::LineString { coordinates: coords })
            },
            "MultiLineString" => {
                let coords = self.parse_multi_line_string_coordinates(coordinates)?;
                Ok(GeoJSONGeometry::MultiLineString { coordinates: coords })
            },
            "Polygon" => {
                let coords = self.parse_polygon_coordinates(coordinates)?;
                Ok(GeoJSONGeometry::Polygon { coordinates: coords })
            },
            "MultiPolygon" => {
                let coords = self.parse_multi_polygon_coordinates(coordinates)?;
                Ok(GeoJSONGeometry::MultiPolygon { coordinates: coords })
            },
            _ => Err(JsValue::from_str(&format!("Unsupported geometry type: {}", geometry_type))),
        }
    }

    fn parse_point_coordinates(&self, value: &serde_json::Value) -> Result<[f64; 2], JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| JsValue::from_str("Point coordinates must be an array"))?;
        
        if arr.len() < 2 {
            return Err(JsValue::from_str("Point coordinates must have at least 2 values"));
        }

        let x = arr[0].as_f64().ok_or_else(|| JsValue::from_str("Invalid x coordinate"))?;
        let y = arr[1].as_f64().ok_or_else(|| JsValue::from_str("Invalid y coordinate"))?;

        Ok([x, y])
    }

    fn parse_multi_point_coordinates(&self, value: &serde_json::Value) -> Result<Vec<[f64; 2]>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| JsValue::from_str("MultiPoint coordinates must be an array"))?;
        
        let mut points = Vec::new();
        for point_value in arr {
            points.push(self.parse_point_coordinates(point_value)?);
        }

        Ok(points)
    }

    fn parse_line_string_coordinates(&self, value: &serde_json::Value) -> Result<Vec<[f64; 2]>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| JsValue::from_str("LineString coordinates must be an array"))?;
        
        let mut points = Vec::new();
        for point_value in arr {
            points.push(self.parse_point_coordinates(point_value)?);
        }

        if points.len() < 2 {
            return Err(JsValue::from_str("LineString must have at least 2 points"));
        }

        Ok(points)
    }

    fn parse_multi_line_string_coordinates(&self, value: &serde_json::Value) -> Result<Vec<Vec<[f64; 2]>>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| JsValue::from_str("MultiLineString coordinates must be an array"))?;
        
        let mut lines = Vec::new();
        for line_value in arr {
            lines.push(self.parse_line_string_coordinates(line_value)?);
        }

        Ok(lines)
    }

    fn parse_polygon_coordinates(&self, value: &serde_json::Value) -> Result<Vec<Vec<[f64; 2]>>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| JsValue::from_str("Polygon coordinates must be an array"))?;
        
        let mut rings = Vec::new();
        for ring_value in arr {
            let ring = self.parse_line_string_coordinates(ring_value)?; // Reuse line string parsing
            if ring.len() < 3 {
                return Err(JsValue::from_str("Polygon ring must have at least 3 points"));
            }
            rings.push(ring);
        }

        if rings.is_empty() {
            return Err(JsValue::from_str("Polygon must have at least one ring"));
        }

        Ok(rings)
    }

    fn parse_multi_polygon_coordinates(&self, value: &serde_json::Value) -> Result<Vec<Vec<Vec<[f64; 2]>>>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| JsValue::from_str("MultiPolygon coordinates must be an array"))?;
        
        let mut polygons = Vec::new();
        for polygon_value in arr {
            polygons.push(self.parse_polygon_coordinates(polygon_value)?);
        }

        Ok(polygons)
    }

    // Simple ear clipping triangulation for convex/concave polygons
    fn triangulate_polygon(&self, points: &[[f64; 2]]) -> Vec<[f64; 2]> {
        if points.len() < 3 {
            return Vec::new();
        }

        let mut triangles = Vec::new();
        let mut vertices: Vec<[f64; 2]> = points.to_vec();

        // Simple ear clipping for basic polygons
        while vertices.len() >= 3 {
            let mut ear_found = false;
            
            for i in 0..vertices.len() {
                let prev = vertices[(i + vertices.len() - 1) % vertices.len()];
                let curr = vertices[i];
                let next = vertices[(i + 1) % vertices.len()];

                // Check if this is an "ear" (convex vertex)
                if self.is_convex_vertex(&prev, &curr, &next) && 
                   !self.has_point_in_triangle(&vertices, &prev, &curr, &next) {
                    // Add triangle
                    triangles.push(prev);
                    triangles.push(curr);
                    triangles.push(next);
                    
                    // Remove the ear vertex
                    vertices.remove(i);
                    ear_found = true;
                    break;
                }
            }

            // If no ear found, break to avoid infinite loop
            if !ear_found {
                break;
            }
        }

        triangles
    }

    fn is_convex_vertex(&self, prev: &[f64; 2], curr: &[f64; 2], next: &[f64; 2]) -> bool {
        // Calculate cross product to determine convexity
        let dx1 = curr[0] - prev[0];
        let dy1 = curr[1] - prev[1];
        let dx2 = next[0] - curr[0];
        let dy2 = next[1] - curr[1];
        
        // Cross product (in 2D, this gives the z-component)
        let cross = dx1 * dy2 - dy1 * dx2;
        cross > 0.0  // Counter-clockwise (convex)
    }

    fn has_point_in_triangle(&self, vertices: &[[f64; 2]], a: &[f64; 2], b: &[f64; 2], c: &[f64; 2]) -> bool {
        for vertex in vertices {
            if vertex == a || vertex == b || vertex == c {
                continue;
            }
            
            if self.point_in_triangle(vertex, a, b, c) {
                return true;
            }
        }
        false
    }

    fn point_in_triangle(&self, p: &[f64; 2], a: &[f64; 2], b: &[f64; 2], c: &[f64; 2]) -> bool {
        // Barycentric coordinate method
        let v0 = [c[0] - a[0], c[1] - a[1]];
        let v1 = [b[0] - a[0], b[1] - a[1]];
        let v2 = [p[0] - a[0], p[1] - a[1]];

        let dot00 = v0[0] * v0[0] + v0[1] * v0[1];
        let dot01 = v0[0] * v1[0] + v0[1] * v1[1];
        let dot02 = v0[0] * v2[0] + v0[1] * v2[1];
        let dot11 = v1[0] * v1[0] + v1[1] * v1[1];
        let dot12 = v1[0] * v2[0] + v1[1] * v2[1];

        let inv_denom = 1.0 / (dot00 * dot11 - dot01 * dot01);
        let u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
        let v = (dot00 * dot12 - dot01 * dot02) * inv_denom;

        (u >= 0.0) && (v >= 0.0) && (u + v < 1.0)
    }

    // Streaming GeoJSON parser for large files
    fn parse_geojson_chunk(&self, chunk_str: &str, is_final: bool) -> Result<Vec<GeoJSONFeature>, JsValue> {
        // For streaming, we'll try to parse valid JSON chunks or individual features
        let mut features = Vec::new();
        
        // Try to parse as a complete GeoJSON object first
        if let Ok(geojson_value) = serde_json::from_str::<serde_json::Value>(chunk_str) {
            return self.parse_geojson_value(&geojson_value);
        }
        
        // If that fails, try to parse as a feature collection chunk
        if chunk_str.trim().starts_with('{') && chunk_str.trim().ends_with('}') {
            // Try to extract individual features from malformed/partial JSON
            if let Ok(extracted_features) = self.extract_features_from_partial_json(chunk_str) {
                features.extend(extracted_features);
            }
        }
        
        // If still no features and this is final chunk, try line-by-line parsing
        if features.is_empty() && is_final {
            for line in chunk_str.lines() {
                let line = line.trim();
                if !line.is_empty() {
                    if let Ok(feature_value) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Ok(mut line_features) = self.parse_geojson_value(&feature_value) {
                            features.append(&mut line_features);
                        }
                    }
                }
            }
        }
        
        Ok(features)
    }
    
    fn extract_features_from_partial_json(&self, json_str: &str) -> Result<Vec<GeoJSONFeature>, JsValue> {
        let mut features = Vec::new();
        
        // Look for feature patterns in the string
        // This is a simple approach - in production, you'd use a proper streaming JSON parser
        let feature_pattern = r#""type"\s*:\s*"Feature""#;
        let re = regex::Regex::new(feature_pattern)
            .map_err(|e| JsValue::from_str(&format!("Failed to create regex: {}", e)))?;
        
        for (pos, _) in re.find_iter(json_str).enumerate() {
            // Try to extract a complete feature around this position
            if let Some(feature_str) = self.extract_feature_at_position(json_str, pos) {
                if let Ok(feature_value) = serde_json::from_str::<serde_json::Value>(&feature_str) {
                    if let Ok(mut extracted_features) = self.parse_geojson_value(&feature_value) {
                        features.append(&mut extracted_features);
                    }
                }
            }
        }
        
        Ok(features)
    }
    
    fn extract_feature_at_position(&self, json_str: &str, pos: usize) -> Option<String> {
        // Simple heuristic to extract a feature object
        // Find the opening brace before "type": "Feature"
        let mut brace_count = 0;
        let mut start_pos = pos;
        
        // Find opening brace
        for i in (0..pos).rev() {
            if json_str.chars().nth(i) == Some('{') {
                start_pos = i;
                brace_count = 1;
                break;
            }
        }
        
        if brace_count == 0 {
            return None;
        }
        
        // Find matching closing brace
        for (i, c) in json_str[start_pos..].char_indices() {
            match c {
                '{' => brace_count += 1,
                '}' => {
                    brace_count -= 1;
                    if brace_count == 0 {
                        return Some(json_str[start_pos..start_pos + i + 1].to_string());
                    }
                }
                _ => {}
            }
        }
        
        None
    }

    // Spatial indexing and hit-testing methods
    fn rebuild_spatial_index(&mut self) {
        rebuild_spatial_index(
            &self.point_layers, &self.line_layers, &self.polygon_layers,
            &mut self.spatial_index, &mut self.spatial_index_dirty
        );
    }

    fn hit_test(&self, x: f64, y: f64) -> Option<serde_json::Value> {
        spatial_hit_test(&self.viewport(), &self.spatial_index, x, y)
    }

    fn rebuild_geojson_cache(&mut self, layer_index: usize) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(JsValue::from_str("GeoJSON layer index out of bounds"));
        }

        let style = self.geojson_layers[layer_index].style.clone();
        let mut cached_points: Vec<PointFeature> = Vec::new();
        let mut cached_lines: Vec<LineFeature> = Vec::new();
        let mut cached_polygon_triangles: Vec<[f64; 2]> = Vec::new();

        for feature in &self.geojson_layers[layer_index].features {
            match &feature.geometry {
                GeoJSONGeometry::Point { coordinates } => {
                    cached_points.push(PointFeature {
                        lat: coordinates[1],
                        lng: coordinates[0],
                        size: style.point_size,
                        color: style.point_color,
                        meta: feature.properties.clone(),
                    });
                }
                GeoJSONGeometry::MultiPoint { coordinates } => {
                    for coord in coordinates {
                        cached_points.push(PointFeature {
                            lat: coord[1],
                            lng: coord[0],
                            size: style.point_size,
                            color: style.point_color,
                            meta: feature.properties.clone(),
                        });
                    }
                }
                GeoJSONGeometry::LineString { coordinates } => {
                    let line_points: Vec<[f64; 2]> = coordinates.iter().map(|c| [c[1], c[0]]).collect();
                    if line_points.len() >= 2 {
                        cached_lines.push(LineFeature {
                            points: line_points,
                            color: style.line_color,
                            width: style.line_width,
                            meta: feature.properties.clone(),
                        });
                    }
                }
                GeoJSONGeometry::MultiLineString { coordinates } => {
                    for line_coords in coordinates {
                        let line_points: Vec<[f64; 2]> = line_coords.iter().map(|c| [c[1], c[0]]).collect();
                        if line_points.len() >= 2 {
                            cached_lines.push(LineFeature {
                                points: line_points,
                                color: style.line_color,
                                width: style.line_width,
                                meta: feature.properties.clone(),
                            });
                        }
                    }
                }
                GeoJSONGeometry::Polygon { coordinates } => {
                    let polygon_rings: Vec<Vec<[f64; 2]>> = coordinates.iter().map(|ring| ring.iter().map(|c| [c[1], c[0]]).collect()).collect();
                    if !polygon_rings.is_empty() && polygon_rings[0].len() >= 3 {
                        let tris = self.triangulate_polygon_with_holes_lyon(&polygon_rings);
                        cached_polygon_triangles.extend(tris);
                        // Add outline from outer ring
                        cached_lines.push(LineFeature { points: polygon_rings[0].clone(), color: style.line_color, width: style.line_width, meta: feature.properties.clone() });
                    }
                }
                GeoJSONGeometry::MultiPolygon { coordinates } => {
                    for polygon_coords in coordinates {
                        let polygon_rings: Vec<Vec<[f64; 2]>> = polygon_coords.iter().map(|ring| ring.iter().map(|c| [c[1], c[0]]).collect()).collect();
                        if !polygon_rings.is_empty() && polygon_rings[0].len() >= 3 {
                            let tris = self.triangulate_polygon_with_holes_lyon(&polygon_rings);
                            cached_polygon_triangles.extend(tris);
                            // Outline
                            cached_lines.push(LineFeature { points: polygon_rings[0].clone(), color: style.line_color, width: style.line_width, meta: feature.properties.clone() });
                        }
                    }
                }
            }
        }

        self.geojson_layers[layer_index].cached_points = cached_points;
        self.geojson_layers[layer_index].cached_lines = cached_lines;
        self.geojson_layers[layer_index].cached_polygon_triangles = cached_polygon_triangles;

        // Upload polygon triangles to GPU buffer for reuse across frames
        if let Some(ref gl_state) = self.gl_state {
            let context = &gl_state.context;
            let mut vertex_data: Vec<f32> = Vec::new();
            for &[lat, lng] in &self.geojson_layers[layer_index].cached_polygon_triangles {
                let (nx, ny) = self.viewport().lat_lng_to_normalized(lat, lng);
                vertex_data.push(nx as f32);
                vertex_data.push(ny as f32);
                vertex_data.push(style.polygon_color[0]);
                vertex_data.push(style.polygon_color[1]);
                vertex_data.push(style.polygon_color[2]);
                vertex_data.push(style.polygon_color[3]);
            }

            {
                let old_poly_buf = self.geojson_layers[layer_index].polygon_vertex_buffer.borrow_mut().take();
                if let Some(buf) = old_poly_buf {
                    context.delete_buffer(Some(buf.inner()));
                }
            }

            if !vertex_data.is_empty() {
                let buffer = context.create_buffer();
                if let Some(buf) = buffer.as_ref() {
                    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buf));
                    let array = Float32Array::new_with_length(vertex_data.len() as u32);
                    for (i, v) in vertex_data.iter().enumerate() { array.set_index(i as u32, *v); }
                    context.buffer_data_with_array_buffer_view(WebGl2RenderingContext::ARRAY_BUFFER, &array, WebGl2RenderingContext::STATIC_DRAW);
                    *self.geojson_layers[layer_index].polygon_vertex_buffer.borrow_mut() = buffer.map(|b| OwnedBuffer::new(&gl_state.context, b));
                    self.geojson_layers[layer_index].polygon_vertex_count.set(vertex_data.len() / 6);
                }
            } else {
                self.geojson_layers[layer_index].polygon_vertex_count.set(0);
            }

            // Upload line segments to GPU buffer for reuse across frames (normalized [0..1] world coords)
            let mut line_vertex_data: Vec<f32> = Vec::new();
            for line in &self.geojson_layers[layer_index].cached_lines {
                for i in 0..line.points.len().saturating_sub(1) {
                    let start = line.points[i];
                    let end = line.points[i + 1];
                    let (sx, sy) = self.viewport().lat_lng_to_normalized(start[0], start[1]);
                    let (ex, ey) = self.viewport().lat_lng_to_normalized(end[0], end[1]);
                    line_vertex_data.extend_from_slice(&[
                        sx as f32, sy as f32,
                        line.color[0], line.color[1], line.color[2], line.color[3],
                        ex as f32, ey as f32,
                        line.color[0], line.color[1], line.color[2], line.color[3],
                    ]);
                }
            }

            {
                let old_line_buf = self.geojson_layers[layer_index].line_vertex_buffer.borrow_mut().take();
                if let Some(buf) = old_line_buf {
                    context.delete_buffer(Some(buf.inner()));
                }
            }

            if !line_vertex_data.is_empty() {
                let buffer = context.create_buffer();
                if let Some(buf) = buffer.as_ref() {
                    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buf));
                    let array = Float32Array::new_with_length(line_vertex_data.len() as u32);
                    for (i, v) in line_vertex_data.iter().enumerate() { array.set_index(i as u32, *v); }
                    context.buffer_data_with_array_buffer_view(WebGl2RenderingContext::ARRAY_BUFFER, &array, WebGl2RenderingContext::STATIC_DRAW);
                    *self.geojson_layers[layer_index].line_vertex_buffer.borrow_mut() = buffer.map(|b| OwnedBuffer::new(&gl_state.context, b));
                    self.geojson_layers[layer_index].line_vertex_count.set(line_vertex_data.len() / 6);
                }
            } else {
                self.geojson_layers[layer_index].line_vertex_count.set(0);
            }
        }

        Ok(())
    }

    fn triangulate_polygon_with_holes_lyon(&self, rings: &Vec<Vec<[f64; 2]>>) -> Vec<[f64; 2]> {
        if rings.is_empty() || rings[0].len() < 3 { return Vec::new(); }

        let mut path_builder = Path::builder();
        // Outer ring (lng, lat mapped as x, y)
        path_builder.begin(lyon_path::geom::point(rings[0][0][1] as f32, rings[0][0][0] as f32));
        for coord in rings[0].iter().skip(1) {
            path_builder.line_to(lyon_path::geom::point(coord[1] as f32, coord[0] as f32));
        }
        path_builder.end(true);

        // Holes
        for hole in rings.iter().skip(1) {
            if hole.len() < 3 { continue; }
            path_builder.begin(lyon_path::geom::point(hole[0][1] as f32, hole[0][0] as f32));
            for coord in hole.iter().skip(1) {
                path_builder.line_to(lyon_path::geom::point(coord[1] as f32, coord[0] as f32));
            }
            path_builder.end(true);
        }
        let path = path_builder.build();

        let mut geometry: VertexBuffers<[f32; 2], u16> = VertexBuffers::new();
        let mut tess = FillTessellator::new();
        let opts = FillOptions::tolerance(0.05);
        if tess.tessellate_path(
            &path,
            &opts,
            &mut BuffersBuilder::new(&mut geometry, |v: FillVertex| {
                let p = v.position();
                [p.x, p.y]
            }),
        ).is_err() { return Vec::new(); }

        let mut out: Vec<[f64; 2]> = Vec::with_capacity(geometry.indices.len());
        for idx in geometry.indices {
            let v = geometry.vertices[idx as usize];
            out.push([v[1] as f64, v[0] as f64]);
        }
        out
    }

    fn cull_triangles_to_view(&self, triangles: &[[f64; 2]]) -> Vec<[f64; 2]> {
        if triangles.is_empty() { return Vec::new(); }
        let mut out: Vec<[f64; 2]> = Vec::with_capacity(triangles.len());
        let w = self.width as f64;
        let h = self.height as f64;
        for tri in triangles.chunks(3) {
            if tri.len() < 3 { continue; }
            let mut any_inside = false;
            for &[lat, lng] in tri {
                let p = self.viewport().lat_lng_to_screen(lat, lng);
                if p.0 >= -50.0 && p.0 <= w + 50.0 && p.1 >= -50.0 && p.1 <= h + 50.0 {
                    any_inside = true; break;
                }
            }
            if any_inside {
                out.extend_from_slice(tri);
            }
        }
        out
    }
}

// Separate TileLayer API class
#[wasm_bindgen]
pub struct TileLayerApi {
    url_template: String,
    subdomains: Vec<String>,
    max_zoom: u32,
    min_zoom: u32,
}

#[wasm_bindgen]
impl TileLayerApi {
    #[wasm_bindgen(constructor)]
    pub fn new(url_template: &str) -> TileLayerApi {
        TileLayerApi {
            url_template: url_template.to_string(),
            subdomains: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            max_zoom: 18,
            min_zoom: 0,
        }
    }

    #[wasm_bindgen]
    pub fn add_to(&self, map: &mut RustyleafMap) -> Result<(), JsValue> {
        map.add_tile_layer(&self.url_template)
    }
}

// Separate PointLayer API class
#[wasm_bindgen]
pub struct PointLayerApi {
    points: Vec<PointFeature>,
    visible: bool,
}

#[wasm_bindgen]
impl PointLayerApi {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PointLayerApi {
        PointLayerApi {
            points: Vec::new(),
            visible: true,
        }
    }

    #[wasm_bindgen]
    pub fn add(&mut self, points_data: &JsValue) -> Result<(), JsValue> {
        let points_array = js_sys::Array::from(points_data);

        for i in 0..points_array.length() {
            let point_obj = points_array.get(i);
            let lat = js_sys::Reflect::get(&point_obj, &JsValue::from_str("lat"))?
                .as_f64().unwrap_or(0.0);
            let lng = js_sys::Reflect::get(&point_obj, &JsValue::from_str("lng"))?
                .as_f64().unwrap_or(0.0);
            let size = js_sys::Reflect::get(&point_obj, &JsValue::from_str("size"))?
                .as_f64().unwrap_or(5.0) as f32;

            let color_str = js_sys::Reflect::get(&point_obj, &JsValue::from_str("color"))?
                .as_string().unwrap_or("#0080ff".to_string());
            let color = parse_color(&color_str);

            let meta = js_sys::Reflect::get(&point_obj, &JsValue::from_str("meta"))?;
            let meta_json = if meta.is_object() {
                serde_wasm_bindgen::from_value(meta)?
            } else {
                serde_json::json!({})
            };

            let point = PointFeature {
                lat,
                lng,
                size,
                color,
                meta: meta_json,
            };
            self.points.push(point);
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn on_click(&mut self, _callback: &js_sys::Function) {
        // Store callback for later use (simplified for now)
    }

    #[wasm_bindgen]
    pub fn on_hover(&mut self, _callback: &js_sys::Function) {
        // Store callback for later use (simplified for now)
    }
}

// Test module
#[cfg(test)]
mod tests;
