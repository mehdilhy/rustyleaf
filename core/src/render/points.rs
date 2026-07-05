use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;

use crate::layers::point::PointLayer;
use crate::projection::Viewport;
use crate::{WebGlState, OwnedBuffer};

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

    // Per-frame uniforms: the shader projects normalized coords → screen pixels,
    // so panning/zooming only changes these three uniforms, never vertex data.
    let projection_matrix = super::screen_projection_matrix(viewport);
    let u_matrix = context.get_uniform_location(gl_state.programs.point_program.inner(), "u_matrix");
    if let Some(loc) = u_matrix.as_ref() {
        context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
    }

    let zoom = viewport.zoom.round() as u32;
    let center_pixel = viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, zoom);
    let origin_x = (center_pixel.0 - viewport.width as f64 / 2.0) as f32;
    let origin_y = (center_pixel.1 - viewport.height as f64 / 2.0) as f32;
    let world_scale = viewport.tile_size as f32 * (1u32 << zoom) as f32;

    if let Some(loc) = gl_state.point_u_origin.as_ref() {
        context.uniform2f(Some(loc), origin_x, origin_y);
    }
    if let Some(loc) = gl_state.point_u_world_scale.as_ref() {
        context.uniform1f(Some(loc), world_scale);
    }

    let stride = 7 * 4; // 2 pos + 1 size + 4 color

    for layer in point_layers {
        if !layer.visible || layer.points.is_empty() {
            continue;
        }

        // Upload vertex data once (and again only when the points change).
        // Coords are stored normalized [0,1] so they're valid at every zoom.
        if layer.gpu_dirty.get() || layer.vertex_buffer.borrow().is_none() {
            let mut vertex_data: Vec<f32> = Vec::with_capacity(layer.points.len() * 7);
            for p in &layer.points {
                let (nx, ny) = viewport.lat_lng_to_normalized(p.lat, p.lng);
                vertex_data.extend_from_slice(&[
                    nx as f32, ny as f32,
                    p.size,
                    p.color[0], p.color[1], p.color[2], p.color[3],
                ]);
            }

            if layer.vertex_buffer.borrow().is_none() {
                let buf = context
                    .create_buffer()
                    .ok_or_else(|| crate::error::RustyleafError::BufferCreation("Failed to create point layer buffer".into()))?;
                *layer.vertex_buffer.borrow_mut() = Some(OwnedBuffer::new(context, buf));
            }

            let borrow = layer.vertex_buffer.borrow();
            let buffer = borrow.as_ref().unwrap();
            context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));
            let vertices = Float32Array::from(&vertex_data[..]);
            context.buffer_data_with_array_buffer_view(
                WebGl2RenderingContext::ARRAY_BUFFER,
                &vertices,
                WebGl2RenderingContext::STATIC_DRAW,
            );
            layer.vertex_count.set(layer.points.len());
            layer.gpu_dirty.set(false);
        }

        let borrow = layer.vertex_buffer.borrow();
        let buffer = match borrow.as_ref() {
            Some(b) => b,
            None => continue,
        };
        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));
        context.enable_vertex_attrib_array(0);
        context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
        context.enable_vertex_attrib_array(1);
        context.vertex_attrib_pointer_with_i32(1, 1, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);
        context.enable_vertex_attrib_array(2);
        context.vertex_attrib_pointer_with_i32(2, 4, WebGl2RenderingContext::FLOAT, false, stride, 3 * 4);

        context.draw_arrays(WebGl2RenderingContext::POINTS, 0, layer.vertex_count.get() as i32);
    }

    Ok(())
}
