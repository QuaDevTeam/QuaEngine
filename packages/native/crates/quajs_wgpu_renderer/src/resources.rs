pub mod assets;
pub mod audio;
pub mod budget;
pub mod ledger;
pub mod plan;
pub mod record;
pub mod summary;
pub mod sync;
pub mod unload;

pub use assets::{plan_asset_requests, NativeAssetRequest, NativeAssetRequestPlan};
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

#[cfg(test)]
mod tests;
pub use audio::{audio_resource_records, plan_audio_resource_sync, AudioResourceSyncPlan};
