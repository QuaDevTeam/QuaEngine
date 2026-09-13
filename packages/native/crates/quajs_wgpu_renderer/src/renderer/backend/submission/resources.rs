mod diagnostics;
mod memory;
mod missing;
mod policy;

pub use diagnostics::NativeRenderBackendResourceDiagnostics;
pub use memory::NativeRenderResourceMemoryBreakdown;
pub use missing::NativeRenderMissingResource;
pub use policy::NativeRenderBackendResourcePolicy;

pub(super) use memory::{partition_resource_ids, summarize_resolved_resources};
pub(super) use missing::collect_missing_resources;

#[cfg(test)]
mod tests;
