pub mod builder;
pub mod layout;
pub mod style;
pub mod surface;
pub mod types;

pub use builder::{append_ui_commands, build_ui_commands};
pub use types::{
    UiIntentProjection, UiOverlayProjection, UiOverlayRenderMode, UiOverlaySceneProjection,
    UiOverlaySceneShellProjection, UiOverlaySurfaceProjection, UiProjection,
    UiSurfaceBackgroundPositionProjection, UiSurfaceImageProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceObjectFitProjection,
    UiSurfaceResolvedStyle, UiSurfaceTextAlignProjection,
};

#[cfg(test)]
mod tests;
