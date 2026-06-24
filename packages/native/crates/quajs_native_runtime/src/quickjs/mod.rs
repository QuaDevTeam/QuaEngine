use serde::{Deserialize, Serialize};

mod registry;

pub use registry::{
    quickjs_module_namespace_id, QuickJsModuleNamespaceRecord, QuickJsModuleNamespaceRegistry,
    QuickJsModuleNamespaceSummary,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum QuickJsRuntimeModuleKind {
    Script,
    Scene,
    EnginePlugin,
    StoreMigration,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsRuntimeModuleRecord {
    pub asset_name: String,
    pub bundle_name: String,
    pub package_id: String,
    pub kind: QuickJsRuntimeModuleKind,
    pub code: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsSandboxLimits {
    pub max_heap_bytes: u64,
    pub max_stack_bytes: u64,
    pub max_module_bytes: u64,
    pub max_execution_ticks: u64,
}

impl Default for QuickJsSandboxLimits {
    fn default() -> Self {
        Self {
            max_heap_bytes: 64 * 1024 * 1024,
            max_stack_bytes: 2 * 1024 * 1024,
            max_module_bytes: 4 * 1024 * 1024,
            max_execution_ticks: 1_000_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsEvaluationRequest {
    pub module: QuickJsRuntimeModuleRecord,
    pub limits: QuickJsSandboxLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsEvaluationResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub module_namespace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<QuickJsEvaluationError>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum QuickJsEvaluationErrorCode {
    MissingAssetName,
    ForbiddenAssetName,
    ModuleTooLarge,
    EvaluationFailed,
    UnsupportedRuntime,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsEvaluationError {
    pub code: QuickJsEvaluationErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl QuickJsEvaluationResponse {
    pub fn success(module_namespace_id: impl Into<String>) -> Self {
        Self {
            ok: true,
            module_namespace_id: Some(module_namespace_id.into()),
            error: None,
        }
    }

    pub fn error(error: QuickJsEvaluationError) -> Self {
        Self {
            ok: false,
            module_namespace_id: None,
            error: Some(error),
        }
    }
}

pub type QuickJsEvaluationResult = Result<QuickJsEvaluationResponse, QuickJsEvaluationError>;

pub trait QuickJsModuleEvaluator {
    fn evaluate_module(
        &mut self,
        request: &QuickJsEvaluationRequest,
    ) -> QuickJsEvaluationResult;
}

#[derive(Debug, Clone, Default)]
pub struct UnsupportedQuickJsModuleEvaluator;

impl QuickJsModuleEvaluator for UnsupportedQuickJsModuleEvaluator {
    fn evaluate_module(
        &mut self,
        request: &QuickJsEvaluationRequest,
    ) -> QuickJsEvaluationResult {
        Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
            message: "QuickJS module evaluation is not available in this native runtime build."
                .to_string(),
            asset_name: Some(request.module.asset_name.clone()),
            detail: Some("No QuickJS evaluator backend has been installed.".to_string()),
        })
    }
}

pub fn evaluate_quickjs_module(
    evaluator: &mut impl QuickJsModuleEvaluator,
    request: &QuickJsEvaluationRequest,
) -> QuickJsEvaluationResponse {
    if let Err(error) = validate_quickjs_evaluation_request(request) {
        return QuickJsEvaluationResponse::error(error);
    }

    match evaluator.evaluate_module(request) {
        Ok(response) => response,
        Err(error) => QuickJsEvaluationResponse::error(error),
    }
}

pub fn evaluate_quickjs_module_with_registry(
    evaluator: &mut impl QuickJsModuleEvaluator,
    registry: &mut QuickJsModuleNamespaceRegistry,
    request: &QuickJsEvaluationRequest,
) -> QuickJsEvaluationResponse {
    let response = evaluate_quickjs_module(evaluator, request);
    if let (true, Some(module_namespace_id)) = (response.ok, response.module_namespace_id.as_deref()) {
        registry.register_evaluated_module(module_namespace_id, request);
    }
    response
}

pub fn validate_quickjs_evaluation_request(
    request: &QuickJsEvaluationRequest,
) -> Result<(), QuickJsEvaluationError> {
    let asset_name = request.module.asset_name.trim();
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
    if request.module.bytes.len() as u64 > request.limits.max_module_bytes {
        return Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::ModuleTooLarge,
            message: format!(
                "QuickJS runtime module \"{}\" exceeds the configured module byte limit.",
                request.module.asset_name
            ),
            asset_name: Some(request.module.asset_name.clone()),
            detail: Some(format!(
                "{} > {}",
                request.module.bytes.len(),
                request.limits.max_module_bytes
            )),
        });
    }
    Ok(())
}

pub fn is_forbidden_runtime_module_asset_name(asset_name: &str) -> bool {
    asset_name.starts_with('/')
        || asset_name.starts_with('\\')
        || asset_name
            .split(['/', '\\'])
            .any(|segment| segment == "..")
        || has_uri_scheme(asset_name)
}

fn has_uri_scheme(value: &str) -> bool {
    let Some(index) = value.find(':') else {
        return false;
    };
    let scheme = &value[..index];
    !scheme.is_empty()
        && scheme
            .chars()
            .enumerate()
            .all(|(index, char)| {
                if index == 0 {
                    char.is_ascii_alphabetic()
                } else {
                    char.is_ascii_alphanumeric() || matches!(char, '+' | '-' | '.')
                }
            })
}

#[cfg(test)]
mod tests;
