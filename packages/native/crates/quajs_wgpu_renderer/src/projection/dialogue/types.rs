use crate::projection::common::{FontFamilyProjection, FontWeightProjection, PackageProvenance};

use serde::{Deserialize, Serialize};

use crate::projection::defaults::{default_one_f32, default_true, is_one_f32};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DialogueMode {
    Say,
    Narration,
}

impl Default for DialogueMode {
    fn default() -> Self {
        Self::Say
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(untagged)]
pub enum RichTextContent {
    Plain(String),
    Document(RichTextDocumentProjection),
}

impl From<&str> for RichTextContent {
    fn from(value: &str) -> Self {
        RichTextContent::Plain(value.to_string())
    }
}

impl From<String> for RichTextContent {
    fn from(value: String) -> Self {
        RichTextContent::Plain(value)
    }
}

/// Native numbers are logical lengths; strings preserve CSS unit semantics.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(untagged)]
pub enum RichTextMetric {
    Logical(f64),
    Css(String),
}
impl From<f64> for RichTextMetric {
    fn from(value: f64) -> Self {
        Self::Logical(value)
    }
}
impl From<&str> for RichTextMetric {
    fn from(value: &str) -> Self {
        Self::Css(value.into())
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<FontFamilyProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<RichTextMetric>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeightProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<RichTextMetric>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextDocumentProjection {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocks: Vec<RichTextBlockProjection>,
    #[serde(default)]
    pub style: RichTextStyle,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextBlockProjection {
    #[serde(default)]
    pub style: RichTextStyle,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spans: Vec<RichTextSpanProjection>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextSpanProjection {
    pub text: String,
    #[serde(default)]
    pub style: RichTextStyle,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueTypewriterSoundProjection {
    pub asset_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub every_characters: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gain_db: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playback_rate: Option<f64>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueTypewriterProjection {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub characters_per_second: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync_with_voice: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reveal_on_advance: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound: Option<DialogueTypewriterSoundProjection>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueAvatarProjection {
    #[serde(default = "default_dialogue_avatar_asset_type")]
    pub asset_type: String,
    pub asset_name: String,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueProjection {
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub character_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub character_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<DialogueAvatarProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<RichTextContent>,
    #[serde(default)]
    pub speaker_style: RichTextStyle,
    pub text: RichTextContent,
    /// Full text retained only in renderer-local reveal frames for stable layout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_text: Option<RichTextContent>,
    #[serde(default)]
    pub mode: DialogueMode,
    /// Renderer-local enter/exit presence opacity (0.0 = transparent, 1.0 =
    /// fully visible). Injected by `NativeRendererProjectionRuntime`; absent
    /// from engine-authored projections so the default of 1.0 is correct.
    #[serde(default = "default_one_f32", skip_serializing_if = "is_one_f32")]
    pub presence_opacity: f32,
    /// Monotonically-increasing revision counter from the engine.  Used by the
    /// typewriter runtime to detect when dialogue text has changed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision: Option<u64>,
    /// Typewriter reveal configuration emitted by the engine.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub typewriter: Option<DialogueTypewriterProjection>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl DialogueProjection {
    pub fn say(text: impl Into<RichTextContent>) -> Self {
        Self {
            visible: true,
            character_id: None,
            character_name: None,
            avatar: None,
            speaker: None,
            speaker_style: RichTextStyle::default(),
            text: text.into(),
            layout_text: None,
            mode: DialogueMode::Say,
            presence_opacity: 1.0,
            revision: None,
            typewriter: None,
            provenance: PackageProvenance::default(),
        }
    }
}

fn default_dialogue_avatar_asset_type() -> String {
    "images".to_string()
}
