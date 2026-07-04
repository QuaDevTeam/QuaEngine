use std::collections::BTreeMap;

use super::{missing_draw_state, RealRuntimeDrawIndexed};
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
};
use crate::renderer::backend::wgpu::{WgpuNativeRenderBindGroupLayout, WgpuNativeRenderShader};

use super::super::bind_group::RealRuntimeBindGroup;
use super::super::pipeline::RealRuntimePipeline;
use super::super::texture::RealRuntimeTextureSamplerBindGroup;
use super::super::{invalid_order, RealRuntimeBuffer};

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn vertex_buffer_for_draw<
    'a,
>(
    pass_label: &str,
    draw: &RealRuntimeDrawIndexed,
    buffers: &'a BTreeMap<String, RealRuntimeBuffer>,
) -> Result<&'a RealRuntimeBuffer, WgpuNativeRenderRuntimeError> {
    buffers.get(&draw.vertex_buffer_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
            format!(
                "missing vertex buffer '{}' for draw '{}' in pass '{pass_label}'",
                draw.vertex_buffer_label, draw.command_id
            ),
        )
    })
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn index_buffer_for_draw<
    'a,
>(
    pass_label: &str,
    draw: &RealRuntimeDrawIndexed,
    buffers: &'a BTreeMap<String, RealRuntimeBuffer>,
) -> Result<&'a RealRuntimeBuffer, WgpuNativeRenderRuntimeError> {
    buffers.get(&draw.index_buffer_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
            format!(
                "missing index buffer '{}' for draw '{}' in pass '{pass_label}'",
                draw.index_buffer_label, draw.command_id
            ),
        )
    })
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn pipeline_for_draw<'a>(
    pass_label: &str,
    draw: &RealRuntimeDrawIndexed,
    pipelines: &'a BTreeMap<String, RealRuntimePipeline>,
) -> Result<&'a RealRuntimePipeline, WgpuNativeRenderRuntimeError> {
    pipelines.get(&draw.pipeline_cache_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingPipeline,
            format!(
                "missing pipeline '{}' for draw '{}' in pass '{pass_label}'",
                draw.pipeline_cache_label, draw.command_id
            ),
        )
    })
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn required_bind_group_for_draw<
    'a,
>(
    pass_label: &str,
    draw: &RealRuntimeDrawIndexed,
    pipeline: &RealRuntimePipeline,
    bind_groups: &'a BTreeMap<String, RealRuntimeBindGroup>,
) -> Result<Option<&'a RealRuntimeTextureSamplerBindGroup>, WgpuNativeRenderRuntimeError> {
    match (pipeline.key.shader, pipeline.key.bind_group_layout) {
        (_, WgpuNativeRenderBindGroupLayout::None) => Ok(None),
        (_, WgpuNativeRenderBindGroupLayout::TextureSampler)
        | (WgpuNativeRenderShader::TextPlaceholder, WgpuNativeRenderBindGroupLayout::TextAtlas) => {
            required_sampled_texture_bind_group_for_draw(pass_label, draw, pipeline, bind_groups)
        }
        (_, WgpuNativeRenderBindGroupLayout::TextAtlas) => invalid_order(format!(
            "draw '{}' in pass '{pass_label}' references unsupported TextAtlas pipeline '{:?}'",
            draw.command_id, pipeline.key.pipeline
        )),
    }
}

fn required_sampled_texture_bind_group_for_draw<'a>(
    pass_label: &str,
    draw: &RealRuntimeDrawIndexed,
    pipeline: &RealRuntimePipeline,
    bind_groups: &'a BTreeMap<String, RealRuntimeBindGroup>,
) -> Result<Option<&'a RealRuntimeTextureSamplerBindGroup>, WgpuNativeRenderRuntimeError> {
    let expected_layout = pipeline.key.bind_group_layout;
    let cache_label = draw
        .bind_group_cache_label
        .as_deref()
        .ok_or_else(|| missing_draw_state(pass_label, "resource bind group"))?;
    let bind_group = bind_groups.get(cache_label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBindGroup,
            format!(
                "missing bind group '{cache_label}' for draw '{}' in pass '{pass_label}'",
                draw.command_id
            ),
        )
    })?;
    if bind_group.layout != expected_layout {
        return invalid_order(format!(
            "bind group '{cache_label}' for draw '{}' in pass '{pass_label}' has layout {:?}, expected {:?}",
            draw.command_id, bind_group.layout, expected_layout
        ));
    }
    bind_group
        .texture_sampler
        .as_ref()
        .ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingBindGroup,
                format!(
                    "bind group '{cache_label}' for draw '{}' in pass '{pass_label}' has no materialized sampled texture",
                    draw.command_id
                ),
            )
        })
        .map(Some)
}
