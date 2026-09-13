use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::render_graph::DrawCommandParams;
use crate::renderer::backend::{
    NativeBackendDrawPlan, NativeBackendEncoderPlan, NativeRenderFrameRef,
};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

mod lowering;
mod validation;

fn view_with_ui_scroll() -> ViewProjection {
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
        dialogue: Some(DialogueProjection::say("Hello native")),
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

fn view_with_structural_clip_children() -> ViewProjection {
    let inside = UiSurfaceNodeProjection::new(
        "inside",
        UiSurfaceNodeKind::Button,
        rect(60.0, 60.0, 180.0, 140.0),
    )
    .with_text("Inside")
    .with_intent(UiIntentProjection::new("inside"));

    let row = UiSurfaceNodeProjection {
        clip_children: true,
        ..UiSurfaceNodeProjection::new("row", UiSurfaceNodeKind::Row, rect(40.0, 40.0, 220.0, 90.0))
    }
    .with_children(vec![inside]);

    ViewProjection {
        ui: Some(UiProjection {
            visible: true,
            overlays: vec![UiOverlayProjection {
                interactive: Some(false),
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(row)),
                ..UiOverlayProjection::new("menu")
            }],
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn view_with_layer_clip_children() -> ViewProjection {
    let inside = UiSurfaceNodeProjection::new(
        "inside",
        UiSurfaceNodeKind::Button,
        rect(60.0, 60.0, 180.0, 140.0),
    )
    .with_text("Inside")
    .with_intent(UiIntentProjection::new("inside"));

    let layer = UiSurfaceNodeProjection {
        clip_children: true,
        z_index: 30,
        ..UiSurfaceNodeProjection::new(
            "foreground",
            UiSurfaceNodeKind::Layer,
            rect(40.0, 40.0, 220.0, 90.0),
        )
    }
    .with_children(vec![inside]);

    ViewProjection {
        ui: Some(UiProjection {
            visible: true,
            overlays: vec![UiOverlayProjection {
                interactive: Some(false),
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(layer)),
                ..UiOverlayProjection::new("menu")
            }],
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn manual_command_stream(
    commands: Vec<NativeBackendCommandStreamCommand>,
) -> NativeBackendCommandStreamPlan {
    let draw_command_count = commands
        .iter()
        .filter(|command| matches!(command, NativeBackendCommandStreamCommand::Draw { .. }))
        .count();
    let skipped_draw_command_count = commands
        .iter()
        .filter(|command| matches!(command, NativeBackendCommandStreamCommand::SkipDraw { .. }))
        .count();
    let command_count = commands.len();

    NativeBackendCommandStreamPlan {
        revision: 9001,
        pass_count: 1,
        command_count,
        draw_command_count,
        skipped_draw_command_count,
        passes: vec![NativeBackendCommandStreamPass {
            pass_index: 0,
            plane: RenderPlane::Overlay,
            viewport: RenderViewport::from_layout(&test_layout()),
            command_count,
            draw_command_count,
            skipped_draw_command_count,
            commands,
        }],
    }
}

fn default_metadata() -> NativeBackendDrawCommandMetadata {
    NativeBackendDrawCommandMetadata::default()
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required.into_iter().map(str::to_string).collect(),
    }
}

fn ledger_with_background_and_surface() -> NativeResourceLedger {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .owned_by("base")
        .require_package("base")
        .memory(512, 4096)
        .label("school background"),
    );
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("surface:ui/menu.qui"),
            NativeResourceKind::UiAst,
        )
        .owned_by("runtime.ui")
        .require_package("runtime.ui")
        .memory(256, 0)
        .label("menu surface"),
    );
    resources
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> UiSurfaceNodeRect {
    UiSurfaceNodeRect {
        x,
        y,
        width,
        height,
    }
}

fn test_layout() -> crate::stage_layout::ResolvedStageLayout {
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
