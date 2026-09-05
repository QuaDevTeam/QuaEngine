use std::collections::BTreeMap;

use super::bind_group::RealRuntimeBindGroup;
use super::texture::RealRuntimeDecodedTexture;
use super::RealWgpuNativeRenderRuntimeDevice;
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeSnapshot, WgpuNativeRenderRuntimeTexturePackageMemory,
    WgpuNativeRenderRuntimeTextureSamplerDiagnostics,
};

impl RealWgpuNativeRenderRuntimeDevice {
    pub fn snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        WgpuNativeRenderRuntimeSnapshot {
            resident_texture_dimensions: self
                .decoded_textures
                .iter()
                .map(|(id, texture)| (id.clone(), (texture.width, texture.height)))
                .collect(),
            resident_compositor_texture_byte_len: self
                .compositor
                .as_ref()
                .map_or(0, |c| c.texture_byte_len())
                + self
                    .backdrop_texture
                    .as_ref()
                    .map_or(0, |t| t.width() as usize * t.height() as usize * 4),
            resident_buffer_count: self.buffers.len(),
            resident_buffer_byte_len: self.buffers.values().map(|buffer| buffer.byte_len).sum(),
            resident_pipeline_count: self.pipelines.len(),
            resident_bind_group_count: self.bind_groups.len(),
            resident_texture_count: self.decoded_textures.len(),
            resident_texture_byte_len: self
                .decoded_textures
                .values()
                .map(|texture| texture.byte_len)
                .sum(),
            resident_texture_resource_ids: self.decoded_textures.keys().cloned().collect(),
            resident_texture_byte_len_by_package: decoded_texture_package_memory(
                &self.decoded_textures,
            ),
            texture_sampler_diagnostics: texture_sampler_diagnostics(&self.bind_groups),
            submitted_command_buffer_count: self.submitted_command_buffer_count,
        }
    }
}

fn decoded_texture_package_memory(
    textures: &BTreeMap<String, RealRuntimeDecodedTexture>,
) -> BTreeMap<String, WgpuNativeRenderRuntimeTexturePackageMemory> {
    let mut memory_by_package = BTreeMap::new();
    for texture in textures.values() {
        if let Some(package_id) = &texture.owner_package_id {
            memory_by_package
                .entry(package_id.clone())
                .or_insert_with(WgpuNativeRenderRuntimeTexturePackageMemory::default)
                .add_owned(texture.byte_len);
        }
        for package_id in &texture.required_package_ids {
            memory_by_package
                .entry(package_id.clone())
                .or_insert_with(WgpuNativeRenderRuntimeTexturePackageMemory::default)
                .add_dependent(texture.byte_len);
        }
    }
    memory_by_package
}

fn texture_sampler_diagnostics(
    bind_groups: &BTreeMap<String, RealRuntimeBindGroup>,
) -> WgpuNativeRenderRuntimeTextureSamplerDiagnostics {
    let mut diagnostics = WgpuNativeRenderRuntimeTextureSamplerDiagnostics::default();
    for (cache_label, bind_group) in bind_groups {
        let Some(texture_sampler) = &bind_group.texture_sampler else {
            continue;
        };

        if texture_sampler.linear_filtering {
            diagnostics.linear_filter_bind_group_count =
                diagnostics.linear_filter_bind_group_count.saturating_add(1);
        } else {
            diagnostics.nearest_filter_bind_group_count = diagnostics
                .nearest_filter_bind_group_count
                .saturating_add(1);
        }

        if let Some(resource_id) = &texture_sampler.decoded_resource_id {
            diagnostics.decoded_bind_group_count =
                diagnostics.decoded_bind_group_count.saturating_add(1);
            diagnostics
                .decoded_resource_ids_by_bind_group
                .insert(cache_label.clone(), resource_id.clone());
        } else {
            diagnostics.placeholder_bind_group_count =
                diagnostics.placeholder_bind_group_count.saturating_add(1);
            diagnostics
                .placeholder_resource_ids_by_bind_group
                .insert(cache_label.clone(), bind_group.resource_ids.clone());
        }
    }
    diagnostics
}
