use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::ui::{
    UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceImageProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;

pub(super) fn solid_ui_view() -> ViewProjection {
    let mut panel = UiSurfaceNodeProjection::new(
        "panel",
        UiSurfaceNodeKind::Panel,
        UiSurfaceNodeRect {
            x: 96.0,
            y: 88.0,
            width: 420.0,
            height: 168.0,
        },
    )
    .with_style(UiSurfaceResolvedStyle {
        background_color: Some("#335577".to_string()),
        border_color: Some("#ffffff".to_string()),
        border_width: Some(2.0),
        border_radius: Some(10.0),
        ..Default::default()
    });
    panel.provenance = PackageProvenance {
        content_package_id: Some("runtime.menu".to_string()),
        required_runtime_packages: ["runtime.ui".to_string()].into_iter().collect(),
    };

    ViewProjection {
        ui: Some(UiProjection {
            visible: true,
            provenance: PackageProvenance {
                content_package_id: Some("runtime.ui".to_string()),
                required_runtime_packages: ["base".to_string()].into_iter().collect(),
            },
            overlays: vec![UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(panel)),
                provenance: PackageProvenance {
                    content_package_id: Some("runtime.menu".to_string()),
                    required_runtime_packages: ["runtime.ui".to_string()].into_iter().collect(),
                },
                ..UiOverlayProjection::new("menu")
            }],
        }),
        ..Default::default()
    }
}

pub(super) fn mixed_ui_view() -> ViewProjection {
    let root = UiSurfaceNodeProjection::new(
        "root",
        UiSurfaceNodeKind::Panel,
        UiSurfaceNodeRect {
            x: 64.0,
            y: 64.0,
            width: 640.0,
            height: 260.0,
        },
    )
    .with_style(UiSurfaceResolvedStyle {
        background_color: Some("#203850".to_string()),
        border_color: Some("#ffffff".to_string()),
        border_width: Some(2.0),
        border_radius: Some(8.0),
        ..Default::default()
    })
    .with_children(vec![
        UiSurfaceNodeProjection::new(
            "icon",
            UiSurfaceNodeKind::Image,
            UiSurfaceNodeRect {
                x: 96.0,
                y: 100.0,
                width: 96.0,
                height: 96.0,
            },
        )
        .with_image(UiSurfaceImageProjection::new("ui/icon.png")),
        UiSurfaceNodeProjection::new(
            "label",
            UiSurfaceNodeKind::Text,
            UiSurfaceNodeRect {
                x: 224.0,
                y: 120.0,
                width: 360.0,
                height: 48.0,
            },
        )
        .with_text("Mixed native UI")
        .with_style(UiSurfaceResolvedStyle {
            color: Some("#e8f0ff".to_string()),
            font_size: Some(28.0),
            ..Default::default()
        }),
    ]);

    ViewProjection {
        ui: Some(UiProjection {
            visible: true,
            provenance: PackageProvenance {
                content_package_id: Some("runtime.ui".to_string()),
                required_runtime_packages: ["base".to_string()].into_iter().collect(),
            },
            overlays: vec![UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("ui/mixed.qui").with_root(root)),
                provenance: PackageProvenance {
                    content_package_id: Some("runtime.mixed".to_string()),
                    required_runtime_packages: ["runtime.ui".to_string()].into_iter().collect(),
                },
                ..UiOverlayProjection::new("mixed")
            }],
        }),
        ..Default::default()
    }
}

pub(super) fn text_ui_view() -> ViewProjection {
    let mut label = UiSurfaceNodeProjection::new(
        "label",
        UiSurfaceNodeKind::Text,
        UiSurfaceNodeRect {
            x: 96.0,
            y: 120.0,
            width: 520.0,
            height: 44.0,
        },
    )
    .with_text("Native text placeholder")
    .with_style(UiSurfaceResolvedStyle {
        color: Some("#e8f0ff".to_string()),
        font_size: Some(28.0),
        ..Default::default()
    });
    label.provenance = PackageProvenance {
        content_package_id: Some("runtime.caption".to_string()),
        required_runtime_packages: ["runtime.ui".to_string()].into_iter().collect(),
    };

    ViewProjection {
        ui: Some(UiProjection {
            visible: true,
            provenance: PackageProvenance {
                content_package_id: Some("runtime.ui".to_string()),
                required_runtime_packages: ["base".to_string()].into_iter().collect(),
            },
            overlays: vec![UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("ui/caption.qui").with_root(label)),
                provenance: PackageProvenance {
                    content_package_id: Some("runtime.caption".to_string()),
                    required_runtime_packages: ["runtime.ui".to_string()].into_iter().collect(),
                },
                ..UiOverlayProjection::new("caption")
            }],
        }),
        ..Default::default()
    }
}

pub(super) fn textured_background_view(asset_name: &str) -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some(asset_name.to_string()),
            provenance: PackageProvenance {
                content_package_id: Some("runtime.bg".to_string()),
                required_runtime_packages: ["base".to_string()].into_iter().collect(),
            },
            ..Default::default()
        }),
        ..Default::default()
    }
}

pub(super) fn contains_f32_sequence(bytes: &[u8], expected: &[f32]) -> bool {
    let floats = bytes
        .chunks_exact(std::mem::size_of::<f32>())
        .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
        .collect::<Vec<_>>();
    floats.windows(expected.len()).any(|window| {
        window
            .iter()
            .zip(expected)
            .all(|(actual, expected)| (actual - expected).abs() <= f32::EPSILON)
    })
}
