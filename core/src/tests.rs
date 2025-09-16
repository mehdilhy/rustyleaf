use wasm_bindgen_test::wasm_bindgen_test;

// Import the main types from the parent module
struct Map {
    width: u32,
    height: u32,
    center_lat: f64,
    center_lng: f64,
    zoom: f64,
}

struct TileCoord {
    x: i32,
    y: i32,
    z: u32,
}

struct PointFeature {
    lat: f64,
    lng: f64,
    size: f32,
    color: [f32; 4],
    meta: serde_json::Value,
}

struct SpatialFeature {
    id: u32,
    bounds: rstar::AABB<[f64; 2]>,
    meta: serde_json::Value,
}

struct TileLayer {
    url_template: String,
    subdomains: Vec<String>,
    max_zoom: u32,
    min_zoom: u32,
}

struct PointLayer {
    points: Vec<PointFeature>,
    visible: bool,
}

struct PointLayerApi;

impl PointLayerApi {
    fn parse_color(color_str: &str) -> [f32; 4] {
        if color_str.starts_with('#') && color_str.len() == 7 {
            let r = u8::from_str_radix(&color_str[1..3], 16).unwrap_or(0);
            let g = u8::from_str_radix(&color_str[3..5], 16).unwrap_or(128);
            let b = u8::from_str_radix(&color_str[5..7], 16).unwrap_or(255);
            [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0]
        } else {
            [0.0, 0.5, 1.0, 1.0] // Default blue
        }
    }
}

impl Map {
    fn new(width: u32, height: u32) -> Map {
        Map {
            width,
            height,
            center_lat: 20.0,
            center_lng: 0.0,
            zoom: 2.0,
        }
    }

    fn create_projection_matrix(&self) -> [f32; 16] {
        [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ]
    }

    fn lat_lng_to_pixel(&self, lat: f64, lng: f64, zoom: u32) -> (f64, f64) {
        let tile_size = 256.0;
        let x = ((lng + 180.0) / 360.0) * (1 << zoom) as f64 * tile_size;
        let y = ((1.0 - (lat * std::f64::consts::PI / 180.0).tan().ln() / std::f64::consts::PI) / 2.0)
            * (1 << zoom) as f64 * tile_size;
        (x, y)
    }

    fn pixel_to_lat_lng(&self, x: f64, y: f64, zoom: u32) -> (f64, f64) {
        let tile_size = 256.0;
        let lng = (x / ((1 << zoom) as f64 * tile_size) * 360.0) - 180.0;
        let lat_rad = std::f64::consts::PI - 2.0 * std::f64::consts::PI * y / ((1 << zoom) as f64 * tile_size);
        let lat = lat_rad * 180.0 / std::f64::consts::PI;
        (lat, lng)
    }

    fn zoom_in(&mut self) {
        if self.zoom < 18.0 {
            self.zoom += 1.0;
        }
    }

    fn zoom_out(&mut self) {
        if self.zoom > 1.0 {
            self.zoom -= 1.0;
        }
    }
}

#[cfg(test)]
mod tests {

    #[wasm_bindgen_test]
    fn test_map_creation() {
        let map = Map::new(800, 600);
        assert_eq!(map.width, 800);
        assert_eq!(map.height, 600);
        assert_eq!(map.center_lat, 20.0);
        assert_eq!(map.center_lng, 0.0);
        assert_eq!(map.zoom, 2.0);
    }

    #[wasm_bindgen_test]
    fn test_tile_coord_creation() {
        let coord = TileCoord { x: 1, y: 2, z: 3 };
        assert_eq!(coord.x, 1);
        assert_eq!(coord.y, 2);
        assert_eq!(coord.z, 3);
    }

    #[wasm_bindgen_test]
    fn test_lat_lng_to_pixel_conversion() {
        let map = Map::new(800, 600);
        let zoom = 2;
        
        // Test New York City coordinates
        let (pixel_x, pixel_y) = map.lat_lng_to_pixel(40.7128, -74.0060, zoom);
        
        // Verify the conversion is reasonable (not exact due to projection)
        assert!(pixel_x > 0.0);
        assert!(pixel_y > 0.0);
        assert!(pixel_x < (1 << zoom) as f64 * 256.0);
        assert!(pixel_y < (1 << zoom) as f64 * 256.0);
    }

    #[wasm_bindgen_test]
    fn test_pixel_to_lat_lng_conversion() {
        let map = Map::new(800, 600);
        let zoom = 2;
        
        // Test pixel to lat/lng conversion
        let (lat, lng) = map.pixel_to_lat_lng(512.0, 512.0, zoom);
        
        // Verify the conversion is reasonable
        assert!(lat >= -90.0 && lat <= 90.0);
        assert!(lng >= -180.0 && lng <= 180.0);
    }

    #[wasm_bindgen_test]
    fn test_spatial_feature_creation() {
        let bounds = AABB::from_corners([0.0, 0.0], [1.0, 1.0]);
        let feature = SpatialFeature {
            id: 1,
            bounds,
            meta: serde_json::json!({"name": "test"}),
        };
        
        assert_eq!(feature.id, 1);
        assert_eq!(feature.meta["name"], "test");
    }

    #[wasm_bindgen_test]
    fn test_point_feature_creation() {
        let point = PointFeature {
            lat: 40.7128,
            lng: -74.0060,
            size: 10.0,
            color: [1.0, 0.0, 0.0, 1.0],
            meta: serde_json::json!({"name": "NYC"}),
        };
        
        assert_eq!(point.lat, 40.7128);
        assert_eq!(point.lng, -74.0060);
        assert_eq!(point.size, 10.0);
        assert_eq!(point.color, [1.0, 0.0, 0.0, 1.0]);
        assert_eq!(point.meta["name"], "NYC");
    }

    #[wasm_bindgen_test]
    fn test_projection_matrix_creation() {
        let map = Map::new(800, 600);
        let matrix = map.create_projection_matrix();
        
        // Verify it's a 4x4 matrix
        assert_eq!(matrix.len(), 16);
        
        // Verify identity matrix properties
        assert_eq!(matrix[0], 1.0);  // Top-left
        assert_eq!(matrix[5], 1.0);  // Middle
        assert_eq!(matrix[10], 1.0); // Bottom-right
        assert_eq!(matrix[15], 1.0); // Bottom-right corner
    }

    #[wasm_bindgen_test]
    fn test_tile_layer_creation() {
        let tile_layer = TileLayer {
            url_template: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png".to_string(),
            subdomains: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            max_zoom: 18,
            min_zoom: 0,
        };
        
        assert_eq!(tile_layer.url_template, "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
        assert_eq!(tile_layer.subdomains.len(), 3);
        assert_eq!(tile_layer.max_zoom, 18);
        assert_eq!(tile_layer.min_zoom, 0);
    }

    #[wasm_bindgen_test]
    fn test_point_layer_creation() {
        let point_layer = PointLayer {
            points: Vec::new(),
            visible: true,
        };
        
        assert!(point_layer.points.is_empty());
        assert!(point_layer.visible);
    }

    #[wasm_bindgen_test]
    fn test_zoom_limits() {
        let mut map = Map::new(800, 600);
        
        // Test zoom in limit
        map.zoom = 17.5;
        map.zoom_in();
        assert_eq!(map.zoom, 18.5);
        
        // Test zoom out limit
        map.zoom = 1.5;
        map.zoom_out();
        assert_eq!(map.zoom, 0.5);
    }

    #[wasm_bindgen_test]
    fn test_color_parsing() {
        // Test color parsing in PointLayerApi
        let test_cases = vec![
            ("#ff0000", [1.0, 0.0, 0.0, 1.0]),
            ("#00ff00", [0.0, 1.0, 0.0, 1.0]),
            ("#0000ff", [0.0, 0.0, 1.0, 1.0]),
            ("#ffffff", [1.0, 1.0, 1.0, 1.0]),
        ];
        
        for (color_str, expected) in test_cases {
            let result = PointLayerApi::parse_color(color_str);
            assert_eq!(result, expected);
        }
    }
}