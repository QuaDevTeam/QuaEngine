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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceMemoryPressureSummary {
    pub total_count: usize,
    pub total_memory: ResourceMemory,
    pub largest_kind: Option<NativeResourceKind>,
    pub largest_kind_memory: ResourceMemory,
    pub largest_owner_package_id: Option<String>,
    pub largest_owner_package_memory: ResourceMemory,
    pub largest_dependent_package_id: Option<String>,
    pub largest_dependent_package_memory: ResourceMemory,
}

impl ResourceLedgerSummary {
    pub fn memory_pressure(&self) -> ResourceMemoryPressureSummary {
        let (largest_kind, largest_kind_memory) = self
            .by_kind
            .iter()
            .max_by_key(|(kind, summary)| (summary.memory.total_bytes(), **kind))
            .map(|(kind, summary)| (Some(*kind), summary.memory))
            .unwrap_or_default();
        let (largest_owner_package_id, largest_owner_package_memory) = self
            .by_package
            .iter()
            .max_by_key(|(package_id, summary)| {
                (summary.owned_memory.total_bytes(), package_id.as_str())
            })
            .map(|(package_id, summary)| (Some(package_id.clone()), summary.owned_memory))
            .unwrap_or_default();
        let (largest_dependent_package_id, largest_dependent_package_memory) = self
            .by_package
            .iter()
            .max_by_key(|(package_id, summary)| {
                (summary.dependent_memory.total_bytes(), package_id.as_str())
            })
            .map(|(package_id, summary)| (Some(package_id.clone()), summary.dependent_memory))
            .unwrap_or_default();

        ResourceMemoryPressureSummary {
            total_count: self.total_count,
            total_memory: self.total_memory,
            largest_kind,
            largest_kind_memory,
            largest_owner_package_id,
            largest_owner_package_memory,
            largest_dependent_package_id,
            largest_dependent_package_memory,
        }
    }
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
