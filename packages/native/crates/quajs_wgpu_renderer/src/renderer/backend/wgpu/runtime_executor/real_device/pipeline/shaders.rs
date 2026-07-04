use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderPipelineKey, WgpuNativeRenderShader,
};

use super::wgsl::{SOLID_COLOR_WGSL, TEXTURED_QUAD_WGSL, TEXT_ATLAS_WGSL};

pub(super) struct RealPipelineShader<'a> {
    pub label: &'static str,
    pub source: &'static str,
    pub bind_group_layouts: Vec<Option<&'a wgpu::BindGroupLayout>>,
}

pub(super) fn resolve_pipeline_shader<'a>(
    frame_uniform_layout: &'a wgpu::BindGroupLayout,
    texture_sampler_layout: &'a wgpu::BindGroupLayout,
    text_atlas_layout: &'a wgpu::BindGroupLayout,
    cache_label: &str,
    key: WgpuNativeRenderPipelineKey,
) -> Result<RealPipelineShader<'a>, WgpuNativeRenderRuntimeError> {
    match (key.shader, key.bind_group_layout) {
        (
            WgpuNativeRenderShader::Clear
            | WgpuNativeRenderShader::SolidColor
            | WgpuNativeRenderShader::ClipMask
            | WgpuNativeRenderShader::CustomFallback,
            WgpuNativeRenderBindGroupLayout::None,
        ) => Ok(RealPipelineShader {
            label: "qua-native::solid-color-shader",
            source: SOLID_COLOR_WGSL,
            bind_group_layouts: vec![Some(frame_uniform_layout)],
        }),
        (WgpuNativeRenderShader::TexturedQuad, WgpuNativeRenderBindGroupLayout::TextureSampler) => {
            Ok(RealPipelineShader {
                label: "qua-native::textured-quad-placeholder-shader",
                source: TEXTURED_QUAD_WGSL,
                bind_group_layouts: vec![Some(frame_uniform_layout), Some(texture_sampler_layout)],
            })
        }
        (WgpuNativeRenderShader::TextPlaceholder, WgpuNativeRenderBindGroupLayout::TextAtlas) => {
            Ok(RealPipelineShader {
                label: "qua-native::text-atlas-shader",
                source: TEXT_ATLAS_WGSL,
                bind_group_layouts: vec![Some(frame_uniform_layout), Some(text_atlas_layout)],
            })
        }
        (_, WgpuNativeRenderBindGroupLayout::TextAtlas) => unsupported_pipeline(
            cache_label,
            key,
            "TextAtlas pipelines are currently supported only for TextPlaceholder bitmap atlas draws",
        ),
        _ => unsupported_pipeline(
            cache_label,
            key,
            "the real-wgpu runtime currently materializes no-bind-group color fallback pipelines, TexturedQuad/TextureSampler, and TextPlaceholder/TextAtlas bitmap atlas pipelines only",
        ),
    }
}

fn unsupported_pipeline<T>(
    cache_label: &str,
    key: WgpuNativeRenderPipelineKey,
    reason: &str,
) -> Result<T, WgpuNativeRenderRuntimeError> {
    Err(WgpuNativeRenderRuntimeError::new(
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        format!(
            "cannot materialize pipeline '{cache_label}' ({:?}): {reason}",
            key
        ),
    ))
}
