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
    UiSurfaceBackdropFilterProjection, UiSurfaceBackgroundPositionProjection,
    UiSurfaceBorderStyleProjection, UiSurfaceControlOptionProjection, UiSurfaceControlProjection,
    UiSurfaceEdgeInsetsProjection, UiSurfaceFilterProjection, UiSurfaceFontStyleProjection,
    UiSurfaceGradientKindProjection, UiSurfaceGradientProjection, UiSurfaceGradientStopProjection,
    UiSurfaceImageProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection, UiSurfaceNodeRect,
    UiSurfaceNodeStateProjection, UiSurfaceObjectFitProjection, UiSurfacePseudoStateProjection,
    UiSurfaceRadialGradientShapeProjection, UiSurfaceRangeControlPartsProjection,
    UiSurfaceResolvedStyle, UiSurfaceSelectControlPartsProjection, UiSurfaceShadowProjection,
    UiSurfaceSwitchControlPartsProjection, UiSurfaceTextAlignProjection,
    UiSurfaceTextDecorationProjection, UiSurfaceTextOverflowProjection,
    UiSurfaceTextTransformProjection, UiSurfaceTransitionEasingProjection,
    UiSurfaceTransitionProjection, UiSurfaceTransitionPropertyProjection,
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

pub(super) fn default_one_f64() -> f64 {
    1.0
}

pub(super) fn is_one_f64_ref(value: &f64) -> bool {
    *value == 1.0
}
