use quajs_wgpu_renderer::fonts::FontBackendAtlasLayout;
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
    fn texture_preload_budget_generation(&self) -> u64 {
        self.runtime_executor()
            .device()
            .image_preload_budget_generation()
    }
    fn request_texture_preload(
        &mut self,
        request: &NativeTextureUploadRequest,
        bytes: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<bool, Self::Error> {
        self.runtime_executor_mut()
            .device_mut()
            .request_image_preload(
                request.resource_id.as_str(),
                bytes,
                quajs_wgpu_renderer::renderer::backend::wgpu::RealWgpuDecodedTextureMetadata {
                    owner_package_id: metadata.owner_package_id,
                    required_package_ids: metadata.required_package_ids,
                },
            )
    }
    fn has_pending_texture_preloads(&self) -> bool {
        self.runtime_executor().device().has_pending_image_uploads()
    }
    fn texture_is_resident(&self, id: &ResourceId) -> bool {
        self.runtime_executor()
            .device()
            .image_texture_is_resident(id.as_str())
    }

    fn touch_texture_resources(&mut self, ids: &std::collections::BTreeSet<String>) {
        self.runtime_executor_mut()
            .device_mut()
            .touch_image_textures(ids);
        self.sync_image_cache_bindings();
    }
    fn set_texture_preloads(&mut self, ids: std::collections::BTreeSet<String>) {
        self.runtime_executor_mut()
            .device_mut()
            .set_image_preloads(ids);
    }
    fn set_required_texture_preparations(&mut self, ids: std::collections::BTreeSet<String>) {
        self.runtime_executor_mut().device_mut().set_required_image_preparations(ids);
    }
    fn prepare_texture_request(&mut self, request: &NativeTextureUploadRequest) {
        self.runtime_executor_mut()
            .device_mut()
            .prepare_image_scope(
                request.resource_id.as_str(),
                request_packages(request),
                false,
            );
        self.sync_image_cache_bindings();
    }
    fn poll_texture_preload(
        &mut self,
        request: &NativeTextureUploadRequest,
    ) -> Option<Result<bool, Self::Error>> {
        let device = self.runtime_executor_mut().device_mut();
        if !device.prepare_image_scope(
            request.resource_id.as_str(),
            request_packages(request),
            true,
        ) {
            return Some(Ok(false));
        }
        let result = device.poll_image_preload(request.resource_id.as_str());
        self.sync_image_cache_bindings();
        result
    }
    fn retire_texture_resource(&mut self, id: &ResourceId) -> Result<bool, Self::Error> {
        let released = self
            .runtime_executor_mut()
            .device_mut()
            .retire_image_texture(id.as_str());
        self.sync_image_cache_bindings();
        Ok(released)
    }
    fn clear_cached_textures(&mut self) {
        self.runtime_executor_mut().device_mut().clear_image_cache();
        self.sync_image_cache_bindings();
    }
    fn release_cached_package_textures(&mut self, package: &str) {
        self.release_decoded_textures_for_package(package);
    }

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

    fn retain_pending_texture_uploads(&mut self, ids: &std::collections::BTreeSet<String>) {
        self.runtime_executor_mut()
            .device_mut()
            .retain_pending_texture_uploads(ids);
    }

    fn background_shader_status(&self, source: &str) -> Result<bool, String> {
        self.runtime_executor()
            .device()
            .background_shader_status(source)
    }

    fn poll_texture_upload(
        &mut self,
        resource_id: &ResourceId,
    ) -> Option<Result<bool, Self::Error>> {
        self.poll_image_texture_upload(resource_id.as_str())
    }

    fn request_texture_upload(
        &mut self,
        request: &NativeTextureUploadRequest,
        bytes: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<bool, Self::Error> {
        self.request_image_texture_upload(
            request.resource_id.as_str(),
            bytes,
            quajs_wgpu_renderer::renderer::backend::wgpu::RealWgpuDecodedTextureMetadata {
                owner_package_id: metadata.owner_package_id,
                required_package_ids: metadata.required_package_ids,
            },
        )
    }

    fn upload_decoded_texture_rgba8(
        &mut self,
        resource_id: &ResourceId,
        width: u32,
        height: u32,
        rgba: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error> {
        let metadata =
            quajs_wgpu_renderer::renderer::backend::wgpu::RealWgpuDecodedTextureMetadata {
                owner_package_id: metadata.owner_package_id,
                required_package_ids: metadata.required_package_ids,
            };
        self.upload_decoded_texture_rgba8_with_metadata(
            resource_id.as_str(),
            quajs_wgpu_renderer::renderer::backend::wgpu::RealWgpuDecodedTextureRgba8::new(
                width,
                height,
                rgba.to_vec(),
            ),
            metadata,
        )
    }

    fn release_texture_resource(&mut self, resource_id: &ResourceId) -> Result<bool, Self::Error> {
        Ok(self.release_decoded_texture(resource_id.as_str()))
    }

    fn register_font_atlas_layout(&mut self, layout: FontBackendAtlasLayout) {
        WgpuNativeRenderBackend::register_font_atlas_layout(self, layout);
    }

    fn release_font_atlas_layout(&mut self, resource_id: &ResourceId) {
        WgpuNativeRenderBackend::release_font_atlas_layout(self, resource_id);
    }
}

fn request_packages(request: &NativeTextureUploadRequest) -> std::collections::BTreeSet<String> {
    request
        .owner_package_ids
        .iter()
        .chain(&request.required_package_ids)
        .chain(&request.package_candidates)
        .cloned()
        .collect()
}
