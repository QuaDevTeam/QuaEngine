use std::collections::{BTreeMap, BTreeSet};

use crate::resources::{NativeResourceKind, NativeResourceLedger, ResourceId, ResourceMemory};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRenderResourceMemoryBreakdown {
    pub total: ResourceMemory,
    pub by_kind: BTreeMap<NativeResourceKind, ResourceMemory>,
    pub by_owner_package: BTreeMap<String, ResourceMemory>,
    pub by_required_package: BTreeMap<String, ResourceMemory>,
}

pub(in crate::renderer::backend::submission) fn partition_resource_ids(
    resource_ids: &[ResourceId],
    resources: &NativeResourceLedger,
) -> (Vec<ResourceId>, Vec<ResourceId>) {
    let mut resolved_resource_ids = Vec::new();
    let mut missing_resource_ids = Vec::new();

    for id in resource_ids {
        if resources.get(id.clone()).is_some() {
            resolved_resource_ids.push(id.clone());
        } else {
            missing_resource_ids.push(id.clone());
        }
    }

    (resolved_resource_ids, missing_resource_ids)
}

pub(in crate::renderer::backend::submission) fn summarize_resolved_resources<I>(
    resource_ids: I,
    resources: &NativeResourceLedger,
) -> NativeRenderResourceMemoryBreakdown
where
    I: IntoIterator<Item = ResourceId>,
{
    let mut seen = BTreeSet::new();
    let mut summary = NativeRenderResourceMemoryBreakdown::default();

    for id in resource_ids {
        if !seen.insert(id.clone()) {
            continue;
        }

        if let Some(record) = resources.get(id) {
            summary.total.add_assign(record.memory);
            summary
                .by_kind
                .entry(record.kind)
                .or_default()
                .add_assign(record.memory);

            if let Some(owner_package_id) = &record.owner_package_id {
                summary
                    .by_owner_package
                    .entry(owner_package_id.clone())
                    .or_default()
                    .add_assign(record.memory);
            }

            for required_package_id in &record.required_package_ids {
                summary
                    .by_required_package
                    .entry(required_package_id.clone())
                    .or_default()
                    .add_assign(record.memory);
            }
        }
    }

    summary
}
