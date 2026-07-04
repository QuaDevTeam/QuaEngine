use crate::frame::prepare_native_frame;
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderPlane};
use crate::resources::NativeResourceLedger;

use super::super::{NativeRenderFallbackDiagnostic, NativeRenderFrameRef};
use super::support::test_layout;

#[test]
fn collects_video_fallback_diagnostics_from_frame_commands() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                mode: BackgroundMode::Video,
                video: Some(BackgroundVideoProjection {
                    poster: Some("poster.png".to_string()),
                    provenance: PackageProvenance {
                        content_package_id: Some("runtime.video".to_string()),
                        required_runtime_packages: ["base"]
                            .into_iter()
                            .map(ToString::to_string)
                            .collect(),
                    },
                    ..BackgroundVideoProjection::new("opening.mp4")
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();

    let submission = NativeRenderFrameRef {
        revision: 14,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(
        submission.fallback_diagnostics,
        vec![NativeRenderFallbackDiagnostic {
            command_id: "background:video".to_string(),
            plane: RenderPlane::Scene,
            pipeline: DrawBatchPipeline::Video,
            kind: DrawCommandKind::VideoFrame,
            reason: "native video decode backend is not active".to_string(),
            owner_package_id: Some("runtime.video".to_string()),
            required_package_ids: ["base"].into_iter().map(ToString::to_string).collect(),
        }]
    );
    assert_eq!(submission.fallback_summary.fallback_count, 1);
    assert_eq!(submission.fallback_summary.video_fallback_count, 1);
    assert_eq!(
        submission.fallback_summary.by_pipeline[&DrawBatchPipeline::Video],
        1
    );
    assert_eq!(
        submission.fallback_summary.by_reason["native video decode backend is not active"],
        1
    );
    assert_eq!(
        submission.fallback_summary.by_owner_package["runtime.video"],
        1
    );
    assert_eq!(submission.fallback_summary.by_required_package["base"], 1);
}
