use quajs_native_runtime::NativeHostApi;
use quajs_wgpu_renderer::audio::NativeAudioBackend;
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};

use crate::texture_sync::{
    render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown,
    NativeTextureBundleMountRegistry, NativeTextureJsonLifecycleFrameError,
    NativeTextureLifecycleSyncedFrameResult, NativeTextureUploadSink,
};

#[derive(Debug, Default)]
pub(crate) struct NativeProductLoop {
    texture_bundle_registry: NativeTextureBundleMountRegistry,
    rendered_frame_count: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct NativeProductLoopFrameResult {
    pub(crate) frame_number: usize,
    pub(crate) synced_frame: NativeTextureLifecycleSyncedFrameResult,
}

impl NativeProductLoop {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn rendered_frame_count(&self) -> usize {
        self.rendered_frame_count
    }

    pub(crate) fn render_projection_json_with_audio_teardown<B, A, H>(
        &mut self,
        renderer: &mut NativeRenderer<B, A>,
        host: &H,
        input: &str,
    ) -> Result<NativeProductLoopFrameResult, NativeTextureJsonLifecycleFrameError>
    where
        B: NativeRenderBackend + NativeTextureUploadSink,
        A: NativeAudioBackend,
        H: NativeHostApi,
    {
        let synced_frame = render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown(
            &mut self.texture_bundle_registry,
            renderer,
            host,
            input,
        )?;
        self.rendered_frame_count = self.rendered_frame_count.saturating_add(1);

        Ok(NativeProductLoopFrameResult {
            frame_number: self.rendered_frame_count,
            synced_frame,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use quajs_native_runtime::{
        NativeAssetReadRequest, NativeHostApiError, NativeHostApiResult, NativeHostInfo,
        NativeHostInfoBuilder, NativeMountedBundleInfo, NativePlatform, NativeProfile,
        NativeRendererIntent, NativeSignatureVerifyRequest,
    };
    use quajs_wgpu_renderer::renderer::{
        NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
    };
    use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, ResourceId};

    use super::*;

    const EMPTY_FRAME_JSON: &str = r#"{
      "layout": { "preset": "landscape" },
      "container": { "width": 1600, "height": 1000 },
      "view": {}
    }"#;

    #[test]
    fn successful_projection_frames_advance_the_product_loop_counter() {
        let host = ProductLoopHost::default().with_bundle("base-bundle", Some("base"));
        let mut renderer = NativeRenderer::with_null_audio_backend(ProductLoopBackend::default());
        let mut product_loop = NativeProductLoop::new();

        let first = product_loop
            .render_projection_json_with_audio_teardown(&mut renderer, &host, EMPTY_FRAME_JSON)
            .expect("first projection frame should render");
        let second = product_loop
            .render_projection_json_with_audio_teardown(&mut renderer, &host, EMPTY_FRAME_JSON)
            .expect("second projection frame should render");

        assert_eq!(first.frame_number, 1);
        assert_eq!(second.frame_number, 2);
        assert_eq!(product_loop.rendered_frame_count(), 2);
        assert_eq!(renderer.backend().submissions.len(), 2);
        assert!(first.synced_frame.bundle_lifecycle_report.initial_sync);
        assert!(!second.synced_frame.bundle_lifecycle_report.initial_sync);
        assert_eq!(host.list_calls.get(), 2);
    }

    #[test]
    fn invalid_projection_json_does_not_advance_the_product_loop_counter() {
        let host = ProductLoopHost::default();
        let mut renderer = NativeRenderer::with_null_audio_backend(ProductLoopBackend::default());
        let mut product_loop = NativeProductLoop::new();

        let error = product_loop
            .render_projection_json_with_audio_teardown(&mut renderer, &host, "{}")
            .expect_err("missing view projection should fail before lifecycle sync");

        assert!(error
            .to_string()
            .contains("Invalid native renderer frame JSON"));
        assert_eq!(product_loop.rendered_frame_count(), 0);
        assert_eq!(renderer.backend().submissions.len(), 0);
        assert_eq!(host.list_calls.get(), 0);
    }

    #[test]
    fn failed_lifecycle_sync_does_not_advance_the_product_loop_counter() {
        let host = ProductLoopHost::default().with_list_error();
        let mut renderer = NativeRenderer::with_null_audio_backend(ProductLoopBackend::default());
        let mut product_loop = NativeProductLoop::new();

        let error = product_loop
            .render_projection_json_with_audio_teardown(&mut renderer, &host, EMPTY_FRAME_JSON)
            .expect_err("host lifecycle sync failure should fail the product frame");

        assert!(error
            .to_string()
            .contains("Native texture bundle lifecycle host sync failed"));
        assert_eq!(product_loop.rendered_frame_count(), 0);
        assert_eq!(renderer.backend().submissions.len(), 1);
        assert_eq!(host.list_calls.get(), 1);
    }

    #[derive(Default)]
    struct ProductLoopBackend {
        submissions: Vec<NativeRenderSubmission>,
    }

    impl NativeRenderBackend for ProductLoopBackend {
        fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
            let submission = frame.submission();
            self.submissions.push(submission.clone());
            Ok(submission)
        }
    }

    impl NativeTextureUploadSink for ProductLoopBackend {
        type Error = String;

        fn upload_texture_bytes(
            &mut self,
            _request: &NativeTextureUploadRequest,
            _bytes: &[u8],
            _metadata: crate::texture_sync::NativeTextureUploadMetadata,
        ) -> Result<(), Self::Error> {
            Ok(())
        }

        fn release_texture_resource(
            &mut self,
            _resource_id: &ResourceId,
        ) -> Result<bool, Self::Error> {
            Ok(false)
        }
    }

    #[derive(Default)]
    struct ProductLoopHost {
        bundles: Vec<NativeMountedBundleInfo>,
        list_error: bool,
        list_calls: Cell<usize>,
    }

    impl ProductLoopHost {
        fn with_bundle(mut self, name: &str, runtime_package_id: Option<&str>) -> Self {
            self.bundles.push(NativeMountedBundleInfo {
                name: name.to_string(),
                logical_name: None,
                version: Some(1),
                hash: None,
                runtime_package_id: runtime_package_id.map(ToString::to_string),
            });
            self
        }

        fn with_list_error(mut self) -> Self {
            self.list_error = true;
            self
        }
    }

    impl NativeHostApi for ProductLoopHost {
        fn host_info(&self) -> NativeHostInfo {
            NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
                .app_version("1.0.0")
                .build_number("100")
                .profile(NativeProfile::Debug)
                .platform(NativePlatform::MacOs)
                .arch("arm64")
                .build()
        }

        fn read_asset_bytes(
            &self,
            request: &NativeAssetReadRequest,
        ) -> NativeHostApiResult<Vec<u8>> {
            Err(NativeHostApiError::AssetNotFound(request.url.clone()))
        }

        fn list_mounted_bundles(&self) -> NativeHostApiResult<Vec<NativeMountedBundleInfo>> {
            self.list_calls.set(self.list_calls.get() + 1);
            if self.list_error {
                return Err(NativeHostApiError::UnsupportedOperation(
                    "bundle listing unavailable".to_string(),
                ));
            }
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

        fn emit_renderer_intent(
            &mut self,
            _event: NativeRendererIntent,
        ) -> NativeHostApiResult<()> {
            Ok(())
        }
    }
}
