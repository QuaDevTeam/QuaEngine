use crate::frame::prepare_native_frame;
use crate::projection::common::FontFamilyProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceImageProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawCommandParams, RenderPlane};
use crate::resources::NativeResourceKind;

use super::support::{provenance, test_layout, ui_rect};

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
                                .with_intent(UiIntentProjection::new("close"))
                                .with_style(
                                    UiSurfaceResolvedStyle {
                                        font_family: Some(FontFamilyProjection::new(["Menu Face"])),
                                        ..Default::default()
                                    },
                                ),
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
    assert_eq!(
        frame.resources.request("fonts:Menu Face").unwrap().kind,
        NativeResourceKind::FontFace
    );
    assert!(frame.assets.request("surface", "ui/menu.qui").is_some());
    assert!(frame.assets.request("images", "ui/poster.png").is_some());
    assert!(frame.assets.request("fonts", "Menu Face").is_some());

    let poster = frame.assets.request("images", "ui/poster.png").unwrap();
    assert!(poster.package_candidates.contains("runtime.menu"));
    assert!(poster.package_candidates.contains("runtime.ui"));
    assert!(!poster.package_candidates.contains("ui/menu.qui"));

    let font = frame.assets.request("fonts", "Menu Face").unwrap();
    assert!(font.package_candidates.contains("runtime.menu"));
    assert!(font.package_candidates.contains("runtime.ui"));
}
