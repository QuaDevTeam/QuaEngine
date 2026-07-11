use std::collections::BTreeMap;

use crate::renderer::backend::wgpu::buffer::text_geometry::bitmap::glyphs::{
    builtin_text_atlas_dimensions, builtin_text_atlas_rgba8, BUILTIN_TEXT_ATLAS_RESOURCE_ID,
};

use super::super::RealWgpuNativeRenderRuntimeTarget;
use super::decoded::RealRuntimeDecodedTexture;
use super::placeholder::{placeholder_texture_rgba8, PLACEHOLDER_TEXTURE_EXTENT};
use super::sampler::{
    create_linear_texture_sampler, create_sampler_bind_group, create_texture_sampler,
};

#[derive(Clone, Debug)]
pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) struct RealRuntimeTextureSamplerBindGroup
{
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) bind_group:
        wgpu::BindGroup,
    #[allow(dead_code)]
    texture: wgpu::Texture,
    #[allow(dead_code)]
    view: wgpu::TextureView,
    #[allow(dead_code)]
    sampler: wgpu::Sampler,
    #[allow(dead_code)]
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) placeholder_rgba8:
        [u8; 16],
    #[allow(dead_code)]
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) decoded_resource_id:
        Option<String>,
    #[allow(dead_code)]
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) decoded_size:
        Option<(u32, u32)>,
    #[allow(dead_code)]
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) decoded_byte_len:
        Option<usize>,
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn create_texture_sampler_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    resource_ids: &[String],
    decoded_textures: &BTreeMap<String, RealRuntimeDecodedTexture>,
) -> RealRuntimeTextureSamplerBindGroup {
    if let Some((resource_id, decoded)) = find_decoded_texture(resource_ids, decoded_textures) {
        return create_decoded_texture_sampler_bind_group(
            target,
            layout,
            cache_label,
            resource_id,
            decoded,
        );
    }

    create_placeholder_texture_sampler_bind_group(target, layout, cache_label, resource_ids)
}

fn create_decoded_text_atlas_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    resource_id: &str,
    decoded: &RealRuntimeDecodedTexture,
) -> RealRuntimeTextureSamplerBindGroup {
    let sampler =
        create_linear_texture_sampler(target, &format!("{cache_label}::linear-text-atlas-sampler"));
    let bind_group =
        create_sampler_bind_group(target, layout, cache_label, &sampler, &decoded.view);
    RealRuntimeTextureSamplerBindGroup {
        bind_group,
        texture: decoded.texture.clone(),
        view: decoded.view.clone(),
        sampler,
        placeholder_rgba8: [0; 16],
        decoded_resource_id: Some(resource_id.to_string()),
        decoded_size: Some((decoded.width, decoded.height)),
        decoded_byte_len: Some(decoded.byte_len),
    }
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn create_text_atlas_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    resource_ids: &[String],
    decoded_textures: &BTreeMap<String, RealRuntimeDecodedTexture>,
) -> RealRuntimeTextureSamplerBindGroup {
    if let Some((resource_id, decoded)) = find_decoded_texture(resource_ids, decoded_textures) {
        return create_decoded_text_atlas_bind_group(
            target,
            layout,
            cache_label,
            resource_id,
            decoded,
        );
    }

    let rgba = builtin_text_atlas_rgba8();
    let (width, height) = builtin_text_atlas_dimensions();
    let extent = wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    };
    let texture_label = format!("{cache_label}::builtin-text-atlas");
    let texture = target.device().create_texture(&wgpu::TextureDescriptor {
        label: Some(&texture_label),
        size: extent,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    target.queue().write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &rgba,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width.saturating_mul(4)),
            rows_per_image: Some(height),
        },
        extent,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = create_texture_sampler(target, &format!("{cache_label}::text-atlas-sampler"));
    let bind_group = create_sampler_bind_group(target, layout, cache_label, &sampler, &view);
    RealRuntimeTextureSamplerBindGroup {
        bind_group,
        texture,
        view,
        sampler,
        placeholder_rgba8: [0; 16],
        decoded_resource_id: Some(BUILTIN_TEXT_ATLAS_RESOURCE_ID.to_string()),
        decoded_size: Some((width, height)),
        decoded_byte_len: Some(rgba.len()),
    }
}

fn create_placeholder_texture_sampler_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    resource_ids: &[String],
) -> RealRuntimeTextureSamplerBindGroup {
    let placeholder_rgba8 = placeholder_texture_rgba8(resource_ids);
    let texture_label = format!("{cache_label}::placeholder-texture");
    let texture = target.device().create_texture(&wgpu::TextureDescriptor {
        label: Some(&texture_label),
        size: PLACEHOLDER_TEXTURE_EXTENT,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    target.queue().write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &placeholder_rgba8,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(8),
            rows_per_image: Some(2),
        },
        PLACEHOLDER_TEXTURE_EXTENT,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = create_texture_sampler(target, &format!("{cache_label}::placeholder-sampler"));
    let bind_group = create_sampler_bind_group(target, layout, cache_label, &sampler, &view);
    RealRuntimeTextureSamplerBindGroup {
        bind_group,
        texture,
        view,
        sampler,
        placeholder_rgba8,
        decoded_resource_id: None,
        decoded_size: None,
        decoded_byte_len: None,
    }
}

fn create_decoded_texture_sampler_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    resource_id: &str,
    decoded: &RealRuntimeDecodedTexture,
) -> RealRuntimeTextureSamplerBindGroup {
    let bind_group =
        create_sampler_bind_group(target, layout, cache_label, &decoded.sampler, &decoded.view);
    RealRuntimeTextureSamplerBindGroup {
        bind_group,
        texture: decoded.texture.clone(),
        view: decoded.view.clone(),
        sampler: decoded.sampler.clone(),
        placeholder_rgba8: [0; 16],
        decoded_resource_id: Some(resource_id.to_string()),
        decoded_size: Some((decoded.width, decoded.height)),
        decoded_byte_len: Some(decoded.byte_len),
    }
}

fn find_decoded_texture<'a>(
    resource_ids: &'a [String],
    decoded_textures: &'a BTreeMap<String, RealRuntimeDecodedTexture>,
) -> Option<(&'a str, &'a RealRuntimeDecodedTexture)> {
    resource_ids.iter().find_map(|resource_id| {
        decoded_textures
            .get(resource_id)
            .map(|texture| (resource_id.as_str(), texture))
    })
}
