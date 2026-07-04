use std::collections::BTreeSet;

use super::*;
use crate::projection::background::layout::media_origin;
use crate::projection::common::PackageProvenance;
use crate::render_graph::{
    DrawCommandKind, DrawCommandParams, MediaFit, MediaOrigin, RenderGraph, RenderPlane,
};
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
        rotation: 12.5,
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
            assert_eq!(params.rotation_degrees, 12.5);
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
                rotation: -8.0,
                z_index: -5,
                ..BackgroundLayerProjection::new("sky", "layers/sky.webp")
            },
            BackgroundLayerProjection {
                origin: Some("25% 75%".to_string()),
                z_index: 5,
                ..BackgroundLayerProjection::new("mist", "layers/mist.webp")
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

    assert_eq!(
        ids,
        vec![
            "background:layer:sky",
            "background:layer:mist",
            "background:layer:light"
        ]
    );
    assert_eq!(graph.commands()[0].bounds.x, 50.0);
    assert_eq!(graph.commands()[0].bounds.width, 640.0);
    match &graph.commands()[0].params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.rotation_degrees, -8.0);
        }
        _ => panic!("expected layer image params"),
    }
    match &graph.commands()[1].params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.origin.x, 0.25);
            assert_eq!(params.origin.y, 0.75);
        }
        _ => panic!("expected layer image params"),
    }
    assert_eq!(graph.commands()[2].opacity, 0.7);
    assert_eq!(
        graph.commands()[2].owner_package_id.as_deref(),
        Some("runtime.light")
    );
    assert!(graph.commands()[2].required_package_ids.contains("base"));
    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Scene].command_count,
        3
    );
}

#[test]
fn skips_empty_background_asset_names_on_direct_projection() {
    let layout = test_layout();
    let image_background = BackgroundProjection {
        asset_name: Some("  ".to_string()),
        ..Default::default()
    };
    assert!(build_background_commands(&layout, &image_background).is_empty());

    let layered_background = BackgroundProjection {
        mode: BackgroundMode::Layered,
        layers: vec![
            BackgroundLayerProjection::new("empty", ""),
            BackgroundLayerProjection::new("whitespace", "  "),
            BackgroundLayerProjection::new("valid", "layers/valid.png"),
        ],
        ..Default::default()
    };
    let commands = build_background_commands(&layout, &layered_background);
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "background:layer:valid");
    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("images:layers/valid.png")]
    );

    let missing_video = BackgroundProjection {
        mode: BackgroundMode::Video,
        video: Some(BackgroundVideoProjection::new("")),
        ..Default::default()
    };
    assert!(build_background_commands(&layout, &missing_video).is_empty());
}

#[test]
fn skips_unsafe_background_asset_names_on_direct_projection() {
    let layout = test_layout();
    let url_background = BackgroundProjection {
        asset_name: Some("https://example.test/bg.png".to_string()),
        ..Default::default()
    };
    assert!(build_background_commands(&layout, &url_background).is_empty());

    let layered_background = BackgroundProjection {
        mode: BackgroundMode::Layered,
        layers: vec![
            BackgroundLayerProjection::new("traversal", "../layers/escape.png"),
            BackgroundLayerProjection::new("absolute", "/layers/absolute.png"),
            BackgroundLayerProjection::new("backslash", "layers\\backslash.png"),
            BackgroundLayerProjection::new("payload", "layers/native.dll?rev=1"),
            BackgroundLayerProjection::new("valid", "layers/valid.png"),
        ],
        ..Default::default()
    };
    let commands = build_background_commands(&layout, &layered_background);
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "background:layer:valid");
    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("images:layers/valid.png")]
    );

    let unsafe_video = BackgroundProjection {
        mode: BackgroundMode::Video,
        video: Some(BackgroundVideoProjection::new("native/plugin.framework")),
        ..Default::default()
    };
    assert!(build_background_commands(&layout, &unsafe_video).is_empty());
}

#[test]
fn skips_unsafe_background_asset_types_on_direct_projection() {
    let layout = test_layout();
    let image_background = BackgroundProjection {
        asset_name: Some("bg/school.png".to_string()),
        asset_type: Some("images/native".to_string()),
        ..Default::default()
    };
    assert!(build_background_commands(&layout, &image_background).is_empty());

    let layered_background = BackgroundProjection {
        mode: BackgroundMode::Layered,
        layers: vec![
            BackgroundLayerProjection {
                asset_type: Some("../images".to_string()),
                ..BackgroundLayerProjection::new("path", "layers/path.png")
            },
            BackgroundLayerProjection {
                asset_type: Some("---".to_string()),
                ..BackgroundLayerProjection::new("symbol", "layers/symbol.png")
            },
            BackgroundLayerProjection {
                asset_type: Some("sprites-ui".to_string()),
                ..BackgroundLayerProjection::new("valid", "layers/valid.png")
            },
        ],
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &layered_background);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "background:layer:valid");
    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("sprites-ui:layers/valid.png")]
    );
}

#[test]
fn skips_layers_with_unsafe_projection_ids_on_direct_projection() {
    let layout = test_layout();
    let background = BackgroundProjection {
        mode: BackgroundMode::Layered,
        layers: vec![
            BackgroundLayerProjection::new("safe.layer", "layers/safe.png"),
            BackgroundLayerProjection::new("https://example.test/layer", "layers/url.png"),
            BackgroundLayerProjection::new("native:layer", "layers/native.png"),
            BackgroundLayerProjection::new("bad/layer", "layers/path.png"),
            BackgroundLayerProjection::new("bad..layer", "layers/traversal.png"),
            BackgroundLayerProjection::new("plugin.dll", "layers/payload.png"),
        ],
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &background);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "background:layer:safe.layer");
    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("images:layers/safe.png")]
    );
}

#[test]
fn skips_duplicate_layer_projection_ids_on_direct_projection() {
    let layout = test_layout();
    let background = BackgroundProjection {
        mode: BackgroundMode::Layered,
        layers: vec![
            BackgroundLayerProjection::new("clouds", "layers/clouds-first.png"),
            BackgroundLayerProjection::new("clouds", "layers/clouds-second.png"),
            BackgroundLayerProjection::new("mist", "layers/mist.png"),
        ],
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &background);

    assert_eq!(
        commands
            .iter()
            .map(|command| command.id.as_str())
            .collect::<Vec<_>>(),
        vec!["background:layer:clouds", "background:layer:mist"]
    );
    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("images:layers/clouds-first.png")]
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
        vec![ResourceId::from("images:poster/day.jpg")]
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

#[test]
fn skips_unsafe_package_provenance_on_direct_projection() {
    let layout = test_layout();
    let background = BackgroundProjection {
        asset_name: Some("bg/school.png".to_string()),
        provenance: provenance("runtime/background", ["base", "runtime.ui", "../bad"]),
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &background);
    let command = &commands[0];

    assert_eq!(command.owner_package_id, None);
    assert!(command.required_package_ids.contains("base"));
    assert!(command.required_package_ids.contains("runtime.ui"));
    assert!(!command.required_package_ids.contains("../bad"));
    assert!(!command.required_package_ids.contains("runtime/background"));
}

#[test]
fn skips_empty_video_poster_resource_on_direct_projection() {
    let layout = test_layout();
    let background = BackgroundProjection {
        mode: BackgroundMode::Video,
        video: Some(BackgroundVideoProjection {
            poster: Some("  ".to_string()),
            ..BackgroundVideoProjection::new("movie/opening.mp4")
        }),
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &background);
    let command = &commands[0];

    assert_eq!(command.kind, DrawCommandKind::VideoFrame);
    assert!(command.resource_ids.is_empty());
    match &command.params {
        DrawCommandParams::Video(params) => {
            assert_eq!(params.asset_name, "movie/opening.mp4");
            assert_eq!(params.poster_asset_name, None);
        }
        _ => panic!("expected video draw params"),
    }
}

#[test]
fn skips_unsafe_video_poster_resource_on_direct_projection() {
    let layout = test_layout();
    let background = BackgroundProjection {
        mode: BackgroundMode::Video,
        video: Some(BackgroundVideoProjection {
            poster: Some("../poster/escape.png".to_string()),
            ..BackgroundVideoProjection::new("movie/opening.mp4")
        }),
        ..Default::default()
    };

    let commands = build_background_commands(&layout, &background);
    let command = &commands[0];

    assert_eq!(command.kind, DrawCommandKind::VideoFrame);
    assert!(command.resource_ids.is_empty());
    match &command.params {
        DrawCommandParams::Video(params) => {
            assert_eq!(params.asset_name, "movie/opening.mp4");
            assert_eq!(params.poster_asset_name, None);
        }
        _ => panic!("expected video draw params"),
    }
}

#[test]
fn deserializes_background_rotation_from_camel_case_json() {
    let background: BackgroundProjection = serde_json::from_str(
        r#"
        {
          "mode": "layered",
          "rotation": 24.5,
          "layers": [
            {
              "id": "clouds",
              "assetName": "layers/clouds.png",
              "rotation": -16.25
            }
          ]
        }
        "#,
    )
    .expect("background projection JSON should parse");

    assert_eq!(background.rotation, 24.5);
    assert_eq!(background.layers[0].rotation, -16.25);
}

#[test]
fn parses_media_origin_percentages_from_resolved_projection_strings() {
    assert_eq!(media_origin(Some("25%")), MediaOrigin { x: 0.25, y: 0.5 });
    assert_eq!(
        media_origin(Some("25% 75%")),
        MediaOrigin { x: 0.25, y: 0.75 }
    );
    assert_eq!(
        media_origin(Some("top 25%")),
        MediaOrigin { x: 0.25, y: 0.0 }
    );
    assert_eq!(
        media_origin(Some("right 75%")),
        MediaOrigin { x: 1.0, y: 0.75 }
    );
    assert_eq!(
        media_origin(Some("left bottom")),
        MediaOrigin { x: 0.0, y: 1.0 }
    );
    assert_eq!(
        media_origin(Some("120% 50%")),
        MediaOrigin { x: 0.5, y: 0.5 }
    );
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
