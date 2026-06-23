use std::collections::BTreeSet;

use super::*;
use crate::render_graph::{DrawCommandKind, DrawCommandParams, MediaFit, RenderGraph, RenderPlane};
use crate::resources::ResourceId;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn builds_main_image_background_command() {
    let layout = test_layout();
    let background = BackgroundProjection {
        asset_name: Some("bg/school.png".to_string()),
        provenance: provenance("base", []),
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &background);

    assert_eq!(commands.len(), 1);
    let command = &commands[0];
    assert_eq!(command.id, "background:main");
    assert_eq!(command.plane, RenderPlane::Scene);
    assert_eq!(command.kind, DrawCommandKind::Image);
    assert_eq!(command.bounds.width, 1728.0);
    assert_eq!(command.bounds.height, 1080.0);
    assert_eq!(
        command.resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(command.owner_package_id.as_deref(), Some("base"));

    match &command.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "bg/school.png");
            assert_eq!(params.fit, MediaFit::Cover);
        }
        _ => panic!("expected image draw params"),
    }
}

#[test]
fn builds_visible_layered_background_commands_in_scene_plane() {
    let layout = test_layout();
    let background = BackgroundProjection {
        mode: BackgroundMode::Layered,
        layers: vec![
            BackgroundLayerProjection {
                fit: BackgroundFit::Contain,
                z_index: 20,
                opacity: 0.7,
                provenance: provenance("runtime.light", ["base"]),
                ..BackgroundLayerProjection::new("light", "layers/light.webp")
            },
            BackgroundLayerProjection {
                visible: false,
                ..BackgroundLayerProjection::new("hidden", "layers/hidden.webp")
            },
            BackgroundLayerProjection {
                origin: Some("left top".to_string()),
                width: Some(640.0),
                height: Some(360.0),
                x: 50.0,
                y: 60.0,
                z_index: -5,
                ..BackgroundLayerProjection::new("sky", "layers/sky.webp")
            },
        ],
        ..Default::default()
    };

    let mut graph = RenderGraph::new(layout);
    append_background_commands(&mut graph, &background);
    let ids: Vec<_> = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect();

    assert_eq!(ids, vec!["background:layer:sky", "background:layer:light"]);
    assert_eq!(graph.commands()[0].bounds.x, 50.0);
    assert_eq!(graph.commands()[0].bounds.width, 640.0);
    assert_eq!(graph.commands()[1].opacity, 0.7);
    assert_eq!(
        graph.commands()[1].owner_package_id.as_deref(),
        Some("runtime.light")
    );
    assert!(graph.commands()[1].required_package_ids.contains("base"));
    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Scene].command_count,
        2
    );
}

#[test]
fn builds_video_fallback_command_with_poster_resource() {
    let layout = test_layout();
    let background = BackgroundProjection {
        mode: BackgroundMode::Video,
        video: Some(BackgroundVideoProjection {
            poster: Some("poster/day.jpg".to_string()),
            provenance: provenance("runtime.video", ["base"]),
            ..BackgroundVideoProjection::new("movie/opening.mp4")
        }),
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &background);
    let command = &commands[0];

    assert_eq!(command.kind, DrawCommandKind::VideoFrame);
    assert_eq!(
        command.resource_ids,
        vec![
            ResourceId::from("video:movie/opening.mp4"),
            ResourceId::from("images:poster/day.jpg"),
        ]
    );
    assert_eq!(command.owner_package_id.as_deref(), Some("runtime.video"));
    assert!(command.required_package_ids.contains("base"));

    match &command.params {
        DrawCommandParams::Video(params) => {
            assert_eq!(params.asset_name, "movie/opening.mp4");
            assert_eq!(params.poster_asset_name.as_deref(), Some("poster/day.jpg"));
            assert_eq!(
                params.fallback_reason.as_deref(),
                Some("native video decode backend is not active")
            );
        }
        _ => panic!("expected video draw params"),
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
