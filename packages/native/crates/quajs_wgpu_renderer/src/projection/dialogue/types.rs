use crate::projection::common::{FontFamilyProjection, FontWeightProjection, PackageProvenance};

use serde::{Deserialize, Serialize};

use crate::projection::defaults::default_true;

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

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<FontFamilyProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeightProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
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
    #[serde(default)]
    pub mode: DialogueMode,
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
            mode: DialogueMode::Say,
            provenance: PackageProvenance::default(),
        }
    }
}

fn default_dialogue_avatar_asset_type() -> String {
    "images".to_string()
}
