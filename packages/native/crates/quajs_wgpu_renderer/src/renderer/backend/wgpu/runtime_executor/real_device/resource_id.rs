use super::texture::RealWgpuDecodedTextureMetadata;
use super::{invalid_order, WgpuNativeRenderRuntimeError};

pub(super) fn validate_decoded_texture_resource_id(
    resource_id: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    let trimmed = resource_id.trim();
    if trimmed.is_empty() || stripped_suffix(resource_id).trim().is_empty() {
        return invalid_order("decoded texture resource id must not be empty");
    }
    if trimmed != resource_id {
        return invalid_order(
            "decoded texture resource id must not contain surrounding whitespace",
        );
    }
    if resource_id.chars().any(char::is_control) {
        return invalid_order("decoded texture resource id must not contain control characters");
    }
    if resource_id.contains(['?', '#']) {
        return invalid_order(
            "decoded texture resource id must not contain query or hash suffixes",
        );
    }
    if resource_id.starts_with('/') || resource_id.starts_with('\\') {
        return invalid_order("decoded texture resource id must be renderer-resource relative");
    }
    if resource_id.contains('\\') {
        return invalid_order("decoded texture resource id must use forward slash separators");
    }
    if has_forbidden_uri_scheme(resource_id) {
        return invalid_order(
            "decoded texture resource id must not be a URL or dangerous URI scheme",
        );
    }

    let normalized = resource_id.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") {
        return invalid_order("decoded texture resource id must not contain traversal segments");
    }
    if is_forbidden_native_payload_reference(&normalized) {
        return invalid_order("decoded texture resource id must not point to a native payload");
    }
    validate_namespace_shape(resource_id)
}

pub(super) fn validate_decoded_texture_metadata(
    metadata: &RealWgpuDecodedTextureMetadata,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if let Some(owner_package_id) = metadata.owner_package_id.as_deref() {
        validate_decoded_texture_package_id(owner_package_id, "owner package id")?;
    }
    for required_package_id in &metadata.required_package_ids {
        validate_decoded_texture_package_id(required_package_id, "required package id")?;
    }
    Ok(())
}

fn validate_namespace_shape(resource_id: &str) -> Result<(), WgpuNativeRenderRuntimeError> {
    let Some((namespace, path)) = resource_id.split_once(':') else {
        return Ok(());
    };
    if namespace.is_empty() {
        return invalid_order("decoded texture resource id namespace must not be empty");
    }
    if !namespace
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return invalid_order("decoded texture resource id namespace must be a safe identifier");
    }
    if path.is_empty() || stripped_suffix(path).trim().is_empty() {
        return invalid_order("decoded texture resource id path must not be empty");
    }
    if path.starts_with('/') {
        return invalid_order("decoded texture resource id path must be package-relative");
    }
    Ok(())
}

fn validate_decoded_texture_package_id(
    package_id: &str,
    role: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    let trimmed = package_id.trim();
    if trimmed.is_empty() {
        return invalid_order(format!("decoded texture {role} must not be empty"));
    }
    if trimmed != package_id {
        return invalid_order(format!(
            "decoded texture {role} must not contain surrounding whitespace"
        ));
    }
    if package_id.chars().any(char::is_control) {
        return invalid_order(format!(
            "decoded texture {role} must not contain control characters"
        ));
    }
    if package_id.contains(['?', '#']) {
        return invalid_order(format!(
            "decoded texture {role} must not contain query or hash suffixes"
        ));
    }
    if package_id.contains(':') || has_forbidden_uri_scheme(package_id) {
        return invalid_order(format!(
            "decoded texture {role} must not be a URL, URI scheme, or resource namespace"
        ));
    }
    if package_id.starts_with('/') || package_id.starts_with('\\') {
        return invalid_order(format!("decoded texture {role} must not be a path"));
    }
    let normalized = package_id.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || package_id.contains("..") {
        return invalid_order(format!(
            "decoded texture {role} must not contain traversal markers"
        ));
    }
    if package_id.contains(['/', '\\']) {
        return invalid_order(format!(
            "decoded texture {role} must be an identifier, not a path"
        ));
    }
    if is_forbidden_native_payload_reference(package_id) {
        return invalid_order(format!(
            "decoded texture {role} must not point to a native payload"
        ));
    }
    if !package_id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_'))
    {
        return invalid_order(format!(
            "decoded texture {role} must be a safe native package identifier"
        ));
    }
    Ok(())
}

fn has_forbidden_uri_scheme(value: &str) -> bool {
    if value.contains("://") {
        return true;
    }
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
            | "ffi"
            | "shell"
            | "wasm"
    )
}

fn is_forbidden_native_payload_reference(value: &str) -> bool {
    let normalized = stripped_suffix(value).to_ascii_lowercase();
    FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS.iter().any(|extension| {
        normalized.ends_with(extension) || normalized.contains(&format!("{extension}/"))
    })
}

fn stripped_suffix(value: &str) -> &str {
    value
        .split_once(['?', '#'])
        .map(|(base, _)| base)
        .unwrap_or(value)
}

const FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS: [&str; 17] = [
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
    ".class",
];
