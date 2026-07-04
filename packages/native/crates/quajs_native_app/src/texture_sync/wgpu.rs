use quajs_wgpu_renderer::renderer::{
    InMemoryWgpuNativeRenderRuntimeExecutor, RealWgpuNativeRenderRuntimeDevice,
    WgpuNativeRenderBackend, WgpuNativeRenderRuntimeError,
};
use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, ResourceId};

use super::{NativeTextureUploadMetadata, NativeTextureUploadSink};

impl NativeTextureUploadSink
    for WgpuNativeRenderBackend<
        InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice>,
    >
{
    type Error = WgpuNativeRenderRuntimeError;

    fn upload_texture_bytes(
        &mut self,
        request: &NativeTextureUploadRequest,
        bytes: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error> {
        let metadata =
            quajs_wgpu_renderer::renderer::backend::wgpu::RealWgpuDecodedTextureMetadata {
                owner_package_id: metadata.owner_package_id,
                required_package_ids: metadata.required_package_ids,
            };
        self.upload_image_texture_bytes_with_metadata(request.resource_id.as_str(), bytes, metadata)
    }

    fn release_texture_resource(&mut self, resource_id: &ResourceId) -> Result<bool, Self::Error> {
        Ok(self.release_decoded_texture(resource_id.as_str()))
    }
}
