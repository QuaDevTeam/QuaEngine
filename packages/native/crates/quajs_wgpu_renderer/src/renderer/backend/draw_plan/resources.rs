use std::collections::BTreeSet;

use crate::render_graph::DrawCommandKind;
use crate::resources::{
    infer_resource_kind, is_missing_resource_kind_draw_blocking, NativeResourceKind,
    NativeResourceLedger, ResourceId, ResourceMemory,
};

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
        command_kind: DrawCommandKind,
    ) -> Self {
        let Some(record) = resources.get(resource_id.clone()) else {
            return Self::missing(resource_id.clone(), command_kind);
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

    fn missing(resource_id: ResourceId, command_kind: DrawCommandKind) -> Self {
        let kind = infer_resource_kind(&resource_id, command_kind);
        Self {
            resource_id,
            state: NativeBackendDrawResourceBindingState::Missing,
            kind: Some(kind),
            memory: ResourceMemory::default(),
            owner_package_id: None,
            required_package_ids: BTreeSet::new(),
            label: None,
        }
    }

    pub(super) fn blocks_draw(&self) -> bool {
        if self.state.is_resolved() {
            return false;
        }

        self.kind
            .map(is_missing_resource_kind_draw_blocking)
            .unwrap_or(true)
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
