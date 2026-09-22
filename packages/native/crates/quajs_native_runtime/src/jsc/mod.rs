use serde::{Deserialize, Serialize};

#[cfg(feature = "javascriptcore")]
mod jsc_backend;
#[cfg(feature = "javascriptcore")]
mod modules;
mod registry;
mod renderer_bridge;
mod validation;
#[cfg(feature = "javascriptcore")]
mod value;

#[cfg(feature = "javascriptcore")]
pub use jsc_backend::{jsc_runtime_backend_version, JavaScriptCoreEvaluator, JSC_BACKEND_VERSION};
pub use registry::{
    jsc_module_namespace_id, JscModuleNamespaceRecord, JscModuleNamespaceRegistry,
    JscModuleNamespaceSummary,
};
pub use renderer_bridge::JscRendererIntentHost;
pub use validation::{
    is_forbidden_native_module_payload, is_forbidden_runtime_module_asset_name,
    is_supported_jsc_module_asset, validate_jsc_evaluation_request,
    validate_jsc_game_step_factory_call_request, validate_jsc_game_step_resume_request,
    validate_jsc_game_step_run_request, validate_jsc_module_export_call_request,
    validate_jsc_pipeline_listener_dispatch_request,
};

pub const UNSUPPORTED_JSC_VERSION: &str = "unsupported";

pub fn jsc_runtime_version() -> &'static str {
    #[cfg(feature = "javascriptcore")]
    {
        jsc_runtime_backend_version()
    }
    #[cfg(not(feature = "javascriptcore"))]
    {
        UNSUPPORTED_JSC_VERSION
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JscRuntimeModuleKind {
    Script,
    Scene,
    EnginePlugin,
    StoreMigration,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscRuntimeModuleRecord {
    pub asset_name: String,
    pub bundle_name: String,
    pub package_id: String,
    pub kind: JscRuntimeModuleKind,
    pub code: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscSandboxLimits {
    pub max_module_bytes: u64,
    pub max_execution_time_ms: u64,
}

impl Default for JscSandboxLimits {
    fn default() -> Self {
        Self {
            max_module_bytes: 4 * 1024 * 1024,
            max_execution_time_ms: 1_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscEvaluationRequest {
    pub module: JscRuntimeModuleRecord,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub module_graph: Vec<JscRuntimeModuleRecord>,
    pub limits: JscSandboxLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscEvaluationResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub module_namespace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<JscEvaluationError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscModuleExportCallRequest {
    pub module_namespace_id: String,
    pub export_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscModuleExportCallResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value_json: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<JscEvaluationError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscPipelineMessage {
    pub event: String,
    pub payload_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepFactoryCallRequest {
    pub module_namespace_id: String,
    pub export_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepDescriptor {
    pub uuid: String,
    pub run_handle_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepFactoryCallResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steps: Option<Vec<JscGameStepDescriptor>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<JscEvaluationError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepRunRequest {
    pub run_handle_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctx_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepWaitRequest {
    pub resume_handle_id: String,
    pub event: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepTranslationRequest {
    pub resume_handle_id: String,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepPipelineEmitRequest {
    pub resume_handle_id: String,
    pub event: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_json: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JscPipelineSubscriptionOperation {
    Subscribe,
    Unsubscribe,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscPipelineSubscriptionChange {
    pub op: JscPipelineSubscriptionOperation,
    pub subscription_id: String,
    pub module_namespace_id: String,
    pub event: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscPipelineListenerDispatchRequest {
    pub subscription_id: String,
    pub context_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscPipelineListenerDispatchResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<JscGameStepCommand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pipeline_subscriptions: Option<Vec<JscPipelineSubscriptionChange>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<JscEvaluationError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepHelperCallRequest {
    pub resume_handle_id: String,
    pub module: String,
    pub export_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepResumeRequest {
    pub resume_handle_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepCommand {
    pub target: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JscGameStepRunResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<JscGameStepCommand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_wait: Option<JscGameStepWaitRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_translation: Option<JscGameStepTranslationRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_pipeline_emit: Option<JscGameStepPipelineEmitRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_helper_call: Option<JscGameStepHelperCallRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pipeline_subscriptions: Option<Vec<JscPipelineSubscriptionChange>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<JscEvaluationError>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JscEvaluationErrorCode {
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
pub struct JscEvaluationError {
    pub code: JscEvaluationErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl JscEvaluationResponse {
    pub fn success(module_namespace_id: impl Into<String>) -> Self {
        Self {
            ok: true,
            module_namespace_id: Some(module_namespace_id.into()),
            error: None,
        }
    }

    pub fn error(error: JscEvaluationError) -> Self {
        Self {
            ok: false,
            module_namespace_id: None,
            error: Some(error),
        }
    }
}

impl JscModuleExportCallResponse {
    pub fn success(value_json: Option<String>) -> Self {
        Self {
            ok: true,
            value_json,
            error: None,
        }
    }

    pub fn error(error: JscEvaluationError) -> Self {
        Self {
            ok: false,
            value_json: None,
            error: Some(error),
        }
    }
}

impl JscGameStepFactoryCallResponse {
    pub fn success(steps: Vec<JscGameStepDescriptor>) -> Self {
        Self {
            ok: true,
            steps: Some(steps),
            error: None,
        }
    }

    pub fn error(error: JscEvaluationError) -> Self {
        Self {
            ok: false,
            steps: None,
            error: Some(error),
        }
    }
}

impl JscGameStepRunResponse {
    pub fn success(commands: Vec<JscGameStepCommand>) -> Self {
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
        subscriptions: Vec<JscPipelineSubscriptionChange>,
    ) -> Self {
        if !subscriptions.is_empty() {
            self.pipeline_subscriptions = Some(subscriptions);
        }
        self
    }

    pub fn pending(
        commands: Vec<JscGameStepCommand>,
        pending_wait: JscGameStepWaitRequest,
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
        commands: Vec<JscGameStepCommand>,
        pending_translation: JscGameStepTranslationRequest,
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
        commands: Vec<JscGameStepCommand>,
        pending_pipeline_emit: JscGameStepPipelineEmitRequest,
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
        commands: Vec<JscGameStepCommand>,
        pending_helper_call: JscGameStepHelperCallRequest,
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

    pub fn error(error: JscEvaluationError) -> Self {
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

impl JscPipelineListenerDispatchResponse {
    pub fn success(
        commands: Vec<JscGameStepCommand>,
        subscriptions: Vec<JscPipelineSubscriptionChange>,
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

    pub fn error(error: JscEvaluationError) -> Self {
        Self {
            ok: false,
            commands: None,
            pipeline_subscriptions: None,
            error: Some(error),
        }
    }
}

pub type JscEvaluationResult = Result<JscEvaluationResponse, JscEvaluationError>;
pub type JscModuleExportCallResult = Result<JscModuleExportCallResponse, JscEvaluationError>;
pub type JscGameStepFactoryCallResult = Result<JscGameStepFactoryCallResponse, JscEvaluationError>;
pub type JscGameStepRunResult = Result<JscGameStepRunResponse, JscEvaluationError>;
pub type JscPipelineListenerDispatchResult =
    Result<JscPipelineListenerDispatchResponse, JscEvaluationError>;
pub type JscRendererIntentDispatchResult = Result<bool, JscEvaluationError>;

pub trait JscModuleEvaluator {
    fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult;

    fn call_module_export(
        &mut self,
        request: &JscModuleExportCallRequest,
    ) -> JscModuleExportCallResult {
        Err(JscEvaluationError {
            code: JscEvaluationErrorCode::UnsupportedRuntime,
            message:
                "JavaScriptCore module export calls are not available in this native runtime build."
                    .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No JavaScriptCore evaluator backend has been installed for namespace \"{}\".",
                request.module_namespace_id
            )),
        })
    }

    fn call_game_step_factory(
        &mut self,
        request: &JscGameStepFactoryCallRequest,
    ) -> JscGameStepFactoryCallResult {
        Err(JscEvaluationError {
            code: JscEvaluationErrorCode::UnsupportedRuntime,
            message:
                "JavaScriptCore GameStep factory calls are not available in this native runtime build."
                    .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No JavaScriptCore evaluator backend has been installed for namespace \"{}\".",
                request.module_namespace_id
            )),
        })
    }

    fn call_game_step_run(&mut self, request: &JscGameStepRunRequest) -> JscGameStepRunResult {
        Err(JscEvaluationError {
            code: JscEvaluationErrorCode::UnsupportedRuntime,
            message:
                "JavaScriptCore GameStep run calls are not available in this native runtime build."
                    .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No JavaScriptCore evaluator backend has been installed for run handle \"{}\".",
                request.run_handle_id
            )),
        })
    }

    fn resume_game_step_run(&mut self, request: &JscGameStepResumeRequest) -> JscGameStepRunResult {
        Err(JscEvaluationError {
            code: JscEvaluationErrorCode::UnsupportedRuntime,
            message:
                "JavaScriptCore GameStep continuation resume calls are not available in this native runtime build."
                    .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No JavaScriptCore evaluator backend has been installed for resume handle \"{}\".",
                request.resume_handle_id
            )),
        })
    }

    fn dispatch_pipeline_listener(
        &mut self,
        request: &JscPipelineListenerDispatchRequest,
    ) -> JscPipelineListenerDispatchResult {
        Err(JscEvaluationError {
            code: JscEvaluationErrorCode::UnsupportedRuntime,
            message: "JavaScriptCore pipeline listener dispatch calls are not available in this native runtime build."
                .to_string(),
            asset_name: None,
            detail: Some(format!(
                "No JavaScriptCore evaluator backend has been installed for subscription \"{}\".",
                request.subscription_id
            )),
        })
    }

    fn dispatch_renderer_intent(
        &mut self,
        _intent: &crate::host::NativeRendererIntent,
    ) -> JscRendererIntentDispatchResult {
        Ok(false)
    }

    fn release_module_namespace(&mut self, _module_namespace_id: &str) {}

    fn release_module_namespaces(&mut self, records: &[JscModuleNamespaceRecord]) {
        for record in records {
            self.release_module_namespace(&record.id);
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct UnsupportedJscModuleEvaluator;

impl JscModuleEvaluator for UnsupportedJscModuleEvaluator {
    fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
        Err(JscEvaluationError {
            code: JscEvaluationErrorCode::UnsupportedRuntime,
            message:
                "JavaScriptCore module evaluation is not available in this native runtime build."
                    .to_string(),
            asset_name: Some(request.module.asset_name.clone()),
            detail: Some("No JavaScriptCore evaluator backend has been installed.".to_string()),
        })
    }
}

pub fn evaluate_jsc_module(
    evaluator: &mut impl JscModuleEvaluator,
    request: &JscEvaluationRequest,
) -> JscEvaluationResponse {
    if let Err(error) = validate_jsc_evaluation_request(request) {
        return JscEvaluationResponse::error(error);
    }

    match evaluator.evaluate_module(request) {
        Ok(response) => response,
        Err(error) => JscEvaluationResponse::error(error),
    }
}

pub fn evaluate_jsc_module_with_registry(
    evaluator: &mut impl JscModuleEvaluator,
    registry: &mut JscModuleNamespaceRegistry,
    request: &JscEvaluationRequest,
) -> JscEvaluationResponse {
    let response = evaluate_jsc_module(evaluator, request);
    if let (true, Some(module_namespace_id)) =
        (response.ok, response.module_namespace_id.as_deref())
    {
        registry.register_evaluated_module(module_namespace_id, request);
    }
    response
}

pub fn call_jsc_module_export(
    evaluator: &mut impl JscModuleEvaluator,
    request: &JscModuleExportCallRequest,
) -> JscModuleExportCallResponse {
    if let Err(error) = validation::validate_jsc_module_export_call_request(request) {
        return JscModuleExportCallResponse::error(error);
    }

    match evaluator.call_module_export(request) {
        Ok(response) => response,
        Err(error) => JscModuleExportCallResponse::error(error),
    }
}

pub fn call_jsc_game_step_factory(
    evaluator: &mut impl JscModuleEvaluator,
    request: &JscGameStepFactoryCallRequest,
) -> JscGameStepFactoryCallResponse {
    if let Err(error) = validation::validate_jsc_game_step_factory_call_request(request) {
        return JscGameStepFactoryCallResponse::error(error);
    }

    match evaluator.call_game_step_factory(request) {
        Ok(response) => response,
        Err(error) => JscGameStepFactoryCallResponse::error(error),
    }
}

pub fn call_jsc_game_step_run(
    evaluator: &mut impl JscModuleEvaluator,
    request: &JscGameStepRunRequest,
) -> JscGameStepRunResponse {
    if let Err(error) = validation::validate_jsc_game_step_run_request(request) {
        return JscGameStepRunResponse::error(error);
    }

    match evaluator.call_game_step_run(request) {
        Ok(response) => response,
        Err(error) => JscGameStepRunResponse::error(error),
    }
}

pub fn resume_jsc_game_step_run(
    evaluator: &mut impl JscModuleEvaluator,
    request: &JscGameStepResumeRequest,
) -> JscGameStepRunResponse {
    if let Err(error) = validation::validate_jsc_game_step_resume_request(request) {
        return JscGameStepRunResponse::error(error);
    }

    match evaluator.resume_game_step_run(request) {
        Ok(response) => response,
        Err(error) => JscGameStepRunResponse::error(error),
    }
}

pub fn dispatch_jsc_pipeline_listener(
    evaluator: &mut impl JscModuleEvaluator,
    request: &JscPipelineListenerDispatchRequest,
) -> JscPipelineListenerDispatchResponse {
    if let Err(error) = validation::validate_jsc_pipeline_listener_dispatch_request(request) {
        return JscPipelineListenerDispatchResponse::error(error);
    }

    match evaluator.dispatch_pipeline_listener(request) {
        Ok(response) => response,
        Err(error) => JscPipelineListenerDispatchResponse::error(error),
    }
}

pub fn dispatch_jsc_renderer_intent(
    evaluator: &mut impl JscModuleEvaluator,
    intent: &crate::host::NativeRendererIntent,
) -> JscRendererIntentDispatchResult {
    evaluator.dispatch_renderer_intent(intent)
}

#[cfg(test)]
mod tests;
