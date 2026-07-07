use super::{
    QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest,
    QuickJsGameStepFactoryCallRequest, QuickJsGameStepResumeRequest, QuickJsGameStepRunRequest,
    QuickJsModuleExportCallRequest,
};

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

pub fn validate_quickjs_module_export_call_request(
    request: &QuickJsModuleExportCallRequest,
) -> Result<(), QuickJsEvaluationError> {
    validate_quickjs_handle(
        &request.module_namespace_id,
        QuickJsEvaluationErrorCode::MissingModuleNamespace,
        "QuickJS module export call requires a moduleNamespaceId.",
        "QuickJS module export call moduleNamespaceId must be an opaque native namespace handle.",
    )?;
    validate_quickjs_handle(
        &request.export_name,
        QuickJsEvaluationErrorCode::MissingExportName,
        "QuickJS module export call requires an exportName.",
        "QuickJS module export call exportName must be a safe JavaScript export name.",
    )?;
    if matches!(
        request.export_name.as_str(),
        "__proto__" | "prototype" | "constructor"
    ) {
        return Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::MissingExport,
            message: format!(
                "QuickJS module export \"{}\" is not callable through the native bridge.",
                request.export_name
            ),
            asset_name: None,
            detail: Some(
                "Prototype-related export names are blocked at the native bridge.".to_string(),
            ),
        });
    }
    if let Some(args_json) = &request.args_json {
        let trimmed = args_json.trim();
        if trimmed.is_empty() || !trimmed.starts_with('[') {
            return Err(QuickJsEvaluationError {
                code: QuickJsEvaluationErrorCode::InvalidArguments,
                message: "QuickJS module export call argsJson must be a JSON array when provided."
                    .to_string(),
                asset_name: None,
                detail: None,
            });
        }
    }
    Ok(())
}

pub fn validate_quickjs_game_step_factory_call_request(
    request: &QuickJsGameStepFactoryCallRequest,
) -> Result<(), QuickJsEvaluationError> {
    validate_quickjs_handle(
        &request.module_namespace_id,
        QuickJsEvaluationErrorCode::MissingModuleNamespace,
        "QuickJS GameStep factory call requires a moduleNamespaceId.",
        "QuickJS GameStep factory call moduleNamespaceId must be an opaque native namespace handle.",
    )?;
    validate_quickjs_handle(
        &request.export_name,
        QuickJsEvaluationErrorCode::MissingExportName,
        "QuickJS GameStep factory call requires an exportName.",
        "QuickJS GameStep factory call exportName must be a safe JavaScript export name.",
    )?;
    if matches!(
        request.export_name.as_str(),
        "__proto__" | "prototype" | "constructor"
    ) {
        return Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::MissingExport,
            message: format!(
                "QuickJS GameStep factory export \"{}\" is not callable through the native bridge.",
                request.export_name
            ),
            asset_name: None,
            detail: Some(
                "Prototype-related export names are blocked at the native bridge.".to_string(),
            ),
        });
    }
    validate_optional_json_object(
        request.scope_json.as_deref(),
        QuickJsEvaluationErrorCode::InvalidScope,
        "QuickJS GameStep factory scopeJson must be a JSON object when provided.",
    )?;
    Ok(())
}

pub fn validate_quickjs_game_step_run_request(
    request: &QuickJsGameStepRunRequest,
) -> Result<(), QuickJsEvaluationError> {
    validate_quickjs_handle(
        &request.run_handle_id,
        QuickJsEvaluationErrorCode::MissingRunHandle,
        "QuickJS GameStep run requires a runHandleId.",
        "QuickJS GameStep runHandleId must be an opaque native run handle.",
    )?;
    validate_optional_json_object(
        request.ctx_json.as_deref(),
        QuickJsEvaluationErrorCode::InvalidStepContext,
        "QuickJS GameStep run ctxJson must be a JSON object when provided.",
    )?;
    Ok(())
}

pub fn validate_quickjs_game_step_resume_request(
    request: &QuickJsGameStepResumeRequest,
) -> Result<(), QuickJsEvaluationError> {
    validate_quickjs_handle(
        &request.resume_handle_id,
        QuickJsEvaluationErrorCode::MissingResumeHandle,
        "QuickJS GameStep resume requires a resumeHandleId.",
        "QuickJS GameStep resumeHandleId must be an opaque native continuation handle.",
    )?;
    if let Some(payload_json) = request.payload_json.as_deref() {
        validate_json_value(
            payload_json,
            QuickJsEvaluationErrorCode::InvalidResumePayload,
            "QuickJS GameStep resume payloadJson must be valid JSON when provided.",
        )?;
    }
    Ok(())
}

fn validate_quickjs_handle(
    value: &str,
    empty_code: QuickJsEvaluationErrorCode,
    empty_message: &str,
    invalid_message: &str,
) -> Result<(), QuickJsEvaluationError> {
    if value.trim().is_empty() {
        return Err(QuickJsEvaluationError {
            code: empty_code,
            message: empty_message.to_string(),
            asset_name: None,
            detail: None,
        });
    }
    if value.trim() != value || value.chars().any(char::is_control) || value.len() > 256 {
        return Err(QuickJsEvaluationError {
            code: empty_code,
            message: invalid_message.to_string(),
            asset_name: None,
            detail: Some(
                "Bridge handles must be trimmed, control-character-free, and at most 256 bytes."
                    .to_string(),
            ),
        });
    }
    Ok(())
}

fn validate_optional_json_object(
    json: Option<&str>,
    code: QuickJsEvaluationErrorCode,
    message: &str,
) -> Result<(), QuickJsEvaluationError> {
    if let Some(json) = json {
        let trimmed = json.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            return Err(QuickJsEvaluationError {
                code,
                message: message.to_string(),
                asset_name: None,
                detail: None,
            });
        }
    }
    Ok(())
}

fn validate_json_value(
    json: &str,
    code: QuickJsEvaluationErrorCode,
    message: &str,
) -> Result<(), QuickJsEvaluationError> {
    if json.trim().is_empty() {
        return Err(QuickJsEvaluationError {
            code,
            message: message.to_string(),
            asset_name: None,
            detail: None,
        });
    }
    serde_json::from_str::<serde_json::Value>(json).map_err(|error| QuickJsEvaluationError {
        code,
        message: message.to_string(),
        asset_name: None,
        detail: Some(error.to_string()),
    })?;
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

const FORBIDDEN_NATIVE_MODULE_PAYLOAD_EXTENSIONS: [&str; 17] = [
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
