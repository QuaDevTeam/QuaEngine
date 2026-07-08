pub const NATIVE_TEXT_ATLAS_COLUMNS: usize = 128;
pub const NATIVE_TEXT_ATLAS_PADDING: usize = 1;
pub const NATIVE_TEXT_ATLAS_GLYPH_WIDTH: usize = 5;
pub const NATIVE_TEXT_ATLAS_GLYPH_HEIGHT: usize = 7;
pub const NATIVE_TEXT_ATLAS_CELL_WIDTH: usize =
    NATIVE_TEXT_ATLAS_GLYPH_WIDTH + NATIVE_TEXT_ATLAS_PADDING * 2;
pub const NATIVE_TEXT_ATLAS_CELL_HEIGHT: usize =
    NATIVE_TEXT_ATLAS_GLYPH_HEIGHT + NATIVE_TEXT_ATLAS_PADDING * 2;
pub const NATIVE_TEXT_ATLAS_CHARS: &[char] = &[
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
    'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',',
    ':', ';', '!', '?', '-', '_', '+', '=', '/', '\\', '(', ')', '[', ']', '\'', '"', '#', '$',
    '%', '&', '@', '*', '^', '`', '{', '|', '}', '~', '<', '>', 'a', 'b', 'c', 'd', 'e', 'f', 'g',
    'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeTextAtlasCharRange {
    pub start: u32,
    pub end: u32,
}

impl NativeTextAtlasCharRange {
    pub const fn len(self) -> usize {
        self.end.saturating_sub(self.start).saturating_add(1) as usize
    }

    pub const fn contains(self, codepoint: u32) -> bool {
        codepoint >= self.start && codepoint <= self.end
    }
}

pub const NATIVE_TEXT_ATLAS_EXTENDED_RANGES: &[NativeTextAtlasCharRange] = &[
    // CJK punctuation and Japanese syllabaries.
    NativeTextAtlasCharRange {
        start: 0x3000,
        end: 0x303f,
    },
    NativeTextAtlasCharRange {
        start: 0x3040,
        end: 0x309f,
    },
    NativeTextAtlasCharRange {
        start: 0x30a0,
        end: 0x30ff,
    },
    // Hangul jamo, compatibility jamo, and precomposed syllables.
    NativeTextAtlasCharRange {
        start: 0x1100,
        end: 0x11ff,
    },
    NativeTextAtlasCharRange {
        start: 0x3130,
        end: 0x318f,
    },
    NativeTextAtlasCharRange {
        start: 0xac00,
        end: 0xd7af,
    },
    // Common Chinese/Japanese/Korean ideograph blocks.
    NativeTextAtlasCharRange {
        start: 0x3400,
        end: 0x4dbf,
    },
    NativeTextAtlasCharRange {
        start: 0x4e00,
        end: 0x9fff,
    },
    // Fullwidth ASCII and punctuation forms used by CJK UI text.
    NativeTextAtlasCharRange {
        start: 0xff00,
        end: 0xffef,
    },
];

pub const fn native_text_atlas_extended_char_count() -> usize {
    let mut index = 0;
    let mut count = 0;
    while index < NATIVE_TEXT_ATLAS_EXTENDED_RANGES.len() {
        count += NATIVE_TEXT_ATLAS_EXTENDED_RANGES[index].len();
        index += 1;
    }
    count
}

pub const NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX: usize =
    NATIVE_TEXT_ATLAS_CHARS.len() + native_text_atlas_extended_char_count();

pub fn native_text_atlas_dimensions() -> (u32, u32) {
    let cell_count = NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX + 1;
    let rows = cell_count.div_ceil(NATIVE_TEXT_ATLAS_COLUMNS);
    (
        (NATIVE_TEXT_ATLAS_COLUMNS * NATIVE_TEXT_ATLAS_CELL_WIDTH) as u32,
        (rows * NATIVE_TEXT_ATLAS_CELL_HEIGHT) as u32,
    )
}

pub fn native_text_atlas_char_index(character: char) -> Option<usize> {
    if let Some(index) = NATIVE_TEXT_ATLAS_CHARS
        .iter()
        .position(|candidate| *candidate == character)
    {
        return Some(index);
    }

    let codepoint = character as u32;
    let mut atlas_index = NATIVE_TEXT_ATLAS_CHARS.len();
    for range in NATIVE_TEXT_ATLAS_EXTENDED_RANGES {
        if range.contains(codepoint) {
            return Some(atlas_index + codepoint.saturating_sub(range.start) as usize);
        }
        atlas_index += range.len();
    }

    None
}

pub fn native_text_atlas_char_at(index: usize) -> Option<char> {
    if index < NATIVE_TEXT_ATLAS_CHARS.len() {
        return NATIVE_TEXT_ATLAS_CHARS.get(index).copied();
    }

    let mut relative_index = index.saturating_sub(NATIVE_TEXT_ATLAS_CHARS.len());
    for range in NATIVE_TEXT_ATLAS_EXTENDED_RANGES {
        let range_len = range.len();
        if relative_index < range_len {
            return char::from_u32(range.start + relative_index as u32);
        }
        relative_index = relative_index.saturating_sub(range_len);
    }

    None
}

pub fn native_text_atlas_cell_x(index: usize) -> usize {
    (index % NATIVE_TEXT_ATLAS_COLUMNS) * NATIVE_TEXT_ATLAS_CELL_WIDTH
}

pub fn native_text_atlas_cell_y(index: usize) -> usize {
    (index / NATIVE_TEXT_ATLAS_COLUMNS) * NATIVE_TEXT_ATLAS_CELL_HEIGHT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_cjk_and_fullwidth_characters_to_dedicated_slots() {
        for character in ['界', '語', 'あ', '한', 'Ａ', '。'] {
            let index = native_text_atlas_char_index(character).unwrap();
            assert_ne!(index, NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX);
            assert_eq!(native_text_atlas_char_at(index), Some(character));
        }
    }

    #[test]
    fn keeps_solid_mask_after_all_supported_character_slots() {
        assert!(NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX > NATIVE_TEXT_ATLAS_CHARS.len());
        assert_eq!(
            native_text_atlas_char_at(NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX),
            None
        );
    }
}
