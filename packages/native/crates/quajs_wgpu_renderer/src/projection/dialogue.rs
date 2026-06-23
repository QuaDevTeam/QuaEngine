pub mod builder;
pub mod layout;
pub mod rich_text;
pub mod types;

pub use builder::{append_dialogue_commands, build_dialogue_commands};
pub use rich_text::rich_text_to_plain_text;
pub use types::{
    DialogueAvatarProjection, DialogueMode, DialogueProjection, RichTextBlockProjection,
    RichTextContent, RichTextDocumentProjection, RichTextSpanProjection, RichTextStyle,
};

#[cfg(test)]
mod tests;
