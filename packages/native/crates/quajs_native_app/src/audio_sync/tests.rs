use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};

use quajs_native_runtime::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiError, NativeHostApiResult, NativeHostInfo,
    NativeHostInfoBuilder, NativeMountedBundleInfo, NativePlatform, NativeProfile,
    NativeRendererIntent, NativeSignatureVerifyRequest,
};
use quajs_wgpu_renderer::audio::{
    AudioBackendCommand, AudioBackendCommandKind, AudioBackendCommandPlan, AudioBackendTrackState,
};
use quajs_wgpu_renderer::projection::audio::{
    AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState,
};
use quajs_wgpu_renderer::resources::ResourceId;

use super::{sync_audio_assets_from_host, NativeAudioAssetHostSyncFailureKind};

#[test]
fn loads_unscoped_audio_asset_when_track_has_no_package_candidates() {
    let track = track("bgm-main", "music/opening.ogg", []);
    let host = RecordingAudioHost::new().with_asset(None, "music/opening.ogg", [1, 2, 3]);
    let plan = plan([command(
        AudioBackendCommandKind::LoadAsset,
        Some(track.clone()),
    )]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.command_count, 1);
    assert_eq!(report.load_asset_command_count, 1);
    assert_eq!(report.loaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 1);
    assert_eq!(host.reads.borrow()[0].bundle_name, None);
    assert_eq!(
        host.reads.borrow()[0].asset_id.as_deref(),
        Some(track.media_resource_id.as_str())
    );
    let loaded = &report.loaded_assets[0];
    assert_eq!(loaded.backend_load.track_id, "bgm-main");
    assert_eq!(loaded.backend_load.bytes, vec![1, 2, 3]);
    assert_eq!(loaded.bundle_name, None);
    assert_eq!(loaded.backend_load.package_id, None);
    assert_eq!(loaded.metadata.owner_package_id, None);
    assert!(loaded.metadata.required_package_ids.is_empty());
    assert_eq!(
        report.backend_asset_loads(),
        vec![loaded.backend_load.clone()]
    );
}

#[test]
fn loads_audio_from_quack_qpk_asset_path_after_logical_name_misses() {
    let track = track("bgm-main", "music/opening.ogg", []);
    let host =
        RecordingAudioHost::new().with_asset(None, "assets/bgm/music/opening.ogg", [1, 2, 3]);
    let plan = plan([command(AudioBackendCommandKind::LoadAsset, Some(track))]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.loaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 2);
    assert_eq!(host.reads.borrow()[0].url, "music/opening.ogg");
    assert_eq!(host.reads.borrow()[1].url, "assets/bgm/music/opening.ogg");
}

#[test]
fn resolves_audio_assets_by_runtime_logical_or_bundle_name() {
    let cases = [
        bundle("runtime-bundle", None, Some("runtime.menu")),
        bundle("logical-bundle", Some("runtime.menu"), None),
        bundle("runtime.menu", None, None),
    ];

    for mounted_bundle in cases {
        let track = track("bgm-main", "music/opening.ogg", ["runtime.menu"]);
        let host = RecordingAudioHost::new()
            .with_bundle(mounted_bundle.clone())
            .with_asset(Some(&mounted_bundle.name), "music/opening.ogg", [7, 8]);
        let plan = plan([command(AudioBackendCommandKind::LoadAsset, Some(track))]);

        let report = sync_audio_assets_from_host(&host, &plan);

        assert!(report.is_ok(), "bundle should resolve: {mounted_bundle:?}");
        assert_eq!(report.loaded_count, 1);
        assert_eq!(
            host.reads.borrow()[0].bundle_name.as_deref(),
            Some(mounted_bundle.name.as_str())
        );
        let loaded = &report.loaded_assets[0];
        assert_eq!(
            loaded.bundle_name.as_deref(),
            Some(mounted_bundle.name.as_str())
        );
        assert_eq!(
            loaded.backend_load.package_id.as_deref(),
            Some("runtime.menu")
        );
        assert_eq!(
            loaded.metadata.owner_package_id.as_deref(),
            Some("runtime.menu")
        );
    }
}

#[test]
fn falls_back_across_package_candidates_and_preserves_provenance() {
    let track = track("bgm-main", "music/opening.ogg", ["runtime.menu", "base"]);
    let host = RecordingAudioHost::new()
        .with_bundle(bundle("base-bundle", None, Some("base")))
        .with_bundle(bundle("runtime-bundle", None, Some("runtime.menu")))
        .with_asset(Some("runtime-bundle"), "music/opening.ogg", [9, 8, 7]);
    let plan = plan([command(AudioBackendCommandKind::LoadAsset, Some(track))]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.loaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 2);
    assert_eq!(
        host.reads.borrow()[0].bundle_name.as_deref(),
        Some("base-bundle")
    );
    assert_eq!(
        host.reads.borrow()[1].bundle_name.as_deref(),
        Some("runtime-bundle")
    );
    let loaded = &report.loaded_assets[0];
    assert_eq!(
        loaded.backend_load.package_id.as_deref(),
        Some("runtime.menu")
    );
    assert_eq!(
        loaded.metadata.owner_package_id.as_deref(),
        Some("runtime.menu")
    );
    assert_eq!(loaded.metadata.required_package_ids, set(["base"]));
}

#[test]
fn rejects_package_scoped_audio_without_matching_bundle() {
    let track = track("bgm-main", "music/opening.ogg", ["runtime.menu"]);
    let host = RecordingAudioHost::new()
        .with_bundle(bundle("base-bundle", None, Some("base")))
        .with_asset(None, "music/opening.ogg", [4, 3, 2, 1]);
    let plan = plan([command(AudioBackendCommandKind::LoadAsset, Some(track))]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.missing_asset_count, 1);
    assert!(host.reads.borrow().is_empty());
    let failure = &report.failures[0];
    assert_eq!(
        failure.kind,
        NativeAudioAssetHostSyncFailureKind::MissingAsset
    );
    assert_eq!(failure.package_id.as_deref(), Some("runtime.menu"));
    assert!(failure
        .message
        .contains("no mounted bundle matched package candidate"));
}

#[test]
fn reports_last_missing_candidate_when_all_package_reads_miss() {
    let track = track("bgm-main", "music/opening.ogg", ["runtime.menu", "base"]);
    let host = RecordingAudioHost::new()
        .with_bundle(bundle("base-bundle", None, Some("base")))
        .with_bundle(bundle("runtime-bundle", None, Some("runtime.menu")));
    let plan = plan([command(AudioBackendCommandKind::LoadAsset, Some(track))]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.missing_asset_count, 1);
    assert_eq!(host.reads.borrow().len(), 4);
    let failure = &report.failures[0];
    assert_eq!(
        failure.kind,
        NativeAudioAssetHostSyncFailureKind::MissingAsset
    );
    assert_eq!(failure.bundle_name.as_deref(), Some("runtime-bundle"));
    assert_eq!(failure.package_id.as_deref(), Some("runtime.menu"));
}

#[test]
fn stops_candidate_fallback_when_host_read_errors() {
    let track = track("bgm-main", "music/opening.ogg", ["runtime.menu", "base"]);
    let host = RecordingAudioHost::new()
        .with_bundle(bundle("base-bundle", None, Some("base")))
        .with_bundle(bundle("runtime-bundle", None, Some("runtime.menu")))
        .with_read_error(
            Some("base-bundle"),
            "music/opening.ogg",
            NativeHostApiError::InvalidRequest("audio backend read failed".to_string()),
        )
        .with_asset(Some("runtime-bundle"), "music/opening.ogg", [1, 2]);
    let plan = plan([command(AudioBackendCommandKind::LoadAsset, Some(track))]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.host_error_count, 1);
    assert_eq!(report.loaded_count, 0);
    assert_eq!(host.reads.borrow().len(), 1);
    let failure = &report.failures[0];
    assert_eq!(failure.kind, NativeAudioAssetHostSyncFailureKind::HostError);
    assert_eq!(failure.bundle_name.as_deref(), Some("base-bundle"));
    assert_eq!(failure.package_id.as_deref(), Some("base"));
    assert!(failure.message.contains("audio backend read failed"));
}

#[test]
fn ignores_non_load_asset_commands() {
    let track = track("bgm-main", "music/opening.ogg", []);
    let host = RecordingAudioHost::new().with_asset(None, "music/opening.ogg", [1, 2, 3]);
    let plan = plan([
        command(AudioBackendCommandKind::StartTrack, Some(track.clone())),
        command(AudioBackendCommandKind::UpdateTrack, Some(track.clone())),
        command(AudioBackendCommandKind::StopTrack, Some(track.clone())),
        command(AudioBackendCommandKind::ReleaseHandle, Some(track)),
    ]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.command_count, 4);
    assert_eq!(report.load_asset_command_count, 0);
    assert_eq!(report.ignored_command_count, 4);
    assert_eq!(report.loaded_count, 0);
    assert!(host.reads.borrow().is_empty());
}

#[test]
fn rejects_invalid_audio_asset_before_host_reads() {
    let track = track("bgm-main", "../native.dylib", ["runtime.menu"]);
    let host =
        RecordingAudioHost::new().with_bundle(bundle("runtime-bundle", None, Some("runtime.menu")));
    let plan = plan([command(AudioBackendCommandKind::LoadAsset, Some(track))]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.invalid_command_count, 1);
    assert!(host.reads.borrow().is_empty());
    assert!(report.failures[0]
        .message
        .contains("must not contain traversal segments"));
}

#[test]
fn rejects_load_asset_command_without_track_metadata() {
    let host = RecordingAudioHost::new();
    let plan = plan([AudioBackendCommand {
        track_id: "bgm-main".to_string(),
        kind: AudioBackendCommandKind::LoadAsset,
        track: None,
    }]);

    let report = sync_audio_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.invalid_command_count, 1);
    assert!(host.reads.borrow().is_empty());
    assert!(report.failures[0]
        .message
        .contains("is missing track metadata"));
}

#[derive(Default)]
struct RecordingAudioHost {
    assets: BTreeMap<(Option<String>, String), Vec<u8>>,
    read_errors: BTreeMap<(Option<String>, String), NativeHostApiError>,
    bundles: Vec<NativeMountedBundleInfo>,
    reads: RefCell<Vec<NativeAssetReadRequest>>,
}

impl RecordingAudioHost {
    fn new() -> Self {
        Self::default()
    }

    fn with_bundle(mut self, bundle: NativeMountedBundleInfo) -> Self {
        self.bundles.push(bundle);
        self
    }

    fn with_asset<const N: usize>(
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

    fn with_read_error(
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

impl NativeHostApi for RecordingAudioHost {
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

    fn drain_renderer_intents(&mut self) -> NativeHostApiResult<Vec<NativeRendererIntent>> {
        Ok(Vec::new())
    }
}

fn bundle(
    name: &str,
    logical_name: Option<&str>,
    runtime_package_id: Option<&str>,
) -> NativeMountedBundleInfo {
    NativeMountedBundleInfo {
        name: name.to_string(),
        logical_name: logical_name.map(ToString::to_string),
        version: Some(1),
        hash: None,
        runtime_package_id: runtime_package_id.map(ToString::to_string),
    }
}

fn plan<const N: usize>(commands: [AudioBackendCommand; N]) -> AudioBackendCommandPlan {
    AudioBackendCommandPlan {
        commands: commands.into(),
        ..Default::default()
    }
}

fn command(
    kind: AudioBackendCommandKind,
    track: Option<AudioBackendTrackState>,
) -> AudioBackendCommand {
    AudioBackendCommand {
        track_id: track
            .as_ref()
            .map(|track| track.id.clone())
            .unwrap_or_else(|| "missing-track".to_string()),
        kind,
        track,
    }
}

fn track<const N: usize>(
    id: &str,
    asset_name: &str,
    package_candidates: [&str; N],
) -> AudioBackendTrackState {
    AudioBackendTrackState {
        id: id.to_string(),
        kind: AudioTrackKind::Bgm,
        asset_type: "bgm".to_string(),
        asset_name: asset_name.to_string(),
        load_mode: AudioTrackLoadMode::Buffered,
        playback_state: AudioTrackPlaybackState::Playing,
        looped: true,
        volume: 0.75,
        duration_ms: None,
        fade_in_ms: None,
        fade_out_ms: None,
        crossfade_ms: None,
        play_at: None,
        delay_ms: None,
        seek_ms: None,
        offset_ms: None,
        package_candidates: set(package_candidates),
        media_resource_id: ResourceId::from(format!("audio:buffer:bgm:bgm:{asset_name}")),
        handle_resource_id: ResourceId::from(format!("audio:handle:bgm:bgm:{id}")),
    }
}

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
