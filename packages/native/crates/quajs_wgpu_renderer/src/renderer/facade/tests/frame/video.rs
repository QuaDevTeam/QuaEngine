use std::collections::BTreeSet;

use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::render_graph::DrawCommandParams;
use crate::renderer::NativeRenderer;
use crate::resources::{NativeResourceKind, ResourceId};
use crate::video::{
    NativeVideoBackend, NativeVideoBackendResult, NullNativeVideoBackend, VideoBackendCommandKind,
    VideoBackendCommandPlan, VideoBackendFrameResource, VideoBackendFrameResourceMap,
};

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

#[test]
fn uses_video_backend_frame_resource_on_next_prepared_frame() {
    let mut renderer = NativeRenderer::with_video_backend(
        RecordingBackend::default(),
        PublishingVideoBackend::default(),
    );

    let update = renderer.prepare_frame(test_layout(), &view_with_background_video("runtime.fx"));
    renderer
        .apply_video_update(&update)
        .expect("video backend should publish frame resources after stream start");

    let next_update =
        renderer.prepare_frame(test_layout(), &view_with_background_video("runtime.fx"));
    let frame = renderer.state().frame().unwrap();
    let command = &frame.graph.commands()[0];
    let frame_resource_id = ResourceId::from("video:texture-ring:video:video/opening.webm");

    assert_eq!(
        next_update
            .resource_sync
            .upsert
            .iter()
            .find(|record| record.id == frame_resource_id)
            .map(|record| record.kind),
        Some(NativeResourceKind::VideoTextureRing)
    );
    assert_eq!(command.resource_ids, vec![frame_resource_id.clone()]);
    match &command.params {
        DrawCommandParams::Video(params) => {
            assert_eq!(params.frame_resource_id, Some(frame_resource_id));
            assert_eq!(params.fallback_reason, None);
        }
        _ => panic!("expected video draw params"),
    }
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

#[derive(Default)]
struct PublishingVideoBackend {
    frames: VideoBackendFrameResourceMap,
}

impl NativeVideoBackend for PublishingVideoBackend {
    fn apply_video_commands(&mut self, plan: &VideoBackendCommandPlan) -> NativeVideoBackendResult {
        self.frames = plan
            .next_streams
            .iter()
            .map(|(stream_id, stream)| {
                (
                    stream_id.clone(),
                    VideoBackendFrameResource {
                        stream_id: stream_id.clone(),
                        resource_id: stream.texture_ring_resource_id.clone(),
                    },
                )
            })
            .collect();
        Ok(())
    }

    fn video_frame_resources(&self) -> VideoBackendFrameResourceMap {
        self.frames.clone()
    }
}

fn provenance(package_id: &str) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(package_id.to_string()),
        required_runtime_packages: BTreeSet::new(),
    }
}
