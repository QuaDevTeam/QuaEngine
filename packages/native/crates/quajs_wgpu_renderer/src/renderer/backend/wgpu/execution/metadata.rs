use std::collections::BTreeSet;

use crate::render_graph::{DrawCommandParams, LogicalRect};

use super::super::super::NativeBackendDrawCommandMetadata;

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderDrawMetadata {
    pub bounds: LogicalRect,
    pub opacity: f32,
    pub params: DrawCommandParams,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

impl WgpuNativeRenderDrawMetadata {
    pub(super) fn from_command_metadata(metadata: &NativeBackendDrawCommandMetadata) -> Self {
        Self {
            bounds: metadata.bounds,
            opacity: metadata.opacity,
            params: metadata.params.clone(),
            owner_package_id: metadata.owner_package_id.clone(),
            required_package_ids: metadata.required_package_ids.clone(),
        }
    }
}
