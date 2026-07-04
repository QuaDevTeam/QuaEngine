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
}

pub(super) fn parse_color_literal(literal: &str) -> Option<WgpuNativeRenderPaintColor> {
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
