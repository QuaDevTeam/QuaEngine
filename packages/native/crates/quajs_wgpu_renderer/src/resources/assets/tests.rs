use std::collections::BTreeSet;

use super::*;
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::character::CharacterProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect, RenderGraph, RenderPlane};
use crate::resources::plan_render_graph_resources;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn plans_asset_requests_from_render_resources() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
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
        },
    );
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert_eq!(assets.requests.len(), 2);
    assert!(assets.skipped_resource_ids.is_empty());

    let background = assets.request("images", "bg/school.png").unwrap();
    assert_eq!(background.kind, NativeResourceKind::Texture);
    assert_eq!(background.command_ids, set(["background:main"]));
    assert_eq!(background.package_candidates, set(["base"]));

    let character = assets.request("characters", "yuki/default.png").unwrap();
    assert_eq!(character.kind, NativeResourceKind::Texture);
    assert_eq!(character.command_ids, set(["character:yuki"]));
    assert_eq!(
        character.package_candidates,
        set(["base", "runtime.sprite"])
    );
}

#[test]
fn requests_video_fallback_poster_asset_without_decoder_asset() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                mode: BackgroundMode::Video,
                video: Some(BackgroundVideoProjection {
                    poster: Some("poster/opening.png".to_string()),
                    provenance: provenance("runtime.video", ["base"]),
                    ..BackgroundVideoProjection::new("opening.mp4")
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert!(assets.request("video", "opening.mp4").is_none());
    assert_eq!(
        assets.request("images", "poster/opening.png").unwrap().kind,
        NativeResourceKind::Texture
    );
}

#[test]
fn skips_unparseable_resource_ids() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "movie",
            RenderPlane::Scene,
            DrawCommandKind::VideoFrame,
            rect(),
        )
        .resource("movie-source"),
        DrawCommand::new("empty", RenderPlane::Scene, DrawCommandKind::Image, rect())
            .resource("images:"),
    ]);
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert!(assets.requests.is_empty());
    assert_eq!(
        assets.skipped_resource_ids,
        vec![
            ResourceId::from("images:"),
            ResourceId::from("movie-source")
        ]
    );
}

#[test]
fn merges_same_asset_request_from_multiple_commands() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        image_command("layer:a", "images:shared.png")
            .owned_by("runtime.a")
            .require_package("base"),
        image_command("layer:b", "images:shared.png")
            .owned_by("runtime.b")
            .require_package("runtime.a"),
    ]);
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);
    let request = assets.request("images", "shared.png").unwrap();

    assert_eq!(assets.requests.len(), 1);
    assert_eq!(request.command_ids, set(["layer:a", "layer:b"]));
    assert_eq!(
        request.package_candidates,
        set(["base", "runtime.a", "runtime.b"])
    );
}

#[test]
fn plans_declarative_ui_asset_requests_for_runtime_package_surfaces() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "ui:menu",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("surface:ui/menu.qui")
        .owned_by("runtime.ui")
        .require_package("base"),
        DrawCommand::new(
            "ui:menu:style",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("qss:themes/default.qss.json")
        .owned_by("runtime.ui"),
        DrawCommand::new(
            "ui:menu:tokens",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("tokens:themes/default.tokens.json")
        .owned_by("runtime.tokens"),
    ]);
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert_eq!(assets.requests.len(), 3);
    assert!(assets.skipped_resource_ids.is_empty());

    let surface = assets.request("surface", "ui/menu.qui").unwrap();
    assert_eq!(surface.kind, NativeResourceKind::UiAst);
    assert_eq!(surface.command_ids, set(["ui:menu"]));
    assert_eq!(surface.package_candidates, set(["base", "runtime.ui"]));

    let style = assets.request("qss", "themes/default.qss.json").unwrap();
    assert_eq!(style.kind, NativeResourceKind::QssStyle);
    assert_eq!(style.command_ids, set(["ui:menu:style"]));
    assert_eq!(style.package_candidates, set(["runtime.ui"]));

    let tokens = assets
        .request("tokens", "themes/default.tokens.json")
        .unwrap();
    assert_eq!(tokens.kind, NativeResourceKind::TokenTable);
    assert_eq!(tokens.command_ids, set(["ui:menu:tokens"]));
    assert_eq!(tokens.package_candidates, set(["runtime.tokens"]));
    assert!(is_declarative_asset_kind(surface.kind));
    assert!(is_declarative_asset_kind(style.kind));
    assert!(is_declarative_asset_kind(tokens.kind));
    assert!(!is_declarative_asset_kind(NativeResourceKind::Texture));
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
