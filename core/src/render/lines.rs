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

    let projection_matrix = super::screen_projection_matrix(viewport);
    let u_matrix = context.get_uniform_location(gl_state.programs.line_program.inner(), "u_matrix");
    if let Some(loc) = u_matrix.as_ref() {
        context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
    }

    for layer in line_layers {
        if !layer.visible {
            continue;
        }

        let mut vertex_data = Vec::new();

        // Each segment is expanded into a screen-space quad (two triangles)
        // perpendicular to its direction, so `width` is honored — WebGL2's
        // native lineWidth is effectively fixed at 1.0.
        for line in layer.lines.iter() {
            let half_width = (line.width.max(1.0) as f64) / 2.0;
            for i in 0..line.points.len().saturating_sub(1) {
                let start = line.points[i];
                let end = line.points[i + 1];

                let s = viewport.lat_lng_to_screen(start[0], start[1]);
                let e = viewport.lat_lng_to_screen(end[0], end[1]);

                let dx = e.0 - s.0;
                let dy = e.1 - s.1;
                let len = (dx * dx + dy * dy).sqrt();
                if len < 1e-6 {
                    continue;
                }
                let nx = (-dy / len * half_width) as f32;
                let ny = (dx / len * half_width) as f32;
                let (sx, sy) = (s.0 as f32, s.1 as f32);
                let (ex, ey) = (e.0 as f32, e.1 as f32);
                let c = line.color;

                // quad corners: a = s+n, b = s-n, d = e+n, f = e-n
                vertex_data.extend_from_slice(&[
                    sx + nx, sy + ny, c[0], c[1], c[2], c[3],
                    sx - nx, sy - ny, c[0], c[1], c[2], c[3],
                    ex + nx, ey + ny, c[0], c[1], c[2], c[3],
                    sx - nx, sy - ny, c[0], c[1], c[2], c[3],
                    ex - nx, ey - ny, c[0], c[1], c[2], c[3],
                    ex + nx, ey + ny, c[0], c[1], c[2], c[3],
                ]);
            }
        }

        if !vertex_data.is_empty() {
            // Bulk copy — element-wise set_index is prohibitively slow for large layers
            let vertices = Float32Array::from(&vertex_data[..]);

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
            context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices as i32);
        }
    }

    Ok(())
}
