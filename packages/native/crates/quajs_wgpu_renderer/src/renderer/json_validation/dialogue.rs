use crate::projection::dialogue::{
    DialogueAvatarProjection, DialogueProjection, RichTextContent, RichTextStyle,
};
use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::text_payload::invalid_native_json_text_payload_bytes_reason;
use super::JsonProjectionValidator;

impl JsonProjectionValidator {
    pub(super) fn validate_dialogue(&mut self, dialogue: &DialogueProjection) {
        if let Some(avatar) = &dialogue.avatar {
            self.validate_dialogue_avatar(avatar);
        }
        self.validate_rich_text_style("view.dialogue.speakerStyle", &dialogue.speaker_style);
        if let Some(speaker) = &dialogue.speaker {
            self.validate_rich_text_content("view.dialogue.speaker", speaker);
        }
        self.validate_rich_text_content("view.dialogue.text", &dialogue.text);
        self.validate_provenance("view.dialogue.provenance", &dialogue.provenance);
    }

    fn validate_dialogue_avatar(&mut self, avatar: &DialogueAvatarProjection) {
        self.validate_asset_type("view.dialogue.avatar.assetType", &avatar.asset_type);
        self.validate_asset_reference("view.dialogue.avatar.assetName", &avatar.asset_name);
        self.validate_provenance("view.dialogue.avatar.provenance", &avatar.provenance);
    }

    fn validate_rich_text_content(&mut self, path: &str, content: &RichTextContent) {
        match content {
            RichTextContent::Plain(text) => {
                self.validate_text_payload(path, text, "dialogue text");
            }
            RichTextContent::Document(document) => {
                self.validate_rich_text_style(&format!("{path}.style"), &document.style);
                let mut total_bytes = 0usize;
                for (block_index, block) in document.blocks.iter().enumerate() {
                    if block_index > 0 {
                        total_bytes = total_bytes.saturating_add(1);
                    }
                    for (span_index, span) in block.spans.iter().enumerate() {
                        let span_path = format!("{path}.blocks[{block_index}].spans[{span_index}]");
                        self.validate_text_payload(
                            &format!("{span_path}.text"),
                            &span.text,
                            "dialogue rich text spans",
                        );
                        total_bytes = total_bytes.saturating_add(span.text.len());
                        self.validate_rich_text_style(&format!("{span_path}.style"), &span.style);
                    }
                }
                self.validate_text_payload_bytes(path, total_bytes, "dialogue rich text payload");
            }
        }
    }

    fn validate_text_payload_bytes(&mut self, path: &str, bytes: usize, noun: &str) {
        if let Some((value, reason)) = invalid_native_json_text_payload_bytes_reason(bytes, noun) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_rich_text_style(&mut self, path: &str, style: &RichTextStyle) {
        if let Some(color) = &style.color {
            self.validate_color_literal(&format!("{path}.color"), color);
        }
        if let Some(font_family) = &style.font_family {
            self.validate_font_family(&format!("{path}.fontFamily"), font_family);
        }
        self.validate_rich_text_style_numbers(path, style);
    }
}
