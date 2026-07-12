use super::native_payload::{has_uri_scheme, is_forbidden_native_payload_reference};

pub(in crate::renderer::json_validation) fn invalid_native_json_ui_dispatch_identifier_reason(
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

pub(in crate::renderer::json_validation) fn invalid_native_json_character_id_reason(
    value: &str,
) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some("character ids must not be empty".to_string());
    }
    if trimmed != value {
        return Some("character ids must not contain surrounding whitespace".to_string());
    }
    if value.chars().any(char::is_control) {
        return Some("character ids must not contain control characters".to_string());
    }
    if has_forbidden_ui_dispatch_uri_scheme(value) {
        return Some("character ids must not be URLs or dangerous URI schemes".to_string());
    }
    if value.contains(['?', '#']) {
        return Some("character ids must not contain query or hash suffixes".to_string());
    }
    if value.starts_with('/') {
        return Some("character ids must be identifiers, not absolute paths".to_string());
    }
    let normalized = value.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || value.contains("..") {
        return Some("character ids must not contain traversal markers".to_string());
    }
    if value.contains(['/', '\\']) {
        return Some("character ids must be identifiers, not paths".to_string());
    }
    if is_forbidden_native_payload_reference(value) {
        return Some("character ids must not point to native payloads".to_string());
    }
    if !value.chars().any(char::is_alphanumeric) {
        return Some("character ids must contain at least one letter or digit".to_string());
    }
    if !value
        .chars()
        .all(|char| char.is_alphanumeric() || matches!(char, '.' | '-' | '_' | ':'))
    {
        return Some("character ids must be safe native identifiers".to_string());
    }
    None
}

pub(in crate::renderer::json_validation) fn invalid_native_json_asset_type_reason(
    asset_type: &str,
) -> Option<String> {
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

pub(in crate::renderer::json_validation) fn invalid_native_json_package_id_reason(
    package_id: &str,
) -> Option<String> {
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
    if !package_id.chars().any(|char| char.is_ascii_alphanumeric()) {
        return Some(
            "package provenance ids must contain at least one ASCII letter or digit".to_string(),
        );
    }
    if !starts_and_ends_with_ascii_alphanumeric(package_id) {
        return Some(
            "package provenance ids must start and end with an ASCII letter or digit".to_string(),
        );
    }
    if !package_id
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_'))
    {
        return Some("package provenance ids must be safe native package identifiers".to_string());
    }
    None
}

pub(in crate::renderer::json_validation) fn invalid_native_json_font_family_reason(
    font_family: &str,
) -> Option<String> {
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

fn starts_and_ends_with_ascii_alphanumeric(value: &str) -> bool {
    matches!(
        (value.chars().next(), value.chars().next_back()),
        (Some(first), Some(last)) if first.is_ascii_alphanumeric() && last.is_ascii_alphanumeric()
    )
}
