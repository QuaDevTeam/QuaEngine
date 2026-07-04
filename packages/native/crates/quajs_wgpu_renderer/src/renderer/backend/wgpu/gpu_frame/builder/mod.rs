mod draws;
mod pass;
mod uploads;

use super::super::buffer::WgpuNativeRenderBufferPlan;
use super::super::pipeline::WgpuNativeRenderPipelinePlan;
use super::WgpuNativeRenderGpuFramePlan;

pub use pass::WgpuNativeRenderGpuFramePass;

impl WgpuNativeRenderGpuFramePlan {
    pub fn from_buffer_and_pipeline_plans(
        buffer_plan: &WgpuNativeRenderBufferPlan,
        pipeline_plan: &WgpuNativeRenderPipelinePlan,
    ) -> Self {
        let mut staging_byte_offset = 0;
        let mut passes = Vec::new();
        for pipeline_pass in &pipeline_plan.passes {
            let buffer_pass = buffer_plan
                .passes
                .iter()
                .find(|pass| pass.pass_index == pipeline_pass.pass_index);
            let pass = WgpuNativeRenderGpuFramePass::from_passes(
                buffer_pass,
                pipeline_pass,
                staging_byte_offset,
            );
            staging_byte_offset = staging_byte_offset.saturating_add(pass.upload_byte_len);
            passes.push(pass);
        }

        Self {
            revision: pipeline_plan.revision,
            pass_count: pipeline_plan.pass_count,
            upload_count: passes.iter().map(|pass| pass.uploads.len()).sum(),
            upload_byte_len: passes.iter().map(|pass| pass.upload_byte_len).sum(),
            vertex_upload_byte_len: passes.iter().map(|pass| pass.vertex_upload_byte_len).sum(),
            index_upload_byte_len: passes.iter().map(|pass| pass.index_upload_byte_len).sum(),
            pipeline_descriptor_count: pipeline_plan.pipeline_descriptor_count,
            resource_bind_group_count: passes
                .iter()
                .map(|pass| pass.resource_bind_group_count)
                .sum(),
            draw_batch_count: passes.iter().map(|pass| pass.draw_batches.len()).sum(),
            skipped_draw_count: passes.iter().map(|pass| pass.skipped_draws.len()).sum(),
            pipeline_descriptors: pipeline_plan.pipeline_descriptors.clone(),
            passes,
        }
    }
}
