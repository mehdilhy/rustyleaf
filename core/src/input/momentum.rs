pub fn apply_drag(
    delta_x: f64, delta_y: f64,
    drag_velocity: &mut (f64, f64),
    drag_accumulated_x: &mut f64, drag_accumulated_y: &mut f64,
    last_drag_time: &mut f64,
    smoothing_factor: f64,
) {
    let current_time = js_sys::Date::now();
    let time_delta = (current_time - *last_drag_time) / 1000.0;

    if time_delta > 0.0 && time_delta < 0.1 {
        let new_velocity_x = delta_x / time_delta;
        let new_velocity_y = delta_y / time_delta;

        drag_velocity.0 = drag_velocity.0 * smoothing_factor + new_velocity_x * (1.0 - smoothing_factor);
        drag_velocity.1 = drag_velocity.1 * smoothing_factor + new_velocity_y * (1.0 - smoothing_factor);
    }

    *drag_accumulated_x += delta_x;
    *drag_accumulated_y += delta_y;
    *last_drag_time = current_time;
}

pub fn start_momentum_animation(drag_velocity: &(f64, f64), has_momentum: &mut bool) {
    let velocity_magnitude = (drag_velocity.0 * drag_velocity.0 + drag_velocity.1 * drag_velocity.1).sqrt();
    if velocity_magnitude >= 15.0 {
        *has_momentum = true;
    }
}

pub fn apply_momentum(
    _center_lat: &mut f64, _center_lng: &mut f64,
    drag_velocity: &mut (f64, f64),
    drag_accumulated_x: &mut f64, drag_accumulated_y: &mut f64,
    has_momentum: &mut bool,
    last_drag_time: &mut f64,
) {
    let friction = 0.95;
    let min_velocity = 2.0;
    let max_velocity = 2000.0;

    let velocity_magnitude = (drag_velocity.0 * drag_velocity.0 + drag_velocity.1 * drag_velocity.1).sqrt();
    if velocity_magnitude > max_velocity {
        let scale = max_velocity / velocity_magnitude;
        drag_velocity.0 *= scale;
        drag_velocity.1 *= scale;
    }

    drag_velocity.0 *= friction;
    drag_velocity.1 *= friction;

    let current_time = js_sys::Date::now();
    let delta_time = if *last_drag_time > 0.0 {
        (current_time - *last_drag_time) / 1000.0
    } else {
        1.0 / 60.0
    };
    *last_drag_time = current_time;

    let delta_time = delta_time.clamp(1.0 / 120.0, 1.0 / 30.0);

    *drag_accumulated_x = drag_velocity.0 * delta_time;
    *drag_accumulated_y = drag_velocity.1 * delta_time;

    let current_velocity_magnitude = (drag_velocity.0 * drag_velocity.0 + drag_velocity.1 * drag_velocity.1).sqrt();
    if current_velocity_magnitude < min_velocity {
        *drag_velocity = (0.0, 0.0);
        *has_momentum = false;
        *last_drag_time = 0.0;
    }
}
