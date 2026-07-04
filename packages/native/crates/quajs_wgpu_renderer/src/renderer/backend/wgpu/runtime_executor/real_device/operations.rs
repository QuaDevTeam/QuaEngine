use super::bind_group::{
    pipeline_uses_texture_sampler_bind_group, validate_bind_group_matches_pipeline,
};
use super::pass::validate_pass_viewport;
use super::{invalid_order, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeError,
    WgpuNativeRenderRuntimeExecutionReport, WgpuNativeRenderRuntimeSnapshot,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferRole, WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan,
};

impl WgpuNativeRenderRuntimeDevice for RealWgpuNativeRenderRuntimeDevice {
    fn begin_runtime_plan(
        &mut self,
        plan: &WgpuNativeRenderRuntimePlan,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        if plan.render_pass_count > 0 {
            self.frame_target.begin_frame(&self.target);
        }
        Ok(())
    }

    fn apply_runtime_operation(
        &mut self,
        operation: &WgpuNativeRenderRuntimeOperation,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        match operation {
            WgpuNativeRenderRuntimeOperation::CreateBuffer {
                label,
                descriptor,
                byte_len,
            } => self.create_buffer(label, descriptor, *byte_len, report),
            WgpuNativeRenderRuntimeOperation::ReuseBuffer { label, byte_len } => {
                self.reuse_buffer(label, *byte_len, report)
            }
            WgpuNativeRenderRuntimeOperation::RecreateBuffer {
                label,
                descriptor,
                byte_len,
            } => self.recreate_buffer(label, descriptor, *byte_len, report),
            WgpuNativeRenderRuntimeOperation::ReleaseBuffer { label, .. } => {
                self.release_buffer(label, report)
            }
            WgpuNativeRenderRuntimeOperation::CreatePipeline {
                cache_label, key, ..
            } => self.create_pipeline(cache_label, key.clone(), report),
            WgpuNativeRenderRuntimeOperation::ReusePipeline { cache_label, key } => {
                self.reuse_pipeline(cache_label, key, report)
            }
            WgpuNativeRenderRuntimeOperation::RecreatePipeline {
                cache_label, key, ..
            } => self.recreate_pipeline(cache_label, key.clone(), report),
            WgpuNativeRenderRuntimeOperation::ReleasePipeline { cache_label } => {
                self.release_pipeline(cache_label, report)
            }
            WgpuNativeRenderRuntimeOperation::CreateBindGroup {
                cache_label,
                command_id,
                layout,
                resource_ids,
            } => self.create_bind_group(cache_label, command_id, *layout, resource_ids, report),
            WgpuNativeRenderRuntimeOperation::ReuseBindGroup { cache_label, .. } => {
                self.require_bind_group(cache_label)?;
                report.bind_group_reuse_count += 1;
                Ok(())
            }
            WgpuNativeRenderRuntimeOperation::RecreateBindGroup {
                cache_label,
                command_id,
                layout,
                resource_ids,
            } => self.recreate_bind_group(cache_label, command_id, *layout, resource_ids, report),
            WgpuNativeRenderRuntimeOperation::ReleaseBindGroup { cache_label } => {
                self.release_bind_group(cache_label, report)
            }
            WgpuNativeRenderRuntimeOperation::QueueWrite {
                target_label,
                buffer_byte_offset,
                byte_len,
                checksum,
                bytes,
                ..
            } => self.queue_write(
                target_label,
                *buffer_byte_offset,
                *byte_len,
                *checksum,
                bytes,
            ),
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder { label, .. } => {
                self.create_encoder(label)
            }
            WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label,
                pass_label,
                viewport,
                ..
            } => self.begin_pass(encoder_label, pass_label, *viewport),
            WgpuNativeRenderRuntimeOperation::SetViewport {
                pass_label,
                viewport,
            } => {
                validate_pass_viewport(pass_label, *viewport, self.target.extent())?;
                self.active_pass_mut(pass_label)?.viewport = *viewport;
                Ok(())
            }
            WgpuNativeRenderRuntimeOperation::SetVertexBuffer {
                pass_label,
                buffer_label,
                byte_len,
            } => {
                self.require_buffer_role_and_byte_len(
                    buffer_label,
                    WgpuNativeRenderBufferRole::Vertex,
                    *byte_len,
                )?;
                self.active_pass_mut(pass_label)?.vertex_buffer_label =
                    Some(buffer_label.to_string());
                Ok(())
            }
            WgpuNativeRenderRuntimeOperation::SetIndexBuffer {
                pass_label,
                buffer_label,
                byte_len,
            } => {
                self.require_buffer_role_and_byte_len(
                    buffer_label,
                    WgpuNativeRenderBufferRole::Index,
                    *byte_len,
                )?;
                self.active_pass_mut(pass_label)?.index_buffer_label =
                    Some(buffer_label.to_string());
                Ok(())
            }
            WgpuNativeRenderRuntimeOperation::SetPipeline {
                pass_label,
                cache_label,
                ..
            } => {
                let uses_texture_sampler =
                    pipeline_uses_texture_sampler_bind_group(self.require_pipeline(cache_label)?);
                let pass = self.active_pass_mut(pass_label)?;
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
                    self.require_active_texture_sampler_pipeline(pass_label, command_id)?;
                let bind_group =
                    self.require_matching_bind_group(cache_label, command_id, resource_ids)?;
                validate_bind_group_matches_pipeline(
                    cache_label,
                    command_id,
                    bind_group,
                    pipeline,
                )?;
                self.active_pass_mut(pass_label)?.bind_group_cache_label =
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
                let draw = self.prepare_draw_indexed(
                    pass_label,
                    command_id,
                    *first_index,
                    *index_count,
                    *first_vertex,
                    *vertex_count,
                    *physical_bounds,
                    *scissor,
                )?;
                self.active_pass_mut(pass_label)?.draws.push(draw);
                Ok(())
            }
            WgpuNativeRenderRuntimeOperation::SkipDraw { pass_label, .. } => {
                self.require_active_pass(pass_label)
            }
            WgpuNativeRenderRuntimeOperation::EndRenderPass { pass_label } => {
                self.end_pass(pass_label)
            }
            WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer { encoder_label, .. } => {
                self.submit_encoder(encoder_label)
            }
        }
    }

    fn finish_runtime_plan(&mut self) -> Result<(), WgpuNativeRenderRuntimeError> {
        if self
            .active_encoder
            .as_ref()
            .and_then(|encoder| encoder.active_pass.as_ref())
            .is_some()
        {
            return invalid_order("runtime plan finished with an open render pass");
        }
        if self.active_encoder.is_some() {
            return invalid_order("runtime plan finished with an open command encoder");
        }
        Ok(())
    }

    fn runtime_snapshot(&self) -> WgpuNativeRenderRuntimeSnapshot {
        self.snapshot()
    }

    fn device_attached(&self) -> bool {
        true
    }

    fn diagnostic_note(&self) -> &'static str {
        #[cfg(feature = "image-decode")]
        {
            "real-wgpu feature is enabled and applies runtime plans to an attached wgpu::Device/Queue for buffer creation, queue writes, retained offscreen frame-target render passes, no-bind-group color fallback indexed drawing, uploaded decoded RGBA texture sampling, optional host-provided PNG/JPEG image byte decoding into RGBA textures, deterministic placeholder fallback, built-in bitmap TextAtlas sampling for TextPlaceholder draws, and command submission; swapchain presentation, automatic QuaAssets texture lookup/sync, real font shaping/fallback/font asset rasterization, video decode, and audio playback remain future backend work."
        }
        #[cfg(not(feature = "image-decode"))]
        {
            "real-wgpu feature is enabled and applies runtime plans to an attached wgpu::Device/Queue for buffer creation, queue writes, retained offscreen frame-target render passes, no-bind-group color fallback indexed drawing, uploaded decoded RGBA texture sampling with deterministic placeholder fallback, built-in bitmap TextAtlas sampling for TextPlaceholder draws, and command submission; swapchain presentation, automatic QuaAssets texture lookup/sync, encoded image decoding, real font shaping/fallback/font asset rasterization, video decode, and audio playback remain future backend work."
        }
    }
}
