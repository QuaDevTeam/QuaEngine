use super::{QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest};

pub fn validate_quickjs_evaluation_request(
    request: &QuickJsEvaluationRequest,
) -> Result<(), QuickJsEvaluationError> {
    let asset_name = request.module.asset_name.as_str();
    if asset_name.is_empty() {
        return Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::MissingAssetName,
            message: "QuickJS runtime module evaluation requires an assetName.".to_string(),
            asset_name: None,
            detail: None,
        });
    }
    if is_forbidden_runtime_module_asset_name(asset_name) {
        return Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::ForbiddenAssetName,
            message: format!(
                "QuickJS runtime module assetName \"{}\" must be package-relative.",
                request.module.asset_name
            ),
            asset_name: Some(request.module.asset_name.clone()),
            detail: None,
        });
    }
    if is_forbidden_native_module_payload(asset_name) {
        return Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::ForbiddenNativePayload,
            message: format!(
                "QuickJS runtime module assetName \"{}\" must not reference a native payload.",
                request.module.asset_name
            ),
            asset_name: Some(request.module.asset_name.clone()),
            detail: None,
        });
    }
    if !is_supported_quickjs_module_asset(asset_name) {
        return Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::UnsupportedModuleAsset,
            message: format!(
                "QuickJS runtime module assetName \"{}\" must reference a JavaScript module asset.",
                request.module.asset_name
            ),
            asset_name: Some(request.module.asset_name.clone()),
            detail: Some("Supported extensions are .js, .mjs, and .cjs.".to_string()),
        });
    }
    if let Some(error) = quickjs_module_size_error(
        &request.module.asset_name,
        "module bytes",
        request.module.bytes.len() as u64,
        request.limits.max_module_bytes,
    ) {
        return Err(error);
    }
    if let Some(error) = quickjs_module_size_error(
        &request.module.asset_name,
        "code bytes",
        request.module.code.as_bytes().len() as u64,
        request.limits.max_module_bytes,
    ) {
        return Err(error);
    }
    Ok(())
}

fn quickjs_module_size_error(
    asset_name: &str,
    field: &str,
    actual_bytes: u64,
    max_module_bytes: u64,
) -> Option<QuickJsEvaluationError> {
    if actual_bytes > max_module_bytes {
        return Some(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::ModuleTooLarge,
            message: format!(
                "QuickJS runtime module \"{}\" {} length {} exceeds maxModuleBytes {}.",
                asset_name, field, actual_bytes, max_module_bytes
            ),
            asset_name: Some(asset_name.to_string()),
            detail: Some(format!(
                "{field}: {actual_bytes}; maxModuleBytes: {max_module_bytes}"
            )),
        });
    }
    None
}

pub fn is_forbidden_runtime_module_asset_name(asset_name: &str) -> bool {
    let without_suffix = strip_asset_reference_suffix(asset_name);
    asset_name.trim().is_empty()
        || without_suffix.trim().is_empty()
        || asset_name.trim() != asset_name
        || asset_name.chars().any(char::is_control)
        || asset_name.contains('\\')
        || without_suffix.starts_with('/')
        || without_suffix.starts_with('\\')
        || has_uri_scheme(without_suffix)
        || without_suffix.ends_with('/')
        || without_suffix
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
}

pub fn is_forbidden_native_module_payload(asset_name: &str) -> bool {
    let normalized = strip_asset_reference_suffix(asset_name)
        .to_ascii_lowercase()
        .replace('\\', "/");
    FORBIDDEN_NATIVE_MODULE_PAYLOAD_EXTENSIONS
        .iter()
        .any(|extension| {
            normalized.ends_with(extension) || normalized.contains(&format!("{}/", extension))
        })
}

pub fn is_supported_quickjs_module_asset(asset_name: &str) -> bool {
    let normalized = strip_asset_reference_suffix(asset_name)
        .to_ascii_lowercase()
        .replace('\\', "/");
    let file_name = normalized.rsplit('/').next().unwrap_or_default();
    SUPPORTED_QUICKJS_MODULE_EXTENSIONS
        .iter()
        .any(|extension| file_name.ends_with(extension))
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

fn strip_asset_reference_suffix(asset_name: &str) -> &str {
    asset_name
        .split_once(['?', '#'])
        .map(|(base, _)| base)
        .unwrap_or(asset_name)
}

const SUPPORTED_QUICKJS_MODULE_EXTENSIONS: [&str; 3] = [".js", ".mjs", ".cjs"];

const FORBIDDEN_NATIVE_MODULE_PAYLOAD_EXTENSIONS: [&str; 16] = [
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
