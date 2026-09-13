use crate::resources::ResourceId;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuNativeRenderDecodedTextureCleanupReport {
    pub released_resource_ids: Vec<ResourceId>,
    pub missing_resource_ids: Vec<ResourceId>,
    pub ignored_resource_ids: Vec<ResourceId>,
}

impl WgpuNativeRenderDecodedTextureCleanupReport {
    pub fn is_empty(&self) -> bool {
        self.released_resource_ids.is_empty()
            && self.missing_resource_ids.is_empty()
            && self.ignored_resource_ids.is_empty()
    }
}
