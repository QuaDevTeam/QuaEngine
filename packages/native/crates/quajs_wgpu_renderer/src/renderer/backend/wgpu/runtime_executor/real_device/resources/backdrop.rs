use std::collections::BTreeSet;

use super::super::bind_group::{create_real_bind_group, RealRuntimeBindGroup};
use super::super::texture::decoded::RealRuntimeDecodedTexture;
use super::super::texture::sampler::create_texture_sampler;
use super::super::{
    invalid_order, RealWgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeError,
};
use crate::renderer::backend::wgpu::WgpuNativeRenderBindGroupLayout;

/// Fixed resource-ID key used to register the backdrop-capture texture in the
/// decoded-texture map so the standard TextureSampler bind group path finds it.
pub(in super::super) const BACKDROP_CAPTURE_RESOURCE_ID: &str = "system:backdrop-capture";

impl RealWgpuNativeRenderRuntimeDevice {
    /// Copy the current frame-target content into the backdrop-capture texture
    /// so that `BackdropBlur` draw commands in the following Safe-plane pass can
    /// sample it.
    ///
    /// The copy runs inside the already-open command encoder (between render
    /// passes).  The backdrop texture is created lazily and recreated whenever
    /// the frame dimensions or format change.  After the copy the decoded-texture
    /// and bind-group maps are updated so every existing bind group that
    /// references `"system:backdrop-capture"` picks up the fresh snapshot
    /// automatically on the next draw.
    pub(in super::super) fn copy_framebuffer_to_backdrop(
        &mut self,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let encoder = self.active_encoder_any_mut()?;
        if encoder.active_pass.is_some() {
            return invalid_order(
                "CopyFramebufferToBackdrop must be issued between render passes, not inside one",
            );
        }

        let extent = self.frame_target.extent();
        let format = self.frame_target.color_format();

        // (Re)create the backdrop texture when it is missing or stale.
        let needs_new = self
            .backdrop_texture
            .as_ref()
            .map(|t| t.size() != extent || t.format() != format)
            .unwrap_or(true);

        if needs_new {
            self.backdrop_texture = Some(self.target.device().create_texture(
                &wgpu::TextureDescriptor {
                    label: Some("qua-native::backdrop-capture"),
                    size: extent,
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format,
                    usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
                    view_formats: &[],
                },
            ));
        }

        let backdrop = self.backdrop_texture.as_ref().expect("just created above");
        encoder.encoder.copy_texture_to_texture(
            self.frame_target.texture().as_image_copy(),
            backdrop.as_image_copy(),
            extent,
        );

        // Register (or refresh) the backdrop as a decoded texture so the
        // standard TextureSampler bind-group creation code can find it.
        let view = backdrop.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = create_texture_sampler(&self.target, "qua-native::backdrop-capture-sampler");
        let byte_len = (extent.width as usize)
            .saturating_mul(extent.height as usize)
            .saturating_mul(4);
        self.decoded_textures.insert(
            BACKDROP_CAPTURE_RESOURCE_ID.to_string(),
            RealRuntimeDecodedTexture {
                texture: backdrop.clone(),
                view,
                sampler,
                width: extent.width,
                height: extent.height,
                byte_len,
                owner_package_id: None,
                required_package_ids: BTreeSet::new(),
            },
        );

        Ok(())
    }
}
