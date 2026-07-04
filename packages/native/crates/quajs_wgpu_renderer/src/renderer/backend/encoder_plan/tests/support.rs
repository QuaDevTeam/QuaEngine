use super::*;

pub(super) fn submission_with_empty_resources(
    revision: u64,
) -> (
    crate::frame::PreparedNativeFrame,
    NativeResourceLedger,
    NativeRenderSubmission,
) {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = NativeResourceLedger::new();
    let submission = NativeRenderFrameRef {
        revision,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    (frame, resources, submission)
}

pub(super) fn draw_plan_with_empty_resources(revision: u64) -> NativeBackendDrawPlan {
    let (_frame, _resources, submission) = submission_with_empty_resources(revision);
    NativeBackendDrawPlan::from_submission(&submission)
}

pub(super) fn draw_plan_with_resolved_resources(revision: u64) -> NativeBackendDrawPlan {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = ledger_with_background_and_surface();
    let submission = NativeRenderFrameRef {
        revision,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources)
}

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
