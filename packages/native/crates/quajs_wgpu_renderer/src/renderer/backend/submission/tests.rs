use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderPlane};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

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

#[test]
fn summarizes_batch_command_metadata() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![
                ChoiceProjection::new("stay", "Stay"),
                ChoiceProjection {
                    enabled: false,
                    ..ChoiceProjection::new("leave", "Leave")
                },
            ])),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();
    let frame_ref = NativeRenderFrameRef {
        revision: 13,
        frame: &frame,
        resources: &resources,
    };

    let submission = frame_ref.submission();
    let choice_batch = submission.passes[0]
        .batches
        .iter()
        .find(|batch| {
            batch
                .command_ids
                .iter()
                .map(String::as_str)
                .eq(["choice:stay", "choice:leave"])
        })
        .unwrap();

    assert_eq!(choice_batch.pipeline, DrawBatchPipeline::Ui);
    assert_eq!(choice_batch.command_count, 2);
    assert_eq!(
        choice_batch.first_command_id.as_deref(),
        Some("choice:stay")
    );
    assert_eq!(
        choice_batch.last_command_id.as_deref(),
        Some("choice:leave")
    );
}

#[test]
fn summarizes_missing_resources_from_batches() {
    let frame = frame_with_background();
    let resources = NativeResourceLedger::new();
    let frame_ref = NativeRenderFrameRef {
        revision: 8,
        frame: &frame,
        resources: &resources,
    };

    let submission = frame_ref.submission();

    assert_eq!(submission.missing_resource_count, 1);
    assert_eq!(
        submission.missing_resources,
        vec![NativeRenderMissingResource {
            resource_id: ResourceId::from("images:bg/school.png"),
            plane: RenderPlane::Scene,
            pipeline: DrawBatchPipeline::Image,
            kind: DrawCommandKind::Image,
            command_ids: vec!["background:main".to_string()],
        }]
    );
}

#[test]
fn summarizes_backend_resource_diagnostics_from_submissions() {
    let frame = frame_with_background();
    let empty_resources = NativeResourceLedger::new();
    let mut resolved_resources = NativeResourceLedger::new();
    resolved_resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .memory(1, 1),
    );
    let missing_first = NativeRenderFrameRef {
        revision: 1,
        frame: &frame,
        resources: &empty_resources,
    }
    .submission();
    let resolved_second = NativeRenderFrameRef {
        revision: 2,
        frame: &frame,
        resources: &resolved_resources,
    }
    .submission();
    let missing_third = NativeRenderFrameRef {
        revision: 3,
        frame: &frame,
        resources: &empty_resources,
    }
    .submission();

    let diagnostics = NativeRenderBackendResourceDiagnostics::from_submissions(&[
        missing_first,
        resolved_second,
        missing_third.clone(),
    ]);

    assert_eq!(diagnostics.frames_with_missing_resources, 2);
    assert_eq!(diagnostics.missing_resource_count, 2);
    assert_eq!(
        diagnostics.last_missing_resources,
        missing_third.missing_resources
    );
}

#[test]
fn resource_policy_rejects_only_submissions_with_missing_resources() {
    let frame = frame_with_background();
    let empty_resources = NativeResourceLedger::new();
    let mut resolved_resources = NativeResourceLedger::new();
    resolved_resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .memory(1, 1),
    );
    let missing = NativeRenderFrameRef {
        revision: 11,
        frame: &frame,
        resources: &empty_resources,
    }
    .submission();
    let resolved = NativeRenderFrameRef {
        revision: 12,
        frame: &frame,
        resources: &resolved_resources,
    }
    .submission();

    let error = NativeRenderBackendResourcePolicy::RejectMissingResources
        .validate_submission(&missing)
        .unwrap_err();

    assert_eq!(
        error.kind,
        crate::renderer::NativeRenderBackendErrorKind::BackendRejected
    );
    assert!(error.message.contains("submission 11"));
    assert!(error.message.contains("images:bg/school.png"));
    assert!(NativeRenderBackendResourcePolicy::RejectMissingResources
        .validate_submission(&resolved)
        .is_ok());
    assert!(NativeRenderBackendResourcePolicy::AllowMissingResources
        .validate_submission(&missing)
        .is_ok());
}

#[test]
fn summarizes_resolved_submission_resource_memory() {
    let frame = frame_with_background();
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .owned_by("base")
        .require_package("runtime.ui")
        .memory(512, 4096),
    );
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:unused.png"),
            NativeResourceKind::Texture,
        )
        .memory(1024, 8192),
    );
    let frame_ref = NativeRenderFrameRef {
        revision: 9,
        frame: &frame,
        resources: &resources,
    };

    let submission = frame_ref.submission();

    assert_eq!(submission.resource_count, 2);
    assert_eq!(submission.missing_resource_count, 0);
    assert!(submission.missing_resources.is_empty());
    assert_eq!(submission.resolved_resource_memory.total.cpu_bytes, 512);
    assert_eq!(submission.resolved_resource_memory.total.gpu_bytes, 4096);
    assert_eq!(
        submission.resolved_resource_memory.by_kind[&NativeResourceKind::Texture].gpu_bytes,
        4096
    );
    assert_eq!(
        submission.resolved_resource_memory.by_owner_package["base"].cpu_bytes,
        512
    );
    assert_eq!(
        submission.resolved_resource_memory.by_required_package["runtime.ui"].gpu_bytes,
        4096
    );
    assert_ne!(submission.resolved_resource_memory.total.cpu_bytes, 1536);
    assert_ne!(submission.resolved_resource_memory.total.gpu_bytes, 12288);
    assert_eq!(submission.passes[0].resolved_resource_count, 1);
    assert_eq!(submission.passes[0].missing_resource_count, 0);
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .total
            .cpu_bytes,
        512
    );
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .total
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .by_owner_package["base"]
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0].batches[0].resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .total
            .cpu_bytes,
        512
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .total
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .by_required_package["runtime.ui"]
            .cpu_bytes,
        512
    );
}

fn frame_with_background() -> crate::frame::PreparedNativeFrame {
    prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
}

fn test_layout() -> crate::stage_layout::ResolvedStageLayout {
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
    )
}
