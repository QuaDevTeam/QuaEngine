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
    pub padding: EdgeInsetsDrawParam,
    pub role: String,
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
    pub shadow_blur_radius: f64,
    pub fill_color: String,
    pub border: BorderDrawParams,
    pub padding: EdgeInsetsDrawParam,
    pub intent: Option<RendererIntent>,
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

#[derive(Clone, Debug, Default, PartialEq)]
pub enum DrawCommandParams {
    Image(ImageDrawParams),
    Video(VideoDrawParams),
    Character(CharacterDrawParams),
    Text(TextDrawParams),
    Panel(PanelDrawParams),
    UiButton(UiButtonDrawParams),
    UiSurface(UiSurfaceDrawParams),
    #[default]
    None,
}
