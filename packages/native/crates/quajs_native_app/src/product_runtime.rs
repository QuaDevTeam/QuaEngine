use quajs_native_runtime::{NativeHostApi, NativeHostApiError, NativeRendererIntent};
use quajs_wgpu_renderer::audio::{
    NativeAudioBackend, NativeAudioBackendError, NativeAudioBackendEvent,
};
use quajs_wgpu_renderer::fonts::NativeFontBackend;
use quajs_wgpu_renderer::projection::audio::{AudioTrackKind, AudioTrackLoadMode};
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};
use quajs_wgpu_renderer::video::NativeVideoBackend;

use crate::product_loop::{NativeProductLoop, NativeProductLoopFrameResult};
use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncError, NativeTextureBundleLifecycleSyncReport,
    NativeTextureCleanedClearResult, NativeTextureJsonLifecycleFrameError,
    NativeTextureMediaTeardownError, NativeTextureUploadSink,
};

#[derive(Debug)]
pub(crate) struct NativeProductRuntime<B, A, H, V = (), F = ()> {
    renderer: NativeRenderer<B, A, V, F>,
    host: H,
    product_loop: NativeProductLoop,
}

impl<B, A, H, V, F> NativeProductRuntime<B, A, H, V, F>
where
    B: NativeRenderBackend + NativeTextureUploadSink,
    A: NativeAudioBackend,
    V: NativeVideoBackend,
    F: NativeFontBackend,
    H: NativeHostApi,
{
    pub(crate) fn new(renderer: NativeRenderer<B, A, V, F>, host: H) -> Self {
        Self {
            renderer,
            host,
            product_loop: NativeProductLoop::new(),
        }
    }

    pub(crate) fn rendered_frame_count(&self) -> usize {
        self.product_loop.rendered_frame_count()
    }

    pub(crate) fn renderer(&self) -> &NativeRenderer<B, A, V, F> {
        &self.renderer
    }

    pub(crate) fn renderer_mut(&mut self) -> &mut NativeRenderer<B, A, V, F> {
        &mut self.renderer
    }

    #[cfg_attr(not(feature = "native-window"), allow(dead_code))]
    pub(crate) fn renderer_and_host_mut(&mut self) -> (&mut NativeRenderer<B, A, V, F>, &mut H) {
        (&mut self.renderer, &mut self.host)
    }

    #[allow(dead_code)]
    pub(crate) fn host(&self) -> &H {
        &self.host
    }

    pub(crate) fn host_mut(&mut self) -> &mut H {
        &mut self.host
    }

    pub(crate) fn render_projection_json_with_media_teardown(
        &mut self,
        input: &str,
    ) -> Result<NativeProductLoopFrameResult, NativeTextureJsonLifecycleFrameError> {
        let result = self
            .product_loop
            .render_projection_json_with_media_teardown(&mut self.renderer, &self.host, input)?;
        self.emit_audio_backend_renderer_intents()
            .map_err(native_audio_intent_error_to_json_frame_error)?;
        Ok(result)
    }

    #[allow(dead_code)]
    pub(crate) fn tick_host_lifecycle_with_media_teardown(
        &mut self,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeTextureBundleLifecycleSyncError> {
        let report = self
            .product_loop
            .tick_host_lifecycle_with_media_teardown(&mut self.renderer, &self.host)?;
        self.emit_audio_backend_renderer_intents()
            .map_err(native_audio_intent_error_to_lifecycle_error)?;
        Ok(report)
    }

    pub(crate) fn shutdown_with_media_teardown(
        &mut self,
    ) -> Result<NativeTextureCleanedClearResult, NativeTextureMediaTeardownError> {
        self.product_loop
            .shutdown_with_media_teardown(&mut self.renderer)
    }

    #[allow(dead_code)]
    pub(crate) fn into_parts(self) -> (NativeRenderer<B, A, V, F>, H, NativeProductLoop) {
        (self.renderer, self.host, self.product_loop)
    }

    fn emit_audio_backend_renderer_intents(
        &mut self,
    ) -> Result<usize, NativeProductAudioIntentError> {
        let Some(audio_backend) = self.renderer.audio_backend_mut() else {
            return Ok(0);
        };
        let events = audio_backend.drain_audio_events()?;
        let mut emitted_count = 0;
        for event in events {
            let intent = native_audio_backend_event_to_renderer_intent(event)?;
            self.host.emit_renderer_intent(intent)?;
            emitted_count += 1;
        }
        Ok(emitted_count)
    }
}

#[derive(Debug)]
enum NativeProductAudioIntentError {
    Audio(NativeAudioBackendError),
    Host(NativeHostApiError),
}

impl From<NativeAudioBackendError> for NativeProductAudioIntentError {
    fn from(error: NativeAudioBackendError) -> Self {
        Self::Audio(error)
    }
}

impl From<NativeHostApiError> for NativeProductAudioIntentError {
    fn from(error: NativeHostApiError) -> Self {
        Self::Host(error)
    }
}

fn native_audio_intent_error_to_json_frame_error(
    error: NativeProductAudioIntentError,
) -> NativeTextureJsonLifecycleFrameError {
    match error {
        NativeProductAudioIntentError::Audio(error) => {
            NativeTextureJsonLifecycleFrameError::Audio(error)
        }
        NativeProductAudioIntentError::Host(error) => {
            NativeTextureJsonLifecycleFrameError::Host(error)
        }
    }
}

fn native_audio_intent_error_to_lifecycle_error(
    error: NativeProductAudioIntentError,
) -> NativeTextureBundleLifecycleSyncError {
    match error {
        NativeProductAudioIntentError::Audio(error) => {
            NativeTextureBundleLifecycleSyncError::Audio(error)
        }
        NativeProductAudioIntentError::Host(error) => {
            NativeTextureBundleLifecycleSyncError::Host(error)
        }
    }
}

fn native_audio_backend_event_to_renderer_intent(
    event: NativeAudioBackendEvent,
) -> Result<NativeRendererIntent, NativeAudioBackendError> {
    match event {
        NativeAudioBackendEvent::TrackEnded { track, reason } => {
            let payload = serde_json::json!({
                "channel": audio_track_kind_label(track.kind),
                "id": track.id,
                "assetKey": track.asset_name,
                "reason": reason,
                "metadata": {
                    "assetType": track.asset_type,
                    "loadMode": audio_track_load_mode_label(track.load_mode),
                    "packageCandidates": track.package_candidates.into_iter().collect::<Vec<_>>(),
                },
            });
            Ok(NativeRendererIntent {
                r#type: "audio/ended".to_string(),
                payload_json: Some(serde_json::to_string(&payload).map_err(|error| {
                    NativeAudioBackendError::backend_rejected(format!(
                        "native audio ended intent payload serialization failed: {error}"
                    ))
                })?),
            })
        }
    }
}

fn audio_track_kind_label(kind: AudioTrackKind) -> &'static str {
    match kind {
        AudioTrackKind::Bgm => "bgm",
        AudioTrackKind::Voice => "voice",
        AudioTrackKind::Sfx => "sfx",
        AudioTrackKind::Ambient => "ambient",
    }
}

fn audio_track_load_mode_label(load_mode: AudioTrackLoadMode) -> &'static str {
    match load_mode {
        AudioTrackLoadMode::Buffered => "buffered",
        AudioTrackLoadMode::Streamed => "streamed",
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
        AudioBackendCommandPlan, AudioBackendTrackState, NativeAudioBackend,
        NativeAudioBackendEvent, NativeAudioBackendResult,
    };
    use quajs_wgpu_renderer::projection::audio::{
        AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState,
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
            .render_projection_json_with_media_teardown(EMPTY_FRAME_JSON)
            .expect("first product runtime frame should render");
        let second = runtime
            .render_projection_json_with_media_teardown(EMPTY_FRAME_JSON)
            .expect("second product runtime frame should render");

        assert_eq!(first.frame_number, 1);
        assert_eq!(second.frame_number, 2);
        assert!(!first.projection_reused);
        assert!(second.projection_reused);
        assert_eq!(runtime.rendered_frame_count(), 2);
        assert_eq!(runtime.renderer().backend().submissions.len(), 2);
        assert_eq!(runtime.host().list_calls.get(), 1);
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
            .tick_host_lifecycle_with_media_teardown()
            .expect("initial lifecycle tick should establish mounted package baseline");
        runtime.host_mut().bundles.clear();
        let release = runtime
            .tick_host_lifecycle_with_media_teardown()
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
    fn runtime_emits_native_audio_backend_events_after_projection_frames() {
        let host = RuntimeHost::default().with_bundle("base-bundle", Some("base"));
        let audio_backend = DrainingAudioBackend::with_ended_track(audio_track(
            "voice-line-1",
            AudioTrackKind::Voice,
            "voice/ch01/line-1.ogg",
        ));
        let renderer = NativeRenderer::with_audio_backend(RuntimeBackend::default(), audio_backend);
        let mut runtime = NativeProductRuntime::new(renderer, host);

        let frame = runtime
            .render_projection_json_with_media_teardown(EMPTY_FRAME_JSON)
            .expect("product runtime frame should render and emit audio intents");
        runtime
            .render_projection_json_with_media_teardown(EMPTY_FRAME_JSON)
            .expect("second product runtime frame should not re-emit drained audio intents");

        assert_eq!(frame.frame_number, 1);
        assert_eq!(runtime.rendered_frame_count(), 2);
        assert_eq!(runtime.host().renderer_intents.len(), 1);
        let intent = &runtime.host().renderer_intents[0];
        assert_eq!(intent.r#type, "audio/ended");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                intent.payload_json.as_deref().expect("audio payload JSON"),
            )
            .expect("audio payload should decode"),
            serde_json::json!({
                "channel": "voice",
                "id": "voice-line-1",
                "assetKey": "voice/ch01/line-1.ogg",
                "reason": "natural",
                "metadata": {
                    "assetType": "voice",
                    "loadMode": "buffered",
                    "packageCandidates": ["runtime.audio"],
                },
            }),
        );
    }

    #[test]
    fn runtime_emits_native_audio_backend_events_after_lifecycle_ticks() {
        let host = RuntimeHost::default().with_bundle("base-bundle", Some("base"));
        let audio_backend = DrainingAudioBackend::with_ended_track(audio_track(
            "sfx-click",
            AudioTrackKind::Sfx,
            "sfx/click.ogg",
        ));
        let renderer = NativeRenderer::with_audio_backend(RuntimeBackend::default(), audio_backend);
        let mut runtime = NativeProductRuntime::new(renderer, host);

        let report = runtime
            .tick_host_lifecycle_with_media_teardown()
            .expect("product runtime lifecycle tick should emit audio intents");

        assert!(report.initial_sync);
        assert_eq!(runtime.rendered_frame_count(), 0);
        assert_eq!(runtime.host().renderer_intents.len(), 1);
        let intent = &runtime.host().renderer_intents[0];
        assert_eq!(intent.r#type, "audio/ended");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                intent.payload_json.as_deref().expect("audio payload JSON"),
            )
            .expect("audio payload should decode")["id"],
            serde_json::json!("sfx-click"),
        );
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
            .tick_host_lifecycle_with_media_teardown()
            .expect("initial lifecycle tick should establish mounted package baseline");
        let shutdown = runtime
            .shutdown_with_media_teardown()
            .expect("shutdown should clear renderer resources");
        runtime.host_mut().bundles.clear();
        let after_shutdown = runtime
            .tick_host_lifecycle_with_media_teardown()
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

        fn upload_decoded_texture_rgba8(
            &mut self,
            resource_id: &ResourceId,
            _width: u32,
            _height: u32,
            _rgba: &[u8],
            _metadata: crate::texture_sync::NativeTextureUploadMetadata,
        ) -> Result<(), Self::Error> {
            self.resident_resource_ids
                .push(resource_id.as_str().to_string());
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
        renderer_intents: Vec<NativeRendererIntent>,
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

        fn emit_renderer_intent(&mut self, event: NativeRendererIntent) -> NativeHostApiResult<()> {
            self.renderer_intents.push(event);
            Ok(())
        }

        fn drain_renderer_intents(&mut self) -> NativeHostApiResult<Vec<NativeRendererIntent>> {
            Ok(std::mem::take(&mut self.renderer_intents))
        }
    }

    #[derive(Default)]
    struct DrainingAudioBackend {
        events: Vec<NativeAudioBackendEvent>,
    }

    impl DrainingAudioBackend {
        fn with_ended_track(track: AudioBackendTrackState) -> Self {
            Self {
                events: vec![NativeAudioBackendEvent::TrackEnded {
                    track,
                    reason: "natural".to_string(),
                }],
            }
        }
    }

    impl NativeAudioBackend for DrainingAudioBackend {
        fn apply_audio_commands(
            &mut self,
            _plan: &AudioBackendCommandPlan,
        ) -> NativeAudioBackendResult {
            Ok(())
        }

        fn drain_audio_events(
            &mut self,
        ) -> quajs_wgpu_renderer::audio::NativeAudioBackendEventDrainResult {
            Ok(std::mem::take(&mut self.events))
        }
    }

    fn audio_track(id: &str, kind: AudioTrackKind, asset_name: &str) -> AudioBackendTrackState {
        AudioBackendTrackState {
            id: id.to_string(),
            kind,
            asset_type: kind.resource_prefix().to_string(),
            asset_name: asset_name.to_string(),
            load_mode: AudioTrackLoadMode::Buffered,
            playback_state: AudioTrackPlaybackState::Playing,
            looped: false,
            volume: 1.0,
            duration_ms: None,
            fade_in_ms: None,
            fade_out_ms: None,
            crossfade_ms: None,
            play_at: None,
            delay_ms: None,
            seek_ms: None,
            offset_ms: None,
            package_candidates: ["runtime.audio"].into_iter().map(String::from).collect(),
            media_resource_id: ResourceId::from(format!(
                "audio:buffer:{}:{}:{asset_name}",
                kind.resource_prefix(),
                kind.resource_prefix(),
            )),
            handle_resource_id: ResourceId::from(format!(
                "audio:handle:{}:{}:{id}",
                kind.resource_prefix(),
                kind.resource_prefix(),
            )),
        }
    }
}
