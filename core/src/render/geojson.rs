use wasm_bindgen::JsValue;
use web_sys::WebGl2RenderingContext;
use js_sys::Float32Array;

use crate::layers::point::PointFeature;
use crate::layers::line::LineFeature;
use crate::layers::polygon::PolygonFeature;
use crate::layers::geojson::{GeoJSONLayer, GeoJSONGeometry};
use crate::projection::Viewport;
use crate::WebGlState;
use super::polygons::triangulate_polygon;

pub struct GeoJsonRenderCtx<'a> {
    pub context: &'a WebGl2RenderingContext,
    pub gl_state: &'a WebGlState,
    pub geojson_layers: &'a [GeoJSONLayer],
    pub viewport: &'a Viewport,
}

impl<'a> GeoJsonRenderCtx<'a> {
    fn create_projection_matrix(&self) -> [f32; 16] {
        let w = self.viewport.width as f32;
        let h = self.viewport.height as f32;
        [
            2.0 / w, 0.0,      0.0, 0.0,
            0.0,     -2.0 / h, 0.0, 0.0,
            0.0,      0.0,     -1.0, 0.0,
            -1.0,     1.0,      0.0, 1.0,
        ]
    }

    fn zoom_round(&self) -> u32 {
        self.viewport.zoom.round() as u32
    }
}

pub fn render_geojson(ctx: &GeoJsonRenderCtx) -> Result<(), JsValue> {
    for geojson_layer in ctx.geojson_layers {
        if !geojson_layer.visible {
            continue;
        }

        if !(geojson_layer.cached_points.is_empty()
            && geojson_layer.cached_lines.is_empty()
            && geojson_layer.cached_polygon_triangles.is_empty()) {
            // Per-layer GPU buffers only ever belong to THIS layer — never
            // borrow another layer's buffer (multi-layer mixing bug).
            if !geojson_layer.cached_polygon_triangles.is_empty() {
                let has_own_gpu_buffer = geojson_layer.polygon_vertex_count.get() > 0
                    && geojson_layer.polygon_vertex_buffer.borrow().is_some();
                if has_own_gpu_buffer {
                    draw_geojson_polygon_gpu(ctx, geojson_layer)?;
                } else {
                    render_geojson_polygon_triangles(ctx, &geojson_layer.cached_polygon_triangles, geojson_layer.style.polygon_color)?;
                }
            }
            if !geojson_layer.cached_lines.is_empty() {
                let has_own_line_gpu_buffer = geojson_layer.line_vertex_count.get() > 0
                    && geojson_layer.line_vertex_buffer.borrow().is_some();
                if has_own_line_gpu_buffer {
                    draw_geojson_line_gpu(ctx, geojson_layer)?;
                } else {
                    render_geojson_lines(ctx, &geojson_layer.cached_lines)?;
                }
            }
            if !geojson_layer.cached_points.is_empty() {
                render_geojson_points(ctx, &geojson_layer.cached_points)?;
            }
            continue;
        }

        let mut point_features = Vec::new();
        let mut line_features = Vec::new();
        let mut polygon_features = Vec::new();

        for feature in &geojson_layer.features {
            let style = &geojson_layer.style;

            match &feature.geometry {
                GeoJSONGeometry::Point { coordinates } => {
                    let point_feature = PointFeature {
                        lat: coordinates[1],
                        lng: coordinates[0],
                        size: style.point_size,
                        color: style.point_color,
                        meta: feature.properties.clone(),
                    };
                    point_features.push(point_feature);
                },
                GeoJSONGeometry::MultiPoint { coordinates } => {
                    for coord in coordinates {
                        let point_feature = PointFeature {
                            lat: coord[1],
                            lng: coord[0],
                            size: style.point_size,
                            color: style.point_color,
                            meta: feature.properties.clone(),
                        };
                        point_features.push(point_feature);
                    }
                },
                GeoJSONGeometry::LineString { coordinates } => {
                    let line_points: Vec<[f64; 2]> = coordinates.iter()
                        .map(|coord| [coord[1], coord[0]])
                        .collect();

                    if line_points.len() >= 2 {
                        let line_feature = LineFeature {
                            points: line_points,
                            color: style.line_color,
                            width: style.line_width,
                            meta: feature.properties.clone(),
                        };
                        line_features.push(line_feature);
                    }
                },
                GeoJSONGeometry::MultiLineString { coordinates } => {
                    for line_coords in coordinates {
                        let line_points: Vec<[f64; 2]> = line_coords.iter()
                            .map(|coord| [coord[1], coord[0]])
                            .collect();

                        if line_points.len() >= 2 {
                            let line_feature = LineFeature {
                                points: line_points,
                                color: style.line_color,
                                width: style.line_width,
                                meta: feature.properties.clone(),
                            };
                            line_features.push(line_feature);
                        }
                    }
                },
                GeoJSONGeometry::Polygon { coordinates } => {
                    let polygon_rings: Vec<Vec<[f64; 2]>> = coordinates.iter()
                        .map(|ring| ring.iter()
                            .map(|coord| [coord[1], coord[0]])
                            .collect())
                        .collect();

                    if !polygon_rings.is_empty() && polygon_rings[0].len() >= 3 {
                        let polygon_feature = PolygonFeature {
                            rings: polygon_rings,
                            color: style.polygon_color,
                            meta: feature.properties.clone(),
                        };
                        polygon_features.push(polygon_feature);
                    }
                },
                GeoJSONGeometry::MultiPolygon { coordinates } => {
                    for polygon_coords in coordinates {
                        let polygon_rings: Vec<Vec<[f64; 2]>> = polygon_coords.iter()
                            .map(|ring| ring.iter()
                                .map(|coord| [coord[1], coord[0]])
                                .collect())
                            .collect();

                        if !polygon_rings.is_empty() && polygon_rings[0].len() >= 3 {
                            let polygon_feature = PolygonFeature {
                                rings: polygon_rings,
                                color: style.polygon_color,
                                meta: feature.properties.clone(),
                            };
                            polygon_features.push(polygon_feature);
                        }
                    }
                },
            }
        }

        if !polygon_features.is_empty() {
            render_geojson_polygons(ctx, &polygon_features)?;
        }

        if !line_features.is_empty() {
            render_geojson_lines(ctx, &line_features)?;
        }

        if !point_features.is_empty() {
            render_geojson_points(ctx, &point_features)?;
        }
    }

    Ok(())
}

pub fn render_geojson_points(ctx: &GeoJsonRenderCtx, points: &[PointFeature]) -> Result<(), JsValue> {
    let context = ctx.context;
    let gl_state = ctx.gl_state;

    context.use_program(Some(gl_state.programs.point_program.inner()));
    context.bind_vertex_array(Some(gl_state.point_vao.inner()));

    let mut vertex_data = Vec::new();

    for point in points {
        let screen_pos = ctx.viewport.lat_lng_to_screen(point.lat, point.lng);
        vertex_data.extend_from_slice(&[
            screen_pos.0 as f32, screen_pos.1 as f32,
            point.size,
            point.color[0], point.color[1], point.color[2], point.color[3],
        ]);
    }

    if !vertex_data.is_empty() {
        // Bulk copy — element-wise set_index is prohibitively slow for large layers
        let vertices = Float32Array::from(&vertex_data[..]);

        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.point_buffer.inner()));
        context.buffer_data_with_array_buffer_view(
            WebGl2RenderingContext::ARRAY_BUFFER,
            &vertices,
            WebGl2RenderingContext::STATIC_DRAW,
        );

        let stride = 7 * 4;
        context.enable_vertex_attrib_array(0);
        context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
        context.enable_vertex_attrib_array(1);
        context.vertex_attrib_pointer_with_i32(1, 1, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);
        context.enable_vertex_attrib_array(2);
        context.vertex_attrib_pointer_with_i32(2, 4, WebGl2RenderingContext::FLOAT, false, stride, 3 * 4);

        let projection_matrix = ctx.create_projection_matrix();
        let u_matrix_loc = context.get_uniform_location(gl_state.programs.point_program.inner(), "u_matrix");
        if let Some(loc) = u_matrix_loc.as_ref() {
            context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
        }
        // This path uploads pre-projected screen coords, so neutralize the
        // world→screen transform the point shader now applies (a_position * 1 - 0).
        if let Some(loc) = gl_state.point_u_origin.as_ref() {
            context.uniform2f(Some(loc), 0.0, 0.0);
        }
        if let Some(loc) = gl_state.point_u_world_scale.as_ref() {
            context.uniform1f(Some(loc), 1.0);
        }

        context.draw_arrays(WebGl2RenderingContext::POINTS, 0, points.len() as i32);
    }

    Ok(())
}

pub fn draw_geojson_line_gpu(ctx: &GeoJsonRenderCtx, layer: &GeoJSONLayer) -> Result<(), JsValue> {
    let context = ctx.context;
    let gl_state = ctx.gl_state;

    let buffer = match layer.line_vertex_buffer.borrow().clone() {
        Some(b) => b,
        None => return Ok(()),
    };

    context.use_program(Some(gl_state.programs.line_program.inner()));
    context.bind_vertex_array(Some(gl_state.line_vao.inner()));

    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));
    let stride = 6 * 4;
    context.enable_vertex_attrib_array(0);
    context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
    context.enable_vertex_attrib_array(1);
    context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

    let projection_matrix = ctx.create_projection_matrix();
    let u_matrix_loc = context.get_uniform_location(gl_state.programs.line_program.inner(), "u_matrix");
    if let Some(loc) = u_matrix_loc.as_ref() {
        context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
    }

    if let Some(ref loc) = gl_state.line_u_origin {
        let zoom = ctx.zoom_round();
        let center_pixel = ctx.viewport.lat_lng_to_pixel(ctx.viewport.center_lat, ctx.viewport.center_lng, zoom);
        let origin_x = center_pixel.0 - (ctx.viewport.width as f64 / 2.0);
        let origin_y = center_pixel.1 - (ctx.viewport.height as f64 / 2.0);
        context.uniform2f(Some(loc), origin_x as f32, origin_y as f32);
    }
    if let Some(ref loc) = gl_state.line_u_world_scale {
        let zoom = ctx.zoom_round();
        let world_scale = ctx.viewport.tile_size as f32 * (1u32 << zoom) as f32;
        context.uniform1f(Some(loc), world_scale);
    }

    let total_vertices = layer.line_vertex_count.get() as i32;
    if total_vertices > 0 {
        context.draw_arrays(WebGl2RenderingContext::LINES, 0, total_vertices);
    }
    Ok(())
}

pub fn render_geojson_lines(ctx: &GeoJsonRenderCtx, lines: &[LineFeature]) -> Result<(), JsValue> {
    let context = ctx.context;
    let gl_state = ctx.gl_state;

    context.use_program(Some(gl_state.programs.line_program.inner()));
    context.bind_vertex_array(Some(gl_state.line_vao.inner()));

    let mut vertex_data = Vec::new();

    for line in lines {
        for i in 0..line.points.len().saturating_sub(1) {
            let start = line.points[i];
            let end = line.points[i + 1];

            let (sx, sy) = ctx.viewport.lat_lng_to_normalized(start[0], start[1]);
            let (ex, ey) = ctx.viewport.lat_lng_to_normalized(end[0], end[1]);

            vertex_data.extend_from_slice(&[
                sx as f32, sy as f32,
                line.color[0], line.color[1], line.color[2], line.color[3],
                ex as f32, ey as f32,
                line.color[0], line.color[1], line.color[2], line.color[3],
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

        let projection_matrix = ctx.create_projection_matrix();
        let u_matrix_loc = context.get_uniform_location(gl_state.programs.line_program.inner(), "u_matrix");
        if let Some(loc) = u_matrix_loc.as_ref() {
            context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
        }

        if let Some(ref loc) = gl_state.line_u_origin {
            let zoom = ctx.zoom_round();
            let center_pixel = ctx.viewport.lat_lng_to_pixel(ctx.viewport.center_lat, ctx.viewport.center_lng, zoom);
            let origin_x = center_pixel.0 - (ctx.viewport.width as f64 / 2.0);
            let origin_y = center_pixel.1 - (ctx.viewport.height as f64 / 2.0);
            context.uniform2f(Some(loc), origin_x as f32, origin_y as f32);
        }
        if let Some(ref loc) = gl_state.line_u_world_scale {
            let zoom = ctx.zoom_round();
            let world_scale = ctx.viewport.tile_size as f32 * (1u32 << zoom) as f32;
            context.uniform1f(Some(loc), world_scale);
        }

        let total_vertices = vertex_data.len() / 6;
        context.draw_arrays(WebGl2RenderingContext::LINES, 0, total_vertices as i32);
    }

    Ok(())
}

pub fn draw_geojson_polygon_gpu(ctx: &GeoJsonRenderCtx, layer: &GeoJSONLayer) -> Result<(), JsValue> {
    let context = ctx.context;
    let gl_state = ctx.gl_state;

    let buffer = match layer.polygon_vertex_buffer.borrow().clone() {
        Some(b) => b,
        None => return Ok(()),
    };

    context.use_program(Some(gl_state.programs.polygon_program.inner()));
    context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));

    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(buffer.inner()));
    let stride = 6 * 4;
    context.enable_vertex_attrib_array(0);
    context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
    context.enable_vertex_attrib_array(1);
    context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

    let projection_matrix = ctx.create_projection_matrix();
    let u_matrix_loc = context.get_uniform_location(gl_state.programs.polygon_program.inner(), "u_matrix");
    if let Some(loc) = u_matrix_loc.as_ref() {
        context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
    }

    if let Some(ref loc) = gl_state.polygon_u_origin {
        let zoom = ctx.zoom_round();
        let center_pixel = ctx.viewport.lat_lng_to_pixel(ctx.viewport.center_lat, ctx.viewport.center_lng, zoom);
        let origin_x = center_pixel.0 - (ctx.viewport.width as f64 / 2.0);
        let origin_y = center_pixel.1 - (ctx.viewport.height as f64 / 2.0);
        context.uniform2f(Some(loc), origin_x as f32, origin_y as f32);
    }
    if let Some(ref loc) = gl_state.polygon_u_world_scale {
        let zoom = ctx.zoom_round();
        let world_scale = ctx.viewport.tile_size as f32 * (1u32 << zoom) as f32;
        context.uniform1f(Some(loc), world_scale);
    }

    let total_vertices = layer.polygon_vertex_count.get() as i32;
    if total_vertices > 0 {
        context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices);
    }
    Ok(())
}

pub fn render_geojson_polygons(ctx: &GeoJsonRenderCtx, polygons: &[PolygonFeature]) -> Result<(), JsValue> {
    let context = ctx.context;
    let gl_state = ctx.gl_state;

    context.use_program(Some(gl_state.programs.polygon_program.inner()));
    context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));

    let mut vertex_data = Vec::new();
    const MAX_VERTICES: usize = 1000000;

    for polygon in polygons {
        if polygon.rings.is_empty() {
            continue;
        }

        for ring in &polygon.rings {
            if ring.len() < 3 {
                continue;
            }

            // Ear clipping is O(n^2); 100k vertices is the practical ceiling.
            // Previously anything over 1_000 was silently dropped, losing
            // detailed coastlines/boundaries without any error.
            if ring.len() > 100_000 {
                continue;
            }

            let triangles = triangulate_polygon(ring);

            for triangle in triangles.chunks(3) {
                if triangle.len() == 3 {
                    for &[lat, lng] in triangle {
                        let screen_pos = ctx.viewport.lat_lng_to_screen(lat, lng);
                        vertex_data.extend_from_slice(&[
                            screen_pos.0 as f32, screen_pos.1 as f32,
                            polygon.color[0], polygon.color[1], polygon.color[2], polygon.color[3],
                        ]);

                        if vertex_data.len() > MAX_VERTICES * 6 {
                            break;
                        }
                    }
                }
            }

            if vertex_data.len() > MAX_VERTICES * 6 {
                break;
            }
        }

        if vertex_data.len() > MAX_VERTICES * 6 {
            break;
        }
    }

    if !vertex_data.is_empty() {
        // Bulk copy — element-wise set_index is prohibitively slow for large layers
        let vertices = Float32Array::from(&vertex_data[..]);

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

        let projection_matrix = ctx.create_projection_matrix();
        let u_matrix_loc = context.get_uniform_location(gl_state.programs.polygon_program.inner(), "u_matrix");
        if let Some(loc) = u_matrix_loc.as_ref() {
            context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
        }

        if let Some(ref loc) = gl_state.polygon_u_origin {
            context.uniform2f(Some(loc), 0.0, 0.0);
        }
        if let Some(ref loc) = gl_state.polygon_u_world_scale {
            context.uniform1f(Some(loc), 1.0);
        }

        let total_vertices = vertex_data.len() / 6;
        context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices as i32);
    }

    Ok(())
}

pub fn render_geojson_polygon_triangles(ctx: &GeoJsonRenderCtx, triangles: &[[f64; 2]], color: [f32; 4]) -> Result<(), JsValue> {
    let context = ctx.context;
    let gl_state = ctx.gl_state;

    context.use_program(Some(gl_state.programs.polygon_program.inner()));
    context.bind_vertex_array(Some(gl_state.polygon_vao.inner()));

    let visible = cull_triangles_to_view(ctx, triangles);

    let mut vertex_data = Vec::with_capacity(visible.len() * 6);
    for &[lat, lng] in visible.iter() {
        let screen_pos = ctx.viewport.lat_lng_to_screen(lat, lng);
        vertex_data.extend_from_slice(&[
            screen_pos.0 as f32, screen_pos.1 as f32,
            color[0], color[1], color[2], color[3],
        ]);
    }

    if !vertex_data.is_empty() {
        // Bulk copy — element-wise set_index is prohibitively slow for large layers
        let vertices = Float32Array::from(&vertex_data[..]);

        context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.polygon_buffer.inner()));
        context.buffer_data_with_array_buffer_view(
            WebGl2RenderingContext::ARRAY_BUFFER,
            &vertices,
            WebGl2RenderingContext::DYNAMIC_DRAW,
        );

        let stride = 6 * 4;
        context.enable_vertex_attrib_array(0);
        context.vertex_attrib_pointer_with_i32(0, 2, WebGl2RenderingContext::FLOAT, false, stride, 0);
        context.enable_vertex_attrib_array(1);
        context.vertex_attrib_pointer_with_i32(1, 4, WebGl2RenderingContext::FLOAT, false, stride, 2 * 4);

        let projection_matrix = ctx.create_projection_matrix();
        let u_matrix_loc = context.get_uniform_location(gl_state.programs.polygon_program.inner(), "u_matrix");
        if let Some(loc) = u_matrix_loc.as_ref() {
            context.uniform_matrix4fv_with_f32_array(Some(loc), false, &projection_matrix);
        }

        if let Some(ref loc) = gl_state.polygon_u_origin {
            context.uniform2f(Some(loc), 0.0, 0.0);
        }
        if let Some(ref loc) = gl_state.polygon_u_world_scale {
            context.uniform1f(Some(loc), 1.0);
        }

        let total_vertices = vertex_data.len() / 6;
        context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, total_vertices as i32);
    }

    Ok(())
}

pub fn cull_triangles_to_view(ctx: &GeoJsonRenderCtx, triangles: &[[f64; 2]]) -> Vec<[f64; 2]> {
    if triangles.is_empty() { return Vec::new(); }
    let mut out: Vec<[f64; 2]> = Vec::with_capacity(triangles.len());
    let w = ctx.viewport.width as f64;
    let h = ctx.viewport.height as f64;
    for tri in triangles.chunks(3) {
        if tri.len() < 3 { continue; }
        let mut any_inside = false;
        for &[lat, lng] in tri {
            let p = ctx.viewport.lat_lng_to_screen(lat, lng);
            if p.0 >= -50.0 && p.0 <= w + 50.0 && p.1 >= -50.0 && p.1 <= h + 50.0 {
                any_inside = true; break;
            }
        }
        if any_inside {
            out.extend_from_slice(tri);
        }
    }
    out
}
