use super::RealWgpuNativeRenderRuntimeDevice;
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RealWgpuFrameCopyReport {
    pub extent: wgpu::Extent3d,
    pub color_format: wgpu::TextureFormat,
    pub submitted_command_buffer_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RealWgpuSurfacePresentReport {
    pub copy: RealWgpuFrameCopyReport,
    pub status: RealWgpuSurfacePresentStatus,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RealWgpuSurfacePresentStatus {
    Presented,
    Suboptimal,
}

impl RealWgpuNativeRenderRuntimeDevice {
    pub fn copy_frame_to_texture(
        &mut self,
        destination: &wgpu::Texture,
    ) -> Result<RealWgpuFrameCopyReport, WgpuNativeRenderRuntimeError> {
        if self.active_encoder.is_some() {
            return invalid_copy("cannot copy frame while a command encoder is active");
        }
        if self.frame_target.completed_pass_count() == 0 {
            return invalid_copy("cannot copy frame before a render pass has completed");
        }
        if !destination.usage().contains(wgpu::TextureUsages::COPY_DST) {
            return invalid_copy("destination texture must include COPY_DST usage");
        }
        // The frame is composited in the non-sRGB variant of the surface format
        // so blending matches CSS. A texture-to-texture copy is a raw byte move
        // and wgpu permits it between formats that differ only in sRGB-ness, so
        // compare the base formats rather than requiring an exact match.
        if destination.format().remove_srgb_suffix()
            != self.frame_target.color_format().remove_srgb_suffix()
        {
            return invalid_copy(format!(
                "destination texture format {:?} is not copy-compatible with frame format {:?}",
                destination.format(),
                self.frame_target.color_format()
            ));
        }
        if destination.sample_count() != 1 || destination.dimension() != wgpu::TextureDimension::D2
        {
            return invalid_copy(
                "destination texture must be a single-sample 2D texture for frame copy",
            );
        }
        if destination.size() != self.frame_target.extent() {
            return invalid_copy(format!(
                "destination texture extent {:?} does not match frame extent {:?}",
                destination.size(),
                self.frame_target.extent()
            ));
        }

        let mut encoder =
            self.target
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("qua-native-frame-copy"),
                });
        encoder.copy_texture_to_texture(
            self.frame_target.texture().as_image_copy(),
            destination.as_image_copy(),
            self.frame_target.extent(),
        );
        self.target.queue().submit([encoder.finish()]);
        self.submitted_command_buffer_count += 1;

        Ok(RealWgpuFrameCopyReport {
            extent: self.frame_target.extent(),
            color_format: self.frame_target.color_format(),
            submitted_command_buffer_count: self.submitted_command_buffer_count,
        })
    }

    pub fn present_frame_to_surface_texture(
        &mut self,
        surface_texture: wgpu::SurfaceTexture,
    ) -> Result<RealWgpuFrameCopyReport, WgpuNativeRenderRuntimeError> {
        let report = self.copy_frame_to_texture(&surface_texture.texture)?;
        surface_texture.present();
        Ok(report)
    }

    pub fn present_frame_to_surface(
        &mut self,
        surface: &wgpu::Surface<'_>,
    ) -> Result<RealWgpuSurfacePresentReport, WgpuNativeRenderRuntimeError> {
        match surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(surface_texture) => self
                .present_surface_texture_with_status(
                    surface_texture,
                    RealWgpuSurfacePresentStatus::Presented,
                ),
            wgpu::CurrentSurfaceTexture::Suboptimal(surface_texture) => self
                .present_surface_texture_with_status(
                    surface_texture,
                    RealWgpuSurfacePresentStatus::Suboptimal,
                ),
            wgpu::CurrentSurfaceTexture::Timeout => {
                invalid_copy("cannot present frame because surface acquisition timed out")
            }
            wgpu::CurrentSurfaceTexture::Occluded => {
                invalid_copy("cannot present frame because surface is occluded")
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                invalid_copy("cannot present frame because surface configuration is outdated")
            }
            wgpu::CurrentSurfaceTexture::Lost => {
                invalid_copy("cannot present frame because surface was lost")
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                invalid_copy("cannot present frame because surface acquisition failed validation")
            }
        }
    }

    fn present_surface_texture_with_status(
        &mut self,
        surface_texture: wgpu::SurfaceTexture,
        status: RealWgpuSurfacePresentStatus,
    ) -> Result<RealWgpuSurfacePresentReport, WgpuNativeRenderRuntimeError> {
        let copy = self.present_frame_to_surface_texture(surface_texture)?;
        Ok(RealWgpuSurfacePresentReport { copy, status })
    }
}

fn invalid_copy<T>(message: impl Into<String>) -> Result<T, WgpuNativeRenderRuntimeError> {
    Err(WgpuNativeRenderRuntimeError::new(
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        message,
    ))
}
