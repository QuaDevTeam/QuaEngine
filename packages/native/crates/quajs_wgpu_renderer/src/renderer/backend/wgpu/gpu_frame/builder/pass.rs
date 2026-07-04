use crate::render_graph::RenderPlane;

use super::super::super::buffer::WgpuNativeRenderBufferPass;
use super::super::super::physical::WgpuPhysicalRect;
use super::super::super::pipeline::{WgpuNativeRenderBufferRole, WgpuNativeRenderPipelinePass};
use super::super::{
    WgpuNativeRenderGpuBufferUpload, WgpuNativeRenderGpuDrawBatch, WgpuNativeRenderGpuSkippedDraw,
};
use super::draws::gpu_draw_batches_for_pass;
use super::uploads::{gpu_uploads_for_pass, upload_byte_len_for_role};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderGpuFramePass {
    pub pass_index: usize,
    pub plane: Option<RenderPlane>,
    pub viewport: WgpuPhysicalRect,
    pub upload_byte_len: usize,
    pub vertex_upload_byte_len: usize,
    pub index_upload_byte_len: usize,
    pub resource_bind_group_count: usize,
    pub draw_batch_count: usize,
    pub skipped_draw_count: usize,
    pub uploads: Vec<WgpuNativeRenderGpuBufferUpload>,
    pub draw_batches: Vec<WgpuNativeRenderGpuDrawBatch>,
    pub skipped_draws: Vec<WgpuNativeRenderGpuSkippedDraw>,
}

impl WgpuNativeRenderGpuFramePass {
    pub(super) fn from_passes(
        buffer_pass: Option<&WgpuNativeRenderBufferPass>,
        pipeline_pass: &WgpuNativeRenderPipelinePass,
        initial_staging_byte_offset: usize,
    ) -> Self {
        let uploads = gpu_uploads_for_pass(buffer_pass, pipeline_pass, initial_staging_byte_offset);
        let (draw_batches, skipped_draws) = gpu_draw_batches_for_pass(pipeline_pass);

        Self {
            pass_index: pipeline_pass.pass_index,
            plane: pipeline_pass.plane,
            viewport: pipeline_pass.viewport,
            upload_byte_len: uploads.iter().map(|upload| upload.byte_len).sum(),
            vertex_upload_byte_len: upload_byte_len_for_role(
                &uploads,
                WgpuNativeRenderBufferRole::Vertex,
            ),
            index_upload_byte_len: upload_byte_len_for_role(
                &uploads,
                WgpuNativeRenderBufferRole::Index,
            ),
            resource_bind_group_count: draw_batches
                .iter()
                .filter(|batch| batch.bind_group.is_some())
                .count(),
            draw_batch_count: draw_batches.len(),
            skipped_draw_count: skipped_draws.len(),
            uploads,
            draw_batches,
            skipped_draws,
        }
    }
}
