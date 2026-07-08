use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};

use quajs_native_runtime::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiError, NativeHostApiResult, NativeHostInfo,
    NativeHostInfoBuilder, NativeMountedBundleInfo, NativePlatform, NativeProfile,
    NativeRendererIntent, NativeSignatureVerifyRequest,
};
use quajs_wgpu_renderer::resources::ResourceId;
use quajs_wgpu_renderer::video::{
    VideoBackendCommand, VideoBackendCommandKind, VideoBackendCommandPlan, VideoBackendStreamState,
};

use super::{sync_video_assets_from_host, NativeVideoAssetHostSyncFailureKind};

#[test]
fn loads_unscoped_video_asset_when_stream_has_no_package_candidates() {
    let stream = stream("movie/opening.mp4", []);
    let host = RecordingVideoHost::new().with_asset(None, "movie/opening.mp4", [1, 2, 3]);
    let plan = plan([command(
        VideoBackendCommandKind::LoadAsset,
        Some(stream.clone()),
    )]);

    let report = sync_video_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.command_count, 1);
    assert_eq!(report.load_asset_command_count, 1);
    assert_eq!(report.loaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 1);
    assert_eq!(host.reads.borrow()[0].bundle_name, None);
    assert_eq!(
        host.reads.borrow()[0].asset_id.as_deref(),
        Some(stream.decoder_resource_id.as_str())
    );
    let loaded = &report.loaded_assets[0];
    assert_eq!(loaded.backend_load.stream_id, "background:video");
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
fn resolves_video_assets_by_runtime_logical_or_bundle_name() {
    let cases = [
        bundle("runtime-bundle", None, Some("runtime.video")),
        bundle("logical-bundle", Some("runtime.video"), None),
        bundle("runtime.video", None, None),
    ];

    for mounted_bundle in cases {
        let stream = stream("movie/opening.mp4", ["runtime.video"]);
        let host = RecordingVideoHost::new()
            .with_bundle(mounted_bundle.clone())
            .with_asset(Some(&mounted_bundle.name), "movie/opening.mp4", [7, 8]);
        let plan = plan([command(VideoBackendCommandKind::LoadAsset, Some(stream))]);

        let report = sync_video_assets_from_host(&host, &plan);

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
            Some("runtime.video")
        );
        assert_eq!(
            loaded.metadata.owner_package_id.as_deref(),
            Some("runtime.video")
        );
    }
}

#[test]
fn rejects_package_scoped_video_without_matching_bundle() {
    let stream = stream("movie/opening.mp4", ["runtime.video"]);
    let host = RecordingVideoHost::new()
        .with_bundle(bundle("base-bundle", None, Some("base")))
        .with_asset(None, "movie/opening.mp4", [4, 3, 2, 1]);
    let plan = plan([command(VideoBackendCommandKind::LoadAsset, Some(stream))]);

    let report = sync_video_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.missing_asset_count, 1);
    assert!(host.reads.borrow().is_empty());
    let failure = &report.failures[0];
    assert_eq!(
        failure.kind,
        NativeVideoAssetHostSyncFailureKind::MissingAsset
    );
    assert_eq!(failure.package_id.as_deref(), Some("runtime.video"));
    assert!(failure
        .message
        .contains("no mounted bundle matched package candidate"));
}

#[test]
fn ignores_non_load_asset_commands() {
    let stream = stream("movie/opening.mp4", []);
    let host = RecordingVideoHost::new().with_asset(None, "movie/opening.mp4", [1, 2, 3]);
    let plan = plan([
        command(VideoBackendCommandKind::StartStream, Some(stream.clone())),
        command(VideoBackendCommandKind::UpdateStream, Some(stream.clone())),
        command(VideoBackendCommandKind::StopStream, Some(stream.clone())),
        command(VideoBackendCommandKind::ReleaseDecoder, Some(stream)),
    ]);

    let report = sync_video_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.command_count, 4);
    assert_eq!(report.load_asset_command_count, 0);
    assert_eq!(report.ignored_command_count, 4);
    assert_eq!(report.loaded_count, 0);
    assert!(host.reads.borrow().is_empty());
}

#[test]
fn rejects_invalid_video_asset_before_host_reads() {
    let stream = stream("../native.dylib", ["runtime.video"]);
    let host = RecordingVideoHost::new().with_bundle(bundle(
        "runtime-bundle",
        None,
        Some("runtime.video"),
    ));
    let plan = plan([command(VideoBackendCommandKind::LoadAsset, Some(stream))]);

    let report = sync_video_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.invalid_command_count, 1);
    assert!(host.reads.borrow().is_empty());
    assert!(report.failures[0]
        .message
        .contains("must not contain traversal segments"));
}

#[test]
fn rejects_load_asset_command_without_stream_metadata() {
    let host = RecordingVideoHost::new();
    let plan = plan([VideoBackendCommand {
        stream_id: "background:video".to_string(),
        kind: VideoBackendCommandKind::LoadAsset,
        stream: None,
    }]);

    let report = sync_video_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.invalid_command_count, 1);
    assert!(host.reads.borrow().is_empty());
    assert!(report.failures[0]
        .message
        .contains("is missing stream metadata"));
}

#[derive(Default)]
struct RecordingVideoHost {
    assets: BTreeMap<(Option<String>, String), Vec<u8>>,
    bundles: Vec<NativeMountedBundleInfo>,
    reads: RefCell<Vec<NativeAssetReadRequest>>,
}

impl RecordingVideoHost {
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
}

impl NativeHostApi for RecordingVideoHost {
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

fn stream<const N: usize>(asset_name: &str, packages: [&str; N]) -> VideoBackendStreamState {
    VideoBackendStreamState {
        id: "background:video".to_string(),
        asset_type: "video".to_string(),
        asset_name: asset_name.to_string(),
        looped: false,
        muted: false,
        volume: 1.0,
        playback_rate: 1.0,
        seek_ms: None,
        offset_ms: None,
        package_candidates: set(packages),
        decoder_resource_id: ResourceId::from(format!("video:decoder:video:{asset_name}")),
        frame_queue_resource_id: ResourceId::from(format!("video:frame-queue:video:{asset_name}")),
        texture_ring_resource_id: ResourceId::from(format!(
            "video:texture-ring:video:{asset_name}"
        )),
    }
}

fn command(
    kind: VideoBackendCommandKind,
    stream: Option<VideoBackendStreamState>,
) -> VideoBackendCommand {
    VideoBackendCommand {
        stream_id: stream
            .as_ref()
            .map(|stream| stream.id.clone())
            .unwrap_or_else(|| "background:video".to_string()),
        kind,
        stream,
    }
}

fn plan<const N: usize>(commands: [VideoBackendCommand; N]) -> VideoBackendCommandPlan {
    VideoBackendCommandPlan {
        commands: commands.into(),
        next_streams: Default::default(),
        skipped_asset_resource_ids: Vec::new(),
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

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
