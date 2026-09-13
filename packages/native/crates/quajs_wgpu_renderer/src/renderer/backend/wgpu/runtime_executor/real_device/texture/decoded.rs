use std::collections::BTreeSet;

use super::super::resource_id::{
    validate_decoded_texture_metadata, validate_decoded_texture_resource_id,
};
use super::super::{
    invalid_order, RealWgpuNativeRenderRuntimeTarget, WgpuNativeRenderRuntimeError,
    WgpuNativeRenderRuntimeErrorKind,
};
use super::sampler::create_texture_sampler;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RealWgpuDecodedTextureRgba8 {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

impl RealWgpuDecodedTextureRgba8 {
    pub fn new(width: u32, height: u32, rgba: impl Into<Vec<u8>>) -> Self {
        Self {
            width,
            height,
            rgba: rgba.into(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RealWgpuDecodedTextureMetadata {
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
}

impl RealWgpuDecodedTextureMetadata {
    pub fn owned_by(mut self, package_id: impl Into<String>) -> Self {
        self.owner_package_id = Some(package_id.into());
        self
    }

    pub fn require_package(mut self, package_id: impl Into<String>) -> Self {
        self.required_package_ids.insert(package_id.into());
        self
    }

    pub fn require_packages<I, S>(mut self, package_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for package_id in package_ids {
            self.required_package_ids.insert(package_id.into());
        }
        self
    }
}

#[cfg(feature = "image-decode")]
pub fn decode_image_bytes_rgba8(
    resource_id: &str,
    encoded_image: &[u8],
) -> Result<RealWgpuDecodedTextureRgba8, WgpuNativeRenderRuntimeError> {
    if encoded_image.is_empty() {
        return invalid_order(format!("encoded image '{resource_id}' must not be empty"));
    }
    let image = image::load_from_memory(encoded_image).map_err(|error| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("failed to decode encoded image '{resource_id}': {error}"),
        )
    })?;
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(RealWgpuDecodedTextureRgba8::new(
        width,
        height,
        rgba.into_raw(),
    ))
}

#[derive(Clone, Debug)]
pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) struct RealRuntimeDecodedTexture
{
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) texture: wgpu::Texture,
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) view: wgpu::TextureView,
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) sampler: wgpu::Sampler,
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) width: u32,
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) height: u32,
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) byte_len: usize,
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) owner_package_id:
        Option<String>,
    pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) required_package_ids:
        BTreeSet<String>,
}

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn create_runtime_decoded_texture_rgba8(
    target: &RealWgpuNativeRenderRuntimeTarget,
    resource_id: &str,
    mut decoded: RealWgpuDecodedTextureRgba8,
    metadata: RealWgpuDecodedTextureMetadata,
) -> Result<RealRuntimeDecodedTexture, WgpuNativeRenderRuntimeError> {
    validate_decoded_texture_rgba8(resource_id, &decoded)?;
    validate_decoded_texture_metadata(&metadata)?;
    // Filter premultiplied texels at every mip level, including magnification.
    // Straight RGBA stays at the decode/public boundary; GPU bytes are transient.
    super::mipmap::premultiply(&mut decoded);
    let texture_label = format!("decoded-texture::{resource_id}");
    let extent = wgpu::Extent3d {
        width: decoded.width,
        height: decoded.height,
        depth_or_array_layers: 1,
    };
    // Atlas cells have their own padding and must not bleed into neighbours.
    // Other sampled images need a full chain for browser-style minification.
    let mip_count = if resource_id.starts_with("fonts:") {
        1
    } else {
        decoded.width.max(decoded.height).ilog2() + 1
    };
    let texture = target.device().create_texture(&wgpu::TextureDescriptor {
        label: Some(&texture_label),
        size: extent,
        mip_level_count: mip_count,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        // Non-sRGB so sampling returns the stored sRGB-encoded values. The
        // frame is composited in that same space to match CSS; decoding here
        // would mix encoded vertex colors with linear texels.
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    target.queue().write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &decoded.rgba,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(decoded.width.saturating_mul(4)),
            rows_per_image: Some(decoded.height),
        },
        extent,
    );
    let mut byte_len = decoded.rgba.len();
    let width = decoded.width;
    let height = decoded.height;
    let mut level = decoded;
    for mip_level in 1..mip_count {
        level = super::mipmap::downsample(&level);
        byte_len += level.rgba.len();
        target.queue().write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &level.rgba,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(level.width * 4),
                rows_per_image: Some(level.height),
            },
            wgpu::Extent3d {
                width: level.width,
                height: level.height,
                depth_or_array_layers: 1,
            },
        );
    }
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = create_texture_sampler(target, &format!("decoded-sampler::{resource_id}"));
    Ok(RealRuntimeDecodedTexture {
        texture,
        view,
        sampler,
        width,
        height,
        byte_len,
        owner_package_id: metadata.owner_package_id,
        required_package_ids: metadata.required_package_ids,
    })
}

fn validate_decoded_texture_rgba8(
    resource_id: &str,
    decoded: &RealWgpuDecodedTextureRgba8,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    validate_decoded_texture_resource_id(resource_id)?;
    if decoded.width == 0 || decoded.height == 0 {
        return invalid_order(format!(
            "decoded texture '{resource_id}' must have positive dimensions"
        ));
    }
    let expected_len = decoded
        .width
        .checked_mul(decoded.height)
        .and_then(|pixel_count| pixel_count.checked_mul(4))
        .map(|byte_len| byte_len as usize)
        .ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                format!("decoded texture '{resource_id}' byte length overflow"),
            )
        })?;
    if decoded.rgba.len() != expected_len {
        return invalid_order(format!(
            "decoded texture '{resource_id}' RGBA byte length mismatch: got {}, expected {expected_len}",
            decoded.rgba.len()
        ));
    }

    Ok(())
}
