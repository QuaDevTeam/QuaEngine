use super::super::bind_group::{
    pipeline_uses_texture_sampler_bind_group, validate_bind_group_matches_pipeline,
};
use super::super::pass::validate_pass_viewport;
use super::super::RealWgpuNativeRenderRuntimeDevice;
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeExecutionReport,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferRole, WgpuNativeRenderRuntimeOperation,
};

pub(super) fn apply_real_runtime_operation(
    device: &mut RealWgpuNativeRenderRuntimeDevice,
    operation: &WgpuNativeRenderRuntimeOperation,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    match operation {
        WgpuNativeRenderRuntimeOperation::CreateBuffer {
            label,
            descriptor,
            byte_len,
        } => device.create_buffer(label, descriptor, *byte_len, report),
        WgpuNativeRenderRuntimeOperation::ReuseBuffer { label, byte_len } => {
            device.reuse_buffer(label, *byte_len, report)
        }
        WgpuNativeRenderRuntimeOperation::RecreateBuffer {
            label,
            descriptor,
            byte_len,
        } => device.recreate_buffer(label, descriptor, *byte_len, report),
        WgpuNativeRenderRuntimeOperation::ReleaseBuffer { label, .. } => {
            device.release_buffer(label, report)
        }
        WgpuNativeRenderRuntimeOperation::CreatePipeline {
            cache_label, key, ..
        } => device.create_pipeline(cache_label, key.clone(), report),
        WgpuNativeRenderRuntimeOperation::ReusePipeline { cache_label, key } => {
            device.reuse_pipeline(cache_label, key, report)
        }
        WgpuNativeRenderRuntimeOperation::RecreatePipeline {
            cache_label, key, ..
        } => device.recreate_pipeline(cache_label, key.clone(), report),
        WgpuNativeRenderRuntimeOperation::ReleasePipeline { cache_label } => {
            device.release_pipeline(cache_label, report)
        }
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label,
            command_id,
            layout,
            resource_ids,
        } => device.create_bind_group(cache_label, command_id, *layout, resource_ids, report),
        WgpuNativeRenderRuntimeOperation::ReuseBindGroup { cache_label, .. } => {
            device.require_bind_group(cache_label)?;
            report.bind_group_reuse_count += 1;
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::RecreateBindGroup {
            cache_label,
            command_id,
            layout,
            resource_ids,
        } => device.recreate_bind_group(cache_label, command_id, *layout, resource_ids, report),
        WgpuNativeRenderRuntimeOperation::ReleaseBindGroup { cache_label } => {
            device.release_bind_group(cache_label, report)
        }
        WgpuNativeRenderRuntimeOperation::QueueWrite {
            target_label,
            buffer_byte_offset,
            byte_len,
            checksum,
            bytes,
            ..
        } => device.queue_write(
            target_label,
            *buffer_byte_offset,
            *byte_len,
            *checksum,
            bytes,
        ),
        WgpuNativeRenderRuntimeOperation::CreateCommandEncoder { label, .. } => {
            device.create_encoder(label)
        }
        WgpuNativeRenderRuntimeOperation::BeginRenderPass {
            encoder_label,
            pass_label,
            viewport,
            ..
        } => device.begin_pass(encoder_label, pass_label, *viewport),
        WgpuNativeRenderRuntimeOperation::SetViewport {
            pass_label,
            viewport,
        } => {
            validate_pass_viewport(pass_label, *viewport, device.target.extent())?;
            device.active_pass_mut(pass_label)?.viewport = *viewport;
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
            pass_label,
            buffer_label,
            byte_len,
        } => {
            device.require_buffer_role_and_byte_len(
                buffer_label,
                WgpuNativeRenderBufferRole::Vertex,
                *byte_len,
            )?;
            device.active_pass_mut(pass_label)?.vertex_buffer_label =
                Some(buffer_label.to_string());
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
            pass_label,
            buffer_label,
            byte_len,
        } => {
            device.require_buffer_role_and_byte_len(
                buffer_label,
                WgpuNativeRenderBufferRole::Index,
                *byte_len,
            )?;
            device.active_pass_mut(pass_label)?.index_buffer_label = Some(buffer_label.to_string());
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::SetPipeline {
            pass_label,
            cache_label,
            ..
        } => {
            let uses_texture_sampler =
                pipeline_uses_texture_sampler_bind_group(device.require_pipeline(cache_label)?);
            let pass = device.active_pass_mut(pass_label)?;
            pass.pipeline_cache_label = Some(cache_label.to_string());
            if !uses_texture_sampler {
                pass.bind_group_cache_label = None;
            }
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::SetBindGroup {
            pass_label,
            command_id,
            cache_label,
            resource_ids,
            ..
        } => {
            let pipeline =
                device.require_active_texture_sampler_pipeline(pass_label, command_id)?;
            let bind_group =
                device.require_matching_bind_group(cache_label, command_id, resource_ids)?;
            validate_bind_group_matches_pipeline(cache_label, command_id, bind_group, pipeline)?;
            device.active_pass_mut(pass_label)?.bind_group_cache_label =
                Some(cache_label.to_string());
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::DrawIndexed {
            pass_label,
            command_id,
            first_index,
            index_count,
            first_vertex,
            vertex_count,
            physical_bounds,
            scissor,
        } => {
            let draw = device.prepare_draw_indexed(
                pass_label,
                command_id,
                *first_index,
                *index_count,
                *first_vertex,
                *vertex_count,
                *physical_bounds,
                *scissor,
            )?;
            device.active_pass_mut(pass_label)?.draws.push(draw);
            Ok(())
        }
        WgpuNativeRenderRuntimeOperation::SkipDraw { pass_label, .. } => {
            device.require_active_pass(pass_label)
        }
        WgpuNativeRenderRuntimeOperation::EndRenderPass { pass_label } => {
            device.end_pass(pass_label)
        }
        WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer { encoder_label, .. } => {
            device.submit_encoder(encoder_label)
        }
    }
}
