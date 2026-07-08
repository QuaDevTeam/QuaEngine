pub mod assets;
pub mod audio;
pub mod budget;
pub mod fonts;
mod kind;
pub mod ledger;
pub mod plan;
pub mod record;
pub mod summary;
pub mod sync;
pub mod unload;

pub use assets::{
    is_declarative_asset_kind, plan_asset_requests, plan_texture_upload_requests,
    plan_texture_upload_sync, NativeAssetRequest, NativeAssetRequestPlan,
    NativeTextureUploadRequest, NativeTextureUploadRequestPlan, NativeTextureUploadSyncPlan,
};
pub use budget::{
    ResourceBudget, ResourceBudgetViolation, ResourceBudgetViolationCode, ResourceMemoryBudget,
};
pub use ledger::NativeResourceLedger;
pub use plan::{plan_render_graph_resources, RenderResourcePlan, RenderResourceRequest};
pub use record::{NativeResourceKind, NativeResourceRecord, ResourceId, ResourceMemory};
pub use summary::{
    PackageResourceSummary, ResourceKindSummary, ResourceLedgerSummary,
    ResourceMemoryPressureSummary,
};
pub use sync::{plan_frame_resource_sync, FrameResourceSyncPlan};
pub use unload::{PackageUnloadBlocker, PackageUnloadBlockerReason, PackageUnloadPlan};

pub(crate) use kind::{infer_resource_kind, is_missing_resource_kind_draw_blocking};

#[cfg(test)]
mod tests;
pub use audio::{
    audio_resource_records, plan_audio_asset_requests, plan_audio_resource_sync,
    AudioResourceSyncPlan,
};
pub use fonts::{
    font_face_resource_id, font_resource_records, plan_font_asset_requests,
    plan_font_resource_sync, FontResourceSyncPlan,
};
