use serde::{Deserialize, Serialize};

use super::api::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiErrorInfo, NativeMountedBundleInfo,
    NativeRendererIntent, NativeSignatureVerifyRequest,
};
use super::info::NativeHostInfo;

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
        NativeHostApiRequest::EmitRendererIntent(event) => host
            .emit_renderer_intent(event)
            .map(|_| NativeHostApiResponse::empty())
            .unwrap_or_else(|error| NativeHostApiResponse::error(error.to_info())),
    }
}

#[cfg(test)]
mod tests;
