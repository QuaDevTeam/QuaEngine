use quajs_wgpu_renderer::resources::NativeTextureUploadRequest;

pub(super) fn validate_texture_upload_request(
    request: &NativeTextureUploadRequest,
) -> Result<(), String> {
    validate_asset_type(&request.asset_type)?;
    validate_package_relative_asset_name(&request.asset_name)?;
    for package_id in request
        .owner_package_ids
        .iter()
        .chain(request.required_package_ids.iter())
        .chain(request.package_candidates.iter())
    {
        validate_package_id(package_id)?;
    }
    Ok(())
}

fn validate_asset_type(asset_type: &str) -> Result<(), String> {
    if asset_type.trim().is_empty()
        || asset_type.trim() != asset_type
        || !matches!(asset_type.chars().next(), Some(ch) if ch.is_ascii_alphanumeric())
        || !asset_type
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
    {
        return Err(format!(
            "Invalid native texture asset type \"{asset_type}\"."
        ));
    }
    Ok(())
}

fn validate_package_relative_asset_name(asset_name: &str) -> Result<(), String> {
    let base = strip_query_hash(asset_name);
    if base.is_empty()
        || base.trim().is_empty()
        || matches!(asset_name.chars().next(), Some('?' | '#'))
    {
        return Err("Native texture asset name must not be empty.".to_string());
    }
    if asset_name.trim() != asset_name || asset_name.chars().any(char::is_control) {
        return Err(format!(
            "Native texture asset \"{asset_name}\" must not contain control characters or surrounding whitespace."
        ));
    }
    if asset_name.contains('\\')
        || base.starts_with('/')
        || base.ends_with('/')
        || asset_name.contains("://")
        || looks_like_uri_scheme(asset_name)
    {
        return Err(format!(
            "Native texture asset \"{asset_name}\" must be package-relative."
        ));
    }
    if base
        .split('/')
        .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
    {
        return Err(format!(
            "Native texture asset \"{asset_name}\" must not contain traversal segments."
        ));
    }
    if has_forbidden_native_payload_extension(base) {
        return Err(format!(
            "Native texture asset \"{asset_name}\" must not reference native payloads."
        ));
    }
    Ok(())
}

fn validate_package_id(package_id: &str) -> Result<(), String> {
    if package_id.is_empty()
        || package_id.trim() != package_id
        || package_id.contains("..")
        || !package_id.chars().any(|ch| ch.is_ascii_alphanumeric())
        || !starts_and_ends_with_ascii_alphanumeric(package_id)
        || !package_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(format!(
            "Invalid native texture package id \"{package_id}\"."
        ));
    }
    Ok(())
}

fn starts_and_ends_with_ascii_alphanumeric(value: &str) -> bool {
    matches!(
        (value.chars().next(), value.chars().next_back()),
        (Some(first), Some(last)) if first.is_ascii_alphanumeric() && last.is_ascii_alphanumeric()
    )
}

fn strip_query_hash(value: &str) -> &str {
    let end = value
        .find(|ch| ch == '?' || ch == '#')
        .unwrap_or(value.len());
    &value[..end]
}

fn looks_like_uri_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    !scheme.is_empty()
        && scheme
            .chars()
            .all(|ch| ch.is_ascii_alphabetic() || matches!(ch, '+' | '-' | '.'))
}

fn has_forbidden_native_payload_extension(value: &str) -> bool {
    let Some((_, extension)) = value.rsplit_once('.') else {
        return false;
    };
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "a" | "app" | "dylib" | "dll" | "exe" | "node" | "o" | "rlib" | "so" | "wasm"
    )
}
