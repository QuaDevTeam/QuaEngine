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
}

#[derive(Clone, Debug, PartialEq)]
pub struct VideoDrawParams {
    pub asset_type: String,
    pub asset_name: String,
    pub poster_asset_name: Option<String>,
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

#[derive(Clone, Debug, PartialEq)]
pub struct TextDrawParams {
    pub text: String,
    pub font_size: f64,
    pub font_weight: Option<FontWeightDrawParam>,
    pub line_height: f64,
    pub align: TextAlign,
    pub color: String,
    pub role: String,
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
    pub intent: Option<RendererIntent>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RendererIntent {
    pub event: String,
    pub choice_id: Option<String>,
    pub element_id: Option<String>,
    pub action: Option<String>,
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
    pub font_weight: Option<FontWeightDrawParam>,
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
