use wasm_bindgen::prelude::*;
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
mod events;
mod layers;
mod gl;
mod render;
use crate::projection::Viewport;
use crate::color::parse_color;
use crate::tiles::{TileCoord, TileLayer, TileLoader};
use crate::spatial::{SpatialFeature, rebuild_spatial_index, hit_test as spatial_hit_test};
use crate::input::MouseState;
use crate::input::momentum::{apply_drag, apply_momentum, start_momentum_animation};
use crate::events::{EventSystem, trigger_event, create_map_event, create_click_event};
use crate::layers::point::{PointFeature, PointLayer};
use crate::layers::marker::Marker;
use crate::render::screen_projection_matrix;
use crate::layers::line::{LineFeature, LineLayer};
use crate::layers::polygon::{PolygonFeature, PolygonLayer};
use crate::layers::geojson::{GeoJSONLayer, GeoJSONFeature, GeoJSONGeometry, GeoJSONStyle, PolygonHit};
use crate::gl::shaders::{self, ShaderPrograms};
use crate::error::RustyleafError;

// Coordinate and spatial data structures (TileCoord, Tile moved to crate::tiles, SpatialFeature moved to crate::spatial)
// MouseState moved to crate::input
// ShaderPrograms moved to crate::gl::shaders

// WebGL buffers and state
pub(crate) struct WebGlState {
    pub(crate) context: WebGl2RenderingContext,
    pub(crate) programs: ShaderPrograms,
    pub(crate) tile_vao: OwnedVAO,
    pub(crate) point_vao: OwnedVAO,
    pub(crate) line_vao: OwnedVAO,
    pub(crate) line_gpu_vao: OwnedVAO,
    // Held for RAII lifetime only — its attribute pointers live inside
    // line_gpu_vao after initialize_webgl configures them.
    #[allow(dead_code)]
    pub(crate) line_gpu_corner_buffer: OwnedBuffer,
    pub(crate) polygon_vao: OwnedVAO,
    pub(crate) tile_buffer: OwnedBuffer,
    pub(crate) point_buffer: OwnedBuffer,
    pub(crate) line_buffer: OwnedBuffer,
    pub(crate) polygon_buffer: OwnedBuffer,
    pub(crate) marker_vao: OwnedVAO,
    pub(crate) marker_buffer: OwnedBuffer,
    pub(crate) polygon_u_origin: Option<WebGlUniformLocation>,
    pub(crate) polygon_u_world_scale: Option<WebGlUniformLocation>,
    pub(crate) line_u_origin: Option<WebGlUniformLocation>,
    pub(crate) line_u_world_scale: Option<WebGlUniformLocation>,
    pub(crate) line_gpu_u_origin: Option<WebGlUniformLocation>,
    pub(crate) line_gpu_u_world_scale: Option<WebGlUniformLocation>,
    pub(crate) point_u_origin: Option<WebGlUniformLocation>,
    pub(crate) point_u_world_scale: Option<WebGlUniformLocation>,
}

// MouseState moved to crate::input

// Layer types moved to crate::layers

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
        let window = window().ok_or_else(|| RustyleafError::DomError("Window not available".into()))?;
        let document = window.document().ok_or_else(|| RustyleafError::DomError("Document not available".into()))?;
        
        // Create a temporary canvas to test WebGL support
        let canvas = document
            .create_element("canvas")
            .map_err(|e| RustyleafError::CanvasInit(format!("Failed to create canvas: {:?}", e)))?
            .dyn_into::<HtmlCanvasElement>()
            .map_err(|_| RustyleafError::CanvasInit("Failed to create canvas element".into()))?;
        
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
                    if gl2.get_extension(ext).is_ok() {
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
    min_zoom: f64,
    max_zoom: f64,
    // Dirty-flag for the render loop: true when the next frame must draw.
    needs_redraw: bool,
    last_drawn_tile_generation: u64,
    canvas: Option<HtmlCanvasElement>,
    gl_state: Option<WebGlState>,
    tile_loader: TileLoader,
    tile_size: u32,
    tile_layer: Option<TileLayer>,
    point_layers: Vec<PointLayer>,
    line_layers: Vec<LineLayer>,
    polygon_layers: Vec<PolygonLayer>,
    geojson_layers: Vec<GeoJSONLayer>,
    markers: Vec<Marker>,
    spatial_index: RTree<SpatialFeature>,
    spatial_index_dirty: bool,
    // Whether the last hover hit-test found a feature (used to emit a single
    // clearing event when the cursor leaves a feature).
    hovering: bool,
    mouse_state: MouseState,
    // Smooth dragging with momentum
    drag_velocity: (f64, f64),
    last_drag_time: f64,
    drag_accumulated_x: f64,
    drag_accumulated_y: f64,
    has_momentum: bool,
    last_frame_time: f64,
    events: EventSystem,
}

fn parse_point_features(points_data: &JsValue) -> Result<Vec<PointFeature>, JsValue> {
    let points_array = js_sys::Array::from(points_data);
    let mut points = Vec::with_capacity(points_array.length() as usize);

    for i in 0..points_array.length() {
        let point_obj = points_array.get(i);
        let lat = js_sys::Reflect::get(&point_obj, &JsValue::from_str("lat"))?
            .as_f64().unwrap_or(0.0);
        let lng = js_sys::Reflect::get(&point_obj, &JsValue::from_str("lng"))?
            .as_f64().unwrap_or(0.0);
        let size = js_sys::Reflect::get(&point_obj, &JsValue::from_str("size"))?
            .as_f64().unwrap_or(5.0) as f32;
        let color_str = js_sys::Reflect::get(&point_obj, &JsValue::from_str("color"))?
            .as_string().unwrap_or_else(|| "#0080ff".to_string());
        let meta_val = js_sys::Reflect::get(&point_obj, &JsValue::from_str("meta"))?;
        let meta = if meta_val.is_undefined() || meta_val.is_null() {
            serde_json::Value::Null
        } else if let Some(value) = meta_val.as_string() {
            serde_json::from_str(&value).unwrap_or(serde_json::Value::Null)
        } else {
            js_sys::JSON::stringify(&meta_val).ok()
                .and_then(|value| value.as_string())
                .and_then(|value| serde_json::from_str(&value).ok())
                .unwrap_or(serde_json::Value::Null)
        };

        points.push(PointFeature {
            lat,
            lng,
            size,
            color: parse_color(&color_str),
            meta,
        });
    }

    Ok(points)
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
            min_zoom: 0.0,
            max_zoom: 18.0,
            needs_redraw: true,
            last_drawn_tile_generation: 0,
            canvas: None,
            gl_state: None,
            tile_loader: TileLoader::new(),
            tile_size: 256,
            tile_layer: None,
            point_layers: Vec::new(),
            line_layers: Vec::new(),
            polygon_layers: Vec::new(),
            geojson_layers: Vec::new(),
            markers: Vec::new(),
            spatial_index: RTree::new(),
            spatial_index_dirty: true,
            hovering: false,
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
            last_frame_time: 0.0,
            events: EventSystem::new(),
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

    fn load_visible_tiles(&mut self) {
        self.needs_redraw = true;
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
        // Tile textures are OwnedTexture — clearing the map triggers Drop → delete_texture
        self.tile_loader.textures.borrow_mut().clear();
        self.tile_loader.tiles.clear();
        self.tile_loader.requested.clear();
        self.tile_loader.release_all_closures();
        // Clear GeoJSON layer GPU buffers (triggers OwnedBuffer::Drop → delete_buffer)
        for layer in &self.geojson_layers {
            layer.polygon_vertex_buffer.borrow_mut().take();
            layer.line_vertex_buffer.borrow_mut().take();
        }
        // Drop per-layer point buffers and mark dirty so they re-upload on restore
        for layer in &self.point_layers {
            layer.vertex_buffer.borrow_mut().take();
            layer.gpu_dirty.set(true);
        }
        // Dropping gl_state triggers OwnedVAO, OwnedBuffer, OwnedProgram Drop impls
        self.gl_state = None;
        self.canvas = None;
    }

    #[wasm_bindgen]
    pub fn destroy(&mut self) {
        self.cleanup_gl_resources();
        // `destroy()` is an explicit lifecycle boundary. Release CPU-side
        // feature data and JS callbacks immediately instead of waiting for the
        // wasm wrapper's FinalizationRegistry callback (which may run much
        // later under memory pressure).
        self.tile_layer = None;
        self.point_layers.clear();
        self.line_layers.clear();
        self.polygon_layers.clear();
        self.geojson_layers.clear();
        self.markers.clear();
        self.spatial_index = RTree::new();
        self.events = EventSystem::new();
    }

    #[wasm_bindgen]
    pub fn handle_context_lost(&mut self) {
        self.cleanup_gl_resources();
    }

    #[wasm_bindgen]
    pub fn handle_context_restored(&mut self) {
        if let Some(ref _gl_state) = self.gl_state {
            for layer_idx in 0..self.geojson_layers.len() {
                let _ = self.rebuild_geojson_cache(layer_idx);
            }
            self.spatial_index_dirty = true;
        }
    }

   
    pub fn init_canvas(&mut self, canvas_id: &str) -> Result<(), JsValue> {
        // Check WebGL compatibility first
        let webgl_info = WebGlSupportInfo::check_webgl_support()?;
        if !webgl_info.is_supported() {
            return Err(RustyleafError::WebGlUnavailable(format!(
                "WebGL not supported. Support level: {}. Please use a modern browser with WebGL enabled.",
                webgl_info.get_support_level()
            ))
            .into());
        }
        
        if !webgl_info.webgl2_available && webgl_info.webgl1_fallback {
            web_sys::console::warn_1(&JsValue::from(RustyleafError::WebGlUnavailable(
                "WebGL2 not available, falling back to WebGL1. Some features may be limited.".into()
            )));
        }

        let window = window().ok_or_else(|| RustyleafError::DomError("Window not available".into()))?;
        let document = window.document().ok_or_else(|| RustyleafError::DomError("Document not available".into()))?;
        let canvas = document
            .get_element_by_id(canvas_id)
            .ok_or_else(|| RustyleafError::DomError(format!("Canvas element with id '{}' not found", canvas_id)))?
            .dyn_into::<HtmlCanvasElement>()
            .map_err(|_| RustyleafError::DomError("Element is not a canvas".into()))?;

        canvas.set_width(self.width);
        canvas.set_height(self.height);

        let context = {
            let attrs = web_sys::WebGlContextAttributes::new();
            attrs.set_preserve_drawing_buffer(true);
            canvas
                .get_context_with_context_options("webgl2", &attrs.into())?
                .ok_or_else(|| RustyleafError::WebGlUnavailable("WebGL2 context not available".into()))?
                .dyn_into::<WebGl2RenderingContext>()
                .map_err(|_| RustyleafError::WebGlUnavailable("Failed to get WebGL2 context".into()))?
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

        let line_gpu_u_origin = context.get_uniform_location(programs.line_gpu_program.inner(), "u_origin");
        let line_gpu_u_world_scale = context.get_uniform_location(programs.line_gpu_program.inner(), "u_world_scale");

        let point_u_origin = context.get_uniform_location(programs.point_program.inner(), "u_origin");
        let point_u_world_scale = context.get_uniform_location(programs.point_program.inner(), "u_world_scale");

        // Create VAOs and buffers with error handling
        let tile_vao = context.create_vertex_array().ok_or_else(|| RustyleafError::VaoCreation("Failed to create tile VAO".into()))?;
        let point_vao = context.create_vertex_array().ok_or_else(|| RustyleafError::VaoCreation("Failed to create point VAO".into()))?;
        let line_vao = context.create_vertex_array().ok_or_else(|| RustyleafError::VaoCreation("Failed to create line VAO".into()))?;
        let line_gpu_vao = context.create_vertex_array().ok_or_else(|| RustyleafError::VaoCreation("Failed to create GPU line VAO".into()))?;
        let polygon_vao = context.create_vertex_array().ok_or_else(|| RustyleafError::VaoCreation("Failed to create polygon VAO".into()))?;

        let marker_vao = context.create_vertex_array().ok_or_else(|| RustyleafError::VaoCreation("Failed to create marker VAO".into()))?;
        let marker_buffer = context.create_buffer().ok_or_else(|| RustyleafError::BufferCreation("Failed to create marker buffer".into()))?;

        let tile_buffer = context.create_buffer().ok_or_else(|| RustyleafError::BufferCreation("Failed to create tile buffer".into()))?;
        let point_buffer = context.create_buffer().ok_or_else(|| RustyleafError::BufferCreation("Failed to create point buffer".into()))?;
        let line_buffer = context.create_buffer().ok_or_else(|| RustyleafError::BufferCreation("Failed to create line buffer".into()))?;
        let polygon_buffer = context.create_buffer().ok_or_else(|| RustyleafError::BufferCreation("Failed to create polygon buffer".into()))?;
        let line_gpu_corner_buffer = context.create_buffer().ok_or_else(|| RustyleafError::BufferCreation("Failed to create GPU line corner buffer".into()))?;

        // Static corner table for the instanced GPU line path: 6 corners per
        // segment as (t along segment, side sign) — two triangles.
        context.bind_vertex_array(Some(&line_gpu_vao));
        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&line_gpu_corner_buffer));
        let corners: [f32; 12] = [
            0.0, 1.0,
            0.0, -1.0,
            1.0, 1.0,
            0.0, -1.0,
            1.0, -1.0,
            1.0, 1.0,
        ];
        let corner_array = Float32Array::from(&corners[..]);
        context.buffer_data_with_array_buffer_view(
            WebGl2RenderingContext::ARRAY_BUFFER,
            &corner_array,
            WebGl2RenderingContext::STATIC_DRAW,
        );
        context.enable_vertex_attrib_array(4); // a_corner
        context.vertex_attrib_pointer_with_i32(4, 2, WebGl2RenderingContext::FLOAT, false, 8, 0);
        context.vertex_attrib_divisor(4, 0);
        context.bind_vertex_array(None);

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
            line_gpu_vao: OwnedVAO::new(&context, line_gpu_vao),
            line_gpu_corner_buffer: OwnedBuffer::new(&context, line_gpu_corner_buffer),
            polygon_vao: OwnedVAO::new(&context, polygon_vao),
            marker_vao: OwnedVAO::new(&context, marker_vao),
            marker_buffer: OwnedBuffer::new(&context, marker_buffer),
            tile_buffer: OwnedBuffer::new(&context, tile_buffer),
            point_buffer: OwnedBuffer::new(&context, point_buffer),
            line_buffer: OwnedBuffer::new(&context, line_buffer),
            polygon_buffer: OwnedBuffer::new(&context, polygon_buffer),
            polygon_u_origin,
            polygon_u_world_scale,
            line_u_origin,
            line_u_world_scale,
            line_gpu_u_origin,
            line_gpu_u_world_scale,
            point_u_origin,
            point_u_world_scale,
        });

        Ok(())
    }

    fn create_shader_programs(&self, context: &WebGl2RenderingContext) -> Result<ShaderPrograms, JsValue> {
        shaders::create_shader_programs(context)
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

        // Dirty-flag culling: skip the whole GPU pass when nothing changed.
        // A new tile texture arriving bumps the generation counter, forcing
        // the next frame to draw. Idle maps cost ~0 CPU instead of redrawing
        // (and re-triangulating lines/polygons on the CPU) at 60fps.
        let tile_gen = self.tile_loader.texture_generation.get();
        let tiles_advanced = tile_gen != self.last_drawn_tile_generation;
        if !self.needs_redraw && !self.has_momentum && !tiles_advanced {
            return Ok(());
        }

        // Clear the canvas
        // Match the basemap's ocean color so areas outside Web Mercator's
        // vertical world bounds do not appear as gray squares when zoomed out.
        context.clear_color(0.6667, 0.8275, 0.8745, 1.0);
        context.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);

        // Set viewport
        context.viewport(0, 0, self.width as i32, self.height as i32);

        // Render tiles, points, lines, polygons, and GeoJSON
        self.render_tiles(&context)?;
        self.render_points(&context)?;
        self.render_lines(&context)?;
        self.render_polygons(&context)?;
        self.render_geojson(&context)?;
        self.render_markers(&context)?;

        self.last_drawn_tile_generation = tile_gen;
        self.needs_redraw = false;

        Ok(())
    }

    fn render_tiles(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.tile_layer.is_none() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            let projection_matrix = [
                2.0 / self.width as f32, 0.0, 0.0, 0.0,
                0.0, -2.0 / self.height as f32, 0.0, 0.0,
                0.0, 0.0, -1.0, 0.0,
                -1.0, 1.0, 0.0, 1.0,
            ];
            let tiles_to_load = render::tiles::render_tiles(
                context,
                gl_state,
                &self.tile_loader,
                self.tile_size,
                &self.viewport(),
                &projection_matrix,
            )?;

            for (key, tile_coord) in tiles_to_load {
                self.tile_loader.requested.insert(key);
                self.load_tile(tile_coord);
            }
        }

        Ok(())
    }

    fn render_points(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.point_layers.is_empty() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            let interacting = self.mouse_state.is_dragging || self.has_momentum;
            render::points::render_points(context, gl_state, &self.point_layers, &self.viewport(), interacting)
        } else {
            Ok(())
        }
    }

    fn render_lines(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.line_layers.is_empty() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            render::lines::render_lines(context, gl_state, &self.line_layers, &self.viewport())
        } else {
            Ok(())
        }
    }

    fn render_polygons(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.polygon_layers.is_empty() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            render::polygons::render_polygons(context, gl_state, &self.polygon_layers, &self.viewport())
        } else {
            Ok(())
        }
    }

    fn render_markers(&mut self, context: &WebGl2RenderingContext) -> Result<(), JsValue> {
        if self.markers.is_empty() {
            return Ok(());
        }

        if let Some(ref gl_state) = self.gl_state {
            // Markers reuse the point program, drawn as round GPU sprites. We keep
            // a dedicated VAO/buffer so we never disturb the point-layer VAO.
            context.use_program(Some(gl_state.programs.point_program.inner()));
            context.bind_vertex_array(Some(gl_state.marker_vao.inner()));

            let count = self.markers.iter().filter(|m| m.visible.get()).count();
            if count == 0 {
                return Ok(());
            }

            // Sort by z_order so lower markers draw first (painter's algorithm).
            let mut order: Vec<usize> = (0..self.markers.len()).collect();
            order.sort_by_key(|&i| self.markers[i].z_order);

            let mut vertex_data: Vec<f32> = Vec::with_capacity(count * 7);
            for i in order {
                let m = &self.markers[i];
                if !m.visible.get() {
                    continue;
                }
                let (nx, ny) = self.viewport().lat_lng_to_normalized(m.lat, m.lng);
                vertex_data.extend_from_slice(&[
                    nx as f32, ny as f32,
                    m.size,
                    m.color[0], m.color[1], m.color[2], m.color[3],
                ]);
            }

            context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.marker_buffer.inner()));
            let vertices = Float32Array::from(&vertex_data[..]);
            context.buffer_data_with_array_buffer_view(
                WebGl2RenderingContext::ARRAY_BUFFER,
                &vertices,
                WebGl2RenderingContext::DYNAMIC_DRAW,
            );

            let stride = 7 * 4;
            context.enable_vertex_attrib_array(0);
            context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
            context.enable_vertex_attrib_array(1);
            context.vertex_attrib_pointer_with_i32(1, 1, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);
            context.enable_vertex_attrib_array(2);
            context.vertex_attrib_pointer_with_i32(2, 4, WebGl2RenderingContext::FLOAT, false, stride, 3 * 4);

            let projection_matrix = screen_projection_matrix(&self.viewport());
            if let Some(loc) = context.get_uniform_location(gl_state.programs.point_program.inner(), "u_matrix") {
                context.uniform_matrix4fv_with_f32_array(Some(&loc), false, &projection_matrix);
            }

            let zoom = self.viewport().zoom.round() as u32;
            let center_pixel = self.viewport().lat_lng_to_pixel(self.viewport().center_lat, self.viewport().center_lng, zoom);
            let origin_x = (center_pixel.0 - self.viewport().width as f64 / 2.0) as f32;
            let origin_y = (center_pixel.1 - self.viewport().height as f64 / 2.0) as f32;
            let world_scale = self.viewport().tile_size as f32 * (1u32 << zoom) as f32;

            if let Some(loc) = gl_state.point_u_origin.as_ref() {
                context.uniform2f(Some(loc), origin_x, origin_y);
            }
            if let Some(loc) = gl_state.point_u_world_scale.as_ref() {
                context.uniform1f(Some(loc), world_scale);
            }

            context.draw_arrays(WebGl2RenderingContext::POINTS, 0, (vertex_data.len() / 7) as i32);
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), JsValue> {
        self.needs_redraw = true;
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
    // Fire the map-level click callbacks with a `feature` payload (the hit
    // feature's meta/properties) so JS layers can dispatch per-feature events.
    fn trigger_feature_click(&mut self, hit_info: serde_json::Value, canvas_x: f64, canvas_y: f64) {
        let point_array = Array::new();
        point_array.push(&JsValue::from_f64(canvas_x));
        point_array.push(&JsValue::from_f64(canvas_y));
        let latlng = self.unproject(&point_array.into());
        if latlng.length() != 2 {
            return;
        }
        let lat = latlng.get(0).as_f64().unwrap_or(0.0);
        let lng = latlng.get(1).as_f64().unwrap_or(0.0);
        let latlng_arr = Array::new();
        latlng_arr.push(&JsValue::from_f64(lat));
        latlng_arr.push(&JsValue::from_f64(lng));
        let point = self.project(&JsValue::from(latlng_arr));
        let layer_point = self.layer_point_from_container(&point);
        if let Ok(event_obj) = create_click_event(lat, lng, &point, &layer_point, None) {
            let feature = js_sys::JSON::parse(&hit_info.to_string()).unwrap_or(JsValue::NULL);
            let _ = js_sys::Reflect::set(&event_obj, &JsValue::from_str("feature"), &feature);
            trigger_event(&self.events.click_callbacks, &event_obj);
        }
    }

    // Hover hit-testing, called from JS on mousemove while not dragging.
    // Fires the hover callbacks with the hit feature (or leaves them silent
    // when nothing is under the cursor and nothing was hovered before).
    #[wasm_bindgen]
    pub fn handle_mouse_hover(&mut self, canvas_x: f64, canvas_y: f64) {
        if self.events.hover_callbacks.is_empty() {
            return;
        }
        if self.spatial_index_dirty {
            self.rebuild_spatial_index();
        }
        let hit = self.hit_test(canvas_x, canvas_y);
        let was_hovering = self.hovering;
        self.hovering = hit.is_some();
        if hit.is_none() && !was_hovering {
            return; // nothing hovered, nothing to clear
        }
        let point_array = Array::new();
        point_array.push(&JsValue::from_f64(canvas_x));
        point_array.push(&JsValue::from_f64(canvas_y));
        let latlng = self.unproject(&point_array.into());
        if latlng.length() != 2 {
            return;
        }
        let lat = latlng.get(0).as_f64().unwrap_or(0.0);
        let lng = latlng.get(1).as_f64().unwrap_or(0.0);
        let latlng_arr = Array::new();
        latlng_arr.push(&JsValue::from_f64(lat));
        latlng_arr.push(&JsValue::from_f64(lng));
        let point = self.project(&JsValue::from(latlng_arr));
        let layer_point = self.layer_point_from_container(&point);
        if let Ok(event_obj) = create_click_event(lat, lng, &point, &layer_point, None) {
            let _ = js_sys::Reflect::set(&event_obj, &JsValue::from_str("type"), &JsValue::from_str("hover"));
            let feature = match hit {
                Some(info) => js_sys::JSON::parse(&info.to_string()).unwrap_or(JsValue::NULL),
                None => JsValue::NULL,
            };
            let _ = js_sys::Reflect::set(&event_obj, &JsValue::from_str("feature"), &feature);
            trigger_event(&self.events.hover_callbacks, &event_obj);
        }
    }

    // Public event registration methods
    #[wasm_bindgen]
    pub fn on_move(&mut self, callback: &js_sys::Function) {
        self.events.on_move(callback);
    }

    #[wasm_bindgen]
    pub fn on_zoom(&mut self, callback: &js_sys::Function) {
        self.events.on_zoom(callback);
    }

    #[wasm_bindgen]
    pub fn on_click(&mut self, callback: &js_sys::Function) {
        self.events.on_click(callback);
    }

    #[wasm_bindgen]
    pub fn on_hover(&mut self, callback: &js_sys::Function) {
        self.events.on_hover(callback);
    }

    // Event removal methods - remove all matching callbacks
    #[wasm_bindgen]
    pub fn off_move(&mut self, callback: &js_sys::Function) {
        self.events.off_move(callback);
    }

    #[wasm_bindgen]
    pub fn off_zoom(&mut self, callback: &js_sys::Function) {
        self.events.off_zoom(callback);
    }

    #[wasm_bindgen]
    pub fn off_click(&mut self, callback: &js_sys::Function) {
        self.events.off_click(callback);
    }

    #[wasm_bindgen]
    pub fn off_hover(&mut self, callback: &js_sys::Function) {
        self.events.off_hover(callback);
    }

    // Additional event registration methods
    #[wasm_bindgen]
    pub fn on_mouse_down(&mut self, callback: &js_sys::Function) {
        self.events.on_mousedown(callback);
    }

    #[wasm_bindgen]
    pub fn on_mouse_up(&mut self, callback: &js_sys::Function) {
        self.events.on_mouseup(callback);
    }

    #[wasm_bindgen]
    pub fn on_contextmenu(&mut self, callback: &js_sys::Function) {
        self.events.on_contextmenu(callback);
    }

    #[wasm_bindgen]
    pub fn on_key_down(&mut self, callback: &js_sys::Function) {
        self.events.on_keydown(callback);
    }

    #[wasm_bindgen]
    pub fn on_key_up(&mut self, callback: &js_sys::Function) {
        self.events.on_keyup(callback);
    }

    // Additional event removal methods
    #[wasm_bindgen]
    pub fn off_mouse_down(&mut self, callback: &js_sys::Function) {
        self.events.off_mousedown(callback);
    }

    #[wasm_bindgen]
    pub fn off_mouse_up(&mut self, callback: &js_sys::Function) {
        self.events.off_mouseup(callback);
    }

    #[wasm_bindgen]
    pub fn off_contextmenu(&mut self, callback: &js_sys::Function) {
        self.events.off_contextmenu(callback);
    }

    #[wasm_bindgen]
    pub fn off_key_down(&mut self, callback: &js_sys::Function) {
        self.events.off_keydown(callback);
    }

    #[wasm_bindgen]
    pub fn off_key_up(&mut self, callback: &js_sys::Function) {
        self.events.off_keyup(callback);
    }

  #[wasm_bindgen]
    pub fn on_dragend(&mut self, callback: &js_sys::Function) {
        self.events.on_dragend(callback);
    }

  #[wasm_bindgen]
    pub fn off_dragend(&mut self, callback: &js_sys::Function) {
        self.events.off_dragend(callback);
    }

    // Event trigger methods
    fn trigger_move_event(&self) {
        if let Ok(event_obj) = create_map_event("move", &self.get_center(), self.zoom, &self.get_bounds()) {
            trigger_event(&self.events.move_callbacks, &event_obj);
        }
    }

    fn trigger_zoom_event(&self) {
        if let Ok(event_obj) = create_map_event("zoom", &self.get_center(), self.zoom, &self.get_bounds()) {
            trigger_event(&self.events.zoom_callbacks, &event_obj);
        }
    }

    fn trigger_click_event(&self, lat: f64, lng: f64, _original_event: Option<&web_sys::MouseEvent>) {
        let latlng = Array::new();
        latlng.push(&JsValue::from_f64(lat));
        latlng.push(&JsValue::from_f64(lng));
        let point = self.project(&JsValue::from(latlng));
        let layer_point = self.layer_point_from_container(&point);
        let original_js = _original_event.map(|e| JsValue::from(e.clone()));
        if let Ok(event_obj) = create_click_event(lat, lng, &point, &layer_point, original_js.as_ref()) {
            trigger_event(&self.events.click_callbacks, &event_obj);
        }
    }

    fn trigger_mousedown_event(&self, lat: f64, lng: f64, _original_event: Option<&web_sys::MouseEvent>) {
        let latlng = Array::new();
        latlng.push(&JsValue::from_f64(lat));
        latlng.push(&JsValue::from_f64(lng));
        let point = self.project(&JsValue::from(latlng));
        let layer_point = self.layer_point_from_container(&point);
        let original_js = _original_event.map(|e| JsValue::from(e.clone()));
        if let Ok(event_obj) = create_click_event(lat, lng, &point, &layer_point, original_js.as_ref()) {
            trigger_event(&self.events.mousedown_callbacks, &event_obj);
        }
    }

    fn trigger_mouseup_event(&self, lat: f64, lng: f64, _original_event: Option<&web_sys::MouseEvent>) {
        let latlng = Array::new();
        latlng.push(&JsValue::from_f64(lat));
        latlng.push(&JsValue::from_f64(lng));
        let point = self.project(&JsValue::from(latlng));
        let layer_point = self.layer_point_from_container(&point);
        let original_js = _original_event.map(|e| JsValue::from(e.clone()));
        if let Ok(event_obj) = create_click_event(lat, lng, &point, &layer_point, original_js.as_ref()) {
            trigger_event(&self.events.mouseup_callbacks, &event_obj);
        }
    }

    fn trigger_contextmenu_event(&self, lat: f64, lng: f64, _original_event: Option<&web_sys::MouseEvent>) {
        let latlng = Array::new();
        latlng.push(&JsValue::from_f64(lat));
        latlng.push(&JsValue::from_f64(lng));
        let point = self.project(&JsValue::from(latlng));
        let layer_point = self.layer_point_from_container(&point);
        let original_js = _original_event.map(|e| JsValue::from(e.clone()));
        if let Ok(event_obj) = create_click_event(lat, lng, &point, &layer_point, original_js.as_ref()) {
            trigger_event(&self.events.contextmenu_callbacks, &event_obj);
        }
    }

    fn trigger_dragend_event(&self) {
        if let Ok(event_obj) = create_map_event("dragend", &self.get_center(), self.zoom, &self.get_bounds()) {
            trigger_event(&self.events.dragend_callbacks, &event_obj);
        }
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
        let clamped_lat = new_lat.clamp(-85.05112878, 85.05112878);
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
        let next = (self.zoom + 1.0).min(self.max_zoom);
        if next > self.zoom {
            self.zoom = next;
            self.load_visible_tiles();
            self.trigger_zoom_event();
        }
    }

    #[wasm_bindgen]
    pub fn zoom_out(&mut self) {
        let next = (self.zoom - 1.0).max(self.min_zoom);
        if next < self.zoom {
            self.zoom = next;
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
        if _min_zoom.is_finite() {
            self.min_zoom = _min_zoom.clamp(0.0, self.max_zoom);
        }
    }

    #[wasm_bindgen]
    pub fn set_max_zoom(&mut self, _max_zoom: f64) {
        if _max_zoom.is_finite() {
            self.max_zoom = _max_zoom.clamp(self.min_zoom, 30.0);
        }
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
        self.needs_redraw = true;
        // Validate input is an array
        let bounds_array = js_sys::Array::from(bounds_data);
        
        if bounds_array.length() != 4 {
            return Err(RustyleafError::ResourceError("Bounds must be an array of [sw_lat, sw_lng, ne_lat, ne_lng]".into()).into());
        }
        
        // Validate all elements are numbers and within valid coordinate ranges
        let sw_lat = bounds_array.get(0).as_f64().ok_or(RustyleafError::InvalidCoordinate { lat: 0.0, lng: 0.0 })?;
        let sw_lng = bounds_array.get(1).as_f64().ok_or(RustyleafError::InvalidCoordinate { lat: 0.0, lng: 0.0 })?;
        let ne_lat = bounds_array.get(2).as_f64().ok_or(RustyleafError::InvalidCoordinate { lat: 0.0, lng: 0.0 })?;
        let ne_lng = bounds_array.get(3).as_f64().ok_or(RustyleafError::InvalidCoordinate { lat: 0.0, lng: 0.0 })?;
        
        // Validate coordinate ranges
        if !(-90.0..=90.0).contains(&sw_lat) {
            return Err(RustyleafError::InvalidCoordinate { lat: sw_lat, lng: sw_lng }.into());
        }
        if !(-180.0..=180.0).contains(&sw_lng) {
            return Err(RustyleafError::InvalidCoordinate { lat: sw_lat, lng: sw_lng }.into());
        }
        if !(-90.0..=90.0).contains(&ne_lat) {
            return Err(RustyleafError::InvalidCoordinate { lat: ne_lat, lng: ne_lng }.into());
        }
        if !(-180.0..=180.0).contains(&ne_lng) {
            return Err(RustyleafError::InvalidCoordinate { lat: ne_lat, lng: ne_lng }.into());
        }
        
        // Validate that bounds are valid (ne > sw)
        if ne_lat <= sw_lat {
            return Err(RustyleafError::InvalidCoordinate { lat: ne_lat, lng: ne_lng }.into());
        }
        if ne_lng <= sw_lng {
            return Err(RustyleafError::InvalidCoordinate { lat: ne_lat, lng: ne_lng }.into());
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

    // Layer point for event payloads. This renderer has no pane/pixel-origin
    // offset between container and layer space (see project/unproject), so the
    // values match Leaflet's no-offset case — but it must be a DISTINCT array,
    // not an aliased reference to containerPoint.
    fn layer_point_from_container(&self, container: &Array) -> Array {
        let arr = Array::new();
        arr.push(&container.get(0));
        arr.push(&container.get(1));
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
        self.needs_redraw = true;
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
    pub fn remove_tile_layer(&mut self) {
        self.needs_redraw = true;
        self.tile_layer = None;
        // Drop pending-load bookkeeping and free cached GPU textures NOW
        // instead of waiting for zoom-based eviction (GL leak on removal).
        self.tile_loader.requested.clear();
        {
            let mut textures = self.tile_loader.textures.borrow_mut();
            for (_k, tex) in textures.drain() {
                drop(tex); // OwnedTexture::Drop → deleteTexture
            }
        }
    }

    /// Apply Leaflet-style TileLayer options after add_tile_layer.
    /// `subdomains` is a JS array of strings (e.g. ["a","b","c"]).
    #[wasm_bindgen]
    pub fn configure_tile_layer(
        &mut self,
        subdomains: &JsValue,
        min_zoom: f64,
        max_zoom: f64,
        tile_size: u32,
    ) -> Result<(), JsValue> {
        let mut subs: Vec<String> = Vec::new();
        let arr = js_sys::Array::from(subdomains);
        for i in 0..arr.length() {
            if let Some(s) = arr.get(i).as_string() {
                if !s.is_empty() {
                    subs.push(s);
                }
            }
        }
        if let Some(ref mut tl) = self.tile_layer {
            if !subs.is_empty() {
                tl.subdomains = subs;
            }
            if min_zoom.is_finite() && min_zoom >= 0.0 {
                tl.min_zoom = min_zoom as u32;
            }
            if max_zoom.is_finite() && max_zoom >= min_zoom {
                tl.max_zoom = (max_zoom as u32).min(30);
            }
        }
        if tile_size > 0 {
            self.tile_size = tile_size;
        }
        self.needs_redraw = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_point_layer(&mut self) -> usize {
        self.needs_redraw = true;
        self.point_layers.push(PointLayer::new());
        self.point_layers.len() - 1
    }

    #[wasm_bindgen]
    pub fn set_point_layer_visible(&mut self, layer_index: usize, visible: bool) {
        self.needs_redraw = true;
        if let Some(layer) = self.point_layers.get_mut(layer_index) {
            layer.visible = visible;
        }
    }

    #[wasm_bindgen]
    pub fn add_points(&mut self, layer_index: usize, points_data: &JsValue) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.point_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.point_layers.len() }.into());
        }

        self.point_layers[layer_index].points = parse_point_features(points_data)?;
        self.point_layers[layer_index].gpu_dirty.set(true);
        self.spatial_index_dirty = true;
        Ok(())
    }

    /// Append object-shaped points without replacing the layer. The public JS
    /// PointLayer uses this after mounting so it does not have to retain and
    /// resend every previously uploaded point.
    #[wasm_bindgen]
    pub fn append_points(&mut self, layer_index: usize, points_data: &JsValue) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.point_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.point_layers.len() }.into());
        }

        let parsed_points = parse_point_features(points_data)?;
        let layer = &mut self.point_layers[layer_index];
        layer.points.extend(parsed_points);

        layer.gpu_dirty.set(true);
        self.spatial_index_dirty = true;
        Ok(())
    }

    /// Append tightly packed points: [lat, lng, size, r, g, b, a] per point.
    /// This avoids creating millions of temporary JS objects for large layers.
    #[wasm_bindgen]
    pub fn add_points_packed(&mut self, layer_index: usize, points_data: &[f32]) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.point_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.point_layers.len() }.into());
        }
        if !points_data.len().is_multiple_of(7) {
            return Err(JsValue::from_str("Packed point data length must be divisible by 7"));
        }

        let layer = &mut self.point_layers[layer_index];
        layer.points.reserve(points_data.len() / 7);
        for point in points_data.chunks_exact(7) {
            layer.points.push(PointFeature {
                lat: point[0] as f64,
                lng: point[1] as f64,
                size: point[2],
                color: [point[3], point[4], point[5], point[6]],
                meta: serde_json::Value::Null,
            });
        }

        layer.gpu_dirty.set(true);
        self.spatial_index_dirty = true;
        Ok(())
    }

    /// Pre-allocate the layer's GPU buffer to hold `total_points` points (each
    /// 7 floats). Call this once before a streaming `append_points_packed`
    /// burst whose final size is known, so appends never trigger a growth
    /// reallocation (which copies all accumulated vertices).
    #[wasm_bindgen]
    pub fn reserve_points_packed(&mut self, layer_index: usize, total_points: usize) -> Result<(), JsValue> {
        if layer_index >= self.point_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.point_layers.len() }.into());
        }
        let gl_state = match self.gl_state.as_ref() {
            Some(s) => s,
            None => return Ok(()),
        };
        let layer = &self.point_layers[layer_index];
        let mut b = layer.vertex_buffer.borrow_mut();
        if b.is_none() {
            let buf = gl_state
                .context
                .create_buffer()
                .ok_or_else(|| RustyleafError::BufferCreation("Failed to create point layer buffer".into()))?;
            *b = Some(OwnedBuffer::new(&gl_state.context, buf));
        }
        drop(b);
        let borrow = layer.vertex_buffer.borrow();
        let buffer = match borrow.as_ref() {
            Some(b) => b.inner(),
            None => return Ok(()),
        };
        let gl = &gl_state.context;
        gl.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer));
        let bytes = total_points * 7 * 4;
        // Zero-initialized capacity so bufferSubData can fill it in later.
        gl.buffer_data_with_i32(WebGl2RenderingContext::ARRAY_BUFFER, bytes as i32, WebGl2RenderingContext::DYNAMIC_DRAW);
        Ok(())
    }

    /// Append tightly packed points WITHOUT rebuilding the GPU buffer. The new
    /// points are projected and appended to the end of the existing vertex
    /// buffer via `bufferSubData`, so a continuous stream of batches costs
    /// O(new points) per batch instead of O(total) per batch (a full re-upload
    /// of every accumulated point, which is O(n²) over a stream).
    ///
    /// Note: appended points are NOT folded into the pre-shuffled overdraw
    /// order — under extreme overdraw (zoomed way out) the fair-sample prefix
    /// favors older points. That bias is acceptable for streaming workloads.
    #[wasm_bindgen]
    pub fn append_points_packed(&mut self, layer_index: usize, points_data: &[f32]) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.point_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.point_layers.len() }.into());
        }
        if points_data.is_empty() {
            return Ok(());
        }
        if !points_data.len().is_multiple_of(7) {
            return Err(JsValue::from_str("Packed point data length must be divisible by 7"));
        }

        let new_count = points_data.len() / 7;
        let viewport = self.viewport();
        let layer = &mut self.point_layers[layer_index];
        layer.points.reserve(new_count);

        // Project the new batch into normalized mercator coordinates.
        let mut vertex_data: Vec<f32> = Vec::with_capacity(points_data.len());
        let mut min = layer.norm_min.get();
        let mut max = layer.norm_max.get();
        let mut area_sum = 0.0f64;
        for point in points_data.chunks_exact(7) {
            let lat = point[0] as f64;
            let lng = point[1] as f64;
            let size = point[2];
            let (nx, ny) = viewport.lat_lng_to_normalized(lat, lng);
            let (nx, ny) = (nx as f32, ny as f32);
            min.0 = min.0.min(nx);
            min.1 = min.1.min(ny);
            max.0 = max.0.max(nx);
            max.1 = max.1.max(ny);
            area_sum += (size as f64) * (size as f64);
            vertex_data.extend_from_slice(&[
                nx, ny,
                size,
                point[3], point[4], point[5], point[6],
            ]);
            layer.points.push(PointFeature {
                lat,
                lng,
                size,
                color: [point[3], point[4], point[5], point[6]],
                meta: serde_json::Value::Null,
            });
        }
        layer.norm_min.set(min);
        layer.norm_max.set(max);
        let prev_total = layer.vertex_count.get();
        let new_total = prev_total + new_count;
        let prev_area = layer.avg_point_area.get() as f64 * prev_total as f64;
        layer.avg_point_area.set(((prev_area + area_sum) / new_total.max(1) as f64) as f32);

        let gl_state = match self.gl_state.as_ref() {
            Some(s) => s,
            None => return Ok(()),
        };

        let gl = &gl_state.context;
        let stride = 7 * 4;
        // Append to the shadow copy; if the GPU buffer is too small to hold the
        // new total, re-upload the whole shadow (amortized growth, like Vec).
        let mut shadow = layer.gpu_shadow.borrow_mut();
        shadow.extend_from_slice(&vertex_data);
        let shadow_len = shadow.len();
        {
            let mut b = layer.vertex_buffer.borrow_mut();
            if b.is_none() {
                let buf = gl
                    .create_buffer()
                    .ok_or_else(|| RustyleafError::BufferCreation("Failed to create point layer buffer".into()))?;
                *b = Some(OwnedBuffer::new(gl, buf));
            }
            drop(b);
            let borrow = layer.vertex_buffer.borrow();
            let buffer = match borrow.as_ref() {
                Some(b) => b.inner(),
                None => return Ok(()),
            };
            gl.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer));
            let existing_size = gl.get_buffer_parameter(WebGl2RenderingContext::ARRAY_BUFFER, WebGl2RenderingContext::BUFFER_SIZE).as_f64().unwrap_or(0.0) as usize;
            let needed = shadow_len * 4;
            if existing_size < needed {
                // Grow GEOMETRICALLY (2× the needed size) so a streaming batch
                // only reallocates O(log n) times total, never per batch.
                // bufferSubData cannot resize, so a grow = full re-upload of
                // the shadow padded to the new capacity; geometric growth keeps
                // that amortized O(n) and lets later appends use bufferSubData.
                let new_floats = (needed / 4) * 2;
                let mut grown: Vec<f32> = Vec::with_capacity(new_floats);
                grown.extend_from_slice(&shadow);
                grown.resize(new_floats, 0.0);
                let vertices = Float32Array::from(&grown[..]);
                gl.buffer_data_with_array_buffer_view(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    &vertices,
                    WebGl2RenderingContext::DYNAMIC_DRAW,
                );
            } else if !vertex_data.is_empty() {
                let vertices = Float32Array::from(&vertex_data[..]);
                gl.buffer_sub_data_with_i32_and_array_buffer_view(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    (prev_total * stride) as i32,
                    &vertices,
                );
            }
        }
        layer.vertex_count.set(new_total);
        self.spatial_index_dirty = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn clear_points(&mut self, layer_index: usize) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.point_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.point_layers.len() }.into());
        }

        let layer = &mut self.point_layers[layer_index];
        layer.points.clear();
        layer.points.shrink_to_fit();
        layer.vertex_buffer.borrow_mut().take();
        layer.gpu_shadow.borrow_mut().clear();
        layer.vertex_count.set(0);
        layer.gpu_dirty.set(true);
        self.spatial_index_dirty = true;
        Ok(())
    }

    // ---------- Markers (GPU-rendered sprites) ----------

    #[wasm_bindgen]
    pub fn add_marker(&mut self) -> u32 {
        self.needs_redraw = true;
        let id = self.markers.len() as u32;
        self.markers.push(Marker::new());
        id
    }

    #[wasm_bindgen]
    pub fn update_marker(&mut self, id: u32, lat: f64, lng: f64) {
        self.needs_redraw = true;
        if let Some(m) = self.markers.get_mut(id as usize) {
            m.lat = lat;
            m.lng = lng;
        }
    }

    #[wasm_bindgen]
    #[allow(clippy::too_many_arguments)]
    pub fn set_marker_style(
        &mut self,
        id: u32,
        size: f32,
        r: f32,
        g: f32,
        b: f32,
        a: f32,
        z_order: i32,
    ) {
        if let Some(m) = self.markers.get_mut(id as usize) {
            m.size = size;
            m.color = [r, g, b, a];
            m.z_order = z_order;
        }
    }

    #[wasm_bindgen]
    pub fn set_marker_visible(&mut self, id: u32, visible: bool) {
        self.needs_redraw = true;
        if let Some(m) = self.markers.get_mut(id as usize) {
            m.visible.set(visible);
        }
    }

    #[wasm_bindgen]
    pub fn remove_marker(&mut self, id: u32) {
        self.needs_redraw = true;
        if (id as usize) < self.markers.len() {
            self.markers.remove(id as usize);
        }
    }

    #[wasm_bindgen]
    pub fn get_marker_latlng(&self, id: u32) -> Result<JsValue, JsValue> {
        if let Some(m) = self.markers.get(id as usize) {
            let arr = js_sys::Array::new();
            arr.push(&JsValue::from_f64(m.lat));
            arr.push(&JsValue::from_f64(m.lng));
            Ok(arr.into())
        } else {
            Err(RustyleafError::LayerOutOfBounds { index: id as usize, len: self.markers.len() }.into())
        }
    }

    #[wasm_bindgen]
    pub fn add_line_layer(&mut self) -> usize {
        self.needs_redraw = true;
        let line_layer = LineLayer::new();
        self.line_layers.push(line_layer);
        self.line_layers.len() - 1
    }

    #[wasm_bindgen]
    pub fn set_line_layer_visible(&mut self, layer_index: usize, visible: bool) {
        self.needs_redraw = true;
        if let Some(layer) = self.line_layers.get_mut(layer_index) {
            layer.visible = visible;
        }
    }

    #[wasm_bindgen]
    pub fn add_lines(&mut self, layer_index: usize, lines_data: &JsValue) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.line_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.line_layers.len() }.into());
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
        self.line_layers[layer_index].gpu_dirty.set(true);
        self.spatial_index_dirty = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_polygon_layer(&mut self) -> usize {
        self.needs_redraw = true;
        let polygon_layer = PolygonLayer::new();
        self.polygon_layers.push(polygon_layer);
        self.polygon_layers.len() - 1
    }

    /// Free a point layer's GPU buffer while keeping its data. The next
    /// frame that renders the layer re-uploads automatically (gpu_dirty).
    #[wasm_bindgen]
    pub fn free_point_layer_gpu(&mut self, layer_index: usize) -> Result<(), JsValue> {
        if layer_index >= self.point_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.point_layers.len() }.into());
        }
        let old = self.point_layers[layer_index].vertex_buffer.borrow_mut().take();
        drop(old); // OwnedBuffer::Drop -> deleteBuffer
        self.point_layers[layer_index].gpu_dirty.set(true);
        self.needs_redraw = true;
        Ok(())
    }

    /// Free a line layer's GPU instance buffer (data retained; auto-reupload).
    #[wasm_bindgen]
    pub fn free_line_layer_gpu(&mut self, layer_index: usize) -> Result<(), JsValue> {
        if layer_index >= self.line_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.line_layers.len() }.into());
        }
        let old = self.line_layers[layer_index].vertex_buffer.borrow_mut().take();
        drop(old);
        self.line_layers[layer_index].instance_count.set(0);
        self.line_layers[layer_index].gpu_dirty.set(true);
        self.needs_redraw = true;
        Ok(())
    }

    /// Free a polygon layer's GPU vertex buffer (data retained; auto-reupload).
    #[wasm_bindgen]
    pub fn free_polygon_layer_gpu(&mut self, layer_index: usize) -> Result<(), JsValue> {
        if layer_index >= self.polygon_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.polygon_layers.len() }.into());
        }
        let old = self.polygon_layers[layer_index].vertex_buffer.borrow_mut().take();
        drop(old);
        self.polygon_layers[layer_index].vertex_count.set(0);
        self.polygon_layers[layer_index].gpu_dirty.set(true);
        self.needs_redraw = true;
        Ok(())
    }

    /// Free a GeoJSON layer's cached GPU buffers (features retained;
    /// caches rebuild on the next render that shows the layer).
    #[wasm_bindgen]
    pub fn free_geojson_layer_gpu(&mut self, layer_index: usize) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.geojson_layers.len() }.into());
        }
        let poly = self.geojson_layers[layer_index].polygon_vertex_buffer.borrow_mut().take();
        drop(poly);
        let line = self.geojson_layers[layer_index].line_vertex_buffer.borrow_mut().take();
        drop(line);
        self.geojson_layers[layer_index].polygon_vertex_count.set(0);
        self.geojson_layers[layer_index].line_vertex_count.set(0);
        self.needs_redraw = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn set_polygon_layer_visible(&mut self, layer_index: usize, visible: bool) {
        self.needs_redraw = true;
        if let Some(layer) = self.polygon_layers.get_mut(layer_index) {
            layer.visible = visible;
        }
    }

    #[wasm_bindgen]
    pub fn add_polygons(&mut self, layer_index: usize, polygons_data: &JsValue) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.polygon_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.polygon_layers.len() }.into());
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
        self.polygon_layers[layer_index].gpu_dirty.set(true);
        self.spatial_index_dirty = true;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_geojson_layer(&mut self) -> usize {
        self.needs_redraw = true;
        let geojson_layer = GeoJSONLayer {
            features: Vec::new(),
            visible: true,
            style: GeoJSONStyle::default(),
            cached_points: Vec::new(),
            cached_lines: Vec::new(),
            cached_polygon_triangles: Vec::new(),
            cached_polygon_hits: Vec::new(),
            pending_chunk: String::new(),
            last_rebuilt_len: 0,
            last_rebuilt_at_ms: 0.0,
            polygon_vertex_buffer: RefCell::new(None),
            polygon_vertex_count: Cell::new(0),
            line_vertex_buffer: RefCell::new(None),
            line_vertex_count: Cell::new(0),
        };
        self.geojson_layers.push(geojson_layer);
        self.geojson_layers.len() - 1
    }

    #[wasm_bindgen]
    pub fn set_geojson_layer_visible(&mut self, layer_index: usize, visible: bool) {
        self.needs_redraw = true;
        if let Some(layer) = self.geojson_layers.get_mut(layer_index) {
            layer.visible = visible;
        }
    }

    #[wasm_bindgen]
    pub fn load_geojson(&mut self, layer_index: usize, geojson_str: &str) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.geojson_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.geojson_layers.len() }.into());
        }

        // Parse GeoJSON string
        let features = self.parse_geojson_string(geojson_str)?;
        self.geojson_layers[layer_index].features = features;
        self.rebuild_geojson_cache(layer_index)?;
        self.spatial_index_dirty = true;

        Ok(())
    }

    #[wasm_bindgen]
    pub fn load_geojson_chunk(&mut self, layer_index: usize, chunk_str: &str, is_final: bool) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.geojson_layers.len() }.into());
        }

        // Accumulate into a pending buffer so features spanning chunk
        // boundaries are parsed exactly once, in full.
        let mut buffer = std::mem::take(&mut self.geojson_layers[layer_index].pending_chunk);
        buffer.push_str(chunk_str);
        let drained = self.drain_features(&mut buffer, is_final);
        self.geojson_layers[layer_index].pending_chunk = buffer;

        if !drained.is_empty() || is_final {
            self.geojson_layers[layer_index].features.extend(drained);
            // Re-triangulation + GPU re-upload are O(n); doing them on EVERY
            // chunk makes ingestion quadratic and stalls the render thread.
            // Batch rebuilds: at most one per ~250 newly-parsed features
            // (plus always the final flush).
            let len = self.geojson_layers[layer_index].features.len();
            let since = len - self.geojson_layers[layer_index].last_rebuilt_len;
            let now_ms = js_sys::Date::now();
            if is_final || (since >= 250 && now_ms - self.geojson_layers[layer_index].last_rebuilt_at_ms >= 120.0) {
                self.rebuild_geojson_cache(layer_index)?;
                self.geojson_layers[layer_index].last_rebuilt_len = len;
                self.geojson_layers[layer_index].last_rebuilt_at_ms = now_ms;
            }
            self.spatial_index_dirty = true;
        }

        Ok(())
    }

    /// Extract all COMPLETE feature/geometry objects from the accumulated
    /// buffer, leaving only genuinely-partial data behind. Quote-aware, so
    /// braces inside string values never desynchronize the depth tracking.
    fn drain_features(&self, buf: &mut String, is_final: bool) -> Vec<GeoJSONFeature> {
        let mut out = Vec::new();

        // Fast path: the buffer is already a complete JSON document.
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(buf) {
            if let Ok(mut f) = self.parse_geojson_value(&v) {
                out.append(&mut f);
            }
            buf.clear();
            return out;
        }

        let chars: Vec<char> = buf.chars().collect();
        let mut stack: Vec<usize> = Vec::new(); // indices of unmatched '{'
        let mut consumed_until = 0usize; // chars strictly before this are done
        let mut in_string = false;
        let mut escaped = false;

        for (i, &c) in chars.iter().enumerate() {
            if in_string {
                if escaped {
                    escaped = false;
                } else if c == '\\' {
                    escaped = true;
                } else if c == '"' {
                    in_string = false;
                }
                continue;
            }
            match c {
                '"' => in_string = true,
                '{' => stack.push(i),
                '}' => {
                    if let Some(start) = stack.pop() {
                        let segment: String = chars[start..=i].iter().collect();
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&segment) {
                            // ONLY complete Feature objects count. Accepting
                            // bare geometries here would double-count the
                            // geometry objects nested INSIDE features.
                            let is_feature =
                                v.get("type").and_then(|x| x.as_str()) == Some("Feature");
                            if is_feature {
                                if let Ok(mut f) = self.parse_geojson_value(&v) {
                                    if !f.is_empty() {
                                        out.append(&mut f);
                                        consumed_until = i + 1;
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Retention: drop everything fully consumed; keep the innermost
        // unclosed object (a partial feature or the collection skeleton).
        // Wasm-event style note: taking max() avoids re-scanning features
        // that were already emitted above.
        let keep_from = stack.first().copied().unwrap_or(consumed_until).max(consumed_until);
        let tail: String = chars[keep_from..].iter().collect();

        if is_final {
            // Last chance: newline-delimited JSON in the remaining tail.
            for line in tail.lines() {
                let line = line.trim().trim_end_matches(',');
                if line.starts_with('{') {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Ok(mut f) = self.parse_geojson_value(&v) {
                            out.append(&mut f);
                        }
                    }
                }
            }
            buf.clear();
        } else {
            *buf = tail;
        }

        out
    }

    #[wasm_bindgen]
    pub fn clear_geojson_layer(&mut self, layer_index: usize) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.geojson_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.geojson_layers.len() }.into());
        }

        self.geojson_layers[layer_index].features.clear();
        self.geojson_layers[layer_index].cached_points.clear();
        self.geojson_layers[layer_index].cached_lines.clear();
        self.geojson_layers[layer_index].cached_polygon_triangles.clear();
        self.geojson_layers[layer_index].cached_polygon_hits.clear();
        self.geojson_layers[layer_index].pending_chunk.clear();
        self.geojson_layers[layer_index].last_rebuilt_len = 0;
        self.geojson_layers[layer_index].last_rebuilt_at_ms = 0.0;
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
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.geojson_layers.len() }.into());
        }

        Ok(self.geojson_layers[layer_index].features.len())
    }

    #[wasm_bindgen]
    pub fn set_geojson_style(&mut self, layer_index: usize, style_data: &JsValue) -> Result<(), JsValue> {
        self.needs_redraw = true;
        if layer_index >= self.geojson_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.geojson_layers.len() }.into());
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
            // The render cache bakes style into the cached features, so a
            // style change must rebuild it — otherwise styles set after
            // load_geojson (the normal addTo order) never take effect.
            self.rebuild_geojson_cache(layer_index)?;
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
                    self.trigger_feature_click(hit_info, canvas_x, canvas_y);
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

        if let Some(ref gl_state) = self.gl_state {
            let ctx = render::geojson::GeoJsonRenderCtx {
                context,
                gl_state,
                geojson_layers: &self.geojson_layers,
                viewport: &self.viewport(),
            };
            render::geojson::render_geojson(&ctx)
        } else {
            Ok(())
        }
    }

    fn parse_geojson_string(&self, geojson_str: &str) -> Result<Vec<GeoJSONFeature>, JsValue> {
        web_sys::console::log_2(&"Parsing GeoJSON string length:".into(), &geojson_str.len().into());

        // Parse GeoJSON string using serde_json
        let geojson_value: serde_json::Value = serde_json::from_str(geojson_str)
            .map_err(|e| {
                web_sys::console::log_2(&"GeoJSON parse error:".into(), &e.to_string().into());
                RustyleafError::GeoJsonParse(format!("Failed to parse GeoJSON: {}", e))
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
                    .ok_or_else(|| RustyleafError::GeoJsonParse("GeoJSON missing 'type' field".into()))?;

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
            _ => return Err(RustyleafError::GeoJsonParse("GeoJSON must be an object".into()).into()),
        }

        web_sys::console::log_2(&"Total features parsed:".into(), &features.len().into());
        Ok(features)
    }

    fn parse_geojson_feature(&self, feature_value: &serde_json::Value) -> Result<GeoJSONFeature, JsValue> {
        let obj = feature_value.as_object()
            .ok_or_else(|| RustyleafError::GeoJsonParse("Feature must be an object".into()))?;

        let geometry = obj.get("geometry")
            .ok_or_else(|| RustyleafError::GeoJsonParse("Feature missing 'geometry' field".into()))?;
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
            .ok_or_else(|| RustyleafError::GeoJsonParse("Geometry must be an object".into()))?;

        let geometry_type = obj.get("type")
            .and_then(|t| t.as_str())
            .ok_or_else(|| RustyleafError::GeoJsonParse("Geometry missing 'type' field".into()))?;

        let coordinates = obj.get("coordinates")
            .ok_or_else(|| RustyleafError::GeoJsonParse("Geometry missing 'coordinates' field".into()))?;

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
            _ => Err(RustyleafError::GeoJsonParse(format!("Unsupported geometry type: {}", geometry_type)).into()),
        }
    }

    fn parse_point_coordinates(&self, value: &serde_json::Value) -> Result<[f64; 2], JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| RustyleafError::GeoJsonParse("Point coordinates must be an array".into()))?;
        
        if arr.len() < 2 {
            return Err(RustyleafError::GeoJsonParse("Point coordinates must have at least 2 values".into()).into());
        }

        let x = arr[0].as_f64().ok_or_else(|| RustyleafError::GeoJsonParse("Invalid x coordinate".into()))?;
        let y = arr[1].as_f64().ok_or_else(|| RustyleafError::GeoJsonParse("Invalid y coordinate".into()))?;

        Ok([x, y])
    }

    fn parse_multi_point_coordinates(&self, value: &serde_json::Value) -> Result<Vec<[f64; 2]>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| RustyleafError::GeoJsonParse("MultiPoint coordinates must be an array".into()))?;
        
        let mut points = Vec::new();
        for point_value in arr {
            points.push(self.parse_point_coordinates(point_value)?);
        }

        Ok(points)
    }

    fn parse_line_string_coordinates(&self, value: &serde_json::Value) -> Result<Vec<[f64; 2]>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| RustyleafError::GeoJsonParse("LineString coordinates must be an array".into()))?;
        
        let mut points = Vec::new();
        for point_value in arr {
            points.push(self.parse_point_coordinates(point_value)?);
        }

        if points.len() < 2 {
            return Err(RustyleafError::GeoJsonParse("LineString must have at least 2 points".into()).into());
        }

        Ok(points)
    }

    fn parse_multi_line_string_coordinates(&self, value: &serde_json::Value) -> Result<Vec<Vec<[f64; 2]>>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| RustyleafError::GeoJsonParse("MultiLineString coordinates must be an array".into()))?;
        
        let mut lines = Vec::new();
        for line_value in arr {
            lines.push(self.parse_line_string_coordinates(line_value)?);
        }

        Ok(lines)
    }

    fn parse_polygon_coordinates(&self, value: &serde_json::Value) -> Result<Vec<Vec<[f64; 2]>>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| RustyleafError::GeoJsonParse("Polygon coordinates must be an array".into()))?;
        
        let mut rings = Vec::new();
        for ring_value in arr {
            let ring = self.parse_line_string_coordinates(ring_value)?; // Reuse line string parsing
            if ring.len() < 3 {
                return Err(RustyleafError::GeoJsonParse("Polygon ring must have at least 3 points".into()).into());
            }
            rings.push(ring);
        }

        if rings.is_empty() {
            return Err(RustyleafError::GeoJsonParse("Polygon must have at least one ring".into()).into());
        }

        Ok(rings)
    }

    fn parse_multi_polygon_coordinates(&self, value: &serde_json::Value) -> Result<Vec<Vec<Vec<[f64; 2]>>>, JsValue> {
        let arr = value.as_array()
            .ok_or_else(|| RustyleafError::GeoJsonParse("MultiPolygon coordinates must be an array".into()))?;
        
        let mut polygons = Vec::new();
        for polygon_value in arr {
            polygons.push(self.parse_polygon_coordinates(polygon_value)?);
        }

        Ok(polygons)
    }

    // Spatial indexing and hit-testing methods
    fn rebuild_spatial_index(&mut self) {
        rebuild_spatial_index(
            &self.point_layers, &self.line_layers, &self.polygon_layers, &self.geojson_layers,
            &mut self.spatial_index, &mut self.spatial_index_dirty
        );
    }

    fn hit_test(&self, x: f64, y: f64) -> Option<serde_json::Value> {
        spatial_hit_test(&self.viewport(), &self.spatial_index, x, y)
    }

    fn rebuild_geojson_cache(&mut self, layer_index: usize) -> Result<(), JsValue> {
        if layer_index >= self.geojson_layers.len() {
            return Err(RustyleafError::LayerOutOfBounds { index: layer_index, len: self.geojson_layers.len() }.into());
        }

        let style = self.geojson_layers[layer_index].style.clone();
        let mut cached_points: Vec<PointFeature> = Vec::new();
        let mut cached_lines: Vec<LineFeature> = Vec::new();
        let mut cached_polygon_triangles: Vec<[f64; 2]> = Vec::new();
        let mut cached_polygon_hits: Vec<PolygonHit> = Vec::new();

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
                        // Interior hit-testing record (outer ring + properties)
                        cached_polygon_hits.push(PolygonHit { outer_ring: polygon_rings[0].clone(), meta: feature.properties.clone() });
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
                            cached_polygon_hits.push(PolygonHit { outer_ring: polygon_rings[0].clone(), meta: feature.properties.clone() });
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
        self.geojson_layers[layer_index].cached_polygon_hits = cached_polygon_hits;

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
                    let array = Float32Array::from(&vertex_data[..]);
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
                    let array = Float32Array::from(&line_vertex_data[..]);
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

    fn triangulate_polygon_with_holes_lyon(&self, rings: &[Vec<[f64; 2]>]) -> Vec<[f64; 2]> {
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

}

// Separate TileLayer API class
#[wasm_bindgen]
pub struct TileLayerApi {
    url_template: String,
    #[allow(dead_code)] // forwarded once per-layer subdomain/zoom options are wired through add_to
    subdomains: Vec<String>,
    #[allow(dead_code)]
    max_zoom: u32,
    #[allow(dead_code)]
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
    #[allow(dead_code)] // toggled by future setVisible API
    visible: bool,
}

impl Default for PointLayerApi {
    fn default() -> Self {
        Self::new()
    }
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
