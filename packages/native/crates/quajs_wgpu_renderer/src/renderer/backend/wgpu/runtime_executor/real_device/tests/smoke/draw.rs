use super::*;

#[test]
fn noop_device_materializes_solid_color_indexed_draw_with_scissor() {
    materializes_draw(1);
}

#[test]
fn noop_device_resolves_msaa_solid_draw() {
    materializes_draw(4);
}

fn materializes_draw(samples: u32) {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64).with_msaa_samples(samples);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let vertex_bytes = quad_vertex_bytes();
    let vertex_byte_len = vertex_bytes.len();
    let index_bytes = quad_index_bytes();
    let pipeline_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 2,
        operation_count: 13,
        cache_operation_count: 3,
        queue_write_count: 2,
        queue_write_byte_len: vertex_bytes.len() + index_bytes.len(),
        encoder_count: 1,
        render_pass_count: 1,
        render_pass_command_count: 6,
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
                cache_label: "pipeline::solid".to_string(),
                key: pipeline_key.clone(),
                descriptor: pipeline_descriptor("pipeline::solid", pipeline_key.clone()),
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
                command_count: 6,
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
                command_count: 6,
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
                command_id: "ui:quad".to_string(),
                key: pipeline_key,
                cache_label: "pipeline::solid".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::DrawIndexed {
                pass_label: "pass".to_string(),
                command_id: "ui:quad".to_string(),
                first_index: 0,
                index_count: 6,
                first_vertex: 0,
                vertex_count: 4,
                physical_bounds: WgpuPhysicalRect {
                    x: 4,
                    y: 4,
                    width: 48,
                    height: 48,
                },
                scissor: Some(WgpuPhysicalRect {
                    x: 8,
                    y: 8,
                    width: 40,
                    height: 40,
                }),
            },
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "pass".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
                encoder_label: "encoder".to_string(),
                pass_count: 1,
                command_count: 6,
            },
        ],
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(
        executor.device().frame_target_snapshot().sample_count,
        samples
    );
    assert!(executor.device_attached());
    assert_eq!(report.buffer_create_count, 2);
    assert_eq!(report.pipeline_create_count, 1);
    assert_eq!(report.queue_write_count, 2);
    assert_eq!(report.draw_indexed_count, 1);
    assert_eq!(report.resident_buffer_count, 2);
    assert_eq!(report.resident_pipeline_count, 1);
    assert_eq!(report.submitted_command_buffer_count, 1);
}
