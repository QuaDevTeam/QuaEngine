use std::collections::BTreeSet;

use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::renderer::NativeRenderer;
use crate::video::{NullNativeVideoBackend, VideoBackendCommandKind};

use super::super::{test_layout, RecordingBackend};

#[test]
fn can_apply_video_commands_through_explicit_video_backend() {
    let mut renderer = NativeRenderer::with_video_backend(
        RecordingBackend::default(),
        NullNativeVideoBackend::new(),
    );

    let update = renderer.prepare_frame(test_layout(), &view_with_background_video("runtime.fx"));
    renderer
        .apply_video_update(&update)
        .expect("video backend should accept projected background video commands");

    assert_eq!(
        update
            .video_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            VideoBackendCommandKind::LoadAsset,
            VideoBackendCommandKind::StartStream,
        ]
    );
    let video = renderer.video_backend().unwrap();
    assert_eq!(video.diagnostics().applied_plan_count, 1);
    assert_eq!(video.diagnostics().applied_command_count, 2);
    assert_eq!(video.diagnostics().active_stream_count, 1);
    assert!(video.active_streams().contains_key("background:video"));
}

fn view_with_background_video(package_id: &str) -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            mode: BackgroundMode::Video,
            video: Some(BackgroundVideoProjection {
                looped: Some(true),
                muted: Some(false),
                volume: Some(0.75),
                playback_rate: Some(1.25),
                provenance: provenance(package_id),
                ..BackgroundVideoProjection::new("video/opening.webm")
            }),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn provenance(package_id: &str) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(package_id.to_string()),
        required_runtime_packages: BTreeSet::new(),
    }
}
