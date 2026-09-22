use super::{
    JscEvaluationError, JscEvaluationErrorCode, JscEvaluationRequest,
    JscGameStepFactoryCallRequest, JscGameStepResumeRequest, JscGameStepRunRequest,
    JscModuleExportCallRequest, JscPipelineListenerDispatchRequest,
};

pub fn validate_jsc_evaluation_request(
    request: &JscEvaluationRequest,
) -> Result<(), JscEvaluationError> {
    let asset_name = request.module.asset_name.as_str();
    if !(1..=60_000).contains(&request.limits.max_execution_time_ms) {
        return Err(JscEvaluationError {
            code: JscEvaluationErrorCode::InvalidArguments,
            message: "JavaScriptCore maxExecutionTimeMs must be between 1 and 60000.".into(),
            asset_name: Some(asset_name.into()),
            detail: None,
        });
    }
    if asset_name.is_empty() {
        return Err(JscEvaluationError {
            code: JscEvaluationErrorCode::MissingAssetName,
            message: "JavaScriptCore runtime module evaluation requires an assetName.".to_string(),
            asset_name: None,
            detail: None,
        });
    }
    if is_forbidden_runtime_module_asset_name(asset_name) {
        return Err(JscEvaluationError {
            code: JscEvaluationErrorCode::ForbiddenAssetName,
            message: format!(
                "JavaScriptCore runtime module assetName \"{}\" must be package-relative.",
                request.module.asset_name
            ),
            asset_name: Some(request.module.asset_name.clone()),
            detail: None,
        });
    }
    if is_forbidden_native_module_payload(asset_name) {
        return Err(JscEvaluationError {
            code: JscEvaluationErrorCode::ForbiddenNativePayload,
            message: format!(
                "JavaScriptCore runtime module assetName \"{}\" must not reference a native payload.",
                request.module.asset_name
            ),
            asset_name: Some(request.module.asset_name.clone()),
            detail: None,
        });
    }
    if !is_supported_jsc_module_asset(asset_name) {
        return Err(JscEvaluationError {
            code: JscEvaluationErrorCode::UnsupportedModuleAsset,
            message: format!(
                "JavaScriptCore runtime module assetName \"{}\" must reference a JavaScript module asset.",
                request.module.asset_name
            ),
            asset_name: Some(request.module.asset_name.clone()),
            detail: Some("Supported extensions are .js, .mjs, and .cjs.".to_string()),
        });
    }
    if let Some(error) = jsc_module_size_error(
        &request.module.asset_name,
        "module bytes",
        request.module.bytes.len() as u64,
        request.limits.max_module_bytes,
    ) {
        return Err(error);
    }
    if let Some(error) = jsc_module_size_error(
        &request.module.asset_name,
        "code bytes",
        request.module.code.as_bytes().len() as u64,
        request.limits.max_module_bytes,
    ) {
        return Err(error);
    }
    let mut seen_graph_assets = std::collections::BTreeSet::new();
    for graph_module in &request.module_graph {
        let graph_asset_name = graph_module.asset_name.as_str();
        if !seen_graph_assets.insert(graph_asset_name.to_string()) {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::ForbiddenAssetName,
                message: format!(
                    "JavaScriptCore runtime module graph contains duplicate assetName \"{}\".",
                    graph_module.asset_name
                ),
                asset_name: Some(graph_module.asset_name.clone()),
                detail: None,
            });
        }
        if strip_asset_reference_suffix(graph_asset_name)
            == strip_asset_reference_suffix(asset_name)
        {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::ForbiddenAssetName,
                message: format!(
                    "JavaScriptCore runtime module graph assetName \"{}\" must not duplicate the entry module assetName.",
                    graph_module.asset_name
                ),
                asset_name: Some(graph_module.asset_name.clone()),
                detail: None,
            });
        }
        if graph_module.package_id != request.module.package_id
            || graph_module.bundle_name != request.module.bundle_name
        {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::ForbiddenAssetName,
                message: format!(
                    "JavaScriptCore runtime module graph assetName \"{}\" must belong to the same runtime package and bundle as the entry module.",
                    graph_module.asset_name
                ),
                asset_name: Some(graph_module.asset_name.clone()),
                detail: None,
            });
        }
        if graph_asset_name.is_empty() {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::MissingAssetName,
                message: "JavaScriptCore runtime module graph entries require assetName values."
                    .to_string(),
                asset_name: None,
                detail: None,
            });
        }
        if is_forbidden_runtime_module_asset_name(graph_asset_name) {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::ForbiddenAssetName,
                message: format!(
                    "JavaScriptCore runtime module graph assetName \"{}\" must be package-relative.",
                    graph_module.asset_name
                ),
                asset_name: Some(graph_module.asset_name.clone()),
                detail: None,
            });
        }
        if is_forbidden_native_module_payload(graph_asset_name) {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::ForbiddenNativePayload,
                message: format!(
                    "JavaScriptCore runtime module graph assetName \"{}\" must not reference a native payload.",
                    graph_module.asset_name
                ),
                asset_name: Some(graph_module.asset_name.clone()),
                detail: None,
            });
        }
        if !is_supported_jsc_module_asset(graph_asset_name) {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::UnsupportedModuleAsset,
                message: format!(
                    "JavaScriptCore runtime module graph assetName \"{}\" must reference a JavaScript module asset.",
                    graph_module.asset_name
                ),
                asset_name: Some(graph_module.asset_name.clone()),
                detail: Some("Supported extensions are .js, .mjs, and .cjs.".to_string()),
            });
        }
        if let Some(error) = jsc_module_size_error(
            &graph_module.asset_name,
            "module graph bytes",
            graph_module.bytes.len() as u64,
            request.limits.max_module_bytes,
        ) {
            return Err(error);
        }
        if let Some(error) = jsc_module_size_error(
            &graph_module.asset_name,
            "module graph code bytes",
            graph_module.code.as_bytes().len() as u64,
            request.limits.max_module_bytes,
        ) {
            return Err(error);
        }
    }
    Ok(())
}

pub fn validate_jsc_module_export_call_request(
    request: &JscModuleExportCallRequest,
) -> Result<(), JscEvaluationError> {
    validate_jsc_handle(
        &request.module_namespace_id,
        JscEvaluationErrorCode::MissingModuleNamespace,
        "JavaScriptCore module export call requires a moduleNamespaceId.",
        "JavaScriptCore module export call moduleNamespaceId must be an opaque native namespace handle.",
    )?;
    validate_jsc_handle(
        &request.export_name,
        JscEvaluationErrorCode::MissingExportName,
        "JavaScriptCore module export call requires an exportName.",
        "JavaScriptCore module export call exportName must be a safe JavaScript export name.",
    )?;
    if matches!(
        request.export_name.as_str(),
        "__proto__" | "prototype" | "constructor"
    ) {
        return Err(JscEvaluationError {
            code: JscEvaluationErrorCode::MissingExport,
            message: format!(
                "JavaScriptCore module export \"{}\" is not callable through the native bridge.",
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
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::InvalidArguments,
                message:
                    "JavaScriptCore module export call argsJson must be a JSON array when provided."
                        .to_string(),
                asset_name: None,
                detail: None,
            });
        }
    }
    Ok(())
}

pub fn validate_jsc_game_step_factory_call_request(
    request: &JscGameStepFactoryCallRequest,
) -> Result<(), JscEvaluationError> {
    validate_jsc_handle(
        &request.module_namespace_id,
        JscEvaluationErrorCode::MissingModuleNamespace,
        "JavaScriptCore GameStep factory call requires a moduleNamespaceId.",
        "JavaScriptCore GameStep factory call moduleNamespaceId must be an opaque native namespace handle.",
    )?;
    validate_jsc_handle(
        &request.export_name,
        JscEvaluationErrorCode::MissingExportName,
        "JavaScriptCore GameStep factory call requires an exportName.",
        "JavaScriptCore GameStep factory call exportName must be a safe JavaScript export name.",
    )?;
    if matches!(
        request.export_name.as_str(),
        "__proto__" | "prototype" | "constructor"
    ) {
        return Err(JscEvaluationError {
            code: JscEvaluationErrorCode::MissingExport,
            message: format!(
                "JavaScriptCore GameStep factory export \"{}\" is not callable through the native bridge.",
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
        JscEvaluationErrorCode::InvalidScope,
        "JavaScriptCore GameStep factory scopeJson must be a JSON object when provided.",
    )?;
    Ok(())
}

pub fn validate_jsc_game_step_run_request(
    request: &JscGameStepRunRequest,
) -> Result<(), JscEvaluationError> {
    validate_jsc_handle(
        &request.run_handle_id,
        JscEvaluationErrorCode::MissingRunHandle,
        "JavaScriptCore GameStep run requires a runHandleId.",
        "JavaScriptCore GameStep runHandleId must be an opaque native run handle.",
    )?;
    validate_optional_json_object(
        request.ctx_json.as_deref(),
        JscEvaluationErrorCode::InvalidStepContext,
        "JavaScriptCore GameStep run ctxJson must be a JSON object when provided.",
    )?;
    Ok(())
}

pub fn validate_jsc_game_step_resume_request(
    request: &JscGameStepResumeRequest,
) -> Result<(), JscEvaluationError> {
    validate_jsc_handle(
        &request.resume_handle_id,
        JscEvaluationErrorCode::MissingResumeHandle,
        "JavaScriptCore GameStep resume requires a resumeHandleId.",
        "JavaScriptCore GameStep resumeHandleId must be an opaque native continuation handle.",
    )?;
    if let Some(payload_json) = request.payload_json.as_deref() {
        validate_json_value(
            payload_json,
            JscEvaluationErrorCode::InvalidResumePayload,
            "JavaScriptCore GameStep resume payloadJson must be valid JSON when provided.",
        )?;
    }
    Ok(())
}

pub fn validate_jsc_pipeline_listener_dispatch_request(
    request: &JscPipelineListenerDispatchRequest,
) -> Result<(), JscEvaluationError> {
    validate_jsc_handle(
        &request.subscription_id,
        JscEvaluationErrorCode::InvalidPipelineRequest,
        "JavaScriptCore pipeline listener dispatch requires a subscriptionId.",
        "JavaScriptCore pipeline listener dispatch subscriptionId must be an opaque native subscription handle.",
    )?;
    validate_json_object(
        request.context_json.as_str(),
        JscEvaluationErrorCode::InvalidPipelineRequest,
        "JavaScriptCore pipeline listener dispatch contextJson must be a JSON object.",
    )?;
    Ok(())
}

fn validate_jsc_handle(
    value: &str,
    empty_code: JscEvaluationErrorCode,
    empty_message: &str,
    invalid_message: &str,
) -> Result<(), JscEvaluationError> {
    if value.trim().is_empty() {
        return Err(JscEvaluationError {
            code: empty_code,
            message: empty_message.to_string(),
            asset_name: None,
            detail: None,
        });
    }
    if value.trim() != value || value.chars().any(char::is_control) || value.len() > 256 {
        return Err(JscEvaluationError {
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
    code: JscEvaluationErrorCode,
    message: &str,
) -> Result<(), JscEvaluationError> {
    if let Some(json) = json {
        let trimmed = json.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            return Err(JscEvaluationError {
                code,
                message: message.to_string(),
                asset_name: None,
                detail: None,
            });
        }
    }
    Ok(())
}

fn validate_json_object(
    json: &str,
    code: JscEvaluationErrorCode,
    message: &str,
) -> Result<(), JscEvaluationError> {
    let trimmed = json.trim();
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return Err(JscEvaluationError {
            code,
            message: message.to_string(),
            asset_name: None,
            detail: None,
        });
    }
    let value =
        serde_json::from_str::<serde_json::Value>(trimmed).map_err(|error| JscEvaluationError {
            code,
            message: message.to_string(),
            asset_name: None,
            detail: Some(error.to_string()),
        })?;
    if !value.is_object() {
        return Err(JscEvaluationError {
            code,
            message: message.to_string(),
            asset_name: None,
            detail: None,
        });
    }
    Ok(())
}

fn validate_json_value(
    json: &str,
    code: JscEvaluationErrorCode,
    message: &str,
) -> Result<(), JscEvaluationError> {
    if json.trim().is_empty() {
        return Err(JscEvaluationError {
            code,
            message: message.to_string(),
            asset_name: None,
            detail: None,
        });
    }
    serde_json::from_str::<serde_json::Value>(json).map_err(|error| JscEvaluationError {
        code,
        message: message.to_string(),
        asset_name: None,
        detail: Some(error.to_string()),
    })?;
    Ok(())
}

fn jsc_module_size_error(
    asset_name: &str,
    field: &str,
    actual_bytes: u64,
    max_module_bytes: u64,
) -> Option<JscEvaluationError> {
    if actual_bytes > max_module_bytes {
        return Some(JscEvaluationError {
            code: JscEvaluationErrorCode::ModuleTooLarge,
            message: format!(
                "JavaScriptCore runtime module \"{}\" {} length {} exceeds maxModuleBytes {}.",
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

pub fn is_supported_jsc_module_asset(asset_name: &str) -> bool {
    let normalized = strip_asset_reference_suffix(asset_name)
        .to_ascii_lowercase()
        .replace('\\', "/");
    let file_name = normalized.rsplit('/').next().unwrap_or_default();
    SUPPORTED_JSC_MODULE_EXTENSIONS
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

const SUPPORTED_JSC_MODULE_EXTENSIONS: [&str; 3] = [".js", ".mjs", ".cjs"];

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
