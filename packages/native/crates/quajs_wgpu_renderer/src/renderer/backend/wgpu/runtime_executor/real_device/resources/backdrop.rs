use super::super::frame_target::RealRuntimeFrameTarget;
use super::super::RealWgpuNativeRenderRuntimeTarget;

/// Capture exactly the already-painted backdrop root, inside a subtree when
/// appropriate. The scratch texture is reused after each sampling draw.
pub(in super::super) fn capture_backdrop(
    target: &RealWgpuNativeRenderRuntimeTarget,
    source: &RealRuntimeFrameTarget,
    scratch: &mut BackdropResources,
    encoder: &mut wgpu::CommandEncoder,
    layout: &wgpu::BindGroupLayout,
    command_id: &str,
) -> wgpu::BindGroup {
    let view = capture_backdrop_view(target, source, scratch, encoder);
    let sigma = scratch.radii.get(command_id).copied().unwrap_or(0.0);
    let view = scratch
        .blur
        .get_or_insert_with(|| super::super::pass::shadow_blur::ShadowBlur::new_color(target))
        .render(target, &view, encoder, sigma);
    let sampler = target.device().create_sampler(&wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    });
    target
        .device()
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("qua-native::backdrop-capture-binding"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
            ],
        })
}

/// Shared scratch capture for backdrop blur and CSS blend compositing. Encoded
/// consumers finish sampling before the next copy, so only one scratch is held.
pub(in super::super) fn capture_backdrop_view(
    target: &RealWgpuNativeRenderRuntimeTarget,
    source: &RealRuntimeFrameTarget,
    scratch: &mut BackdropResources,
    encoder: &mut wgpu::CommandEncoder,
) -> wgpu::TextureView {
    let extent = source.extent();
    let format = source.color_format();
    if scratch
        .capture
        .as_ref()
        .is_none_or(|t| t.size() != extent || t.format() != format)
    {
        scratch.capture = Some(target.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("qua-native::backdrop-capture"),
            size: extent,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        }));
    }
    let texture = scratch.capture.as_ref().unwrap();
    encoder.copy_texture_to_texture(
        source.texture().as_image_copy(),
        texture.as_image_copy(),
        extent,
    );
    let view = texture.create_view(&Default::default());
    view
}

#[derive(Clone, Debug, Default)]
pub(in super::super) struct BackdropResources {
    capture: Option<wgpu::Texture>,
    blur: Option<super::super::pass::shadow_blur::ShadowBlur>,
    pub radii: std::collections::BTreeMap<String, f64>,
}
impl BackdropResources {
    pub fn byte_len(&self) -> usize {
        self.capture
            .as_ref()
            .map_or(0, |t| t.width() as usize * t.height() as usize * 4)
            + self.blur.as_ref().map_or(0, |b| b.byte_len())
    }
}
