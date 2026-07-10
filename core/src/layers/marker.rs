use std::cell::Cell;

/// A single map marker, rendered on the GPU as a camera-facing sprite (a round
/// point) using the shared point program. Markers are stored on the map and
/// drawn in `render_markers`, so they scale like the rest of rustyleaf's layers
/// rather than being DOM overlays.
#[derive(Clone)]
pub struct Marker {
    pub(crate) lat: f64,
    pub(crate) lng: f64,
    pub(crate) size: f32,
    pub(crate) color: [f32; 4],
    pub(crate) z_order: i32,
    pub(crate) visible: Cell<bool>,
}

impl Marker {
    pub(crate) fn new() -> Self {
        Self {
            lat: 0.0,
            lng: 0.0,
            // Leaflet-ish default red (#e0393e).
            size: 14.0,
            color: [0.878, 0.224, 0.243, 1.0],
            z_order: 0,
            visible: Cell::new(true),
        }
    }
}
