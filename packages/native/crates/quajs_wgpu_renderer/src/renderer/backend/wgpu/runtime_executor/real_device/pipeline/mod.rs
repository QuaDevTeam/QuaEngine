mod layouts;
mod shaders;
mod wgsl;

use super::RealWgpuNativeRenderRuntimeTarget;
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;
use crate::renderer::backend::wgpu::{WgpuNativeRenderBlendMode, WgpuNativeRenderPipelineKey};

pub(super) use layouts::{
    create_real_text_atlas_bind_group_layout, create_real_texture_sampler_bind_group_layout,
};
use shaders::resolve_pipeline_shader;

#[derive(Clone, Debug)]
pub(super) struct RealRuntimePipeline {
    pub key: WgpuNativeRenderPipelineKey,
    pub pipeline: wgpu::RenderPipeline,
}

pub(super) fn create_real_pipeline(
    target: &RealWgpuNativeRenderRuntimeTarget,
    frame_uniform_layout: &wgpu::BindGroupLayout,
    texture_sampler_layout: &wgpu::BindGroupLayout,
    text_atlas_layout: &wgpu::BindGroupLayout,
    cache_label: &str,
    key: WgpuNativeRenderPipelineKey,
) -> Result<RealRuntimePipeline, WgpuNativeRenderRuntimeError> {
    let shader_config = resolve_pipeline_shader(
        frame_uniform_layout,
        texture_sampler_layout,
        text_atlas_layout,
        cache_label,
        key.clone(),
    )?;
    let shader = target
        .device()
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(shader_config.label),
            source: wgpu::ShaderSource::Wgsl(shader_config.source.into()),
        });
    let pipeline_layout = target
        .device()
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("qua-native::real-wgpu-pipeline-layout"),
            bind_group_layouts: &shader_config.bind_group_layouts,
            immediate_size: 0,
        });
    let attributes = [
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x2,
            offset: 0,
            shader_location: 0,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x2,
            offset: 8,
            shader_location: 1,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 16,
            shader_location: 2,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 32,
            shader_location: 3,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 48,
            shader_location: 4,
        },
    ];
    let vertex_buffers = [wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<
            crate::renderer::backend::wgpu::buffer::WgpuNativeRenderBufferVertex,
        >() as u64,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &attributes,
    }];
    let color_targets = [Some(wgpu::ColorTargetState {
        format: target.color_format(),
        blend: blend_state(key.blend),
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let pipeline = target
        .device()
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some(cache_label),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &vertex_buffers,
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &color_targets,
            }),
            multiview_mask: None,
            cache: None,
        });

    Ok(RealRuntimePipeline { key, pipeline })
}

fn blend_state(blend: WgpuNativeRenderBlendMode) -> Option<wgpu::BlendState> {
    match blend {
        WgpuNativeRenderBlendMode::Replace => None,
        WgpuNativeRenderBlendMode::Alpha => Some(wgpu::BlendState::ALPHA_BLENDING),
    }
}
