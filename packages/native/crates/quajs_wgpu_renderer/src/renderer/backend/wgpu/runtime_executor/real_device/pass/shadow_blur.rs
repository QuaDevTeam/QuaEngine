use super::super::RealWgpuNativeRenderRuntimeTarget;
use wgpu::util::DeviceExt;

#[derive(Clone, Debug)]
struct AlphaTarget {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    size: [u32; 2],
}

/// Reusable renderer-only scratch. Large sigmas are downsampled first so both
/// Gaussian passes have at most 97 adjacent taps, without sparse-grid bands.
#[derive(Clone, Debug)]
pub(super) struct ShadowBlur {
    layout: wgpu::BindGroupLayout,
    pipeline: wgpu::RenderPipeline,
    sampler: wgpu::Sampler,
    targets: Vec<AlphaTarget>,
}

impl ShadowBlur {
    pub(super) fn new(target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
        let device = target.device();
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("qua-native::shadow-blur-layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("qua-native::shadow-blur"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shadow_blur.wgsl").into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("qua-native::shadow-blur"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("qua-native::shadow-alpha-linear"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        Self {
            layout,
            pipeline,
            sampler,
            targets: Vec::new(),
        }
    }

    pub(super) fn clear(&mut self) {
        self.targets.clear();
    }
    pub(super) fn byte_len(&self) -> usize {
        self.targets
            .iter()
            .map(|t| t.texture.size().width as usize * t.texture.size().height as usize * 4)
            .sum()
    }

    pub(super) fn render(
        &mut self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        source: &wgpu::TextureView,
        encoder: &mut wgpu::CommandEncoder,
        sigma: f64,
    ) -> wgpu::TextureView {
        if sigma < 0.001 {
            return source.clone();
        }
        let full = [target.extent().width, target.extent().height];
        let mut size = full;
        let mut input = source.clone();
        let mut index = 0;
        while sigma * (size[0] as f64 / full[0] as f64).max(size[1] as f64 / full[1] as f64) > 16.0
            && size != [1, 1]
        {
            size = size.map(|n| n.div_ceil(2));
            self.ensure_target(target, index, size);
            self.pass(target, encoder, &input, index, [0.0; 2], 0.0);
            input = self.targets[index].view.clone();
            index += 1;
        }
        for axis in 0..2 {
            self.ensure_target(target, index, size);
            let mut direction = [0.0; 2];
            direction[axis] = 1.0;
            self.pass(
                target,
                encoder,
                &input,
                index,
                direction,
                (sigma * size[axis] as f64 / full[axis] as f64).min(16.0) as f32,
            );
            input = self.targets[index].view.clone();
            index += 1;
        }
        self.targets.truncate(index);
        input
    }

    fn ensure_target(
        &mut self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        index: usize,
        size: [u32; 2],
    ) {
        if self.targets.get(index).is_some_and(|t| t.size == size) {
            return;
        }
        // Drop a stale pyramid before allocating a replacement at a larger
        // size. Matching targets retain their handles across stable frames.
        self.targets.truncate(index);
        let texture = target.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("qua-native::shadow-alpha-scratch"),
            size: wgpu::Extent3d {
                width: size[0],
                height: size[1],
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let view = texture.create_view(&Default::default());
        let entry = AlphaTarget {
            texture,
            view,
            size,
        };
        self.targets.push(entry);
    }

    fn pass(
        &self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        encoder: &mut wgpu::CommandEncoder,
        input: &wgpu::TextureView,
        index: usize,
        direction: [f32; 2],
        sigma: f32,
    ) {
        let output = &self.targets[index];
        let values = [
            output.size[0] as f32,
            output.size[1] as f32,
            direction[0],
            direction[1],
            sigma,
            0.0,
            0.0,
            0.0,
        ];
        let bytes: Vec<u8> = values.into_iter().flat_map(f32::to_le_bytes).collect();
        let uniform = target
            .device()
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("qua-native::shadow-blur-uniform"),
                contents: &bytes,
                usage: wgpu::BufferUsages::UNIFORM,
            });
        let binding = target
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("qua-native::shadow-blur-source"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(input),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: uniform.as_entire_binding(),
                    },
                ],
            });
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("qua-native::shadow-blur"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &output.view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &binding, &[]);
        pass.draw(0..3, 0..1);
    }
}
