//! Admission estimates are computed from headers before allocating decoded pixels.
use super::super::{invalid_order, WgpuNativeRenderRuntimeError};

pub(crate) const MAX_PREPARATION_BYTES: usize = 512 * 1024 * 1024;

pub(super) fn reader(
    bytes: &[u8],
) -> Result<image::ImageReader<std::io::Cursor<&[u8]>>, WgpuNativeRenderRuntimeError> {
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(error)?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    Ok(reader)
}

pub(super) fn error(error: impl std::fmt::Display) -> WgpuNativeRenderRuntimeError {
    WgpuNativeRenderRuntimeError::new(
        super::super::WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        format!("Image preparation: {error}"),
    )
}

pub(crate) fn estimate(bytes: &[u8]) -> Result<usize, WgpuNativeRenderRuntimeError> {
    if bytes.len() > 64 * 1024 * 1024 {
        return invalid_order("Encoded image exceeds the 64 MiB preparation budget");
    }
    let (width, height) = reader(bytes)?.into_dimensions().map_err(error)?;
    let rgba = u64::from(width) * u64::from(height) * 4;
    if width == 0 || height == 0 || width > 8192 || height > 8192 || rgba > 128 * 1024 * 1024 {
        return invalid_order("Image dimensions exceed the preparation budget");
    }
    let (mut w, mut h) = (width, height);
    let mut mip_bytes = rgba;
    while w > 1 || h > 1 {
        w = (w / 2).max(1);
        h = (h / 2).max(1);
        mip_bytes += u64::from(w) * u64::from(h) * 4;
    }
    // Codec scratch/native pixels + RGBA conversion/downsampling, GPU mip chain,
    // queue staging, and both encoded read/worker copies. Driver overhead is
    // covered separately by host headroom; this is a conservative payload estimate.
    let peak = rgba * 4 + mip_bytes * 2 + bytes.len() as u64 * 2 + 1024 * 1024;
    if peak > MAX_PREPARATION_BYTES as u64 {
        return invalid_order("Image exceeds the 512 MiB total preparation limit");
    }
    Ok(peak as usize)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compressed_images_are_charged_for_pixels_and_uploads_before_decode() {
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2048, 1024)
            .write_to(&mut encoded, image::ImageFormat::Png)
            .unwrap();
        let peak = estimate(encoded.get_ref()).unwrap();
        assert!(peak > 48 * 1024 * 1024);
        assert!(peak > encoded.get_ref().len() * 100);
        assert!(estimate(b"not an image").is_err());
    }
}
