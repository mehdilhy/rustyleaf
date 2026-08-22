use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;

use crate::layers::line::LineLayer;
use crate::projection::Viewport;
use crate::error::RustyleafError;
use crate::OwnedBuffer;
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

    for layer in line_layers {
        if !layer.visible {
            continue;
        }

        // Upload instance data once per data change; every frame after that
        // is a single instanced draw call (expansion lives in the shader).
        if layer.gpu_dirty.get() || layer.vertex_buffer.borrow().is_none() {
            let mut instance_data: Vec<f32> = Vec::new();
            for line in layer.lines.iter() {
                let half_width = (line.width.max(1.0)) / 2.0;
                for i in 0..line.points.len().saturating_sub(1) {
                    let start = line.points[i];
                    let end = line.points[i + 1];
                    // Skip exact duplicates only — near-degenerate segments
                    // must still upload because degeneracy is zoom-dependent.
                    if start[0] == end[0] && start[1] == end[1] {
                        continue;
                    }
                    let (sx, sy) = viewport.lat_lng_to_normalized(start[0], start[1]);
                    let (ex, ey) = viewport.lat_lng_to_normalized(end[0], end[1]);
                    let c = line.color;
                    instance_data.extend_from_slice(&[
                        sx as f32, sy as f32,
                        ex as f32, ey as f32,
                        half_width,
                        c[0], c[1], c[2], c[3],
                    ]);
                }
            }

            if layer.vertex_buffer.borrow().is_none() {
                let buf = context
                    .create_buffer()
                    .ok_or_else(|| RustyleafError::BufferCreation("Failed to create line layer buffer".into()))?;
                *layer.vertex_buffer.borrow_mut() = Some(OwnedBuffer::new(context, buf));
            }

            context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(layer.vertex_buffer.borrow().as_ref().unwrap().inner()));
            let array = Float32Array::from(&instance_data[..]);
            context.buffer_data_with_array_buffer_view(
                WebGl2RenderingContext::ARRAY_BUFFER,
                &array,
                WebGl2RenderingContext::STATIC_DRAW,
            );
            layer.instance_count.set(instance_data.len() / 9);
            layer.gpu_dirty.set(false);
        }

        let instance_count = layer.instance_count.get();
        if instance_count == 0 {
            continue;
        }

        let buffer_owned = layer.vertex_buffer.borrow();
        let buffer = match buffer_owned.as_ref() {
            Some(b) => b,
            None => continue,
        };

        context.use_program(Some(gl_state.programs.line_gpu_program.inner()));
        context.bind_vertex_array(Some(gl_state.line_gpu_vao.inner()));

        // Re-point the per-instance attributes at THIS layer's buffer (the
        // corner attribute lives in the VAO and is static).
        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));
        let stride = 9 * 4;
        context.enable_vertex_attrib_array(0); // a_start
        context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
        context.enable_vertex_attrib_array(1); // a_end
        context.vertex_attrib_pointer_with_i32(1, 2, WebGl2RenderingContext::FLOAT, false, stride, 8);
        context.enable_vertex_attrib_array(2); // a_half_width
        context.vertex_attrib_pointer_with_i32(2, 1, WebGl2RenderingContext::FLOAT, false, stride, 16);
        context.enable_vertex_attrib_array(3); // a_color
        context.vertex_attrib_pointer_with_i32(3, 4, WebGl2RenderingContext::FLOAT, false, stride, 20);
        context.vertex_attrib_divisor(0, 1);
        context.vertex_attrib_divisor(1, 1);
        context.vertex_attrib_divisor(2, 1);
        context.vertex_attrib_divisor(3, 1);

        let projection_matrix = super::screen_projection_matrix(viewport);
        let program = gl_state.programs.line_gpu_program.inner();
        let u_matrix = context.get_uniform_location(program, "u_matrix");
        if let Some(loc) = u_matrix.as_ref() {
            context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
        }

        let zoom = (viewport.zoom.round() as i64).clamp(0, 30) as u32;
        let center_pixel = viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, zoom);
        if let Some(loc) = gl_state.line_gpu_u_origin.as_ref() {
            context.uniform2f(
                Some(loc),
                (center_pixel.0 - viewport.width as f64 / 2.0) as f32,
                (center_pixel.1 - viewport.height as f64 / 2.0) as f32,
            );
        }
        if let Some(loc) = gl_state.line_gpu_u_world_scale.as_ref() {
            context.uniform1f(Some(loc), (viewport.tile_size as u64 * (1u64 << zoom)) as f32);
        }

        context.draw_arrays_instanced(
            WebGl2RenderingContext::TRIANGLES,
            0,
            6,
            instance_count as i32,
        );
    }

    Ok(())
}
