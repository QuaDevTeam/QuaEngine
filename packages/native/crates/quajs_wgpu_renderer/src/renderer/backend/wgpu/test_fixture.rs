use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage, WgpuNativeRenderCommandEncoderPlan,
    WgpuNativeRenderDeviceBindGroupCacheRequest, WgpuNativeRenderDeviceBuffer,
    WgpuNativeRenderDeviceCommand, WgpuNativeRenderDevicePipelineCacheRequest,
    WgpuNativeRenderDevicePlan, WgpuNativeRenderDeviceQueueWrite, WgpuNativeRenderDeviceRenderPass,
    WgpuNativeRenderIndexFormat, WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPrimitiveTopology, WgpuNativeRenderShader, WgpuNativeRenderVertexAttribute,
    WgpuNativeRenderVertexFormat, WgpuNativeRenderVertexLayout, WgpuNativeRenderVertexSemantic,
    WgpuNativeRenderVertexStepMode, WgpuPhysicalRect,
};
use crate::resources::ResourceId;

pub(crate) fn device_plan(
    revision: u64,
    buffers: Vec<WgpuNativeRenderDeviceBuffer>,
    pipelines: Vec<WgpuNativeRenderDevicePipelineCacheRequest>,
    bind_groups: Vec<WgpuNativeRenderDeviceBindGroupCacheRequest>,
) -> WgpuNativeRenderDevicePlan {
    let vertex_byte_len = buffers
        .iter()
        .find(|buffer| buffer.descriptor.role == WgpuNativeRenderBufferRole::Vertex)
        .map(|buffer| buffer.byte_len)
        .unwrap_or(64);
    let index_byte_len = buffers
        .iter()
        .find(|buffer| buffer.descriptor.role == WgpuNativeRenderBufferRole::Index)
        .map(|buffer| buffer.byte_len)
        .unwrap_or(24);
    let bind_group_label = bind_groups
        .first()
        .map(|bind_group| bind_group.cache_label.clone())
        .unwrap_or_else(|| "bind-group::new".to_string());
    let bind_group_resource_ids = bind_groups
        .first()
        .map(|bind_group| bind_group.resource_ids.clone())
        .unwrap_or_else(|| vec![ResourceId::from("images:new.png")]);

    WgpuNativeRenderDevicePlan {
        revision,
        staging_buffer_byte_len: buffers.iter().map(|buffer| buffer.byte_len).sum(),
        gpu_buffer_count: buffers.len(),
        gpu_buffer_byte_len: buffers.iter().map(|buffer| buffer.byte_len).sum(),
        queue_write_count: buffers.len(),
        queue_write_byte_len: buffers.iter().map(|buffer| buffer.byte_len).sum(),
        pipeline_cache_request_count: pipelines.len(),
        bind_group_cache_request_count: bind_groups.len(),
        command_encoder_count: 1,
        render_pass_count: 1,
        render_pass_command_count: 8,
        draw_indexed_count: 1,
        skipped_draw_count: 0,
        staging_buffer: None,
        gpu_buffers: buffers.clone(),
        queue_writes: queue_writes(&buffers),
        pipeline_cache_requests: pipelines,
        bind_group_cache_requests: bind_groups,
        command_encoders: vec![command_encoder(
            revision,
            vertex_byte_len,
            index_byte_len,
            bind_group_label,
            bind_group_resource_ids,
        )],
    }
}

pub(crate) fn buffer(
    label: &str,
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
) -> WgpuNativeRenderDeviceBuffer {
    WgpuNativeRenderDeviceBuffer {
        label: label.to_string(),
        descriptor: WgpuNativeRenderBufferDescriptor {
            label: label.to_string(),
            role,
            byte_len,
            element_count: byte_len,
            usage: match role {
                WgpuNativeRenderBufferRole::Vertex => WgpuNativeRenderBufferUsage::VertexCopyDst,
                WgpuNativeRenderBufferRole::Index => WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
        },
        byte_len,
    }
}

pub(crate) fn pipeline(
    cache_label: &str,
    pipeline: DrawBatchPipeline,
) -> WgpuNativeRenderDevicePipelineCacheRequest {
    let key = pipeline_key(pipeline);
    WgpuNativeRenderDevicePipelineCacheRequest {
        cache_label: cache_label.to_string(),
        descriptor: pipeline_descriptor(key.clone()),
        key,
    }
}

pub(crate) fn bind_group<const N: usize>(
    cache_label: &str,
    resource_ids: [&str; N],
) -> WgpuNativeRenderDeviceBindGroupCacheRequest {
    WgpuNativeRenderDeviceBindGroupCacheRequest {
        cache_label: cache_label.to_string(),
        command_id: "ui:button".to_string(),
        layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        resource_ids: resource_ids.into_iter().map(ResourceId::from).collect(),
    }
}

fn queue_writes(buffers: &[WgpuNativeRenderDeviceBuffer]) -> Vec<WgpuNativeRenderDeviceQueueWrite> {
    buffers
        .iter()
        .enumerate()
        .map(|(index, buffer)| {
            let bytes = bytes_for_len(buffer.byte_len, index as u8);
            WgpuNativeRenderDeviceQueueWrite {
                staging_label: "staging".to_string(),
                target_label: buffer.label.clone(),
                staging_byte_offset: index * 16,
                buffer_byte_offset: 0,
                byte_len: buffer.byte_len,
                checksum: checksum(&bytes),
                bytes,
            }
        })
        .collect()
}

fn bytes_for_len(byte_len: usize, seed: u8) -> Vec<u8> {
    (0..byte_len)
        .map(|index| seed.wrapping_add((index % 251) as u8))
        .collect()
}

fn checksum(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        hash.wrapping_mul(0x100000001b3).wrapping_add(*byte as u64)
    })
}

fn command_encoder(
    revision: u64,
    vertex_byte_len: usize,
    index_byte_len: usize,
    bind_group_label: String,
    bind_group_resource_ids: Vec<ResourceId>,
) -> WgpuNativeRenderCommandEncoderPlan {
    WgpuNativeRenderCommandEncoderPlan {
        label: format!("encoder::{revision}"),
        pass_count: 1,
        command_count: 8,
        render_passes: vec![WgpuNativeRenderDeviceRenderPass {
            label: "pass::main".to_string(),
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 1280, 720),
            command_count: 8,
            draw_indexed_count: 1,
            skipped_draw_count: 0,
            commands: render_pass_commands(
                vertex_byte_len,
                index_byte_len,
                bind_group_label,
                bind_group_resource_ids,
            ),
        }],
    }
}

fn render_pass_commands(
    vertex_byte_len: usize,
    index_byte_len: usize,
    bind_group_label: String,
    bind_group_resource_ids: Vec<ResourceId>,
) -> Vec<WgpuNativeRenderDeviceCommand> {
    vec![
        WgpuNativeRenderDeviceCommand::BeginRenderPass {
            label: "pass::main".to_string(),
            viewport: rect(0, 0, 1280, 720),
        },
        WgpuNativeRenderDeviceCommand::SetViewport {
            viewport: rect(0, 0, 1280, 720),
        },
        WgpuNativeRenderDeviceCommand::SetVertexBuffer {
            buffer_label: "vertex".to_string(),
            byte_len: vertex_byte_len,
        },
        WgpuNativeRenderDeviceCommand::SetIndexBuffer {
            buffer_label: "index".to_string(),
            byte_len: index_byte_len,
        },
        WgpuNativeRenderDeviceCommand::SetPipeline {
            command_id: "ui:button".to_string(),
            key: pipeline_key(DrawBatchPipeline::Ui),
            cache_label: "pipeline::ui".to_string(),
        },
        WgpuNativeRenderDeviceCommand::SetBindGroup {
            command_id: "ui:button".to_string(),
            cache_label: bind_group_label,
            resource_ids: bind_group_resource_ids,
        },
        WgpuNativeRenderDeviceCommand::DrawIndexed {
            command_id: "ui:button".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: rect(20, 20, 160, 120),
            scissor: None,
        },
        WgpuNativeRenderDeviceCommand::EndRenderPass {
            label: "pass::main".to_string(),
        },
    ]
}

fn pipeline_key(pipeline: DrawBatchPipeline) -> WgpuNativeRenderPipelineKey {
    WgpuNativeRenderPipelineKey {
        pipeline,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    }
}

fn pipeline_descriptor(key: WgpuNativeRenderPipelineKey) -> WgpuNativeRenderPipelineDescriptor {
    WgpuNativeRenderPipelineDescriptor {
        label: "pipeline".to_string(),
        key,
        vertex_layout: vertex_layout(),
        index_format: WgpuNativeRenderIndexFormat::Uint32,
        primitive_topology: WgpuNativeRenderPrimitiveTopology::TriangleList,
    }
}

fn vertex_layout() -> WgpuNativeRenderVertexLayout {
    WgpuNativeRenderVertexLayout {
        array_stride: 16,
        step_mode: WgpuNativeRenderVertexStepMode::Vertex,
        attributes: vec![
            WgpuNativeRenderVertexAttribute {
                shader_location: 0,
                offset: 0,
                format: WgpuNativeRenderVertexFormat::Float32x2,
                semantic: WgpuNativeRenderVertexSemantic::Position,
            },
            WgpuNativeRenderVertexAttribute {
                shader_location: 1,
                offset: 8,
                format: WgpuNativeRenderVertexFormat::Float32x2,
                semantic: WgpuNativeRenderVertexSemantic::Uv,
            },
        ],
    }
}

fn rect(x: u32, y: u32, width: u32, height: u32) -> WgpuPhysicalRect {
    WgpuPhysicalRect {
        x,
        y,
        width,
        height,
    }
}
