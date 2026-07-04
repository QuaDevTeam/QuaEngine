use super::pipeline::RealRuntimePipeline;
use super::texture::{
    create_text_atlas_bind_group, create_texture_sampler_bind_group, RealRuntimeDecodedTexture,
    RealRuntimeTextureSamplerBindGroup,
};
use super::{invalid_order, RealWgpuNativeRenderRuntimeTarget};
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;
use crate::renderer::backend::wgpu::WgpuNativeRenderBindGroupLayout;
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
pub(super) struct RealRuntimeBindGroup {
    #[allow(dead_code)]
    pub(super) command_id: String,
    pub(super) layout: WgpuNativeRenderBindGroupLayout,
    pub(super) resource_ids: Vec<String>,
    pub(super) texture_sampler: Option<RealRuntimeTextureSamplerBindGroup>,
}

pub(super) fn create_real_bind_group(
    target: &RealWgpuNativeRenderRuntimeTarget,
    texture_sampler_bind_group_layout: &wgpu::BindGroupLayout,
    text_atlas_bind_group_layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    command_id: &str,
    layout: WgpuNativeRenderBindGroupLayout,
    resource_ids: &[String],
    decoded_textures: &BTreeMap<String, RealRuntimeDecodedTexture>,
) -> Result<RealRuntimeBindGroup, WgpuNativeRenderRuntimeError> {
    match layout {
        WgpuNativeRenderBindGroupLayout::None => Ok(RealRuntimeBindGroup {
            command_id: command_id.to_string(),
            layout,
            resource_ids: resource_ids.to_vec(),
            texture_sampler: None,
        }),
        WgpuNativeRenderBindGroupLayout::TextureSampler => {
            let texture_sampler = create_texture_sampler_bind_group(
                target,
                texture_sampler_bind_group_layout,
                cache_label,
                resource_ids,
                decoded_textures,
            );
            Ok(RealRuntimeBindGroup {
                command_id: command_id.to_string(),
                layout,
                resource_ids: resource_ids.to_vec(),
                texture_sampler: Some(texture_sampler),
            })
        }
        WgpuNativeRenderBindGroupLayout::TextAtlas => {
            let texture_sampler =
                create_text_atlas_bind_group(target, text_atlas_bind_group_layout, cache_label);
            Ok(RealRuntimeBindGroup {
                command_id: command_id.to_string(),
                layout,
                resource_ids: resource_ids.to_vec(),
                texture_sampler: Some(texture_sampler),
            })
        }
    }
}

pub(super) fn pipeline_uses_texture_sampler_bind_group(pipeline: &RealRuntimePipeline) -> bool {
    matches!(
        pipeline.key.bind_group_layout,
        WgpuNativeRenderBindGroupLayout::TextureSampler
            | WgpuNativeRenderBindGroupLayout::TextAtlas
    )
}

pub(super) fn validate_bind_group_matches_pipeline(
    cache_label: &str,
    command_id: &str,
    bind_group: &RealRuntimeBindGroup,
    pipeline: &RealRuntimePipeline,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if bind_group.layout != pipeline.key.bind_group_layout {
        return invalid_order(format!(
            "bind group '{cache_label}' for draw '{command_id}' has layout {:?}, but active pipeline expects {:?}",
            bind_group.layout, pipeline.key.bind_group_layout
        ));
    }
    Ok(())
}
