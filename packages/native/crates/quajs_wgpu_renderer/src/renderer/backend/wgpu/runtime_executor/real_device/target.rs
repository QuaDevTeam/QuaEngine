#[derive(Clone, Debug)]
pub struct RealWgpuNativeRenderRuntimeTarget {
    device: wgpu::Device,
    queue: wgpu::Queue,
    color_format: wgpu::TextureFormat,
    extent: wgpu::Extent3d,
    requested_sample_count: u32,
    sample_count: u32,
}

impl RealWgpuNativeRenderRuntimeTarget {
    pub fn new(
        device: wgpu::Device,
        queue: wgpu::Queue,
        color_format: wgpu::TextureFormat,
        extent: wgpu::Extent3d,
    ) -> Self {
        Self {
            device,
            queue,
            color_format,
            extent: normalized_extent(extent),
            requested_sample_count: 1,
            sample_count: 1,
        }
    }

    /// Renderer-local quality option, fixed for this device's lifetime.
    /// Only 1x/4x are supported. Unsupported formats/counts safely use 1x.
    pub fn with_msaa_samples(mut self, requested: u32) -> Self {
        self.requested_sample_count = requested;
        self.update_sample_count();
        self
    }

    pub fn sample_count(&self) -> u32 {
        self.sample_count
    }

    fn update_sample_count(&mut self) {
        let flags = self
            .frame_color_format()
            .guaranteed_format_features(self.device.features())
            .flags;
        self.sample_count = supported_sample_count(self.requested_sample_count, flags);
    }

    #[cfg(feature = "real-wgpu-noop")]
    pub fn noop(width: u32, height: u32) -> Self {
        let (device, queue) = wgpu::Device::noop(&wgpu::DeviceDescriptor::default());
        Self::new(
            device,
            queue,
            wgpu::TextureFormat::Rgba8UnormSrgb,
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        )
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }

    pub(super) fn resize(&mut self, color_format: wgpu::TextureFormat, extent: wgpu::Extent3d) {
        self.color_format = color_format;
        self.extent = normalized_extent(extent);
        self.update_sample_count();
    }

    /// Format of the surface/presentation texture this target hands frames to.
    pub fn color_format(&self) -> wgpu::TextureFormat {
        self.color_format
    }

    /// Format the offscreen frame is composited in. Always the non-sRGB variant
    /// of [`Self::color_format`], so the fixed-function blender operates on
    /// sRGB-encoded values the way CSS does instead of on decoded linear light.
    /// Presenting is a raw texture copy, which wgpu allows between formats that
    /// differ only in sRGB-ness, so the swapchain still receives the same bytes.
    ///
    /// Pipelines and the frame texture must both derive their color target from
    /// here; reading [`Self::color_format`] instead would fail render-pass
    /// format validation.
    pub fn frame_color_format(&self) -> wgpu::TextureFormat {
        self.color_format.remove_srgb_suffix()
    }

    pub fn extent(&self) -> wgpu::Extent3d {
        self.extent
    }
}

fn normalized_extent(extent: wgpu::Extent3d) -> wgpu::Extent3d {
    wgpu::Extent3d {
        width: extent.width.max(1),
        height: extent.height.max(1),
        depth_or_array_layers: extent.depth_or_array_layers.max(1),
    }
}

/// Check resolve support as well as sample count: all consumers sample/copy
/// the single-sample resolve image, never the multisampled attachment.
pub(super) fn supported_sample_count(
    requested: u32,
    flags: wgpu::TextureFormatFeatureFlags,
) -> u32 {
    if requested == 4
        && flags.sample_count_supported(4)
        && flags.contains(wgpu::TextureFormatFeatureFlags::MULTISAMPLE_RESOLVE)
    {
        4
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn msaa_requires_count_and_resolve_support() {
        use wgpu::TextureFormatFeatureFlags as F;
        let supported = F::MULTISAMPLE_X4 | F::MULTISAMPLE_RESOLVE;
        assert_eq!(supported_sample_count(4, supported), 4);
        assert_eq!(supported_sample_count(1, supported), 1);
        assert_eq!(supported_sample_count(8, supported), 1);
        assert_eq!(supported_sample_count(4, F::MULTISAMPLE_X4), 1);
        assert_eq!(supported_sample_count(4, F::empty()), 1);
    }
}
