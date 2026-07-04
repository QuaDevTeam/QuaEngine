use super::super::RealWgpuNativeRenderRuntimeTarget;

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn create_real_texture_sampler_bind_group_layout(
    target: &RealWgpuNativeRenderRuntimeTarget,
) -> wgpu::BindGroupLayout {
    create_sampled_texture_bind_group_layout(
        target,
        "qua-native::texture-sampler-bind-group-layout",
    )
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn create_real_text_atlas_bind_group_layout(
    target: &RealWgpuNativeRenderRuntimeTarget,
) -> wgpu::BindGroupLayout {
    create_sampled_texture_bind_group_layout(target, "qua-native::text-atlas-bind-group-layout")
}

fn create_sampled_texture_bind_group_layout(
    target: &RealWgpuNativeRenderRuntimeTarget,
    label: &'static str,
) -> wgpu::BindGroupLayout {
    let entries = [
        wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        },
        wgpu::BindGroupLayoutEntry {
            binding: 1,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        },
    ];
    target
        .device()
        .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some(label),
            entries: &entries,
        })
}
