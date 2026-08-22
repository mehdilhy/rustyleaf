// Mouse interaction state
#[derive(Clone)]
pub(crate) struct MouseState {
    pub is_dragging: bool,
    pub last_x: f64,
    pub last_y: f64,
    pub button_down: bool,
}

pub mod momentum;
