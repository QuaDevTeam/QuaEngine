use std::collections::BTreeMap;

use super::lookup::{
    index_buffer_for_draw, pipeline_for_draw, required_bind_group_for_draw, vertex_buffer_for_draw,
};
use super::{validate_draw, validate_pass_viewport, RealRuntimeDrawIndexed, RealRuntimePass};
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

use super::super::bind_group::RealRuntimeBindGroup;
use super::super::frame_target::RealRuntimeFrameTarget;
use super::super::pipeline::RealRuntimePipeline;
use super::super::texture::RealRuntimeDecodedTexture;
use super::super::uniforms::RealRuntimeFrameUniforms;
use super::super::{RealRuntimeBuffer, RealWgpuNativeRenderRuntimeTarget};

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn materialize_pass(
    target: &RealWgpuNativeRenderRuntimeTarget,
    frame_target: &mut RealRuntimeFrameTarget,
    uniforms: &RealRuntimeFrameUniforms,
    buffers: &BTreeMap<String, RealRuntimeBuffer>,
    pipelines: &BTreeMap<String, RealRuntimePipeline>,
    bind_groups: &BTreeMap<String, RealRuntimeBindGroup>,
    decoded_textures: &BTreeMap<String, RealRuntimeDecodedTexture>,
    encoder: &mut wgpu::CommandEncoder,
    pass: RealRuntimePass,
    compositor: Option<&mut super::composite::Compositor>,
    backdrop: &mut Option<wgpu::Texture>,
    backdrop_root: Option<(&str, &RealRuntimeFrameTarget)>,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if let Some(compositor) =
        compositor.filter(|_| pass.draws.iter().any(|d| !d.composite_groups.is_empty()))
    {
        validate_materializable_pass(target, buffers, pipelines, bind_groups, &pass)?;
        return compositor.materialize(
            target,
            frame_target,
            uniforms,
            buffers,
            pipelines,
            bind_groups,
            decoded_textures,
            encoder,
            pass,
            0,
            backdrop,
            None,
        );
    }
    if pass.draws.is_empty() {
        return materialize_empty_pass(target, frame_target, encoder, pass);
    }

    validate_materializable_pass(target, buffers, pipelines, bind_groups, &pass)?;

    let mut remaining = pass.draws.as_slice();
    while !remaining.is_empty() {
        let is_backdrop = |draw: &RealRuntimeDrawIndexed| {
            pipelines[&draw.pipeline_cache_label].key.shader
                == crate::renderer::backend::wgpu::WgpuNativeRenderShader::BackdropBlur
        };
        let mut override_binding = None;
        let count = if is_backdrop(&remaining[0]) {
            if frame_target.completed_pass_count() == 0 {
                let mut clear = pass.clone();
                clear.draws.clear();
                materialize_empty_pass(target, frame_target, encoder, clear)?;
            }
            let source = backdrop_root
                .filter(|(id, _)| remaining[0].command_id == format!("{id}:backdrop-blur"))
                .map_or(&*frame_target, |(_, source)| source);
            let pipeline = &pipelines[&remaining[0].pipeline_cache_label].pipeline;
            override_binding = Some(super::super::resources::backdrop::capture_backdrop(
                target,
                source,
                backdrop,
                encoder,
                &pipeline.get_bind_group_layout(1),
            ));
            1
        } else {
            remaining
                .iter()
                .position(is_backdrop)
                .unwrap_or(remaining.len())
        };
        {
            let color_attachments = frame_color_attachments(frame_target);
            let mut render_pass = begin_real_render_pass(encoder, &pass.label, &color_attachments);
            set_viewport(&mut render_pass, pass.viewport);
            render_pass.set_bind_group(0, &uniforms.bind_group, &[]);
            for draw in remaining[..count].iter().cloned() {
                materialize_draw(
                    target,
                    &pass.label,
                    buffers,
                    pipelines,
                    bind_groups,
                    &mut render_pass,
                    draw,
                    override_binding.as_ref(),
                )?;
            }
        }
        frame_target.finish_pass();
        remaining = &remaining[count..];
    }

    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn validate_materializable_pass(
    target: &RealWgpuNativeRenderRuntimeTarget,
    buffers: &BTreeMap<String, RealRuntimeBuffer>,
    pipelines: &BTreeMap<String, RealRuntimePipeline>,
    bind_groups: &BTreeMap<String, RealRuntimeBindGroup>,
    pass: &RealRuntimePass,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    validate_pass_viewport(&pass.label, pass.viewport, target.extent())?;
    if pass.draws.is_empty() {
        return Ok(());
    }

    for draw in &pass.draws {
        validate_pass_viewport(&pass.label, draw.viewport, target.extent())?;
        let vertex_buffer = vertex_buffer_for_draw(&pass.label, draw, buffers)?;
        let index_buffer = index_buffer_for_draw(&pass.label, draw, buffers)?;
        let pipeline = pipeline_for_draw(&pass.label, draw, pipelines)?;
        required_bind_group_for_draw(&pass.label, draw, pipeline, bind_groups)?;
        validate_draw(
            &pass.label,
            draw,
            vertex_buffer,
            index_buffer,
            target.extent(),
        )?;
    }

    Ok(())
}

fn materialize_draw(
    target: &RealWgpuNativeRenderRuntimeTarget,
    pass_label: &str,
    buffers: &BTreeMap<String, RealRuntimeBuffer>,
    pipelines: &BTreeMap<String, RealRuntimePipeline>,
    bind_groups: &BTreeMap<String, RealRuntimeBindGroup>,
    render_pass: &mut wgpu::RenderPass<'_>,
    draw: RealRuntimeDrawIndexed,
    override_binding: Option<&wgpu::BindGroup>,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    let vertex_buffer = vertex_buffer_for_draw(pass_label, &draw, buffers)?;
    let index_buffer = index_buffer_for_draw(pass_label, &draw, buffers)?;
    let pipeline = pipeline_for_draw(pass_label, &draw, pipelines)?;
    let bind_group = required_bind_group_for_draw(pass_label, &draw, pipeline, bind_groups)?;
    set_viewport(render_pass, draw.viewport);
    render_pass.set_vertex_buffer(0, vertex_buffer.buffer.slice(..));
    render_pass.set_index_buffer(index_buffer.buffer.slice(..), wgpu::IndexFormat::Uint32);
    render_pass.set_pipeline(&pipeline.pipeline);
    if let Some(binding) = override_binding {
        render_pass.set_bind_group(1, binding, &[]);
    } else if let Some(bind_group) = bind_group {
        render_pass.set_bind_group(1, &bind_group.bind_group, &[]);
    }
    validate_draw(
        pass_label,
        &draw,
        vertex_buffer,
        index_buffer,
        target.extent(),
    )?;
    set_scissor(render_pass, draw.scissor.unwrap_or(draw.viewport));
    render_pass.draw_indexed(
        draw.first_index..draw.first_index + draw.index_count,
        draw.first_vertex as i32,
        0..1,
    );
    Ok(())
}

fn materialize_empty_pass(
    target: &RealWgpuNativeRenderRuntimeTarget,
    frame_target: &mut RealRuntimeFrameTarget,
    encoder: &mut wgpu::CommandEncoder,
    pass: RealRuntimePass,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    validate_pass_viewport(&pass.label, pass.viewport, target.extent())?;
    {
        let color_attachments = frame_color_attachments(frame_target);
        let mut render_pass = begin_real_render_pass(encoder, &pass.label, &color_attachments);
        set_viewport(&mut render_pass, pass.viewport);
    }
    frame_target.finish_pass();
    Ok(())
}

fn frame_color_attachments(
    frame_target: &RealRuntimeFrameTarget,
) -> [Option<wgpu::RenderPassColorAttachment<'_>>; 1] {
    [Some(wgpu::RenderPassColorAttachment {
        view: frame_target.view(),
        depth_slice: None,
        resolve_target: None,
        ops: wgpu::Operations {
            load: frame_target.load_op(),
            store: wgpu::StoreOp::Store,
        },
    })]
}

fn begin_real_render_pass<'encoder, 'attachments>(
    encoder: &'encoder mut wgpu::CommandEncoder,
    label: &str,
    color_attachments: &'attachments [Option<wgpu::RenderPassColorAttachment<'attachments>>],
) -> wgpu::RenderPass<'encoder>
where
    'attachments: 'encoder,
{
    encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments,
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    })
}

fn set_viewport(render_pass: &mut wgpu::RenderPass<'_>, viewport: WgpuPhysicalRect) {
    render_pass.set_viewport(
        viewport.x as f32,
        viewport.y as f32,
        viewport.width.max(1) as f32,
        viewport.height.max(1) as f32,
        0.0,
        1.0,
    );
}

fn set_scissor(render_pass: &mut wgpu::RenderPass<'_>, rect: WgpuPhysicalRect) {
    render_pass.set_scissor_rect(rect.x, rect.y, rect.width.max(1), rect.height.max(1));
}
