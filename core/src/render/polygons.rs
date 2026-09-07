use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;
use lyon_tessellation::{BuffersBuilder, FillOptions, FillTessellator, FillVertex, VertexBuffers};
use lyon_path::Path;

use crate::layers::polygon::PolygonLayer;
use crate::projection::{Viewport, clamp_zoom};
use crate::error::RustyleafError;
use crate::OwnedBuffer;
use crate::WebGlState;

/// Saturating usize → i32 for GL draw counts (R-29). Layers with >2.1B
/// vertices are unreachable before WASM OOM; cap instead of wrapping negative.
pub(crate) fn capped_draw_count(count: usize) -> i32 {
    i32::try_from(count).unwrap_or(i32::MAX)
}

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
                // Hole-aware Lyon tessellation (R-11): triangulating each ring
                // independently fills holes as solid islands.
                let triangles = triangulate_polygon_with_holes_lyon(&polygon.rings);
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
        // Polygon colors carry alpha (GeoJSON default 0.5): without BLEND
        // every translucent polygon drew opaque.
        context.enable(WebGl2RenderingContext::BLEND);
        context.blend_func(WebGl2RenderingContext::SRC_ALPHA, WebGl2RenderingContext::ONE_MINUS_SRC_ALPHA);

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

        let zoom = clamp_zoom(viewport.zoom);
        let center_pixel = viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, zoom);
        if let Some(loc) = gl_state.polygon_u_origin.as_ref() {
            context.uniform2f(
                Some(loc),
                (center_pixel.0 - viewport.width as f64 / 2.0) as f32,
                (center_pixel.1 - viewport.height as f64 / 2.0) as f32,
            );
        }
        if let Some(loc) = gl_state.polygon_u_world_scale.as_ref() {
            // f64 on CPU (R-28); cast to f32 only at uniform upload.
            let world_scale_f64 = viewport.tile_size as f64 * (1u64 << zoom) as f64;
            context.uniform1f(Some(loc), world_scale_f64 as f32);
        }

        context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, capped_draw_count(vertex_count));
        context.disable(WebGl2RenderingContext::BLEND);
    }

    Ok(())
}

/// Hole-aware Lyon tessellation shared by the plain-polygon path (R-11) and
/// the GeoJSON fallback path (R-12). `rings[0]` is the outer ring, the rest
/// are holes. Returns [lat, lng] triplets. Single-ring input without holes
/// behaves like the ear-clipping path but through the same tessellator so
/// both paths agree.
pub fn triangulate_polygon_with_holes_lyon(rings: &[Vec<[f64; 2]>]) -> Vec<[f64; 2]> {
    if rings.is_empty() || rings[0].len() < 3 {
        return Vec::new();
    }
    let mut path_builder = Path::builder();
    path_builder.begin(lyon_path::geom::point(rings[0][0][1] as f32, rings[0][0][0] as f32));
    for coord in rings[0].iter().skip(1) {
        path_builder.line_to(lyon_path::geom::point(coord[1] as f32, coord[0] as f32));
    }
    path_builder.end(true);
    for hole in rings.iter().skip(1) {
        if hole.len() < 3 {
            continue;
        }
        path_builder.begin(lyon_path::geom::point(hole[0][1] as f32, hole[0][0] as f32));
        for coord in hole.iter().skip(1) {
            path_builder.line_to(lyon_path::geom::point(coord[1] as f32, coord[0] as f32));
        }
        path_builder.end(true);
    }
    let path = path_builder.build();
    let mut geometry: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
    let mut tess = FillTessellator::new();
    let opts = FillOptions::tolerance(0.05);
    if tess
        .tessellate_path(
            &path,
            &opts,
            &mut BuffersBuilder::new(&mut geometry, |v: FillVertex| {
                let p = v.position();
                [p.x, p.y]
            }),
        )
        .is_err()
    {
        web_sys::console::warn_1(&wasm_bindgen::JsValue::from_str(
            "rustyleaf: polygon tessellation failed, dropping polygon",
        ));
        return Vec::new();
    }
    let mut out: Vec<[f64; 2]> = Vec::with_capacity(geometry.indices.len());
    for idx in geometry.indices {
        let v = geometry.vertices[idx as usize];
        out.push([v[1] as f64, v[0] as f64]);
    }
    out
}

/// Cap a ring at MAX_TESS_RING_VERTICES vertices by uniform stride sampling
/// (mirrors `RustyleafMap::decimate_ring`). Used by the uncached fallback
/// (R-19) instead of silently dropping >100k rings.
pub fn decimate_ring_shared(ring: &[[f64; 2]]) -> Vec<[f64; 2]> {
    const MAX_TESS_RING_VERTICES: usize = 1200;
    if ring.len() <= MAX_TESS_RING_VERTICES {
        return ring.to_vec();
    }
    let step = (ring.len() as f64 / MAX_TESS_RING_VERTICES as f64).ceil() as usize;
    let mut out = Vec::with_capacity(MAX_TESS_RING_VERTICES + 1);
    let mut i = 0;
    while i < ring.len() {
        out.push(ring[i]);
        i += step;
    }
    if let (Some(first), Some(last)) = (out.first(), out.last()) {
        if first != last {
            if let Some(f) = ring.first() {
                out.push(*f);
            }
        }
    }
    out
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

    // Degenerate (collinear) triangles make the denominator zero; 1.0/0.0
    // would produce NaN barycentrics. Only dead ear-clipping code calls this.
    let denom = dot00 * dot11 - dot01 * dot01;
    if !denom.is_finite() || denom.abs() < 1e-12 {
        return false;
    }
    let inv_denom = 1.0 / denom;
    let u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
    let v = (dot00 * dot12 - dot01 * dot02) * inv_denom;

    (u >= 0.0) && (v >= 0.0) && (u + v < 1.0)
}
