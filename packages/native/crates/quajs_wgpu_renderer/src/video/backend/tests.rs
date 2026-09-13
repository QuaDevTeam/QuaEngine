use super::{NativeVideoBackend, NullNativeVideoBackend, VideoBackendAssetLoad};
use crate::resources::ResourceId;
use crate::video::{
    VideoBackendCommand, VideoBackendCommandKind, VideoBackendCommandPlan, VideoBackendStreamState,
};

#[test]
fn null_video_backend_records_asset_loads_and_commands() {
    let mut backend = NullNativeVideoBackend::new();
    let load = VideoBackendAssetLoad {
        stream_id: "background:video".to_string(),
        resource_id: ResourceId::from("video:decoder:video:movie/opening.mp4"),
        asset_type: "video".to_string(),
        asset_name: "movie/opening.mp4".to_string(),
        package_id: Some("runtime.video".to_string()),
        bytes: vec![1, 2, 3],
    };
    let stream = stream_state("movie/opening.mp4");
    let plan = VideoBackendCommandPlan {
        commands: vec![VideoBackendCommand {
            stream_id: stream.id.clone(),
            kind: VideoBackendCommandKind::StartStream,
            stream: Some(stream.clone()),
        }],
        next_streams: [(stream.id.clone(), stream)].into_iter().collect(),
        skipped_asset_resource_ids: Vec::new(),
    };

    backend.apply_video_asset_loads(&[load.clone()]).unwrap();
    backend.apply_video_commands(&plan).unwrap();

    assert_eq!(backend.loaded_assets(), &[load]);
    assert_eq!(backend.applied_plans(), &[plan]);
    assert_eq!(backend.active_streams().len(), 1);
    let diagnostics = backend.diagnostics();
    assert_eq!(diagnostics.loaded_asset_count, 1);
    assert_eq!(diagnostics.applied_plan_count, 1);
    assert_eq!(diagnostics.applied_command_count, 1);
    assert_eq!(diagnostics.active_stream_count, 1);
}

#[test]
fn null_video_backend_does_not_request_assets_by_default() {
    assert!(!NullNativeVideoBackend::new().wants_video_asset_loads());
}

fn stream_state(asset_name: &str) -> VideoBackendStreamState {
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
        package_candidates: Default::default(),
        decoder_resource_id: ResourceId::from(format!("video:decoder:video:{asset_name}")),
        frame_queue_resource_id: ResourceId::from(format!("video:frame-queue:video:{asset_name}")),
        texture_ring_resource_id: ResourceId::from(format!(
            "video:texture-ring:video:{asset_name}"
        )),
    }
}
