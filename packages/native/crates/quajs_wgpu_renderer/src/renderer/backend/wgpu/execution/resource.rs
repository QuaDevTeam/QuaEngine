use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};

use super::super::super::NativeBackendCommandStreamResource;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WgpuNativeRenderOperationBoundResource {
    pub resource_id: ResourceId,
    pub kind: NativeResourceKind,
    pub memory: ResourceMemory,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
    pub label: Option<String>,
}

impl WgpuNativeRenderOperationBoundResource {
    pub(super) fn from_command_stream_resource(
        resource: &NativeBackendCommandStreamResource,
    ) -> Self {
        Self {
            resource_id: resource.resource_id.clone(),
            kind: resource.kind,
            memory: resource.memory,
            owner_package_id: resource.owner_package_id.clone(),
            required_package_ids: resource.required_package_ids.iter().cloned().collect(),
            label: resource.label.clone(),
        }
    }
}
