use std::collections::BTreeMap;

use crate::resources::ResourceId;
use serde_json::Value;

use super::command::LogicalRect;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaFit {
    Cover,
    Contain,
    Fill,
    None,
    ScaleDown,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MediaOrigin {
    pub x: f64,
    pub y: f64,
}

impl Default for MediaOrigin {
    fn default() -> Self {
        Self { x: 0.5, y: 0.5 }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ImageDrawParams {
    pub asset_type: String,
    pub asset_name: String,
    pub fit: MediaFit,
    pub origin: MediaOrigin,
    pub source: LogicalRect,
    pub rotation_degrees: f64,
    pub brightness: f64,
    pub saturation: f64,
    /// CSS `contrast(N)` — 1.0 = unchanged. Packed into effect0.z.
    pub contrast: f64,
    /// CSS `grayscale(N)` — 0.0 = full color, 1.0 = fully gray. effect0.w.
    pub grayscale: f64,
    /// CSS `sepia(N)` — 0.0 = unchanged, 1.0 = fully sepia. effect1.y.
    pub sepia: f64,
    /// CSS `hue-rotate(Ndeg)` converted to radians. effect1.z.
    pub hue_rotate_radians: f64,
    /// CSS `invert(N)` — 0.0 = unchanged, 1.0 = fully inverted. effect1.w.
    pub invert: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VideoDrawParams {
    pub asset_type: String,
    pub asset_name: String,
    pub frame_resource_id: Option<ResourceId>,
    pub poster_asset_name: Option<String>,
    pub looped: Option<bool>,
    pub muted: Option<bool>,
    pub volume: Option<f32>,
    pub playback_rate: Option<f32>,
    pub seek_ms: Option<f64>,
    pub offset_ms: Option<f64>,
    pub fit: MediaFit,
    pub origin: MediaOrigin,
    pub source: LogicalRect,
    pub fallback_reason: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CharacterAnchor {
    Left,
    Center,
    Right,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CharacterDrawParams {
    pub character_id: String,
    pub character_name: String,
    pub sprite_asset_name: String,
    pub expression: Option<String>,
    pub anchor: CharacterAnchor,
    pub scale: f64,
    pub rotation_degrees: f64,
    /// Mirrors the sprite horizontally when true. Equivalent to CSS
    /// `transform: scaleX(-1)` and used when the engine emits a negative
    /// scaleX on the character position.
    pub flip_horizontal: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextAlign {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FontWeightDrawParam {
    Number(u16),
    Keyword(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FontStyleDrawParam {
    Normal,
    Italic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextDecorationDrawParam {
    None,
    Underline,
    LineThrough,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextOverflowDrawParam {
    Clip,
    Ellipsis,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextTransformDrawParam {
    None,
    Uppercase,
    Lowercase,
    Capitalize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WhiteSpaceDrawParam {
    Normal,
    NoWrap,
    Pre,
    PreLine,
    PreWrap,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextDrawParams {
    pub text: String,
    pub font_family: Vec<String>,
    pub font_size: f64,
    pub font_style: FontStyleDrawParam,
    pub font_weight: Option<FontWeightDrawParam>,
    pub letter_spacing: f64,
    pub line_height: f64,
    pub align: TextAlign,
    pub text_decoration: TextDecorationDrawParam,
    pub text_overflow: TextOverflowDrawParam,
    pub text_transform: TextTransformDrawParam,
    pub white_space: WhiteSpaceDrawParam,
    pub color: String,
    pub blur_radius: f64,
    pub padding: EdgeInsetsDrawParam,
    pub role: String,
    pub rotation_degrees: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct EdgeInsetsDrawParam {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BorderDrawParams {
    pub color: Option<String>,
    pub width: f64,
}

impl Default for BorderDrawParams {
    fn default() -> Self {
        Self {
            color: None,
            width: 0.0,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PanelDrawParams {
    pub role: String,
    pub corner_radius: f64,
    pub fill_color: String,
    pub border: BorderDrawParams,
    pub padding: EdgeInsetsDrawParam,
    pub intent: Option<RendererIntent>,
    pub rotation_degrees: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShadowDrawStyle {
    Outer,
    Inset,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DrawTransitionProperty {
    All,
    BackgroundColor,
    BorderColor,
    BoxShadow,
    Color,
    Filter,
    Opacity,
    Transform,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DrawTransitionEasing {
    Ease,
    EaseIn,
    EaseInOut,
    EaseOut,
    Linear,
    /// CSS `cubic-bezier(x1, y1, x2, y2)` control points.
    CubicBezier([f64; 4]),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DrawTransition {
    pub property: DrawTransitionProperty,
    pub duration_ms: f64,
    /// CSS `transition-delay`: milliseconds before the transition begins.
    /// Negative values start the transition mid-way (clamp to 0 for the
    /// duration check).
    pub delay_ms: f64,
    pub easing: DrawTransitionEasing,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ShadowDrawParams {
    pub role: String,
    pub source_bounds: LogicalRect,
    pub offset_x: f64,
    pub offset_y: f64,
    pub blur_radius: f64,
    pub spread_radius: f64,
    pub corner_radius: f64,
    pub color: String,
    pub style: ShadowDrawStyle,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GradientDrawKind {
    Linear,
    Radial,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GradientDrawRadialShape {
    Circle,
    Ellipse,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GradientDrawParams {
    pub role: String,
    pub kind: GradientDrawKind,
    pub start_color: String,
    pub end_color: String,
    pub angle_degrees: f64,
    pub center_x: f64,
    pub center_y: f64,
    pub radius: f64,
    pub radial_shape: GradientDrawRadialShape,
    pub start_offset: f64,
    pub end_offset: f64,
    /// The first and last segments extend the edge stop colors outside the
    /// authored stop interval, matching CSS color-stop fixup behavior.
    pub fill_before_start: bool,
    pub fill_after_end: bool,
    pub corner_radius: f64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RendererIntent {
    pub event: String,
    pub choice_id: Option<String>,
    pub element_id: Option<String>,
    pub action: Option<String>,
    pub metadata: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiControlOptionDrawParam {
    pub label: String,
    pub intent: RendererIntent,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UiControlPartsDrawParam {
    Range {
        progress_command_id: String,
        thumb_command_id: String,
        thumb_halo_command_id: Option<String>,
        value_command_id: String,
    },
    Select {
        chevron_command_id: String,
        value_command_id: String,
    },
    Switch {
        track_command_id: String,
        thumb_command_id: String,
        value_command_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiControlDrawParam {
    pub options: Vec<UiControlOptionDrawParam>,
    pub parts: UiControlPartsDrawParam,
    pub selected_index: usize,
}

impl UiControlDrawParam {
    pub fn selected_option(&self) -> Option<&UiControlOptionDrawParam> {
        self.options.get(self.selected_index)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct UiButtonDrawParams {
    pub label: String,
    pub enabled: bool,
    pub role: String,
    pub background_color: String,
    pub text_color: String,
    pub corner_radius: f64,
    pub border: BorderDrawParams,
    pub font_family: Vec<String>,
    pub font_size: f64,
    pub font_style: FontStyleDrawParam,
    pub font_weight: Option<FontWeightDrawParam>,
    pub letter_spacing: f64,
    pub line_height: f64,
    pub align: TextAlign,
    pub text_decoration: TextDecorationDrawParam,
    pub text_overflow: TextOverflowDrawParam,
    pub text_transform: TextTransformDrawParam,
    pub white_space: WhiteSpaceDrawParam,
    pub padding: EdgeInsetsDrawParam,
    pub intent: Option<RendererIntent>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UiSurfaceDrawParams {
    pub element_id: String,
    pub surface_key: Option<String>,
    pub render_mode: String,
    pub overlay_stack: String,
    pub interactive: bool,
    pub intent: Option<RendererIntent>,
}

/// Parameters for a CSS `backdrop-filter: blur(r)` pass.  The draw command
/// covers the region to blur; `blur_radius` is in logical pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BackdropBlurDrawParams {
    pub blur_radius: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub enum DrawCommandParams {
    Image(ImageDrawParams),
    Video(VideoDrawParams),
    Character(CharacterDrawParams),
    Text(TextDrawParams),
    Panel(PanelDrawParams),
    Shadow(ShadowDrawParams),
    Gradient(GradientDrawParams),
    UiButton(UiButtonDrawParams),
    UiSurface(UiSurfaceDrawParams),
    BackdropBlur(BackdropBlurDrawParams),
    #[default]
    None,
}
