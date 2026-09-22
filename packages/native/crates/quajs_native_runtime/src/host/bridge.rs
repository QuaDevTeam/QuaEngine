use serde::{Deserialize, Serialize};

use super::api::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiErrorInfo, NativeMountedBundleInfo,
    NativeRendererIntent, NativeSignatureVerifyRequest,
};
use super::info::NativeHostInfo;
use crate::jsc::{
    call_jsc_game_step_factory, call_jsc_game_step_run, call_jsc_module_export,
    dispatch_jsc_pipeline_listener, evaluate_jsc_module_with_registry, resume_jsc_game_step_run,
    JscEvaluationRequest, JscEvaluationResponse, JscGameStepFactoryCallRequest,
    JscGameStepFactoryCallResponse, JscGameStepResumeRequest, JscGameStepRunRequest,
    JscGameStepRunResponse, JscModuleEvaluator, JscModuleExportCallRequest,
    JscModuleExportCallResponse, JscModuleNamespaceRecord, JscModuleNamespaceRegistry,
    JscModuleNamespaceSummary, JscPipelineListenerDispatchRequest,
    JscPipelineListenerDispatchResponse, UnsupportedJscModuleEvaluator,
};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "method", content = "params", rename_all = "camelCase")]
pub enum NativeHostApiRequest {
    GetHostInfo,
    ReadAssetBytes(NativeAssetReadRequest),
    ListMountedBundles,
    ReadStorage(NativeHostApiStorageKeyRequest),
    WriteStorage(NativeHostApiWriteStorageRequest),
    DeleteStorage(NativeHostApiStorageKeyRequest),
    ListStorageKeys(NativeHostApiListStorageKeysRequest),
    HashBytes(NativeHostApiHashBytesRequest),
    VerifySignature(NativeSignatureVerifyRequest),
    EvaluateJscModule(JscEvaluationRequest),
    CallJscModuleExport(JscModuleExportCallRequest),
    CallJscGameStepFactory(JscGameStepFactoryCallRequest),
    CallJscGameStepRun(JscGameStepRunRequest),
    ResumeJscGameStepRun(JscGameStepResumeRequest),
    DispatchJscPipelineListener(JscPipelineListenerDispatchRequest),
    ReleaseJscModuleNamespace(NativeJscReleaseNamespaceRequest),
    ReleaseJscPackageNamespaces(NativeJscReleasePackageRequest),
    GetJscNamespaceSummary,
    GetJscPackageNamespaceSummary(NativeJscReleasePackageRequest),
    EmitRendererIntent(NativeRendererIntent),
    DrainRendererIntents,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostApiStorageKeyRequest {
    pub key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostApiWriteStorageRequest {
    pub key: String,
    pub value: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostApiListStorageKeysRequest {
    pub prefix: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostApiHashBytesRequest {
    pub bytes: Vec<u8>,
    pub algorithm: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeJscReleaseNamespaceRequest {
    pub module_namespace_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeJscReleasePackageRequest {
    pub package_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostApiResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<NativeHostApiResponsePayload>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<NativeHostApiErrorInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum NativeHostApiResponsePayload {
    HostInfo(NativeHostInfo),
    AssetBytes(Vec<u8>),
    MountedBundles(Vec<NativeMountedBundleInfo>),
    StorageBytes(Option<Vec<u8>>),
    StorageKeys(Vec<String>),
    Hash(String),
    SignatureValid(bool),
    JscEvaluation(JscEvaluationResponse),
    JscExportCall(JscModuleExportCallResponse),
    JscGameStepFactoryCall(JscGameStepFactoryCallResponse),
    JscGameStepRun(JscGameStepRunResponse),
    JscPipelineListenerDispatch(JscPipelineListenerDispatchResponse),
    JscNamespace(Option<JscModuleNamespaceRecord>),
    JscNamespaces(Vec<JscModuleNamespaceRecord>),
    JscNamespaceSummary(JscModuleNamespaceSummary),
    RendererIntents(Vec<NativeRendererIntent>),
}

impl NativeHostApiResponse {
    pub fn success(payload: NativeHostApiResponsePayload) -> Self {
        Self {
            ok: true,
            payload: Some(payload),
            error: None,
        }
    }

    pub fn empty() -> Self {
        Self {
            ok: true,
            payload: None,
            error: None,
        }
    }

    pub fn error(error: NativeHostApiErrorInfo) -> Self {
        Self {
            ok: false,
            payload: None,
            error: Some(error),
        }
    }
}

pub fn dispatch_native_host_api_request(
    host: &mut impl NativeHostApi,
    request: NativeHostApiRequest,
) -> NativeHostApiResponse {
    let mut jsc = UnsupportedJscModuleEvaluator;
    dispatch_native_host_api_request_with_jsc(host, &mut jsc, request)
}

pub fn dispatch_native_host_api_request_with_jsc(
    host: &mut impl NativeHostApi,
    jsc: &mut impl JscModuleEvaluator,
    request: NativeHostApiRequest,
) -> NativeHostApiResponse {
    let mut registry = JscModuleNamespaceRegistry::new();
    dispatch_native_host_api_request_with_jsc_registry(host, jsc, &mut registry, request)
}

pub fn dispatch_native_host_api_request_with_jsc_registry(
    host: &mut impl NativeHostApi,
    jsc: &mut impl JscModuleEvaluator,
    registry: &mut JscModuleNamespaceRegistry,
    request: NativeHostApiRequest,
) -> NativeHostApiResponse {
    match request {
        NativeHostApiRequest::GetHostInfo => {
            NativeHostApiResponse::success(NativeHostApiResponsePayload::HostInfo(host.host_info()))
        }
        NativeHostApiRequest::ReadAssetBytes(request) => host
            .read_asset_bytes(&request)
            .map(NativeHostApiResponsePayload::AssetBytes)
            .map(NativeHostApiResponse::success)
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::ListMountedBundles => host
            .list_mounted_bundles()
            .map(NativeHostApiResponsePayload::MountedBundles)
            .map(NativeHostApiResponse::success)
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::ReadStorage(request) => host
            .read_storage(&request.key)
            .map(NativeHostApiResponsePayload::StorageBytes)
            .map(NativeHostApiResponse::success)
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::WriteStorage(request) => host
            .write_storage(&request.key, request.value)
            .map(|_| NativeHostApiResponse::empty())
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::DeleteStorage(request) => host
            .delete_storage(&request.key)
            .map(|_| NativeHostApiResponse::empty())
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::ListStorageKeys(request) => host
            .list_storage_keys(&request.prefix)
            .map(NativeHostApiResponsePayload::StorageKeys)
            .map(NativeHostApiResponse::success)
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::HashBytes(request) => host
            .hash_bytes(&request.bytes, &request.algorithm)
            .map(NativeHostApiResponsePayload::Hash)
            .map(NativeHostApiResponse::success)
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::VerifySignature(request) => host
            .verify_signature(&request)
            .map(NativeHostApiResponsePayload::SignatureValid)
            .map(NativeHostApiResponse::success)
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::EvaluateJscModule(request) => {
            NativeHostApiResponse::success(NativeHostApiResponsePayload::JscEvaluation(
                evaluate_jsc_module_with_registry(jsc, registry, &request),
            ))
        }
        NativeHostApiRequest::CallJscModuleExport(request) => NativeHostApiResponse::success(
            NativeHostApiResponsePayload::JscExportCall(call_jsc_module_export(jsc, &request)),
        ),
        NativeHostApiRequest::CallJscGameStepFactory(request) => {
            NativeHostApiResponse::success(NativeHostApiResponsePayload::JscGameStepFactoryCall(
                call_jsc_game_step_factory(jsc, &request),
            ))
        }
        NativeHostApiRequest::CallJscGameStepRun(request) => NativeHostApiResponse::success(
            NativeHostApiResponsePayload::JscGameStepRun(call_jsc_game_step_run(jsc, &request)),
        ),
        NativeHostApiRequest::ResumeJscGameStepRun(request) => NativeHostApiResponse::success(
            NativeHostApiResponsePayload::JscGameStepRun(resume_jsc_game_step_run(jsc, &request)),
        ),
        NativeHostApiRequest::DispatchJscPipelineListener(request) => {
            NativeHostApiResponse::success(
                NativeHostApiResponsePayload::JscPipelineListenerDispatch(
                    dispatch_jsc_pipeline_listener(jsc, &request),
                ),
            )
        }
        NativeHostApiRequest::ReleaseJscModuleNamespace(request) => {
            let released = registry.release_namespace(&request.module_namespace_id);
            if let Some(record) = &released {
                jsc.release_module_namespace(&record.id);
            }
            NativeHostApiResponse::success(NativeHostApiResponsePayload::JscNamespace(released))
        }
        NativeHostApiRequest::ReleaseJscPackageNamespaces(request) => {
            let released = registry.release_package(&request.package_id);
            jsc.release_module_namespaces(&released);
            NativeHostApiResponse::success(NativeHostApiResponsePayload::JscNamespaces(released))
        }
        NativeHostApiRequest::GetJscNamespaceSummary => NativeHostApiResponse::success(
            NativeHostApiResponsePayload::JscNamespaceSummary(registry.summary()),
        ),
        NativeHostApiRequest::GetJscPackageNamespaceSummary(request) => {
            NativeHostApiResponse::success(NativeHostApiResponsePayload::JscNamespaceSummary(
                registry.package_summary(&request.package_id),
            ))
        }
        NativeHostApiRequest::EmitRendererIntent(event) => host
            .emit_renderer_intent(event)
            .map(|_| NativeHostApiResponse::empty())
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
        NativeHostApiRequest::DrainRendererIntents => host
            .drain_renderer_intents()
            .map(NativeHostApiResponsePayload::RendererIntents)
            .map(NativeHostApiResponse::success)
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
    }
}

#[cfg(test)]
mod tests;
