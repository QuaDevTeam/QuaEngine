use super::native_payload::{
    has_uri_scheme, is_forbidden_native_payload_reference, strip_asset_reference_suffix,
};

pub(in crate::renderer::json_validation) fn invalid_native_json_asset_reference_reason(
    asset_name: &str,
) -> Option<String> {
    let normalized = asset_name.replace('\\', "/");
    if asset_name.trim().is_empty() || strip_asset_reference_suffix(asset_name).trim().is_empty() {
        return Some("asset references must not be empty".to_string());
    }
    if asset_name.trim() != asset_name {
        return Some("asset references must not contain surrounding whitespace".to_string());
    }
    if asset_name.chars().any(char::is_control) {
        return Some("asset references must not contain control characters".to_string());
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
