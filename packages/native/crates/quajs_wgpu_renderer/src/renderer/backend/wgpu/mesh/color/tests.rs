use super::*;

#[test]
fn parses_safe_native_color_literals() {
    assert_eq!(
        parse_color_literal("#369c"),
        Some(WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
            r: 0x33 as f32 / 255.0,
            g: 0x66 as f32 / 255.0,
            b: 0x99 as f32 / 255.0,
            a: 0xcc as f32 / 255.0,
        }))
    );
    assert_eq!(
        parse_color_literal("rgba(255, 128, 0, 0.25)"),
        Some(WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
            r: 1.0,
            g: 128.0 / 255.0,
            b: 0.0,
            a: 0.25,
        }))
    );
    assert_eq!(
        parse_color_literal("currentColor"),
        Some(WgpuNativeRenderPaintColor::CurrentColor)
    );
    assert_eq!(
        parse_color_literal("transparent"),
        Some(WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        }))
    );
}

#[test]
fn rejects_malformed_or_unsafe_color_literals() {
    assert_eq!(parse_color_literal(" rgb(0,0,0)"), None);
    assert_eq!(parse_color_literal("rgb(300,0,0)"), None);
    assert_eq!(parse_color_literal("rgb(1.,0,0)"), None);
    assert_eq!(parse_color_literal("rgba(0,0,0,2)"), None);
    assert_eq!(parse_color_literal("url(native.node)"), None);
    assert_eq!(parse_color_literal("../native.node"), None);
}
