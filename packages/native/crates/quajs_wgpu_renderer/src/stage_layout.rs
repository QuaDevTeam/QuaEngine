pub mod coordinates;
pub mod presets;
pub mod resolve;
pub mod types;

pub use coordinates::{client_point_to_stage_logical, stage_logical_to_client_point};
pub use presets::{create_view_layout_projection, landscape_layout, portrait_layout};
pub use resolve::resolve_stage_layout;
pub use types::{
    ResolvedStageLayout, StageClientPoint, StageClientRectOrigin, StageContainerInput,
    StageContainerSize, StageHitTestPoint, StageLogicalPoint, StageSafeArea, StageSafeAreaInsets,
    ViewLayoutInput, ViewLayoutOrientation, ViewLayoutProjection, ViewLayoutScaleMode,
};

#[cfg(test)]
mod tests;
