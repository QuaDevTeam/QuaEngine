use quajs_native_runtime::NativeHostApi;
use quajs_wgpu_renderer::audio::{NativeAudioBackend, NativeAudioBackendError};
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};

use crate::product_loop::{NativeProductLoop, NativeProductLoopFrameResult};
use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncError, NativeTextureBundleLifecycleSyncReport,
    NativeTextureCleanedClearResult, NativeTextureJsonLifecycleFrameError, NativeTextureUploadSink,
};

#[derive(Debug)]
pub(crate) struct NativeProductRuntime<B, A, H> {
    renderer: NativeRenderer<B, A>,
    host: H,
    product_loop: NativeProductLoop,
}

impl<B, A, H> NativeProductRuntime<B, A, H>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    H: NativeHostApi,
{
    pub(crate) fn new(renderer: NativeRenderer<B, A>, host: H) -> Self {
        Self {
            renderer,
            host,
            product_loop: NativeProductLoop::new(),
        }
    }

    pub(crate) fn rendered_frame_count(&self) -> usize {
        self.product_loop.rendered_frame_count()
    }

    pub(crate) fn renderer(&self) -> &NativeRenderer<B, A> {
        &self.renderer
    }

    pub(crate) fn renderer_mut(&mut self) -> &mut NativeRenderer<B, A> {
        &mut self.renderer
    }

    pub(crate) fn renderer_and_host_mut(&mut self) -> (&mut NativeRenderer<B, A>, &mut H) {
        (&mut self.renderer, &mut self.host)
    }

    #[allow(dead_code)]
    pub(crate) fn host(&self) -> &H {
        &self.host
    }

    pub(crate) fn host_mut(&mut self) -> &mut H {
        &mut self.host
    }

    pub(crate) fn render_projection_json_with_audio_teardown(
        &mut self,
        input: &str,
    ) -> Result<NativeProductLoopFrameResult, NativeTextureJsonLifecycleFrameError> {
        self.product_loop
            .render_projection_json_with_audio_teardown(&mut self.renderer, &self.host, input)
    }

    #[allow(dead_code)]
    pub(crate) fn tick_host_lifecycle_with_audio_teardown(
        &mut self,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeTextureBundleLifecycleSyncError> {
        self.product_loop
            .tick_host_lifecycle_with_audio_teardown(&mut self.renderer, &self.host)
    }

    pub(crate) fn shutdown_with_audio_teardown(
        &mut self,
    ) -> Result<NativeTextureCleanedClearResult, NativeAudioBackendError> {
        self.product_loop
            .shutdown_with_audio_teardown(&mut self.renderer)
    }

    #[allow(dead_code)]
    pub(crate) fn into_parts(self) -> (NativeRenderer<B, A>, H, NativeProductLoop) {
        (self.renderer, self.host, self.product_loop)
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
    use quajs_wgpu_renderer::resources::{
        NativeResourceKind, NativeResourceRecord, NativeTextureUploadRequest, ResourceId,
    };

    use super::*;

    const EMPTY_FRAME_JSON: &str = r#"{
      "layout": { "preset": "landscape" },
      "container": { "width": 1600, "height": 1000 },
      "view": {}
    }"#;

    #[test]
    fn runtime_owns_renderer_host_and_product_loop_for_projection_frames() {
        let host = RuntimeHost::default().with_bundle("base-bundle", Some("base"));
        let renderer = NativeRenderer::with_null_audio_backend(RuntimeBackend::default());
        let mut runtime = NativeProductRuntime::new(renderer, host);

        let first = runtime
            .render_projection_json_with_audio_teardown(EMPTY_FRAME_JSON)
            .expect("first product runtime frame should render");
        let second = runtime
            .render_projection_json_with_audio_teardown(EMPTY_FRAME_JSON)
            .expect("second product runtime frame should render");

        assert_eq!(first.frame_number, 1);
        assert_eq!(second.frame_number, 2);
        assert_eq!(runtime.rendered_frame_count(), 2);
        assert_eq!(runtime.renderer().backend().submissions.len(), 2);
        assert_eq!(runtime.host().list_calls.get(), 2);
    }

    #[test]
    fn runtime_lifecycle_tick_releases_unmounted_package_resources_without_rendering() {
        let host = RuntimeHost::default().with_bundle("runtime-bundle", Some("runtime.menu"));
        let renderer = NativeRenderer::with_null_audio_backend(RuntimeBackend {
            resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
            ..Default::default()
        });
        let mut runtime = NativeProductRuntime::new(renderer, host);
        runtime.renderer_mut().state_mut().resources_mut().insert(
            NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
                .owned_by("runtime.menu"),
        );

        let baseline = runtime
            .tick_host_lifecycle_with_audio_teardown()
            .expect("initial lifecycle tick should establish mounted package baseline");
        runtime.host_mut().bundles.clear();
        let release = runtime
            .tick_host_lifecycle_with_audio_teardown()
            .expect("second lifecycle tick should release removed package resources");

        assert!(baseline.initial_sync);
        assert_eq!(baseline.tracked_package_ids, vec!["runtime.menu"]);
        assert!(!release.initial_sync);
        assert_eq!(release.removed_package_ids, vec!["runtime.menu"]);
        assert_eq!(release.released_package_ids, vec!["runtime.menu"]);
        assert_eq!(runtime.rendered_frame_count(), 0);
        assert!(runtime.renderer().backend().submissions.is_empty());
        assert!(runtime.renderer().resources().is_empty());
        assert!(runtime
            .renderer()
            .backend()
            .resident_resource_ids
            .is_empty());
        assert_eq!(
            runtime.renderer().backend().released_resource_ids,
            vec![ResourceId::from("images:runtime-menu.png")]
        );
        assert_eq!(runtime.host().list_calls.get(), 2);
    }

    #[test]
    fn runtime_shutdown_clears_renderer_and_resets_lifecycle_baseline() {
        let host = RuntimeHost::default().with_bundle("runtime-bundle", Some("runtime.menu"));
        let renderer = NativeRenderer::with_null_audio_backend(RuntimeBackend {
            resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
            ..Default::default()
        });
        let mut runtime = NativeProductRuntime::new(renderer, host);
        runtime.renderer_mut().state_mut().resources_mut().insert(
            NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
                .owned_by("runtime.menu"),
        );

        let baseline = runtime
            .tick_host_lifecycle_with_audio_teardown()
            .expect("initial lifecycle tick should establish mounted package baseline");
        let shutdown = runtime
            .shutdown_with_audio_teardown()
            .expect("shutdown should clear renderer resources");
        runtime.host_mut().bundles.clear();
        let after_shutdown = runtime
            .tick_host_lifecycle_with_audio_teardown()
            .expect("post-shutdown lifecycle tick should start from a fresh baseline");

        assert!(baseline.initial_sync);
        assert_eq!(shutdown.released_resources.len(), 1);
        assert_eq!(shutdown.texture_cleanup_report.released_count, 1);
        assert!(runtime.renderer().resources().is_empty());
        assert!(runtime
            .renderer()
            .backend()
            .resident_resource_ids
            .is_empty());
        assert!(after_shutdown.initial_sync);
        assert!(after_shutdown.removed_package_ids.is_empty());
        assert!(after_shutdown.tracked_package_ids.is_empty());
        assert_eq!(runtime.host().list_calls.get(), 2);
    }

    #[derive(Default)]
    struct RuntimeBackend {
        submissions: Vec<NativeRenderSubmission>,
        resident_resource_ids: Vec<String>,
        released_resource_ids: Vec<ResourceId>,
    }

    impl NativeRenderBackend for RuntimeBackend {
        fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
            let submission = frame.submission();
            self.submissions.push(submission.clone());
            Ok(submission)
        }

        fn resident_texture_resource_ids(&self) -> Vec<String> {
            self.resident_resource_ids.clone()
        }
    }

    impl NativeTextureUploadSink for RuntimeBackend {
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
            resource_id: &ResourceId,
        ) -> Result<bool, Self::Error> {
            let before = self.resident_resource_ids.len();
            self.resident_resource_ids
                .retain(|resident| resident != resource_id.as_str());
            if self.resident_resource_ids.len() == before {
                return Ok(false);
            }
            self.released_resource_ids.push(resource_id.clone());
            Ok(true)
        }
    }

    #[derive(Default)]
    struct RuntimeHost {
        bundles: Vec<NativeMountedBundleInfo>,
        list_calls: Cell<usize>,
    }

    impl RuntimeHost {
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
    }

    impl NativeHostApi for RuntimeHost {
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
