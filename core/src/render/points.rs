use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;

use crate::layers::point::PointLayer;
use crate::projection::Viewport;
use crate::WebGlState;

pub fn render_points(
    context: &WebGl2RenderingContext,
    gl_state: &WebGlState,
    point_layers: &[PointLayer],
    viewport: &Viewport,
) -> Result<(), JsValue> {
    if point_layers.is_empty() {
        return Ok(());
    }

    context.use_program(Some(gl_state.programs.point_program.inner()));
    context.bind_vertex_array(Some(gl_state.point_vao.inner()));

    for layer in point_layers {
        if !layer.visible {
            continue;
        }

        let mut vertex_data = Vec::new();

        for point in layer.points.iter() {
            let screen_pos = viewport.lat_lng_to_screen(point.lat, point.lng);
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

            context.draw_arrays(WebGl2RenderingContext::POINTS, 0, layer.points.len() as i32);
        }
    }

    Ok(())
}
