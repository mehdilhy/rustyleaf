/// One ASCII hex digit (either case) without radix machinery.
fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

pub fn parse_color(color_str: &str) -> [f32; 4] {
    let s = color_str.trim();
    if let Some(stripped) = s.strip_prefix('#') {
        // Byte-slicing below is only safe for ASCII hex. A multibyte string
        // with byte-len 3/4/6/8 (e.g. "#éx") would slice mid-char and panic,
        // trapping the whole WASM instance — reject it first.
        if !stripped.is_ascii() {
            return [0.0, 0.0, 0.0, 1.0];
        }
        let b = stripped.as_bytes();
        // All arms require every digit valid (like the old radix parse,
        // which failed the whole string on one bad digit — except the
        // 3/4-digit forms, which substituted per-digit defaults; preserved).
        match b.len() {
            6 => {
                let mut v = [0u8; 3];
                for i in 0..3 {
                    let hi = match hex_val(b[2 * i]) {
                        Some(h) => h,
                        None => return named_or_default(s),
                    };
                    let lo = match hex_val(b[2 * i + 1]) {
                        Some(l) => l,
                        None => return named_or_default(s),
                    };
                    v[i] = hi * 16 + lo;
                }
                return [
                    v[0] as f32 / 255.0,
                    v[1] as f32 / 255.0,
                    v[2] as f32 / 255.0,
                    1.0,
                ];
            }
            8 => {
                let mut v = [0u8; 4];
                for i in 0..4 {
                    let hi = match hex_val(b[2 * i]) {
                        Some(h) => h,
                        None => return named_or_default(s),
                    };
                    let lo = match hex_val(b[2 * i + 1]) {
                        Some(l) => l,
                        None => return named_or_default(s),
                    };
                    v[i] = hi * 16 + lo;
                }
                return [
                    v[0] as f32 / 255.0,
                    v[1] as f32 / 255.0,
                    v[2] as f32 / 255.0,
                    v[3] as f32 / 255.0,
                ];
            }
            3 => {
                let r = hex_val(b[0]).unwrap_or(0);
                let g = hex_val(b[1]).unwrap_or(0);
                let bl = hex_val(b[2]).unwrap_or(0);
                return [
                    (r as f32) / 15.0,
                    (g as f32) / 15.0,
                    (bl as f32) / 15.0,
                    1.0,
                ];
            }
            4 => {
                let r = hex_val(b[0]).unwrap_or(0);
                let g = hex_val(b[1]).unwrap_or(0);
                let bl = hex_val(b[2]).unwrap_or(0);
                let a = hex_val(b[3]).unwrap_or(15);
                return [
                    (r as f32) / 15.0,
                    (g as f32) / 15.0,
                    (bl as f32) / 15.0,
                    (a as f32) / 15.0,
                ];
            }
            _ => {}
        }
    }
    named_or_default(s)
}

/// Named colors (case-insensitive for ASCII, like the old lowercased match)
/// with opaque-black default.
fn named_or_default(s: &str) -> [f32; 4] {
    let mut lowered = [0u8; 16];
    let bytes = s.as_bytes();
    if bytes.len() > lowered.len() {
        return [0.0, 0.0, 0.0, 1.0];
    }
    for (i, &c) in bytes.iter().enumerate() {
        lowered[i] = if c.is_ascii_uppercase() {
            c + 32
        } else {
            c
        };
    }
    match &lowered[..bytes.len()] {
        b"red" => [1.0, 0.0, 0.0, 1.0],
        b"green" => [0.0, 1.0, 0.0, 1.0],
        b"blue" => [0.0, 0.0, 1.0, 1.0],
        b"white" => [1.0, 1.0, 1.0, 1.0],
        b"black" => [0.0, 0.0, 0.0, 1.0],
        b"yellow" => [1.0, 1.0, 0.0, 1.0],
        b"magenta" => [1.0, 0.0, 1.0, 1.0],
        b"cyan" => [0.0, 0.0, 1.0, 1.0],
        _ => [0.0, 0.0, 0.0, 1.0],
    }
}
