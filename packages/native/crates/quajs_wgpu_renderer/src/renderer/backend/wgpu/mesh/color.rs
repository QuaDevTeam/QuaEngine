#[derive(Clone, Copy, Debug, PartialEq)]
pub enum WgpuNativeRenderPaintColor {
    Rgba(WgpuNativeRenderColor),
    CurrentColor,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WgpuNativeRenderColor {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl WgpuNativeRenderColor {
    pub const WHITE: Self = Self {
        r: 1.0,
        g: 1.0,
        b: 1.0,
        a: 1.0,
    };

    /// Colors reach the GPU still sRGB-encoded. Native renders into a non-sRGB
    /// target so the fixed-function blender composites on those encoded values,
    /// which is what CSS does; decoding to linear here would blend in a
    /// different space and wash the frame out relative to the Web target.
    pub(in crate::renderer::backend::wgpu) fn to_gpu_rgba(self) -> [f32; 4] {
        [
            self.r.clamp(0.0, 1.0),
            self.g.clamp(0.0, 1.0),
            self.b.clamp(0.0, 1.0),
            self.a.clamp(0.0, 1.0),
        ]
    }
}

impl WgpuNativeRenderPaintColor {
    pub(in crate::renderer::backend::wgpu) fn to_gpu_rgba(self) -> [f32; 4] {
        match self {
            Self::Rgba(color) => color.to_gpu_rgba(),
            Self::CurrentColor => WgpuNativeRenderColor::WHITE.to_gpu_rgba(),
        }
    }
}

pub(in crate::renderer::backend::wgpu) fn parse_color_literal(literal: &str) -> Option<WgpuNativeRenderPaintColor> {
    if literal.trim() != literal {
        return None;
    }
    if literal.eq_ignore_ascii_case("currentColor") {
        return Some(WgpuNativeRenderPaintColor::CurrentColor);
    }
    if let Some(color) = parse_hex_color(literal) {
        return Some(WgpuNativeRenderPaintColor::Rgba(color));
    }
    if let Some(color) = parse_named_color(literal) {
        return Some(WgpuNativeRenderPaintColor::Rgba(color));
    }
    if let Some(color) = parse_hsl_color(literal) {
        return Some(WgpuNativeRenderPaintColor::Rgba(color));
    }
    parse_rgb_color(literal).map(WgpuNativeRenderPaintColor::Rgba)
}

fn parse_hex_color(literal: &str) -> Option<WgpuNativeRenderColor> {
    let hex = literal.strip_prefix('#')?;
    if !matches!(hex.len(), 3 | 4 | 6 | 8) || !hex.chars().all(|char| char.is_ascii_hexdigit()) {
        return None;
    }

    let mut values = Vec::with_capacity(4);
    if matches!(hex.len(), 3 | 4) {
        for char in hex.chars() {
            let value = char.to_digit(16)? as u8;
            values.push(value * 17);
        }
    } else {
        for index in (0..hex.len()).step_by(2) {
            values.push(u8::from_str_radix(&hex[index..index + 2], 16).ok()?);
        }
    }
    let alpha = values.get(3).copied().unwrap_or(255);

    Some(WgpuNativeRenderColor {
        r: values[0] as f32 / 255.0,
        g: values[1] as f32 / 255.0,
        b: values[2] as f32 / 255.0,
        a: alpha as f32 / 255.0,
    })
}

fn parse_named_color(literal: &str) -> Option<WgpuNativeRenderColor> {
    let (red, green, blue, alpha) = match literal.to_ascii_lowercase().as_str() {
        "transparent" => (0, 0, 0, 0),
        "black" => (0, 0, 0, 255),
        "silver" => (192, 192, 192, 255),
        "gray" => (128, 128, 128, 255),
        "white" => (255, 255, 255, 255),
        "maroon" => (128, 0, 0, 255),
        "red" => (255, 0, 0, 255),
        "purple" => (128, 0, 128, 255),
        "fuchsia" => (255, 0, 255, 255),
        "green" => (0, 128, 0, 255),
        "lime" => (0, 255, 0, 255),
        "olive" => (128, 128, 0, 255),
        "yellow" => (255, 255, 0, 255),
        "navy" => (0, 0, 128, 255),
        "blue" => (0, 0, 255, 255),
        "teal" => (0, 128, 128, 255),
        "aqua" => (0, 255, 255, 255),
        "orange" => (255, 165, 0, 255),
        _ => return None,
    };

    Some(WgpuNativeRenderColor {
        r: red as f32 / 255.0,
        g: green as f32 / 255.0,
        b: blue as f32 / 255.0,
        a: alpha as f32 / 255.0,
    })
}

fn parse_hsl_color(literal: &str) -> Option<WgpuNativeRenderColor> {
    let lower = literal.to_ascii_lowercase();
    let (function_name, has_alpha) = if lower.starts_with("hsla(") {
        ("hsla", true)
    } else if lower.starts_with("hsl(") {
        ("hsl", false)
    } else {
        return None;
    };
    if !literal.ends_with(')') {
        return None;
    }
    let prefix_len = function_name.len() + 1;
    let inner = &lower[prefix_len..lower.len() - 1];
    let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
    let expected_parts = if has_alpha { 4 } else { 3 };
    if parts.len() != expected_parts {
        return None;
    }
    // Hue accepts a bare number or a number with "deg" suffix (e.g. "240deg")
    let hue_str = parts[0].strip_suffix("deg").unwrap_or(parts[0]).trim();
    let hue: f32 = hue_str.parse().ok()?;
    // Saturation and lightness must carry a "%" suffix
    let saturation: f32 = parts[1].strip_suffix('%')?.trim().parse().ok()?;
    let lightness: f32 = parts[2].strip_suffix('%')?.trim().parse().ok()?;
    if !hue.is_finite() || !saturation.is_finite() || !lightness.is_finite() {
        return None;
    }
    if !(0.0..=100.0).contains(&saturation) || !(0.0..=100.0).contains(&lightness) {
        return None;
    }
    let alpha = if has_alpha {
        parse_alpha_channel(parts[3])?
    } else {
        1.0
    };
    let (r, g, b) = hsl_to_rgb(hue.rem_euclid(360.0), saturation / 100.0, lightness / 100.0);
    Some(WgpuNativeRenderColor { r, g, b, a: alpha })
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    // CSS Color Level 4 HSL → sRGB conversion (IEC 61966-2-1)
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0).rem_euclid(2.0) - 1.0).abs());
    let m = l - c / 2.0;
    let (r1, g1, b1): (f32, f32, f32) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    (r1 + m, g1 + m, b1 + m)
}

fn parse_rgb_color(literal: &str) -> Option<WgpuNativeRenderColor> {
    let lower = literal.to_ascii_lowercase();
    let (function_name, expected_parts) = if lower.starts_with("rgba(") {
        ("rgba", 4)
    } else if lower.starts_with("rgb(") {
        ("rgb", 3)
    } else {
        return None;
    };
    let prefix_len = function_name.len() + 1;
    if !literal.ends_with(')') {
        return None;
    }
    let parts = literal[prefix_len..literal.len() - 1]
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>();
    if parts.len() != expected_parts {
        return None;
    }

    Some(WgpuNativeRenderColor {
        r: parse_rgb_channel(parts[0])? / 255.0,
        g: parse_rgb_channel(parts[1])? / 255.0,
        b: parse_rgb_channel(parts[2])? / 255.0,
        a: match parts.get(3) {
            Some(alpha) => parse_alpha_channel(alpha)?,
            None => 1.0,
        },
    })
}

fn parse_rgb_channel(value: &str) -> Option<f32> {
    if !has_unsigned_decimal_syntax(value) {
        return None;
    }
    let number = value.parse::<f32>().ok()?;
    if number.is_finite() && (0.0..=255.0).contains(&number) {
        Some(number)
    } else {
        None
    }
}

fn parse_alpha_channel(value: &str) -> Option<f32> {
    if !has_rgb_alpha_channel_syntax(value) {
        return None;
    }
    let number = value.parse::<f32>().ok()?;
    if number.is_finite() && (0.0..=1.0).contains(&number) {
        Some(number)
    } else {
        None
    }
}

fn has_rgb_alpha_channel_syntax(value: &str) -> bool {
    if matches!(value, "0" | "1") {
        return true;
    }
    if let Some(rest) = value.strip_prefix("0.") {
        return !rest.is_empty() && rest.chars().all(|char| char.is_ascii_digit());
    }
    if let Some(rest) = value.strip_prefix('.') {
        return !rest.is_empty() && rest.chars().all(|char| char.is_ascii_digit());
    }
    false
}

fn has_unsigned_decimal_syntax(value: &str) -> bool {
    let Some((first, rest)) = value.split_once('.') else {
        return !value.is_empty() && value.chars().all(|char| char.is_ascii_digit());
    };
    !first.is_empty()
        && !rest.is_empty()
        && first.chars().all(|char| char.is_ascii_digit())
        && rest.chars().all(|char| char.is_ascii_digit())
}

#[cfg(test)]
mod tests;
