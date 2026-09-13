use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::FontFamilyProjection;
use crate::projection::dialogue::{DialogueProjection, RichTextStyle};
use crate::projection::view::ViewProjection;
use crate::render_graph::{
    plan_render_passes, DrawCommand, DrawCommandKind, LogicalRect, RenderGraph, RenderPlane,
};
use crate::resources::{
    plan_asset_requests, plan_render_graph_resources, NativeResourceKind, NativeResourceLedger,
    ResourceId,
};

#[test]
fn summarizes_missing_resources_from_batches() {
    let frame = frame_with_background();
    let resources = NativeResourceLedger::new();
    let submission = NativeRenderFrameRef {
        revision: 8,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 1);
    assert_eq!(
        submission.missing_resources,
        vec![NativeRenderMissingResource {
            resource_id: ResourceId::from("images:bg/school.png"),
            plane: crate::render_graph::RenderPlane::Scene,
            pipeline: crate::render_graph::DrawBatchPipeline::Image,
            kind: crate::render_graph::DrawCommandKind::Image,
            command_ids: vec!["background:main".to_string()],
            owner_package_ids: BTreeSet::new(),
            required_package_ids: BTreeSet::new(),
        }]
    );
}

#[test]
fn missing_resource_diagnostics_preserve_command_package_provenance() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/runtime.png".to_string()),
                provenance: package_provenance("runtime.background", ["base"]),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();

    let submission = NativeRenderFrameRef {
        revision: 10,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(
        submission.missing_resources,
        vec![NativeRenderMissingResource {
            resource_id: ResourceId::from("images:bg/runtime.png"),
            plane: crate::render_graph::RenderPlane::Scene,
            pipeline: crate::render_graph::DrawBatchPipeline::Image,
            kind: crate::render_graph::DrawCommandKind::Image,
            command_ids: vec!["background:main".to_string()],
            owner_package_ids: BTreeSet::from(["runtime.background".to_string()]),
            required_package_ids: BTreeSet::from(["base".to_string()]),
        }]
    );
}

#[test]
fn missing_font_resources_remain_command_local_without_blocking_submission() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            dialogue: Some(DialogueProjection {
                speaker: Some("Yuki".into()),
                speaker_style: RichTextStyle {
                    font_family: Some(FontFamilyProjection::new(["Qua Serif"])),
                    ..Default::default()
                },
                provenance: package_provenance("runtime.dialogue", ["runtime.fonts"]),
                ..DialogueProjection::say("Hello")
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();

    let submission = NativeRenderFrameRef {
        revision: 12,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 0);
    assert!(submission.missing_resources.is_empty());

    let speaker_batch = submission
        .passes
        .iter()
        .flat_map(|pass| pass.batches.iter())
        .find(|batch| batch.command_ids == vec!["dialogue:speaker".to_string()])
        .unwrap();
    assert_eq!(
        speaker_batch.missing_resource_ids,
        vec![ResourceId::from("fonts:Qua Serif")]
    );
    assert_eq!(
        speaker_batch.commands[0].missing_resource_ids,
        vec![ResourceId::from("fonts:Qua Serif")]
    );

    let diagnostics = NativeRenderBackendResourceDiagnostics::from_submissions(&[submission]);
    assert_eq!(diagnostics.missing_resource_count, 0);
    assert_eq!(
        diagnostics
            .missing_resources_by_kind
            .get(&NativeResourceKind::FontFace),
        None
    );
}

#[test]
fn missing_surface_source_resources_remain_draw_blocking() {
    let mut graph = RenderGraph::new(test_layout());
    graph.push(
        DrawCommand::new(
            "ui:surface",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("surface:ui/menu.qui")
        .owned_by("runtime.ui")
        .require_package("base"),
    );
    let frame = frame_from_graph(graph);
    let resources = NativeResourceLedger::new();

    let submission = NativeRenderFrameRef {
        revision: 13,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 1);
    assert_eq!(
        submission.missing_resources,
        vec![NativeRenderMissingResource {
            resource_id: ResourceId::from("surface:ui/menu.qui"),
            plane: RenderPlane::Screen,
            pipeline: crate::render_graph::DrawBatchPipeline::Ui,
            kind: DrawCommandKind::UiSurface,
            command_ids: vec!["ui:surface".to_string()],
            owner_package_ids: BTreeSet::from(["runtime.ui".to_string()]),
            required_package_ids: BTreeSet::from(["base".to_string()]),
        }]
    );

    let diagnostics = NativeRenderBackendResourceDiagnostics::from_submissions(&[submission]);
    assert_eq!(
        diagnostics
            .missing_resources_by_kind
            .get(&NativeResourceKind::UiAst),
        Some(&1)
    );
}

#[test]
fn missing_declarative_style_resources_remain_command_local_without_blocking_submission() {
    let mut graph = RenderGraph::new(test_layout());
    graph.push(
        DrawCommand::new(
            "ui:surface",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resources([
            "glyphs:ui/default",
            "qss:ui/menu.qss.json",
            "tokens:ui/theme.json",
        ])
        .owned_by("runtime.ui")
        .require_package("base"),
    );
    let frame = frame_from_graph(graph);
    let resources = NativeResourceLedger::new();

    let submission = NativeRenderFrameRef {
        revision: 14,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 0);
    assert!(submission.missing_resources.is_empty());

    let surface_batch = submission
        .passes
        .iter()
        .flat_map(|pass| pass.batches.iter())
        .find(|batch| batch.command_ids == vec!["ui:surface".to_string()])
        .unwrap();
    assert_eq!(
        surface_batch.missing_resource_ids,
        vec![
            ResourceId::from("glyphs:ui/default"),
            ResourceId::from("qss:ui/menu.qss.json"),
            ResourceId::from("tokens:ui/theme.json"),
        ]
    );

    let diagnostics = NativeRenderBackendResourceDiagnostics::from_submissions(&[submission]);
    assert_eq!(diagnostics.missing_resource_count, 0);
    for kind in [
        NativeResourceKind::GlyphAtlas,
        NativeResourceKind::QssStyle,
        NativeResourceKind::TokenTable,
    ] {
        assert_eq!(diagnostics.missing_resources_by_kind.get(&kind), None);
    }
}

fn frame_from_graph(graph: RenderGraph) -> crate::frame::PreparedNativeFrame {
    let summary = graph.summary();
    let resources = plan_render_graph_resources(&graph);
    let assets = plan_asset_requests(&resources);
    let passes = plan_render_passes(&graph);

    crate::frame::PreparedNativeFrame {
        graph,
        summary,
        resources,
        assets,
        passes,
    }
}

fn rect() -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 120.0,
        height: 48.0,
    }
}
