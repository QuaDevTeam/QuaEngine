const MAX_NATIVE_TEXT_PAYLOAD_BYTES: usize = 64 * 1024;

pub(super) fn invalid_native_json_text_payload_reason(
    text: &str,
    noun: &str,
) -> Option<(String, String)> {
    if text.len() > MAX_NATIVE_TEXT_PAYLOAD_BYTES {
        return invalid_native_json_text_payload_bytes_reason(text.len(), noun);
    }
    if text.chars().any(is_unsupported_control_character) {
        return Some((
            text.to_string(),
            format!("{noun} must not contain unsupported control characters"),
        ));
    }
    None
}

pub(super) fn invalid_native_json_text_payload_bytes_reason(
    bytes: usize,
    noun: &str,
) -> Option<(String, String)> {
    if bytes > MAX_NATIVE_TEXT_PAYLOAD_BYTES {
        return Some((
            bytes.to_string(),
            format!("{noun} must stay within native renderer text payload limits"),
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
    fn text_payload_accepts_plain_multiline_text_at_native_limits() {
        assert_eq!(
            invalid_native_json_text_payload_reason(
                "Line one\nLine two\tTabbed\rReturn",
                "UI surface text"
            ),
            None
        );
        assert_eq!(
            invalid_native_json_text_payload_reason(
                &"a".repeat(MAX_NATIVE_TEXT_PAYLOAD_BYTES),
                "UI surface text"
            ),
            None
        );
        assert_eq!(
            invalid_native_json_text_payload_bytes_reason(
                MAX_NATIVE_TEXT_PAYLOAD_BYTES,
                "dialogue text"
            ),
            None
        );
    }

    #[test]
    fn text_payload_rejects_oversized_payloads_and_unsupported_control_characters() {
        let oversized = invalid_native_json_text_payload_reason(
            &"a".repeat(MAX_NATIVE_TEXT_PAYLOAD_BYTES + 1),
            "UI surface text",
        )
        .unwrap();
        assert_eq!(oversized.0, (MAX_NATIVE_TEXT_PAYLOAD_BYTES + 1).to_string());
        assert!(oversized.1.contains("text payload limits"));

        let aggregate =
            invalid_native_json_text_payload_bytes_reason(64 * 1024 + 1, "dialogue text").unwrap();
        assert_eq!(aggregate.0, (MAX_NATIVE_TEXT_PAYLOAD_BYTES + 1).to_string());
        assert!(aggregate.1.contains("text payload limits"));

        let control =
            invalid_native_json_text_payload_reason("Open\u{1b}Menu", "UI surface text").unwrap();
        assert_eq!(control.0, "Open\u{1b}Menu");
        assert!(control.1.contains("control characters"));
    }
}
