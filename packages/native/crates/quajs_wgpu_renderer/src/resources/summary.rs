use std::collections::BTreeMap;

use super::record::{NativeResourceKind, ResourceMemory};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceKindSummary {
    pub count: usize,
    pub memory: ResourceMemory,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackageResourceSummary {
    pub package_id: String,
    pub owned_count: usize,
    pub dependent_count: usize,
    pub owned_memory: ResourceMemory,
    pub dependent_memory: ResourceMemory,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceLedgerSummary {
    pub total_count: usize,
    pub total_memory: ResourceMemory,
    pub by_kind: BTreeMap<NativeResourceKind, ResourceKindSummary>,
    pub by_package: BTreeMap<String, PackageResourceSummary>,
}

pub(crate) fn package_summary_entry<'a>(
    packages: &'a mut BTreeMap<String, PackageResourceSummary>,
    package_id: &str,
) -> &'a mut PackageResourceSummary {
    packages
        .entry(package_id.to_string())
        .or_insert_with(|| PackageResourceSummary {
            package_id: package_id.to_string(),
            ..Default::default()
        })
}
