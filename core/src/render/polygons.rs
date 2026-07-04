use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;

use crate::layers::polygon::PolygonLayer;
use crate::projection::Viewport;
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

    context.use_program(Some(gl_state.programs.polygon_program.inner()));
    context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));

    for layer in polygon_layers {
        if !layer.visible {
            continue;
        }

        let mut vertex_data = Vec::new();

        for polygon in layer.polygons.iter() {
            if polygon.rings.is_empty() {
                continue;
            }

            for ring in &polygon.rings {
                if ring.len() < 3 {
                    continue;
                }

                let triangles = triangulate_polygon(ring);

                for triangle in triangles.chunks(3) {
                    if triangle.len() == 3 {
                        for &[lat, lng] in triangle {
                            let screen_pos = viewport.lat_lng_to_screen(lat, lng);
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

            let stride = 6 * 4;

            context.enable_vertex_attrib_array(0);
            context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);

            context.enable_vertex_attrib_array(1);
            context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

            let total_vertices = vertex_data.len() / 6;
            context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices as i32);
        }
    }

    Ok(())
}

pub fn triangulate_polygon(points: &[[f64; 2]]) -> Vec<[f64; 2]> {
    if points.len() < 3 {
        return Vec::new();
    }

    let mut triangles = Vec::new();
    let mut vertices: Vec<[f64; 2]> = points.to_vec();

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
