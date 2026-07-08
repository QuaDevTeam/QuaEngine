use std::collections::BTreeSet;

use super::{
    plan_video_backend_commands, plan_video_backend_package_teardown_commands,
    VideoBackendCommandKind, VideoBackendStreamState, VideoBackendStreamStateMap,
};
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::common::PackageProvenance;
use crate::resources::{
    NativeAssetRequest, NativeAssetRequestPlan, NativeResourceKind, ResourceId,
};

#[test]
fn plans_load_and_start_commands_for_new_background_video() {
    let background = background(
        video("movie/opening.mp4").with_provenance(provenance("runtime.video", ["base"])),
    );
    let assets = assets([asset(
        "video",
        "movie/opening.mp4",
        ["runtime.video", "base"],
    )]);

    let plan = plan_video_backend_commands(
        &VideoBackendStreamStateMap::new(),
        Some(&background),
        &assets,
    );

    assert_eq!(plan.commands.len(), 2);
    assert_eq!(plan.commands[0].kind, VideoBackendCommandKind::LoadAsset);
    assert_eq!(plan.commands[1].kind, VideoBackendCommandKind::StartStream);
    let stream = plan.commands[1].stream.as_ref().unwrap();
    assert_eq!(stream.id, "background:video");
    assert_eq!(stream.asset_type, "video");
    assert_eq!(stream.asset_name, "movie/opening.mp4");
    assert_eq!(stream.seek_ms, None);
    assert_eq!(stream.offset_ms, None);
    assert_eq!(
        stream.decoder_resource_id,
        ResourceId::from("video:decoder:video:movie/opening.mp4")
    );
    assert_eq!(
        stream.frame_queue_resource_id,
        ResourceId::from("video:frame-queue:video:movie/opening.mp4")
    );
    assert_eq!(
        stream.texture_ring_resource_id,
        ResourceId::from("video:texture-ring:video:movie/opening.mp4")
    );
    assert_eq!(stream.package_candidates, set(["base", "runtime.video"]));
    assert!(plan.next_streams.contains_key("background:video"));
}

#[test]
fn fallback_package_candidates_skip_unsafe_projection_provenance() {
    let background = background(
        video("movie/opening.mp4").with_provenance(provenance("runtime/video", ["base"])),
    );

    let plan = plan_video_backend_commands(
        &VideoBackendStreamStateMap::new(),
        Some(&background),
        &assets([]),
    );

    let stream = plan.next_streams.get("background:video").unwrap();
    assert_eq!(stream.package_candidates, set(["base"]));
}

#[test]
fn skips_non_video_backgrounds_and_unsafe_assets() {
    let image_background = BackgroundProjection {
        mode: BackgroundMode::Image,
        video: Some(video("movie/opening.mp4")),
        ..Default::default()
    };
    let unsafe_background = background(video("../native.dylib"));

    assert!(plan_video_backend_commands(
        &VideoBackendStreamStateMap::new(),
        Some(&image_background),
        &assets([])
    )
    .is_empty());
    assert!(plan_video_backend_commands(
        &VideoBackendStreamStateMap::new(),
        Some(&unsafe_background),
        &assets([])
    )
    .is_empty());
}

#[test]
fn updates_stream_when_playback_policy_changes() {
    let mut previous = VideoBackendStreamStateMap::new();
    previous.insert(
        "background:video".to_string(),
        stream_state("movie/opening.mp4", false, false, 1.0, 1.0),
    );
    let mut next_video = video("movie/opening.mp4");
    next_video.looped = Some(true);
    next_video.muted = Some(true);
    next_video.volume = Some(0.5);
    next_video.playback_rate = Some(1.25);
    next_video.seek_ms = Some(1_200.0);
    next_video.offset_ms = Some(50.0);
    let background = background(next_video);

    let plan = plan_video_backend_commands(&previous, Some(&background), &assets([]));

    assert_eq!(plan.commands.len(), 1);
    assert_eq!(plan.commands[0].kind, VideoBackendCommandKind::UpdateStream);
    let stream = plan.commands[0].stream.as_ref().unwrap();
    assert!(stream.looped);
    assert!(stream.muted);
    assert_eq!(stream.volume, 0.5);
    assert_eq!(stream.playback_rate, 1.25);
    assert_eq!(stream.seek_ms, Some(1_200.0));
    assert_eq!(stream.offset_ms, Some(50.0));
}

#[test]
fn updates_stream_when_projected_video_position_changes() {
    let mut previous = VideoBackendStreamStateMap::new();
    previous.insert(
        "background:video".to_string(),
        stream_state_with_position("movie/opening.mp4", Some(1_000.0), None),
    );
    let mut next_video = video("movie/opening.mp4");
    next_video.seek_ms = Some(1_500.0);
    next_video.offset_ms = Some(125.0);
    let background = background(next_video);

    let plan = plan_video_backend_commands(&previous, Some(&background), &assets([]));

    assert_eq!(plan.commands.len(), 1);
    assert_eq!(plan.commands[0].kind, VideoBackendCommandKind::UpdateStream);
    let stream = plan.commands[0].stream.as_ref().unwrap();
    assert_eq!(stream.seek_ms, Some(1_500.0));
    assert_eq!(stream.offset_ms, Some(125.0));
}

#[test]
fn reloads_stream_when_asset_identity_changes() {
    let mut previous = VideoBackendStreamStateMap::new();
    previous.insert(
        "background:video".to_string(),
        stream_state("movie/opening.mp4", false, false, 1.0, 1.0),
    );
    let background = background(video("movie/ending.mp4"));

    let plan = plan_video_backend_commands(&previous, Some(&background), &assets([]));

    assert_eq!(
        plan.commands
            .iter()
            .map(|command| &command.kind)
            .collect::<Vec<_>>(),
        vec![
            &VideoBackendCommandKind::StopStream,
            &VideoBackendCommandKind::ReleaseDecoder,
            &VideoBackendCommandKind::LoadAsset,
            &VideoBackendCommandKind::StartStream,
        ]
    );
    assert_eq!(
        plan.next_streams
            .get("background:video")
            .unwrap()
            .asset_name,
        "movie/ending.mp4"
    );
}

#[test]
fn stops_stream_when_background_video_is_removed() {
    let mut previous = VideoBackendStreamStateMap::new();
    previous.insert(
        "background:video".to_string(),
        stream_state("movie/opening.mp4", false, false, 1.0, 1.0),
    );

    let plan = plan_video_backend_commands(&previous, None, &assets([]));

    assert_eq!(plan.commands.len(), 2);
    assert_eq!(plan.commands[0].kind, VideoBackendCommandKind::StopStream);
    assert_eq!(
        plan.commands[1].kind,
        VideoBackendCommandKind::ReleaseDecoder
    );
    assert!(plan.next_streams.is_empty());
}

#[test]
fn package_teardown_releases_streams_for_released_video_resources() {
    let stream = stream_state("movie/opening.mp4", false, false, 1.0, 1.0);
    let mut previous = VideoBackendStreamStateMap::new();
    previous.insert("background:video".to_string(), stream.clone());

    let plan = plan_video_backend_package_teardown_commands(
        &previous,
        &set_resources(["video:decoder:video:movie/opening.mp4"]),
    );

    assert_eq!(plan.commands.len(), 2);
    assert_eq!(plan.commands[0].kind, VideoBackendCommandKind::StopStream);
    assert_eq!(
        plan.commands[1].kind,
        VideoBackendCommandKind::ReleaseDecoder
    );
    assert!(plan.next_streams.is_empty());
}

fn background(video: BackgroundVideoProjection) -> BackgroundProjection {
    BackgroundProjection {
        mode: BackgroundMode::Video,
        video: Some(video),
        ..Default::default()
    }
}

fn video(asset_name: &str) -> BackgroundVideoProjection {
    BackgroundVideoProjection::new(asset_name)
}

trait VideoProjectionTestExt {
    fn with_provenance(self, provenance: PackageProvenance) -> Self;
}

impl VideoProjectionTestExt for BackgroundVideoProjection {
    fn with_provenance(mut self, provenance: PackageProvenance) -> Self {
        self.provenance = provenance;
        self
    }
}

fn stream_state(
    asset_name: &str,
    looped: bool,
    muted: bool,
    volume: f32,
    playback_rate: f32,
) -> VideoBackendStreamState {
    stream_state_with_position_and_policy(
        asset_name,
        looped,
        muted,
        volume,
        playback_rate,
        None,
        None,
    )
}

fn stream_state_with_position(
    asset_name: &str,
    seek_ms: Option<f64>,
    offset_ms: Option<f64>,
) -> VideoBackendStreamState {
    stream_state_with_position_and_policy(asset_name, false, false, 1.0, 1.0, seek_ms, offset_ms)
}

fn stream_state_with_position_and_policy(
    asset_name: &str,
    looped: bool,
    muted: bool,
    volume: f32,
    playback_rate: f32,
    seek_ms: Option<f64>,
    offset_ms: Option<f64>,
) -> VideoBackendStreamState {
    plan_video_backend_commands(
        &VideoBackendStreamStateMap::new(),
        Some(&background(BackgroundVideoProjection {
            looped: Some(looped),
            muted: Some(muted),
            volume: Some(volume),
            playback_rate: Some(playback_rate),
            seek_ms,
            offset_ms,
            ..BackgroundVideoProjection::new(asset_name)
        })),
        &assets([]),
    )
    .next_streams
    .remove("background:video")
    .unwrap()
}

fn asset<const N: usize>(
    asset_type: &str,
    asset_name: &str,
    packages: [&str; N],
) -> NativeAssetRequest {
    NativeAssetRequest {
        resource_id: ResourceId::from(format!("video:decoder:{asset_type}:{asset_name}")),
        asset_type: asset_type.to_string(),
        asset_name: asset_name.to_string(),
        kind: NativeResourceKind::VideoDecoder,
        command_ids: BTreeSet::new(),
        owner_package_ids: BTreeSet::new(),
        required_package_ids: BTreeSet::new(),
        package_candidates: set(packages),
    }
}

fn assets<const N: usize>(requests: [NativeAssetRequest; N]) -> NativeAssetRequestPlan {
    NativeAssetRequestPlan {
        requests: requests.into(),
        skipped_resource_ids: Vec::new(),
    }
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: set(required),
    }
}

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}

fn set_resources<const N: usize>(items: [&str; N]) -> BTreeSet<ResourceId> {
    items.into_iter().map(ResourceId::from).collect()
}
