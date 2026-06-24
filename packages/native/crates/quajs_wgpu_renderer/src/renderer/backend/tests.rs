use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderPlane};
use crate::resources::{NativeResourceLedger, ResourceId};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn creates_submission_stats_from_frame_ref() {
    let frame = prepare_native_frame(
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
        ),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();
    let frame_ref = NativeRenderFrameRef {
        revision: 7,
        frame: &frame,
        resources: &resources,
    };

    let submission = frame_ref.submission();

    assert_eq!(submission.revision, 7);
    assert_eq!(submission.pass_count, 1);
    assert_eq!(submission.batch_count, 1);
    assert_eq!(submission.command_count, 1);
    assert_eq!(submission.resource_count, 0);
    assert_eq!(submission.missing_resource_count, 1);
    assert_eq!(submission.passes.len(), 1);
    assert_eq!(submission.passes[0].plane, RenderPlane::Scene);
    assert_eq!(submission.passes[0].batch_count, 1);
    assert_eq!(submission.passes[0].command_count, 1);
    assert_eq!(submission.passes[0].resolved_resource_count, 0);
    assert_eq!(submission.passes[0].missing_resource_count, 1);
    assert_eq!(submission.passes[0].batches.len(), 1);
    assert_eq!(
        submission.passes[0].batches[0].pipeline,
        DrawBatchPipeline::Image
    );
    assert_eq!(submission.passes[0].batches[0].kind, DrawCommandKind::Image);
    assert_eq!(
        submission.passes[0].batches[0].resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(submission.passes[0].batches[0]
        .resolved_resource_ids
        .is_empty());
    assert_eq!(
        submission.passes[0].batches[0].missing_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        submission.passes[0].batches[0].command_ids,
        vec!["background:main".to_string()]
    );
    assert_eq!(
        submission.passes[0].viewport,
        frame.passes.passes[0].viewport
    );
}
