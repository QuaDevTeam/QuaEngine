use super::decoded::RealWgpuDecodedTextureRgba8;

/// Area filtering in premultiplied sRGB prevents transparent texels from
/// tinting smaller levels. Odd dimensions include the entire source extent.
pub(super) fn downsample(source: &RealWgpuDecodedTextureRgba8) -> RealWgpuDecodedTextureRgba8 {
    let width = (source.width / 2).max(1);
    let height = (source.height / 2).max(1);
    let mut rgba = vec![0; (width * height * 4) as usize];
    for y in 0..height {
        for x in 0..width {
            let x0 = x as f64 * source.width as f64 / width as f64;
            let x1 = (x + 1) as f64 * source.width as f64 / width as f64;
            let y0 = y as f64 * source.height as f64 / height as f64;
            let y1 = (y + 1) as f64 * source.height as f64 / height as f64;
            let mut sum = [0.0; 4];
            for sy in y0.floor() as u32..(y1.ceil() as u32).min(source.height) {
                for sx in x0.floor() as u32..(x1.ceil() as u32).min(source.width) {
                    let weight = ((sx + 1) as f64).min(x1) - (sx as f64).max(x0);
                    let weight = weight * (((sy + 1) as f64).min(y1) - (sy as f64).max(y0));
                    let at = ((sy * source.width + sx) * 4) as usize;
                    let alpha = source.rgba[at + 3] as f64;
                    for c in 0..3 {
                        sum[c] += source.rgba[at + c] as f64 * alpha * weight;
                    }
                    sum[3] += alpha * weight;
                }
            }
            let at = ((y * width + x) * 4) as usize;
            for c in 0..3 {
                rgba[at + c] = (sum[c] / sum[3].max(0.000001)).round() as u8;
            }
            rgba[at + 3] = (sum[3] / ((x1 - x0) * (y1 - y0))).round() as u8;
        }
    }
    RealWgpuDecodedTextureRgba8::new(width, height, rgba)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minification_preserves_transparent_color_and_odd_edges() {
        let level = downsample(&RealWgpuDecodedTextureRgba8::new(
            3,
            1,
            vec![255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 255],
        ));
        assert_eq!((level.width, level.height), (1, 1));
        assert_eq!(level.rgba, [128, 0, 128, 170]);
    }
}
