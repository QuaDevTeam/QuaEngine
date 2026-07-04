#[derive(Clone, Debug)]
pub struct RealWgpuNativeRenderRuntimeTarget {
    device: wgpu::Device,
    queue: wgpu::Queue,
    color_format: wgpu::TextureFormat,
    extent: wgpu::Extent3d,
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
        }
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
    }

    pub fn color_format(&self) -> wgpu::TextureFormat {
        self.color_format
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
