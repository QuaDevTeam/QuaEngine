use super::super::RealWgpuNativeRenderRuntimeTarget;

pub(super) fn create_sampler_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    sampler: &wgpu::Sampler,
    view: &wgpu::TextureView,
) -> wgpu::BindGroup {
    let entries = [
        wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Sampler(sampler),
        },
        wgpu::BindGroupEntry {
            binding: 1,
            resource: wgpu::BindingResource::TextureView(view),
        },
    ];
    target
        .device()
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(cache_label),
            layout,
            entries: &entries,
        })
}

pub(super) fn create_texture_sampler(
    target: &RealWgpuNativeRenderRuntimeTarget,
    label: &str,
) -> wgpu::Sampler {
    target
        .device()
        .create_sampler(&texture_sampler_descriptor(label))
}

fn texture_sampler_descriptor(label: &str) -> wgpu::SamplerDescriptor<'_> {
    wgpu::SamplerDescriptor {
        label: Some(label),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::MipmapFilterMode::Linear,
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sampled_scene_textures_use_linear_filtering() {
        let descriptor = texture_sampler_descriptor("scene-texture");

        assert_eq!(descriptor.mag_filter, wgpu::FilterMode::Linear);
        assert_eq!(descriptor.min_filter, wgpu::FilterMode::Linear);
        assert_eq!(descriptor.mipmap_filter, wgpu::MipmapFilterMode::Linear);
    }
}
