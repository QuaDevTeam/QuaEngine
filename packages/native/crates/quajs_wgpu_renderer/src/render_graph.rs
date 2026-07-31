pub mod batch;
pub mod command;
pub mod graph;
pub mod pass;
pub mod style;
pub mod summary;

pub use batch::{plan_draw_batches, DrawBatch, DrawBatchKey, DrawBatchPipeline};
pub use command::{
    DrawCommand, DrawCommandKind, DrawCommandVariant, DrawInteractionState, LogicalRect,
    RenderPlane,
};
pub use graph::RenderGraph;
pub use pass::{plan_render_passes, RenderPass, RenderPassPlan, RenderViewport};
pub use style::{
    BackdropBlurDrawParams, BorderDrawParams, CharacterAnchor, CharacterDrawParams,
    DrawCommandParams, DrawTransition, DrawTransitionEasing, DrawTransitionProperty,
    EdgeInsetsDrawParam, FontStyleDrawParam, FontWeightDrawParam, GradientDrawKind,
    GradientDrawParams, GradientDrawRadialShape, ImageDrawParams, MediaFit, MediaOrigin,
    PanelDrawParams, RendererIntent, ShadowDrawParams, ShadowDrawStyle, TextAlign,
    TextDecorationDrawParam, TextDrawParams, TextOverflowDrawParam, TextTransformDrawParam,
    UiButtonDrawParams, UiControlDrawParam, UiControlOptionDrawParam, UiControlPartsDrawParam,
    UiSurfaceDrawParams, VideoDrawParams, WhiteSpaceDrawParam,
};
pub use summary::{
    RenderGraphPackageSummary, RenderGraphResourceSummary, RenderGraphSummary, RenderPlaneSummary,
};

#[cfg(test)]
mod tests;
