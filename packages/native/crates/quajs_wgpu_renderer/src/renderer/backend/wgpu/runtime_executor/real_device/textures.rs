#[cfg(feature = "image-decode")]
use super::texture::decode_image_bytes_rgba8;
use super::texture::{
    create_runtime_decoded_texture_rgba8, RealWgpuDecodedTextureMetadata,
    RealWgpuDecodedTextureRgba8,
};
use super::RealWgpuNativeRenderRuntimeDevice;
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;
use crate::renderer::backend::wgpu::WgpuNativeRenderBindGroupLayout;

impl RealWgpuNativeRenderRuntimeDevice {
    pub fn upload_decoded_texture_rgba8(
        &mut self,
        resource_id: impl Into<String>,
        decoded: RealWgpuDecodedTextureRgba8,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.upload_decoded_texture_rgba8_with_metadata(
            resource_id,
            decoded,
            RealWgpuDecodedTextureMetadata::default(),
        )
    }

    pub fn upload_decoded_texture_rgba8_with_metadata(
        &mut self,
        resource_id: impl Into<String>,
        decoded: RealWgpuDecodedTextureRgba8,
        metadata: RealWgpuDecodedTextureMetadata,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let resource_id = resource_id.into();
        let texture =
            create_runtime_decoded_texture_rgba8(&self.target, &resource_id, decoded, metadata)?;
        self.decoded_textures.insert(resource_id.clone(), texture);
        self.invalidate_texture_sampler_bind_groups_for_resource(&resource_id);
        Ok(())
    }

    #[cfg(feature = "image-decode")]
    pub fn upload_image_texture_bytes(
        &mut self,
        resource_id: impl Into<String>,
        encoded_image: impl AsRef<[u8]>,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.upload_image_texture_bytes_with_metadata(
            resource_id,
            encoded_image,
            RealWgpuDecodedTextureMetadata::default(),
        )
    }

    #[cfg(feature = "image-decode")]
    pub fn upload_image_texture_bytes_with_metadata(
        &mut self,
        resource_id: impl Into<String>,
        encoded_image: impl AsRef<[u8]>,
        metadata: RealWgpuDecodedTextureMetadata,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let resource_id = resource_id.into();
        let decoded = decode_image_bytes_rgba8(&resource_id, encoded_image.as_ref())?;
        self.upload_decoded_texture_rgba8_with_metadata(resource_id, decoded, metadata)
    }

    pub fn release_decoded_texture(&mut self, resource_id: &str) -> bool {
        let released = self.decoded_textures.remove(resource_id).is_some();
        if released {
            self.invalidate_texture_sampler_bind_groups_for_resource(resource_id);
        }
        released
    }

    pub fn release_decoded_textures_for_package(&mut self, package_id: &str) -> usize {
        let resource_ids = self.decoded_texture_resource_ids_for_package(package_id);
        for resource_id in &resource_ids {
            self.decoded_textures.remove(resource_id);
            self.invalidate_texture_sampler_bind_groups_for_resource(resource_id);
        }
        resource_ids.len()
    }

    pub fn decoded_texture_resource_ids_for_package(&self, package_id: &str) -> Vec<String> {
        self.decoded_textures
            .iter()
            .filter(|(_, texture)| {
                texture.owner_package_id.as_deref() == Some(package_id)
                    || texture.required_package_ids.contains(package_id)
            })
            .map(|(resource_id, _)| resource_id.clone())
            .collect()
    }

    pub fn decoded_texture_resource_count(&self) -> usize {
        self.decoded_textures.len()
    }

    pub fn invalidate_texture_sampler_bind_groups_for_resource(
        &mut self,
        resource_id: &str,
    ) -> usize {
        let before = self.bind_groups.len();
        self.bind_groups.retain(|_, bind_group| {
            bind_group.layout != WgpuNativeRenderBindGroupLayout::TextureSampler
                || !bind_group.resource_ids.iter().any(|id| id == resource_id)
        });
        before.saturating_sub(self.bind_groups.len())
    }
}
