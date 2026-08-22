use crate::OwnedProgram;
use crate::error::RustyleafError;
use wasm_bindgen::JsValue;
use web_sys::{WebGl2RenderingContext, WebGlProgram, WebGlShader};

// ---------- GLSL shader source strings ----------

pub(crate) const TILE_VERTEX_SHADER: &str = r#"
attribute vec2 a_position;
attribute vec2 a_texCoord;
uniform mat4 u_matrix;
varying vec2 v_texCoord;

void main() {
    vec4 position = u_matrix * vec4(a_position, 0.0, 1.0);
    gl_Position = position;
    v_texCoord = a_texCoord;
}
"#;

pub(crate) const TILE_FRAGMENT_SHADER: &str = r#"
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;

void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord);
}
"#;

// a_position holds zoom-independent normalized Web-Mercator coords in [0,1],
// uploaded to the GPU once. The shader converts them to screen pixels every
// frame using u_world_scale (tile_size * 2^zoom) and u_origin (viewport top-left
// in world pixels), so panning/zooming touches no vertex data on the CPU.
// The GeoJSON point path reuses this program with u_world_scale=1 / u_origin=0
// and uploads screen-space coords directly.
pub(crate) const POINT_VERTEX_SHADER: &str = r#"
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform float u_world_scale;
uniform vec2 u_origin;
varying vec4 v_color;

void main() {
    vec2 pixel_pos = a_position * u_world_scale;
    vec2 screen_pos = pixel_pos - u_origin;
    gl_Position = u_matrix * vec4(screen_pos, 0.0, 1.0);
    gl_PointSize = a_size;
    v_color = a_color;
}
"#;

pub(crate) const POINT_FRAGMENT_SHADER: &str = r#"
precision mediump float;
varying vec4 v_color;

void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    gl_FragColor = v_color;
}
"#;

pub(crate) const LINE_VERTEX_SHADER: &str = r#"
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
"#;

pub(crate) const LINE_FRAGMENT_SHADER: &str = r#"
precision mediump float;
varying vec4 v_color;

void main() {
    gl_FragColor = v_color;
}
"#;

pub(crate) const POLYGON_VERTEX_SHADER: &str = r#"
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
"#;

pub(crate) const POLYGON_FRAGMENT_SHADER: &str = r#"
precision mediump float;
varying vec4 v_color;

void main() {
    gl_FragColor = v_color;
}
"#;

// GPU-resident width-expanded lines. Segment data is uploaded ONCE (per
// instance: start/end in normalized world coords + pixel half-width + color)
// and each of the 6 corner vertices per segment is expanded in the vertex
// shader, so panning/zooming costs no CPU vertex rebuilds at all.
pub(crate) const LINE_GPU_VERTEX_SHADER: &str = r#"
attribute vec2 a_start;      // normalized [0..1] segment start (per instance)
attribute vec2 a_end;        // normalized [0..1] segment end   (per instance)
attribute float a_half_width; // pixels                          (per instance)
attribute vec4 a_color;      //                                 (per instance)
attribute vec2 a_corner;     // (t along segment, side sign)    (per vertex)

varying vec4 v_color;
uniform mat4 u_matrix;
uniform float u_world_scale;
uniform vec2 u_origin;

void main() {
    vec2 sp = a_start * u_world_scale - u_origin;
    vec2 ep = a_end * u_world_scale - u_origin;
    vec2 dir = ep - sp;
    float len = length(dir);
    // Pixel-space perpendicular; degenerate segments collapse to zero area.
    vec2 n = len > 0.000001 ? vec2(-dir.y, dir.x) / len : vec2(0.0);
    vec2 p = mix(sp, ep, a_corner.x) + n * (a_half_width * a_corner.y);
    gl_Position = u_matrix * vec4(p, 0.0, 1.0);
    v_color = a_color;
}
"#;

// ---------- ShaderPrograms struct ----------

pub(crate) struct ShaderPrograms {
    pub tile_program: OwnedProgram,
    pub point_program: OwnedProgram,
    pub line_program: OwnedProgram,
    pub line_gpu_program: OwnedProgram,
    pub polygon_program: OwnedProgram,
}

// ---------- Shader compilation helpers ----------

pub(crate) fn create_shader(
    context: &WebGl2RenderingContext,
    shader_type: u32,
    source: &str,
) -> Result<WebGlShader, JsValue> {
    let shader = context
        .create_shader(shader_type)
        .ok_or_else(|| RustyleafError::ResourceError("Failed to create shader".into()))?;
    context.shader_source(&shader, source);
    context.compile_shader(&shader);

    if !context
        .get_shader_parameter(&shader, WebGl2RenderingContext::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        let info = context
            .get_shader_info_log(&shader)
            .unwrap_or_else(|| "Unknown error".to_string());
        let shader_type_str = match shader_type {
            WebGl2RenderingContext::VERTEX_SHADER => "vertex",
            WebGl2RenderingContext::FRAGMENT_SHADER => "fragment",
            _ => "unknown",
        };
        return Err(RustyleafError::ShaderCompilation {
            shader_type: shader_type_str.to_string(),
            log: info,
        }
        .into());
    }

    Ok(shader)
}

pub(crate) fn create_program_with_bindings(
    context: &WebGl2RenderingContext,
    vertex_shader: &WebGlShader,
    fragment_shader: &WebGlShader,
    bindings: &[(u32, &str)],
) -> Result<WebGlProgram, JsValue> {
    let program = context
        .create_program()
        .ok_or_else(|| RustyleafError::ProgramCreation("Failed to create program".into()))?;
    context.attach_shader(&program, vertex_shader);
    context.attach_shader(&program, fragment_shader);
    for (index, name) in bindings {
        context.bind_attrib_location(&program, *index, name);
    }
    context.link_program(&program);

    if !context
        .get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        let info = context
            .get_program_info_log(&program)
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(RustyleafError::ShaderLink(info).into());
    }

    Ok(program)
}

// ---------- Shader program factory ----------

pub(crate) fn create_shader_programs(
    context: &WebGl2RenderingContext,
) -> Result<ShaderPrograms, JsValue> {
    let tile_vertex_shader = create_shader(
        context,
        WebGl2RenderingContext::VERTEX_SHADER,
        TILE_VERTEX_SHADER,
    )?;
    let tile_fragment_shader = create_shader(
        context,
        WebGl2RenderingContext::FRAGMENT_SHADER,
        TILE_FRAGMENT_SHADER,
    )?;
    let tile_program = create_program_with_bindings(
        context,
        &tile_vertex_shader,
        &tile_fragment_shader,
        &[(0, "a_position"), (1, "a_texCoord")],
    )?;

    let point_vertex_shader = create_shader(
        context,
        WebGl2RenderingContext::VERTEX_SHADER,
        POINT_VERTEX_SHADER,
    )?;
    let point_fragment_shader = create_shader(
        context,
        WebGl2RenderingContext::FRAGMENT_SHADER,
        POINT_FRAGMENT_SHADER,
    )?;
    let point_program = create_program_with_bindings(
        context,
        &point_vertex_shader,
        &point_fragment_shader,
        &[(0, "a_position"), (1, "a_size"), (2, "a_color")],
    )?;

    let line_vertex_shader = create_shader(
        context,
        WebGl2RenderingContext::VERTEX_SHADER,
        LINE_VERTEX_SHADER,
    )?;
    let line_fragment_shader = create_shader(
        context,
        WebGl2RenderingContext::FRAGMENT_SHADER,
        LINE_FRAGMENT_SHADER,
    )?;
    let line_program = create_program_with_bindings(
        context,
        &line_vertex_shader,
        &line_fragment_shader,
        &[(0, "a_position"), (1, "a_color")],
    )?;

    let polygon_vertex_shader = create_shader(
        context,
        WebGl2RenderingContext::VERTEX_SHADER,
        POLYGON_VERTEX_SHADER,
    )?;
    let polygon_fragment_shader = create_shader(
        context,
        WebGl2RenderingContext::FRAGMENT_SHADER,
        POLYGON_FRAGMENT_SHADER,
    )?;
    let polygon_program = create_program_with_bindings(
        context,
        &polygon_vertex_shader,
        &polygon_fragment_shader,
        &[(0, "a_position"), (1, "a_color")],
    )?;

    let line_gpu_vertex_shader = create_shader(
        context,
        WebGl2RenderingContext::VERTEX_SHADER,
        LINE_GPU_VERTEX_SHADER,
    )?;
    let line_gpu_fragment_shader = create_shader(
        context,
        WebGl2RenderingContext::FRAGMENT_SHADER,
        LINE_FRAGMENT_SHADER,
    )?;
    let line_gpu_program = create_program_with_bindings(
        context,
        &line_gpu_vertex_shader,
        &line_gpu_fragment_shader,
        &[
            (0, "a_start"),
            (1, "a_end"),
            (2, "a_half_width"),
            (3, "a_color"),
            (4, "a_corner"),
        ],
    )?;

    Ok(ShaderPrograms {
        tile_program: OwnedProgram::new(
            context,
            tile_program,
            tile_vertex_shader,
            tile_fragment_shader,
        ),
        point_program: OwnedProgram::new(
            context,
            point_program,
            point_vertex_shader,
            point_fragment_shader,
        ),
        line_program: OwnedProgram::new(
            context,
            line_program,
            line_vertex_shader,
            line_fragment_shader,
        ),
        line_gpu_program: OwnedProgram::new(
            context,
            line_gpu_program,
            line_gpu_vertex_shader,
            line_gpu_fragment_shader,
        ),
        polygon_program: OwnedProgram::new(
            context,
            polygon_program,
            polygon_vertex_shader,
            polygon_fragment_shader,
        ),
    })
}
