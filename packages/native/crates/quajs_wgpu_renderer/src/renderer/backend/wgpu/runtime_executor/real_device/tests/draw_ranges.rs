use super::*;

#[test]
fn noop_device_rejects_first_vertex_outside_wgpu_base_vertex_range() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:base-vertex-overflow", 0, 6, i32::MAX as u32 + 1, 1),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("base vertex range"));

    let pass = device
        .active_encoder
        .as_ref()
        .and_then(|encoder| encoder.active_pass.as_ref())
        .expect("pass should remain active after rejected draw");
    assert!(pass.draws.is_empty());
}

#[test]
fn noop_device_rejects_draw_index_range_exceeding_index_buffer() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 8);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:index-overflow", 0, 6, 0, 4),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("index range requires 24 bytes"));
    assert!(error.message.contains("index buffer has 8"));
}

#[test]
fn noop_device_rejects_draw_vertex_range_exceeding_vertex_buffer() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 64, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:vertex-overflow", 0, 6, 0, 4),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    let required_bytes = 4 * WgpuNativeRenderBufferVertex::BYTE_LEN;
    assert!(error
        .message
        .contains(&format!("vertex range requires {required_bytes} bytes")));
    assert!(error.message.contains("vertex buffer has 64"));
}

fn apply_draw_range_setup(
    device: &mut RealWgpuNativeRenderRuntimeDevice,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    vertex_byte_len: usize,
    index_byte_len: usize,
) {
    let solid_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    for operation in [
        WgpuNativeRenderRuntimeOperation::CreateBuffer {
            label: "vertex".to_string(),
            descriptor: WgpuNativeRenderBufferDescriptor {
                label: "vertex".to_string(),
                role: WgpuNativeRenderBufferRole::Vertex,
                byte_len: vertex_byte_len,
                element_count: vertex_byte_len / WgpuNativeRenderBufferVertex::BYTE_LEN,
                usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
            },
            byte_len: vertex_byte_len,
        },
        WgpuNativeRenderRuntimeOperation::CreateBuffer {
            label: "index".to_string(),
            descriptor: WgpuNativeRenderBufferDescriptor {
                label: "index".to_string(),
                role: WgpuNativeRenderBufferRole::Index,
                byte_len: index_byte_len,
                element_count: index_byte_len / std::mem::size_of::<u32>(),
                usage: WgpuNativeRenderBufferUsage::IndexCopyDst,
            },
            byte_len: index_byte_len,
        },
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label: "pipeline::solid".to_string(),
            key: solid_key.clone(),
            descriptor: pipeline_descriptor("pipeline::solid", solid_key.clone()),
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
            byte_len: index_byte_len,
        },
        WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label: "pass".to_string(),
            command_id: "ui:panel".to_string(),
            key: solid_key,
            cache_label: "pipeline::solid".to_string(),
        },
    ] {
        device
            .apply_runtime_operation(&operation, report)
            .expect("setup operation should apply");
    }
}

fn draw_range_operation(
    command_id: &str,
    first_index: u32,
    index_count: u32,
    first_vertex: u32,
    vertex_count: u32,
) -> WgpuNativeRenderRuntimeOperation {
    WgpuNativeRenderRuntimeOperation::DrawIndexed {
        pass_label: "pass".to_string(),
        command_id: command_id.to_string(),
        first_index,
        index_count,
        first_vertex,
        vertex_count,
        physical_bounds: WgpuPhysicalRect {
            x: 0,
            y: 0,
            width: 64,
            height: 64,
        },
        scissor: None,
    }
}
