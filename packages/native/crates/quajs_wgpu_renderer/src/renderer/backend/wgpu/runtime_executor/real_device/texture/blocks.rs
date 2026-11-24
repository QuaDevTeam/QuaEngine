//! Quack native QPK texture variants. The 32-byte QNT1 header contains seven
//! little-endian u32s followed by tightly packed, largest-first 2D UNORM mips.
use super::super::resource_id::{
    validate_decoded_texture_metadata, validate_decoded_texture_resource_id,
};
use super::super::{
    invalid_order, RealWgpuNativeRenderRuntimeTarget, WgpuNativeRenderRuntimeError,
};
use super::{
    create_runtime_decoded_texture_rgba8, decode_image_bytes_rgba8, RealRuntimeDecodedTexture,
    RealWgpuDecodedTextureMetadata,
};

pub(super) struct Blocks<'a> {
    format: wgpu::TextureFormat,
    canvas: [u32; 2],
    origin: [u32; 2],
    extent: wgpu::Extent3d,
    pub(super) levels: Vec<(wgpu::Extent3d, u32, &'a [u8])>,
}

pub(in super::super) fn fits_device(bytes: &[u8], limit: u32) -> bool {
    if !bytes.starts_with(b"QNT1") || bytes.len() < 32 {
        return true;
    }
    [24, 28]
        .into_iter()
        .all(|i| u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap()) <= limit)
}

pub(super) fn parse(bytes: &[u8]) -> Result<Option<Blocks<'_>>, WgpuNativeRenderRuntimeError> {
    if !bytes.starts_with(b"QNT1") {
        return Ok(None);
    }
    if bytes.len() < 32 || bytes.len() > 64 * 1024 * 1024 {
        return invalid_order("Invalid QNT1 texture size");
    }
    let field = |i: usize| u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap());
    let format = match field(4) {
        145 => wgpu::TextureFormat::Bc7RgbaUnorm,
        157 | 165 => wgpu::TextureFormat::Astc {
            block: if field(4) == 157 {
                wgpu::AstcBlock::B4x4
            } else {
                wgpu::AstcBlock::B6x6
            },
            channel: wgpu::AstcChannel::Unorm,
        },
        _ => return invalid_order("Unsupported QNT1 texture format"),
    };
    let (block, _) = format.block_dimensions();
    let canvas = [field(8), field(12)];
    let origin = [field(16), field(20)];
    let stored = [field(24), field(28)];
    for axis in 0..2 {
        if !(1..=8192).contains(&canvas[axis])
            || origin[axis] >= canvas[axis]
            || stored[axis] == 0
            || stored[axis] > (canvas[axis] - origin[axis]).div_ceil(block) * block
            || !stored[axis].is_multiple_of(block)
        {
            return invalid_order("Invalid QNT1 canvas or block extent");
        }
    }
    let extent = wgpu::Extent3d {
        width: stored[0],
        height: stored[1],
        depth_or_array_layers: 1,
    };
    let mut levels = Vec::new();
    let mut remaining = &bytes[32..];
    for mip in 0..extent.max_mips(wgpu::TextureDimension::D2) {
        let size = extent
            .mip_level_size(mip, wgpu::TextureDimension::D2)
            .physical_size(format);
        let pitch = size.width / block * 16;
        let len = pitch as usize * (size.height / block) as usize;
        let Some((data, rest)) = remaining.split_at_checked(len) else {
            return invalid_order("Truncated QNT1 mip chain");
        };
        levels.push((size, pitch, data));
        remaining = rest;
    }
    if !remaining.is_empty() {
        return invalid_order("Unexpected trailing QNT1 bytes");
    }
    Ok(Some(Blocks {
        format,
        canvas,
        origin,
        extent,
        levels,
    }))
}

pub(in super::super) fn prepare_encoded_texture(
    target: &RealWgpuNativeRenderRuntimeTarget,
    id: &str,
    bytes: &[u8],
    metadata: RealWgpuDecodedTextureMetadata,
    active: impl FnOnce() -> bool,
) -> Result<RealRuntimeDecodedTexture, WgpuNativeRenderRuntimeError> {
    let Some(blocks) = parse(bytes)? else {
        let decoded = decode_image_bytes_rgba8(id, bytes)?;
        if !active() {
            return invalid_order("Image preparation cancelled before upload");
        }
        return create_runtime_decoded_texture_rgba8(target, id, decoded, metadata);
    };
    validate_decoded_texture_resource_id(id)?;
    validate_decoded_texture_metadata(&metadata)?;
    let device = target.device();
    if !device
        .features()
        .contains(blocks.format.required_features())
        || blocks.extent.width.max(blocks.extent.height) > device.limits().max_texture_dimension_2d
    {
        return invalid_order("QNT1 texture is unsupported on this device");
    }
    if !active() {
        return invalid_order("Image preparation cancelled before upload");
    }
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(id),
        size: blocks.extent,
        mip_level_count: blocks.levels.len() as u32,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: blocks.format,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    for (mip, (size, pitch, data)) in blocks.levels.into_iter().enumerate() {
        target.queue().write_texture(
            wgpu::TexelCopyTextureInfo {
                mip_level: mip as u32,
                ..texture.as_image_copy()
            },
            data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(pitch),
                rows_per_image: None,
            },
            size,
        );
    }
    let w = blocks.extent.width as f32;
    let h = blocks.extent.height as f32;
    Ok(RealRuntimeDecodedTexture {
        view: texture.create_view(&Default::default()),
        sampler: target.scene_sampler.clone(),
        texture,
        width: blocks.canvas[0],
        height: blocks.canvas[1],
        byte_len: bytes.len() - 32,
        uv_transform: [
            blocks.canvas[0] as f32 / w,
            blocks.canvas[1] as f32 / h,
            -(blocks.origin[0] as f32) / w,
            -(blocks.origin[1] as f32) / h,
        ],
        owner_package_id: metadata.owner_package_id,
        required_package_ids: metadata.required_package_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_every_physical_mip_before_allocating_a_texture() {
        let mut bytes = b"QNT1".to_vec();
        for field in [165u32, 17, 11, 3, 2, 18, 12] {
            bytes.extend(field.to_le_bytes());
        }
        // Logical mip sizes 18x12, 9x6, 4x3, 2x1, 1x1.
        bytes.resize(32 + (6 + 2 + 1 + 1 + 1) * 16, 0);
        assert!(fits_device(&bytes, 18));
        assert!(!fits_device(&bytes, 17));
        let blocks = parse(&bytes).unwrap().unwrap();
        assert_eq!(blocks.levels.len(), 5);
        assert_eq!(blocks.levels[1].0.width, 12);
        assert!(parse(&bytes[..bytes.len() - 1]).is_err());
        bytes[24] = 17;
        assert!(parse(&bytes).is_err());
        assert!(parse(b"old png").unwrap().is_none());
    }
}
