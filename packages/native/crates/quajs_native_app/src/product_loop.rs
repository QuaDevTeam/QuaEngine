use quajs_native_runtime::NativeHostApi;
use quajs_wgpu_renderer::audio::NativeAudioBackend;
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};

use crate::texture_sync::{
    render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown,
    sync_mounted_texture_bundle_lifecycle_from_host_and_audio_teardown,
    NativeTextureBundleLifecycleSyncError, NativeTextureBundleLifecycleSyncReport,
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

    #[allow(dead_code)]
    pub(crate) fn tick_host_lifecycle_with_audio_teardown<B, A, H>(
        &mut self,
        renderer: &mut NativeRenderer<B, A>,
        host: &H,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeTextureBundleLifecycleSyncError>
    where
        B: NativeRenderBackend + NativeTextureUploadSink,
        A: NativeAudioBackend,
        H: NativeHostApi,
    {
        sync_mounted_texture_bundle_lifecycle_from_host_and_audio_teardown(
            &mut self.texture_bundle_registry,
            renderer,
            host,
        )
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

    #[test]
    fn lifecycle_tick_syncs_host_mounts_without_rendering_projection_frames() {
        let mounted_host =
            ProductLoopHost::default().with_bundle("runtime-bundle", Some("runtime.menu"));
        let unmounted_host = ProductLoopHost::default();
        let mut renderer = NativeRenderer::with_null_audio_backend(ProductLoopBackend {
            resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
            ..Default::default()
        });
        renderer.state_mut().resources_mut().insert(
            NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
                .owned_by("runtime.menu"),
        );
        let mut product_loop = NativeProductLoop::new();

        let baseline = product_loop
            .tick_host_lifecycle_with_audio_teardown(&mut renderer, &mounted_host)
            .expect("initial lifecycle tick should establish mounted package baseline");
        let release = product_loop
            .tick_host_lifecycle_with_audio_teardown(&mut renderer, &unmounted_host)
            .expect("later lifecycle tick should release unmounted package resources");

        assert!(baseline.initial_sync);
        assert_eq!(baseline.tracked_package_ids, vec!["runtime.menu"]);
        assert!(!release.initial_sync);
        assert_eq!(release.removed_package_ids, vec!["runtime.menu"]);
        assert_eq!(release.released_package_ids, vec!["runtime.menu"]);
        assert_eq!(release.release_attempt_count, 1);
        assert_eq!(release.released_resource_count, 1);
        assert_eq!(product_loop.rendered_frame_count(), 0);
        assert!(renderer.backend().submissions.is_empty());
        assert!(renderer.resources().is_empty());
        assert!(renderer.backend().resident_resource_ids.is_empty());
        assert_eq!(
            renderer.backend().released_resource_ids,
            vec![ResourceId::from("images:runtime-menu.png")]
        );
        assert_eq!(mounted_host.list_calls.get(), 1);
        assert_eq!(unmounted_host.list_calls.get(), 1);
    }

    #[derive(Default)]
    struct ProductLoopBackend {
        submissions: Vec<NativeRenderSubmission>,
        resident_resource_ids: Vec<String>,
        released_resource_ids: Vec<ResourceId>,
    }

    impl NativeRenderBackend for ProductLoopBackend {
        fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
            let submission = frame.submission();
            self.submissions.push(submission.clone());
            Ok(submission)
        }

        fn resident_texture_resource_ids(&self) -> Vec<String> {
            self.resident_resource_ids.clone()
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
