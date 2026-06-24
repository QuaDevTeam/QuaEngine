use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::character::CharacterProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::ui::{
    UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection,
};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect, RenderGraph, RenderPlane};
use crate::resources::plan_render_graph_resources;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn plans_upserts_for_missing_frame_resources() {
    let graph = build_view_render_graph(test_layout(), &view_with_two_resources());
    let resources = plan_render_graph_resources(&graph);
    let sync = plan_frame_resource_sync(&NativeResourceLedger::new(), &resources);

    assert_eq!(sync.upsert.len(), 2);
    assert!(sync.retain.is_empty());
    assert!(sync.release.is_empty());

    let background = sync
        .upsert
        .iter()
        .find(|record| record.id == ResourceId::from("images:bg/school.png"))
        .unwrap();
    assert_eq!(background.kind, NativeResourceKind::Texture);
    assert_eq!(background.owner_package_id.as_deref(), Some("base"));

    let character = sync
        .upsert
        .iter()
        .find(|record| record.id == ResourceId::from("characters:yuki/default.png"))
        .unwrap();
    assert_eq!(
        character.owner_package_id.as_deref(),
        Some("runtime.sprite")
    );
    assert!(character.required_package_ids.contains("base"));
}

#[test]
fn retains_existing_records_with_matching_metadata() {
    let graph = build_view_render_graph(test_layout(), &view_with_two_resources());
    let resources = plan_render_graph_resources(&graph);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );
    ledger.insert(
        NativeResourceRecord::new("characters:yuki/default.png", NativeResourceKind::Texture)
            .owned_by("runtime.sprite")
            .require_package("base")
            .memory(256, 8192),
    );

    let sync = plan_frame_resource_sync(&ledger, &resources);

    assert!(sync.upsert.is_empty());
    assert_eq!(
        sync.retain,
        vec![
            ResourceId::from("characters:yuki/default.png"),
            ResourceId::from("images:bg/school.png"),
        ]
    );
    assert!(sync.release.is_empty());
}

#[test]
fn upserts_existing_records_when_metadata_changes() {
    let graph = build_view_render_graph(test_layout(), &view_with_two_resources());
    let resources = plan_render_graph_resources(&graph);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("characters:yuki/default.png", NativeResourceKind::Texture)
            .owned_by("stale.package")
            .memory(256, 8192),
    );

    let sync = plan_frame_resource_sync(&ledger, &resources);
    let character = sync
        .upsert
        .iter()
        .find(|record| record.id == ResourceId::from("characters:yuki/default.png"))
        .unwrap();

    assert_eq!(
        character.owner_package_id.as_deref(),
        Some("runtime.sprite")
    );
    assert!(character.required_package_ids.contains("base"));
}

#[test]
fn releases_stale_frame_managed_resources_but_keeps_audio_resources() {
    let graph = build_view_render_graph(test_layout(), &ViewProjection::default());
    let resources = plan_render_graph_resources(&graph);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(NativeResourceRecord::new(
        "images:stale.png",
        NativeResourceKind::Texture,
    ));
    ledger.insert(NativeResourceRecord::new(
        "audio:bgm.ogg",
        NativeResourceKind::AudioBuffer,
    ));

    let sync = plan_frame_resource_sync(&ledger, &resources);

    assert_eq!(sync.release, vec![ResourceId::from("images:stale.png")]);
    assert!(sync.upsert.is_empty());
    assert!(sync.retain.is_empty());
}

#[test]
fn treats_multi_owner_shared_resources_as_required_by_all_owners() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        image_command("layer:a", "images:shared.png").owned_by("runtime.a"),
        image_command("layer:b", "images:shared.png").owned_by("runtime.b"),
    ]);
    let resources = plan_render_graph_resources(&graph);
    let sync = plan_frame_resource_sync(&NativeResourceLedger::new(), &resources);
    let shared = &sync.upsert[0];

    assert_eq!(shared.owner_package_id, None);
    assert_eq!(shared.required_package_ids, set(["runtime.a", "runtime.b"]));
}

#[test]
fn estimates_frame_managed_ui_ast_memory_for_runtime_package_metrics() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            ui: Some(UiProjection {
                provenance: provenance("runtime.ui", ["base"]),
                overlays: vec![UiOverlayProjection {
                    surface: Some(
                        UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                            UiSurfaceNodeProjection::new(
                                "title",
                                UiSurfaceNodeKind::Text,
                                crate::projection::ui::UiSurfaceNodeRect {
                                    x: 40.0,
                                    y: 48.0,
                                    width: 240.0,
                                    height: 44.0,
                                },
                            )
                            .with_text("Menu"),
                        ),
                    ),
                    ..UiOverlayProjection::new("menu")
                }],
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = plan_render_graph_resources(&graph);
    let sync = plan_frame_resource_sync(&NativeResourceLedger::new(), &resources);
    let ui_ast = sync
        .upsert
        .iter()
        .find(|record| record.id == ResourceId::from("surface:ui/menu.qui"))
        .unwrap();

    assert_eq!(ui_ast.kind, NativeResourceKind::UiAst);
    assert_eq!(ui_ast.owner_package_id.as_deref(), Some("runtime.ui"));
    assert!(ui_ast.required_package_ids.contains("base"));
    assert_eq!(ui_ast.memory.cpu_bytes, 1126);
    assert_eq!(ui_ast.memory.gpu_bytes, 0);
    assert_eq!(ui_ast.label.as_deref(), Some("ui ast surface:ui/menu.qui"));
}

#[test]
fn retains_existing_ui_ast_memory_when_host_has_reported_real_size() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([DrawCommand::new(
        "ui:menu",
        RenderPlane::Screen,
        DrawCommandKind::UiSurface,
        rect(),
    )
    .resource("surface:ui/menu.qui")
    .owned_by("runtime.ui")]);
    let resources = plan_render_graph_resources(&graph);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("surface:ui/menu.qui", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .memory(4096, 0)
            .label("compiled ui menu"),
    );

    let sync = plan_frame_resource_sync(&ledger, &resources);

    assert!(sync.upsert.is_empty());
    assert_eq!(sync.retain, vec![ResourceId::from("surface:ui/menu.qui")]);
}

fn view_with_two_resources() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        characters: vec![CharacterProjection {
            sprite: Some("yuki/default.png".to_string()),
            provenance: provenance("runtime.sprite", ["base"]),
            ..CharacterProjection::new("yuki", "Yuki")
        }],
        ..Default::default()
    }
}

fn image_command(id: &str, resource_id: &str) -> DrawCommand {
    DrawCommand::new(id, RenderPlane::Scene, DrawCommandKind::Image, rect()).resource(resource_id)
}

fn rect() -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    }
}

fn test_layout() -> ResolvedStageLayout {
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

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
