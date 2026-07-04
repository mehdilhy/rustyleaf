use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;

use crate::layers::line::LineLayer;
use crate::projection::Viewport;
use crate::WebGlState;

pub fn render_lines(
    context: &WebGl2RenderingContext,
    gl_state: &WebGlState,
    line_layers: &[LineLayer],
    viewport: &Viewport,
) -> Result<(), JsValue> {
    if line_layers.is_empty() {
        return Ok(());
    }

    context.use_program(Some(gl_state.programs.line_program.inner()));
    context.bind_vertex_array(Some(gl_state.line_vao.inner()));

    for layer in line_layers {
        if !layer.visible {
            continue;
        }

        let mut vertex_data = Vec::new();

        for line in layer.lines.iter() {
            for i in 0..line.points.len().saturating_sub(1) {
                let start = line.points[i];
                let end = line.points[i + 1];

                let start_screen = viewport.lat_lng_to_screen(start[0], start[1]);
                let end_screen = viewport.lat_lng_to_screen(end[0], end[1]);

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

            let stride = 6 * 4;

            context.enable_vertex_attrib_array(0);
            context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);

            context.enable_vertex_attrib_array(1);
            context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

            if let Some(ref loc) = gl_state.line_u_origin {
                context.uniform2f(Some(loc), 0.0, 0.0);
            }
            if let Some(ref loc) = gl_state.line_u_world_scale {
                context.uniform1f(Some(loc), 1.0);
            }

            let total_vertices = vertex_data.len() / 6;
            context.draw_arrays(WebGl2RenderingContext::LINES, 0, total_vertices as i32);
        }
    }

    Ok(())
}
