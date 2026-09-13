use super::super::*;

#[test]
fn noop_device_materializes_textured_quad_with_placeholder_sampler() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let vertex_bytes = quad_vertex_bytes();
    let vertex_byte_len = vertex_bytes.len();
    let index_bytes = quad_index_bytes();
    let pipeline_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Image,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 3,
        operation_count: 15,
        cache_operation_count: 4,
        queue_write_count: 2,
        queue_write_byte_len: vertex_bytes.len() + index_bytes.len(),
        encoder_count: 1,
        render_pass_count: 1,
        render_pass_command_count: 7,
        draw_indexed_count: 1,
        submit_count: 1,
        operations: vec![
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label: "vertex".to_string(),
                descriptor: WgpuNativeRenderBufferDescriptor {
                    label: "vertex".to_string(),
                    role: WgpuNativeRenderBufferRole::Vertex,
                    byte_len: vertex_bytes.len(),
                    element_count: 4,
                    usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
                },
                byte_len: vertex_byte_len,
            },
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label: "index".to_string(),
                descriptor: WgpuNativeRenderBufferDescriptor {
                    label: "index".to_string(),
                    role: WgpuNativeRenderBufferRole::Index,
                    byte_len: index_bytes.len(),
                    element_count: 6,
                    usage: WgpuNativeRenderBufferUsage::IndexCopyDst,
                },
                byte_len: index_bytes.len(),
            },
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label: "pipeline::textured".to_string(),
                key: pipeline_key.clone(),
                descriptor: pipeline_descriptor("pipeline::textured", pipeline_key.clone()),
            },
            WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label: "bind-group::texture".to_string(),
                command_id: "background:image".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec!["images:bg.png".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::QueueWrite {
                staging_label: "staging::vertex".to_string(),
                target_label: "vertex".to_string(),
                staging_byte_offset: 0,
                buffer_byte_offset: 0,
                byte_len: vertex_byte_len,
                checksum: checksum_bytes(&vertex_bytes),
                bytes: vertex_bytes,
            },
            WgpuNativeRenderRuntimeOperation::QueueWrite {
                staging_label: "staging::index".to_string(),
                target_label: "index".to_string(),
                staging_byte_offset: 0,
                buffer_byte_offset: 0,
                byte_len: index_bytes.len(),
                checksum: checksum_bytes(&index_bytes),
                bytes: index_bytes,
            },
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 7,
            },
            WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label: "encoder".to_string(),
                pass_label: "pass".to_string(),
                pass_index: 0,
                plane: None,
                viewport: WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 64,
                    height: 64,
                },
                command_count: 7,
            },
            WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "vertex".to_string(),
                byte_len: vertex_byte_len,
            },
            WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label: "pass".to_string(),
                buffer_label: "index".to_string(),
                byte_len: 24,
            },
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label: "pass".to_string(),
                command_id: "background:image".to_string(),
                key: pipeline_key,
                cache_label: "pipeline::textured".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::SetBindGroup {
                pass_label: "pass".to_string(),
                command_id: "background:image".to_string(),
                cache_label: "bind-group::texture".to_string(),
                resource_ids: vec!["images:bg.png".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::DrawIndexed {
                pass_label: "pass".to_string(),
                command_id: "background:image".to_string(),
                first_index: 0,
                index_count: 6,
                first_vertex: 0,
                vertex_count: 4,
                physical_bounds: WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 64,
                    height: 64,
                },
                scissor: None,
            },
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "pass".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
                encoder_label: "encoder".to_string(),
                pass_count: 1,
                command_count: 7,
            },
        ],
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert!(executor.device_attached());
    assert_eq!(report.buffer_create_count, 2);
    assert_eq!(report.pipeline_create_count, 1);
    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(report.queue_write_count, 2);
    assert_eq!(report.draw_indexed_count, 1);
    assert_eq!(report.resident_buffer_count, 2);
    assert_eq!(report.resident_pipeline_count, 1);
    assert_eq!(report.resident_bind_group_count, 1);
    assert_eq!(report.submitted_command_buffer_count, 1);

    let bind_group = executor
        .device()
        .bind_groups
        .get("bind-group::texture")
        .unwrap();
    let texture_sampler = bind_group.texture_sampler.as_ref().unwrap();
    assert_eq!(
        texture_sampler.placeholder_rgba8,
        placeholder_texture_rgba8(&["images:bg.png".to_string()])
    );
}
