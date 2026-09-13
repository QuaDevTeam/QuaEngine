use crate::projection::safety::is_safe_native_color_literal;

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
