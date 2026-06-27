pub(super) fn invalid_native_json_ui_dispatch_identifier_reason(
    value: &str,
    noun: &str,
) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some(format!("{noun} must not be empty"));
    }
    if trimmed != value {
        return Some(format!("{noun} must not contain surrounding whitespace"));
    }
    if value.chars().any(char::is_control) {
        return Some(format!("{noun} must not contain control characters"));
    }
    if has_forbidden_ui_dispatch_uri_scheme(value) {
        return Some(format!("{noun} must not be URLs or dangerous URI schemes"));
    }
    if value.contains(['?', '#']) {
        return Some(format!("{noun} must not contain query or hash suffixes"));
    }
    if value.starts_with('/') {
        return Some(format!(
            "{noun} must be dispatch identifiers, not absolute paths"
        ));
    }
    let normalized = value.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || value.contains("..") {
        return Some(format!("{noun} must not contain traversal markers"));
    }
    if value.contains(['/', '\\']) {
        return Some(format!("{noun} must be dispatch identifiers, not paths"));
    }
    if is_forbidden_native_payload_reference(value) {
        return Some(format!("{noun} must not point to native payloads"));
    }
    if !value.chars().any(|char| char.is_ascii_alphanumeric()) {
        return Some(format!(
            "{noun} must contain at least one ASCII letter or digit"
        ));
    }
    if !value
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_' | ':'))
    {
        return Some(format!("{noun} must be safe native dispatch identifiers"));
    }
    None
}

pub(super) fn invalid_native_json_asset_type_reason(asset_type: &str) -> Option<String> {
    let trimmed = asset_type.trim();
    if trimmed.is_empty() {
        return Some("asset types must not be empty".to_string());
    }
    if trimmed != asset_type
        || !asset_type
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'))
    {
        return Some("asset types must be safe native asset kind identifiers".to_string());
    }
    None
}

pub(super) fn invalid_native_json_package_id_reason(package_id: &str) -> Option<String> {
    let trimmed = package_id.trim();
    if trimmed.is_empty() {
        return Some("package provenance ids must not be empty".to_string());
    }
    if trimmed != package_id {
        return Some("package provenance ids must not contain surrounding whitespace".to_string());
    }
    if package_id.chars().any(char::is_control) {
        return Some("package provenance ids must not contain control characters".to_string());
    }
    if has_uri_scheme(package_id) {
        return Some("package provenance ids must not be URLs or URI schemes".to_string());
    }
    if package_id.contains(['?', '#']) {
        return Some("package provenance ids must not contain query or hash suffixes".to_string());
    }
    if package_id.starts_with('/') {
        return Some("package provenance ids must be package ids, not absolute paths".to_string());
    }
    let normalized = package_id.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || package_id.contains("..") {
        return Some("package provenance ids must not contain traversal markers".to_string());
    }
    if package_id.contains(['/', '\\']) {
        return Some("package provenance ids must be identifiers, not paths".to_string());
    }
    if !package_id
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_'))
    {
        return Some("package provenance ids must be safe native package identifiers".to_string());
    }
    None
}

pub(super) fn invalid_native_json_font_family_reason(font_family: &str) -> Option<String> {
    let trimmed = font_family.trim();
    if trimmed.is_empty() {
        return Some("font family names must not be empty".to_string());
    }
    if trimmed != font_family {
        return Some("font family names must not contain surrounding whitespace".to_string());
    }
    if font_family.chars().any(char::is_control) {
        return Some("font family names must not contain control characters".to_string());
    }
    if has_uri_scheme(font_family) {
        return Some("font family names must not be URLs or URI schemes".to_string());
    }
    if font_family.contains(':') {
        return Some(
            "font family names must not contain resource namespace separators".to_string(),
        );
    }
    if font_family.contains(['?', '#']) {
        return Some("font family names must not contain query or hash suffixes".to_string());
    }
    if font_family.starts_with('/') {
        return Some("font family names must not be absolute paths".to_string());
    }
    let normalized = font_family.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || font_family.contains("..") {
        return Some("font family names must not contain traversal markers".to_string());
    }
    if font_family.contains(['/', '\\']) {
        return Some("font family names must be names, not paths".to_string());
    }
    if is_forbidden_native_payload_reference(font_family) {
        return Some("font family names must not point to native payloads".to_string());
    }
    None
}

pub(super) fn invalid_native_json_color_literal_reason(color: &str) -> Option<String> {
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

pub(super) fn invalid_native_json_asset_reference_reason(asset_name: &str) -> Option<String> {
    let normalized = asset_name.replace('\\', "/");
    if asset_name.trim().is_empty() || strip_asset_reference_suffix(asset_name).trim().is_empty() {
        return Some("asset references must not be empty".to_string());
    }
    if asset_name.contains('\\') {
        return Some("asset references must use forward-slash package paths".to_string());
    }
    if normalized.starts_with('/') {
        return Some("asset references must be package-relative".to_string());
    }
    if has_uri_scheme(&normalized) {
        return Some("asset references must not be URLs or URI schemes".to_string());
    }
    if normalized.split('/').any(|segment| segment == "..") {
        return Some("asset references must not traverse outside the package".to_string());
    }
    if is_forbidden_native_payload_reference(&normalized) {
        return Some("asset references must not point to native payloads".to_string());
    }
    None
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

fn is_forbidden_native_payload_reference(asset_name: &str) -> bool {
    let normalized = strip_asset_reference_suffix(asset_name).to_ascii_lowercase();
    FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS.iter().any(|extension| {
        normalized.ends_with(extension) || normalized.contains(&format!("{extension}/"))
    })
}

fn strip_asset_reference_suffix(asset_name: &str) -> &str {
    asset_name
        .split_once(['?', '#'])
        .map(|(base, _)| base)
        .unwrap_or(asset_name)
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

fn has_forbidden_ui_dispatch_uri_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    matches!(
        scheme.to_ascii_lowercase().as_str(),
        "http"
            | "https"
            | "file"
            | "data"
            | "blob"
            | "javascript"
            | "native"
            | "shell"
            | "ffi"
            | "node"
            | "wasm"
    )
}

const FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS: [&str; 16] = [
    ".dylib",
    ".so",
    ".dll",
    ".framework",
    ".bundle",
    ".node",
    ".wasm",
    ".wasi",
    ".exe",
    ".msi",
    ".app",
    ".pkg",
    ".deb",
    ".rpm",
    ".appimage",
    ".jar",
];
