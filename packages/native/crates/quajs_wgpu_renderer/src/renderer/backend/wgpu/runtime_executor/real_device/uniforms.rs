use super::target::RealWgpuNativeRenderRuntimeTarget;

#[derive(Clone, Debug)]
pub(super) struct RealRuntimeFrameUniforms {
    pub(super) layout: wgpu::BindGroupLayout,
    #[allow(dead_code)]
    buffer: wgpu::Buffer,
    pub(super) bind_group: wgpu::BindGroup,
}

impl RealRuntimeFrameUniforms {
    pub(super) fn new(target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
        let layout = create_real_frame_uniform_bind_group_layout(target);
        Self::with_layout(target, layout)
    }

    pub(super) fn resized(&self, target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
        Self::with_layout(target, self.layout.clone())
    }

    fn with_layout(
        target: &RealWgpuNativeRenderRuntimeTarget,
        layout: wgpu::BindGroupLayout,
    ) -> Self {
        let extent = target.extent();
        let mut bytes = Vec::with_capacity(16);
        for value in [
            extent.width.max(1) as f32,
            extent.height.max(1) as f32,
            0.0_f32,
            0.0_f32,
        ] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        let buffer = target.device().create_buffer(&wgpu::BufferDescriptor {
            label: Some("qua-native::frame-uniform-buffer"),
            size: bytes.len() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        target.queue().write_buffer(&buffer, 0, &bytes);
        let entries = [wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer.as_entire_binding(),
        }];
        let bind_group = target
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("qua-native::frame-uniform-bind-group"),
                layout: &layout,
                entries: &entries,
            });
        Self {
            layout,
            buffer,
            bind_group,
        }
    }
}

fn create_real_frame_uniform_bind_group_layout(
    target: &RealWgpuNativeRenderRuntimeTarget,
) -> wgpu::BindGroupLayout {
    let entries = [wgpu::BindGroupLayoutEntry {
        binding: 0,
        // BackdropBlur's fragment stage reads `frame.target_size` to derive
        // screen-space backdrop UVs, so the shared frame uniform must be
        // visible to both stages (a superset stays valid for vertex-only users).
        visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: wgpu::BufferSize::new(16),
        },
        count: None,
    }];
    target
        .device()
        .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("qua-native::frame-uniform-bind-group-layout"),
            entries: &entries,
        })
}
