use wasm_bindgen::JsValue;
use web_sys::{WebGl2RenderingContext, WebGlTexture, WebGlUniformLocation};
use js_sys::Float32Array;

use crate::tiles::{TileCoord, TileLoader};
use crate::projection::Viewport;
use crate::WebGlState;

#[allow(clippy::too_many_arguments)]
fn draw_tile_quad(
    context: &WebGl2RenderingContext,
    gl_state: &WebGlState,
    texture: &WebGlTexture,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) {
    context.active_texture(WebGl2RenderingContext::TEXTURE0);
    context.bind_texture(WebGl2RenderingContext::TEXTURE_2D, Some(texture));

    let vertices = Float32Array::new_with_length(16);
    for (index, value) in [
        x0, y0, u0, v0,
        x0, y1, u0, v1,
        x1, y0, u1, v0,
        x1, y1, u1, v1,
    ].iter().enumerate() {
        vertices.set_index(index as u32, *value);
    }

    context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(gl_state.tile_buffer.inner()));
    context.buffer_data_with_array_buffer_view(
        WebGl2RenderingContext::ARRAY_BUFFER,
        &vertices,
        WebGl2RenderingContext::DYNAMIC_DRAW,
    );
    context.draw_arrays(WebGl2RenderingContext::TRIANGLE_STRIP, 0, 4);
}

pub fn render_tiles(
    context: &WebGl2RenderingContext,
    gl_state: &WebGlState,
    tile_loader: &TileLoader,
    tile_size: u32,
    viewport: &Viewport,
    projection_matrix: &[f32; 16],
) -> Result<Vec<(String, TileCoord)>, JsValue> {
    let tile_zoom = viewport.zoom.round() as u32;

    let center_pixel = viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, tile_zoom);

    let start_x = center_pixel.0 - (viewport.width as f64 / 2.0);
    let start_y = center_pixel.1 - (viewport.height as f64 / 2.0);

    let start_tile_x = (start_x / tile_size as f64).floor() as i32;
    let start_tile_y = (start_y / tile_size as f64).floor() as i32;
    let tiles_x = (viewport.width as f64 / tile_size as f64).ceil() as i32 + 2;
    let tiles_y = (viewport.height as f64 / tile_size as f64).ceil() as i32 + 2;

    context.use_program(Some(gl_state.programs.tile_program.inner()));
    context.bind_vertex_array(Some(gl_state.tile_vao.inner()));

    let u_matrix: Option<WebGlUniformLocation> = context.get_uniform_location(gl_state.programs.tile_program.inner(), "u_matrix");
    if let Some(loc) = u_matrix.as_ref() {
        context.uniform_matrix4fv_with_f32_array(Some(loc), false, projection_matrix);
    }

    let u_texture: Option<WebGlUniformLocation> = context.get_uniform_location(gl_state.programs.tile_program.inner(), "u_texture");
    if let Some(loc) = u_texture.as_ref() {
        context.uniform1i(Some(loc), 0);
    }

    context.enable(WebGl2RenderingContext::BLEND);
    context.blend_func(WebGl2RenderingContext::SRC_ALPHA, WebGl2RenderingContext::ONE_MINUS_SRC_ALPHA);

    let mut tiles_rendered = 0;

    let mut tiles_to_load = Vec::new();
    let world_tiles = 1i64 << tile_zoom.min(30);
    for i in 0..tiles_x {
        for j in 0..tiles_y {
            let tile_x = (start_tile_x + i) as i64;
            let tile_y = (start_tile_y + j) as i64;

            // Wrap horizontally so the world repeats (Leaflet-style); latitude
            // does not wrap. The texture key uses the wrapped x, the screen
            // position uses the unwrapped one.
            if tile_y >= 0 && tile_y < world_tiles {
                let wrapped_x = ((tile_x % world_tiles) + world_tiles) % world_tiles;
                let key = format!("{}/{}/{}", tile_zoom, wrapped_x, tile_y);
                let pixel_x = (tile_x * tile_size as i64) as f64 - start_x;
                let pixel_y = (tile_y * tile_size as i64) as f64 - start_y;
                let x0 = pixel_x as f32;
                let y0 = pixel_y as f32;
                let x1 = (pixel_x + tile_size as f64) as f32;
                let y1 = (pixel_y + tile_size as f64) as f32;

                if let Some(texture) = tile_loader.textures.borrow().get(&key) {
                    draw_tile_quad(context, gl_state, texture.inner(), x0, y0, x1, y1, 0.0, 0.0, 1.0, 1.0);
                    tiles_rendered += 1;
                } else {
                    let textures = tile_loader.textures.borrow();

                    // Zooming in: crop the corresponding quadrant from the
                    // cached parent tile until this child arrives.
                    if tile_zoom > 0 {
                        let parent_z = tile_zoom - 1;
                        let parent_x = wrapped_x / 2;
                        let parent_y = tile_y / 2;
                        let parent_key = format!("{}/{}/{}", parent_z, parent_x, parent_y);
                        if let Some(parent) = textures.get(&parent_key) {
                            let u0 = (wrapped_x % 2) as f32 * 0.5;
                            let v0 = (tile_y % 2) as f32 * 0.5;
                            draw_tile_quad(context, gl_state, parent.inner(), x0, y0, x1, y1, u0, v0, u0 + 0.5, v0 + 0.5);
                            tiles_rendered += 1;
                        }
                    }

                    // Zooming out: reuse up to four cached child tiles, scaled
                    // into quadrants. This prevents the gray clear color from
                    // flashing as square gaps during a zoom transition.
                    if tile_zoom < 30 {
                        let child_z = tile_zoom + 1;
                        let half = tile_size as f32 * 0.5;
                        for child_y in 0..2 {
                            for child_x in 0..2 {
                                let child_key = format!(
                                    "{}/{}/{}",
                                    child_z,
                                    wrapped_x * 2 + child_x,
                                    tile_y * 2 + child_y,
                                );
                                if let Some(child) = textures.get(&child_key) {
                                    let child_x0 = x0 + child_x as f32 * half;
                                    let child_y0 = y0 + child_y as f32 * half;
                                    draw_tile_quad(
                                        context,
                                        gl_state,
                                        child.inner(),
                                        child_x0,
                                        child_y0,
                                        child_x0 + half,
                                        child_y0 + half,
                                        0.0,
                                        0.0,
                                        1.0,
                                        1.0,
                                    );
                                    tiles_rendered += 1;
                                }
                            }
                        }
                    }

                    let tile_coord = TileCoord { x: wrapped_x as i32, y: tile_y as i32, z: tile_zoom };
                    let should_load = !tile_loader.requested.contains(&key);
                    if should_load {
                        tiles_to_load.push((key.clone(), tile_coord));
                    }
                }
            }
        }
    }

    if tiles_rendered == 0 {
        // No tiles rendered - could indicate various issues
    }

    context.disable(WebGl2RenderingContext::BLEND);

    Ok(tiles_to_load)
}
