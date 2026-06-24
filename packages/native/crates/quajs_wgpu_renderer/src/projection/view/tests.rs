use std::collections::BTreeSet;

use super::*;
use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::character::{CharacterPosition, CharacterProjection};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
};
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane};
use crate::resources::ResourceId;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn builds_empty_view_graph() {
    let layout = test_layout();
    let graph = build_view_render_graph(layout.clone(), &ViewProjection::default());

    assert_eq!(graph.layout, layout);
    assert!(graph.commands().is_empty());
    assert_eq!(graph.summary().command_count, 0);
}

#[test]
fn builds_full_view_graph_in_render_plane_order() {
    let graph = build_view_render_graph(test_layout(), &full_view());

    let ids: Vec<_> = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect();

    assert_eq!(
        ids,
        vec![
            "background:main",
            "character:yuki",
            "dialogue:panel",
            "dialogue:speaker",
            "dialogue:text",
            "choices:panel",
            "choice:stay",
            "choice:leave",
        ]
    );

    assert_eq!(graph.commands()[0].plane, RenderPlane::Scene);
    assert_eq!(graph.commands()[1].plane, RenderPlane::Subject);
    assert!(graph.commands()[6].interactive);
    assert!(!graph.commands()[7].interactive);
}

#[test]
fn summarizes_combined_projection_resources_and_packages() {
    let graph = build_view_render_graph(test_layout(), &full_view());
    let summary = graph.summary();

    assert_eq!(summary.command_count, 8);
    assert_eq!(summary.interactive_count, 1);
    assert_eq!(summary.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(summary.by_plane[&RenderPlane::Subject].command_count, 1);
    assert_eq!(summary.by_plane[&RenderPlane::Safe].command_count, 6);
    assert_eq!(summary.by_package["base"].resource_ref_count, 2);
    assert_eq!(summary.by_package["runtime.dialogue"].command_count, 3);
    assert_eq!(summary.by_package["runtime.choices"].command_count, 3);
    assert!(summary
        .resources
        .referenced_resource_ids
        .contains(&ResourceId::from("images:bg/school.png")));
    assert!(summary
        .resources
        .referenced_resource_ids
        .contains(&ResourceId::from("characters:yuki/default.png")));
}

#[test]
fn hit_tests_enabled_choice_from_combined_graph() {
    let graph = build_view_render_graph(test_layout(), &full_view());
    let choice = graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();
    let hit = graph
        .hit_test(
            choice.bounds.x + choice.bounds.width / 2.0,
            choice.bounds.y + choice.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.id, "choice:stay");
    match &hit.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.intent.as_ref().unwrap().event, "choice/select");
            assert_eq!(
                params.intent.as_ref().unwrap().choice_id.as_deref(),
                Some("stay")
            );
        }
        _ => panic!("expected choice button params"),
    }
}

#[test]
fn append_view_commands_keeps_existing_commands() {
    let layout = test_layout();
    let mut graph = RenderGraph::new(layout);
    graph.push(crate::render_graph::DrawCommand::new(
        "screen:debug",
        RenderPlane::Screen,
        DrawCommandKind::UiSurface,
        crate::render_graph::LogicalRect {
            x: 0.0,
            y: 0.0,
            width: 120.0,
            height: 40.0,
        },
    ));

    append_view_commands(&mut graph, &full_view());

    assert_eq!(graph.commands().last().unwrap().id, "screen:debug");
    assert_eq!(graph.summary().command_count, 9);
}

#[test]
fn supports_video_background_fallback_inside_view_graph() {
    let view = ViewProjection {
        background: Some(BackgroundProjection {
            mode: crate::projection::background::BackgroundMode::Video,
            video: Some(BackgroundVideoProjection {
                poster: Some("poster/opening.png".to_string()),
                provenance: provenance("runtime.video", ["base"]),
                ..BackgroundVideoProjection::new("opening.mp4")
            }),
            ..Default::default()
        }),
        ..Default::default()
    };

    let graph = build_view_render_graph(test_layout(), &view);
    let video = &graph.commands()[0];

    assert_eq!(video.kind, DrawCommandKind::VideoFrame);
    assert_eq!(video.owner_package_id.as_deref(), Some("runtime.video"));
    assert_eq!(
        video.resource_ids,
        vec![ResourceId::from("images:poster/opening.png")]
    );
}

#[test]
fn appends_ui_overlay_surfaces_after_safe_ui_commands() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
                "stay", "Stay",
            )])),
            ui: Some(UiProjection::new(vec![UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui")),
                intent: Some(UiIntentProjection::new("close")),
                provenance: provenance("runtime.menu", ["base"]),
                ..UiOverlayProjection::new("menu")
            }])),
            ..Default::default()
        },
    );
    let ids = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["choices:panel", "choice:stay", "ui:menu"]);
    let menu = graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu")
        .unwrap();
    assert_eq!(menu.plane, RenderPlane::Screen);
    assert_eq!(menu.owner_package_id.as_deref(), Some("runtime.menu"));
    match &menu.params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.element_id, "menu");
            assert_eq!(params.surface_key.as_deref(), Some("ui/menu.qui"));
            assert_eq!(
                params.intent.as_ref().unwrap().action.as_deref(),
                Some("close")
            );
        }
        _ => panic!("expected ui surface params"),
    }
}

fn full_view() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        characters: vec![CharacterProjection {
            sprite: Some("yuki/default.png".to_string()),
            position: CharacterPosition {
                x_percent: Some(50.0),
                width: Some(420.0),
                height: Some(900.0),
                ..Default::default()
            },
            provenance: provenance("base", []),
            ..CharacterProjection::new("yuki", "Yuki")
        }],
        dialogue: Some(DialogueProjection {
            speaker: Some("Yuki".into()),
            provenance: provenance("runtime.dialogue", ["base"]),
            ..DialogueProjection::say("Native renderer frame.")
        }),
        choices: Some(ChoiceSetProjection {
            visible: true,
            provenance: provenance("runtime.choices", ["base"]),
            choices: vec![
                ChoiceProjection {
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("stay", "Stay")
                },
                ChoiceProjection {
                    enabled: false,
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("leave", "Leave")
                },
            ],
        }),
        ..Default::default()
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
