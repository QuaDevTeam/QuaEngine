use crate::host::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiError, NativeHostApiResult, NativeHostInfo,
    NativeMountedBundleInfo, NativeRendererIntent, NativeSignatureVerifyRequest,
};

use super::QuickJsModuleEvaluator;

pub struct QuickJsRendererIntentHost<H, E> {
    host: H,
    evaluator: E,
}

impl<H, E> QuickJsRendererIntentHost<H, E> {
    pub fn new(host: H, evaluator: E) -> Self {
        Self { host, evaluator }
    }

    pub fn host(&self) -> &H {
        &self.host
    }

    pub fn host_mut(&mut self) -> &mut H {
        &mut self.host
    }

    pub fn evaluator(&self) -> &E {
        &self.evaluator
    }

    pub fn evaluator_mut(&mut self) -> &mut E {
        &mut self.evaluator
    }

    pub fn into_parts(self) -> (H, E) {
        (self.host, self.evaluator)
    }
}

impl<H, E> NativeHostApi for QuickJsRendererIntentHost<H, E>
where
    H: NativeHostApi,
    E: QuickJsModuleEvaluator,
{
    fn host_info(&self) -> NativeHostInfo {
        self.host.host_info()
    }

    fn read_asset_bytes(&self, request: &NativeAssetReadRequest) -> NativeHostApiResult<Vec<u8>> {
        self.host.read_asset_bytes(request)
    }

    fn list_mounted_bundles(&self) -> NativeHostApiResult<Vec<NativeMountedBundleInfo>> {
        self.host.list_mounted_bundles()
    }

    fn read_storage(&self, key: &str) -> NativeHostApiResult<Option<Vec<u8>>> {
        self.host.read_storage(key)
    }

    fn write_storage(&mut self, key: &str, value: Vec<u8>) -> NativeHostApiResult<()> {
        self.host.write_storage(key, value)
    }

    fn delete_storage(&mut self, key: &str) -> NativeHostApiResult<()> {
        self.host.delete_storage(key)
    }

    fn list_storage_keys(&self, prefix: &str) -> NativeHostApiResult<Vec<String>> {
        self.host.list_storage_keys(prefix)
    }

    fn hash_bytes(&self, bytes: &[u8], algorithm: &str) -> NativeHostApiResult<String> {
        self.host.hash_bytes(bytes, algorithm)
    }

    fn verify_signature(
        &self,
        request: &NativeSignatureVerifyRequest,
    ) -> NativeHostApiResult<bool> {
        self.host.verify_signature(request)
    }

    fn emit_renderer_intent(&mut self, event: NativeRendererIntent) -> NativeHostApiResult<()> {
        match self.evaluator.dispatch_renderer_intent(&event) {
            Ok(true) => Ok(()),
            Ok(false) => self.host.emit_renderer_intent(event),
            Err(error) => Err(NativeHostApiError::InvalidRequest(format!(
                "Native renderer QuickJS intent bridge failed: {}",
                error.message
            ))),
        }
    }

    fn drain_renderer_intents(&mut self) -> NativeHostApiResult<Vec<NativeRendererIntent>> {
        self.host.drain_renderer_intents()
    }
}
