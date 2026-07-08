use crate::fonts::{
    native_text_atlas_cell_x, native_text_atlas_cell_y, native_text_atlas_char_index,
    native_text_atlas_dimensions, NATIVE_TEXT_ATLAS_CHARS, NATIVE_TEXT_ATLAS_GLYPH_HEIGHT,
    NATIVE_TEXT_ATLAS_GLYPH_WIDTH, NATIVE_TEXT_ATLAS_PADDING, NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX,
};

pub(crate) const BITMAP_GLYPH_WIDTH: usize = NATIVE_TEXT_ATLAS_GLYPH_WIDTH;
pub(crate) const BITMAP_GLYPH_HEIGHT: usize = NATIVE_TEXT_ATLAS_GLYPH_HEIGHT;
pub(crate) const BUILTIN_TEXT_ATLAS_RESOURCE_ID: &str = "glyph-atlas:builtin-bitmap-ascii";

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct BitmapAtlasUvBounds {
    pub top_left: [f32; 2],
    pub bottom_right: [f32; 2],
}

pub(crate) fn builtin_text_atlas_dimensions() -> (u32, u32) {
    native_text_atlas_dimensions()
}

#[cfg(feature = "real-wgpu")]
pub(crate) fn builtin_text_atlas_rgba8() -> Vec<u8> {
    let (width, height) = builtin_text_atlas_dimensions();
    let mut rgba = vec![0; width as usize * height as usize * 4];
    for (index, character) in NATIVE_TEXT_ATLAS_CHARS.iter().copied().enumerate() {
        let Some(rows) = bitmap_glyph_rows(character) else {
            continue;
        };
        write_atlas_cell(&mut rgba, width as usize, index, rows);
    }
    write_solid_mask_cell(&mut rgba, width as usize);
    rgba
}

pub(super) fn bitmap_glyph_uv_bounds(character: char) -> Option<BitmapAtlasUvBounds> {
    let index = native_text_atlas_char_index(character)
        .or_else(|| native_text_atlas_char_index(character.to_ascii_uppercase()))?;
    Some(atlas_uv_bounds(index))
}

pub(super) fn bitmap_solid_uv_bounds() -> BitmapAtlasUvBounds {
    atlas_uv_bounds(NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX)
}

#[cfg(feature = "real-wgpu")]
fn write_atlas_cell(
    rgba: &mut [u8],
    atlas_width: usize,
    index: usize,
    rows: [u8; BITMAP_GLYPH_HEIGHT],
) {
    let x = native_text_atlas_cell_x(index) + NATIVE_TEXT_ATLAS_PADDING;
    let y = native_text_atlas_cell_y(index) + NATIVE_TEXT_ATLAS_PADDING;
    for (row_index, row) in rows.into_iter().enumerate() {
        for column_index in 0..BITMAP_GLYPH_WIDTH {
            let mask = 1 << (BITMAP_GLYPH_WIDTH - 1 - column_index);
            if row & mask == 0 {
                continue;
            }
            write_atlas_pixel(
                rgba,
                atlas_width,
                x + column_index,
                y + row_index,
                [0xff, 0xff, 0xff, 0xff],
            );
        }
    }
}

#[cfg(feature = "real-wgpu")]
fn write_solid_mask_cell(rgba: &mut [u8], atlas_width: usize) {
    let x =
        native_text_atlas_cell_x(NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX) + NATIVE_TEXT_ATLAS_PADDING;
    let y =
        native_text_atlas_cell_y(NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX) + NATIVE_TEXT_ATLAS_PADDING;
    for row_index in 0..BITMAP_GLYPH_HEIGHT {
        for column_index in 0..BITMAP_GLYPH_WIDTH {
            write_atlas_pixel(
                rgba,
                atlas_width,
                x + column_index,
                y + row_index,
                [0xff, 0xff, 0xff, 0xff],
            );
        }
    }
}

#[cfg(feature = "real-wgpu")]
fn write_atlas_pixel(rgba: &mut [u8], atlas_width: usize, x: usize, y: usize, value: [u8; 4]) {
    let offset = (y * atlas_width + x) * 4;
    rgba[offset..offset + 4].copy_from_slice(&value);
}

fn atlas_uv_bounds(index: usize) -> BitmapAtlasUvBounds {
    let (atlas_width, atlas_height) = builtin_text_atlas_dimensions();
    let x = native_text_atlas_cell_x(index) + NATIVE_TEXT_ATLAS_PADDING;
    let y = native_text_atlas_cell_y(index) + NATIVE_TEXT_ATLAS_PADDING;
    BitmapAtlasUvBounds {
        top_left: [
            x as f32 / atlas_width as f32,
            y as f32 / atlas_height as f32,
        ],
        bottom_right: [
            (x + BITMAP_GLYPH_WIDTH) as f32 / atlas_width as f32,
            (y + BITMAP_GLYPH_HEIGHT) as f32 / atlas_height as f32,
        ],
    }
}

pub(super) fn bitmap_glyph_rows(character: char) -> Option<[u8; BITMAP_GLYPH_HEIGHT]> {
    let atlas_character = if character.is_ascii_lowercase() {
        character
    } else {
        character.to_ascii_uppercase()
    };
    match atlas_character {
        'A' => Some([
            0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ]),
        'B' => Some([
            0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110,
        ]),
        'C' => Some([
            0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110,
        ]),
        'D' => Some([
            0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110,
        ]),
        'E' => Some([
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111,
        ]),
        'F' => Some([
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000,
        ]),
        'G' => Some([
            0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110,
        ]),
        'H' => Some([
            0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ]),
        'I' => Some([
            0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111,
        ]),
        'J' => Some([
            0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100,
        ]),
        'K' => Some([
            0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001,
        ]),
        'L' => Some([
            0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111,
        ]),
        'M' => Some([
            0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001,
        ]),
        'N' => Some([
            0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001,
        ]),
        'O' => Some([
            0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ]),
        'P' => Some([
            0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000,
        ]),
        'Q' => Some([
            0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101,
        ]),
        'R' => Some([
            0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001,
        ]),
        'S' => Some([
            0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110,
        ]),
        'T' => Some([
            0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100,
        ]),
        'U' => Some([
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ]),
        'V' => Some([
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100,
        ]),
        'W' => Some([
            0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010,
        ]),
        'X' => Some([
            0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001,
        ]),
        'Y' => Some([
            0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100,
        ]),
        'Z' => Some([
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111,
        ]),
        '0' => Some([
            0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110,
        ]),
        '1' => Some([
            0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ]),
        '2' => Some([
            0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111,
        ]),
        '3' => Some([
            0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110,
        ]),
        '4' => Some([
            0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010,
        ]),
        '5' => Some([
            0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110,
        ]),
        '6' => Some([
            0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110,
        ]),
        '7' => Some([
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000,
        ]),
        '8' => Some([
            0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110,
        ]),
        '9' => Some([
            0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110,
        ]),
        '.' => Some([
            0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100,
        ]),
        ',' => Some([
            0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b01000,
        ]),
        ':' => Some([
            0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b00000,
        ]),
        ';' => Some([
            0b00000, 0b01100, 0b01100, 0b00000, 0b00100, 0b00100, 0b01000,
        ]),
        '!' => Some([
            0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100,
        ]),
        '?' => Some([
            0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100,
        ]),
        '-' => Some([
            0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000,
        ]),
        '_' => Some([
            0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111,
        ]),
        '+' => Some([
            0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000,
        ]),
        '=' => Some([
            0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000,
        ]),
        '/' => Some([
            0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000,
        ]),
        '\\' => Some([
            0b10000, 0b01000, 0b01000, 0b00100, 0b00010, 0b00010, 0b00001,
        ]),
        '(' => Some([
            0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010,
        ]),
        ')' => Some([
            0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000,
        ]),
        '[' => Some([
            0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110,
        ]),
        ']' => Some([
            0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110,
        ]),
        '\'' => Some([
            0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '"' => Some([
            0b01010, 0b01010, 0b01010, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '#' => Some([
            0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010,
        ]),
        '$' => Some([
            0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100,
        ]),
        '%' => Some([
            0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011,
        ]),
        '&' => Some([
            0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101,
        ]),
        '@' => Some([
            0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110,
        ]),
        '*' => Some([
            0b00000, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0b00000,
        ]),
        '^' => Some([
            0b00100, 0b01010, 0b10001, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '`' => Some([
            0b01000, 0b00100, 0b00010, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '{' => Some([
            0b00010, 0b00100, 0b00100, 0b01000, 0b00100, 0b00100, 0b00010,
        ]),
        '|' => Some([
            0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100,
        ]),
        '}' => Some([
            0b01000, 0b00100, 0b00100, 0b00010, 0b00100, 0b00100, 0b01000,
        ]),
        '~' => Some([
            0b00000, 0b00000, 0b01001, 0b10110, 0b00000, 0b00000, 0b00000,
        ]),
        '<' => Some([
            0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010,
        ]),
        '>' => Some([
            0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000,
        ]),
        'a' => Some([
            0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111,
        ]),
        'b' => Some([
            0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b11110,
        ]),
        'c' => Some([
            0b00000, 0b00000, 0b01110, 0b10000, 0b10000, 0b10001, 0b01110,
        ]),
        'd' => Some([
            0b00001, 0b00001, 0b01101, 0b10011, 0b10001, 0b10001, 0b01111,
        ]),
        'e' => Some([
            0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110,
        ]),
        'f' => Some([
            0b00110, 0b01001, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000,
        ]),
        'g' => Some([
            0b00000, 0b00000, 0b01111, 0b10001, 0b01111, 0b00001, 0b01110,
        ]),
        'h' => Some([
            0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001,
        ]),
        'i' => Some([
            0b00100, 0b00000, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110,
        ]),
        'j' => Some([
            0b00010, 0b00000, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100,
        ]),
        'k' => Some([
            0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010,
        ]),
        'l' => Some([
            0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ]),
        'm' => Some([
            0b00000, 0b00000, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101,
        ]),
        'n' => Some([
            0b00000, 0b00000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001,
        ]),
        'o' => Some([
            0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110,
        ]),
        'p' => Some([
            0b00000, 0b00000, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000,
        ]),
        'q' => Some([
            0b00000, 0b00000, 0b01111, 0b10001, 0b01111, 0b00001, 0b00001,
        ]),
        'r' => Some([
            0b00000, 0b00000, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000,
        ]),
        's' => Some([
            0b00000, 0b00000, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110,
        ]),
        't' => Some([
            0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110,
        ]),
        'u' => Some([
            0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101,
        ]),
        'v' => Some([
            0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100,
        ]),
        'w' => Some([
            0b00000, 0b00000, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010,
        ]),
        'x' => Some([
            0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001,
        ]),
        'y' => Some([
            0b00000, 0b00000, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110,
        ]),
        'z' => Some([
            0b00000, 0b00000, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111,
        ]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_text_atlas_dimensions_follow_shared_contract() {
        assert_eq!(
            builtin_text_atlas_dimensions(),
            crate::fonts::native_text_atlas_dimensions()
        );
    }

    #[test]
    fn lowercase_ascii_uses_dedicated_atlas_slots() {
        let upper = bitmap_glyph_uv_bounds('A').unwrap();
        let lower = bitmap_glyph_uv_bounds('a').unwrap();

        assert_ne!(upper, lower);
        assert_ne!(bitmap_glyph_rows('A'), bitmap_glyph_rows('a'));
    }
}
