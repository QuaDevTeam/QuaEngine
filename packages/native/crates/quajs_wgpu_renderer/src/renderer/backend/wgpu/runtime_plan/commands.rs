use super::super::device_plan::{
    WgpuNativeRenderCommandEncoderPlan, WgpuNativeRenderDeviceCommand, WgpuNativeRenderDevicePlan,
    WgpuNativeRenderDeviceRenderPass,
};
use super::WgpuNativeRenderRuntimeOperation;
use crate::render_graph::RenderPlane;

pub(super) fn push_queue_writes(
    device_plan: &WgpuNativeRenderDevicePlan,
    operations: &mut Vec<WgpuNativeRenderRuntimeOperation>,
) {
    operations.extend(device_plan.queue_writes.iter().map(|write| {
        WgpuNativeRenderRuntimeOperation::QueueWrite {
            staging_label: write.staging_label.clone(),
            target_label: write.target_label.clone(),
            staging_byte_offset: write.staging_byte_offset,
            buffer_byte_offset: write.buffer_byte_offset,
            byte_len: write.byte_len,
            checksum: write.checksum,
            bytes: write.bytes.clone(),
        }
    }));
}

pub(super) fn push_command_encoders(
    device_plan: &WgpuNativeRenderDevicePlan,
    operations: &mut Vec<WgpuNativeRenderRuntimeOperation>,
) {
    for encoder in &device_plan.command_encoders {
        push_command_encoder(encoder, operations);
    }
}

fn push_command_encoder(
    encoder: &WgpuNativeRenderCommandEncoderPlan,
    operations: &mut Vec<WgpuNativeRenderRuntimeOperation>,
) {
    operations.push(WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
        label: encoder.label.clone(),
        pass_count: encoder.pass_count,
        command_count: encoder.command_count,
    });
    for pass in &encoder.render_passes {
        // Snapshot the current frame content into the backdrop-capture slot
        // before the Safe plane renders so backdrop-blur commands can sample it.
        if pass.plane == Some(RenderPlane::Safe) {
            operations.push(WgpuNativeRenderRuntimeOperation::CopyFramebufferToBackdrop);
        }
        push_render_pass(&encoder.label, pass, operations);
    }
    operations.push(WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
        encoder_label: encoder.label.clone(),
        pass_count: encoder.pass_count,
        command_count: encoder.command_count,
    });
}

fn push_render_pass(
    encoder_label: &str,
    pass: &WgpuNativeRenderDeviceRenderPass,
    operations: &mut Vec<WgpuNativeRenderRuntimeOperation>,
) {
    for command in &pass.commands {
        operations.push(render_pass_operation(
            encoder_label,
            &pass.label,
            pass,
            command,
        ));
    }
}

fn render_pass_operation(
    encoder_label: &str,
    pass_label: &str,
    pass: &WgpuNativeRenderDeviceRenderPass,
    command: &WgpuNativeRenderDeviceCommand,
) -> WgpuNativeRenderRuntimeOperation {
    match command {
        WgpuNativeRenderDeviceCommand::BeginRenderPass { viewport, .. } => {
            WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label: encoder_label.to_string(),
                pass_label: pass_label.to_string(),
                pass_index: pass.pass_index,
                plane: pass.plane,
                viewport: *viewport,
                command_count: pass.command_count,
            }
        }
        WgpuNativeRenderDeviceCommand::SetViewport { viewport } => {
            WgpuNativeRenderRuntimeOperation::SetViewport {
                pass_label: pass_label.to_string(),
                viewport: *viewport,
            }
        }
        WgpuNativeRenderDeviceCommand::SetVertexBuffer {
            buffer_label,
            byte_len,
        } => WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
            pass_label: pass_label.to_string(),
            buffer_label: buffer_label.clone(),
            byte_len: *byte_len,
        },
        WgpuNativeRenderDeviceCommand::SetIndexBuffer {
            buffer_label,
            byte_len,
        } => WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
            pass_label: pass_label.to_string(),
            buffer_label: buffer_label.clone(),
            byte_len: *byte_len,
        },
        WgpuNativeRenderDeviceCommand::SetPipeline {
            command_id,
            key,
            cache_label,
        } => WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label: pass_label.to_string(),
            command_id: command_id.clone(),
            key: key.clone(),
            cache_label: cache_label.clone(),
        },
        WgpuNativeRenderDeviceCommand::SetBindGroup {
            command_id,
            cache_label,
            resource_ids,
        } => WgpuNativeRenderRuntimeOperation::SetBindGroup {
            pass_label: pass_label.to_string(),
            command_id: command_id.clone(),
            cache_label: cache_label.clone(),
            resource_ids: resource_ids
                .iter()
                .map(|resource_id| resource_id.as_str().to_string())
                .collect(),
        },
        WgpuNativeRenderDeviceCommand::DrawIndexed {
            command_id,
            first_index,
            index_count,
            first_vertex,
            vertex_count,
            physical_bounds,
            scissor,
        } => WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label: pass_label.to_string(),
            command_id: command_id.clone(),
            first_index: *first_index,
            index_count: *index_count,
            first_vertex: *first_vertex,
            vertex_count: *vertex_count,
            physical_bounds: *physical_bounds,
            scissor: *scissor,
        },
        WgpuNativeRenderDeviceCommand::SkipDraw {
            command_id,
            reason,
            resource_ids,
            owner_package_id,
            required_package_ids,
        } => WgpuNativeRenderRuntimeOperation::SkipDraw {
            pass_label: pass_label.to_string(),
            command_id: command_id.clone(),
            reason: reason.clone(),
            resource_ids: resource_ids
                .iter()
                .map(|resource_id| resource_id.as_str().to_string())
                .collect(),
            owner_package_id: owner_package_id.clone(),
            required_package_ids: required_package_ids.clone(),
        },
        WgpuNativeRenderDeviceCommand::EndRenderPass { .. } => {
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: pass_label.to_string(),
            }
        }
    }
}
