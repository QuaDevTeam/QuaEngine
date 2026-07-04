use std::cell::RefCell;
use std::collections::BTreeMap;

use quajs_native_runtime::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiError, NativeHostApiResult, NativeHostInfo,
    NativeHostInfoBuilder, NativeMountedBundleInfo, NativePlatform, NativeProfile,
    NativeRendererIntent, NativeSignatureVerifyRequest,
};

#[derive(Default)]
pub(crate) struct RecordingAssetHost {
    assets: BTreeMap<(Option<String>, String), Vec<u8>>,
    read_errors: BTreeMap<(Option<String>, String), NativeHostApiError>,
    bundles: Vec<NativeMountedBundleInfo>,
    pub(crate) reads: RefCell<Vec<NativeAssetReadRequest>>,
}

impl RecordingAssetHost {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn with_bundle(mut self, bundle: NativeMountedBundleInfo) -> Self {
        self.bundles.push(bundle);
        self
    }

    pub(crate) fn with_asset<const N: usize>(
        mut self,
        bundle_name: Option<&str>,
        url: &str,
        bytes: [u8; N],
    ) -> Self {
        self.assets.insert(
            (bundle_name.map(ToString::to_string), url.to_string()),
            bytes.into(),
        );
        self
    }

    pub(crate) fn with_read_error(
        mut self,
        bundle_name: Option<&str>,
        url: &str,
        error: NativeHostApiError,
    ) -> Self {
        self.read_errors.insert(
            (bundle_name.map(ToString::to_string), url.to_string()),
            error,
        );
        self
    }
}

impl NativeHostApi for RecordingAssetHost {
    fn host_info(&self) -> NativeHostInfo {
        NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
            .app_version("1.0.0")
            .build_number("100")
            .profile(NativeProfile::Debug)
            .platform(NativePlatform::MacOs)
            .arch("arm64")
            .build()
    }

    fn read_asset_bytes(&self, request: &NativeAssetReadRequest) -> NativeHostApiResult<Vec<u8>> {
        self.reads.borrow_mut().push(request.clone());
        if let Some(error) = self
            .read_errors
            .get(&(request.bundle_name.clone(), request.url.clone()))
        {
            return Err(error.clone());
        }
        self.assets
            .get(&(request.bundle_name.clone(), request.url.clone()))
            .cloned()
            .ok_or_else(|| NativeHostApiError::AssetNotFound(request.url.clone()))
    }

    fn list_mounted_bundles(&self) -> NativeHostApiResult<Vec<NativeMountedBundleInfo>> {
        Ok(self.bundles.clone())
    }

    fn read_storage(&self, _key: &str) -> NativeHostApiResult<Option<Vec<u8>>> {
        Ok(None)
    }

    fn write_storage(&mut self, _key: &str, _value: Vec<u8>) -> NativeHostApiResult<()> {
        Ok(())
    }

    fn delete_storage(&mut self, _key: &str) -> NativeHostApiResult<()> {
        Ok(())
    }

    fn list_storage_keys(&self, _prefix: &str) -> NativeHostApiResult<Vec<String>> {
        Ok(Vec::new())
    }

    fn hash_bytes(&self, _bytes: &[u8], _algorithm: &str) -> NativeHostApiResult<String> {
        Err(NativeHostApiError::UnsupportedOperation(
            "hash not implemented".to_string(),
        ))
    }

    fn verify_signature(
        &self,
        _request: &NativeSignatureVerifyRequest,
    ) -> NativeHostApiResult<bool> {
        Err(NativeHostApiError::UnsupportedOperation(
            "signature verification not implemented".to_string(),
        ))
    }

    fn emit_renderer_intent(&mut self, _event: NativeRendererIntent) -> NativeHostApiResult<()> {
        Ok(())
    }
}
