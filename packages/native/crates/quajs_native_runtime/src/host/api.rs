use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::info::NativeHostInfo;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMountedBundleInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logical_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_package_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAssetReadRequest {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSignatureVerifyRequest {
    pub bytes: Vec<u8>,
    pub signature: Vec<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub algorithm: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererIntent {
    pub r#type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NativeHostApiError {
    AssetNotFound(String),
    StorageKeyNotFound(String),
    UnsupportedOperation(String),
    InvalidRequest(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NativeHostApiErrorCode {
    AssetNotFound,
    StorageKeyNotFound,
    UnsupportedOperation,
    InvalidRequest,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostApiErrorInfo {
    pub code: NativeHostApiErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl NativeHostApiError {
    pub fn code(&self) -> NativeHostApiErrorCode {
        match self {
            NativeHostApiError::AssetNotFound(_) => NativeHostApiErrorCode::AssetNotFound,
            NativeHostApiError::StorageKeyNotFound(_) => NativeHostApiErrorCode::StorageKeyNotFound,
            NativeHostApiError::UnsupportedOperation(_) => {
                NativeHostApiErrorCode::UnsupportedOperation
            }
            NativeHostApiError::InvalidRequest(_) => NativeHostApiErrorCode::InvalidRequest,
        }
    }

    pub fn message(&self) -> String {
        match self {
            NativeHostApiError::AssetNotFound(url) => {
                format!("Native asset \"{}\" was not found.", url)
            }
            NativeHostApiError::StorageKeyNotFound(key) => {
                format!("Native storage key \"{}\" was not found.", key)
            }
            NativeHostApiError::UnsupportedOperation(detail) => {
                format!("Native host operation is unsupported: {}", detail)
            }
            NativeHostApiError::InvalidRequest(detail) => {
                format!("Invalid native host request: {}", detail)
            }
        }
    }

    pub fn to_info(&self) -> NativeHostApiErrorInfo {
        NativeHostApiErrorInfo {
            code: self.code(),
            message: self.message(),
            asset_url: match self {
                NativeHostApiError::AssetNotFound(url) => Some(url.clone()),
                _ => None,
            },
            storage_key: match self {
                NativeHostApiError::StorageKeyNotFound(key) => Some(key.clone()),
                _ => None,
            },
            detail: match self {
                NativeHostApiError::UnsupportedOperation(detail)
                | NativeHostApiError::InvalidRequest(detail) => Some(detail.clone()),
                _ => None,
            },
        }
    }
}

pub type NativeHostApiResult<T> = Result<T, NativeHostApiError>;

pub trait NativeHostApi {
    fn host_info(&self) -> NativeHostInfo;
    fn read_asset_bytes(&self, request: &NativeAssetReadRequest) -> NativeHostApiResult<Vec<u8>>;
    fn list_mounted_bundles(&self) -> NativeHostApiResult<Vec<NativeMountedBundleInfo>>;
    fn read_storage(&self, key: &str) -> NativeHostApiResult<Option<Vec<u8>>>;
    fn write_storage(&mut self, key: &str, value: Vec<u8>) -> NativeHostApiResult<()>;
    fn delete_storage(&mut self, key: &str) -> NativeHostApiResult<()>;
    fn list_storage_keys(&self, prefix: &str) -> NativeHostApiResult<Vec<String>>;
    fn hash_bytes(&self, bytes: &[u8], algorithm: &str) -> NativeHostApiResult<String>;
    fn verify_signature(&self, request: &NativeSignatureVerifyRequest)
        -> NativeHostApiResult<bool>;
    fn emit_renderer_intent(&mut self, event: NativeRendererIntent) -> NativeHostApiResult<()>;
    fn drain_renderer_intents(&mut self) -> NativeHostApiResult<Vec<NativeRendererIntent>>;
}

#[derive(Debug, Clone)]
pub struct InMemoryNativeHostApi {
    host_info: NativeHostInfo,
    assets: BTreeMap<String, Vec<u8>>,
    mounted_bundles: Vec<NativeMountedBundleInfo>,
    storage: BTreeMap<String, Vec<u8>>,
    renderer_intents: Vec<NativeRendererIntent>,
}

impl InMemoryNativeHostApi {
    pub fn new(host_info: NativeHostInfo) -> Self {
        Self {
            host_info,
            assets: BTreeMap::new(),
            mounted_bundles: Vec::new(),
            storage: BTreeMap::new(),
            renderer_intents: Vec::new(),
        }
    }

    pub fn with_asset(mut self, url: impl Into<String>, bytes: impl Into<Vec<u8>>) -> Self {
        self.assets.insert(url.into(), bytes.into());
        self
    }

    pub fn with_mounted_bundle(mut self, bundle: NativeMountedBundleInfo) -> Self {
        self.mounted_bundles.push(bundle);
        self
    }

    pub fn renderer_intents(&self) -> &[NativeRendererIntent] {
        &self.renderer_intents
    }
}

impl NativeHostApi for InMemoryNativeHostApi {
    fn host_info(&self) -> NativeHostInfo {
        self.host_info.clone()
    }

    fn read_asset_bytes(&self, request: &NativeAssetReadRequest) -> NativeHostApiResult<Vec<u8>> {
        self.assets
            .get(&request.url)
            .cloned()
            .ok_or_else(|| NativeHostApiError::AssetNotFound(request.url.clone()))
    }

    fn list_mounted_bundles(&self) -> NativeHostApiResult<Vec<NativeMountedBundleInfo>> {
        Ok(self.mounted_bundles.clone())
    }

    fn read_storage(&self, key: &str) -> NativeHostApiResult<Option<Vec<u8>>> {
        Ok(self.storage.get(key).cloned())
    }

    fn write_storage(&mut self, key: &str, value: Vec<u8>) -> NativeHostApiResult<()> {
        if key.trim().is_empty() {
            return Err(NativeHostApiError::InvalidRequest(
                "Native storage key must not be empty.".to_string(),
            ));
        }
        self.storage.insert(key.to_string(), value);
        Ok(())
    }

    fn delete_storage(&mut self, key: &str) -> NativeHostApiResult<()> {
        self.storage.remove(key);
        Ok(())
    }

    fn list_storage_keys(&self, prefix: &str) -> NativeHostApiResult<Vec<String>> {
        Ok(self
            .storage
            .keys()
            .filter(|key| key.starts_with(prefix))
            .cloned()
            .collect())
    }

    fn hash_bytes(&self, _bytes: &[u8], algorithm: &str) -> NativeHostApiResult<String> {
        Err(NativeHostApiError::UnsupportedOperation(format!(
            "Native host hash algorithm \"{}\" is not wired in this host implementation.",
            algorithm
        )))
    }

    fn verify_signature(
        &self,
        _request: &NativeSignatureVerifyRequest,
    ) -> NativeHostApiResult<bool> {
        Err(NativeHostApiError::UnsupportedOperation(
            "Native host signature verification is not wired in this host implementation."
                .to_string(),
        ))
    }

    fn emit_renderer_intent(&mut self, event: NativeRendererIntent) -> NativeHostApiResult<()> {
        self.renderer_intents.push(event);
        Ok(())
    }

    fn drain_renderer_intents(&mut self) -> NativeHostApiResult<Vec<NativeRendererIntent>> {
        Ok(std::mem::take(&mut self.renderer_intents))
    }
}

#[cfg(test)]
mod tests;
