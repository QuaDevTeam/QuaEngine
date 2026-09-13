use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::render_graph::{plan_render_passes, RenderGraph};
use crate::resources::{plan_asset_requests, plan_render_graph_resources};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

pub(super) fn view_with_ui_scroll() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            ..Default::default()
        }),
        dialogue: Some(DialogueProjection::say("Hello native")),
        choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
            "stay", "Stay",
        )])),
        ui: Some(UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "scroll",
                        UiSurfaceNodeKind::Scroll,
                        rect(20.0, 30.0, 300.0, 160.0),
                    )
                    .with_style(UiSurfaceResolvedStyle {
                        background_color: Some("#101820".to_string()),
                        border_radius: Some(12.0),
                        ..Default::default()
                    })
                    .with_children(vec![UiSurfaceNodeProjection::new(
                        "inside",
                        UiSurfaceNodeKind::Button,
                        rect(24.0, 44.0, 220.0, 56.0),
                    )
                    .with_text("Inside")
                    .with_intent(UiIntentProjection::new("inside"))]),
                ),
            ),
            ..UiOverlayProjection::new("menu")
        }])),
        ..Default::default()
    }
}

pub(super) fn empty_resource_ledger() -> NativeResourceLedger {
    NativeResourceLedger::new()
}

pub(super) fn ledger_with_background_and_surface() -> NativeResourceLedger {
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

pub(super) fn frame_from_graph(graph: RenderGraph) -> crate::frame::PreparedNativeFrame {
    let summary = graph.summary();
    let resources = plan_render_graph_resources(&graph);
    let assets = plan_asset_requests(&resources);
    let passes = plan_render_passes(&graph);

    crate::frame::PreparedNativeFrame {
        graph,
        summary,
        resources,
        assets,
        passes,
    }
}

pub(super) fn test_layout() -> ResolvedStageLayout {
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

fn rect(x: f64, y: f64, width: f64, height: f64) -> UiSurfaceNodeRect {
    UiSurfaceNodeRect {
        x,
        y,
        width,
        height,
    }
}
