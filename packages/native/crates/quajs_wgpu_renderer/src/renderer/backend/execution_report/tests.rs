use std::collections::BTreeMap;

use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::renderer::backend::{
    NativeBackendDrawPlan, NativeBackendEncoderPlan, NativeRenderFrameRef,
};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn summarizes_command_stream_execution() {
    let command_stream = command_stream_plan(51, &ledger_with_background_and_surface());

    let report = NativeBackendExecutionReport::from_command_stream_plan(&command_stream);

    assert_eq!(report.revision, 51);
    assert_eq!(report.pass_count, command_stream.pass_count);
    assert_eq!(report.command_count, command_stream.command_count);
    assert_eq!(report.draw_count, command_stream.draw_command_count);
    assert_eq!(
        report.skipped_draw_count,
        command_stream.skipped_draw_command_count
    );
    assert_eq!(report.skipped_draw_count, 0);
    assert!(report.pipeline_bind_count > 0);
    assert_eq!(report.resource_bind_count, 2);
    assert_eq!(report.bound_resource_reference_count, 2);
    assert_eq!(report.unique_resource_count, 2);
    assert_eq!(
        report.resource_memory,
        ResourceMemory {
            cpu_bytes: 768,
            gpu_bytes: 4096
        }
    );
    assert_eq!(
        report.resources_by_kind,
        BTreeMap::from([
            (
                NativeResourceKind::Texture,
                NativeBackendExecutionResourceKindSummary {
                    resource_count: 1,
                    memory: ResourceMemory {
                        cpu_bytes: 512,
                        gpu_bytes: 4096
                    },
                },
            ),
            (
                NativeResourceKind::UiAst,
                NativeBackendExecutionResourceKindSummary {
                    resource_count: 1,
                    memory: ResourceMemory {
                        cpu_bytes: 256,
                        gpu_bytes: 0
                    },
                },
            ),
        ])
    );
    assert_eq!(
        report
            .resources_by_package
            .get("base")
            .map(|summary| summary.owned_memory),
        Some(ResourceMemory {
            cpu_bytes: 512,
            gpu_bytes: 4096
        })
    );
    assert_eq!(
        report
            .resources_by_package
            .get("runtime.ui")
            .map(|summary| summary.owned_memory),
        Some(ResourceMemory {
            cpu_bytes: 256,
            gpu_bytes: 0
        })
    );
    assert!(report.draws_by_pipeline[&DrawBatchPipeline::Image] >= 1);
    assert!(report.draws_by_kind[&DrawCommandKind::Text] >= 1);
}

#[test]
fn reports_skipped_draws_and_unique_missing_resources() {
    let resources = NativeResourceLedger::new();
    let command_stream = command_stream_plan(52, &resources);

    let report = NativeBackendExecutionReport::from_command_stream_plan(&command_stream);

    assert_eq!(report.revision, 52);
    assert_eq!(report.resource_bind_count, 0);
    assert_eq!(report.unique_resource_count, 0);
    assert_eq!(report.skipped_draw_count, 2);
    assert_eq!(report.missing_resource_reference_count, 2);
    assert_eq!(report.unique_missing_resource_count, 2);
    assert_eq!(
        report.skips_by_reason,
        BTreeMap::from([(NativeBackendEncoderSkipReason::MissingResources, 2)])
    );
    assert!(report
        .missing_resource_ids
        .contains(&ResourceId::from("images:bg/school.png")));
    assert!(report
        .missing_resource_ids
        .contains(&ResourceId::from("surface:ui/menu.qui")));
    assert_eq!(
        report.skipped_draws_by_pipeline[&DrawBatchPipeline::Image],
        1
    );
    assert_eq!(report.skipped_draws_by_pipeline[&DrawBatchPipeline::Ui], 1);
    assert_eq!(
        report.skipped_draws_by_owner_package["runtime.background"],
        1
    );
    assert_eq!(report.skipped_draws_by_owner_package["runtime.menu"], 1);
    assert_eq!(report.skipped_draws_by_required_package["base"], 1);
    assert_eq!(report.skipped_draws_by_required_package["runtime.ui"], 1);
    assert_eq!(
        report.missing_resource_references_by_owner_package["runtime.background"],
        1
    );
    assert_eq!(
        report.missing_resource_references_by_owner_package["runtime.menu"],
        1
    );
    assert_eq!(
        report.missing_resource_references_by_required_package["base"],
        1
    );
    assert_eq!(
        report.missing_resource_references_by_required_package["runtime.ui"],
        1
    );
}

fn command_stream_plan(
    revision: u64,
    resources: &NativeResourceLedger,
) -> NativeBackendCommandStreamPlan {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let submission = NativeRenderFrameRef {
        revision,
        frame: &frame,
        resources,
    }
    .submission();
    let draw_plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, resources);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    NativeBackendCommandStreamPlan::from_encoder_plan(&encoder_plan)
}

fn view_with_ui_scroll() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("runtime.background", ["base"]),
            ..Default::default()
        }),
        dialogue: Some(DialogueProjection::say("Hello native")),
        ui: Some(UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "scroll",
                        UiSurfaceNodeKind::Scroll,
                        rect(20.0, 30.0, 300.0, 160.0),
                    )
                    .with_style(UiSurfaceResolvedStyle {
                        background_color: Some("#101820".to_string()),
                        border_radius: Some(12.0),
                        ..Default::default()
                    })
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "inside",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 44.0, 220.0, 56.0),
                    )
                    .with_text("Inside")
                    .with_intent(UiIntentProjection::new("inside"))]),
                ),
            ),
            provenance: provenance("runtime.menu", ["runtime.ui"]),
            ..UiOverlayProjection::new("menu")
        }])),
        ..Default::default()
    }
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required.into_iter().map(ToString::to_string).collect(),
    }
}

fn ledger_with_background_and_surface() -> NativeResourceLedger {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .owned_by("base")
        .require_package("base")
        .memory(512, 4096)
        .label("school background"),
    );
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("surface:ui/menu.qui"),
            NativeResourceKind::UiAst,
        )
        .owned_by("runtime.ui")
        .require_package("runtime.ui")
        .memory(256, 0)
        .label("menu surface"),
    );
    resources
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> UiSurfaceNodeRect {
    UiSurfaceNodeRect {
        x,
        y,
        width,
        height,
    }
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
