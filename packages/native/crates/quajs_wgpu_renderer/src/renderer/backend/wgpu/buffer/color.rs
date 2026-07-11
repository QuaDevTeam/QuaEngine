use super::super::mesh::{WgpuNativeRenderColor, WgpuNativeRenderPaintColor};

pub(super) fn color_to_rgba(color: WgpuNativeRenderPaintColor) -> [f32; 4] {
    match color {
        WgpuNativeRenderPaintColor::Rgba(color) => color_struct_to_rgba(color),
        WgpuNativeRenderPaintColor::CurrentColor => {
            color_struct_to_rgba(WgpuNativeRenderColor::WHITE)
        }
    }
}

pub(super) fn color_struct_to_rgba(color: WgpuNativeRenderColor) -> [f32; 4] {
    [
        srgb_channel_to_linear(color.r),
        srgb_channel_to_linear(color.g),
        srgb_channel_to_linear(color.b),
        color.a.clamp(0.0, 1.0),
    ]
}

fn srgb_channel_to_linear(channel: f32) -> f32 {
    let channel = channel.clamp(0.0, 1.0);
    if channel <= 0.04045 {
        channel / 12.92
    } else {
        ((channel + 0.055) / 1.055).powf(2.4)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_css_srgb_channels_to_linear_gpu_output() {
        let actual = color_struct_to_rgba(WgpuNativeRenderColor {
            r: 0x12 as f32 / 255.0,
            g: 0x17 as f32 / 255.0,
            b: 0x1d as f32 / 255.0,
            a: 0.42,
        });

        assert_channel_close(actual[0], 0.006_049);
        assert_channel_close(actual[1], 0.008_568);
        assert_channel_close(actual[2], 0.012_286);
        assert_channel_close(actual[3], 0.42);
    }

    #[test]
    fn preserves_srgb_endpoints_and_alpha() {
        assert_eq!(
            color_struct_to_rgba(WgpuNativeRenderColor {
                r: 0.0,
                g: 1.0,
                b: 0.0,
                a: 0.25,
            }),
            [0.0, 1.0, 0.0, 0.25]
        );
    }

    fn assert_channel_close(actual: f32, expected: f32) {
        assert!(
            (actual - expected).abs() <= 0.000_001,
            "expected {expected}, got {actual}"
        );
    }
}
