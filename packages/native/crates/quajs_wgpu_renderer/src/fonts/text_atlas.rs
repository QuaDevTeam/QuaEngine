pub const NATIVE_TEXT_ATLAS_COLUMNS: usize = 16;
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
pub const NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX: usize = NATIVE_TEXT_ATLAS_CHARS.len();

pub fn native_text_atlas_dimensions() -> (u32, u32) {
    let cell_count = NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX + 1;
    let rows = cell_count.div_ceil(NATIVE_TEXT_ATLAS_COLUMNS);
    (
        (NATIVE_TEXT_ATLAS_COLUMNS * NATIVE_TEXT_ATLAS_CELL_WIDTH) as u32,
        (rows * NATIVE_TEXT_ATLAS_CELL_HEIGHT) as u32,
    )
}

pub fn native_text_atlas_char_index(character: char) -> Option<usize> {
    NATIVE_TEXT_ATLAS_CHARS
        .iter()
        .position(|candidate| *candidate == character)
}

pub fn native_text_atlas_cell_x(index: usize) -> usize {
    (index % NATIVE_TEXT_ATLAS_COLUMNS) * NATIVE_TEXT_ATLAS_CELL_WIDTH
}

pub fn native_text_atlas_cell_y(index: usize) -> usize {
    (index / NATIVE_TEXT_ATLAS_COLUMNS) * NATIVE_TEXT_ATLAS_CELL_HEIGHT
}
