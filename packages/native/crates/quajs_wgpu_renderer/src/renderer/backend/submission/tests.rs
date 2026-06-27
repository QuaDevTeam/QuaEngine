use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, DrawCommandParams, RenderPlane};
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
    assert_eq!(choice_batch.commands.len(), 2);
    assert_eq!(choice_batch.commands[0].command.id, "choice:stay");
    assert_eq!(choice_batch.commands[1].command.id, "choice:leave");
    match &choice_batch.commands[0].command.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Stay");
            assert!(params.enabled);
        }
        _ => panic!("expected choice button command snapshot"),
    }
    match &choice_batch.commands[1].command.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Leave");
            assert!(!params.enabled);
        }
        _ => panic!("expected choice button command snapshot"),
    }
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
fn collects_video_fallback_diagnostics_from_frame_commands() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                mode: crate::projection::background::BackgroundMode::Video,
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

#[test]
fn command_snapshots_preserve_per_command_resource_resolution() {
    let frame = frame_with_background();
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .memory(512, 4096),
    );

    let submission = NativeRenderFrameRef {
        revision: 15,
        frame: &frame,
        resources: &resources,
    }
    .submission();
    let command = &submission.passes[0].batches[0].commands[0];

    assert_eq!(command.command.id, "background:main");
    assert_eq!(
        command.resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(command.missing_resource_ids.is_empty());
    assert_eq!(submission.missing_resource_count, 0);
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
