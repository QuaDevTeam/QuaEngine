use super::super::RealWgpuNativeRenderRuntimeTarget;

#[derive(Clone, Debug)]
pub(in super::super) struct SurfaceBlit {
    pipeline: wgpu::RenderPipeline,
    frame: wgpu::BindGroup,
}

impl SurfaceBlit {
    pub(super) fn new(
        target: &RealWgpuNativeRenderRuntimeTarget,
        frame: &wgpu::TextureView,
    ) -> Self {
        let device = target.device();
        let format = target.color_format();
        let hdr = format == wgpu::TextureFormat::Rgba16Float;
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("qua-native-surface-transfer"),
            source: wgpu::ShaderSource::Wgsl(include_str!("surface_blit.wgsl").into()),
        });
        let constants = [
            ("linear_output", f64::from(hdr || format.is_srgb())),
            ("hdr_output", f64::from(hdr)),
            (
                "straight_alpha",
                f64::from(target.alpha_mode == wgpu::CompositeAlphaMode::PostMultiplied),
            ),
            (
                "premultiplied_alpha",
                f64::from(target.alpha_mode == wgpu::CompositeAlphaMode::PreMultiplied),
            ),
            (
                "white_scale",
                if hdr {
                    f64::from(target.sdr_white_scale)
                } else {
                    1.0
                },
            ),
        ];
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("qua-native-surface-transfer"),
            layout: None,
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs"),
                compilation_options: wgpu::PipelineCompilationOptions {
                    constants: &constants,
                    ..Default::default()
                },
                targets: &[Some(format.into())],
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let frame = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("qua-native-surface-source"),
            layout: &pipeline.get_bind_group_layout(0),
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(frame),
            }],
        });
        Self { pipeline, frame }
    }

    pub(super) fn submit(
        &self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        destination: &wgpu::Texture,
    ) {
        let mut encoder = target.device().create_command_encoder(&Default::default());
        let view = destination.create_view(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("qua-native-surface-transfer"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                ..Default::default()
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.frame, &[]);
            pass.draw(0..3, 0..1);
        }
        target.queue().submit([encoder.finish()]);
    }
}
