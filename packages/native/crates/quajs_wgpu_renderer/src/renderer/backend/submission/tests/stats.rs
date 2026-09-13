use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, DrawCommandParams, RenderPlane};
use crate::resources::{NativeResourceLedger, ResourceId};

use super::super::NativeRenderFrameRef;
use super::support::frame_with_background;

#[test]
fn creates_submission_stats_from_frame_ref() {
    let frame = frame_with_background();
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
    assert_eq!(submission.fallback_summary.fallback_count, 0);
    assert_eq!(submission.fallback_summary.video_fallback_count, 0);
    assert!(submission.fallback_summary.by_pipeline.is_empty());
    assert!(submission.fallback_summary.by_reason.is_empty());
    assert!(submission.fallback_summary.by_owner_package.is_empty());
    assert!(submission.fallback_summary.by_required_package.is_empty());
    assert_eq!(submission.resolved_resource_memory.total.total_bytes(), 0);
    assert!(submission.resolved_resource_memory.by_kind.is_empty());
    assert!(submission
        .resolved_resource_memory
        .by_owner_package
        .is_empty());
    assert!(submission
        .resolved_resource_memory
        .by_required_package
        .is_empty());
    assert_eq!(submission.passes.len(), 1);
    assert_eq!(submission.passes[0].plane, RenderPlane::Scene);
    assert_eq!(submission.passes[0].batch_count, 1);
    assert_eq!(submission.passes[0].command_count, 1);
    assert_eq!(submission.passes[0].resolved_resource_count, 0);
    assert_eq!(submission.passes[0].missing_resource_count, 1);
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .total
            .total_bytes(),
        0
    );
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
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .total
            .total_bytes(),
        0
    );
    assert_eq!(
        submission.passes[0].batches[0].missing_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        submission.passes[0].batches[0].command_ids,
        vec!["background:main".to_string()]
    );
    assert_eq!(submission.passes[0].batches[0].commands.len(), 1);
    assert_eq!(
        submission.passes[0].batches[0].commands[0].command.id,
        "background:main"
    );
    assert_eq!(
        submission.passes[0].batches[0].commands[0].command.bounds,
        frame.graph.commands()[0].bounds
    );
    match &submission.passes[0].batches[0].commands[0].command.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_name, "bg/school.png");
            assert_eq!(params.asset_type, "images");
        }
        _ => panic!("expected image command snapshot"),
    }
    assert!(submission.passes[0].batches[0].commands[0]
        .resolved_resource_ids
        .is_empty());
    assert_eq!(
        submission.passes[0].batches[0].commands[0].missing_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(submission.passes[0].batches[0].command_count, 1);
    assert_eq!(
        submission.passes[0].batches[0].first_command_id.as_deref(),
        Some("background:main")
    );
    assert_eq!(
        submission.passes[0].batches[0].last_command_id.as_deref(),
        Some("background:main")
    );
    assert_eq!(
        submission.passes[0].viewport,
        frame.passes.passes[0].viewport
    );
}
