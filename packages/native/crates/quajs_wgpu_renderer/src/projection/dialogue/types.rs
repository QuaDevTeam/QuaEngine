use crate::projection::common::PackageProvenance;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DialogueMode {
    Say,
    Narration,
}

#[derive(Clone, Debug, PartialEq)]
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

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RichTextStyle {
    pub font_size: Option<f64>,
    pub line_height: Option<f64>,
    pub text_align: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RichTextDocumentProjection {
    pub blocks: Vec<RichTextBlockProjection>,
    pub style: RichTextStyle,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RichTextBlockProjection {
    pub spans: Vec<RichTextSpanProjection>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RichTextSpanProjection {
    pub text: String,
    pub style: RichTextStyle,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DialogueAvatarProjection {
    pub asset_type: String,
    pub asset_name: String,
    pub provenance: PackageProvenance,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DialogueProjection {
    pub visible: bool,
    pub character_id: Option<String>,
    pub character_name: Option<String>,
    pub avatar: Option<DialogueAvatarProjection>,
    pub speaker: Option<RichTextContent>,
    pub speaker_style: RichTextStyle,
    pub text: RichTextContent,
    pub mode: DialogueMode,
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
