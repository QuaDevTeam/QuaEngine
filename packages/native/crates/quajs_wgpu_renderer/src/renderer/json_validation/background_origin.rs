use crate::projection::background::layout::resolved_media_origin_str;

pub(super) fn invalid_native_json_background_origin_reason(origin: &str) -> Option<String> {
    let trimmed = origin.trim();
    if trimmed.is_empty() {
        return Some("background media origins must not be empty".to_string());
    }
    if trimmed != origin {
        return Some(
            "background media origins must not contain surrounding whitespace".to_string(),
        );
    }
    if origin.len() > 64 {
        return Some(
            "background media origins must stay within native renderer limits".to_string(),
        );
    }
    if origin.chars().any(char::is_control) {
        return Some("background media origins must not contain control characters".to_string());
    }
    if origin.contains(['?', '#', '/', '\\']) || origin.contains("..") {
        return Some(
            "background media origins must be resolved origin values, not paths or resource references"
                .to_string(),
        );
    }
    if has_uri_scheme(origin) {
        return Some("background media origins must not be URLs or URI schemes".to_string());
    }

    if resolved_media_origin_str(origin).is_some() {
        None
    } else {
        Some(
            "background media origins must use one or two native origin axes: left, center, right, top, bottom, or 0%..100% percentages"
                .to_string(),
        )
    }
}

fn has_uri_scheme(value: &str) -> bool {
    let Some(index) = value.find(':') else {
        return false;
    };
    let scheme = &value[..index];
    !scheme.is_empty()
        && scheme.chars().enumerate().all(|(index, char)| {
            if index == 0 {
                char.is_ascii_alphabetic()
            } else {
                char.is_ascii_alphanumeric() || matches!(char, '+' | '-' | '.')
            }
        })
}
