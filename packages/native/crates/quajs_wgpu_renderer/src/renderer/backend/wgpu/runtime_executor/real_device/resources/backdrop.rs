use super::super::frame_target::RealRuntimeFrameTarget;
use super::super::pass::shadow_blur::blur_source_region;
use super::super::RealWgpuNativeRenderRuntimeTarget;
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

/// Capture exactly the already-painted backdrop root, inside a subtree when
/// appropriate. The scratch texture is reused after each sampling draw.
pub(in super::super) fn capture_backdrop(
    target: &RealWgpuNativeRenderRuntimeTarget,
    source: &RealRuntimeFrameTarget,
    scratch: &mut BackdropResources,
    encoder: &mut wgpu::CommandEncoder,
    layout: &wgpu::BindGroupLayout,
    command_id: &str,
    sampled_region: WgpuPhysicalRect,
) -> wgpu::BindGroup {
    let sigma = scratch.radii.get(command_id).copied().unwrap_or(0.0);
    let extent = source.extent();
    // The backdrop shader only samples inside its own draw, so only that area
    // plus the blur's reach has to be copied and blurred.
    let copy_region = blur_source_region(sampled_region, sigma, [extent.width, extent.height]);
    let view = capture_backdrop_region(target, source, scratch, encoder, Some(copy_region));
    let view = scratch
        .blur
        .get_or_insert_with(|| super::super::pass::shadow_blur::ShadowBlur::new_color(target))
        .render(target, &view, encoder, sigma, Some(sampled_region));
    let sampler = target.device().create_sampler(&wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    });
    super::super::texture::sampler::create_sampler_bind_group(
        target,
        layout,
        "qua-native::backdrop-capture-binding",
        &sampler,
        &view,
        super::super::texture::sampler::IDENTITY_UV,
    )
}

/// Shared scratch capture for backdrop blur and CSS blend compositing. Encoded
/// consumers finish sampling before the next copy, so only one scratch is held.
pub(in super::super) fn capture_backdrop_view(
    target: &RealWgpuNativeRenderRuntimeTarget,
    source: &RealRuntimeFrameTarget,
    scratch: &mut BackdropResources,
    encoder: &mut wgpu::CommandEncoder,
) -> wgpu::TextureView {
    capture_backdrop_region(target, source, scratch, encoder, None)
}

/// Copies `region` (or the whole frame) of the painted backdrop into scratch.
/// Texels outside a partial region are stale and must not be sampled.
fn capture_backdrop_region(
    target: &RealWgpuNativeRenderRuntimeTarget,
    source: &RealRuntimeFrameTarget,
    scratch: &mut BackdropResources,
    encoder: &mut wgpu::CommandEncoder,
    region: Option<WgpuPhysicalRect>,
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
    let region = region.unwrap_or(WgpuPhysicalRect {
        x: 0,
        y: 0,
        width: extent.width,
        height: extent.height,
    });
    if !region.is_empty() {
        let origin = wgpu::Origin3d {
            x: region.x,
            y: region.y,
            z: 0,
        };
        encoder.copy_texture_to_texture(
            wgpu::TexelCopyTextureInfo {
                origin,
                ..source.texture().as_image_copy()
            },
            wgpu::TexelCopyTextureInfo {
                origin,
                ..texture.as_image_copy()
            },
            wgpu::Extent3d {
                width: region.width,
                height: region.height,
                depth_or_array_layers: 1,
            },
        );
    }
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
