use std::collections::BTreeSet;

use crate::resources::{NativeResourceKind, NativeResourceLedger, ResourceId, ResourceMemory};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeBackendDrawResourceBinding {
    pub resource_id: ResourceId,
    pub state: NativeBackendDrawResourceBindingState,
    pub kind: Option<NativeResourceKind>,
    pub memory: ResourceMemory,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub label: Option<String>,
}

impl NativeBackendDrawResourceBinding {
    pub(super) fn from_resource_id(
        resource_id: &ResourceId,
        resources: &NativeResourceLedger,
    ) -> Self {
        let Some(record) = resources.get(resource_id.clone()) else {
            return Self::missing(resource_id.clone());
        };

        Self {
            resource_id: resource_id.clone(),
            state: NativeBackendDrawResourceBindingState::Resolved,
            kind: Some(record.kind),
            memory: record.memory,
            owner_package_id: record.owner_package_id.clone(),
            required_package_ids: record.required_package_ids.clone(),
            label: record.label.clone(),
        }
    }

    fn missing(resource_id: ResourceId) -> Self {
        Self {
            resource_id,
            state: NativeBackendDrawResourceBindingState::Missing,
            kind: None,
            memory: ResourceMemory::default(),
            owner_package_id: None,
            required_package_ids: BTreeSet::new(),
            label: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeBackendDrawResourceBindingState {
    Resolved,
    Missing,
}

impl NativeBackendDrawResourceBindingState {
    pub fn is_resolved(self) -> bool {
        self == Self::Resolved
    }
}
