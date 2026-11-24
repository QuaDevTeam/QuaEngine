use super::super::RealWgpuNativeRenderRuntimeTarget;

pub(in super::super) const IDENTITY_UV: [f32; 4] = [1., 1., 0., 0.];

pub(in super::super) fn uv_uniform(device: &wgpu::Device, transform: [f32; 4]) -> wgpu::Buffer {
    use wgpu::util::DeviceExt;
    let bytes = transform.map(f32::to_le_bytes);
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("qua-native::texture-uv"),
        contents: bytes.as_flattened(),
        usage: wgpu::BufferUsages::UNIFORM,
    })
}

pub(in super::super) fn create_sampler_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    sampler: &wgpu::Sampler,
    view: &wgpu::TextureView,
    transform: [f32; 4],
) -> wgpu::BindGroup {
    let mapped;
    let uniform = if transform == IDENTITY_UV {
        &target.identity_uv
    } else {
        mapped = uv_uniform(target.device(), transform);
        &mapped
    };
    let entries = [
        wgpu::BindGroupEntry {
            binding: 2,
            resource: uniform.as_entire_binding(),
        },
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

pub(in super::super) fn texture_sampler_descriptor(label: &str) -> wgpu::SamplerDescriptor<'_> {
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
