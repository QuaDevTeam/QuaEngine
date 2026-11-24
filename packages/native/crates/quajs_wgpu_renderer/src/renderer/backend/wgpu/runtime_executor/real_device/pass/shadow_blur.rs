use super::super::RealWgpuNativeRenderRuntimeTarget;
use crate::renderer::backend::wgpu::WgpuPhysicalRect;
use wgpu::util::DeviceExt;

#[derive(Clone, Debug)]
struct AlphaTarget {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    size: [u32; 2],
    last_used: u64,
}

/// Scratch targets unused for this many blur renders are released. Frames
/// commonly run several blurs with different sigmas (dialogue backdrop, panel
/// backdrop, drop shadows) through one instance; a size-keyed pool lets them
/// share targets instead of reallocating render textures every frame, which
/// is expensive on mobile drivers.
const SCRATCH_RETAIN_RENDERS: u64 = 8;

/// Largest Gaussian sigma, in scratch-target texels, evaluated by one pass.
/// Larger sigmas halve the scratch resolution first, as Skia's GPU blur does,
/// so each pass reads at most 25 adjacent taps. Above that a blur is
/// low-frequency enough that the bilinear upsample in the consumer is
/// indistinguishable, while fill cost drops 4x per halving — the dominant
/// cost of shadows and backdrop blur on mobile GPUs.
const MAX_PASS_SIGMA: f64 = 4.0;

/// Reusable renderer-only scratch. Large sigmas are downsampled first so both
/// Gaussian passes have at most 25 adjacent taps, without sparse-grid bands.
#[derive(Clone, Debug)]
pub(in super::super) struct ShadowBlur {
    color: bool,
    layout: wgpu::BindGroupLayout,
    pipeline: wgpu::RenderPipeline,
    sampler: wgpu::Sampler,
    targets: Vec<AlphaTarget>,
    render_serial: u64,
}

impl ShadowBlur {
    pub(in super::super) fn new(target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
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
            color: false,
            layout,
            pipeline,
            sampler,
            targets: Vec::new(),
            render_serial: 0,
        }
    }

    pub(in super::super) fn new_color(target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
        Self {
            color: true,
            ..Self::new(target)
        }
    }

    pub(in super::super) fn clear(&mut self) {
        self.targets.clear();
    }
    pub(in super::super) fn byte_len(&self) -> usize {
        self.targets
            .iter()
            .map(|t| t.texture.size().width as usize * t.texture.size().height as usize * 4)
            .sum()
    }

    pub(in super::super) fn render(
        &mut self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        source: &wgpu::TextureView,
        encoder: &mut wgpu::CommandEncoder,
        sigma: f64,
        sampled_region: Option<WgpuPhysicalRect>,
    ) -> wgpu::TextureView {
        if sigma < 0.001 {
            return source.clone();
        }
        self.render_serial += 1;
        let full = [target.extent().width, target.extent().height];
        let region = sampled_region.map(|region| blur_source_region(region, sigma, full));
        let mut size = full;
        let mut input = source.clone();
        let mut used = Vec::new();
        while sigma * (size[0] as f64 / full[0] as f64).max(size[1] as f64 / full[1] as f64)
            > MAX_PASS_SIGMA
            && size != [1, 1]
        {
            size = size.map(|n| n.div_ceil(2));
            let index = self.acquire_target(target, size, &used);
            used.push(index);
            self.pass(target, encoder, &input, index, [0.0; 2], 0.0, region, full);
            input = self.targets[index].view.clone();
        }
        for axis in 0..2 {
            let index = self.acquire_target(target, size, &used);
            used.push(index);
            let mut direction = [0.0; 2];
            direction[axis] = 1.0;
            self.pass(
                target,
                encoder,
                &input,
                index,
                direction,
                (sigma * size[axis] as f64 / full[axis] as f64).min(MAX_PASS_SIGMA) as f32,
                region,
                full,
            );
            input = self.targets[index].view.clone();
        }
        let serial = self.render_serial;
        self.targets
            .retain(|t| serial - t.last_used < SCRATCH_RETAIN_RENDERS);
        input
    }

    /// Returns a pooled scratch target of `size` not already used by this
    /// render, allocating one only when none is free.
    fn acquire_target(
        &mut self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        size: [u32; 2],
        used: &[usize],
    ) -> usize {
        let serial = self.render_serial;
        if let Some(index) = self
            .targets
            .iter()
            .enumerate()
            .position(|(index, t)| t.size == size && !used.contains(&index))
        {
            self.targets[index].last_used = serial;
            return index;
        }
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
        self.targets.push(AlphaTarget {
            texture,
            view,
            size,
            last_used: serial,
        });
        self.targets.len() - 1
    }

    fn pass(
        &self,
        target: &RealWgpuNativeRenderRuntimeTarget,
        encoder: &mut wgpu::CommandEncoder,
        input: &wgpu::TextureView,
        index: usize,
        direction: [f32; 2],
        sigma: f32,
        region: Option<WgpuPhysicalRect>,
        full: [u32; 2],
    ) {
        let output = &self.targets[index];
        let scissor = region.map(|region| scale_region(region, full, output.size));
        if scissor.is_some_and(WgpuPhysicalRect::is_empty) {
            return;
        }
        let values = [
            output.size[0] as f32,
            output.size[1] as f32,
            direction[0],
            direction[1],
            sigma,
            if self.color { 1.0 } else { 0.0 },
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
        if let Some(scissor) = scissor {
            pass.set_scissor_rect(scissor.x, scissor.y, scissor.width, scissor.height);
        }
        target.record_draw();
        pass.draw(0..3, 0..1);
    }
}

/// Number of 2x downsample levels `render` uses for `sigma` at `full` size.
fn downsample_levels(sigma: f64, full: [u32; 2]) -> u32 {
    let mut size = full;
    let mut levels = 0;
    while sigma * (size[0] as f64 / full[0] as f64).max(size[1] as f64 / full[1] as f64)
        > MAX_PASS_SIGMA
        && size != [1, 1]
    {
        size = size.map(|n| n.div_ceil(2));
        levels += 1;
    }
    levels
}

/// Full-resolution source rectangle a blur needs so that its output is exact
/// inside `sampled`: two Gaussian reaches (3 sigma each, for the horizontal
/// and vertical passes) plus one texel of bilinear reach per downsample level.
/// Passes are scissored to it, so a backdrop behind a dialogue box costs its
/// own area instead of the whole frame; pixels outside are never sampled.
pub(in super::super) fn blur_source_region(
    sampled: WgpuPhysicalRect,
    sigma: f64,
    full: [u32; 2],
) -> WgpuPhysicalRect {
    let levels = downsample_levels(sigma, full);
    let reach = (6.0 * sigma).ceil() as u32 + (2u32 << levels.min(16)) + 2;
    let x0 = sampled.x.saturating_sub(reach);
    let y0 = sampled.y.saturating_sub(reach);
    let x1 = sampled
        .x
        .saturating_add(sampled.width)
        .saturating_add(reach)
        .min(full[0]);
    let y1 = sampled
        .y
        .saturating_add(sampled.height)
        .saturating_add(reach)
        .min(full[1]);
    WgpuPhysicalRect {
        x: x0.min(x1),
        y: y0.min(y1),
        width: x1.saturating_sub(x0),
        height: y1.saturating_sub(y0),
    }
}

/// Maps a full-resolution rectangle onto a scratch level, rounding outward.
fn scale_region(region: WgpuPhysicalRect, full: [u32; 2], size: [u32; 2]) -> WgpuPhysicalRect {
    let scale = |value: u32, axis: usize, round_up: bool| {
        let scaled = value as u64 * size[axis] as u64;
        let full = full[axis].max(1) as u64;
        let mapped = if round_up {
            scaled.div_ceil(full)
        } else {
            scaled / full
        };
        (mapped as u32).min(size[axis])
    };
    let x0 = scale(region.x, 0, false);
    let y0 = scale(region.y, 1, false);
    let x1 = scale(region.x.saturating_add(region.width), 0, true);
    let y1 = scale(region.y.saturating_add(region.height), 1, true);
    WgpuPhysicalRect {
        x: x0,
        y: y0,
        width: x1.saturating_sub(x0),
        height: y1.saturating_sub(y0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: u32, y: u32, width: u32, height: u32) -> WgpuPhysicalRect {
        WgpuPhysicalRect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn small_sigmas_run_at_full_resolution_and_large_ones_downsample() {
        assert_eq!(downsample_levels(4.0, [1920, 1080]), 0);
        assert_eq!(downsample_levels(8.0, [1920, 1080]), 1);
        assert_eq!(downsample_levels(40.0, [1920, 1080]), 4);
    }

    #[test]
    fn source_region_covers_both_gaussian_reaches_and_clamps_to_the_frame() {
        let region = blur_source_region(rect(200, 700, 1500, 300), 8.0, [1920, 1080]);
        // 6 sigma + bilinear reach for one level (4) + 2 = 54 on every side,
        // clamped to the frame.
        assert_eq!(region, rect(146, 646, 1608, 408));
        let edge = blur_source_region(rect(1800, 1000, 120, 80), 8.0, [1920, 1080]);
        assert_eq!(edge, rect(1746, 946, 174, 134));
    }

    #[test]
    fn scaled_regions_round_outward() {
        assert_eq!(
            scale_region(rect(3, 5, 10, 10), [1920, 1080], [960, 540]),
            rect(1, 2, 6, 6)
        );
        assert_eq!(
            scale_region(rect(0, 0, 1920, 1080), [1920, 1080], [480, 270]),
            rect(0, 0, 480, 270)
        );
    }
}
