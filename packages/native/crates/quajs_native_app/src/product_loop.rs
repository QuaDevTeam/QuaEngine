use quajs_native_runtime::NativeHostApi;
use quajs_wgpu_renderer::audio::NativeAudioBackend;
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};
use quajs_wgpu_renderer::video::NativeVideoBackend;

use crate::texture_sync::{
    clear_renderer_with_host_texture_cleanup_and_audio_teardown,
    render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown,
    sync_mounted_texture_bundle_lifecycle_from_host_and_audio_teardown,
    NativeTextureBundleLifecycleSyncError, NativeTextureBundleLifecycleSyncReport,
    NativeTextureBundleMountRegistry, NativeTextureCleanedClearResult,
    NativeTextureJsonLifecycleFrameError, NativeTextureLifecycleSyncedFrameResult,
    NativeTextureMediaTeardownError, NativeTextureUploadSink,
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

    pub(crate) fn render_projection_json_with_audio_teardown<B, A, V, H>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V>,
        host: &H,
        input: &str,
    ) -> Result<NativeProductLoopFrameResult, NativeTextureJsonLifecycleFrameError>
    where
        B: NativeRenderBackend + NativeTextureUploadSink,
        A: NativeAudioBackend,
        V: NativeVideoBackend,
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
    pub(crate) fn tick_host_lifecycle_with_audio_teardown<B, A, V, H>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V>,
        host: &H,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeTextureBundleLifecycleSyncError>
    where
        B: NativeRenderBackend + NativeTextureUploadSink,
        A: NativeAudioBackend,
        V: NativeVideoBackend,
        H: NativeHostApi,
    {
        sync_mounted_texture_bundle_lifecycle_from_host_and_audio_teardown(
            &mut self.texture_bundle_registry,
            renderer,
            host,
        )
    }

    #[allow(dead_code)]
    pub(crate) fn shutdown_with_audio_teardown<B, A, V>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V>,
    ) -> Result<NativeTextureCleanedClearResult, NativeTextureMediaTeardownError>
    where
        B: NativeRenderBackend + NativeTextureUploadSink,
        A: NativeAudioBackend,
        V: NativeVideoBackend,
    {
        let result = clear_renderer_with_host_texture_cleanup_and_audio_teardown(renderer)?;
        self.texture_bundle_registry = NativeTextureBundleMountRegistry::new();
        Ok(result)
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
    use quajs_wgpu_renderer::audio::{
        AudioBackendCommandPlan, NativeAudioBackendError, NativeAudioBackendResult,
        NullNativeAudioBackend,
    };
    use quajs_wgpu_renderer::projection::audio::{
        AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackProjection,
    };
    use quajs_wgpu_renderer::projection::common::PackageProvenance;
    use quajs_wgpu_renderer::projection::view::ViewProjection;
    use quajs_wgpu_renderer::renderer::{
        NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
    };
    use quajs_wgpu_renderer::resources::{
        NativeResourceKind, NativeResourceRecord, NativeTextureUploadRequest, ResourceId,
    };
    use quajs_wgpu_renderer::stage_layout::{
        resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
        ViewLayoutOrientation,
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

    #[test]
    fn shutdown_with_audio_teardown_clears_renderer_and_resets_bundle_registry() {
        let mounted_host =
            ProductLoopHost::default().with_bundle("runtime-bundle", Some("runtime.menu"));
        let empty_host = ProductLoopHost::default();
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
        let shutdown = product_loop
            .shutdown_with_audio_teardown(&mut renderer)
            .expect("shutdown should tear down renderer resources");
        let after_shutdown = product_loop
            .tick_host_lifecycle_with_audio_teardown(&mut renderer, &empty_host)
            .expect("post-shutdown lifecycle tick should start from a fresh registry");

        assert!(baseline.initial_sync);
        assert_eq!(baseline.tracked_package_ids, vec!["runtime.menu"]);
        assert_eq!(shutdown.released_resources.len(), 1);
        assert_eq!(shutdown.host_cleanup.len(), 1);
        assert_eq!(shutdown.texture_cleanup_report.released_count, 1);
        assert_eq!(
            shutdown.texture_cleanup_report.released_resource_ids,
            vec![ResourceId::from("images:runtime-menu.png")]
        );
        assert!(renderer.resources().is_empty());
        assert!(renderer.backend().resident_resource_ids.is_empty());
        assert_eq!(
            renderer.backend().released_resource_ids,
            vec![ResourceId::from("images:runtime-menu.png")]
        );
        assert_eq!(product_loop.rendered_frame_count(), 0);
        assert!(after_shutdown.initial_sync);
        assert!(after_shutdown.removed_package_ids.is_empty());
        assert!(after_shutdown.tracked_package_ids.is_empty());
        assert_eq!(mounted_host.list_calls.get(), 1);
        assert_eq!(empty_host.list_calls.get(), 1);
    }

    #[test]
    fn shutdown_audio_failure_preserves_renderer_and_bundle_registry_for_retry() {
        let mounted_host =
            ProductLoopHost::default().with_bundle("runtime-bundle", Some("runtime.menu"));
        let empty_host = ProductLoopHost::default();
        let mut renderer = NativeRenderer::with_audio_backend(
            ProductLoopBackend {
                resident_resource_ids: vec!["images:runtime-menu.png".to_string()],
                ..Default::default()
            },
            NullNativeAudioBackend::new(),
        );
        renderer
            .prepare_frame_and_apply_audio(test_layout(), &view_with_audio_package("runtime.menu"))
            .expect("audio frame should seed backend tracks");
        let (state, backend, _) = renderer.into_parts_with_audio();
        let mut renderer =
            NativeRenderer::with_state_and_audio_backend(state, backend, RejectingAudioBackend);
        renderer.state_mut().resources_mut().insert(
            NativeResourceRecord::new("images:runtime-menu.png", NativeResourceKind::Texture)
                .owned_by("runtime.menu"),
        );
        let mut product_loop = NativeProductLoop::new();

        product_loop
            .tick_host_lifecycle_with_audio_teardown(&mut renderer, &mounted_host)
            .expect("initial lifecycle tick should establish mounted package baseline");
        let error = product_loop
            .shutdown_with_audio_teardown(&mut renderer)
            .expect_err("audio teardown failure should abort shutdown before clearing renderer");
        let retry = product_loop
            .tick_host_lifecycle_with_audio_teardown(&mut renderer, &empty_host)
            .expect("preserved lifecycle baseline should let the next tick retry release");

        assert_eq!(
            error,
            NativeTextureMediaTeardownError::Audio(NativeAudioBackendError::backend_rejected(
                "test audio backend rejected plan"
            ))
        );
        assert_eq!(retry.release_attempt_count, 1);
        assert_eq!(retry.removed_package_ids, vec!["runtime.menu"]);
        assert_eq!(retry.blocked_package_ids, vec!["runtime.menu"]);
        assert_eq!(retry.tracked_package_ids, vec!["runtime.menu"]);
        assert!(retry.released_package_ids.is_empty());
        assert!(renderer
            .resources()
            .get(ResourceId::from("images:runtime-menu.png"))
            .is_some());
        assert!(renderer
            .resources()
            .get(ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"))
            .is_some());
        assert!(renderer
            .state()
            .audio_backend_tracks()
            .contains_key("bgm-main"));
        assert_eq!(
            renderer.backend().resident_resource_ids,
            vec!["images:runtime-menu.png"]
        );
        assert!(renderer.backend().released_resource_ids.is_empty());
        assert!(product_loop.texture_bundle_registry.is_initialized());
        assert_eq!(
            product_loop.texture_bundle_registry.tracked_package_ids(),
            vec!["runtime.menu"]
        );
        assert_eq!(product_loop.rendered_frame_count(), 0);
        assert_eq!(mounted_host.list_calls.get(), 1);
        assert_eq!(empty_host.list_calls.get(), 1);
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

    struct RejectingAudioBackend;

    impl NativeAudioBackend for RejectingAudioBackend {
        fn apply_audio_commands(
            &mut self,
            _plan: &AudioBackendCommandPlan,
        ) -> NativeAudioBackendResult {
            Err(NativeAudioBackendError::backend_rejected(
                "test audio backend rejected plan",
            ))
        }
    }

    fn test_layout() -> ResolvedStageLayout {
        resolve_stage_layout(
            Some(ViewLayoutInput {
                preset: Some(ViewLayoutOrientation::Landscape),
                ..Default::default()
            }),
            StageContainerInput {
                width: Some(1600.0),
                height: Some(1000.0),
                ..Default::default()
            },
        )
    }

    fn view_with_audio_package(package_id: &str) -> ViewProjection {
        ViewProjection {
            audio: Some(AudioProjection::new(vec![AudioTrackProjection::new(
                "bgm-main",
                AudioTrackKind::Bgm,
                "music/opening.ogg",
            )
            .memory(AudioTrackMemoryEstimate {
                buffer_cpu_bytes: 2048,
                stream_cpu_bytes: 0,
                handle_cpu_bytes: 64,
            })
            .with_provenance(PackageProvenance {
                content_package_id: Some(package_id.to_string()),
                required_runtime_packages: Default::default(),
            })])),
            ..Default::default()
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
