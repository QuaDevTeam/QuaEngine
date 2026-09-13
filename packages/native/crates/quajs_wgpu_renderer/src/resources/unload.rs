use std::collections::BTreeSet;

use super::record::{NativeResourceKind, ResourceId, ResourceMemory};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackageUnloadPlan {
    pub package_id: String,
    pub releasable: Vec<ResourceId>,
    pub blocked: Vec<PackageUnloadBlocker>,
    pub releasable_memory: ResourceMemory,
}

impl PackageUnloadPlan {
    pub fn can_unload(&self) -> bool {
        self.blocked.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PackageUnloadBlocker {
    pub resource_id: ResourceId,
    pub kind: NativeResourceKind,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub reason: PackageUnloadBlockerReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PackageUnloadBlockerReason {
    ActiveFrameReference,
    ActiveProjectionReference,
    PackageRequiredByForeignResource,
    OwnerStillRequiredByForeignPackage,
}
