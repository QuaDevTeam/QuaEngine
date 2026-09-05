pub mod builder;
pub mod layout;
pub mod style;
pub mod surface;
pub mod types;

pub use builder::{append_ui_commands, build_ui_commands};
pub use types::{
    UiIntentProjection, UiOverlayProjection, UiOverlayRenderMode, UiOverlaySceneProjection,
    UiOverlaySceneShellProjection, UiOverlaySurfaceProjection, UiProjection,
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

#[cfg(test)]
mod tests;
