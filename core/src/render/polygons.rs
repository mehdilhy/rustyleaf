use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;

use crate::layers::polygon::PolygonLayer;
use crate::projection::Viewport;
use crate::error::RustyleafError;
use crate::OwnedBuffer;
use crate::WebGlState;

pub fn render_polygons(
    context: &WebGl2RenderingContext,
    gl_state: &WebGlState,
    polygon_layers: &[PolygonLayer],
    viewport: &Viewport,
) -> Result<(), JsValue> {
    if polygon_layers.is_empty() {
        return Ok(());
    }

    for layer in polygon_layers {
        if !layer.visible {
            continue;
        }

        // Triangulate + project ONCE per data change (normalized world
        // coords); every later frame is a single draw call with the view
        // applied through uniforms.
        if layer.gpu_dirty.get() || layer.vertex_buffer.borrow().is_none() {
            let mut vertex_data: Vec<f32> = Vec::new();
            const MAX_VERTICES: usize = 2_000_000;

            'outer: for polygon in layer.polygons.iter() {
                if polygon.rings.is_empty() {
                    continue;
                }
                for ring in &polygon.rings {
                    if ring.len() < 3 {
                        continue;
                    }
                    let triangles = triangulate_polygon(ring);
                    let mut i = 0;
                    while i + 2 < triangles.len() {
                        for k in 0..3 {
                            let t = triangles[i + k];
                            let (nx, ny) = viewport.lat_lng_to_normalized(t[0], t[1]);
                            vertex_data.extend_from_slice(&[
                                nx as f32, ny as f32,
                                polygon.color[0], polygon.color[1], polygon.color[2], polygon.color[3],
                            ]);
                        }
                        i += 3;
                        if vertex_data.len() > MAX_VERTICES * 6 {
                            break 'outer;
                        }
                    }
                }
            }

            if layer.vertex_buffer.borrow().is_none() {
                let buf = context
                    .create_buffer()
                    .ok_or_else(|| RustyleafError::BufferCreation("Failed to create polygon layer buffer".into()))?;
                *layer.vertex_buffer.borrow_mut() = Some(OwnedBuffer::new(context, buf));
            }

            context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(layer.vertex_buffer.borrow().as_ref().unwrap().inner()));
            let array = Float32Array::from(&vertex_data[..]);
            context.buffer_data_with_array_buffer_view(
                WebGl2RenderingContext::ARRAY_BUFFER,
                &array,
                WebGl2RenderingContext::STATIC_DRAW,
            );
            layer.vertex_count.set(vertex_data.len() / 6);
            layer.gpu_dirty.set(false);
        }

        let vertex_count = layer.vertex_count.get();
        if vertex_count == 0 {
            continue;
        }

        let buffer_owned = layer.vertex_buffer.borrow();
        let buffer = match buffer_owned.as_ref() {
            Some(b) => b,
            None => continue,
        };

        context.use_program(Some(gl_state.programs.polygon_program.inner()));
        context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));
        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));

        let stride = 6 * 4;
        context.enable_vertex_attrib_array(0);
        context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
        context.enable_vertex_attrib_array(1);
        context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 12);

        let projection_matrix = super::screen_projection_matrix(viewport);
        let program = gl_state.programs.polygon_program.inner();
        let u_matrix = context.get_uniform_location(program, "u_matrix");
        if let Some(loc) = u_matrix.as_ref() {
            context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
        }

        let zoom = (viewport.zoom.round() as i64).clamp(0, 30) as u32;
        let center_pixel = viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, zoom);
        if let Some(loc) = gl_state.polygon_u_origin.as_ref() {
            context.uniform2f(
                Some(loc),
                (center_pixel.0 - viewport.width as f64 / 2.0) as f32,
                (center_pixel.1 - viewport.height as f64 / 2.0) as f32,
            );
        }
        if let Some(loc) = gl_state.polygon_u_world_scale.as_ref() {
            context.uniform1f(Some(loc), (viewport.tile_size as u64 * (1u64 << zoom)) as f32);
        }

        context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, vertex_count as i32);
    }

    Ok(())
}

// Ear-clipping triangulation helpers (shared with the GeoJSON path).

pub fn triangulate_polygon(points: &[[f64; 2]]) -> Vec<[f64; 2]> {
    if points.len() < 3 {
        return Vec::new();
    }

    let mut triangles = Vec::new();
    let mut vertices: Vec<[f64; 2]> = points.to_vec();

    // Drop a GeoJSON-style duplicated closing vertex.
    if vertices.len() > 3 && vertices.first() == vertices.last() {
        vertices.pop();
    }

    // Ear clipping below assumes counterclockwise winding (is_convex_vertex
    // tests cross > 0). Normalize via the shoelace signed area, otherwise a
    // clockwise ring finds no ear and silently produces zero triangles.
    let n = vertices.len();
    let mut signed_area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        signed_area += vertices[i][0] * vertices[j][1] - vertices[j][0] * vertices[i][1];
    }
    if signed_area < 0.0 {
        vertices.reverse();
    }

    while vertices.len() >= 3 {
        let mut ear_found = false;

        for i in 0..vertices.len() {
            let prev = vertices[(i + vertices.len() - 1) % vertices.len()];
            let curr = vertices[i];
            let next = vertices[(i + 1) % vertices.len()];

            if is_convex_vertex(&prev, &curr, &next) &&
               !has_point_in_triangle(&vertices, &prev, &curr, &next) {
                triangles.push(prev);
                triangles.push(curr);
                triangles.push(next);

                vertices.remove(i);
                ear_found = true;
                break;
            }
        }

        if !ear_found {
            break;
        }
    }

    triangles
}

pub fn is_convex_vertex(prev: &[f64; 2], curr: &[f64; 2], next: &[f64; 2]) -> bool {
    let dx1 = curr[0] - prev[0];
    let dy1 = curr[1] - prev[1];
    let dx2 = next[0] - curr[0];
    let dy2 = next[1] - curr[1];

    let cross = dx1 * dy2 - dy1 * dx2;
    cross > 0.0
}

pub fn has_point_in_triangle(vertices: &[[f64; 2]], a: &[f64; 2], b: &[f64; 2], c: &[f64; 2]) -> bool {
    for vertex in vertices {
        if vertex == a || vertex == b || vertex == c {
            continue;
        }

        if point_in_triangle(vertex, a, b, c) {
            return true;
        }
    }
    false
}

pub fn point_in_triangle(p: &[f64; 2], a: &[f64; 2], b: &[f64; 2], c: &[f64; 2]) -> bool {
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
