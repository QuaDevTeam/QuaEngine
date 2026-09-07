use super::super::resources::backdrop::capture_backdrop_view;
use super::super::texture::RealRuntimeDecodedTexture;
use crate::render_graph::{CompositeBlendMode, DrawCompositeGroup, LogicalRect};
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
    shadow_blur: super::shadow_blur::ShadowBlur,
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
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
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
            shadow_blur: super::shadow_blur::ShadowBlur::new(target),
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
                let frame_bytes = u64::from(extent.width) * u64::from(extent.height) * 4;
                let shadow_bytes = if group
                    .drop_shadow
                    .as_ref()
                    .is_some_and(|s| group.blur_radius.hypot(s.sigma) >= 0.001)
                {
                    2 * frame_bytes
                } else {
                    self.shadow_blur.byte_len() as u64
                };
                let required_bytes = (depth as u64 + 1) * frame_bytes
                    + shadow_bytes
                    + if group.blend_mode != CompositeBlendMode::Normal {
                        frame_bytes
                    } else {
                        0
                    };
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

    pub(in super::super) fn clear_shadow_blur(&mut self) {
        self.shadow_blur.clear();
    }

    pub(in super::super) fn texture_byte_len(&self) -> usize {
        self.targets
            .iter()
            .map(|t| t.extent().width as usize * t.extent().height as usize * 4)
            .sum::<usize>()
            + self.shadow_blur.byte_len()
    }

    fn composite(
        &mut self,
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
        let mask = group
            .mask_resource_id
            .as_ref()
            .and_then(|id| decoded_textures.get(id));
        // Like renderer-web's unresolved asset URL, an unavailable mask leaves
        // the source visible. Upload diagnostics retain the missing asset.
        let area = group.mask_bounds.unwrap_or(LogicalRect {
            x: 0.0,
            y: 0.0,
            width: target.extent().width as f64,
            height: target.extent().height as f64,
        });
        let intrinsic = mask.map_or([1.0; 2], |t| [t.width as f64, t.height as f64]);
        let tile = group.mask_layout.resolve(area, intrinsic, group.mask_scale);
        let rotation = group.mask_rotation.to_radians();
        let shadow = group.drop_shadow.as_ref();
        let shadow_view = shadow.map(|s| {
            self.shadow_blur.render(
                target,
                source.view(),
                encoder,
                group.blur_radius.hypot(s.sigma),
            )
        });

        let shadow_color = shadow
            .and_then(|s| crate::renderer::backend::wgpu::mesh::parse_color_literal(&s.color))
            .map_or([0.0; 4], |c| c.to_gpu_rgba());
        let inverse = inverse_transform(group.transform);
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
            mask.is_some() as u32 as f32,
            group.mask_mode as u32 as f32,
            area.x as f32,
            area.y as f32,
            area.width as f32,
            area.height as f32,
            tile.bounds.x as f32,
            tile.bounds.y as f32,
            tile.bounds.width as f32,
            tile.bounds.height as f32,
            tile.period[0] as f32,
            tile.period[1] as f32,
            tile.repeat[0] as u32 as f32,
            tile.repeat[1] as u32 as f32,
            rotation.cos() as f32,
            rotation.sin() as f32,
            shadow.is_some() as u32 as f32,
            shadow.map_or(0.0, |s| s.sigma) as f32,
            shadow.map_or(0.0, |s| s.offset[0]) as f32,
            shadow.map_or(0.0, |s| s.offset[1]) as f32,
            shadow_color[0],
            shadow_color[1],
            shadow_color[2],
            shadow_color[3],
            inverse[0],
            inverse[1],
            inverse[2],
            inverse[3],
            inverse[4],
            inverse[5],
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
                            mask.map_or_else(|| source.view(), |t| &t.view),
                        ),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: wgpu::BindingResource::TextureView(
                            shadow_view.as_ref().unwrap_or_else(|| source.view()),
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

fn inverse_transform([a, b, c, d, tx, ty]: [f64; 6]) -> [f32; 6] {
    let determinant = a * d - b * c;
    if determinant.abs() < 1e-12 {
        return [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
    }
    [
        d / determinant,
        -b / determinant,
        -c / determinant,
        a / determinant,
        (c * ty - d * tx) / determinant,
        (b * tx - a * ty) / determinant,
    ]
    .map(|v| v as f32)
}
