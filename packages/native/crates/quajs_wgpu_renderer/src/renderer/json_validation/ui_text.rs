const MAX_NATIVE_UI_TEXT_BYTES: usize = 64 * 1024;

pub(super) fn invalid_native_json_ui_text_reason(text: &str) -> Option<(String, String)> {
    if text.len() > MAX_NATIVE_UI_TEXT_BYTES {
        return Some((
            text.len().to_string(),
            "UI surface text must stay within native renderer payload limits".to_string(),
        ));
    }
    if text.chars().any(is_unsupported_control_character) {
        return Some((
            text.to_string(),
            "UI surface text must not contain unsupported control characters".to_string(),
        ));
    }
    None
}

fn is_unsupported_control_character(character: char) -> bool {
    character.is_control() && !matches!(character, '\n' | '\r' | '\t')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ui_text_accepts_plain_multiline_text_at_native_limits() {
        assert_eq!(
            invalid_native_json_ui_text_reason("Line one\nLine two\tTabbed\rReturn"),
            None
        );
        assert_eq!(
            invalid_native_json_ui_text_reason(&"a".repeat(MAX_NATIVE_UI_TEXT_BYTES)),
            None
        );
    }

    #[test]
    fn ui_text_rejects_oversized_payloads_and_unsupported_control_characters() {
        let oversized =
            invalid_native_json_ui_text_reason(&"a".repeat(MAX_NATIVE_UI_TEXT_BYTES + 1)).unwrap();
        assert_eq!(oversized.0, (MAX_NATIVE_UI_TEXT_BYTES + 1).to_string());
        assert!(oversized.1.contains("payload limits"));

        let control = invalid_native_json_ui_text_reason("Open\u{1b}Menu").unwrap();
        assert_eq!(control.0, "Open\u{1b}Menu");
        assert!(control.1.contains("control characters"));
    }
}
