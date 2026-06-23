use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::resources::{NativeResourceKind, NativeResourceRecord};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn reports_empty_renderer_metrics() {
    let resources = NativeResourceLedger::new();
    let metrics = NativeRendererMetrics::from_state(0, None, &resources);

    assert_eq!(metrics.revision, 0);
    assert!(!metrics.has_frame);
    assert_eq!(metrics.frame.command_count, 0);
    assert_eq!(metrics.resources.ledger_resource_count, 0);
    assert_eq!(metrics.resources.memory.total_bytes(), 0);
}

#[test]
fn reports_frame_metrics_from_prepared_frame() {
    let graph = build_view_render_graph(test_layout(), &view_with_background_and_choice());
    let frame = crate::frame::PreparedNativeFrame {
        summary: graph.summary(),
        resources: crate::resources::plan_render_graph_resources(&graph),
        passes: crate::render_graph::plan_render_passes(&graph),
        graph,
    };
    let resources = NativeResourceLedger::new();

    let metrics = NativeRendererMetrics::from_state(3, Some(&frame), &resources);

    assert_eq!(metrics.revision, 3);
    assert!(metrics.has_frame);
    assert_eq!(metrics.frame.command_count, 3);
    assert_eq!(metrics.frame.interactive_count, 1);
    assert_eq!(metrics.frame.pass_count, 2);
    assert_eq!(metrics.frame.batch_count, 3);
    assert_eq!(metrics.frame.resource_request_count, 1);
    assert_eq!(metrics.frame.resource_ref_count, 1);
}

#[test]
fn reports_resource_memory_and_package_counts() {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new("images:bg.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );
    resources.insert(
        NativeResourceRecord::new("ui:surface", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .require_package("base")
            .memory(2048, 0),
    );

    let metrics = NativeRendererMetrics::from_state(2, None, &resources);

    assert_eq!(metrics.resources.ledger_resource_count, 2);
    assert_eq!(metrics.resources.package_count, 2);
    assert_eq!(metrics.resources.kind_count, 2);
    assert_eq!(metrics.resources.memory.cpu_bytes, 2176);
    assert_eq!(metrics.resources.memory.gpu_bytes, 4096);
}

fn view_with_background_and_choice() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            ..Default::default()
        }),
        choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
            "stay", "Stay",
        )])),
        ..Default::default()
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
