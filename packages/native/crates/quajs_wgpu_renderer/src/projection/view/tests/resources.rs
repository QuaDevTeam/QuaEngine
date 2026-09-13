use super::support::{full_view, provenance, test_layout};
use super::*;
use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
};
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderPlane};
use crate::resources::ResourceId;

#[test]
fn summarizes_combined_projection_resources_and_packages() {
    let graph = build_view_render_graph(test_layout(), &full_view());
    let summary = graph.summary();

    assert_eq!(summary.command_count, 17);
    assert_eq!(summary.interactive_count, 1);
    assert_eq!(summary.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(summary.by_plane[&RenderPlane::Subject].command_count, 1);
    assert_eq!(summary.by_plane[&RenderPlane::Safe].command_count, 15);
    assert_eq!(summary.by_package["base"].resource_ref_count, 2);
    assert_eq!(summary.by_package["runtime.dialogue"].command_count, 12);
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
