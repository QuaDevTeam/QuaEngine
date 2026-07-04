use super::native_payload::{has_uri_scheme, is_forbidden_native_payload_reference};

pub(in crate::renderer::json_validation) fn invalid_native_json_color_literal_reason(
    color: &str,
) -> Option<String> {
    let trimmed = color.trim();
    if trimmed.is_empty() {
        return Some("color literals must not be empty".to_string());
    }
    if trimmed != color {
        return Some("color literals must not contain surrounding whitespace".to_string());
    }
    if color.len() > 128 {
        return Some("color literals must stay within native renderer limits".to_string());
    }
    if color.chars().any(char::is_control) {
        return Some("color literals must not contain control characters".to_string());
    }
    if is_safe_native_color_literal(color) {
        return None;
    }
    if has_uri_scheme(color) {
        return Some("color literals must not be URLs or URI schemes".to_string());
    }
    if color.contains(['/', '\\']) || color.contains("..") {
        return Some("color literals must not be paths or traversal markers".to_string());
    }
    if is_forbidden_native_payload_reference(color) {
        return Some("color literals must not point to native payloads".to_string());
    }
    Some(
        "color literals must be hex, rgb(...), rgba(...), transparent, currentColor, or a basic named color"
            .to_string(),
    )
}

fn is_safe_native_color_literal(color: &str) -> bool {
    is_hex_color_literal(color)
        || is_basic_color_keyword(color)
        || is_rgb_color_function(color, "rgb", 3)
        || is_rgb_color_function(color, "rgba", 4)
}

fn is_hex_color_literal(color: &str) -> bool {
    let Some(hex) = color.strip_prefix('#') else {
        return false;
    };
    matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|char| char.is_ascii_hexdigit())
}

fn is_basic_color_keyword(color: &str) -> bool {
    matches!(
        color.to_ascii_lowercase().as_str(),
        "aqua"
            | "black"
            | "blue"
            | "currentcolor"
            | "fuchsia"
            | "gray"
            | "green"
            | "lime"
            | "maroon"
            | "navy"
            | "olive"
            | "orange"
            | "purple"
            | "red"
            | "silver"
            | "teal"
            | "transparent"
            | "white"
            | "yellow"
    )
}

fn is_rgb_color_function(color: &str, function_name: &str, expected_parts: usize) -> bool {
    let prefix = format!("{function_name}(");
    let lower = color.to_ascii_lowercase();
    if !lower.starts_with(&prefix) || !color.ends_with(')') {
        return false;
    }
    let body = &color[prefix.len()..color.len() - 1];
    let parts = body.split(',').map(str::trim).collect::<Vec<_>>();
    if parts.len() != expected_parts {
        return false;
    }
    parts.iter().take(3).copied().all(is_rgb_color_channel)
        && match parts.get(3).copied() {
            Some(alpha) => is_rgb_alpha_channel(alpha),
            None => true,
        }
}

fn is_rgb_color_channel(value: &str) -> bool {
    has_unsigned_decimal_syntax(value)
        && matches!(
            value.parse::<f64>(),
            Ok(number) if number.is_finite() && (0.0..=255.0).contains(&number)
        )
}

fn is_rgb_alpha_channel(value: &str) -> bool {
    has_rgb_alpha_channel_syntax(value)
        && matches!(
            value.parse::<f64>(),
            Ok(number) if number.is_finite() && (0.0..=1.0).contains(&number)
        )
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
