use std::collections::BTreeSet;

use quajs_native_runtime::{NativeHostApi, NativeHostApiResult, NativeMountedBundleInfo};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NativeAssetBundleCandidate {
    pub(crate) bundle_name: Option<String>,
    pub(crate) package_id: Option<String>,
}

pub(crate) fn ordered_package_candidates<'a>(
    packages: impl IntoIterator<Item = &'a String>,
) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut ordered = Vec::new();
    for package_id in packages {
        if seen.insert(package_id.clone()) {
            ordered.push(package_id.clone());
        }
    }
    ordered
}

pub(crate) fn resolve_native_asset_read_candidates(
    host: &impl NativeHostApi,
    package_ids: &[String],
) -> NativeHostApiResult<Vec<NativeAssetBundleCandidate>> {
    if package_ids.is_empty() {
        return Ok(vec![NativeAssetBundleCandidate {
            bundle_name: None,
            package_id: None,
        }]);
    }

    let mounted_bundles = host.list_mounted_bundles()?;
    let mut candidates = Vec::new();
    let mut seen = BTreeSet::new();

    for package_id in package_ids {
        for bundle in &mounted_bundles {
            if !bundle_matches_package(bundle, package_id) {
                continue;
            }
            let key = format!("{}|{package_id}", bundle.name);
            if seen.insert(key) {
                candidates.push(NativeAssetBundleCandidate {
                    bundle_name: Some(bundle.name.clone()),
                    package_id: Some(package_id.clone()),
                });
            }
        }
    }

    Ok(candidates)
}

pub(crate) fn validate_native_asset_type(
    asset_domain: &str,
    asset_type: &str,
) -> Result<(), String> {
    if asset_type.trim().is_empty()
        || asset_type.trim() != asset_type
        || !matches!(asset_type.chars().next(), Some(ch) if ch.is_ascii_alphanumeric())
        || !asset_type
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
    {
        return Err(format!(
            "Invalid native {asset_domain} asset type \"{asset_type}\"."
        ));
    }
    Ok(())
}

pub(crate) fn validate_package_relative_asset_name(
    asset_domain: &str,
    asset_name: &str,
) -> Result<(), String> {
    let base = strip_query_hash(asset_name);
    if base.is_empty()
        || base.trim().is_empty()
        || matches!(asset_name.chars().next(), Some('?' | '#'))
    {
        return Err(format!(
            "Native {asset_domain} asset name must not be empty."
        ));
    }
    if asset_name.trim() != asset_name || asset_name.chars().any(char::is_control) {
        return Err(format!(
            "Native {asset_domain} asset \"{asset_name}\" must not contain control characters or surrounding whitespace."
        ));
    }
    if asset_name.contains('\\')
        || base.starts_with('/')
        || base.ends_with('/')
        || asset_name.contains("://")
        || looks_like_uri_scheme(asset_name)
    {
        return Err(format!(
            "Native {asset_domain} asset \"{asset_name}\" must be package-relative."
        ));
    }
    if base
        .split('/')
        .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
    {
        return Err(format!(
            "Native {asset_domain} asset \"{asset_name}\" must not contain traversal segments."
        ));
    }
    if has_forbidden_native_payload_extension(base) {
        return Err(format!(
            "Native {asset_domain} asset \"{asset_name}\" must not reference native payloads."
        ));
    }
    Ok(())
}

pub(crate) fn validate_native_package_id(
    asset_domain: &str,
    package_id: &str,
) -> Result<(), String> {
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
            "Invalid native {asset_domain} package id \"{package_id}\"."
        ));
    }
    Ok(())
}

fn bundle_matches_package(bundle: &NativeMountedBundleInfo, package_id: &str) -> bool {
    bundle.runtime_package_id.as_deref() == Some(package_id)
        || bundle.logical_name.as_deref() == Some(package_id)
        || bundle.name == package_id
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
    let normalized = value.to_ascii_lowercase();
    FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS.iter().any(|extension| {
        normalized.ends_with(extension) || normalized.contains(&format!("{extension}/"))
    })
}

const FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS: [&str; 20] = [
    ".a",
    ".app",
    ".appimage",
    ".bundle",
    ".class",
    ".deb",
    ".dylib",
    ".dll",
    ".exe",
    ".framework",
    ".jar",
    ".msi",
    ".node",
    ".o",
    ".pkg",
    ".rlib",
    ".rpm",
    ".so",
    ".wasi",
    ".wasm",
];
