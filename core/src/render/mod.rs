pub mod tiles;
pub mod points;
pub mod lines;
pub mod polygons;
pub mod geojson;

use crate::projection::Viewport;

/// Orthographic screen-pixel → NDC projection matrix shared by all layer
/// render passes. Every vertex shader multiplies by `u_matrix`; a pass that
/// forgets to set it renders nothing (uniform defaults to all-zero).
pub fn screen_projection_matrix(viewport: &Viewport) -> [f32; 16] {
    [
        2.0 / viewport.width as f32, 0.0, 0.0, 0.0,
        0.0, -2.0 / viewport.height as f32, 0.0, 0.0,
        0.0, 0.0, -1.0, 0.0,
        -1.0, 1.0, 0.0, 1.0,
    ]
}
