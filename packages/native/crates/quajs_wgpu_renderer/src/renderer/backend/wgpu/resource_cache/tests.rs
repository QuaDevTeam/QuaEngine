use super::*;
use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage, WgpuNativeRenderCommandEncoderPlan,
    WgpuNativeRenderDeviceBindGroupCacheRequest, WgpuNativeRenderDeviceBuffer,
    WgpuNativeRenderDevicePipelineCacheRequest, WgpuNativeRenderDevicePlan,
    WgpuNativeRenderDeviceQueueWrite, WgpuNativeRenderIndexFormat,
    WgpuNativeRenderPipelineDescriptor, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPrimitiveTopology, WgpuNativeRenderShader, WgpuNativeRenderVertexAttribute,
    WgpuNativeRenderVertexFormat, WgpuNativeRenderVertexLayout, WgpuNativeRenderVertexSemantic,
    WgpuNativeRenderVertexStepMode,
};
use crate::resources::ResourceId;

#[test]
fn tracks_create_reuse_recreate_and_release_across_frames() {
    let first = device_plan(
        1,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 48),
            buffer("index", WgpuNativeRenderBufferRole::Index, 16),
            buffer("unused-next", WgpuNativeRenderBufferRole::Vertex, 8),
        ],
        vec![pipeline("pipeline::ui", DrawBatchPipeline::Ui)],
        vec![bind_group(
            "bind-group::portrait",
            WgpuNativeRenderBindGroupLayout::TextureSampler,
            ["images:portrait.png"],
        )],
    );
    let first_cache = WgpuNativeRenderResourceCachePlan::from_device_plan(None, &first);

    assert_eq!(first_cache.previous_revision, None);
    assert_eq!(first_cache.buffer_create_count, 3);
    assert_eq!(first_cache.pipeline_create_count, 1);
    assert_eq!(first_cache.pipeline_recreate_count, 0);
    assert_eq!(first_cache.bind_group_create_count, 1);
    assert_eq!(first_cache.bind_group_recreate_count, 0);
    assert_eq!(first_cache.buffer_resident_byte_len, 72);

    let second = device_plan(
        2,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 64),
            buffer("index", WgpuNativeRenderBufferRole::Index, 16),
        ],
        vec![
            pipeline("pipeline::ui", DrawBatchPipeline::Ui),
            pipeline("pipeline::image", DrawBatchPipeline::Image),
        ],
        vec![bind_group(
            "bind-group::portrait",
            WgpuNativeRenderBindGroupLayout::TextureSampler,
            ["images:portrait.png"],
        )],
    );
    let second_cache =
        WgpuNativeRenderResourceCachePlan::from_device_plan(Some(&first_cache), &second);

    assert_eq!(second_cache.previous_revision, Some(1));
    assert_eq!(second_cache.buffer_create_count, 0);
    assert_eq!(second_cache.buffer_reuse_count, 1);
    assert_eq!(second_cache.buffer_recreate_count, 1);
    assert_eq!(second_cache.buffer_release_count, 1);
    assert_eq!(second_cache.released_buffers[0].label, "unused-next");
    assert_eq!(second_cache.buffer_resident_byte_len, 80);
    assert_eq!(second_cache.pipeline_create_count, 1);
    assert_eq!(second_cache.pipeline_reuse_count, 1);
    assert_eq!(second_cache.pipeline_recreate_count, 0);
    assert_eq!(second_cache.pipeline_release_count, 0);
    assert_eq!(second_cache.bind_group_create_count, 0);
    assert_eq!(second_cache.bind_group_reuse_count, 1);
    assert_eq!(second_cache.bind_group_recreate_count, 0);
    assert_eq!(second_cache.queue_write_count, 2);
    assert_eq!(second_cache.queue_write_byte_len, 80);
    assert_eq!(second_cache.encoder_count, 1);
    assert_eq!(second_cache.render_pass_count, 1);
    assert_eq!(second_cache.render_pass_command_count, 3);

    let vertex_status = second_cache
        .buffer_entries
        .iter()
        .find(|entry| entry.label == "vertex")
        .map(|entry| entry.status);
    assert_eq!(
        vertex_status,
        Some(WgpuNativeRenderCacheEntryStatus::Recreate)
    );
}

#[test]
fn tracks_pipeline_and_bind_group_recreate_counts_across_frames() {
    let first = device_plan(
        1,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 48),
            buffer("index", WgpuNativeRenderBufferRole::Index, 16),
        ],
        vec![pipeline("pipeline::shared", DrawBatchPipeline::Ui)],
        vec![bind_group(
            "bind-group::shared",
            WgpuNativeRenderBindGroupLayout::TextureSampler,
            ["images:portrait.png"],
        )],
    );
    let first_cache = WgpuNativeRenderResourceCachePlan::from_device_plan(None, &first);
    let second = device_plan(
        2,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 48),
            buffer("index", WgpuNativeRenderBufferRole::Index, 16),
        ],
        vec![pipeline("pipeline::shared", DrawBatchPipeline::Image)],
        vec![bind_group(
            "bind-group::shared",
            WgpuNativeRenderBindGroupLayout::TextureSampler,
            ["images:replacement.png"],
        )],
    );

    let second_cache =
        WgpuNativeRenderResourceCachePlan::from_device_plan(Some(&first_cache), &second);

    assert_eq!(second_cache.pipeline_create_count, 0);
    assert_eq!(second_cache.pipeline_reuse_count, 0);
    assert_eq!(second_cache.pipeline_recreate_count, 1);
    assert_eq!(second_cache.pipeline_release_count, 0);
    assert_eq!(second_cache.bind_group_create_count, 0);
    assert_eq!(second_cache.bind_group_reuse_count, 0);
    assert_eq!(second_cache.bind_group_recreate_count, 1);
    assert_eq!(second_cache.bind_group_release_count, 0);
    assert_eq!(
        second_cache.pipeline_entries[0].status,
        WgpuNativeRenderCacheEntryStatus::Recreate
    );
    assert_eq!(
        second_cache.bind_group_entries[0].status,
        WgpuNativeRenderCacheEntryStatus::Recreate
    );
}

fn device_plan(
    revision: u64,
    buffers: Vec<WgpuNativeRenderDeviceBuffer>,
    pipelines: Vec<WgpuNativeRenderDevicePipelineCacheRequest>,
    bind_groups: Vec<WgpuNativeRenderDeviceBindGroupCacheRequest>,
) -> WgpuNativeRenderDevicePlan {
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
        render_pass_command_count: 3,
        draw_indexed_count: 1,
        skipped_draw_count: 0,
        staging_buffer: None,
        queue_writes: buffers
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
            .collect(),
        gpu_buffers: buffers,
        pipeline_cache_requests: pipelines,
        bind_group_cache_requests: bind_groups,
        command_encoders: vec![WgpuNativeRenderCommandEncoderPlan {
            label: format!("encoder::{revision}"),
            pass_count: 1,
            command_count: 3,
            render_passes: Vec::new(),
        }],
    }
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

fn buffer(
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

fn pipeline(
    cache_label: &str,
    pipeline: DrawBatchPipeline,
) -> WgpuNativeRenderDevicePipelineCacheRequest {
    let key = WgpuNativeRenderPipelineKey {
        pipeline,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    WgpuNativeRenderDevicePipelineCacheRequest {
        cache_label: cache_label.to_string(),
        descriptor: pipeline_descriptor(key.clone()),
        key,
    }
}

fn bind_group<const N: usize>(
    cache_label: &str,
    layout: WgpuNativeRenderBindGroupLayout,
    resource_ids: [&str; N],
) -> WgpuNativeRenderDeviceBindGroupCacheRequest {
    WgpuNativeRenderDeviceBindGroupCacheRequest {
        cache_label: cache_label.to_string(),
        command_id: "ui:portrait".to_string(),
        layout,
        resource_ids: resource_ids.into_iter().map(ResourceId::from).collect(),
    }
}

fn pipeline_descriptor(key: WgpuNativeRenderPipelineKey) -> WgpuNativeRenderPipelineDescriptor {
    WgpuNativeRenderPipelineDescriptor {
        label: "pipeline".to_string(),
        key,
        vertex_layout: WgpuNativeRenderVertexLayout {
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
        },
        index_format: WgpuNativeRenderIndexFormat::Uint32,
        primitive_topology: WgpuNativeRenderPrimitiveTopology::TriangleList,
    }
}
