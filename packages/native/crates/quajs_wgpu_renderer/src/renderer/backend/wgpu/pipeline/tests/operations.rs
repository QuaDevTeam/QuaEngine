use super::*;

#[test]
fn derives_upload_pipeline_resource_and_draw_operations() {
    let plan = WgpuNativeRenderPipelinePlan::from_render_pass_plan(&render_pass_plan(vec![
        WgpuNativeRenderPassOperation::UploadVertexBuffer {
            byte_len: 64,
            vertex_count: 4,
        },
        WgpuNativeRenderPassOperation::UploadIndexBuffer {
            byte_len: 24,
            index_count: 6,
        },
        WgpuNativeRenderPassOperation::BeginRenderPass {
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 1280, 720),
        },
        WgpuNativeRenderPassOperation::SetViewport {
            viewport: rect(0, 0, 1280, 720),
        },
        WgpuNativeRenderPassOperation::SetPipeline {
            pipeline: DrawBatchPipeline::Ui,
        },
        WgpuNativeRenderPassOperation::SetPaint {
            command_id: "ui:panel".to_string(),
            paint: solid("#336699"),
        },
        WgpuNativeRenderPassOperation::DrawIndexed {
            command_id: "ui:panel".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: rect(10, 20, 120, 40),
            scissor: None,
        },
        WgpuNativeRenderPassOperation::SetPipeline {
            pipeline: DrawBatchPipeline::Image,
        },
        WgpuNativeRenderPassOperation::SetPaint {
            command_id: "background:main".to_string(),
            paint: texture("images:bg/school.png"),
        },
        WgpuNativeRenderPassOperation::BindResources {
            command_id: "background:main".to_string(),
            resource_ids: vec![ResourceId::from("images:bg/school.png")],
        },
        WgpuNativeRenderPassOperation::DrawIndexed {
            command_id: "background:main".to_string(),
            first_index: 6,
            index_count: 6,
            first_vertex: 4,
            vertex_count: 4,
            physical_bounds: rect(0, 0, 1280, 720),
            scissor: None,
        },
        WgpuNativeRenderPassOperation::EndRenderPass { pass_index: 0 },
    ]));

    assert_eq!(plan.revision, 7);
    assert_eq!(plan.pass_count, 1);
    assert_eq!(plan.buffer_upload_count, 2);
    assert_eq!(plan.pipeline_descriptor_count, 2);
    assert_eq!(plan.pipeline_bind_count, 2);
    assert_eq!(plan.resource_bind_group_count, 1);
    assert_eq!(plan.draw_indexed_count, 2);

    let ui_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Ui,
        shader: WgpuNativeRenderShader::SolidColor,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::None,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    let image_key = WgpuNativeRenderPipelineKey {
        pipeline: DrawBatchPipeline::Image,
        shader: WgpuNativeRenderShader::TexturedQuad,
        bind_group_layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
        blend: WgpuNativeRenderBlendMode::Alpha,
    };
    assert!(plan
        .pipeline_descriptors
        .iter()
        .any(|descriptor| descriptor.key == ui_key));
    let image_descriptor = plan
        .pipeline_descriptors
        .iter()
        .find(|descriptor| descriptor.key == image_key)
        .expect("expected image pipeline descriptor");
    assert_eq!(
        image_descriptor.vertex_layout.array_stride,
        std::mem::size_of::<WgpuNativeRenderBufferVertex>()
    );
    assert_eq!(
        image_descriptor.index_format,
        WgpuNativeRenderIndexFormat::Uint32
    );
    assert_eq!(
        image_descriptor.primitive_topology,
        WgpuNativeRenderPrimitiveTopology::TriangleList
    );

    let pass = &plan.passes[0];
    assert_eq!(
        pass.operations[0],
        WgpuNativeRenderPipelineOperation::UploadBuffer {
            descriptor: WgpuNativeRenderBufferDescriptor {
                label: "qua-native::frame-vertex-buffer".to_string(),
                role: WgpuNativeRenderBufferRole::Vertex,
                byte_len: 64,
                element_count: 4,
                usage: WgpuNativeRenderBufferUsage::VertexCopyDst,
            },
        }
    );
    assert_eq!(
        pass.operations[4],
        WgpuNativeRenderPipelineOperation::SetRenderPipeline {
            command_id: "ui:panel".to_string(),
            key: ui_key.clone(),
        }
    );
    assert_eq!(
        pass.operations[7],
        WgpuNativeRenderPipelineOperation::BindResourceGroup {
            group: WgpuNativeRenderResourceBindGroup {
                command_id: "background:main".to_string(),
                layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
                resource_ids: vec![ResourceId::from("images:bg/school.png")],
            },
        }
    );
    assert_eq!(
        pass.operations[8],
        WgpuNativeRenderPipelineOperation::DrawIndexed {
            command_id: "background:main".to_string(),
            key: image_key,
            first_index: 6,
            index_count: 6,
            first_vertex: 4,
            vertex_count: 4,
            physical_bounds: rect(0, 0, 1280, 720),
            scissor: None,
        }
    );
}
