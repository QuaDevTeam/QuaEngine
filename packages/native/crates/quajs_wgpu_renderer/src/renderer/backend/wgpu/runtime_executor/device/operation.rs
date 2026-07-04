use super::super::draw::{set_active_bind_group, set_active_pipeline, validate_draw_state};
use super::super::passes::{
    begin_pass, create_encoder, end_pass, require_pass, set_viewport, submit_encoder,
};
use super::super::resources::{
    create_bind_group, create_buffer, create_pipeline, queue_write, recreate_bind_group,
    recreate_buffer, recreate_pipeline, release_bind_group, release_buffer, release_pipeline,
    require_bind_group, require_buffer_role_and_byte_len, reuse_buffer, reuse_pipeline,
};
use super::super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeExecutionReport};
use super::WgpuNativeRenderRuntimeState;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferRole, WgpuNativeRenderRuntimeOperation,
};

pub(super) fn apply_operation(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    operation: &WgpuNativeRenderRuntimeOperation,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    match operation {
        WgpuNativeRenderRuntimeOperation::CreateBuffer {
            label,
            descriptor,
            byte_len,
        } => create_buffer(state, report, label, descriptor.role, *byte_len),
        WgpuNativeRenderRuntimeOperation::ReuseBuffer { label, byte_len } => {
            reuse_buffer(state, report, label, *byte_len)
        }
        WgpuNativeRenderRuntimeOperation::RecreateBuffer {
            label,
            descriptor,
            byte_len,
        } => recreate_buffer(state, report, label, descriptor.role, *byte_len),
        WgpuNativeRenderRuntimeOperation::ReleaseBuffer { label, .. } => {
            release_buffer(state, report, label)
        }
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label, key, ..
        } => create_pipeline(state, report, cache_label, key.clone()),
        WgpuNativeRenderRuntimeOperation::ReusePipeline { cache_label, key } => {
            reuse_pipeline(state, report, cache_label, key)
        }
        WgpuNativeRenderRuntimeOperation::RecreatePipeline {
            cache_label, key, ..
        } => recreate_pipeline(state, report, cache_label, key.clone()),
        WgpuNativeRenderRuntimeOperation::ReleasePipeline { cache_label } => {
            release_pipeline(state, report, cache_label)
        }
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label,
            command_id,
            layout,
            resource_ids,
        } => create_bind_group(
            state,
            report,
            cache_label,
            command_id,
            *layout,
            resource_ids,
        ),
        WgpuNativeRenderRuntimeOperation::ReuseBindGroup { cache_label, .. } => {
            require_bind_group(state, cache_label)?;
            report.bind_group_reuse_count += 1;
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::RecreateBindGroup {
            cache_label,
            command_id,
            layout,
            resource_ids,
        } => recreate_bind_group(
            state,
            report,
            cache_label,
            command_id,
            *layout,
            resource_ids,
        ),
        WgpuNativeRenderRuntimeOperation::ReleaseBindGroup { cache_label } => {
            release_bind_group(state, report, cache_label)
        }
        WgpuNativeRenderRuntimeOperation::QueueWrite {
            target_label,
            buffer_byte_offset,
            byte_len,
            checksum,
            bytes,
            ..
        } => queue_write(
            state,
            target_label,
            *buffer_byte_offset,
            *byte_len,
            *checksum,
            bytes,
        ),
        WgpuNativeRenderRuntimeOperation::CreateCommandEncoder { label, .. } => {
            create_encoder(state, label)
        }
        WgpuNativeRenderRuntimeOperation::BeginRenderPass {
            encoder_label,
            pass_label,
            viewport,
            ..
        } => begin_pass(state, encoder_label, pass_label, *viewport),
        WgpuNativeRenderRuntimeOperation::SetViewport {
            pass_label,
            viewport,
        } => set_viewport(state, pass_label, *viewport),
        WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
            pass_label,
            buffer_label,
            byte_len,
        } => {
            require_pass(state, pass_label)?;
            require_buffer_role_and_byte_len(
                state,
                buffer_label,
                WgpuNativeRenderBufferRole::Vertex,
                *byte_len,
            )?;
            state.active_vertex_buffer_label = Some(buffer_label.to_string());
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
            pass_label,
            buffer_label,
            byte_len,
        } => {
            require_pass(state, pass_label)?;
            require_buffer_role_and_byte_len(
                state,
                buffer_label,
                WgpuNativeRenderBufferRole::Index,
                *byte_len,
            )?;
            state.active_index_buffer_label = Some(buffer_label.to_string());
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label,
            cache_label,
            ..
        } => set_active_pipeline(state, pass_label, cache_label),
        WgpuNativeRenderRuntimeOperation::SetBindGroup {
            pass_label,
            command_id,
            cache_label,
            resource_ids,
            ..
        } => set_active_bind_group(state, pass_label, command_id, cache_label, resource_ids),
        WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label,
            command_id,
            first_index,
            index_count,
            first_vertex,
            vertex_count,
            physical_bounds,
            scissor,
            ..
        } => validate_draw_state(
            state,
            pass_label,
            command_id,
            *first_index,
            *index_count,
            *first_vertex,
            *vertex_count,
            *physical_bounds,
            *scissor,
        ),
        WgpuNativeRenderRuntimeOperation::SkipDraw { pass_label, .. } => {
            require_pass(state, pass_label)
        }
        WgpuNativeRenderRuntimeOperation::EndRenderPass { pass_label } => {
            end_pass(state, pass_label)
        }
        WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer { encoder_label, .. } => {
            submit_encoder(state, encoder_label)
        }
    }
}
