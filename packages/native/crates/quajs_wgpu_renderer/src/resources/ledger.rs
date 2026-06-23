use std::collections::BTreeMap;

use super::budget::{budget_violations, ResourceBudget, ResourceBudgetViolation};
use super::record::{NativeResourceRecord, ResourceId};
use super::summary::{package_summary_entry, PackageResourceSummary, ResourceLedgerSummary};
use super::unload::{PackageUnloadBlocker, PackageUnloadBlockerReason, PackageUnloadPlan};

#[derive(Clone, Debug, Default)]
pub struct NativeResourceLedger {
    resources: BTreeMap<ResourceId, NativeResourceRecord>,
}

impl NativeResourceLedger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.resources.len()
    }

    pub fn is_empty(&self) -> bool {
        self.resources.is_empty()
    }

    pub fn insert(&mut self, record: NativeResourceRecord) -> Option<NativeResourceRecord> {
        self.resources.insert(record.id.clone(), record)
    }

    pub fn remove(&mut self, id: impl Into<ResourceId>) -> Option<NativeResourceRecord> {
        self.resources.remove(&id.into())
    }

    pub fn get(&self, id: impl Into<ResourceId>) -> Option<&NativeResourceRecord> {
        self.resources.get(&id.into())
    }

    pub fn records(&self) -> impl Iterator<Item = &NativeResourceRecord> {
        self.resources.values()
    }

    pub fn summary(&self) -> ResourceLedgerSummary {
        let mut summary = ResourceLedgerSummary {
            total_count: self.resources.len(),
            ..Default::default()
        };

        for record in self.resources.values() {
            summary.total_memory.add_assign(record.memory);

            let kind_summary = summary.by_kind.entry(record.kind).or_default();
            kind_summary.count += 1;
            kind_summary.memory.add_assign(record.memory);

            if let Some(owner_package_id) = &record.owner_package_id {
                let package = package_summary_entry(&mut summary.by_package, owner_package_id);
                package.owned_count += 1;
                package.owned_memory.add_assign(record.memory);
            }

            for required_package_id in &record.required_package_ids {
                let package = package_summary_entry(&mut summary.by_package, required_package_id);
                package.dependent_count += 1;
                package.dependent_memory.add_assign(record.memory);
            }
        }

        summary
    }

    pub fn package_summary(&self, package_id: &str) -> PackageResourceSummary {
        self.summary()
            .by_package
            .get(package_id)
            .cloned()
            .unwrap_or_else(|| PackageResourceSummary {
                package_id: package_id.to_string(),
                ..Default::default()
            })
    }

    pub fn check_budget(&self, budget: &ResourceBudget) -> Vec<ResourceBudgetViolation> {
        budget_violations(&self.summary(), budget)
    }

    pub fn plan_package_unload(&self, package_id: &str) -> PackageUnloadPlan {
        let mut plan = PackageUnloadPlan {
            package_id: package_id.to_string(),
            ..Default::default()
        };

        for record in self.resources.values() {
            let owned_by_package = record.owner_package_id.as_deref() == Some(package_id);
            let requires_package = record.required_package_ids.contains(package_id);

            if owned_by_package {
                if record
                    .required_package_ids
                    .iter()
                    .any(|id| id != package_id)
                {
                    plan.blocked.push(PackageUnloadBlocker {
                        resource_id: record.id.clone(),
                        kind: record.kind,
                        owner_package_id: record.owner_package_id.clone(),
                        required_package_ids: record.required_package_ids.clone(),
                        reason: PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage,
                    });
                } else {
                    plan.releasable.push(record.id.clone());
                    plan.releasable_memory.add_assign(record.memory);
                }
            } else if requires_package {
                plan.blocked.push(PackageUnloadBlocker {
                    resource_id: record.id.clone(),
                    kind: record.kind,
                    owner_package_id: record.owner_package_id.clone(),
                    required_package_ids: record.required_package_ids.clone(),
                    reason: PackageUnloadBlockerReason::PackageRequiredByForeignResource,
                });
            }
        }

        plan
    }

    pub fn release_package_owned(&mut self, package_id: &str) -> Vec<NativeResourceRecord> {
        let ids: Vec<ResourceId> = self
            .resources
            .values()
            .filter(|record| {
                record.owner_package_id.as_deref() == Some(package_id)
                    && record
                        .required_package_ids
                        .iter()
                        .all(|required_package_id| required_package_id == package_id)
            })
            .map(|record| record.id.clone())
            .collect();

        ids.into_iter()
            .filter_map(|id| self.resources.remove(&id))
            .collect()
    }

    pub fn release_resource(&mut self, id: impl Into<ResourceId>) -> Option<NativeResourceRecord> {
        self.remove(id)
    }

    pub fn clear(&mut self) -> Vec<NativeResourceRecord> {
        std::mem::take(&mut self.resources).into_values().collect()
    }
}
