/// CSS blend modes evaluated on straight sRGB colors, then source-over
/// composited using the source and backdrop alpha.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u32)]
pub enum CompositeBlendMode {
    #[default]
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl CompositeBlendMode {
    /// Unknown CSS values have the initial (normal) behavior.
    pub fn from_css(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "multiply" => Self::Multiply,
            "screen" => Self::Screen,
            "overlay" => Self::Overlay,
            "darken" => Self::Darken,
            "lighten" => Self::Lighten,
            "color-dodge" => Self::ColorDodge,
            "color-burn" => Self::ColorBurn,
            "hard-light" => Self::HardLight,
            "soft-light" => Self::SoftLight,
            "difference" => Self::Difference,
            "exclusion" => Self::Exclusion,
            "hue" => Self::Hue,
            "saturation" => Self::Saturation,
            "color" => Self::Color,
            "luminosity" => Self::Luminosity,
            _ => Self::Normal,
        }
    }
}

/// Background filter order matches renderer-web: after blur, brightness,
/// contrast, saturate, hue-rotate, grayscale, sepia (then native invert).
#[derive(Clone, Debug, PartialEq)]
pub struct CompositeColorFilter {
    pub brightness: f32,
    pub contrast: f32,
    pub saturation: f32,
    pub hue_rotate_radians: f32,
    pub grayscale: f32,
    pub sepia: f32,
    pub invert: f32,
}

impl Default for CompositeColorFilter {
    fn default() -> Self {
        Self {
            brightness: 1.0,
            contrast: 1.0,
            saturation: 1.0,
            hue_rotate_radians: 0.0,
            grayscale: 0.0,
            sepia: 0.0,
            invert: 0.0,
        }
    }
}

/// Transient isolated stacking context. Filters and opacity apply once to
/// its complete subtree. Blend is evaluated against its parent's backdrop.
#[derive(Clone, Debug, PartialEq)]
pub struct DrawCompositeGroup {
    pub blur_radius: f64,
    pub id: String,
    pub opacity: f32,
    pub z_index: i32,
    pub blend_mode: CompositeBlendMode,
    pub color_filter: CompositeColorFilter,
}

impl Default for DrawCompositeGroup {
    fn default() -> Self {
        Self {
            blur_radius: 0.0,
            id: String::new(),
            opacity: 1.0,
            z_index: 0,
            blend_mode: CompositeBlendMode::Normal,
            color_filter: CompositeColorFilter::default(),
        }
    }
}
