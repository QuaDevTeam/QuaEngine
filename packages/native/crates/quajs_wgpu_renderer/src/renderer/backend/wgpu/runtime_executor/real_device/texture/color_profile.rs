use image::{DynamicImage, RgbaImage};
use moxcms::{ColorProfile, DataColorSpace, Layout};

// Color-manage straight samples once, before premultiplication and mip generation.
// Untagged images and unsupported metadata use the same sRGB fallback as raw RGBA.
pub(super) fn into_srgb(image: DynamicImage, icc: Option<&[u8]>, resource_id: &str) -> RgbaImage {
    if let Some(icc) = icc {
        match convert_profile(&image, icc) {
            Ok(rgba) => return rgba,
            Err(error) => log::warn!("Image '{resource_id}' uses the sRGB fallback: {error}"),
        }
    }
    image.into_rgba8()
}

fn convert_profile(image: &DynamicImage, icc: &[u8]) -> Result<RgbaImage, moxcms::CmsError> {
    let profile = ColorProfile::new_from_slice(icc)?;
    // JPEG decoders have already converted CMYK to RGB. Applying a CMYK
    // profile to those three channels would interpret them a second time.
    let channels = image.color().channel_count();
    let layout = match (profile.color_space, channels) {
        (DataColorSpace::Rgb, 3) => Layout::Rgb,
        (DataColorSpace::Rgb, 4) => Layout::Rgba,
        (DataColorSpace::Gray, 1) => Layout::Gray,
        (DataColorSpace::Gray, 2) => Layout::GrayAlpha,
        _ => return Err(moxcms::CmsError::UnsupportedProfileConnection),
    };
    let srgb = ColorProfile::new_srgb();
    let mut output = RgbaImage::new(image.width(), image.height());
    if let Some(input) = image.as_flat_samples_u8() {
        let transform =
            profile.create_transform_8bit(layout, &srgb, Layout::Rgba, Default::default())?;
        transform.transform(input.samples, &mut output)?;
    } else if let Some(input) = image.as_flat_samples_u16() {
        // Quantize after the transfer function so near-black 16-bit linear
        // samples survive. Reuse a scanline instead of allocating a 16-bit frame.
        let transform =
            profile.create_transform_16bit(layout, &srgb, Layout::Rgba, Default::default())?;
        let width = image.width() as usize;
        let mut row = vec![0; width * 4];
        for (source, destination) in input
            .samples
            .chunks_exact(width * usize::from(channels))
            .zip(output.chunks_exact_mut(width * 4))
        {
            transform.transform(source, &mut row)?;
            for (&sample, channel) in row.iter().zip(destination) {
                *channel = ((u32::from(sample) + 128) / 257) as u8;
            }
        }
    } else {
        return Err(moxcms::CmsError::UnsupportedProfileConnection);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayAlphaImage, LumaA, Rgba};

    #[test]
    fn linear_gray_profile_preserves_straight_alpha() {
        let image = DynamicImage::ImageLumaA8(GrayAlphaImage::from_pixel(1, 1, LumaA([128, 51])));
        let icc = ColorProfile::new_gray_with_gamma(1.0).encode().unwrap();
        let rgba = into_srgb(image, Some(&icc), "gray.png");
        let pixel = rgba.get_pixel(0, 0).0;
        for channel in &pixel[..3] {
            assert!(channel.abs_diff(188) <= 2, "{pixel:?}");
        }
        assert_eq!(pixel[3], 51);
    }

    #[test]
    fn transforms_16bit_shadows_before_quantizing_to_the_scene_format() {
        let image =
            DynamicImage::ImageLuma16(image::ImageBuffer::from_pixel(1, 1, image::Luma([100])));
        let icc = ColorProfile::new_gray_with_gamma(1.0).encode().unwrap();
        let rgba = into_srgb(image, Some(&icc), "linear16.png");
        // 100 / 65535 linear becomes ~5 in sRGB8. Quantizing first loses it.
        assert_eq!(rgba.get_pixel(0, 0).0, [5, 5, 5, 255]);
    }

    #[test]
    fn malformed_profile_uses_original_decoded_pixels() {
        let rgba = RgbaImage::from_pixel(1, 1, Rgba([88, 122, 64, 157]));
        assert_eq!(
            into_srgb(
                DynamicImage::ImageRgba8(rgba.clone()),
                Some(b"invalid profile"),
                "invalid-icc.png"
            ),
            rgba
        );
    }
}
