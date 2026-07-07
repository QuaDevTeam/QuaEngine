use serde::{Deserialize, Serialize};

use super::api::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiErrorInfo, NativeMountedBundleInfo,
    NativeRendererIntent, NativeSignatureVerifyRequest,
};
use super::info::NativeHostInfo;
use crate::quickjs::{
    call_quickjs_module_export, evaluate_quickjs_module_with_registry, QuickJsEvaluationRequest,
    QuickJsEvaluationResponse, QuickJsModuleEvaluator, QuickJsModuleExportCallRequest,
    QuickJsModuleExportCallResponse, QuickJsModuleNamespaceRecord, QuickJsModuleNamespaceRegistry,
    QuickJsModuleNamespaceSummary, UnsupportedQuickJsModuleEvaluator,
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
    EvaluateQuickJsModule(QuickJsEvaluationRequest),
    CallQuickJsModuleExport(QuickJsModuleExportCallRequest),
    ReleaseQuickJsModuleNamespace(NativeQuickJsReleaseNamespaceRequest),
    ReleaseQuickJsPackageNamespaces(NativeQuickJsReleasePackageRequest),
    GetQuickJsNamespaceSummary,
    GetQuickJsPackageNamespaceSummary(NativeQuickJsReleasePackageRequest),
    EmitRendererIntent(NativeRendererIntent),
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
pub struct NativeQuickJsReleaseNamespaceRequest {
    pub module_namespace_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeQuickJsReleasePackageRequest {
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
    QuickJsEvaluation(QuickJsEvaluationResponse),
    QuickJsExportCall(QuickJsModuleExportCallResponse),
    QuickJsNamespace(Option<QuickJsModuleNamespaceRecord>),
    QuickJsNamespaces(Vec<QuickJsModuleNamespaceRecord>),
    QuickJsNamespaceSummary(QuickJsModuleNamespaceSummary),
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
    let mut quickjs = UnsupportedQuickJsModuleEvaluator;
    dispatch_native_host_api_request_with_quickjs(host, &mut quickjs, request)
}

pub fn dispatch_native_host_api_request_with_quickjs(
    host: &mut impl NativeHostApi,
    quickjs: &mut impl QuickJsModuleEvaluator,
    request: NativeHostApiRequest,
) -> NativeHostApiResponse {
    let mut registry = QuickJsModuleNamespaceRegistry::new();
    dispatch_native_host_api_request_with_quickjs_registry(host, quickjs, &mut registry, request)
}

pub fn dispatch_native_host_api_request_with_quickjs_registry(
    host: &mut impl NativeHostApi,
    quickjs: &mut impl QuickJsModuleEvaluator,
    registry: &mut QuickJsModuleNamespaceRegistry,
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
        NativeHostApiRequest::EvaluateQuickJsModule(request) => {
            NativeHostApiResponse::success(NativeHostApiResponsePayload::QuickJsEvaluation(
                evaluate_quickjs_module_with_registry(quickjs, registry, &request),
            ))
        }
        NativeHostApiRequest::CallQuickJsModuleExport(request) => {
            NativeHostApiResponse::success(NativeHostApiResponsePayload::QuickJsExportCall(
                call_quickjs_module_export(quickjs, &request),
            ))
        }
        NativeHostApiRequest::ReleaseQuickJsModuleNamespace(request) => {
            let released = registry.release_namespace(&request.module_namespace_id);
            if let Some(record) = &released {
                quickjs.release_module_namespace(&record.id);
            }
            NativeHostApiResponse::success(NativeHostApiResponsePayload::QuickJsNamespace(released))
        }
        NativeHostApiRequest::ReleaseQuickJsPackageNamespaces(request) => {
            let released = registry.release_package(&request.package_id);
            quickjs.release_module_namespaces(&released);
            NativeHostApiResponse::success(NativeHostApiResponsePayload::QuickJsNamespaces(
                released,
            ))
        }
        NativeHostApiRequest::GetQuickJsNamespaceSummary => NativeHostApiResponse::success(
            NativeHostApiResponsePayload::QuickJsNamespaceSummary(registry.summary()),
        ),
        NativeHostApiRequest::GetQuickJsPackageNamespaceSummary(request) => {
            NativeHostApiResponse::success(NativeHostApiResponsePayload::QuickJsNamespaceSummary(
                registry.package_summary(&request.package_id),
            ))
        }
        NativeHostApiRequest::EmitRendererIntent(event) => host
            .emit_renderer_intent(event)
            .map(|_| NativeHostApiResponse::empty())
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
    }
}

#[cfg(test)]
mod tests;
