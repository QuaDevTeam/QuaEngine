pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn text_character_width_factor(
    character: char,
) -> f32 {
    if is_zero_width_text_character(character) {
        return 0.0;
    }

    let code_point = character as u32;
    if matches!(
        code_point,
        0x1100..=0x115F
            | 0x2329..=0x232A
            | 0x2E80..=0xA4CF
            | 0xAC00..=0xD7A3
            | 0xF900..=0xFAFF
            | 0xFE10..=0xFE19
            | 0xFE30..=0xFE6F
            | 0xFF00..=0xFF60
            | 0xFFE0..=0xFFE6
            | 0x1F300..=0x1FAFF
    ) {
        2.0
    } else {
        1.0
    }
}

pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn is_zero_width_text_character(
    character: char,
) -> bool {
    let code_point = character as u32;
    matches!(
        code_point,
        0x0300..=0x036F
            | 0x1AB0..=0x1AFF
            | 0x1DC0..=0x1DFF
            | 0x200C..=0x200D
            | 0x20D0..=0x20FF
            | 0xFE00..=0xFE0F
            | 0xFE20..=0xFE2F
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn treats_combining_marks_and_joiners_as_zero_width() {
        for character in ['\u{0301}', '\u{200d}', '\u{fe0f}'] {
            assert!(is_zero_width_text_character(character));
            assert_eq!(text_character_width_factor(character), 0.0);
        }
    }

    #[test]
    fn keeps_regular_ascii_and_fullwidth_characters_visible() {
        assert!(!is_zero_width_text_character('A'));
        assert_eq!(text_character_width_factor('A'), 1.0);
        assert_eq!(text_character_width_factor('画'), 2.0);
    }
}
