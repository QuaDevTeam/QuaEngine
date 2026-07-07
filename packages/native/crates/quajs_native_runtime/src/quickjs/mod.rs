use serde::{Deserialize, Serialize};

mod registry;
#[cfg(feature = "quickjs-rquickjs")]
mod rquickjs_backend;
mod validation;

pub use registry::{
    quickjs_module_namespace_id, QuickJsModuleNamespaceRecord, QuickJsModuleNamespaceRegistry,
    QuickJsModuleNamespaceSummary,
};
#[cfg(feature = "quickjs-rquickjs")]
pub use rquickjs_backend::{
    quickjs_rquickjs_runtime_version, RquickJsModuleEvaluator, RQUICKJS_BACKEND_VERSION,
};
pub use validation::{
    is_forbidden_native_module_payload, is_forbidden_runtime_module_asset_name,
    is_supported_quickjs_module_asset, validate_quickjs_evaluation_request,
};

pub const UNSUPPORTED_QUICKJS_VERSION: &str = "unsupported";

pub fn quickjs_runtime_version() -> &'static str {
    match option_env!("QUA_NATIVE_QUICKJS_VERSION") {
        Some(version) if !version.trim().is_empty() => version,
        _ => {
            #[cfg(feature = "quickjs-rquickjs")]
            {
                quickjs_rquickjs_runtime_version()
            }
            #[cfg(not(feature = "quickjs-rquickjs"))]
            {
                UNSUPPORTED_QUICKJS_VERSION
            }
        }
    }
}

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
    ForbiddenNativePayload,
    UnsupportedModuleAsset,
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
    fn evaluate_module(&mut self, request: &QuickJsEvaluationRequest) -> QuickJsEvaluationResult;

    fn release_module_namespace(&mut self, _module_namespace_id: &str) {}

    fn release_module_namespaces(&mut self, records: &[QuickJsModuleNamespaceRecord]) {
        for record in records {
            self.release_module_namespace(&record.id);
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct UnsupportedQuickJsModuleEvaluator;

impl QuickJsModuleEvaluator for UnsupportedQuickJsModuleEvaluator {
    fn evaluate_module(&mut self, request: &QuickJsEvaluationRequest) -> QuickJsEvaluationResult {
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
    if let (true, Some(module_namespace_id)) =
        (response.ok, response.module_namespace_id.as_deref())
    {
        registry.register_evaluated_module(module_namespace_id, request);
    }
    response
}

#[cfg(test)]
mod tests;
