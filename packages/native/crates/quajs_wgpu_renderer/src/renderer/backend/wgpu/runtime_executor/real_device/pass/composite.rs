use super::super::resources::backdrop::capture_backdrop_view;
use super::super::texture::RealRuntimeDecodedTexture;
use crate::render_graph::{CompositeBlendMode, DrawCompositeGroup};
use std::collections::BTreeMap;
use wgpu::util::DeviceExt;

use super::super::bind_group::RealRuntimeBindGroup;
use super::super::frame_target::RealRuntimeFrameTarget;
use super::super::pipeline::RealRuntimePipeline;
use super::super::uniforms::RealRuntimeFrameUniforms;
use super::super::{RealRuntimeBuffer, RealWgpuNativeRenderRuntimeTarget};
use super::{materialize_pass, RealRuntimePass};
use crate::renderer::backend::wgpu::runtime_executor::WgpuNativeRenderRuntimeError;

/// One pipeline and at most one reusable target per nested stacking context.
/// Sibling groups reuse the same target after their composite draw is encoded.
#[derive(Clone, Debug)]
pub(in super::super) struct Compositor {
    layout: wgpu::BindGroupLayout,
    pipeline: wgpu::RenderPipeline,
    targets: Vec<RealRuntimeFrameTarget>,
}

impl Compositor {
    pub(in super::super) fn new(target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
        let device = target.device();
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("qua-native::composite-layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
            ],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("qua-native::composite-shader"),
            source: wgpu::ShaderSource::Wgsl(SHADER.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("qua-native::composite-pipeline-layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("qua-native::composite-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target.frame_color_format(),
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        Self {
            layout,
            pipeline,
            targets: Vec::new(),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn materialize(
        &mut self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        destination: &mut RealRuntimeFrameTarget,
        uniforms: &RealRuntimeFrameUniforms,
        buffers: &BTreeMap<String, RealRuntimeBuffer>,
        pipelines: &BTreeMap<String, RealRuntimePipeline>,
        bind_groups: &BTreeMap<String, RealRuntimeBindGroup>,
        decoded_textures: &BTreeMap<String, RealRuntimeDecodedTexture>,
        encoder: &mut wgpu::CommandEncoder,
        mut pass: RealRuntimePass,
        depth: usize,
        backdrop: &mut Option<wgpu::Texture>,
        backdrop_root: Option<(&str, &RealRuntimeFrameTarget)>,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let draws = std::mem::take(&mut pass.draws);
        let mut start = 0;
        while start < draws.len() {
            let group = draws[start].composite_groups.get(depth);
            let mut end = start + 1;
            while end < draws.len()
                && draws[end].composite_groups.get(depth).map(|g| &g.id) == group.map(|g| &g.id)
            {
                end += 1;
            }
            let mut part = pass.clone();
            part.draws = draws[start..end].to_vec();
            if let Some(group) = group {
                let extent = target.extent();
                let required_bytes =
                    (depth as u64 + 1) * u64::from(extent.width) * u64::from(extent.height) * 4;
                if depth >= 16 || required_bytes > 256 * 1024 * 1024 {
                    return super::super::invalid_order("native subtree compositing exceeds its 16-level / 256 MiB transient target budget");
                }
                if destination.completed_pass_count() == 0 {
                    let mut clear = pass.clone();
                    clear.draws.clear();
                    materialize_pass(
                        target,
                        destination,
                        uniforms,
                        buffers,
                        pipelines,
                        bind_groups,
                        decoded_textures,
                        encoder,
                        clear,
                        None,
                        backdrop,
                        None,
                    )?;
                }
                let mut intermediate = self
                    .targets
                    .pop()
                    .unwrap_or_else(|| RealRuntimeFrameTarget::new(target));
                intermediate.begin_frame(target);
                self.materialize(
                    target,
                    &mut intermediate,
                    uniforms,
                    buffers,
                    pipelines,
                    bind_groups,
                    decoded_textures,
                    encoder,
                    part,
                    depth + 1,
                    backdrop,
                    Some((&group.id, destination)),
                )?;
                self.composite(
                    target,
                    destination,
                    &intermediate,
                    encoder,
                    group,
                    backdrop,
                    decoded_textures,
                );
                self.targets.push(intermediate);
            } else {
                materialize_pass(
                    target,
                    destination,
                    uniforms,
                    buffers,
                    pipelines,
                    bind_groups,
                    decoded_textures,
                    encoder,
                    part,
                    None,
                    backdrop,
                    backdrop_root,
                )?;
            }
            start = end;
        }
        Ok(())
    }

    pub(in super::super) fn texture_byte_len(&self) -> usize {
        self.targets
            .iter()
            .map(|t| t.extent().width as usize * t.extent().height as usize * 4)
            .sum()
    }

    fn composite(
        &self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        destination: &mut RealRuntimeFrameTarget,
        source: &RealRuntimeFrameTarget,
        encoder: &mut wgpu::CommandEncoder,
        group: &DrawCompositeGroup,
        scratch: &mut Option<wgpu::Texture>,
        decoded_textures: &BTreeMap<String, RealRuntimeDecodedTexture>,
    ) {
        let captured;
        let backdrop_view = if group.blend_mode != CompositeBlendMode::Normal {
            captured = capture_backdrop_view(target, destination, scratch, encoder);
            &captured
        } else {
            // The binding is unused for normal source-over; never sample the
            // active destination attachment, even in an untaken shader branch.
            source.view()
        };
        let f = &group.color_filter;
        let mask_view = group
            .mask_resource_id
            .as_ref()
            .and_then(|id| decoded_textures.get(id))
            .map(|texture| &texture.view);
        let mask_enabled = mask_view.is_some() as u32 as f32;
        let values = [
            group.opacity,
            group.blur_radius as f32,
            group.blend_mode as u32 as f32,
            f.brightness,
            f.contrast,
            f.saturation,
            f.hue_rotate_radians,
            f.grayscale,
            f.sepia,
            f.invert,
            mask_enabled,
            group.mask_mode as u32 as f32,
        ];
        let bytes: Vec<u8> = values.into_iter().flat_map(f32::to_le_bytes).collect();
        let uniform = target
            .device()
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("qua-native::composite-opacity"),
                contents: &bytes,
                usage: wgpu::BufferUsages::UNIFORM,
            });
        let bind_group = target
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("qua-native::composite-source"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(backdrop_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(source.view()),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: uniform.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::TextureView(
                            mask_view.unwrap_or_else(|| source.view()),
                        ),
                    },
                ],
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("qua-native::composite-subtree"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: destination.view(),
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: destination.load_op(),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
        destination.finish_pass();
    }
}

const SHADER: &str = include_str!("composite.wgsl");
