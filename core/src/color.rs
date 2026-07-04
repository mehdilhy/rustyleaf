pub fn parse_color(color_str: &str) -> [f32; 4] {
    let s = color_str.trim().to_lowercase();
    if let Some(stripped) = s.strip_prefix('#') {
        if stripped.len() == 6 {
            if let Ok(val) = u32::from_str_radix(stripped, 16) {
                let r = ((val >> 16) & 0xff) as f32 / 255.0;
                let g = ((val >> 8) & 0xff) as f32 / 255.0;
                let b = (val & 0xff) as f32 / 255.0;
                return [r, g, b, 1.0];
            }
        } else if stripped.len() == 8 {
            if let Ok(val) = u32::from_str_radix(stripped, 16) {
                let r = ((val >> 24) & 0xff) as f32 / 255.0;
                let g = ((val >> 16) & 0xff) as f32 / 255.0;
                let b = ((val >> 8) & 0xff) as f32 / 255.0;
                let a = (val & 0xff) as f32 / 255.0;
                return [r, g, b, a];
            }
        } else if stripped.len() == 3 {
            let r = u8::from_str_radix(&stripped[0..1], 16).unwrap_or(0);
            let g = u8::from_str_radix(&stripped[1..2], 16).unwrap_or(0);
            let b = u8::from_str_radix(&stripped[2..3], 16).unwrap_or(0);
            return [
                (r as f32) / 15.0,
                (g as f32) / 15.0,
                (b as f32) / 15.0,
                1.0,
            ];
        } else if stripped.len() == 4 {
            let r = u8::from_str_radix(&stripped[0..1], 16).unwrap_or(0);
            let g = u8::from_str_radix(&stripped[1..2], 16).unwrap_or(0);
            let b = u8::from_str_radix(&stripped[2..3], 16).unwrap_or(0);
            let a = u8::from_str_radix(&stripped[3..4], 16).unwrap_or(15);
            return [
                (r as f32) / 15.0,
                (g as f32) / 15.0,
                (b as f32) / 15.0,
                (a as f32) / 15.0,
            ];
        }
    }
    match s.as_str() {
        "red" => [1.0, 0.0, 0.0, 1.0],
        "green" => [0.0, 1.0, 0.0, 1.0],
        "blue" => [0.0, 0.0, 1.0, 1.0],
        "white" => [1.0, 1.0, 1.0, 1.0],
        "black" => [0.0, 0.0, 0.0, 1.0],
        "yellow" => [1.0, 1.0, 0.0, 1.0],
        "magenta" => [1.0, 0.0, 1.0, 1.0],
        "cyan" => [0.0, 1.0, 1.0, 1.0],
        _ => [0.0, 0.0, 0.0, 1.0],
    }
}
