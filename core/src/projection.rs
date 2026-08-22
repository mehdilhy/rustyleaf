use js_sys::Array;
use wasm_bindgen::prelude::*;

pub struct Viewport {
    pub width: u32,
    pub height: u32,
    pub center_lat: f64,
    pub center_lng: f64,
    pub zoom: f64,
    pub tile_size: u32,
}

impl Viewport {
    pub fn lat_lng_to_pixel(&self, lat: f64, lng: f64, zoom: u32) -> (f64, f64) {
        let clamped_lat = lat.clamp(-85.05112878, 85.05112878);

        let n = (1u32 << zoom) as f64;

        let x_tile = (lng + 180.0) / 360.0 * n;

        let lat_rad = clamped_lat.to_radians();
        let y_tile = (1.0 - ((std::f64::consts::FRAC_PI_4 + lat_rad / 2.0).tan().ln() / std::f64::consts::PI)) / 2.0 * n;

        (x_tile * self.tile_size as f64, y_tile * self.tile_size as f64)
    }

    pub fn lat_lng_to_normalized(&self, lat: f64, lng: f64) -> (f64, f64) {
        let clamped_lat = lat.clamp(-85.05112878, 85.05112878);
        let x = (lng + 180.0) / 360.0;
        let lat_rad = clamped_lat.to_radians();
        let y = (1.0 - ((std::f64::consts::FRAC_PI_4 + lat_rad / 2.0).tan().ln() / std::f64::consts::PI)) / 2.0;
        (x, y)
    }

    pub fn pixel_to_lat_lng(&self, x: f64, y: f64, zoom: u32) -> (f64, f64) {
        let n = (1u32 << zoom) as f64;
        let tile_x = x / self.tile_size as f64;
        let tile_y = y / self.tile_size as f64;

        let lng = tile_x / n * 360.0 - 180.0;

        let a = std::f64::consts::PI * (1.0 - 2.0 * (tile_y / n));
        let lat_rad = a.sinh().atan();
        let lat = lat_rad.to_degrees();

        (lat, lng)
    }

    pub fn lat_lng_to_screen(&self, lat: f64, lng: f64) -> (f64, f64) {
        let zoom = self.zoom.round() as u32;
        let center_pixel = self.lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
        let start_x = center_pixel.0 - (self.width as f64 / 2.0);
        let start_y = center_pixel.1 - (self.height as f64 / 2.0);
        let pixel = self.lat_lng_to_pixel(lat, lng, zoom);
        let screen_x = pixel.0 - start_x;
        let screen_y = pixel.1 - start_y;
        (screen_x, screen_y)
    }

    pub fn screen_xy(&self, lat: f64, lng: f64) -> Array {
        let zoom = self.zoom.round() as u32;
        let center_pixel = self.lat_lng_to_pixel(self.center_lat, self.center_lng, zoom);
        let start_x = center_pixel.0 - (self.width as f64 / 2.0);
        let start_y = center_pixel.1 - (self.height as f64 / 2.0);
        let (px, py) = self.lat_lng_to_pixel(lat, lng, zoom);
        let screen_x = px - start_x;
        let screen_y = py - start_y;
        let arr = Array::new();
        arr.push(&JsValue::from_f64(screen_x));
        arr.push(&JsValue::from_f64(screen_y));
        arr
    }
}
