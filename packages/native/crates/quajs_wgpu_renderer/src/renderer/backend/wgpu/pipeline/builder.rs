use crate::render_graph::DrawBatchPipeline;
use crate::resources::ResourceId;

use super::super::buffer::text_geometry::bitmap::glyphs::BUILTIN_TEXT_ATLAS_RESOURCE_ID;
use super::super::mesh::WgpuNativeRenderPaint;
use super::super::render_pass::WgpuNativeRenderPassOperation;
use super::{
    WgpuNativeRenderBindGroupLayout, WgpuNativeRenderBlendMode, WgpuNativeRenderBufferDescriptor,
    WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage, WgpuNativeRenderPipelineKey,
    WgpuNativeRenderPipelineOperation, WgpuNativeRenderResourceBindGroup, WgpuNativeRenderShader,
};

#[derive(Default)]
pub(super) struct PipelinePassBuilder {
    pub operations: Vec<WgpuNativeRenderPipelineOperation>,
    active_pipeline: Option<DrawBatchPipeline>,
    active_paint: Option<WgpuNativeRenderPaint>,
    active_resource_ids: Vec<ResourceId>,
}

impl PipelinePassBuilder {
    pub(super) fn push_operation(&mut self, operation: &WgpuNativeRenderPassOperation) {
        match operation {
            WgpuNativeRenderPassOperation::UploadVertexBuffer {
                byte_len,
                vertex_count,
            } => self
                .operations
                .push(WgpuNativeRenderPipelineOperation::UploadBuffer {
                    descriptor: WgpuNativeRenderBufferDescriptor {
                        label: "qua-native::frame-vertex-buffer".to_string(),
                        role: WgpuNativeRenderBufferRole::Vertex,
                        byte_len: *byte_len,
                        element_count: *vertex_count,
                        usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
                    },
                }),
            WgpuNativeRenderPassOperation::UploadIndexBuffer {
                byte_len,
                index_count,
            } => self
                .operations
                .push(WgpuNativeRenderPipelineOperation::UploadBuffer {
                    descriptor: WgpuNativeRenderBufferDescriptor {
                        label: "qua-native::frame-index-buffer".to_string(),
                        role: WgpuNativeRenderBufferRole::Index,
                        byte_len: *byte_len,
                        element_count: *index_count,
                        usage: WgpuNativeRenderBufferUsage::IndexCopyDst,
                    },
                }),
            WgpuNativeRenderPassOperation::BeginRenderPass {
                pass_index,
                plane,
                viewport,
            } => self
                .operations
                .push(WgpuNativeRenderPipelineOperation::BeginRenderPass {
                    pass_index: *pass_index,
                    plane: *plane,
                    viewport: *viewport,
                }),
            WgpuNativeRenderPassOperation::SetViewport { viewport } => {
                self.operations
                    .push(WgpuNativeRenderPipelineOperation::SetViewport {
                        viewport: *viewport,
                    });
            }
            WgpuNativeRenderPassOperation::SetPipeline { pipeline } => {
                self.active_pipeline = Some(*pipeline);
                self.active_paint = None;
                self.active_resource_ids.clear();
            }
            WgpuNativeRenderPassOperation::SetPaint { command_id, paint } => {
                self.active_paint = Some(paint.clone());
                let key = pipeline_key(
                    self.active_pipeline.unwrap_or(DrawBatchPipeline::Custom),
                    paint,
                );
                self.operations
                    .push(WgpuNativeRenderPipelineOperation::SetRenderPipeline {
                        command_id: command_id.clone(),
                        key,
                    });
            }
            WgpuNativeRenderPassOperation::BindResources {
                command_id,
                resource_ids,
            } => {
                let key = pipeline_key(
                    self.active_pipeline.unwrap_or(DrawBatchPipeline::Custom),
                    self.active_paint
                        .as_ref()
                        .unwrap_or(&WgpuNativeRenderPaint::None),
                );
                self.active_resource_ids =
                    resource_ids_for_bind_group(key.bind_group_layout, resource_ids);
                if requires_resource_bind_group(key.bind_group_layout) {
                    self.operations
                        .push(WgpuNativeRenderPipelineOperation::BindResourceGroup {
                            group: WgpuNativeRenderResourceBindGroup {
                                command_id: command_id.clone(),
                                layout: key.bind_group_layout,
                                resource_ids: self.active_resource_ids.clone(),
                            },
                        });
                }
            }
            WgpuNativeRenderPassOperation::DrawIndexed {
                command_id,
                first_index,
                index_count,
                first_vertex,
                vertex_count,
                physical_bounds,
                scissor,
            } => {
                let key = pipeline_key(
                    self.active_pipeline.unwrap_or(DrawBatchPipeline::Custom),
                    self.active_paint
                        .as_ref()
                        .unwrap_or(&WgpuNativeRenderPaint::None),
                );
                if !self.active_resource_ids.is_empty()
                    && requires_resource_bind_group(key.bind_group_layout)
                    && !self.operations.iter().rev().any(|operation| {
                        matches!(
                            operation,
                            WgpuNativeRenderPipelineOperation::BindResourceGroup { group }
                                if group.command_id == *command_id
                        )
                    })
                {
                    self.operations
                        .push(WgpuNativeRenderPipelineOperation::BindResourceGroup {
                            group: WgpuNativeRenderResourceBindGroup {
                                command_id: command_id.clone(),
                                layout: key.bind_group_layout,
                                resource_ids: self.active_resource_ids.clone(),
                            },
                        });
                }
                self.operations
                    .push(WgpuNativeRenderPipelineOperation::DrawIndexed {
                        command_id: command_id.clone(),
                        key,
                        first_index: *first_index,
                        index_count: *index_count,
                        first_vertex: *first_vertex,
                        vertex_count: *vertex_count,
                        physical_bounds: *physical_bounds,
                        scissor: *scissor,
                    });
            }
            WgpuNativeRenderPassOperation::SkipDraw {
                command_id,
                reason,
                resource_ids,
                owner_package_id,
                required_package_ids,
            } => {
                self.operations
                    .push(WgpuNativeRenderPipelineOperation::SkipDraw {
                        command_id: command_id.clone(),
                        reason: reason.clone(),
                        resource_ids: resource_ids.clone(),
                        owner_package_id: owner_package_id.clone(),
                        required_package_ids: required_package_ids.clone(),
                    });
            }
            WgpuNativeRenderPassOperation::EndRenderPass { pass_index } => {
                self.operations
                    .push(WgpuNativeRenderPipelineOperation::EndRenderPass {
                        pass_index: *pass_index,
                    });
            }
        }
    }
}

fn requires_resource_bind_group(layout: WgpuNativeRenderBindGroupLayout) -> bool {
    matches!(
        layout,
        WgpuNativeRenderBindGroupLayout::TextureSampler
            | WgpuNativeRenderBindGroupLayout::TextAtlas
    )
}

fn resource_ids_for_bind_group(
    layout: WgpuNativeRenderBindGroupLayout,
    resource_ids: &[ResourceId],
) -> Vec<ResourceId> {
    if !resource_ids.is_empty() {
        return resource_ids.to_vec();
    }
    match layout {
        WgpuNativeRenderBindGroupLayout::TextAtlas => {
            vec![ResourceId::from(BUILTIN_TEXT_ATLAS_RESOURCE_ID)]
        }
        WgpuNativeRenderBindGroupLayout::None | WgpuNativeRenderBindGroupLayout::TextureSampler => {
            Vec::new()
        }
    }
}

fn pipeline_key(
    pipeline: DrawBatchPipeline,
    paint: &WgpuNativeRenderPaint,
) -> WgpuNativeRenderPipelineKey {
    let shader = shader_for_pipeline_and_paint(pipeline, paint);
    WgpuNativeRenderPipelineKey {
        pipeline,
        shader,
        bind_group_layout: bind_group_layout_for_shader(shader),
        blend: blend_for_pipeline(pipeline),
    }
}

fn shader_for_pipeline_and_paint(
    pipeline: DrawBatchPipeline,
    paint: &WgpuNativeRenderPaint,
) -> WgpuNativeRenderShader {
    match paint {
        WgpuNativeRenderPaint::Solid { .. } => WgpuNativeRenderShader::SolidColor,
        WgpuNativeRenderPaint::Texture { .. } => WgpuNativeRenderShader::TexturedQuad,
        WgpuNativeRenderPaint::TextPlaceholder { .. } => WgpuNativeRenderShader::TextPlaceholder,
        WgpuNativeRenderPaint::Skipped { .. }
        | WgpuNativeRenderPaint::InvalidColor { .. }
        | WgpuNativeRenderPaint::None => match pipeline {
            DrawBatchPipeline::Clear => WgpuNativeRenderShader::Clear,
            DrawBatchPipeline::Image | DrawBatchPipeline::Character | DrawBatchPipeline::Video => {
                WgpuNativeRenderShader::TexturedQuad
            }
            DrawBatchPipeline::Text => WgpuNativeRenderShader::TextPlaceholder,
            DrawBatchPipeline::Shape | DrawBatchPipeline::Ui => WgpuNativeRenderShader::SolidColor,
            DrawBatchPipeline::Clip => WgpuNativeRenderShader::ClipMask,
            DrawBatchPipeline::Custom => WgpuNativeRenderShader::CustomFallback,
        },
    }
}

fn bind_group_layout_for_shader(shader: WgpuNativeRenderShader) -> WgpuNativeRenderBindGroupLayout {
    match shader {
        WgpuNativeRenderShader::TexturedQuad => WgpuNativeRenderBindGroupLayout::TextureSampler,
        WgpuNativeRenderShader::TextPlaceholder => WgpuNativeRenderBindGroupLayout::TextAtlas,
        WgpuNativeRenderShader::Clear
        | WgpuNativeRenderShader::SolidColor
        | WgpuNativeRenderShader::ClipMask
        | WgpuNativeRenderShader::CustomFallback => WgpuNativeRenderBindGroupLayout::None,
    }
}

fn blend_for_pipeline(pipeline: DrawBatchPipeline) -> WgpuNativeRenderBlendMode {
    match pipeline {
        DrawBatchPipeline::Clear => WgpuNativeRenderBlendMode::Replace,
        DrawBatchPipeline::Image
        | DrawBatchPipeline::Character
        | DrawBatchPipeline::Video
        | DrawBatchPipeline::Text
        | DrawBatchPipeline::Shape
        | DrawBatchPipeline::Ui
        | DrawBatchPipeline::Clip
        | DrawBatchPipeline::Custom => WgpuNativeRenderBlendMode::Alpha,
    }
}
