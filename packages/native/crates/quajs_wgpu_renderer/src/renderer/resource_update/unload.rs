use std::collections::BTreeSet;

use crate::resources::{
    NativeResourceKind, NativeResourceLedger, PackageUnloadBlocker, PackageUnloadBlockerReason,
    PackageUnloadPlan, ResourceId, ResourceMemory,
};

pub(in crate::renderer) fn apply_active_projection_unload_guard(
    plan: &mut PackageUnloadPlan,
    active_ids: &BTreeSet<ResourceId>,
    ledger: &NativeResourceLedger,
) {
    if active_ids.is_empty() || plan.releasable.is_empty() {
        return;
    }

    let mut guarded = Vec::new();
    plan.releasable.retain(|id| {
        let active = active_ids.contains(id);
        if active {
            guarded.push(id.clone());
        }
        !active
    });

    for id in guarded {
        if let Some(record) = ledger.get(id.clone()) {
            plan.blocked.push(PackageUnloadBlocker {
                resource_id: id,
                kind: record.kind,
                owner_package_id: record.owner_package_id.clone(),
                required_package_ids: record.required_package_ids.clone(),
                reason: PackageUnloadBlockerReason::ActiveFrameReference,
            });
        }
    }

    plan.releasable_memory = releasable_memory(&plan.releasable, ledger);
}

pub(in crate::renderer) fn apply_active_projection_package_unload_guard(
    plan: &mut PackageUnloadPlan,
    active_owner_package_ids: &BTreeSet<String>,
    active_required_package_ids: &BTreeSet<String>,
) {
    let package_is_owner = active_owner_package_ids.contains(&plan.package_id);
    let package_is_required = active_required_package_ids.contains(&plan.package_id);

    if (!package_is_owner && !package_is_required)
        || plan.blocked.iter().any(|blocker| {
            blocker.owner_package_id.as_deref() == Some(plan.package_id.as_str())
                || blocker.required_package_ids.contains(&plan.package_id)
        })
    {
        return;
    }

    plan.blocked.push(PackageUnloadBlocker {
        resource_id: ResourceId::new(active_projection_blocker_id(
            &plan.package_id,
            package_is_owner,
        )),
        kind: NativeResourceKind::RenderGraph,
        owner_package_id: package_is_owner.then(|| plan.package_id.clone()),
        required_package_ids: (!package_is_owner && package_is_required)
            .then(|| BTreeSet::from([plan.package_id.clone()]))
            .unwrap_or_default(),
        reason: PackageUnloadBlockerReason::ActiveProjectionReference,
    });
}

fn active_projection_blocker_id(package_id: &str, package_is_owner: bool) -> String {
    if package_is_owner {
        format!("projection:{package_id}")
    } else {
        format!("projection:required:{package_id}")
    }
}

fn releasable_memory(ids: &[ResourceId], ledger: &NativeResourceLedger) -> ResourceMemory {
    let mut memory = ResourceMemory::default();
    for id in ids {
        if let Some(record) = ledger.get(id.clone()) {
            memory.add_assign(record.memory);
        }
    }
    memory
}
