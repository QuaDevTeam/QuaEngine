use super::fixtures::{empty_resource_ledger, test_layout};
use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::common::FontFamilyProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::renderer::backend::NativeRenderFrameRef;
use crate::resources::{NativeResourceKind, ResourceId};

#[test]
fn treats_missing_font_resources_as_non_blocking_for_placeholder_text_and_buttons() {
    let frame = prepare_native_frame(test_layout(), &view_with_missing_font_ui());
    let resources = empty_resource_ledger();
    let submission = NativeRenderFrameRef {
        revision: 26,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let commands = plan.commands().collect::<Vec<_>>();
    let title = commands
        .iter()
        .find(|command| command.command_id == "ui:font-menu:title")
        .unwrap();
    let confirm = commands
        .iter()
        .find(|command| command.command_id == "ui:font-menu:confirm")
        .unwrap();

    assert_eq!(
        title.resource_ids,
        vec![ResourceId::from("fonts:Missing Serif")]
    );
    assert_eq!(
        title.missing_resource_ids,
        vec![ResourceId::from("fonts:Missing Serif")]
    );
    assert_eq!(
        title.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    assert_eq!(
        title.resource_bindings[0].kind,
        Some(NativeResourceKind::FontFace)
    );

    assert_eq!(
        confirm.resource_ids,
        vec![
            ResourceId::from("fonts:Missing UI"),
            ResourceId::from("fonts:Fallback UI"),
        ]
    );
    assert_eq!(
        confirm.missing_resource_ids,
        vec![
            ResourceId::from("fonts:Missing UI"),
            ResourceId::from("fonts:Fallback UI"),
        ]
    );
    assert_eq!(
        confirm.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    assert_eq!(confirm.resource_bindings.len(), 2);
    assert!(confirm
        .resource_bindings
        .iter()
        .all(|binding| binding.kind == Some(NativeResourceKind::FontFace)));

    assert_eq!(plan.blocked_command_count, 1);
    let mut drawable_command_ids = plan
        .drawable_commands()
        .map(|command| command.command_id.as_str())
        .collect::<Vec<_>>();
    drawable_command_ids.sort_unstable();
    assert_eq!(
        drawable_command_ids,
        vec![
            "ui:font-menu:confirm",
            "ui:font-menu:root",
            "ui:font-menu:title",
        ]
    );
}

fn view_with_missing_font_ui() -> ViewProjection {
    ViewProjection {
        ui: Some(UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/font-menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "root",
                        UiSurfaceNodeKind::Box,
                        ui_rect(0.0, 0.0, 640.0, 240.0),
                    )
                    .with_children(vec![
                        UiSurfaceNodeProjection::new(
                            "title",
                            UiSurfaceNodeKind::Text,
                            ui_rect(32.0, 32.0, 420.0, 48.0),
                        )
                        .with_text("Fallback text stays visible")
                        .with_style(UiSurfaceResolvedStyle {
                            font_family: Some(FontFamilyProjection::new(["Missing Serif"])),
                            ..Default::default()
                        }),
                        UiSurfaceNodeProjection::new(
                            "confirm",
                            UiSurfaceNodeKind::Button,
                            ui_rect(32.0, 112.0, 240.0, 64.0),
                        )
                        .with_text("Continue")
                        .with_intent(UiIntentProjection::new("continue"))
                        .with_style(UiSurfaceResolvedStyle {
                            font_family: Some(FontFamilyProjection::new([
                                "Missing UI",
                                "Fallback UI",
                            ])),
                            ..Default::default()
                        }),
                    ]),
                ),
            ),
            ..UiOverlayProjection::new("font-menu")
        }])),
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
