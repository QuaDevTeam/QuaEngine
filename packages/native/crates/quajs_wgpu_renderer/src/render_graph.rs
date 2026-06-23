pub mod batch;
pub mod command;
pub mod graph;
pub mod style;
pub mod summary;

pub use batch::{plan_draw_batches, DrawBatch, DrawBatchKey, DrawBatchPipeline};
pub use command::{DrawCommand, DrawCommandKind, LogicalRect, RenderPlane};
pub use graph::RenderGraph;
pub use style::{
    CharacterAnchor, CharacterDrawParams, DrawCommandParams, ImageDrawParams, MediaFit,
    MediaOrigin, PanelDrawParams, RendererIntent, TextAlign, TextDrawParams, UiButtonDrawParams,
    VideoDrawParams,
};
pub use summary::{
    RenderGraphPackageSummary, RenderGraphResourceSummary, RenderGraphSummary, RenderPlaneSummary,
};

#[cfg(test)]
mod tests;
