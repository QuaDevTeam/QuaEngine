use std::collections::BTreeSet;

use super::*;
use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::character::CharacterProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceImageProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect,
};
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderPlane};
use crate::resources::{NativeResourceKind, ResourceId};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn prepares_graph_summary_and_resource_plan_for_view() {
    let frame = prepare_native_frame(test_layout(), &view_with_background_character_and_choices());

    assert_eq!(frame.summary.command_count, 5);
    assert_eq!(frame.summary.interactive_count, 1);
    assert_eq!(frame.summary.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(
        frame.summary.by_plane[&RenderPlane::Subject].command_count,
        1
    );
    assert_eq!(frame.summary.by_plane[&RenderPlane::Safe].command_count, 3);
    assert_eq!(frame.passes.passes.len(), 3);
    assert_eq!(frame.passes.command_count, frame.summary.command_count);
    assert_eq!(frame.resources.requests.len(), 2);
    assert_eq!(frame.resources.by_kind[&NativeResourceKind::Texture], 2);
    assert_eq!(frame.assets.requests.len(), 2);
    assert!(frame.assets.skipped_resource_ids.is_empty());
    assert!(frame
        .resources
        .request(ResourceId::from("images:bg/school.png"))
        .is_some());
    assert!(frame.assets.request("images", "bg/school.png").is_some());
    assert!(frame
        .assets
        .request("characters", "yuki/default.png")
        .is_some());
}

#[test]
fn resolves_hit_intent_from_prepared_frame() {
    let frame = prepare_native_frame(test_layout(), &view_with_background_character_and_choices());
    let command = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();

    let hit = frame
        .hit_intent(
            command.bounds.x + command.bounds.width / 2.0,
            command.bounds.y + command.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}

#[test]
fn keeps_video_resource_requests_visible_to_frame_consumer() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
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
        },
    );

    assert_eq!(frame.summary.command_count, 1);
    assert_eq!(frame.graph.commands()[0].kind, DrawCommandKind::VideoFrame);
    assert_eq!(
        frame.resources.request("video:opening.mp4").unwrap().kind,
        NativeResourceKind::VideoDecoder
    );
    assert_eq!(
        frame
            .resources
            .request("images:poster/opening.png")
            .unwrap()
            .kind,
        NativeResourceKind::Texture
    );
    assert!(frame.assets.request("video", "opening.mp4").is_some());
    assert!(frame
        .assets
        .request("images", "poster/opening.png")
        .is_some());
}

#[test]
fn includes_ui_overlay_surface_requests_in_prepared_frame() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            ui: Some(UiProjection {
                provenance: provenance("runtime.ui", ["base"]),
                overlays: vec![UiOverlayProjection {
                    surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui")),
                    intent: Some(UiIntentProjection::new("close")),
                    provenance: provenance("runtime.menu", ["runtime.ui"]),
                    ..UiOverlayProjection::new("menu")
                }],
                ..Default::default()
            }),
            ..Default::default()
        },
    );

    assert_eq!(frame.summary.command_count, 1);
    assert_eq!(frame.summary.interactive_count, 1);
    assert_eq!(
        frame.summary.by_plane[&RenderPlane::Screen].command_count,
        1
    );
    assert_eq!(
        frame
            .passes
            .pass(RenderPlane::Screen)
            .unwrap()
            .command_count,
        1
    );
    assert_eq!(
        frame.resources.request("surface:ui/menu.qui").unwrap().kind,
        NativeResourceKind::UiAst
    );
    assert!(frame.assets.request("surface", "ui/menu.qui").is_some());

    match &frame.graph.commands()[0].params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.element_id, "menu");
            assert_eq!(params.intent.as_ref().unwrap().event, "ui/intent");
            assert_eq!(
                params.intent.as_ref().unwrap().action.as_deref(),
                Some("close")
            );
        }
        _ => panic!("expected ui surface params"),
    }
}

#[test]
fn includes_inline_ui_surface_node_resource_requests_in_prepared_frame() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            ui: Some(UiProjection {
                overlays: vec![UiOverlayProjection {
                    surface: Some(
                        UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                            UiSurfaceNodeProjection::new(
                                "root",
                                UiSurfaceNodeKind::Box,
                                ui_rect(0.0, 0.0, 420.0, 260.0),
                            )
                            .with_children(vec![
                                UiSurfaceNodeProjection::new(
                                    "poster",
                                    UiSurfaceNodeKind::Image,
                                    ui_rect(32.0, 32.0, 160.0, 96.0),
                                )
                                .with_image(UiSurfaceImageProjection::new("ui/poster.png")),
                                UiSurfaceNodeProjection::new(
                                    "close",
                                    UiSurfaceNodeKind::Button,
                                    ui_rect(280.0, 184.0, 96.0, 44.0),
                                )
                                .with_text("Close")
                                .with_intent(UiIntentProjection::new("close")),
                            ]),
                        ),
                    ),
                    provenance: provenance("runtime.menu", ["runtime.ui"]),
                    ..UiOverlayProjection::new("menu")
                }],
                ..Default::default()
            }),
            ..Default::default()
        },
    );

    assert_eq!(frame.summary.command_count, 4);
    assert_eq!(frame.summary.interactive_count, 2);
    assert_eq!(
        frame
            .passes
            .pass(RenderPlane::Screen)
            .unwrap()
            .command_count,
        4
    );
    assert_eq!(
        frame.resources.request("surface:ui/menu.qui").unwrap().kind,
        NativeResourceKind::UiAst
    );
    assert_eq!(
        frame
            .resources
            .request("images:ui/poster.png")
            .unwrap()
            .kind,
        NativeResourceKind::Texture
    );
    assert!(frame.assets.request("surface", "ui/menu.qui").is_some());
    assert!(frame.assets.request("images", "ui/poster.png").is_some());

    let poster = frame.assets.request("images", "ui/poster.png").unwrap();
    assert!(poster.package_candidates.contains("runtime.menu"));
    assert!(poster.package_candidates.contains("runtime.ui"));
    assert!(!poster.package_candidates.contains("ui/menu.qui"));
}

fn view_with_background_character_and_choices() -> ViewProjection {
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

fn ui_rect(x: f64, y: f64, width: f64, height: f64) -> UiSurfaceNodeRect {
    UiSurfaceNodeRect {
        x,
        y,
        width,
        height,
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
