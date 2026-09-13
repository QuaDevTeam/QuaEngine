use std::collections::BTreeSet;

use super::*;
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::character::CharacterProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::view::{
    build_view_render_graph, build_view_render_graph_with_video_frame_resources, ViewProjection,
};
use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect, RenderGraph, RenderPlane};
use crate::resources::plan_asset_requests;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};
use crate::video::{
    VideoBackendFrameResource, VideoBackendFrameResourceMap, BACKGROUND_VIDEO_STREAM_ID,
};

#[test]
fn plans_resources_from_view_graph() {
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

    let plan = plan_render_graph_resources(&graph);

    assert_eq!(plan.requests.len(), 2);
    assert_eq!(plan.resource_ref_count, 2);
    assert_eq!(plan.by_kind[&NativeResourceKind::Texture], 2);

    let background = plan.request("images:bg/school.png").unwrap();
    assert_eq!(background.kind, NativeResourceKind::Texture);
    assert_eq!(background.owner_package_ids, set(["base"]));
    assert_eq!(background.command_ids, set(["background:main"]));

    let character = plan.request("characters:yuki/default.png").unwrap();
    assert_eq!(character.kind, NativeResourceKind::Texture);
    assert_eq!(character.owner_package_ids, set(["runtime.sprite"]));
    assert_eq!(character.required_package_ids, set(["base"]));
    assert_eq!(character.package_ids(), set(["base", "runtime.sprite"]));
}

#[test]
fn deduplicates_repeated_resource_refs_and_merges_provenance() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        image_command("layer:a", "images:shared.png")
            .owned_by("runtime.a")
            .require_package("base"),
        image_command("layer:b", "images:shared.png")
            .owned_by("runtime.b")
            .require_package("runtime.a"),
    ]);

    let plan = plan_render_graph_resources(&graph);
    let request = plan.request("images:shared.png").unwrap();

    assert_eq!(plan.requests.len(), 1);
    assert_eq!(plan.resource_ref_count, 2);
    assert_eq!(request.kind, NativeResourceKind::Texture);
    assert_eq!(request.command_ids, set(["layer:a", "layer:b"]));
    assert_eq!(request.owner_package_ids, set(["runtime.a", "runtime.b"]));
    assert_eq!(request.required_package_ids, set(["base", "runtime.a"]));
}

#[test]
fn plans_video_fallback_poster_texture_without_decoder_request() {
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

    let plan = plan_render_graph_resources(&graph);

    assert_eq!(plan.requests.len(), 1);
    assert!(plan.request("video:opening.mp4").is_none());
    assert_eq!(
        plan.request("images:poster/opening.png").unwrap().kind,
        NativeResourceKind::Texture
    );
    assert!(!plan.by_kind.contains_key(&NativeResourceKind::VideoDecoder));
    assert_eq!(plan.by_kind[&NativeResourceKind::Texture], 1);
}

#[test]
fn plans_video_frame_texture_ring_without_asset_upload_request() {
    let frame_resource_id = ResourceId::from("video:texture-ring:video:movie/opening.mp4");
    let graph = build_view_render_graph_with_video_frame_resources(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                mode: BackgroundMode::Video,
                video: Some(BackgroundVideoProjection {
                    poster: Some("poster/opening.png".to_string()),
                    provenance: provenance("runtime.video", ["base"]),
                    ..BackgroundVideoProjection::new("movie/opening.mp4")
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
        &VideoBackendFrameResourceMap::from([(
            BACKGROUND_VIDEO_STREAM_ID.to_string(),
            VideoBackendFrameResource {
                stream_id: BACKGROUND_VIDEO_STREAM_ID.to_string(),
                resource_id: frame_resource_id.clone(),
            },
        )]),
    );

    let plan = plan_render_graph_resources(&graph);
    let asset_plan = plan_asset_requests(&plan);

    assert_eq!(plan.requests.len(), 1);
    assert_eq!(
        plan.request(frame_resource_id.clone()).unwrap().kind,
        NativeResourceKind::VideoTextureRing
    );
    assert_eq!(plan.by_kind[&NativeResourceKind::VideoTextureRing], 1);
    assert_eq!(asset_plan.requests.len(), 0);
    assert_eq!(asset_plan.skipped_resource_ids, vec![frame_resource_id]);
}

#[test]
fn falls_back_to_command_kind_when_resource_prefix_is_unknown() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "video:frame",
            RenderPlane::Scene,
            DrawCommandKind::VideoFrame,
            rect(),
        )
        .resource("movie-source"),
        DrawCommand::new(
            "ui:surface",
            RenderPlane::Safe,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("compiled-surface"),
    ]);

    let plan = plan_render_graph_resources(&graph);

    assert_eq!(
        plan.request("movie-source").unwrap().kind,
        NativeResourceKind::VideoDecoder
    );
    assert_eq!(
        plan.request("compiled-surface").unwrap().kind,
        NativeResourceKind::UiAst
    );
}

#[test]
fn plans_font_face_resources_from_text_resource_ids() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "dialogue:text",
            RenderPlane::Safe,
            DrawCommandKind::Text,
            rect(),
        )
        .resource("fonts:Qua Sans")
        .owned_by("runtime.fonts")
        .require_package("base"),
        DrawCommand::new(
            "ui:button",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("fonts:Qua Sans")
        .owned_by("runtime.ui"),
    ]);

    let plan = plan_render_graph_resources(&graph);
    let request = plan.request("fonts:Qua Sans").unwrap();

    assert_eq!(plan.requests.len(), 1);
    assert_eq!(plan.resource_ref_count, 2);
    assert_eq!(plan.by_kind[&NativeResourceKind::FontFace], 1);
    assert_eq!(request.kind, NativeResourceKind::FontFace);
    assert_eq!(request.command_ids, set(["dialogue:text", "ui:button"]));
    assert_eq!(
        request.owner_package_ids,
        set(["runtime.fonts", "runtime.ui"])
    );
    assert_eq!(request.required_package_ids, set(["base"]));
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
