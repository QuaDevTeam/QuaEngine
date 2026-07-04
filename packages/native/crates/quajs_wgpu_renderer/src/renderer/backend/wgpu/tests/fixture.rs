use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;

pub(super) fn view_with_ui_scroll() -> ViewProjection {
    let mut inside = UiSurfaceNodeProjection::new(
        "inside",
        UiSurfaceNodeKind::Button,
        rect(24.0, 44.0, 220.0, 56.0),
    )
    .with_text("Inside")
    .with_intent(UiIntentProjection::new("inside"));
    inside.provenance = provenance("runtime.menu", ["runtime.ui"]);

    let mut scroll = UiSurfaceNodeProjection::new(
        "scroll",
        UiSurfaceNodeKind::Scroll,
        rect(20.0, 30.0, 300.0, 160.0),
    )
    .with_style(UiSurfaceResolvedStyle {
        background_color: Some("#101820".to_string()),
        border_radius: Some(12.0),
        ..Default::default()
    })
    .with_children(vec![inside]);
    scroll.provenance = provenance("runtime.menu", ["runtime.ui"]);

    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            ..Default::default()
        }),
        ui: Some(UiProjection {
            visible: true,
            provenance: provenance("runtime.ui", ["base"]),
            overlays: vec![UiOverlayProjection {
                interactive: Some(false),
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(scroll)),
                provenance: provenance("runtime.menu", ["runtime.ui"]),
                ..UiOverlayProjection::new("menu")
            }],
        }),
        ..Default::default()
    }
}

pub(super) fn view_with_clipped_ui_scroll() -> ViewProjection {
    let mut outside = UiSurfaceNodeProjection::new(
        "outside",
        UiSurfaceNodeKind::Button,
        rect(24.0, 150.0, 220.0, 80.0),
    )
    .with_text("Outside")
    .with_intent(UiIntentProjection::new("outside"));
    outside.provenance = provenance("runtime.menu", ["runtime.ui"]);

    let mut scroll = UiSurfaceNodeProjection::new(
        "scroll",
        UiSurfaceNodeKind::Scroll,
        rect(20.0, 30.0, 300.0, 160.0),
    )
    .with_style(UiSurfaceResolvedStyle {
        background_color: Some("#101820".to_string()),
        border_radius: Some(12.0),
        ..Default::default()
    })
    .with_children(vec![outside]);
    scroll.provenance = provenance("runtime.menu", ["runtime.ui"]);

    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            ..Default::default()
        }),
        ui: Some(UiProjection {
            visible: true,
            provenance: provenance("runtime.ui", ["base"]),
            overlays: vec![UiOverlayProjection {
                interactive: Some(false),
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(scroll)),
                provenance: provenance("runtime.menu", ["runtime.ui"]),
                ..UiOverlayProjection::new("menu")
            }],
        }),
        ..Default::default()
    }
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required.into_iter().map(str::to_string).collect(),
    }
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> UiSurfaceNodeRect {
    UiSurfaceNodeRect {
        x,
        y,
        width,
        height,
    }
}
