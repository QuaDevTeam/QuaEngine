mod intent;
mod overlay;
mod projection;
mod surface;

pub use intent::UiIntentProjection;
pub use overlay::{
    UiOverlayProjection, UiOverlayRenderMode, UiOverlaySceneProjection,
    UiOverlaySceneShellProjection, UiOverlaySurfaceProjection,
};
pub use projection::UiProjection;
pub use surface::{
    UiSurfaceBackgroundPositionProjection, UiSurfaceBorderStyleProjection,
    UiSurfaceEdgeInsetsProjection, UiSurfaceFontStyleProjection, UiSurfaceImageProjection,
    UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceObjectFitProjection,
    UiSurfaceResolvedStyle, UiSurfaceTextAlignProjection, UiSurfaceTextDecorationProjection,
    UiSurfaceTextOverflowProjection, UiSurfaceTextTransformProjection,
    UiSurfaceWhiteSpaceProjection,
};

fn default_image_asset_type() -> String {
    "images".to_string()
}

fn default_ui_intent_event() -> String {
    "ui/intent".to_string()
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn is_zero_f64(value: &f64) -> bool {
    *value == 0.0
}
