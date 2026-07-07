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
    validate_quickjs_game_step_factory_call_request, validate_quickjs_game_step_resume_request,
    validate_quickjs_game_step_run_request, validate_quickjs_module_export_call_request,
    validate_quickjs_pipeline_listener_dispatch_request,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub module_graph: Vec<QuickJsRuntimeModuleRecord>,
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

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsModuleExportCallRequest {
    pub module_namespace_id: String,
    pub export_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsModuleExportCallResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value_json: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<QuickJsEvaluationError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepFactoryCallRequest {
    pub module_namespace_id: String,
    pub export_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepDescriptor {
    pub uuid: String,
    pub run_handle_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepFactoryCallResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steps: Option<Vec<QuickJsGameStepDescriptor>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<QuickJsEvaluationError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepRunRequest {
    pub run_handle_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctx_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepWaitRequest {
    pub resume_handle_id: String,
    pub event: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepTranslationRequest {
    pub resume_handle_id: String,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepPipelineEmitRequest {
    pub resume_handle_id: String,
    pub event: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_json: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum QuickJsPipelineSubscriptionOperation {
    Subscribe,
    Unsubscribe,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsPipelineSubscriptionChange {
    pub op: QuickJsPipelineSubscriptionOperation,
    pub subscription_id: String,
    pub module_namespace_id: String,
    pub event: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsPipelineListenerDispatchRequest {
    pub subscription_id: String,
    pub context_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsPipelineListenerDispatchResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<QuickJsGameStepCommand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pipeline_subscriptions: Option<Vec<QuickJsPipelineSubscriptionChange>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<QuickJsEvaluationError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepHelperCallRequest {
    pub resume_handle_id: String,
    pub module: String,
    pub export_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepResumeRequest {
    pub resume_handle_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepCommand {
    pub target: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsGameStepRunResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<QuickJsGameStepCommand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_wait: Option<QuickJsGameStepWaitRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_translation: Option<QuickJsGameStepTranslationRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_pipeline_emit: Option<QuickJsGameStepPipelineEmitRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_helper_call: Option<QuickJsGameStepHelperCallRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pipeline_subscriptions: Option<Vec<QuickJsPipelineSubscriptionChange>>,
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
    MissingModuleNamespace,
    MissingExportName,
    MissingExport,
    ExportNotCallable,
    InvalidArguments,
    InvalidScope,
    InvalidStepContext,
    InvalidStepFactoryResult,
    InvalidStepDescriptor,
    MissingRunHandle,
    MissingResumeHandle,
    InvalidWaitEvent,
    InvalidTranslationRequest,
    InvalidPipelineRequest,
    InvalidHelperCallRequest,
    InvalidResumePayload,
    StepRunFailed,
    UnsupportedStepContextCommand,
    UnsupportedReturnValue,
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

impl QuickJsModuleExportCallResponse {
    pub fn success(value_json: Option<String>) -> Self {
        Self {
            ok: true,
            value_json,
            error: None,
        }
    }

    pub fn error(error: QuickJsEvaluationError) -> Self {
        Self {
            ok: false,
            value_json: None,
            error: Some(error),
        }
    }
}

impl QuickJsGameStepFactoryCallResponse {
    pub fn success(steps: Vec<QuickJsGameStepDescriptor>) -> Self {
        Self {
            ok: true,
            steps: Some(steps),
            error: None,
        }
    }

    pub fn error(error: QuickJsEvaluationError) -> Self {
        Self {
            ok: false,
            steps: None,
            error: Some(error),
        }
    }
}

impl QuickJsGameStepRunResponse {
    pub fn success(commands: Vec<QuickJsGameStepCommand>) -> Self {
        Self {
            ok: true,
            commands: Some(commands),
            pending_wait: None,
            pending_translation: None,
            pending_pipeline_emit: None,
            pending_helper_call: None,
            pipeline_subscriptions: None,
            error: None,
        }
    }

    pub fn with_pipeline_subscriptions(
        mut self,
        subscriptions: Vec<QuickJsPipelineSubscriptionChange>,
    ) -> Self {
        if !subscriptions.is_empty() {
            self.pipeline_subscriptions = Some(subscriptions);
        }
        self
    }

    pub fn pending(
        commands: Vec<QuickJsGameStepCommand>,
        pending_wait: QuickJsGameStepWaitRequest,
    ) -> Self {
        Self {
            ok: true,
            commands: Some(commands),
            pending_wait: Some(pending_wait),
            pending_translation: None,
            pending_pipeline_emit: None,
            pending_helper_call: None,
            pipeline_subscriptions: None,
            error: None,
        }
    }

    pub fn pending_translation(
        commands: Vec<QuickJsGameStepCommand>,
        pending_translation: QuickJsGameStepTranslationRequest,
    ) -> Self {
        Self {
            ok: true,
            commands: Some(commands),
            pending_wait: None,
            pending_translation: Some(pending_translation),
            pending_pipeline_emit: None,
            pending_helper_call: None,
            pipeline_subscriptions: None,
            error: None,
        }
    }

    pub fn pending_pipeline_emit(
        commands: Vec<QuickJsGameStepCommand>,
        pending_pipeline_emit: QuickJsGameStepPipelineEmitRequest,
    ) -> Self {
        Self {
            ok: true,
            commands: Some(commands),
            pending_wait: None,
            pending_translation: None,
            pending_pipeline_emit: Some(pending_pipeline_emit),
            pending_helper_call: None,
            pipeline_subscriptions: None,
            error: None,
        }
    }

    pub fn pending_helper_call(
        commands: Vec<QuickJsGameStepCommand>,
        pending_helper_call: QuickJsGameStepHelperCallRequest,
    ) -> Self {
        Self {
            ok: true,
            commands: Some(commands),
            pending_wait: None,
            pending_translation: None,
            pending_pipeline_emit: None,
            pending_helper_call: Some(pending_helper_call),
            pipeline_subscriptions: None,
            error: None,
        }
    }

    pub fn error(error: QuickJsEvaluationError) -> Self {
        Self {
            ok: false,
            commands: None,
            pending_wait: None,
            pending_translation: None,
            pending_pipeline_emit: None,
            pending_helper_call: None,
            pipeline_subscriptions: None,
            error: Some(error),
        }
    }
}

impl QuickJsPipelineListenerDispatchResponse {
    pub fn success(
        commands: Vec<QuickJsGameStepCommand>,
        subscriptions: Vec<QuickJsPipelineSubscriptionChange>,
    ) -> Self {
        Self {
            ok: true,
            commands: Some(commands),
            pipeline_subscriptions: if subscriptions.is_empty() {
                None
            } else {
                Some(subscriptions)
            },
            error: None,
        }
    }

    pub fn error(error: QuickJsEvaluationError) -> Self {
        Self {
            ok: false,
            commands: None,
            pipeline_subscriptions: None,
            error: Some(error),
        }
    }
}

pub type QuickJsEvaluationResult = Result<QuickJsEvaluationResponse, QuickJsEvaluationError>;
pub type QuickJsModuleExportCallResult =
    Result<QuickJsModuleExportCallResponse, QuickJsEvaluationError>;
pub type QuickJsGameStepFactoryCallResult =
    Result<QuickJsGameStepFactoryCallResponse, QuickJsEvaluationError>;
pub type QuickJsGameStepRunResult = Result<QuickJsGameStepRunResponse, QuickJsEvaluationError>;
pub type QuickJsPipelineListenerDispatchResult =
    Result<QuickJsPipelineListenerDispatchResponse, QuickJsEvaluationError>;

pub trait QuickJsModuleEvaluator {
    fn evaluate_module(&mut self, request: &QuickJsEvaluationRequest) -> QuickJsEvaluationResult;

    fn call_module_export(
        &mut self,
        request: &QuickJsModuleExportCallRequest,
    ) -> QuickJsModuleExportCallResult {
        Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
            message: "QuickJS module export calls are not available in this native runtime build."
                .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No QuickJS evaluator backend has been installed for namespace \"{}\".",
                request.module_namespace_id
            )),
        })
    }

    fn call_game_step_factory(
        &mut self,
        request: &QuickJsGameStepFactoryCallRequest,
    ) -> QuickJsGameStepFactoryCallResult {
        Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
            message:
                "QuickJS GameStep factory calls are not available in this native runtime build."
                    .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No QuickJS evaluator backend has been installed for namespace \"{}\".",
                request.module_namespace_id
            )),
        })
    }

    fn call_game_step_run(
        &mut self,
        request: &QuickJsGameStepRunRequest,
    ) -> QuickJsGameStepRunResult {
        Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
            message: "QuickJS GameStep run calls are not available in this native runtime build."
                .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No QuickJS evaluator backend has been installed for run handle \"{}\".",
                request.run_handle_id
            )),
        })
    }

    fn resume_game_step_run(
        &mut self,
        request: &QuickJsGameStepResumeRequest,
    ) -> QuickJsGameStepRunResult {
        Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
            message:
                "QuickJS GameStep continuation resume calls are not available in this native runtime build."
                    .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No QuickJS evaluator backend has been installed for resume handle \"{}\".",
                request.resume_handle_id
            )),
        })
    }

    fn dispatch_pipeline_listener(
        &mut self,
        request: &QuickJsPipelineListenerDispatchRequest,
    ) -> QuickJsPipelineListenerDispatchResult {
        Err(QuickJsEvaluationError {
            code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
            message: "QuickJS pipeline listener dispatch calls are not available in this native runtime build."
                .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No QuickJS evaluator backend has been installed for subscription \"{}\".",
                request.subscription_id
            )),
        })
    }

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

pub fn call_quickjs_module_export(
    evaluator: &mut impl QuickJsModuleEvaluator,
    request: &QuickJsModuleExportCallRequest,
) -> QuickJsModuleExportCallResponse {
    if let Err(error) = validation::validate_quickjs_module_export_call_request(request) {
        return QuickJsModuleExportCallResponse::error(error);
    }

    match evaluator.call_module_export(request) {
        Ok(response) => response,
        Err(error) => QuickJsModuleExportCallResponse::error(error),
    }
}

pub fn call_quickjs_game_step_factory(
    evaluator: &mut impl QuickJsModuleEvaluator,
    request: &QuickJsGameStepFactoryCallRequest,
) -> QuickJsGameStepFactoryCallResponse {
    if let Err(error) = validation::validate_quickjs_game_step_factory_call_request(request) {
        return QuickJsGameStepFactoryCallResponse::error(error);
    }

    match evaluator.call_game_step_factory(request) {
        Ok(response) => response,
        Err(error) => QuickJsGameStepFactoryCallResponse::error(error),
    }
}

pub fn call_quickjs_game_step_run(
    evaluator: &mut impl QuickJsModuleEvaluator,
    request: &QuickJsGameStepRunRequest,
) -> QuickJsGameStepRunResponse {
    if let Err(error) = validation::validate_quickjs_game_step_run_request(request) {
        return QuickJsGameStepRunResponse::error(error);
    }

    match evaluator.call_game_step_run(request) {
        Ok(response) => response,
        Err(error) => QuickJsGameStepRunResponse::error(error),
    }
}

pub fn resume_quickjs_game_step_run(
    evaluator: &mut impl QuickJsModuleEvaluator,
    request: &QuickJsGameStepResumeRequest,
) -> QuickJsGameStepRunResponse {
    if let Err(error) = validation::validate_quickjs_game_step_resume_request(request) {
        return QuickJsGameStepRunResponse::error(error);
    }

    match evaluator.resume_game_step_run(request) {
        Ok(response) => response,
        Err(error) => QuickJsGameStepRunResponse::error(error),
    }
}

pub fn dispatch_quickjs_pipeline_listener(
    evaluator: &mut impl QuickJsModuleEvaluator,
    request: &QuickJsPipelineListenerDispatchRequest,
) -> QuickJsPipelineListenerDispatchResponse {
    if let Err(error) = validation::validate_quickjs_pipeline_listener_dispatch_request(request) {
        return QuickJsPipelineListenerDispatchResponse::error(error);
    }

    match evaluator.dispatch_pipeline_listener(request) {
        Ok(response) => response,
        Err(error) => QuickJsPipelineListenerDispatchResponse::error(error),
    }
}

#[cfg(test)]
mod tests;
